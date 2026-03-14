/**
 * Purge test/sample data from the database.
 *
 * Identifies rows matching common test-data patterns (test, e2e, sample,
 * dummy, lorem, temp) and deletes them along with related child rows.
 * See #1013.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('PurgeTestData');

/**
 * Pattern fragments matched case-insensitively against name fields.
 * Each pattern is matched as a word boundary: name starts with the pattern,
 * or the pattern appears after a space/colon/hyphen. This avoids false
 * positives like "temp/worktree" in legitimate session names.
 */
const TEST_PATTERNS = ['test', 'e2e', 'sample', 'dummy', 'lorem'];

function buildLikeClause(column: string): string {
    // For each pattern, match: starts with it OR has it after a word boundary (space, colon, hyphen)
    return TEST_PATTERNS
        .flatMap(() => [`lower(${column}) LIKE ?`, `lower(${column}) LIKE ?`])
        .join(' OR ');
}

function likeParams(): string[] {
    return TEST_PATTERNS.flatMap((p) => [`${p}%`, `% ${p}%`]);
}

export interface PurgeResult {
    councils: number;
    councilLaunches: number;
    sessions: number;
    sessionMessages: number;
    dryRun: boolean;
}

/**
 * Find and delete test/sample data from the database.
 *
 * Deletion order respects foreign keys:
 *   1. session_messages for matched sessions
 *   2. sessions linked to matched councils (via council_launch_id)
 *   3. sessions matched by name
 *   4. council_launches for matched councils (cascade deletes logs + discussion messages)
 *   5. councils matched by name (cascade deletes council_members)
 */
export function purgeTestData(db: Database, options: { dryRun?: boolean } = {}): PurgeResult {
    const dryRun = options.dryRun ?? false;

    // Find test councils
    const councilWhere = buildLikeClause('name');
    const testCouncils = db
        .query(`SELECT id, name FROM councils WHERE ${councilWhere}`)
        .all(...likeParams()) as { id: string; name: string }[];

    // Find test sessions (by name or linked to test councils)
    const sessionWhere = buildLikeClause('name');
    const councilIds = testCouncils.map((c) => c.id);
    const councilPlaceholders = councilIds.map(() => '?').join(',') || "'__none__'";

    const testSessions = db
        .query(
            `SELECT id, name FROM sessions WHERE (${sessionWhere}) OR council_launch_id IN (
                SELECT id FROM council_launches WHERE council_id IN (${councilPlaceholders})
            )`
        )
        .all(...likeParams(), ...councilIds) as { id: string; name: string }[];

    const sessionIds = testSessions.map((s) => s.id);

    if (dryRun) {
        log.info('Dry run — would purge', {
            councils: testCouncils.length,
            sessions: testSessions.length,
        });
        for (const c of testCouncils) log.info(`  council: ${c.name}`);
        for (const s of testSessions) log.info(`  session: ${s.name}`);
        return {
            councils: testCouncils.length,
            councilLaunches: 0,
            sessions: testSessions.length,
            sessionMessages: 0,
            dryRun: true,
        };
    }

    // Delete in FK-safe order inside a transaction
    const result = db.transaction(() => {
        let sessionMessages = 0;
        let sessions = 0;
        let councilLaunches = 0;
        let councils = 0;

        // 1. Delete session messages for matched sessions
        if (sessionIds.length > 0) {
            const ph = sessionIds.map(() => '?').join(',');
            const r = db.run(`DELETE FROM session_messages WHERE session_id IN (${ph})`, sessionIds);
            sessionMessages = r.changes;
        }

        // 2. Delete matched sessions
        if (sessionIds.length > 0) {
            const ph = sessionIds.map(() => '?').join(',');
            const r = db.run(`DELETE FROM sessions WHERE id IN (${ph})`, sessionIds);
            sessions = r.changes;
        }

        // 3. Delete council launches (cascade handles logs + discussion messages)
        if (councilIds.length > 0) {
            const ph = councilIds.map(() => '?').join(',');
            const r = db.run(`DELETE FROM council_launches WHERE council_id IN (${ph})`, councilIds);
            councilLaunches = r.changes;
        }

        // 4. Delete councils (cascade handles council_members)
        if (councilIds.length > 0) {
            const ph = councilIds.map(() => '?').join(',');
            const r = db.run(`DELETE FROM councils WHERE id IN (${ph})`, councilIds);
            councils = r.changes;
        }

        return { councils, councilLaunches, sessions, sessionMessages };
    })();

    log.info('Purge complete', result);
    return { ...result, dryRun: false };
}
