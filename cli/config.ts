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

/** Validate that a string is a safe localhost/IP HTTP URL for the server. */
function isValidServerUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.pathname.length < 64;
    } catch {
        return false;
    }
}

/** Validate and sanitize config before persisting to disk. */
function sanitizeConfig(config: CliConfig): CliConfig {
    const serverUrl = typeof config.serverUrl === 'string' && isValidServerUrl(config.serverUrl)
        ? config.serverUrl.slice(0, 256)
        : DEFAULT_CONFIG.serverUrl;
    return {
        serverUrl,
        authToken: typeof config.authToken === 'string' ? config.authToken.slice(0, 512) : null,
        defaultAgent: typeof config.defaultAgent === 'string' ? config.defaultAgent.slice(0, 128) : null,
        defaultProject: typeof config.defaultProject === 'string' ? config.defaultProject.slice(0, 256) : null,
        defaultModel: typeof config.defaultModel === 'string' ? config.defaultModel.slice(0, 128) : null,
    };
}

export function saveConfig(config: CliConfig): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    const safe = sanitizeConfig(config);
    writeFileSync(CONFIG_FILE, JSON.stringify(safe, null, 2) + '\n', { mode: 0o600 });
}

export function updateConfig(updates: Partial<CliConfig>): CliConfig {
    const config = loadConfig();
    Object.assign(config, updates);
    saveConfig(config);
    return config;
}
