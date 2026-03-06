import { spawn, type Subprocess } from 'bun';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { c, printError, Spinner, renderStreamChunk, renderAgentPrefix, renderAgentSuffix, flushStreamBuffer, resetStreamState, renderToolUse, renderThinking } from '../render';
import type { ServerMessage } from '../../shared/ws-protocol';

// ─── Project Root ───────────────────────────────────────────────────────────

function findProjectRoot(): string {
    let dir = import.meta.dir;
    for (let i = 0; i < 5; i++) {
        dir = dirname(dir);
        if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'server', 'index.ts'))) {
            return dir;
        }
    }
    return process.cwd();
}

// ─── Health Polling ─────────────────────────────────────────────────────────

async function waitForServer(baseUrl: string, maxWaitMs = 30_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2_000) });
            if (res.ok) return true;
        } catch { /* not ready */ }
        await Bun.sleep(500);
    }
    return false;
}

// ─── Seed Demo Agent ────────────────────────────────────────────────────────

interface DemoData {
    agentId: string;
    sessionId: string;
    projectId: string;
}

async function seedDemo(baseUrl: string, projectRoot: string): Promise<DemoData> {
    const projectRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'Demo Project',
            description: 'Self-contained corvid-agent demo',
            workingDir: projectRoot,
        }),
    });
    if (!projectRes.ok) throw new Error(`Project creation failed: ${await projectRes.text()}`);
    const project = (await projectRes.json()) as { id: string };

    const agentRes = await fetch(`${baseUrl}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'Demo Agent',
            description: 'A demo agent that introduces corvid-agent capabilities',
            systemPrompt: `You are running inside corvid-agent, an AI agent orchestration platform. You are in demo mode — introduce yourself briefly and show what you can do.

Demonstrate these capabilities concisely (1-2 lines each):
1. You can analyze code — show by examining a file in the current project
2. You can search the web — mention this but don't actually search
3. You can run tools — explain you have access to shell, file operations, and git
4. You can be scheduled — explain cron-based task scheduling

Keep your response under 15 lines. Be friendly and enthusiastic but concise.
End by suggesting what the user can try next (e.g., ask you to review a file, explain the architecture, or check for bugs).`,
            model: 'claude-sonnet-4-20250514',
        }),
    });
    if (!agentRes.ok) throw new Error(`Agent creation failed: ${await agentRes.text()}`);
    const agent = (await agentRes.json()) as { id: string };

    const sessionRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId: project.id,
            agentId: agent.id,
            name: 'Demo Session',
            source: 'cli',
        }),
    });
    if (!sessionRes.ok) throw new Error(`Session creation failed: ${await sessionRes.text()}`);
    const session = (await sessionRes.json()) as { id: string };

    return { agentId: agent.id, sessionId: session.id, projectId: project.id };
}

// ─── Demo Command ───────────────────────────────────────────────────────────

export async function demoCommand(): Promise<void> {
    const projectRoot = findProjectRoot();
    const PORT = process.env.PORT ?? '3001'; // Use 3001 to avoid conflicting with running server
    const HOST = '127.0.0.1';
    const BASE_URL = `http://${HOST}:${PORT}`;

    console.log(`
${c.bold}corvid-agent demo${c.reset}
${c.gray('Self-contained demo — starts a temporary server, creates an agent, and chats.')}
${c.gray('Everything is cleaned up when the demo exits.')}
`);

    // Check if a server is already running on the default port
    let useExistingServer = false;
    let serverUrl = BASE_URL;

    try {
        const res = await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(2_000) });
        if (res.ok) {
            console.log(`  ${c.green('✓')} Server already running on port 3000. Using it.`);
            useExistingServer = true;
            serverUrl = 'http://127.0.0.1:3000';
        }
    } catch { /* no server on 3000 */ }

    let serverProc: Subprocess | null = null;

    if (!useExistingServer) {
        // Start a temporary server with in-memory DB
        const spinner = new Spinner('Starting temporary server...');
        spinner.start();

        serverProc = spawn(['bun', 'server/index.ts'], {
            cwd: projectRoot,
            env: {
                ...process.env,
                TRY_MODE: 'true',
                PORT,
                BIND_HOST: HOST,
                LOG_LEVEL: 'warn',
                ALGOCHAT_MNEMONIC: '',
                SANDBOX_ENABLED: 'false',
                MULTI_TENANT: 'false',
            },
            stdout: 'pipe',
            stderr: 'pipe',
        });

        const cleanup = (): void => {
            if (serverProc) serverProc.kill();
        };
        process.on('SIGINT', () => { cleanup(); process.exit(0); });
        process.on('SIGTERM', cleanup);

        const ready = await waitForServer(serverUrl);
        spinner.stop();

        if (!ready) {
            printError('Server failed to start. Check logs with LOG_LEVEL=debug.');
            cleanup();
            process.exit(1);
        }
        console.log(`  ${c.green('✓')} Temporary server running on port ${PORT}`);
    }

    // Seed demo data
    const seedSpin = new Spinner('Creating demo agent...');
    seedSpin.start();

    let demo: DemoData;
    try {
        demo = await seedDemo(serverUrl, projectRoot);
        seedSpin.stop();
        console.log(`  ${c.green('✓')} Demo agent ready`);
    } catch (err) {
        seedSpin.stop();
        printError(`Failed to seed demo: ${err instanceof Error ? err.message : String(err)}`);
        if (serverProc) serverProc.kill();
        process.exit(1);
    }

    // Send a message and stream the response
    console.log(`\n  ${c.gray('Sending:')} ${c.cyan('"Introduce yourself and show what you can do."')}\n`);
    renderAgentPrefix();

    try {
        const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws';
        const ws = new WebSocket(wsUrl);

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { reject(new Error('Demo response timed out')); }, 120_000);

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    type: 'chat_send',
                    agentId: demo.agentId,
                    content: 'Introduce yourself and show what you can do.',
                    projectId: demo.projectId,
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(String(event.data)) as ServerMessage;

                    switch (msg.type) {
                        case 'chat_stream':
                            if (msg.agentId === demo.agentId) {
                                if (msg.done) {
                                    flushStreamBuffer();
                                    resetStreamState();
                                    renderAgentSuffix();
                                    clearTimeout(timeout);
                                    ws.close();
                                    resolve();
                                } else if (msg.chunk) {
                                    renderStreamChunk(msg.chunk);
                                }
                            }
                            break;
                        case 'chat_tool_use':
                            if (msg.agentId === demo.agentId) {
                                renderToolUse(msg.toolName, msg.input);
                            }
                            break;
                        case 'chat_thinking':
                            if (msg.agentId === demo.agentId) {
                                renderThinking(msg.active);
                            }
                            break;
                        case 'chat_session':
                            // Suppress session ID noise
                            break;
                        case 'error':
                            flushStreamBuffer();
                            resetStreamState();
                            renderAgentSuffix();
                            printError(msg.message);
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                            break;
                    }
                } catch { /* ignore non-JSON */ }
            };

            ws.onerror = (err) => {
                clearTimeout(timeout);
                reject(new Error(`WebSocket error: ${String(err)}`));
            };
        });
    } catch (err) {
        flushStreamBuffer();
        resetStreamState();
        renderAgentSuffix();
        if (err instanceof Error && err.message !== 'Demo response timed out') {
            printError(err.message);
        }
    }

    // Print next steps
    console.log(`
${c.bold}What's next?${c.reset}
  ${c.cyan('corvid-agent')}               Start an interactive session
  ${c.cyan('bun run dev')}                Start the development server
  ${c.cyan('bun run try')}                Open the dashboard in sandbox mode
  ${c.cyan('corvid-agent init')}          Set up .env and configure providers
  ${c.gray('Dashboard:')} ${serverUrl}
`);

    // Cleanup
    if (serverProc) {
        serverProc.kill();
    }
}
