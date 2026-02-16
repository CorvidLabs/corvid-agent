import { CorvidClient } from '../client';
import { loadConfig } from '../config';
import type { Session } from '../../shared/types';
import { c, printError, printTable, Spinner } from '../render';

type SessionAction = 'list' | 'get' | 'stop' | 'resume';

export async function sessionCommand(action: SessionAction, sessionId?: string): Promise<void> {
    const config = loadConfig();
    const client = new CorvidClient(config);

    switch (action) {
        case 'list':
            return listSessions(client);
        case 'get':
            if (!sessionId) { printError('Session ID required: corvid-agent session get <id>'); process.exit(1); }
            return getSession(client, sessionId);
        case 'stop':
            if (!sessionId) { printError('Session ID required: corvid-agent session stop <id>'); process.exit(1); }
            return stopSession(client, sessionId);
        case 'resume':
            if (!sessionId) { printError('Session ID required: corvid-agent session resume <id>'); process.exit(1); }
            return resumeSession(client, sessionId);
        default:
            printError(`Unknown action: ${action}. Use: list, get, stop, resume`);
            process.exit(1);
    }
}

async function listSessions(client: CorvidClient): Promise<void> {
    const spinner = new Spinner('Fetching sessions...');
    spinner.start();
    try {
        const sessions = await client.get<Session[]>('/api/sessions');
        spinner.stop();

        if (sessions.length === 0) {
            console.log(c.gray('No sessions found'));
            return;
        }

        printTable(
            ['ID', 'Status', 'Agent', 'Source', 'Turns', 'Cost', 'Created'],
            sessions.map(s => [
                s.id.slice(0, 8),
                formatStatus(s.status),
                s.agentId?.slice(0, 8) ?? '-',
                s.source,
                String(s.totalTurns),
                `$${s.totalCostUsd.toFixed(4)}`,
                new Date(s.createdAt).toLocaleString(),
            ]),
        );
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

async function getSession(client: CorvidClient, id: string): Promise<void> {
    const spinner = new Spinner('Fetching session...');
    spinner.start();
    try {
        const session = await client.get<Session>(`/api/sessions/${id}`);
        spinner.stop();

        console.log(`${c.bold}Session${c.reset} ${session.id}`);
        console.log(`  Status:  ${formatStatus(session.status)}`);
        console.log(`  Agent:   ${session.agentId ?? '-'}`);
        console.log(`  Project: ${session.projectId}`);
        console.log(`  Source:  ${session.source}`);
        console.log(`  Turns:   ${session.totalTurns}`);
        console.log(`  Cost:    $${session.totalCostUsd.toFixed(4)}`);
        console.log(`  Created: ${new Date(session.createdAt).toLocaleString()}`);
        if (session.initialPrompt) {
            const preview = session.initialPrompt.length > 100
                ? session.initialPrompt.slice(0, 100) + '...'
                : session.initialPrompt;
            console.log(`  Prompt:  ${c.gray(preview)}`);
        }
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

async function stopSession(client: CorvidClient, id: string): Promise<void> {
    try {
        await client.post(`/api/sessions/${id}/stop`);
        console.log(`${c.green('✓')} Session ${id.slice(0, 8)} stopped`);
    } catch (err) {
        handleError(err);
    }
}

async function resumeSession(client: CorvidClient, id: string): Promise<void> {
    try {
        await client.post(`/api/sessions/${id}/resume`);
        console.log(`${c.green('✓')} Session ${id.slice(0, 8)} resumed`);
    } catch (err) {
        handleError(err);
    }
}

function formatStatus(status: string): string {
    switch (status) {
        case 'running': return c.green(status);
        case 'paused': return c.yellow(status);
        case 'stopped': return c.gray(status);
        case 'error': return c.red(status);
        default: return status;
    }
}

function handleError(err: unknown): void {
    const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : String(err);
    printError(message);
    process.exit(1);
}
