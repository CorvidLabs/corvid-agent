import { loadConfig, updateConfig, getConfigPath, type CliConfig } from '../config';
import { c, printError } from '../render';

type ConfigAction = 'show' | 'set' | 'get';

const VALID_KEYS: (keyof CliConfig)[] = ['serverUrl', 'authToken', 'defaultAgent', 'defaultProject', 'defaultModel'];

export function configCommand(action: ConfigAction, key?: string, value?: string): void {
    switch (action) {
        case 'show':
            return showConfig();
        case 'get':
            if (!key) { printError('Key required: corvid-agent config get <key>'); process.exit(1); }
            return getConfigValue(key);
        case 'set':
            if (!key) { printError('Key required: corvid-agent config set <key> <value>'); process.exit(1); }
            return setConfigValue(key, value ?? '');
        default:
            printError(`Unknown action: ${action}. Use: show, get, set`);
            process.exit(1);
    }
}

function showConfig(): void {
    const config = loadConfig();
    console.log(`${c.gray(`# ${getConfigPath()}`)}\n`);
    for (const [key, val] of Object.entries(config)) {
        const display = key === 'authToken' && val ? maskToken(String(val)) : String(val ?? c.gray('(not set)'));
        console.log(`  ${c.bold}${key}${c.reset}: ${display}`);
    }
}

function getConfigValue(key: string): void {
    if (!isValidKey(key)) {
        printError(`Unknown config key: ${key}. Valid keys: ${VALID_KEYS.join(', ')}`);
        process.exit(1);
    }
    const config = loadConfig();
    const val = config[key as keyof CliConfig];
    console.log(val ?? '');
}

function setConfigValue(key: string, value: string): void {
    if (!isValidKey(key)) {
        printError(`Unknown config key: ${key}. Valid keys: ${VALID_KEYS.join(', ')}`);
        process.exit(1);
    }

    const update: Partial<CliConfig> = {};
    const resolvedValue = value === '' || value === 'null' ? null : value;
    (update as Record<string, unknown>)[key] = resolvedValue;

    updateConfig(update);
    const display = key === 'authToken' && resolvedValue ? maskToken(resolvedValue) : String(resolvedValue ?? c.gray('(cleared)'));
    console.log(`${c.green('✓')} ${key} = ${display}`);
}

function isValidKey(key: string): boolean {
    return VALID_KEYS.includes(key as keyof CliConfig);
}

function maskToken(token: string): string {
    if (token.length <= 8) return '****';
    return token.slice(0, 4) + '****' + token.slice(-4);
}
