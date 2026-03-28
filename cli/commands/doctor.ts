import { existsSync, statSync, accessSync, constants } from 'fs';
import { join, dirname } from 'path';
import { readFileSync } from 'fs';
import { c } from '../render';
import { loadConfig } from '../config';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CheckResult {
    label: string;
    ok: boolean;
    detail?: string;
    fix?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pass(label: string, detail?: string): CheckResult {
    return { label, ok: true, detail };
}

function fail(label: string, detail: string, fix: string): CheckResult {
    return { label, ok: false, detail, fix };
}

function printResult(r: CheckResult): void {
    const icon = r.ok ? c.green('✓') : c.red('✗');
    const labelPart = r.ok ? r.label : c.red(r.label);
    const detailPart = r.detail ? c.gray(` — ${r.detail}`) : '';
    console.log(`  ${icon} ${labelPart}${detailPart}`);
    if (!r.ok && r.fix) {
        console.log(`    ${c.yellow('→')} ${r.fix}`);
    }
}

/** Find the corvid-agent project root by walking up from cwd. */
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

/** Load .env from the project root into a key/value map (without overwriting process.env). */
function loadDotEnv(projectRoot: string): Record<string, string> {
    const envPath = join(projectRoot, '.env');
    const result: Record<string, string> = {};
    if (!existsSync(envPath)) return result;
    try {
        const lines = readFileSync(envPath, 'utf-8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (key) result[key] = val;
        }
    } catch { /* ignore */ }
    return result;
}

/** Get value from process.env or fallback map. */
function getEnv(key: string, fallback: Record<string, string>): string | undefined {
    return process.env[key] ?? fallback[key];
}

// ─── Individual Checks ────────────────────────────────────────────────────────

async function checkBunVersion(): Promise<CheckResult> {
    try {
        const proc = Bun.spawn(['bun', '--version'], { stdout: 'pipe', stderr: 'pipe' });
        const version = (await new Response(proc.stdout).text()).trim();
        const parts = version.split('.');
        const major = parseInt(parts[0] ?? '0', 10);
        if (major < 1) {
            return fail('Bun runtime', `v${version} (need >= 1.0)`, 'Upgrade Bun: curl -fsSL https://bun.sh/install | bash');
        }
        return pass('Bun runtime', `v${version}`);
    } catch {
        return fail('Bun runtime', 'not found', 'Install Bun: curl -fsSL https://bun.sh/install | bash');
    }
}

async function checkNode(): Promise<CheckResult> {
    try {
        const proc = Bun.spawn(['node', '--version'], { stdout: 'pipe', stderr: 'pipe' });
        const version = (await new Response(proc.stdout).text()).trim();
        return pass('Node.js', version);
    } catch {
        return fail('Node.js', 'not found', 'Install Node.js: https://nodejs.org');
    }
}

function checkDatabase(projectRoot: string | null, envOverrides: Record<string, string>): CheckResult {
    const dbPath = getEnv('DB_PATH', envOverrides) ?? (projectRoot ? join(projectRoot, 'corvid-agent.db') : null);
    if (!dbPath) {
        return fail('Database', 'project root not found', 'Run from within the corvid-agent project directory');
    }
    if (!existsSync(dbPath)) {
        return fail('Database', `${dbPath} not found`, 'Run: bun run migrate (or start the server to auto-create)');
    }
    try {
        const stat = statSync(dbPath);
        if (stat.size < 100) {
            return fail('Database', 'file exists but appears empty or corrupt', 'Remove and re-run migrations: rm corvid-agent.db && bun run migrate');
        }
        // Check read access
        accessSync(dbPath, constants.R_OK);
        return pass('Database', `${dbPath} (${(stat.size / 1024).toFixed(0)} KB)`);
    } catch {
        return fail('Database', 'file exists but is not readable', 'Check file permissions: chmod 644 corvid-agent.db');
    }
}

function checkProviders(envOverrides: Record<string, string>): CheckResult[] {
    const results: CheckResult[] = [];

    const anthropicKey = getEnv('ANTHROPIC_API_KEY', envOverrides);
    if (anthropicKey) {
        results.push(pass('Anthropic API key', 'set'));
    } else {
        results.push(fail('Anthropic API key', 'not set', 'Add ANTHROPIC_API_KEY=sk-ant-... to .env or environment'));
    }

    const openaiKey = getEnv('OPENAI_API_KEY', envOverrides);
    if (openaiKey) {
        results.push(pass('OpenAI API key', 'set'));
    } else {
        // OpenAI is optional — note it but don't fail
        results.push({ label: 'OpenAI API key', ok: true, detail: c.gray('not set (optional)') });
    }

    return results;
}

async function checkPort(serverUrl: string): Promise<CheckResult> {
    // Extract port from configured server URL
    let port = 3000;
    try {
        const url = new URL(serverUrl);
        port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);
    } catch { /* use default */ }

    // Try to connect to the server — if it responds, the server is already running (good)
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${serverUrl}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
            return pass(`Port ${port}`, 'server already running');
        }
        return pass(`Port ${port}`, 'server reachable');
    } catch (err) {
        // Server not running — check if port is free using a TCP connect attempt
        // If connection refused → port is free (good for starting the server)
        // If connection times out → something else may be blocking
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ECONNREFUSED') || msg.includes('refused') || msg.includes('abort')) {
            return pass(`Port ${port}`, 'available (server not running)');
        }
        return fail(`Port ${port}`, `unexpected error: ${msg}`, `Check if port ${port} is in use: lsof -i :${port}`);
    }
}

