import { createInterface } from 'readline';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { c, printError, printSuccess, printWarning, printHeader, Spinner } from '../render';

// ─── Helpers ────────────────────────────────────────────────────────────────

function findProjectRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
        const pkgPath = join(dir, 'package.json');
        if (existsSync(pkgPath)) {
            try {
                const pkg = readFileSync(pkgPath, 'utf-8');
                if (pkg.includes('"corvid-agent"')) return dir;
            } catch { /* skip */ }
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return process.cwd();
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
    const suffix = defaultValue ? ` ${c.gray(`[${defaultValue}]`)}` : '';
    return new Promise((resolve) => {
        rl.question(`  ${question}${suffix}: `, (answer) => {
            resolve(answer.trim() || defaultValue || '');
        });
    });
}

async function confirm(rl: ReturnType<typeof createInterface>, question: string, defaultYes = true): Promise<boolean> {
    const hint = defaultYes ? 'Y/n' : 'y/N';
    return new Promise((resolve) => {
        rl.question(`  ${question} ${c.gray(`[${hint}]`)}: `, (answer) => {
            const a = answer.trim().toLowerCase();
            if (!a) return resolve(defaultYes);
            resolve(a === 'y' || a === 'yes');
        });
    });
}

// ─── Prerequisite Checks ────────────────────────────────────────────────────

interface CheckResult {
    name: string;
    found: boolean;
    version?: string;
    required: boolean;
}

async function checkPrerequisites(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // Bun
    try {
        const proc = Bun.spawn(['bun', '--version'], { stdout: 'pipe', stderr: 'pipe' });
        const version = (await new Response(proc.stdout).text()).trim();
        results.push({ name: 'Bun', found: true, version, required: true });
    } catch {
        results.push({ name: 'Bun', found: false, required: true });
    }

    // Git
    try {
        const proc = Bun.spawn(['git', '--version'], { stdout: 'pipe', stderr: 'pipe' });
        const out = (await new Response(proc.stdout).text()).trim();
        const version = out.replace('git version ', '');
        results.push({ name: 'Git', found: true, version, required: true });
    } catch {
        results.push({ name: 'Git', found: false, required: true });
    }

    // Ollama
    try {
        const proc = Bun.spawn(['ollama', '--version'], { stdout: 'pipe', stderr: 'pipe' });
        const out = (await new Response(proc.stdout).text()).trim();
        results.push({ name: 'Ollama', found: true, version: out.split(' ').pop(), required: false });
    } catch {
        results.push({ name: 'Ollama', found: false, required: false });
    }

    // Claude Code CLI
    try {
        const proc = Bun.spawn(['claude', '--version'], { stdout: 'pipe', stderr: 'pipe' });
        const version = (await new Response(proc.stdout).text()).trim();
        results.push({ name: 'Claude CLI', found: true, version, required: false });
    } catch {
        results.push({ name: 'Claude CLI', found: false, required: false });
    }

    // Docker (for localnet)
    try {
        const proc = Bun.spawn(['docker', '--version'], { stdout: 'pipe', stderr: 'pipe' });
        const out = (await new Response(proc.stdout).text()).trim();
        const version = out.match(/Docker version ([\d.]+)/)?.[1];
        results.push({ name: 'Docker', found: true, version, required: false });
    } catch {
        results.push({ name: 'Docker', found: false, required: false });
    }

    return results;
}

// ─── Init Command ───────────────────────────────────────────────────────────

