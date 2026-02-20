import { CorvidClient } from '../client';
import { loadConfig } from '../config';
import { pickAgent, fetchAgent } from './pick-agent';
import type { Project } from '../../shared/types';
import type { ServerMessage } from '../../shared/ws-protocol';
import { c, printError, renderStreamChunk, renderToolUse, renderThinking, renderAgentPrefix, renderAgentSuffix, Spinner } from '../render';
import { createInterface, type Interface as ReadlineInterface } from 'readline';

const VERSION = '0.9.0';
const MAX_HISTORY_CHARS = 12_000; // Trim oldest turns when history exceeds this

interface InteractiveOptions {
    agent?: string;
}

export interface Turn {
    role: 'user' | 'assistant';
    content: string;
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
        // Fall back to server default
    }
    return undefined;
}

/**
 * Build a prompt that includes conversation history so one-shot providers
 * (Ollama direct mode) maintain context across turns.
 */
export function buildPromptWithHistory(history: Turn[], currentMessage: string): string {
    if (history.length === 0) return currentMessage;

    // Trim oldest turns if history is too long
    let chars = 0;
    let startIdx = history.length;
    for (let i = history.length - 1; i >= 0; i--) {
        chars += history[i].content.length;
        if (chars > MAX_HISTORY_CHARS) break;
        startIdx = i;
    }
    const trimmed = history.slice(startIdx);

    const lines: string[] = ['<conversation_history>'];
    for (const turn of trimmed) {
        const label = turn.role === 'user' ? 'User' : 'Assistant';
        lines.push(`${label}: ${turn.content}`);
    }
    lines.push('</conversation_history>', '', currentMessage);
    return lines.join('\n');
}

export async function interactiveCommand(options?: InteractiveOptions): Promise<void> {
    const config = loadConfig();
    const client = new CorvidClient(config);

    // 1. Verify server health
    const spinner = new Spinner('Connecting to server...');
    spinner.start();
    try {
        await client.get<{ status: string }>('/api/health');
    } catch (err) {
        spinner.stop();
        const message = err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : String(err);
        printError(`Cannot reach server at ${config.serverUrl}: ${message}`);
        process.exit(1);
    }
    spinner.stop();

    // 2. Resolve agent
    let agentId: string;
    if (options?.agent) {
        agentId = options.agent;
    } else {
        agentId = await pickAgent(client, config);
    }

    // 3. Resolve project from config or cwd
    const projectId = config.defaultProject ?? await resolveProjectFromCwd(client);

    // 4. Fetch agent details for banner
    const agent = await fetchAgent(client, agentId);
    const agentLabel = agent
        ? `${agent.name} ${c.gray(`(${agent.model})`)}`
        : agentId.slice(0, 8);

    // 5. Show banner
    console.log(`\n${c.bold}corvid${c.reset} v${VERSION} — agent: ${agentLabel}`);
    if (projectId) {
        try {
            const proj = await client.get<Project>(`/api/projects/${projectId}`);
            console.log(c.gray(`project: ${proj.name} (${proj.workingDir})`));
        } catch { /* ignore */ }
    }
    console.log(c.gray('Type /help for commands, /quit to exit\n'));

    // 6. Open WebSocket + conversation state
    const history: Turn[] = [];
    let responding = false;
    let hasStreamContent = false;
    let responseBuffer = '';
    let onResponseDone: (() => void) | null = null;
    let headerPrinted = false;

    const completeTurn = () => {
        if (!responding) return;
        if (headerPrinted) {
            renderAgentSuffix();
            headerPrinted = false;
        }
        // Save the assistant response to history
        if (responseBuffer.trim()) {
            history.push({ role: 'assistant', content: responseBuffer.trim() });
        }
        responding = false;
        hasStreamContent = false;
        responseBuffer = '';
        onResponseDone?.();
        onResponseDone = null;
    };

    const ensureHeader = (): void => {
        if (!responding) return;
        if (!headerPrinted) {
            renderAgentPrefix();
            headerPrinted = true;
        }
    };

    const onChunk = (chunk: string): boolean => {
        if (!responding) return false;
        // Deduplicate: if this exact chunk matches content already accumulated,
        // the server sent the same response multiple times
        if (responseBuffer.length > 0 && chunk === responseBuffer) return false;
        ensureHeader();
        hasStreamContent = true;
        responseBuffer += chunk;
        return true;
    };

    const ws = client.connectWebSocket((msg: ServerMessage) => {
        handleMessage(msg, agentId, () => hasStreamContent, completeTurn, onChunk, ensureHeader);
    }, () => {
        if (responding) {
            console.log();
            printError('WebSocket connection closed unexpectedly');
            process.exit(1);
        }
    });

    await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (e) => reject(new Error(`WebSocket error: ${e}`));
    });

    // 7. REPL loop
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const promptUser = (): void => {
        rl.question(`${c.green('You')} ${c.cyan('>')} `, async (input) => {
            const line = input.trim();
            if (!line) {
                promptUser();
                return;
            }

            // Slash commands
            if (line.startsWith('/')) {
                await handleSlashCommand(line, rl, client, history, (newId) => { agentId = newId; });
                promptUser();
                return;
            }

            // Shell escape
            if (line.startsWith('!')) {
                await runShellCommand(line.slice(1).trim());
                promptUser();
                return;
            }

            // Build prompt with conversation history for context continuity
            const prompt = buildPromptWithHistory(history, line);
            history.push({ role: 'user', content: line });

            // Send chat message
            responding = true;
            hasStreamContent = false;
            responseBuffer = '';
            client.sendWs(ws, {
                type: 'chat_send',
                agentId,
                content: prompt,
                projectId: projectId ?? undefined,
            });

            // Wait for response to complete
            await new Promise<void>((resolve) => {
                onResponseDone = resolve;
            });

            console.log(); // Blank line after response
            promptUser();
        });
    };

    rl.on('close', () => {
        console.log(c.gray('\nGoodbye!'));
        ws.close();
        process.exit(0);
    });

    promptUser();
}