async function checkAlgoChat(envOverrides: Record<string, string>): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const network = getEnv('ALGORAND_NETWORK', envOverrides) ?? 'localnet';

    if (network === 'localnet') {
        const algodUrl = getEnv('LOCALNET_ALGOD_URL', envOverrides) ?? 'http://localhost:4001';
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${algodUrl}/v2/status`, {
                signal: controller.signal,
                headers: { 'X-Algo-API-Token': getEnv('ALGOD_TOKEN', envOverrides) ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
            });
            clearTimeout(timer);
            if (res.ok) {
                results.push(pass('Algorand localnet', `reachable at ${algodUrl}`));
            } else {
                results.push(fail('Algorand localnet', `HTTP ${res.status} from ${algodUrl}`, 'Start AlgoKit localnet: algokit localnet start'));
            }
        } catch {
            results.push(fail('Algorand localnet', `not reachable at ${algodUrl}`, 'Start AlgoKit localnet: algokit localnet start'));
        }
    } else {
        results.push(pass('Algorand network', `${network} (not checked — only localnet is auto-verified)`));
    }

    const mnemonic = getEnv('ALGOCHAT_MNEMONIC', envOverrides);
    if (mnemonic) {
        const wordCount = mnemonic.trim().split(/\s+/).length;
        if (wordCount === 25) {
            results.push(pass('AlgoChat wallet', 'mnemonic set (25 words)'));
        } else {
            results.push(fail('AlgoChat wallet', `mnemonic has ${wordCount} words (need 25)`, 'Set a valid 25-word Algorand mnemonic in ALGOCHAT_MNEMONIC'));
        }
    } else {
        results.push(fail('AlgoChat wallet', 'ALGOCHAT_MNEMONIC not set', 'Add ALGOCHAT_MNEMONIC=word1 word2 ... word25 to .env'));
    }

    return results;
}

async function checkGitHub(envOverrides: Record<string, string>): Promise<CheckResult> {
    const token = getEnv('GITHUB_TOKEN', envOverrides);
    if (!token) {
        return fail('GitHub token', 'GITHUB_TOKEN not set', 'Add GITHUB_TOKEN=ghp_... to .env or environment');
    }

    // Verify token by calling the user endpoint — check for repo scope in headers
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('https://api.github.com/user', {
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${token}`,
                'User-Agent': 'corvid-agent-doctor/1.0',
            },
        });
        clearTimeout(timer);

        if (res.status === 401) {
            return fail('GitHub token', 'token is invalid or expired', 'Regenerate your GitHub token at https://github.com/settings/tokens');
        }
        if (!res.ok) {
            return fail('GitHub token', `API returned HTTP ${res.status}`, 'Check your GITHUB_TOKEN value');
        }

        // Check scopes header
        const scopesHeader = res.headers.get('x-oauth-scopes') ?? '';
        const scopes = scopesHeader.split(',').map((s) => s.trim()).filter(Boolean);
        const hasRepo = scopes.includes('repo') || scopes.includes('public_repo');

        if (scopes.length === 0) {
            // Fine-grained token — scopes header not present
            return pass('GitHub token', 'valid (fine-grained token)');
        }
        if (!hasRepo) {
            return fail('GitHub token', `set but missing repo scope (has: ${scopes.join(', ')})`, 'Regenerate token with repo scope at https://github.com/settings/tokens');
        }
        return pass('GitHub token', `valid (scopes: ${scopes.join(', ')})`);
    } catch {
        // Network error — token might still be fine
        return { label: 'GitHub token', ok: true, detail: c.gray('set (network check skipped)') };
    }
}

// ─── Main Command ─────────────────────────────────────────────────────────────

export async function doctorCommand(): Promise<void> {
    console.log(`\n${c.bold}corvid-agent doctor${c.reset} — system health check\n`);

    const projectRoot = findProjectRoot();
    const envOverrides = projectRoot ? loadDotEnv(projectRoot) : {};
    const config = loadConfig();

    let allPassed = true;

    // ── Runtime ──────────────────────────────────────────────────────────────
    console.log(`${c.bold}Runtime${c.reset}`);
    const [bunResult, nodeResult] = await Promise.all([checkBunVersion(), checkNode()]);
    printResult(bunResult);
    printResult(nodeResult);
    if (!bunResult.ok || !nodeResult.ok) allPassed = false;

    // ── Database ─────────────────────────────────────────────────────────────
    console.log(`\n${c.bold}Database${c.reset}`);
    const dbResult = checkDatabase(projectRoot, envOverrides);
    printResult(dbResult);
    if (!dbResult.ok) allPassed = false;

    // ── AI Providers ─────────────────────────────────────────────────────────
    console.log(`\n${c.bold}AI Providers${c.reset}`);
    const providerResults = checkProviders(envOverrides);
    for (const r of providerResults) {
        printResult(r);
        if (!r.ok) allPassed = false;
    }

    // ── Server / Port ────────────────────────────────────────────────────────
    console.log(`\n${c.bold}Server${c.reset}`);
    const portResult = await checkPort(config.serverUrl);
    printResult(portResult);
    if (!portResult.ok) allPassed = false;

    // ── AlgoChat ─────────────────────────────────────────────────────────────
    console.log(`\n${c.bold}AlgoChat${c.reset}`);
    const algochatResults = await checkAlgoChat(envOverrides);
    for (const r of algochatResults) {
        printResult(r);
        if (!r.ok) allPassed = false;
    }

    // ── GitHub ───────────────────────────────────────────────────────────────
    console.log(`\n${c.bold}GitHub${c.reset}`);
    const githubResult = await checkGitHub(envOverrides);
    printResult(githubResult);
    if (!githubResult.ok) allPassed = false;

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('');
    if (allPassed) {
        console.log(`${c.green('✓')} All checks passed — corvid-agent looks healthy!`);
    } else {
        console.log(`${c.yellow('!')} Some checks failed. Fix the issues above before starting the server.`);
        process.exit(1);
    }
}
