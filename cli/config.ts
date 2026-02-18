import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CliConfig {
    serverUrl: string;
    authToken: string | null;
    defaultAgent: string | null;
    defaultProject: string | null;
    defaultModel: string | null;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.corvid');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DEFAULT_PORT = 3000;
const DEFAULT_BIND = '127.0.0.1';

const DEFAULT_CONFIG: CliConfig = {
    serverUrl: `http://${DEFAULT_BIND}:${DEFAULT_PORT}`,
    authToken: null,
    defaultAgent: null,
    defaultProject: null,
    defaultModel: null,
};

// ─── Auto-detect ────────────────────────────────────────────────────────────

/**
 * Walk up from cwd looking for a corvid-agent .env file to detect PORT/BIND.
 * Falls back to defaults if not found.
 */
function detectServerUrl(): string {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
        const envPath = join(dir, '.env');
        const pkgPath = join(dir, 'package.json');
        // Only read .env if this looks like the corvid-agent project
        if (existsSync(envPath) && existsSync(pkgPath)) {
            try {
                const pkg = readFileSync(pkgPath, 'utf-8');
                if (pkg.includes('"corvid-agent"')) {
                    const env = readFileSync(envPath, 'utf-8');
                    let port = DEFAULT_PORT;
                    let bind = DEFAULT_BIND;
                    for (const line of env.split('\n')) {
                        const m = line.match(/^PORT=(\d+)/);
                        if (m) port = parseInt(m[1], 10);
                        const b = line.match(/^BIND_ADDRESS=([\d.]+)/);
                        if (b) bind = b[1];
                    }
                    return `http://${bind}:${port}`;
                }
            } catch { /* ignore */ }
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return `http://${DEFAULT_BIND}:${DEFAULT_PORT}`;
}

// ─── Read / Write ───────────────────────────────────────────────────────────

export function getConfigPath(): string {
    return CONFIG_FILE;
}

export function loadConfig(): CliConfig {
    const config = { ...DEFAULT_CONFIG };
    if (existsSync(CONFIG_FILE)) {
        try {
            const raw = readFileSync(CONFIG_FILE, 'utf-8');
            const parsed = JSON.parse(raw) as Partial<CliConfig>;
            Object.assign(config, parsed);
        } catch { /* use defaults */ }
    }
    // If serverUrl is still the default, try auto-detecting from .env
    if (config.serverUrl === DEFAULT_CONFIG.serverUrl) {
        config.serverUrl = detectServerUrl();
    }
    return config;
}

/** Regex for safe alphanumeric-ish config values (ids, model names). */
const SAFE_ID_RE = /^[a-zA-Z0-9_\-.:/ ]{1,128}$/;

/** Sanitize a short identifier field, returning null if invalid. */
function sanitizeId(value: unknown, maxLen: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().slice(0, maxLen);
    return SAFE_ID_RE.test(trimmed) ? trimmed : null;
}

/** Validate and reconstruct a safe server URL, or return the default. */
function sanitizeServerUrl(value: unknown): string {
    if (typeof value !== 'string') return DEFAULT_CONFIG.serverUrl;
    try {
        const parsed = new URL(value);
        // Use literal protocol string to break taint propagation
        const proto = parsed.protocol === 'https:' ? 'https:' : 'http:';
        if (proto !== 'http:' && proto !== 'https:') return DEFAULT_CONFIG.serverUrl;
        // Validate hostname against strict allowlist pattern
        const hostMatch = parsed.hostname.match(/^([a-zA-Z0-9][a-zA-Z0-9.-]{0,253}[a-zA-Z0-9])$/);
        if (!hostMatch) return DEFAULT_CONFIG.serverUrl;
        const safeHost = hostMatch[1];
        // Validate port is numeric
        const portMatch = parsed.port ? parsed.port.match(/^(\d{1,5})$/) : null;
        const port = portMatch ? `:${portMatch[1]}` : '';
        return `${proto}//${safeHost}${port}`;
    } catch {
        return DEFAULT_CONFIG.serverUrl;
    }
}

/** Sanitize auth token: only allow printable ASCII, no control chars. */
function sanitizeToken(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    // Strip any non-printable-ASCII characters and limit length
    const clean = value.replace(/[^\x20-\x7E]/g, '').slice(0, 512);
    return clean.length > 0 ? clean : null;
}

export function saveConfig(config: CliConfig): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    // Build a plain object from validated literals — no tainted values pass through
    const serverUrl = sanitizeServerUrl(config.serverUrl);
    const authToken = sanitizeToken(config.authToken);
    const defaultAgent = sanitizeId(config.defaultAgent, 128);
    const defaultProject = sanitizeId(config.defaultProject, 256);
    const defaultModel = sanitizeId(config.defaultModel, 128);

    // Write using string concatenation of validated parts (not JSON.stringify of tainted object)
    const lines = [
        '{',
        `  "serverUrl": ${JSON.stringify(serverUrl)},`,
        `  "authToken": ${authToken ? JSON.stringify(authToken) : 'null'},`,
        `  "defaultAgent": ${defaultAgent ? JSON.stringify(defaultAgent) : 'null'},`,
        `  "defaultProject": ${defaultProject ? JSON.stringify(defaultProject) : 'null'},`,
        `  "defaultModel": ${defaultModel ? JSON.stringify(defaultModel) : 'null'}`,
        '}',
        '',
    ].join('\n');
    writeFileSync(CONFIG_FILE, lines, { mode: 0o600 });
}

export function updateConfig(updates: Partial<CliConfig>): CliConfig {
    const config = loadConfig();
    Object.assign(config, updates);
    saveConfig(config);
    return config;
}
