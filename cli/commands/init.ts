import { createInterface } from 'readline';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { c, printError, printSuccess, printWarning, printHeader, Spinner } from '../render';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InitOptions {
    mcp?: boolean;
    full?: boolean;
    yes?: boolean;
    simple?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findProjectRoot(): string | null {
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
    return null;
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

// ─── Skills Copy ─────────────────────────────────────────────────────────────

function findSkillsSource(): string | null {
    // From project root (dev mode)
    const projectRoot = findProjectRoot();
    if (projectRoot) {
        const devPath = join(projectRoot, 'skills');
        if (existsSync(devPath)) return devPath;
    }

    // From installed package (npx / npm)
    const pkgPath = join(dirname(dirname(__dirname)), 'skills');
    if (existsSync(pkgPath)) return pkgPath;

    return null;
}

function copySkillsToDir(source: string, targetDir: string): number {
    let count = 0;
    const entries = readdirSync(source, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const skillDir = join(source, entry.name);
            const skillFile = join(skillDir, 'SKILL.md');
            if (existsSync(skillFile)) {
                const destDir = join(targetDir, entry.name);
                mkdirSync(destDir, { recursive: true });
                copyFileSync(skillFile, join(destDir, 'SKILL.md'));
                count++;
            }
        }
    }
    return count;
}

export function copySkills(cwd: string): void {
    const source = findSkillsSource();
    if (!source) {
        printWarning('Skills directory not found — skipping skill installation.');
        return;
    }

    let installed = false;

    // Claude Code: .claude/skills/ in project dir
    const claudeSkillsDir = join(cwd, '.claude', 'skills');
    const count = copySkillsToDir(source, claudeSkillsDir);
    if (count > 0) {
        printSuccess(`${count} skills installed to ${claudeSkillsDir}`);
        installed = true;
    }

    // Cursor: .cursor/rules/ in project dir (if .cursor exists)
    const cursorDir = join(cwd, '.cursor');
    if (existsSync(cursorDir)) {
        const cursorRulesDir = join(cursorDir, 'rules');
        const cursorCount = copySkillsToDir(source, cursorRulesDir);
        if (cursorCount > 0) {
            printSuccess(`${cursorCount} skills installed to ${cursorRulesDir}`);
            installed = true;
        }
    }

    // VS Code Copilot: .github/skills/ in project dir (if .github exists)
    const githubDir = join(cwd, '.github');
    if (existsSync(githubDir)) {
        const githubSkillsDir = join(githubDir, 'skills');
        const ghCount = copySkillsToDir(source, githubSkillsDir);
        if (ghCount > 0) {
            printSuccess(`${ghCount} skills installed to ${githubSkillsDir}`);
            installed = true;
        }
    }

    if (!installed) {
        printWarning('No skills were installed.');
    }
}

// ─── Post-Init Health Summary ────────────────────────────────────────────────

interface HealthItem {
    label: string;
    ok: boolean;
    detail?: string;
}

async function printPostInitSummary(projectRoot: string): Promise<void> {
    const items: HealthItem[] = [];

    // Check .env exists
    const envPath = join(projectRoot, '.env');
    items.push({
        label: 'Environment config',
        ok: existsSync(envPath),
        detail: existsSync(envPath) ? '.env configured' : 'Run corvid-agent init to create .env',
    });

    // Check AI provider
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    let hasOllamaRunning = false;
    try {
        const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2_000) });
        hasOllamaRunning = res.ok;
    } catch { /* not running */ }
    let hasClaude = false;
    try {
        const proc = Bun.spawn(['claude', '--version'], { stdout: 'pipe', stderr: 'pipe' });
        await proc.exited;
        hasClaude = proc.exitCode === 0;
    } catch { /* not installed */ }

    const hasProvider = hasAnthropicKey || hasOllamaRunning || hasClaude;
    items.push({
        label: 'AI provider',
        ok: hasProvider,
        detail: hasProvider
            ? [hasAnthropicKey && 'Anthropic API', hasClaude && 'Claude CLI', hasOllamaRunning && 'Ollama'].filter(Boolean).join(', ')
            : 'No provider detected — see docs/quickstart.md',
    });

    // Check node_modules
    items.push({
        label: 'Dependencies',
        ok: existsSync(join(projectRoot, 'node_modules')),
        detail: existsSync(join(projectRoot, 'node_modules')) ? 'Installed' : 'Run bun install',
    });

    // Check GH_TOKEN
    const hasGhToken = !!(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
    items.push({
        label: 'GitHub token',
        ok: hasGhToken,
        detail: hasGhToken ? 'Configured' : 'Optional — needed for work tasks and PRs',
    });

    // Check Docker (for localnet)
    let hasDocker = false;
    try {
        const proc = Bun.spawn(['docker', 'info'], { stdout: 'pipe', stderr: 'pipe' });
        await proc.exited;
        hasDocker = proc.exitCode === 0;
    } catch { /* not running */ }
    items.push({
        label: 'Docker',
        ok: hasDocker,
        detail: hasDocker ? 'Running' : 'Optional — needed for AlgoChat localnet',
    });

    // Print summary
    printHeader('Setup Health Check');
    for (const item of items) {
        const icon = item.ok ? c.green('✓') : c.yellow('○');
        const detail = item.detail ? c.gray(` — ${item.detail}`) : '';
        console.log(`  ${icon} ${item.label}${detail}`);
    }

    const readyCount = items.filter(i => i.ok).length;
    const requiredReady = items.slice(0, 3).filter(i => i.ok).length; // env, provider, deps
    if (requiredReady === 3) {
        console.log(`\n  ${c.green('Ready to go!')} ${c.gray(`(${readyCount}/${items.length} checks passed)`)}`);
    } else {
        console.log(`\n  ${c.yellow('Almost there!')} ${c.gray(`(${readyCount}/${items.length} checks passed — fix the items above to get started)`)}`);
    }
}

