import { CorvidClient } from '../client';
import { loadConfig } from '../config';
import { pickAgent } from './pick-agent';
import type { Project } from '../../shared/types';
import type { ServerMessage } from '../../shared/ws-protocol';
import { printError, renderStreamChunk, renderToolUse, renderThinking, flushStreamBuffer, Spinner } from '../render';

interface ChatOptions {
    agent?: string;
    project?: string;
    model?: string;
}

export async function chatCommand(prompt: string, options: ChatOptions): Promise<void> {
    const config = loadConfig();
    const client = new CorvidClient(config);

    // Resolve project: flag → config default → auto-detect from cwd
    const projectId = options.project ?? config.defaultProject ?? await resolveProjectFromCwd(client);

    // Resolve agent: flag → config default → interactive picker
    const agentId = options.agent ?? await pickAgent(client, config);

    const spinner = new Spinner('Connecting...');
    spinner.start();

    let done = false;
    let hasStreamContent = false;

    const markDone = () => {
        if (done) return;
        flushStreamBuffer();
        done = true;
    };

    const ws = client.connectWebSocket((msg: ServerMessage) => {
        handleMessage(msg, agentId, spinner, hasStreamContent, markDone, () => { hasStreamContent = true; });
    }, () => {
        if (!done) {
            spinner.stop();
            printError('WebSocket connection closed unexpectedly');
            process.exit(1);
        }
    });

    // Wait for WS to open
    await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (e) => reject(new Error(`WebSocket error: ${e}`));
    });

    spinner.stop();

    // Send the chat message
    client.sendWs(ws, {
        type: 'chat_send',
        agentId,
        content: prompt,
        projectId: projectId ?? undefined,
    });

    // Wait for completion
    await new Promise<void>((resolve) => {
        const check = setInterval(() => {
            if (done) {
                clearInterval(check);
                ws.close();
                resolve();
            }
        }, 100);
    });

    console.log(); // Final newline
}

function handleMessage(
    msg: ServerMessage,
    agentId: string,
    spinner: Spinner,
    hasStreamContent: boolean,
    onDone: () => void,
    onContent: () => void,
): void {
    switch (msg.type) {
        case 'chat_stream':
            if (msg.agentId === agentId) {
                spinner.stop();
                if (msg.done) {
                    // If we already have streamed content, we're done.
                    // If not, wait for algochat_message which carries the full response
                    // for non-streaming providers (e.g. Ollama).
                    if (hasStreamContent) {
                        onDone();
                    }
                } else if (msg.chunk) {
                    onContent();
                    renderStreamChunk(msg.chunk);
                }
            }
            break;

        case 'algochat_message':
            // Non-streaming providers send the full response as algochat_message.
            // For streaming providers, content was already displayed via chat_stream.
            if (msg.direction === 'outbound') {
                spinner.stop();
                if (!hasStreamContent && msg.content) {
                    renderStreamChunk(msg.content);
                }
                onDone();
            }
            break;

        case 'chat_tool_use':
            if (msg.agentId === agentId) {
                spinner.stop();
                renderToolUse(msg.toolName, msg.input);
            }
            break;

        case 'chat_thinking':
            if (msg.agentId === agentId) {
                renderThinking(msg.active);
            }
            break;

        case 'chat_session':
            // Suppress — session IDs are noise for one-shot chat
            if (msg.agentId === agentId) {
                spinner.stop();
            }
            break;

        case 'error':
            spinner.stop();
            printError(msg.message);
            onDone();
            break;
    }
}

async function resolveProjectFromCwd(client: CorvidClient): Promise<string | undefined> {
    try {
        const projects = await client.get<Project[]>('/api/projects');
        const cwd = process.cwd();
        const exact = projects.find(p => p.workingDir === cwd);
        if (exact) return exact.id;
        const prefix = projects.find(p => cwd.startsWith(p.workingDir + '/'));
        if (prefix) return prefix.id;
    } catch {
        // Silently ignore — fall back to server default
    }
    return undefined;
}