export function handleMessage(
    msg: ServerMessage,
    agentId: string,
    getHasStreamContent: () => boolean,
    onDone: () => void,
    onChunk: (chunk: string) => boolean,
    ensureHeader: () => void,
): void {
    switch (msg.type) {
        case 'chat_stream':
            if (msg.agentId === agentId) {
                if (msg.done) {
                    if (getHasStreamContent()) {
                        onDone();
                    }
                } else if (msg.chunk) {
                    if (onChunk(msg.chunk)) {
                        renderStreamChunk(msg.chunk);
                    }
                }
            }
            break;

        case 'algochat_message':
            if (msg.direction === 'outbound') {
                if (!getHasStreamContent() && msg.content) {
                    if (onChunk(msg.content)) {
                        renderStreamChunk(msg.content);
                    }
                }
                onDone();
            }
            break;

        case 'chat_tool_use':
            if (msg.agentId === agentId) {
                ensureHeader();
                renderToolUse(msg.toolName, msg.input);
            }
            break;

        case 'chat_thinking':
            if (msg.agentId === agentId) {
                ensureHeader();
                renderThinking(msg.active);
            }
            break;

        case 'chat_session':
            // Suppress — session IDs are noise in interactive mode
            break;

        case 'error':
            printError(msg.message);
            onDone();
            break;
    }
}

async function handleSlashCommand(
    line: string,
    rl: ReadlineInterface,
    client: CorvidClient,
    history: Turn[],
    setAgentId: (id: string) => void,
): Promise<void> {
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
        case '/quit':
        case '/exit':
            console.log(c.gray('Goodbye!'));
            rl.close();
            process.exit(0);
            break;

        case '/agent': {
            const { updateConfig } = await import('../config');
            updateConfig({ defaultAgent: null });
            const reloaded = loadConfig();
            const newId = await pickAgent(client, reloaded);
            setAgentId(newId);
            // Clear conversation history when switching agents
            history.length = 0;
            const agent = await fetchAgent(client, newId);
            if (agent) {
                console.log(`Switched to: ${c.bold}${agent.name}${c.reset} ${c.gray(`(${agent.model})`)}`);
            }
            break;
        }

        case '/clear':
            history.length = 0;
            console.log(c.gray('Conversation history cleared.'));
            break;

        case '/status': {
            const spinner = new Spinner('Checking...');
            spinner.start();
            try {
                const health = await client.get<{ status: string; uptime: number; activeSessions: number }>('/api/health');
                spinner.stop();
                const uptime = formatUptime(health.uptime);
                console.log(`  Status: ${c.green(health.status)}  Uptime: ${uptime}  Sessions: ${health.activeSessions}`);
            } catch (err) {
                spinner.stop();
                const message = err && typeof err === 'object' && 'message' in err
                    ? String((err as { message: string }).message)
                    : String(err);
                printError(message);
            }
            break;
        }

        case '/help':
            console.log(`
${c.bold}Commands:${c.reset}
  ${c.cyan('/help')}     Show this help
  ${c.cyan('/agent')}    Switch to a different agent
  ${c.cyan('/clear')}    Clear conversation history
  ${c.cyan('/status')}   Show server status
  ${c.cyan('/quit')}     Exit the REPL

${c.bold}Shell:${c.reset}
  ${c.cyan('!<cmd>')}    Run a shell command (e.g. ${c.gray('!ls -la')})
`);
            break;

        default:
            printError(`Unknown command: ${cmd}. Type /help for available commands.`);
    }
}

async function runShellCommand(cmd: string): Promise<void> {
    if (!cmd) {
        printError('Usage: !<command>');
        return;
    }
    try {
        const proc = Bun.spawn(['sh', '-c', cmd], {
            stdout: 'inherit',
            stderr: 'inherit',
            stdin: 'inherit',
        });
        await proc.exited;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        printError(`Shell error: ${message}`);
    }
}

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}