// ─── MCP Config Writer ──────────────────────────────────────────────────────

function writeMcpConfig(filePath: string, mcpConfig: Record<string, unknown>): void {
    let existing: Record<string, unknown> = {};
    if (existsSync(filePath)) {
        try {
            existing = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
        } catch { /* will overwrite */ }
    }
    const servers = (existing.mcpServers ?? {}) as Record<string, unknown>;
    const merged = { ...existing, mcpServers: { ...servers, ...mcpConfig } };
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
    renameSync(tmpPath, filePath);
}

// ─── MCP-Only Init ──────────────────────────────────────────────────────────

async function initMcpOnly(_opts: { yes: boolean }): Promise<void> {
    console.log(`
${c.bold}corvid-agent init --mcp${c.reset}
${c.gray('Set up corvid-agent as an MCP server for Claude Code, Cursor, or other AI tools.')}
`);

    printHeader('MCP Server Setup');

    // Detect corvid-agent server
    const projectRoot = findProjectRoot();
    const serverUrl = process.env.CORVID_AGENT_URL ?? 'http://localhost:3000';
    const apiKey = process.env.CORVID_AGENT_API_KEY ?? '';

    if (projectRoot) {
        console.log(`  ${c.green('✓')} corvid-agent repo found at ${c.gray(projectRoot)}`);
    } else {
        console.log(`  ${c.yellow('○')} Not in corvid-agent repo — will connect to server at ${c.gray(serverUrl)}`);
    }

    // Determine Claude Code config path
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const claudeConfigDir = join(homeDir, '.claude');
    const claudeConfigPath = join(claudeConfigDir, 'claude_desktop_config.json');

    // Build MCP server config
    let mcpConfig: Record<string, unknown>;

    if (projectRoot) {
        // Local mode: run the built-in MCP stdio server directly
        mcpConfig = {
            'corvid-agent': {
                command: 'bun',
                args: [join(projectRoot, 'server', 'mcp', 'stdio-server.ts')],
                env: {
                    CORVID_API_URL: `http://127.0.0.1:${process.env.PORT ?? '3000'}`,
                },
            },
        };
    } else {
        // Remote mode: use the standalone MCP package
        mcpConfig = {
            'corvid-agent': {
                command: 'npx',
                args: ['-y', 'corvid-agent-mcp'],
                env: {
                    CORVID_AGENT_URL: serverUrl,
                    ...(apiKey ? { CORVID_AGENT_API_KEY: apiKey } : {}),
                },
            },
        };
    }

    // Write or merge into Claude Code config
    let existingConfig: Record<string, unknown> = {};
    if (existsSync(claudeConfigPath)) {
        try {
            existingConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8')) as Record<string, unknown>;
        } catch {
            printWarning('Could not parse existing Claude config — will create a new one.');
        }
    }

    const mcpServers = (existingConfig.mcpServers ?? {}) as Record<string, unknown>;
    const mergedConfig = {
        ...existingConfig,
        mcpServers: { ...mcpServers, ...mcpConfig },
    };

    if (!existsSync(claudeConfigDir)) {
        mkdirSync(claudeConfigDir, { recursive: true, mode: 0o700 });
    }

    const tmpPath = `${claudeConfigPath}.${process.pid}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(mergedConfig, null, 2) + '\n', { mode: 0o600 });
    renameSync(tmpPath, claudeConfigPath);
    printSuccess(`MCP server added to ${c.gray(claudeConfigPath)}`);

    // Also write Cursor config if ~/.cursor exists
    const cursorConfigDir = join(homeDir, '.cursor');
    if (existsSync(cursorConfigDir)) {
        const cursorMcpPath = join(cursorConfigDir, 'mcp.json');
        let cursorConfig: Record<string, unknown> = {};
        if (existsSync(cursorMcpPath)) {
            try {
                cursorConfig = JSON.parse(readFileSync(cursorMcpPath, 'utf-8')) as Record<string, unknown>;
            } catch { /* will overwrite */ }
        }
        const cursorServers = (cursorConfig.mcpServers ?? {}) as Record<string, unknown>;
        const mergedCursorConfig = {
            ...cursorConfig,
            mcpServers: { ...cursorServers, ...mcpConfig },
        };
        const tmpCursorPath = `${cursorMcpPath}.${process.pid}.tmp`;
        writeFileSync(tmpCursorPath, JSON.stringify(mergedCursorConfig, null, 2) + '\n', { mode: 0o600 });
        renameSync(tmpCursorPath, cursorMcpPath);
        printSuccess(`MCP server added to ${c.gray(cursorMcpPath)}`);
    }

    // Write VS Code / GitHub Copilot config if .vscode exists in cwd
    const vscodeMcpPath = join(process.cwd(), '.vscode', 'mcp.json');
    const vscodeDir = join(process.cwd(), '.vscode');
    if (existsSync(vscodeDir)) {
        writeMcpConfig(vscodeMcpPath, mcpConfig);
        printSuccess(`MCP server added to ${c.gray(vscodeMcpPath)} (GitHub Copilot)`);
    }

    // Write OpenCode config if ~/.config/opencode exists
    const openCodeConfigDir = join(homeDir, '.config', 'opencode');
    if (existsSync(openCodeConfigDir)) {
        const openCodeMcpPath = join(openCodeConfigDir, 'config.json');
        writeMcpConfig(openCodeMcpPath, mcpConfig);
        printSuccess(`MCP server added to ${c.gray(openCodeMcpPath)} (OpenCode)`);
    }

    // Copy Agent Skills to project
    printHeader('Agent Skills');
    copySkills(process.cwd());

    // Detect VibeKit and suggest side-by-side setup
    let hasVibeKit = false;
    try {
        const proc = Bun.spawn(['vibekit', '--version'], { stdout: 'pipe', stderr: 'pipe' });
        await proc.exited;
        hasVibeKit = true;
    } catch { /* not installed */ }

    if (hasVibeKit) {
        printHeader('VibeKit Integration');
        console.log(`  ${c.green('✓')} VibeKit CLI detected — smart contract tools available`);
        console.log(`  ${c.gray('Run')} ${c.cyan('vibekit init')} ${c.gray('to add blockchain MCP tools alongside corvid-agent')}`);
    } else {
        console.log(`\n  ${c.gray('Tip: Install VibeKit for Algorand smart contract MCP tools:')}`);
        console.log(`  ${c.cyan('curl -fsSL https://getvibekit.ai/install | sh')}`);
    }

    // Print manual setup snippets for clients we didn't auto-detect
    const mcpSnippet = JSON.stringify(mcpConfig, null, 2);
    const manualClients: string[] = [];
    if (!existsSync(vscodeDir)) manualClients.push('VS Code / Copilot');
    if (!existsSync(openCodeConfigDir)) manualClients.push('OpenCode');

    if (manualClients.length > 0) {
        printHeader('Other MCP Clients');
        console.log(`  ${c.gray(`For ${manualClients.join(', ')} — add the following to your MCP config:`)}`);
        console.log(`  ${c.gray('See docs/mcp-setup.md for per-client paths and details.')}\n`);
        console.log(`  ${c.cyan(mcpSnippet.split('\n').join('\n  '))}\n`);
    }

    console.log(`
${c.bold}${c.green('MCP setup complete!')}${c.reset}

${c.bold}What you get:${c.reset}
  corvid_* tools available in your AI editor — agents, sessions,
  work tasks, projects, health checks, and more.
  Agent Skills teach your AI assistant when and how to use each tool.

${c.bold}Next steps:${c.reset}
  1. ${projectRoot ? `Start the server: ${c.cyan('bun run dev')}` : 'Start your corvid-agent server'}
  2. Restart your editor to pick up the new MCP config
  3. Ask your AI assistant: ${c.gray('"List my agents"')} or ${c.gray('"Create a work task"')}
  ${hasVibeKit ? `4. Run ${c.cyan('vibekit init')} to add smart contract tools` : ''}
${c.gray('Config: ' + claudeConfigPath)}
${c.gray('Setup guide: docs/mcp-setup.md')}
`);
}

// ─── Simple Init (auto-detect, minimal questions) ────────────────────────────

async function initSimple(projectRoot: string): Promise<void> {
    console.log(`
${c.bold}Setting up your AI developer...${c.reset}
`);

    // ── Detect what's available ──
    const spinner = new Spinner('Checking your system...');
    spinner.start();
    const checks = await checkPrerequisites();
    spinner.stop();

    const hasOllama = checks.find(c => c.name === 'Ollama')?.found ?? false;
    const hasClaude = checks.find(c => c.name === 'Claude CLI')?.found ?? false;
    const hasAnthropicEnv = !!process.env.ANTHROPIC_API_KEY;

    // Show what we found
    for (const check of checks) {
        if (check.found) {
            const ver = check.version ? c.gray(` (${check.version})`) : '';
            console.log(`  ${c.green('✓')} ${check.name}${ver}`);
        } else if (check.required) {
            console.log(`  ${c.red('✗')} ${check.name} — ${c.red('required')}`);
        }
    }

    const hasMissing = checks.some(ch => ch.required && !ch.found);
    if (hasMissing) {
        printError('Missing required tools. Install them and try again.');
        process.exit(1);
    }

    // ── Determine AI provider — only ask if nothing detected ──
    const envPath = join(projectRoot, '.env');
    const envLines: string[] = [
        '# Generated by corvid-agent init',
        `# ${new Date().toISOString()}`,
        '',
    ];

    let providerConfigured = false;

    if (hasClaude) {
        console.log(`\n  ${c.green('✓')} ${c.bold}Claude CLI found${c.reset} — no API key needed for local use.`);
        providerConfigured = true;
    }

    if (hasAnthropicEnv) {
        console.log(`  ${c.green('✓')} ${c.bold}Anthropic API key found${c.reset} in environment.`);
        envLines.push(`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
        providerConfigured = true;
    }

    if (hasOllama) {
        console.log(`  ${c.green('✓')} ${c.bold}Ollama found${c.reset} — free, local AI available.`);
        envLines.push('OLLAMA_HOST=http://localhost:11434');
        if (!providerConfigured) {
            envLines.push('ENABLED_PROVIDERS=ollama');
            providerConfigured = true;
        }
    }

    if (!providerConfigured) {
        // Nothing auto-detected — need to ask
        console.log(`\n  ${c.yellow('!')} No AI provider detected.`);
        console.log(`  ${c.gray('Your agent needs an AI brain to work. Pick one:')}`);
        console.log(`    ${c.bold}1.${c.reset} Paste an Anthropic API key ${c.gray('(from console.anthropic.com)')}`);
        console.log(`    ${c.bold}2.${c.reset} Install Claude Code CLI ${c.gray('(uses your Claude subscription)')}`);
        console.log(`    ${c.bold}3.${c.reset} Install Ollama ${c.gray('(free, runs on your computer)')}`);
        console.log(`    ${c.bold}4.${c.reset} Skip for now ${c.gray('(you can try sandbox mode with `bun run try`)')}`);

        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
            const choice = await prompt(rl, 'Choose (1-4)', '4');
            if (choice === '1') {
                const key = await prompt(rl, 'Paste your Anthropic API key');
                if (key) {
                    envLines.push(`ANTHROPIC_API_KEY=${key}`);
                }
            } else if (choice === '2') {
                console.log(`\n  Install Claude Code: ${c.cyan('https://claude.com/claude-code')}`);
                console.log(`  ${c.gray('After installing, re-run:')} ${c.cyan('corvid-agent init')}`);
                process.exit(0);
            } else if (choice === '3') {
                console.log(`\n  Install Ollama: ${c.cyan('https://ollama.com')}`);
                console.log(`  ${c.gray('Then run:')} ${c.cyan('ollama pull qwen2.5-coder:14b')}`);
                console.log(`  ${c.gray('After installing, re-run:')} ${c.cyan('corvid-agent init')}`);
                process.exit(0);
            }
            // choice 4 or empty: continue without provider
        } finally {
            rl.close();
        }
    }

    // ── Write .env with smart defaults ──
    envLines.push('BIND_HOST=127.0.0.1');
    envLines.push('ALGORAND_NETWORK=localnet');
    envLines.push('');

    if (!existsSync(envPath)) {
        const tmpEnvPath = `${envPath}.${process.pid}.tmp`;
        writeFileSync(tmpEnvPath, envLines.join('\n'), { mode: 0o600 });
        renameSync(tmpEnvPath, envPath);
        printSuccess('.env created with auto-detected settings');
    } else {
        printSuccess('.env already exists — keeping your settings');
    }

    // ── Install dependencies ──
    const installSpinner = new Spinner('Installing dependencies...');
    installSpinner.start();
    try {
        const proc = Bun.spawn(['bun', 'install'], {
            cwd: projectRoot,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const exitCode = await proc.exited;
        installSpinner.stop();
        if (exitCode === 0) {
            printSuccess('Dependencies installed');
        } else {
            printWarning('Dependency install had issues — try running `bun install` manually');
        }
    } catch {
        installSpinner.stop();
        printWarning('Could not install dependencies — try running `bun install` manually');
    }

    // ── Health summary ──
    await printPostInitSummary(projectRoot);

    // ── Done — show welcome ──
    console.log(`
${c.bold}${c.green('You\'re all set!')}${c.reset} Your AI developer is ready.

${c.bold}Start it:${c.reset}
  ${c.cyan('bun run dev')}

${c.bold}Then open your browser:${c.reset}
  ${c.cyan('http://localhost:3000')}

  The dashboard will walk you through creating your first agent
  and show you everything it can do.

${c.bold}Or use the terminal:${c.reset}
  ${c.cyan('corvid-agent')}                Start chatting
  ${c.cyan('corvid-agent init --mcp')}     Add tools to Claude Code, Cursor, etc.

${c.bold}Want more control?${c.reset}
  ${c.cyan('corvid-agent init --advanced')}   Full setup wizard with all options
  ${c.gray('Edit .env directly for GitHub tokens, network settings, etc.')}
`);
}

// ─── Full Init Command ──────────────────────────────────────────────────────

export async function initCommand(opts: InitOptions = {}): Promise<void> {
    const autoYes = opts.yes ?? false;
    const fullMode = opts.full ?? false;

    // MCP-only mode
    if (opts.mcp) {
        await initMcpOnly({ yes: autoYes });
        return;
    }

    let projectRoot = findProjectRoot();

    // ── Step 0: Clone if not in repo ──
    if (!projectRoot) {
        console.log(`\n  ${c.yellow('!')} Not in a corvid-agent directory.`);

        const shouldClone = autoYes || await (async () => {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            try {
                return await confirm(rl, 'Clone corvid-agent here?', true);
            } finally {
                rl.close();
            }
        })();

        if (shouldClone) {
            const targetDir = join(process.cwd(), 'corvid-agent');
            const spinner = new Spinner('Cloning corvid-agent...');
            spinner.start();
            try {
                const proc = Bun.spawn(
                    ['git', 'clone', 'https://github.com/CorvidLabs/corvid-agent.git', targetDir],
                    { stdout: 'pipe', stderr: 'pipe' },
                );
                const exitCode = await proc.exited;
                spinner.stop();
                if (exitCode === 0) {
                    printSuccess(`Cloned to ${targetDir}`);
                    projectRoot = targetDir;
                    process.chdir(targetDir);
                } else {
                    const stderr = await new Response(proc.stderr).text();
                    printError(`Clone failed: ${stderr.slice(0, 200)}`);
                    process.exit(1);
                }
            } catch (err) {
                spinner.stop();
                printError(`Clone failed: ${err instanceof Error ? err.message : String(err)}`);
                process.exit(1);
            }
        } else {
            printError('Run this command inside the corvid-agent directory, or let init clone it for you.');
            process.exit(1);
        }
    }

    // Simple mode is now the default — use --advanced for the full wizard
    if (!opts.simple && opts.simple !== false) {
        // Default: simple mode (unless --advanced is explicitly passed)
        await initSimple(projectRoot);
        return;
    }

    // ── Advanced mode: full interactive wizard ──
    console.log(`
${c.bold}corvid-agent init --advanced${c.reset}
${c.gray('Full setup wizard — all options and configuration.')}
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
        if (existsSync(envPath) && !autoYes) {
            const overwrite = await confirm(rl, '.env already exists. Overwrite?', false);
            if (!overwrite) {
                printSuccess('.env unchanged');
                await runRemainingSteps(rl, projectRoot, autoYes, fullMode);
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

        if (autoYes) {
            // Non-interactive: sensible defaults
            if (hasClaude) {
                console.log(`  ${c.green('✓')} Claude CLI detected — using your subscription.`);
            }
            if (hasOllama) {
                envLines.push('OLLAMA_HOST=http://localhost:11434');
                if (!hasClaude) {
                    envLines.push('ENABLED_PROVIDERS=ollama');
                }
            }
            envLines.push('BIND_HOST=127.0.0.1');
            envLines.push('ALGORAND_NETWORK=localnet');
        } else {
            // Interactive mode
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
        }

        // Write .env atomically via temp file to avoid TOCTOU race
        envLines.push('');
        const tmpEnvPath = `${envPath}.${process.pid}.tmp`;
        writeFileSync(tmpEnvPath, envLines.join('\n'), { mode: 0o600 });
        renameSync(tmpEnvPath, envPath);
        printSuccess('.env created');

        await runRemainingSteps(rl, projectRoot, autoYes, fullMode);
    } finally {
        rl.close();
    }
}

async function runRemainingSteps(
    rl: ReturnType<typeof createInterface>,
    projectRoot: string,
    autoYes: boolean,
    fullMode: boolean = false,
): Promise<void> {
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
    if (fullMode) {
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
    } else {
        printHeader('4/5  Dashboard');
        console.log(`  ${c.gray('Skipped — run')} ${c.cyan('bun run build:client')} ${c.gray('to build the dashboard')}`);
        console.log(`  ${c.gray('Or use')} ${c.cyan('corvid-agent init --full')} ${c.gray('to include this step')}`);
    }

    // ── Step 5: Create Default Agent ──
    printHeader('5/5  Creating default agent');

    const shouldCreate = autoYes || await confirm(rl, 'Create a default agent now?', true);
    if (shouldCreate) {
        const agentName = autoYes ? 'Assistant' : await prompt(rl, 'Agent name', 'Assistant');

        // Check if server is running, start it temporarily if not
        let serverStarted = false;
        let serverProc: ReturnType<typeof Bun.spawn> | null = null;
        const port = process.env.PORT ?? '3000';

        try {
            const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`, {
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
                    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
                        signal: AbortSignal.timeout(2_000),
                    });
                    if (res.ok) break;
                } catch { /* not ready */ }
                await Bun.sleep(500);
            }
        }

        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/agents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: agentName,
                    description: 'Created by corvid-agent init',
                    model: 'claude-sonnet-4-6',
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

    // ── Health summary ──
    await printPostInitSummary(projectRoot);

    // ── Done ──
    console.log(`
${c.bold}${c.green('Setup complete!')}${c.reset} Your AI developer is ready.

${c.bold}Start it up:${c.reset}
  ${c.cyan('bun run dev')}          Start the server and open the dashboard

${c.bold}Then tell it what to build:${c.reset}
  ${c.gray('"Build me a personal portfolio website"')}
  ${c.gray('"Create a weather dashboard"')}
  ${c.gray('"Make a todo list app"')}

${c.bold}Other ways to use it:${c.reset}
  ${c.cyan('corvid-agent')}                Interactive terminal chat
  ${c.cyan('corvid-agent init --mcp')}     Add tools to your AI editor (Claude Code, Cursor, etc.)
  ${c.cyan('bun run try')}                 Try sandbox mode (no API key needed)

${c.gray('Docs: docs/quickstart.md  •  Ideas: docs/project-ideas.md  •  Dashboard: http://127.0.0.1:3000')}
`);
}
