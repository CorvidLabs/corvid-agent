/**
 * `corvid-agent settings` — view and update server runtime settings.
 *
 * Wraps the /api/settings REST endpoints so operators can manage
 * credits, Discord config, and API key status from the CLI.
 */

import { CorvidClient, type ApiError } from '../client';
import { loadConfig } from '../config';
import { c, printError, printSuccess, printHeader, printTable, Spinner } from '../render';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SettingsResponse {
    creditConfig: Record<string, string>;
    discordConfig?: Record<string, string>;
    system?: { schemaVersion: number; agentCount: number; projectCount: number; sessionCount: number };
}

interface ApiKeyStatusResponse {
    rotatedAt: string | null;
    previousKeyActive: boolean;
    gracePeriodExpiry: string | null;
    expired: boolean;
    expiresAt: string | null;
    warning: string | null;
}

type SettingsAction = 'show' | 'credits' | 'discord' | 'api-key';

// ─── Main ───────────────────────────────────────────────────────────────────

export async function settingsCommand(
    action: SettingsAction,
    args: { key?: string; value?: string; json?: boolean },
): Promise<void> {
    const config = loadConfig();
    const client = new CorvidClient(config);

    switch (action) {
        case 'show':
            return showAll(client);
        case 'credits':
            if (args.key && args.value !== undefined) {
                return updateCredit(client, args.key, args.value);
            }
            return showCredits(client);
        case 'discord':
            if (args.key && args.value !== undefined) {
                return updateDiscord(client, args.key, args.value);
            }
            return showDiscord(client);
        case 'api-key':
            return showApiKeyStatus(client);
        default:
            printError(`Unknown action: ${action}. Use: show, credits, discord, api-key`);
            process.exit(1);
    }
}

// ─── Show All ───────────────────────────────────────────────────────────────

async function showAll(client: CorvidClient): Promise<void> {
    const spinner = new Spinner('Fetching settings...');
    spinner.start();

    try {
        const data = await client.get<SettingsResponse>('/api/settings');
        spinner.stop();

        // Credits
        printHeader('Credit Configuration');
        const creditRows = Object.entries(data.creditConfig).map(([k, v]) => [k, String(v)]);
        if (creditRows.length > 0) {
            printTable(['Key', 'Value'], creditRows);
        } else {
            console.log(c.gray('  No credit config found'));
        }

        // Discord (admin only)
        if (data.discordConfig) {
            printHeader('Discord Configuration');
            const discordRows = Object.entries(data.discordConfig).map(([k, v]) => {
                const display = String(v).length > 60 ? String(v).slice(0, 57) + '...' : String(v);
                return [k, display];
            });
            if (discordRows.length > 0) {
                printTable(['Key', 'Value'], discordRows);
            } else {
                console.log(c.gray('  No Discord config found'));
            }
        }

        // System stats (admin only)
        if (data.system) {
            printHeader('System');
            console.log(`  Schema:   v${data.system.schemaVersion}`);
            console.log(`  Agents:   ${data.system.agentCount}`);
            console.log(`  Projects: ${data.system.projectCount}`);
            console.log(`  Sessions: ${data.system.sessionCount}`);
        }
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

// ─── Credits ────────────────────────────────────────────────────────────────

async function showCredits(client: CorvidClient): Promise<void> {
    const spinner = new Spinner('Fetching credit config...');
    spinner.start();

    try {
        const data = await client.get<SettingsResponse>('/api/settings');
        spinner.stop();

        printHeader('Credit Configuration');
        const rows = Object.entries(data.creditConfig).map(([k, v]) => [k, String(v)]);
        if (rows.length > 0) {
            printTable(['Key', 'Value'], rows);
        } else {
            console.log(c.gray('  No credit config found'));
        }
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

async function updateCredit(client: CorvidClient, key: string, value: string): Promise<void> {
    try {
        await client.put<{ ok: boolean }>('/api/settings/credits', { [key]: value });
        printSuccess(`credits.${key} = ${value}`);
    } catch (err) {
        handleError(err);
    }
}

// ─── Discord ────────────────────────────────────────────────────────────────

async function showDiscord(client: CorvidClient): Promise<void> {
    const spinner = new Spinner('Fetching Discord config...');
    spinner.start();

    try {
        const data = await client.get<{ discordConfig: Record<string, string> }>('/api/settings/discord');
        spinner.stop();

        printHeader('Discord Configuration');
        const rows = Object.entries(data.discordConfig).map(([k, v]) => {
            const display = String(v).length > 60 ? String(v).slice(0, 57) + '...' : String(v);
            return [k, display];
        });
        if (rows.length > 0) {
            printTable(['Key', 'Value'], rows);
        } else {
            console.log(c.gray('  No Discord config found'));
        }
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

async function updateDiscord(client: CorvidClient, key: string, value: string): Promise<void> {
    // Try to parse as JSON for object/array values
    let parsed: unknown = value;
    try {
        parsed = JSON.parse(value);
    } catch {
        // Use as plain string
    }

    try {
        await client.put<{ ok: boolean }>('/api/settings/discord', { [key]: parsed });
        printSuccess(`discord.${key} updated`);
    } catch (err) {
        handleError(err);
    }
}

// ─── API Key ────────────────────────────────────────────────────────────────

async function showApiKeyStatus(client: CorvidClient): Promise<void> {
    const spinner = new Spinner('Checking API key status...');
    spinner.start();

    try {
        const data = await client.get<ApiKeyStatusResponse>('/api/settings/api-key/status');
        spinner.stop();

        printHeader('API Key Status');

        if (data.expired) {
            console.log(`  Status:  ${c.red('EXPIRED')}`);
        } else {
            console.log(`  Status:  ${c.green('Active')}`);
        }

        if (data.expiresAt) {
            console.log(`  Expires: ${data.expiresAt}`);
        } else {
            console.log(`  Expires: ${c.gray('never')}`);
        }

        if (data.rotatedAt) {
            console.log(`  Rotated: ${data.rotatedAt}`);
        }

        if (data.previousKeyActive) {
            console.log(`  ${c.yellow('!')} Previous key still valid until ${data.gracePeriodExpiry}`);
        }

        if (data.warning) {
            console.log(`\n  ${c.yellow('⚠')} ${data.warning}`);
        }
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function handleError(err: unknown): void {
    if (err && typeof err === 'object' && 'message' in err) {
        const apiErr = err as ApiError;
        if (apiErr.status === 401) {
            printError('Authentication required. Run: corvid-agent config set authToken <your-key>');
        } else if (apiErr.status === 403) {
            printError('Insufficient permissions (owner role required for this action)');
        } else {
            printError(apiErr.message);
        }
    } else {
        printError('Connection failed. Is the server running? Check: corvid-agent status');
    }
    process.exit(1);
}
