import { CorvidClient } from '../client';
import { loadConfig } from '../config';
import { c, printError, Spinner } from '../render';

interface HealthResponse {
    status: string;
    uptime: number;
    sessions: { active: number; total: number };
    algochat?: { enabled: boolean; address: string | null; network: string };
}

export async function statusCommand(): Promise<void> {
    const config = loadConfig();
    const client = new CorvidClient(config);
    const spinner = new Spinner('Checking server status...');
    spinner.start();

    try {
        const health = await client.get<HealthResponse>('/api/health');
        spinner.stop();

        console.log(`${c.green('●')} Server ${c.bold}${health.status}${c.reset}`);
        console.log(`  URL:      ${c.cyan(config.serverUrl)}`);
        console.log(`  Uptime:   ${formatUptime(health.uptime)}`);
        console.log(`  Sessions: ${health.sessions.active} active / ${health.sessions.total} total`);

        if (health.algochat) {
            const ac = health.algochat;
            const statusIcon = ac.enabled ? c.green('●') : c.gray('○');
            console.log(`  AlgoChat: ${statusIcon} ${ac.network}${ac.address ? ` (${ac.address.slice(0, 8)}...)` : ''}`);
        }
    } catch (err) {
        spinner.stop();
        const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Connection refused';
        printError(`Cannot reach server at ${config.serverUrl}: ${message}`);
        process.exit(1);
    }
}

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
}
