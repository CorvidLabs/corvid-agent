/**
 * Server operations tool handlers.
 *
 * Provides `corvid_restart_server` — a safe, idempotent server restart tool that
 * prevents agent restart loops by tracking whether a restart has already been
 * performed in the current session.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers:ServerOps');

export async function handleRestartServer(
    ctx: McpToolContext,
    args: { reason?: string },
): Promise<CallToolResult> {
    const { db, sessionId } = ctx;

    if (!db || !sessionId) {
        return errorResult('corvid_restart_server requires an active session context.');
    }

    const row = db.query(
        'SELECT server_restart_initiated_at FROM sessions WHERE id = ?'
    ).get(sessionId) as { server_restart_initiated_at: string | null } | null;

    if (!row) {
        return errorResult('Session not found.');
    }

    if (row.server_restart_initiated_at) {
        // Restart already happened — clear the flag and confirm success
        db.query('UPDATE sessions SET server_restart_initiated_at = NULL WHERE id = ?').run(sessionId);
        log.info(`Post-restart confirmation for session ${sessionId}`, { initiatedAt: row.server_restart_initiated_at });
        return textResult(
            `✓ Server restart completed successfully.\n` +
            `The restart was initiated at ${row.server_restart_initiated_at} and the server is now running with updated code.\n` +
            `No further restart is needed — continue with your next task.`
        );
    }

    // First call — mark restart as initiated, then exit so launchd restarts the server
    const reason = args.reason ?? 'agent-requested restart';
    log.info('Server restart requested via corvid_restart_server', { sessionId, reason });

    db.query(
        `UPDATE sessions SET server_restart_initiated_at = datetime('now') WHERE id = ?`
    ).run(sessionId);

    // Defer the exit so the tool result is flushed to the client before the process dies
    setImmediate(() => {
        log.info('Exiting server for restart (exit code 75)', { reason });
        process.exit(75);
    });

    return textResult(
        `Server restart initiated (reason: ${reason}).\n` +
        `The server will restart momentarily. Your session will resume automatically after restart.\n` +
        `When you resume, call corvid_restart_server again (or check the conversation history) to confirm the restart completed.`
    );
}