export async function initCommand(): Promise<void> {
    const projectRoot = findProjectRoot();

    console.log(`
${c.bold}corvid-agent init${c.reset}
${c.gray('Interactive setup — creates .env, installs deps, and gets you running.')}
`);

    // ── Step 1: Prerequisites ──
    printHeader('1/5  Checking prerequisites');

    const checks = await checkPrerequisites();
    let hasMissing = false;
    for (const check of checks) {
        if (check.found) {
            const ver = check.version ? c.gray(` (${check.version})`) : '';
            console.log(`  ${c.green('✓')} ${check.name}${ver}`);
        } else if (check.required) {
            console.log(`  ${c.red('✗')} ${check.name} — ${c.red('required')}`);
            hasMissing = true;
        } else {
            console.log(`  ${c.yellow('○')} ${check.name} — ${c.gray('optional')}`);
        }
    }

    if (hasMissing) {
        printError('Missing required prerequisites. Install them and re-run `corvid-agent init`.');
        process.exit(1);
    }

    const hasOllama = checks.find(c => c.name === 'Ollama')?.found ?? false;
    const hasClaude = checks.find(c => c.name === 'Claude CLI')?.found ?? false;

    // ── Step 2: Environment Configuration ──
    printHeader('2/5  Configuring environment');

    const envPath = join(projectRoot, '.env');
    const envExamplePath = join(projectRoot, '.env.example');

    const rl = createInterface({ input: process.stdin, output: process.stdout });

    try {
        if (existsSync(envPath)) {
            const overwrite = await confirm(rl, '.env already exists. Overwrite?', false);
            if (!overwrite) {
                printSuccess('.env unchanged');
                await runRemainingSteps(rl, projectRoot);
                return;
            }
        }

        if (!existsSync(envExamplePath)) {
            printWarning('.env.example not found. Creating minimal .env');
        }

        // Build .env contents
        const envLines: string[] = [
            '# Generated by corvid-agent init',
            `# ${new Date().toISOString()}`,
            '',
        ];

        // AI provider
        console.log(`\n  ${c.bold}AI Provider${c.reset}`);
        if (hasClaude) {
            console.log(`  ${c.green('✓')} Claude CLI detected — will use your subscription automatically.`);
        }

        const anthropicKey = await prompt(rl, 'Anthropic API key (optional, press Enter to skip)');
        if (anthropicKey) {
            envLines.push(`ANTHROPIC_API_KEY=${anthropicKey}`);
        }

        if (hasOllama) {
            const ollamaHost = await prompt(rl, 'Ollama host', 'http://localhost:11434');
            envLines.push(`OLLAMA_HOST=${ollamaHost}`);

            if (!anthropicKey && !hasClaude) {
                envLines.push('ENABLED_PROVIDERS=ollama');
                printSuccess('Running in 100% local mode with Ollama.');
            }
        } else if (!anthropicKey && !hasClaude) {
            printWarning('No AI provider configured. Run `bun run try` for a demo without AI.');
        }

        // Server
        console.log(`\n  ${c.bold}Server${c.reset}`);
        const port = await prompt(rl, 'Port', '3000');
        if (port !== '3000') {
            envLines.push(`PORT=${port}`);
        }
        envLines.push('BIND_HOST=127.0.0.1');

        // GitHub
        console.log(`\n  ${c.bold}GitHub Integration${c.reset} ${c.gray('(for work tasks, PRs, webhooks)')}`);
        const ghToken = await prompt(rl, 'GitHub token (optional, press Enter to skip)');
        if (ghToken) {
            envLines.push(`GH_TOKEN=${ghToken}`);
        }

        // Network
        console.log(`\n  ${c.bold}Algorand Network${c.reset}`);
        const network = await prompt(rl, 'Network (localnet/testnet/mainnet)', 'localnet');
        envLines.push(`ALGORAND_NETWORK=${network}`);

        // Write .env
        envLines.push('');
        writeFileSync(envPath, envLines.join('\n'), { mode: 0o600 });
        printSuccess('.env created');

        await runRemainingSteps(rl, projectRoot);
    } finally {
        rl.close();
    }
}

