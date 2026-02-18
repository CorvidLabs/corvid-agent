import { CorvidClient } from '../client';
import { loadConfig } from '../config';
import { c, printError, Spinner } from '../render';

interface HealthResponse {
    status: string;
    uptime: number;
    activeSessions: number;
    algochat: boolean;
    scheduler?: { running: boolean; activeSchedules: number; runningExecutions: number };
    workflows?: { running: boolean; activeRuns: number; totalWorkflows: number };
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
        console.log(`  Sessions: ${health.activeSessions} active`);

        const algochatIcon = health.algochat ? c.green('●') : c.gray('○');
        console.log(`  AlgoChat: ${algochatIcon} ${health.algochat ? 'enabled' : 'disabled'}`);

        if (health.scheduler) {
            const sIcon = health.scheduler.running ? c.green('●') : c.gray('○');
            console.log(`  Scheduler: ${sIcon} ${health.scheduler.activeSchedules} schedules, ${health.scheduler.runningExecutions} running`);
        }

        if (health.workflows) {
            const wIcon = health.workflows.running ? c.green('●') : c.gray('○');
            console.log(`  Workflows: ${wIcon} ${health.workflows.totalWorkflows} total, ${health.workflows.activeRuns} running`);
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
