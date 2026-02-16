import { CorvidClient } from '../client';
import { loadConfig } from '../config';
import type { ServerMessage } from '../../shared/ws-protocol';
import { c, printError, renderStreamChunk, renderToolUse, renderThinking, Spinner } from '../render';

interface ChatOptions {
    agent?: string;
    project?: string;
    model?: string;
}

export async function chatCommand(prompt: string, options: ChatOptions): Promise<void> {
    const config = loadConfig();
    const agentId = options.agent ?? config.defaultAgent;
    const projectId = options.project ?? config.defaultProject;

    if (!agentId) {
        printError('No agent specified. Use --agent <id> or set a default with: corvid-agent config set defaultAgent <id>');
        process.exit(1);
    }

    const client = new CorvidClient(config);
    const spinner = new Spinner('Connecting...');
    spinner.start();

    let done = false;

    const ws = client.connectWebSocket((msg: ServerMessage) => {
        handleMessage(msg, agentId, spinner, () => { done = true; });
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
    onDone: () => void,
): void {
    switch (msg.type) {
        case 'chat_stream':
            if (msg.agentId === agentId) {
                spinner.stop();
                if (msg.done) {
                    onDone();
                } else {
                    renderStreamChunk(msg.chunk);
                }
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
            if (msg.agentId === agentId) {
                spinner.stop();
                console.log(c.gray(`session: ${msg.sessionId}`));
            }
            break;

        case 'error':
            spinner.stop();
            printError(msg.message);
            onDone();
            break;
    }
}