async function runRemainingSteps(rl: ReturnType<typeof createInterface>, projectRoot: string): Promise<void> {
    // ── Step 3: Install Dependencies ──
    printHeader('3/5  Installing dependencies');

    const spinner = new Spinner('Running bun install...');
    spinner.start();
    try {
        const proc = Bun.spawn(['bun', 'install'], {
            cwd: projectRoot,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const exitCode = await proc.exited;
        spinner.stop();
        if (exitCode === 0) {
            printSuccess('Dependencies installed');
        } else {
            const stderr = await new Response(proc.stderr).text();
            printWarning(`bun install exited with ${exitCode}: ${stderr.slice(0, 200)}`);
        }
    } catch (err) {
        spinner.stop();
        printWarning(`Could not run bun install: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── Step 4: Build Dashboard ──
    printHeader('4/5  Building dashboard');

    const clientDist = join(projectRoot, 'client', 'dist', 'client', 'browser', 'index.html');
    if (existsSync(clientDist)) {
        printSuccess('Dashboard already built');
    } else {
        const buildSpin = new Spinner('Building Angular dashboard...');
        buildSpin.start();
        try {
            const proc = Bun.spawn(['bun', 'run', 'build:client'], {
                cwd: projectRoot,
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const exitCode = await proc.exited;
            buildSpin.stop();
            if (exitCode === 0) {
                printSuccess('Dashboard built');
            } else {
                printWarning('Dashboard build failed. Run `bun run build:client` manually.');
            }
        } catch {
            buildSpin.stop();
            printWarning('Could not build dashboard. Run `bun run build:client` manually.');
        }
    }

    // ── Step 5: Create Default Agent ──
    printHeader('5/5  Creating default agent');

    const skipAgent = await confirm(rl, 'Create a default agent now?', true);
    if (skipAgent) {
        const agentName = await prompt(rl, 'Agent name', 'Assistant');

        // Check if server is running, start it temporarily if not
        let serverStarted = false;
        let serverProc: ReturnType<typeof Bun.spawn> | null = null;

        try {
            const healthRes = await fetch(`http://127.0.0.1:${process.env.PORT ?? '3000'}/api/health`, {
                signal: AbortSignal.timeout(2_000),
            });
            if (!healthRes.ok) throw new Error('not ok');
        } catch {
            // Server not running — start it temporarily
            printWarning('Server not running. Starting temporarily to create agent...');
            serverProc = Bun.spawn(['bun', 'server/index.ts'], {
                cwd: projectRoot,
                stdout: 'pipe',
                stderr: 'pipe',
                env: { ...process.env },
            });
            serverStarted = true;

            // Wait for server
            const maxWait = Date.now() + 15_000;
            while (Date.now() < maxWait) {
                try {
                    const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? '3000'}/api/health`, {
                        signal: AbortSignal.timeout(2_000),
                    });
                    if (res.ok) break;
                } catch { /* not ready */ }
                await Bun.sleep(500);
            }
        }

        try {
            const port = process.env.PORT ?? '3000';
            const res = await fetch(`http://127.0.0.1:${port}/api/agents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: agentName,
                    description: `Created by corvid-agent init`,
                    model: 'claude-sonnet-4-20250514',
                }),
            });
            if (res.ok) {
                const agent = (await res.json()) as { id: string; name: string };
                printSuccess(`Agent "${agent.name}" created (${agent.id.slice(0, 8)}...)`);
                console.log(`  ${c.gray('Set as default:')} corvid-agent config set defaultAgent ${agent.id}`);
            } else {
                const body = await res.text();
                printWarning(`Could not create agent: ${body.slice(0, 200)}`);
            }
        } catch (err) {
            printWarning(`Could not create agent: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Stop temporary server
        if (serverStarted && serverProc) {
            serverProc.kill();
        }
    }

    // ── Done ──
    console.log(`
${c.bold}${c.green('Setup complete!')}${c.reset}

${c.bold}Next steps:${c.reset}
  ${c.cyan('bun run dev')}          Start the development server
  ${c.cyan('bun run try')}          Try sandbox mode (no config needed)
  ${c.cyan('corvid-agent')}         Launch the interactive CLI
  ${c.cyan('corvid-agent demo')}    Run a self-contained demo

${c.gray('Docs: docs/quickstart.md  •  Dashboard: http://127.0.0.1:3000')}
`);
}
