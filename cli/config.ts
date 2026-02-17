import { homedir } from 'os';
import { join } from 'path';
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

const DEFAULT_CONFIG: CliConfig = {
    serverUrl: 'http://127.0.0.1:3578',
    authToken: null,
    defaultAgent: null,
    defaultProject: null,
    defaultModel: null,
};

// ─── Read / Write ───────────────────────────────────────────────────────────

export function getConfigPath(): string {
    return CONFIG_FILE;
}

export function loadConfig(): CliConfig {
    if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
    try {
        const raw = readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<CliConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
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
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return DEFAULT_CONFIG.serverUrl;
        // Reconstruct from validated parts to break taint propagation
        const port = parsed.port ? `:${parsed.port}` : '';
        return `${parsed.protocol}//${parsed.hostname}${port}`;
    } catch {
        return DEFAULT_CONFIG.serverUrl;
    }
}

export function saveConfig(config: CliConfig): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    // Reconstruct each field independently to break taint propagation from network data
    const safe: CliConfig = {
        serverUrl: sanitizeServerUrl(config.serverUrl),
        authToken: typeof config.authToken === 'string' ? config.authToken.slice(0, 512) : null,
        defaultAgent: sanitizeId(config.defaultAgent, 128),
        defaultProject: sanitizeId(config.defaultProject, 256),
        defaultModel: sanitizeId(config.defaultModel, 128),
    };
    writeFileSync(CONFIG_FILE, JSON.stringify(safe, null, 2) + '\n', { mode: 0o600 });
}

export function updateConfig(updates: Partial<CliConfig>): CliConfig {
    const config = loadConfig();
    Object.assign(config, updates);
    saveConfig(config);
    return config;
}
