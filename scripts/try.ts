/**
 * Zero-config sandbox mode for corvid-agent.
 *
 * Usage: bun run try
 *
 * Starts corvid-agent with an in-memory database, seeds a demo agent and
 * session with welcome messages, and opens the dashboard in the browser.
 * No .env or API keys required — works out of the box.
 *
 * Part of #595 (onboarding epic), closes #596.
 */

import { spawn, type Subprocess } from 'bun';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = process.env.PORT ?? '3000';
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;

// ── Banner ──────────────────────────────────────────────────────────────────
function printBanner(): void {
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║            corvid-agent — try mode               ║
  ║                                                  ║
  ║  In-memory database (nothing is persisted)       ║
  ║  No API keys required                            ║
  ║  A demo agent is pre-created for you             ║
  ╚══════════════════════════════════════════════════╝
`);
}

// ── Health polling ──────────────────────────────────────────────────────────
async function waitForServer(maxWaitMs = 30_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2_000) });
            if (res.ok) return true;
        } catch {
            // Server not ready yet
        }
        await Bun.sleep(500);
    }
    return false;
}

// ── Demo data seeding ───────────────────────────────────────────────────────
async function seedDemoData(): Promise<{ agentId: string; sessionId: string; projectId: string }> {
    // Create a project
    const projectRes = await fetch(`${BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'Demo Project',
            description: 'A sample project to explore corvid-agent',
            workingDir: process.cwd(),
        }),
    });
    if (!projectRes.ok) throw new Error(`Failed to create project: ${await projectRes.text()}`);
    const project = (await projectRes.json()) as { id: string };

    // Create a demo agent
    const agentRes = await fetch(`${BASE_URL}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'Corvid',
            description: 'A friendly demo agent that shows what corvid-agent can do',
            systemPrompt: `You are Corvid, a helpful AI assistant running inside corvid-agent. You are friendly, concise, and technically capable. When users ask what you can do, explain that corvid-agent is an AI agent framework that can:
- Run AI sessions with Claude or local models via Ollama
- Review PRs and triage GitHub issues automatically
- Execute scheduled tasks (daily reviews, test runs)
- Communicate via AlgoChat on the Algorand blockchain
- Coordinate multiple agents via councils

You're currently running in try mode — an in-memory sandbox so users can explore the dashboard and chat with you without any configuration.`,
            model: 'claude-sonnet-4-20250514',
        }),
    });
    if (!agentRes.ok) throw new Error(`Failed to create agent: ${await agentRes.text()}`);
    const agent = (await agentRes.json()) as { id: string };

    // Create a session
    const sessionRes = await fetch(`${BASE_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId: project.id,
            agentId: agent.id,
            name: 'Welcome Session',
            source: 'web',
        }),
    });
    if (!sessionRes.ok) throw new Error(`Failed to create session: ${await sessionRes.text()}`);
    const session = (await sessionRes.json()) as { id: string };

    return { agentId: agent.id, sessionId: session.id, projectId: project.id };
}

// ── Browser opener ──────────────────────────────────────────────────────────
function openBrowser(url: string): void {
    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    try {
        spawn([cmd, url], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch {
        // Non-fatal — user can open manually
    }
}

// ── Check for built client ──────────────────────────────────────────────────
function checkClientBuild(): boolean {
    const clientDist = join(import.meta.dir, '..', 'client', 'dist', 'client', 'browser', 'index.html');
    return existsSync(clientDist);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    printBanner();

    // Check if client is built
    if (!checkClientBuild()) {
        console.log('  Dashboard not built yet. Building...');
        const buildResult = spawn(['bun', 'run', 'build:client'], {
            cwd: join(import.meta.dir, '..'),
            stdio: ['ignore', 'inherit', 'inherit'],
        });
        const exitCode = await buildResult.exited;
        if (exitCode !== 0) {
            console.log('  Warning: Dashboard build failed. The API will still work,');
            console.log('  but you won\'t see the web UI. Run `bun run build:client` to fix.\n');
        }
    }

    // Start the server with TRY_MODE
    console.log('  Starting server...');
    const serverProcess: Subprocess = spawn(['bun', 'server/index.ts'], {
        cwd: join(import.meta.dir, '..'),
        env: {
            ...process.env,
            TRY_MODE: 'true',
            PORT,
            BIND_HOST: HOST,
            LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
            // Disable services that require external config
            ALGOCHAT_MNEMONIC: '',
            SANDBOX_ENABLED: 'false',
            MULTI_TENANT: 'false',
        },
        stdio: ['ignore', 'inherit', 'inherit'],
    });

    // Handle cleanup
    const cleanup = (): void => {
        serverProcess.kill();
    };
    process.on('SIGINT', () => {
        console.log('\n  Shutting down try mode...');
        cleanup();
        process.exit(0);
    });
    process.on('SIGTERM', cleanup);

    // Wait for server to be ready
    console.log('  Waiting for server...');
    const ready = await waitForServer();
    if (!ready) {
        console.error('  Server failed to start within 30 seconds.');
        cleanup();
        process.exit(1);
    }

    // Seed demo data
    console.log('  Seeding demo data...');
    try {
        const { agentId, sessionId } = await seedDemoData();
        console.log(`  Demo agent created: ${agentId.slice(0, 8)}...`);
        console.log(`  Welcome session created: ${sessionId.slice(0, 8)}...`);
    } catch (err) {
        console.error(`  Warning: Failed to seed demo data: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log(`
  ────────────────────────────────────────────────────
  Dashboard:  ${BASE_URL}
  API docs:   ${BASE_URL}/api-docs
  Health:     ${BASE_URL}/api/health
  ────────────────────────────────────────────────────

  Press Ctrl+C to stop.
`);

    // Open browser
    openBrowser(BASE_URL);

    // Keep alive until interrupted
    await serverProcess.exited;
}

main().catch((err) => {
    console.error('Try mode failed:', err);
    process.exit(1);
});
