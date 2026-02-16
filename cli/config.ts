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

export function saveConfig(config: CliConfig): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function updateConfig(updates: Partial<CliConfig>): CliConfig {
    const config = loadConfig();
    Object.assign(config, updates);
    saveConfig(config);
    return config;
}
