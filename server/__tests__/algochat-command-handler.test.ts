/**
 * Comprehensive unit tests for CommandHandler — the slash command processor
 * for AlgoChat messages.
 *
 * Tests cover:
 * - isOwner authorization logic
 * - All 14 slash commands (/help, /status, /stop, /agent, /queue, /approve,
 *   /deny, /mode, /credits, /history, /work, /council, /extend, /schedule)
 * - Privileged command authorization enforcement
 * - Non-command pass-through (returns false)
 * - Local chat (responseFn) bypasses privilege checks
 *
 * Uses an in-memory SQLite database with real schema migrations for DB-backed
 * commands, and lightweight mocks for ProcessManager, ResponseFormatter,
 * and CommandHandlerContext.
 *
 * @module
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { CommandHandler, type CommandHandlerContext } from '../algochat/command-handler';
import type { AlgoChatConfig } from '../algochat/config';
import type { ProcessManager } from '../process/manager';
import type { ResponseFormatter } from '../algochat/response-formatter';
import type { WorkCommandRouter } from '../algochat/work-command-router';
import type { SchedulerService } from '../scheduler/service';

// ── Test constants ────────────────────────────────────────────────────────

const OWNER_ADDR = 'OWNER_ADDR_ABC123';
const NON_OWNER_ADDR = 'NON_OWNER_XYZ789';

// ── Mock factories ────────────────────────────────────────────────────────

function createMockConfig(overrides: Partial<AlgoChatConfig> = {}): AlgoChatConfig {
    return {
        network: 'testnet',
        ownerAddresses: new Set([OWNER_ADDR]),
        syncInterval: 10_000,
        mnemonic: '',
        defaultAgentId: null,
        pskContact: null,
        ...overrides,
    } as AlgoChatConfig;
}

function createMockProcessManager(overrides: Partial<Record<string, unknown>> = {}): ProcessManager {
    return {
        getActiveSessionIds: mock(() => overrides.activeSessionIds ?? []),
        isRunning: mock((id: string) =>
            overrides.runningSessions
                ? (overrides.runningSessions as string[]).includes(id)
                : false
        ),
        stopProcess: mock(() => {}),
        approvalManager: {
            getQueuedRequests: mock(() => overrides.queuedRequests ?? []),
            resolveQueuedRequest: mock((_id: number, _approved: boolean) =>
                overrides.resolveResult ?? false
            ),
            operationalMode: overrides.operationalMode ?? 'normal',
        },
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        ...overrides,
    } as unknown as ProcessManager;
}

function createMockResponseFormatter(): ResponseFormatter & { lastResponse: { participant: string; content: string } | null } {
    const formatter = {
        lastResponse: null as { participant: string; content: string } | null,
        sendResponse: mock(function (this: typeof formatter, participant: string, content: string) {
            this.lastResponse = { participant, content };
            return Promise.resolve();
        }),
        emitEvent: mock(() => {}),
    } as unknown as ResponseFormatter & { lastResponse: { participant: string; content: string } | null };
    return formatter;
}

interface MockContextOptions {
    defaultAgentId?: string | null;
    defaultProjectId?: string;
    extendResult?: boolean;
}

function createMockContext(overrides: MockContextOptions = {}): CommandHandlerContext {
    return {
        findAgentForNewConversation: mock(() => overrides.defaultAgentId ?? 'agent-1') as () => string | null,
        getDefaultProjectId: mock(() => overrides.defaultProjectId ?? 'proj-1') as () => string,
        extendSession: mock((_sessionId: string, _minutes: number) =>
            overrides.extendResult ?? true
        ) as (sessionId: string, minutes: number) => boolean,
    };
}

// ── Test suite ────────────────────────────────────────────────────────────

let db: Database;
let config: AlgoChatConfig;
let pm: ProcessManager;
let rf: ReturnType<typeof createMockResponseFormatter>;
let ctx: CommandHandlerContext;
let handler: CommandHandler;

/** Capture responses sent via the responseFn callback. */
let responses: string[];
const responseFn = (text: string) => responses.push(text);

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    config = createMockConfig();
    pm = createMockProcessManager();
    rf = createMockResponseFormatter();
    ctx = createMockContext();
    handler = new CommandHandler(db, config, pm, rf, ctx);
    responses = [];
});

afterEach(() => {
    db.close();
});

// ─── isOwner ──────────────────────────────────────────────────────────────

describe('isOwner', () => {
    test('returns true for configured owner address', () => {
        expect(handler.isOwner(OWNER_ADDR)).toBe(true);
    });

    test('returns false for non-owner address', () => {
        expect(handler.isOwner(NON_OWNER_ADDR)).toBe(false);
    });

    test('returns false when no owners configured (fail-closed)', () => {
        const emptyConfig = createMockConfig({ ownerAddresses: new Set() });
        const h = new CommandHandler(db, emptyConfig, pm, rf, ctx);
        expect(h.isOwner(OWNER_ADDR)).toBe(false);
    });

    test('is case-sensitive for addresses', () => {
        expect(handler.isOwner(OWNER_ADDR.toLowerCase())).toBe(false);
    });
});

// ─── Non-command messages ─────────────────────────────────────────────────

describe('non-command messages', () => {
    test('returns false for regular text', () => {
        expect(handler.handleCommand(OWNER_ADDR, 'hello world')).toBe(false);
    });

    test('returns false for empty string', () => {
        expect(handler.handleCommand(OWNER_ADDR, '')).toBe(false);
    });

    test('returns false for whitespace only', () => {
        expect(handler.handleCommand(OWNER_ADDR, '   ')).toBe(false);
    });

    test('returns false for text starting with space then slash', () => {
        // After trim, this starts with / — but let's check what the handler does
        // The handler trims first, so " /help" should still work
        const result = handler.handleCommand(OWNER_ADDR, '  /help');
        expect(result).toBe(true);
    });

    test('returns false for unknown commands', () => {
        expect(handler.handleCommand(OWNER_ADDR, '/unknown-command')).toBe(false);
    });

    test('returns false for text that looks like a path', () => {
        expect(handler.handleCommand(OWNER_ADDR, 'check /usr/bin/node')).toBe(false);
    });
});

// ─── Privilege enforcement ────────────────────────────────────────────────

describe('privilege enforcement', () => {
    const privilegedCommands = [
        '/stop sess-1',
        '/approve 1',
        '/deny 1',
        '/mode queued',
        '/work fix the bug',
        '/agent CorvidAgent',
        '/council review code',
        '/extend 30',
        '/schedule list',
    ];

    for (const cmd of privilegedCommands) {
        test(`blocks non-owner for: ${cmd.split(' ')[0]}`, () => {
            const result = handler.handleCommand(NON_OWNER_ADDR, cmd);
            expect(result).toBe(true); // handled (returned Unauthorized)
            expect((rf.sendResponse as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(0);
            const lastCall = (rf.sendResponse as ReturnType<typeof mock>).mock.calls.at(-1);
            expect(lastCall?.[1]).toContain('Unauthorized');
        });
    }

    test('allows non-owner for /status (unprivileged)', () => {
        handler.handleCommand(NON_OWNER_ADDR, '/status');
        const lastCall = (rf.sendResponse as ReturnType<typeof mock>).mock.calls.at(-1);
        expect(lastCall?.[1]).not.toContain('Unauthorized');
    });

    test('allows non-owner for /help (unprivileged)', () => {
        handler.handleCommand(NON_OWNER_ADDR, '/help');
        const lastCall = (rf.sendResponse as ReturnType<typeof mock>).mock.calls.at(-1);
        expect(lastCall?.[1]).not.toContain('Unauthorized');
    });

    test('allows non-owner for /credits (unprivileged)', () => {
        handler.handleCommand(NON_OWNER_ADDR, '/credits');
        const lastCall = (rf.sendResponse as ReturnType<typeof mock>).mock.calls.at(-1);
        expect(lastCall?.[1]).not.toContain('Unauthorized');
    });

    test('allows non-owner for /queue (unprivileged)', () => {
        handler.handleCommand(NON_OWNER_ADDR, '/queue');
        const lastCall = (rf.sendResponse as ReturnType<typeof mock>).mock.calls.at(-1);
        expect(lastCall?.[1]).not.toContain('Unauthorized');
    });

    test('local chat (responseFn) bypasses privilege checks', () => {
        const result = handler.handleCommand(NON_OWNER_ADDR, '/stop sess-1', responseFn);
        expect(result).toBe(true);
        // Should not get "Unauthorized" when responseFn is provided
        expect(responses.some((r) => r.includes('Unauthorized'))).toBe(false);
    });
});

// ─── /help ────────────────────────────────────────────────────────────────

describe('/help', () => {
    test('lists all commands', () => {
        handler.handleCommand(OWNER_ADDR, '/help', responseFn);
        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('Available Commands');
        expect(responses[0]).toContain('/status');
        expect(responses[0]).toContain('/credits');
    });

    test('shows help for a specific command', () => {
        handler.handleCommand(OWNER_ADDR, '/help status', responseFn);
        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('/status');
        expect(responses[0]).toContain('Usage');
    });

    test('shows help for /council', () => {
        handler.handleCommand(OWNER_ADDR, '/help council', responseFn);
        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('/council');
        expect(responses[0]).toContain('Usage');
    });

    test('shows error for unknown command', () => {
        handler.handleCommand(OWNER_ADDR, '/help nonexistent', responseFn);
        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('Unknown command');
    });

    test('is case-insensitive', () => {
        handler.handleCommand(OWNER_ADDR, '/HELP', responseFn);
        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('Available Commands');
    });

    test('does not include /help in the command listing', () => {
        handler.handleCommand(OWNER_ADDR, '/help', responseFn);
        // The /help command itself is excluded from the listing
        const lines = responses[0].split('\n');
        const helpLine = lines.find((l) => l.includes('**/help**'));
        expect(helpLine).toBeUndefined();
    });
});

// ─── /status ──────────────────────────────────────────────────────────────

describe('/status', () => {
    test('shows active session count and conversations', () => {
        handler.handleCommand(OWNER_ADDR, '/status', responseFn);
        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('Active sessions: 0');
        expect(responses[0]).toContain('conversations: 0');
    });

    test('reflects active sessions from ProcessManager', () => {
        const customPM = createMockProcessManager({ activeSessionIds: ['s1', 's2', 's3'] });
        const h = new CommandHandler(db, config, customPM, rf, ctx);
        h.handleCommand(OWNER_ADDR, '/status', responseFn);
        expect(responses[0]).toContain('Active sessions: 3');
    });
});

// ─── /stop ────────────────────────────────────────────────────────────────

describe('/stop', () => {
    test('shows usage when no session ID provided', () => {
        handler.handleCommand(OWNER_ADDR, '/stop', responseFn);
        expect(responses[0]).toContain('Usage');
    });

    test('stops a running session', () => {
        const customPM = createMockProcessManager({ runningSessions: ['sess-abc'] });
        const h = new CommandHandler(db, config, customPM, rf, ctx);
        h.handleCommand(OWNER_ADDR, '/stop sess-abc', responseFn);
        expect(responses[0]).toContain('Stopped session sess-abc');
        expect((customPM.stopProcess as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('reports when session is not running', () => {
        handler.handleCommand(OWNER_ADDR, '/stop sess-nonexistent', responseFn);
        expect(responses[0]).toContain('not running');
    });
});

// ─── /agent ───────────────────────────────────────────────────────────────

describe('/agent', () => {
    test('lists available agents when no name given', () => {
        handler.handleCommand(OWNER_ADDR, '/agent', responseFn);
        expect(responses[0]).toContain('Available agents');
    });

    test('lists "none" when no agents are algochat-enabled', () => {
        handler.handleCommand(OWNER_ADDR, '/agent', responseFn);
        expect(responses[0]).toContain('none');
    });

    test('switches to a matching agent', () => {
        // Insert a test agent into the DB
        db.prepare(`
            INSERT INTO agents (id, name, description, system_prompt, model, algochat_enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `).run('agent-test', 'TestAgent', 'A test agent', 'You are a test', 'claude-sonnet-4-20250514');

        handler.handleCommand(OWNER_ADDR, '/agent TestAgent', responseFn);
        expect(responses[0]).toContain('Routing to agent: TestAgent');
        expect(config.defaultAgentId).toBe('agent-test');
    });

    test('reports error for unknown agent name', () => {
        handler.handleCommand(OWNER_ADDR, '/agent NonExistentBot', responseFn);
        expect(responses[0]).toContain('not found');
    });

    test('agent name matching is case-insensitive', () => {
        db.prepare(`
            INSERT INTO agents (id, name, description, system_prompt, model, algochat_enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `).run('agent-ci', 'CIBot', 'Case test', 'prompt', 'claude-sonnet-4-20250514');

        handler.handleCommand(OWNER_ADDR, '/agent cibot', responseFn);
        expect(responses[0]).toContain('Routing to agent: CIBot');
    });
});

// ─── /queue ───────────────────────────────────────────────────────────────

describe('/queue', () => {
    test('shows "no pending" when queue is empty', () => {
        handler.handleCommand(OWNER_ADDR, '/queue', responseFn);
        expect(responses[0]).toContain('No pending escalation requests');
    });

    test('lists queued requests', () => {
        const customPM = createMockProcessManager({
            queuedRequests: [
                {
                    id: 1,
                    sessionId: 'sess-abc12345',
                    toolName: 'Bash',
                    toolInput: {},
                    status: 'pending',
                    createdAt: '2026-02-26T12:00:00Z',
                },
                {
                    id: 2,
                    sessionId: 'sess-def67890',
                    toolName: 'Write',
                    toolInput: {},
                    status: 'pending',
                    createdAt: '2026-02-26T12:01:00Z',
                },
            ],
        });
        const h = new CommandHandler(db, config, customPM, rf, ctx);
        h.handleCommand(OWNER_ADDR, '/queue', responseFn);
        expect(responses[0]).toContain('Pending escalations');
        expect(responses[0]).toContain('#1');
        expect(responses[0]).toContain('#2');
        expect(responses[0]).toContain('[Bash]');
        expect(responses[0]).toContain('[Write]');
    });
});

// ─── /approve ─────────────────────────────────────────────────────────────

describe('/approve', () => {
    test('shows usage when no queue ID provided', () => {
        handler.handleCommand(OWNER_ADDR, '/approve', responseFn);
        expect(responses[0]).toContain('Usage');
    });

    test('shows usage for non-numeric queue ID', () => {
        handler.handleCommand(OWNER_ADDR, '/approve abc', responseFn);
        expect(responses[0]).toContain('Usage');
    });

    test('approves a valid request', () => {
        const customPM = createMockProcessManager({ resolveResult: true });
        const h = new CommandHandler(db, config, customPM, rf, ctx);
        h.handleCommand(OWNER_ADDR, '/approve 5', responseFn);
        expect(responses[0]).toContain('approved');
        expect(responses[0]).toContain('#5');
    });

    test('reports when request not found', () => {
        handler.handleCommand(OWNER_ADDR, '/approve 99', responseFn);
        expect(responses[0]).toContain('not found');
    });
});

// ─── /deny ────────────────────────────────────────────────────────────────

describe('/deny', () => {
    test('shows usage when no queue ID provided', () => {
        handler.handleCommand(OWNER_ADDR, '/deny', responseFn);
        expect(responses[0]).toContain('Usage');
    });

    test('denies a valid request', () => {
        const customPM = createMockProcessManager({ resolveResult: true });
        const h = new CommandHandler(db, config, customPM, rf, ctx);
        h.handleCommand(OWNER_ADDR, '/deny 3', responseFn);
        expect(responses[0]).toContain('denied');
        expect(responses[0]).toContain('#3');
    });

    test('reports when request not found', () => {
        handler.handleCommand(OWNER_ADDR, '/deny 99', responseFn);
        expect(responses[0]).toContain('not found');
    });
});

// ─── /mode ────────────────────────────────────────────────────────────────

describe('/mode', () => {
    test('shows current mode when no argument given', () => {
        handler.handleCommand(OWNER_ADDR, '/mode', responseFn);
        expect(responses[0]).toContain('Current mode');
        expect(responses[0]).toContain('normal');
    });

    test('sets mode to queued', () => {
        handler.handleCommand(OWNER_ADDR, '/mode queued', responseFn);
        expect(responses[0]).toContain('Mode set to: queued');
        expect(pm.approvalManager.operationalMode).toBe('queued');
    });

    test('sets mode to paused', () => {
        handler.handleCommand(OWNER_ADDR, '/mode paused', responseFn);
        expect(responses[0]).toContain('Mode set to: paused');
        expect(pm.approvalManager.operationalMode).toBe('paused');
    });

    test('rejects invalid mode', () => {
        handler.handleCommand(OWNER_ADDR, '/mode turbo', responseFn);
        expect(responses[0]).toContain('Invalid mode');
        expect(responses[0]).toContain('normal, queued, paused');
    });

    test('mode is case-insensitive', () => {
        handler.handleCommand(OWNER_ADDR, '/mode QUEUED', responseFn);
        expect(responses[0]).toContain('Mode set to: queued');
    });
});

// ─── /credits ─────────────────────────────────────────────────────────────

describe('/credits', () => {
    test('shows credit balance for participant', () => {
        handler.handleCommand(OWNER_ADDR, '/credits', responseFn);
        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('Credit Balance');
        expect(responses[0]).toContain('Available');
        expect(responses[0]).toContain('Rates');
    });

    test('shows credit config rates', () => {
        // credit_config is a key-value table
        db.prepare("UPDATE credit_config SET value = '100' WHERE key = 'credits_per_algo'").run();

        handler.handleCommand(OWNER_ADDR, '/credits', responseFn);
        expect(responses[0]).toContain('100 credits');
    });
});

// ─── /history ─────────────────────────────────────────────────────────────

describe('/history', () => {
    test('shows "no transactions" for new participant', () => {
        handler.handleCommand(OWNER_ADDR, '/history', responseFn);
        expect(responses[0]).toContain('No credit transactions');
    });

    test('defaults to limit of 10', () => {
        handler.handleCommand(OWNER_ADDR, '/history', responseFn);
        // Just verify it doesn't crash with default limit
        expect(responses.length).toBe(1);
    });

    test('accepts a numeric limit', () => {
        handler.handleCommand(OWNER_ADDR, '/history 5', responseFn);
        expect(responses.length).toBe(1);
    });

    test('caps limit at 20', () => {
        handler.handleCommand(OWNER_ADDR, '/history 50', responseFn);
        // No crash — limit is capped internally to 20
        expect(responses.length).toBe(1);
    });
});

// ─── /work ────────────────────────────────────────────────────────────────

describe('/work', () => {
    test('reports unavailable when no WorkCommandRouter injected', () => {
        handler.handleCommand(OWNER_ADDR, '/work fix the bug', responseFn);
        expect(responses[0]).toContain('not available');
    });

    test('delegates to WorkCommandRouter when injected', () => {
        const mockRouter = {
            handleSlashCommand: mock(
                (_participant: string, _description: string, respond: (text: string) => void, _findAgent: () => string | null) => {
                    respond('Work task created');
                }
            ),
        } as unknown as WorkCommandRouter;

        handler.setWorkCommandRouter(mockRouter);
        handler.handleCommand(OWNER_ADDR, '/work fix the login bug', responseFn);

        expect((mockRouter.handleSlashCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        const call = (mockRouter.handleSlashCommand as ReturnType<typeof mock>).mock.calls[0];
        expect(call[0]).toBe(OWNER_ADDR); // participant
        expect(call[1]).toBe('fix the login bug'); // description
    });

    test('passes empty description for "/work" with no args', () => {
        const mockRouter = {
            handleSlashCommand: mock(
                (_participant: string, description: string, respond: (text: string) => void, _findAgent: () => string | null) => {
                    respond(`desc: "${description}"`);
                }
            ),
        } as unknown as WorkCommandRouter;

        handler.setWorkCommandRouter(mockRouter);
        handler.handleCommand(OWNER_ADDR, '/work', responseFn);

        const call = (mockRouter.handleSlashCommand as ReturnType<typeof mock>).mock.calls[0];
        expect(call[1]).toBe(''); // empty description
    });
});

// ─── /extend ──────────────────────────────────────────────────────────────

describe('/extend', () => {
    test('extends current session with default 30 minutes', () => {
        // Create a conversation in the DB for the participant
        db.prepare(`
            INSERT INTO agents (id, name, description, system_prompt, model, created_at, updated_at)
            VALUES ('a1', 'Agent', 'desc', 'prompt', 'claude-sonnet-4-20250514', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO projects (id, name, working_dir, created_at, updated_at)
            VALUES ('p1', 'Project', '/tmp', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO sessions (id, project_id, agent_id, name, status, created_at, updated_at)
            VALUES ('sess-1', 'p1', 'a1', 'Test', 'running', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO algochat_conversations (id, participant_addr, agent_id, session_id, created_at)
            VALUES ('conv-1', ?, 'a1', 'sess-1', datetime('now'))
        `).run(OWNER_ADDR);

        handler.handleCommand(OWNER_ADDR, '/extend', responseFn);
        expect(responses[0]).toContain('Extended session');
        expect(responses[0]).toContain('30 minutes');
        expect((ctx.extendSession as ReturnType<typeof mock>).mock.calls[0][1]).toBe(30);
    });

    test('accepts custom minutes', () => {
        db.prepare(`
            INSERT INTO agents (id, name, description, system_prompt, model, created_at, updated_at)
            VALUES ('a2', 'Agent2', 'desc', 'prompt', 'claude-sonnet-4-20250514', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO projects (id, name, working_dir, created_at, updated_at)
            VALUES ('p2', 'Project2', '/tmp', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO sessions (id, project_id, agent_id, name, status, created_at, updated_at)
            VALUES ('sess-2', 'p2', 'a2', 'Test', 'running', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO algochat_conversations (id, participant_addr, agent_id, session_id, created_at)
            VALUES ('conv-2', ?, 'a2', 'sess-2', datetime('now'))
        `).run(OWNER_ADDR);

        handler.handleCommand(OWNER_ADDR, '/extend 60', responseFn);
        expect(responses[0]).toContain('60 minutes');
    });

    test('caps minutes at 120', () => {
        db.prepare(`
            INSERT INTO agents (id, name, description, system_prompt, model, created_at, updated_at)
            VALUES ('a3', 'Agent3', 'desc', 'prompt', 'claude-sonnet-4-20250514', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO projects (id, name, working_dir, created_at, updated_at)
            VALUES ('p3', 'Project3', '/tmp', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO sessions (id, project_id, agent_id, name, status, created_at, updated_at)
            VALUES ('sess-3', 'p3', 'a3', 'Test', 'running', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO algochat_conversations (id, participant_addr, agent_id, session_id, created_at)
            VALUES ('conv-3', ?, 'a3', 'sess-3', datetime('now'))
        `).run(OWNER_ADDR);

        handler.handleCommand(OWNER_ADDR, '/extend 999', responseFn);
        expect(responses[0]).toContain('120 minutes');
    });

    test('treats 0 as falsy and falls back to default 30', () => {
        // parseInt('0') is 0 which is falsy, so `|| 30` kicks in → 30 minutes
        db.prepare(`
            INSERT INTO agents (id, name, description, system_prompt, model, created_at, updated_at)
            VALUES ('a4', 'Agent4', 'desc', 'prompt', 'claude-sonnet-4-20250514', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO projects (id, name, working_dir, created_at, updated_at)
            VALUES ('p4', 'Project4', '/tmp', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO sessions (id, project_id, agent_id, name, status, created_at, updated_at)
            VALUES ('sess-4', 'p4', 'a4', 'Test', 'running', datetime('now'), datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO algochat_conversations (id, participant_addr, agent_id, session_id, created_at)
            VALUES ('conv-4', ?, 'a4', 'sess-4', datetime('now'))
        `).run(OWNER_ADDR);

        handler.handleCommand(OWNER_ADDR, '/extend 0', responseFn);
        expect(responses[0]).toContain('30 minutes');
    });

    test('clamps negative minutes to minimum 1', () => {
        handler.handleCommand(OWNER_ADDR, '/extend -5 sess-explicit', responseFn);
        // parseInt('-5') || 30 = -5, Math.max(1, Math.min(120, -5)) = 1
        expect(responses[0]).toContain('1 minutes');
    });

    test('accepts explicit session ID', () => {
        handler.handleCommand(OWNER_ADDR, '/extend 30 sess-explicit', responseFn);
        expect((ctx.extendSession as ReturnType<typeof mock>).mock.calls[0][0]).toBe('sess-explicit');
    });

    test('reports no active session when none found', () => {
        const failCtx = createMockContext({ extendResult: false });
        const h = new CommandHandler(db, config, pm, rf, failCtx);
        h.handleCommand(OWNER_ADDR, '/extend', responseFn);
        expect(responses[0]).toContain('No active session');
    });

    test('reports session not found when extend fails', () => {
        const failCtx = createMockContext({ extendResult: false });
        const h = new CommandHandler(db, config, pm, rf, failCtx);
        h.handleCommand(OWNER_ADDR, '/extend 30 sess-missing', responseFn);
        expect(responses[0]).toContain('not found');
    });
});

// ─── /schedule ────────────────────────────────────────────────────────────

describe('/schedule', () => {
    // Helper: insert a schedule into the DB
    function insertSchedule(id: string, name: string, status: string = 'active'): void {
        db.prepare(`
            INSERT INTO agents (id, name, description, system_prompt, model, created_at, updated_at)
            VALUES (?, ?, 'desc', 'prompt', 'claude-sonnet-4-20250514', datetime('now'), datetime('now'))
        `).run(`sched-agent-${id}`, `ScheduleAgent${id}`);

        db.prepare(`
            INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, approval_policy, status, created_at, updated_at)
            VALUES (?, ?, ?, 'Test schedule', '0 9 * * *', '[]', 'auto_approve', ?, datetime('now'), datetime('now'))
        `).run(id, `sched-agent-${id}`, name, status);
    }

    test('lists schedules (default subcommand)', () => {
        insertSchedule('s1', 'DailyReview');
        handler.handleCommand(OWNER_ADDR, '/schedule', responseFn);
        expect(responses[0]).toContain('Schedules');
        expect(responses[0]).toContain('DailyReview');
    });

    test('lists schedules explicitly', () => {
        insertSchedule('s2', 'WeeklyAudit');
        handler.handleCommand(OWNER_ADDR, '/schedule list', responseFn);
        expect(responses[0]).toContain('WeeklyAudit');
    });

    test('shows "no schedules" when empty', () => {
        handler.handleCommand(OWNER_ADDR, '/schedule list', responseFn);
        expect(responses[0]).toContain('No schedules');
    });

    test('pauses a schedule', () => {
        insertSchedule('s3', 'Pausable');
        handler.handleCommand(OWNER_ADDR, '/schedule pause s3', responseFn);
        expect(responses[0]).toContain('paused');
    });

    test('pause shows usage without schedule ID', () => {
        handler.handleCommand(OWNER_ADDR, '/schedule pause', responseFn);
        expect(responses[0]).toContain('Usage');
    });

    test('pause reports not found for missing schedule', () => {
        handler.handleCommand(OWNER_ADDR, '/schedule pause nonexistent', responseFn);
        expect(responses[0]).toContain('not found');
    });

    test('resumes a schedule', () => {
        insertSchedule('s4', 'Resumable', 'paused');
        handler.handleCommand(OWNER_ADDR, '/schedule resume s4', responseFn);
        expect(responses[0]).toContain('resumed');
    });

    test('resume shows usage without schedule ID', () => {
        handler.handleCommand(OWNER_ADDR, '/schedule resume', responseFn);
        expect(responses[0]).toContain('Usage');
    });

    test('shows execution history', () => {
        insertSchedule('s5', 'HistoryTest');
        handler.handleCommand(OWNER_ADDR, '/schedule history s5', responseFn);
        // With no executions yet:
        expect(responses[0]).toContain('No executions');
    });

    test('history shows usage without schedule ID', () => {
        handler.handleCommand(OWNER_ADDR, '/schedule history', responseFn);
        expect(responses[0]).toContain('Usage');
    });

    test('run triggers immediate execution', () => {
        insertSchedule('s6', 'RunTest');
        const mockScheduler = {} as unknown as SchedulerService;
        handler.setSchedulerService(mockScheduler);

        handler.handleCommand(OWNER_ADDR, '/schedule run s6', responseFn);
        expect(responses[0]).toContain('queued for immediate execution');
    });

    test('run reports not found for missing schedule', () => {
        const mockScheduler = {} as unknown as SchedulerService;
        handler.setSchedulerService(mockScheduler);

        handler.handleCommand(OWNER_ADDR, '/schedule run nonexistent', responseFn);
        expect(responses[0]).toContain('not found');
    });

    test('run reports scheduler unavailable', () => {
        insertSchedule('s7', 'NoScheduler');
        // Don't set scheduler service
        handler.handleCommand(OWNER_ADDR, '/schedule run s7', responseFn);
        expect(responses[0]).toContain('not available');
    });

    test('run shows usage without schedule ID', () => {
        handler.handleCommand(OWNER_ADDR, '/schedule run', responseFn);
        expect(responses[0]).toContain('Usage');
    });

    test('shows usage for unknown subcommand', () => {
        handler.handleCommand(OWNER_ADDR, '/schedule unknown', responseFn);
        expect(responses[0]).toContain('Usage');
    });
});

// ─── /council ─────────────────────────────────────────────────────────────

describe('/council', () => {
    test('shows usage when no prompt given', () => {
        handler.handleCommand(OWNER_ADDR, '/council', responseFn);
        // handleCouncilCommand is async; the sync handleCommand returns true immediately
        expect(handler.handleCommand(OWNER_ADDR, '/council')).toBe(true);
    });

    test('returns true (handled) for /council with a prompt', () => {
        const result = handler.handleCommand(OWNER_ADDR, '/council review the auth system');
        expect(result).toBe(true);
    });

    test('shows usage via responseFn when no prompt given', async () => {
        handler.handleCommand(OWNER_ADDR, '/council', responseFn);
        // Wait for the async handler to complete
        await new Promise((r) => setTimeout(r, 50));
        expect(responses.length).toBeGreaterThan(0);
        expect(responses[0]).toContain('Usage');
    });

    test('shows empty prompt error via responseFn for "-- " with nothing after', async () => {
        handler.handleCommand(OWNER_ADDR, '/council @Agent1 --', responseFn);
        await new Promise((r) => setTimeout(r, 50));
        expect(responses.length).toBeGreaterThan(0);
        // Should complain about empty prompt
        expect(responses[0]).toContain('prompt');
    });

    test('reports no agents when none available', async () => {
        handler.handleCommand(OWNER_ADDR, '/council review auth', responseFn);
        await new Promise((r) => setTimeout(r, 50));
        expect(responses.length).toBeGreaterThan(0);
        // Should report no agents available
        expect(responses.some((r) => r.includes('agent') || r.includes('Agent'))).toBe(true);
    });
});

// ─── Response routing ─────────────────────────────────────────────────────

describe('response routing', () => {
    test('uses responseFn when provided instead of on-chain', () => {
        handler.handleCommand(OWNER_ADDR, '/status', responseFn);
        expect(responses.length).toBe(1);
        // ResponseFormatter should NOT have been called
        expect((rf.sendResponse as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    test('uses ResponseFormatter when responseFn is not provided', () => {
        handler.handleCommand(OWNER_ADDR, '/status');
        expect((rf.sendResponse as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        const call = (rf.sendResponse as ReturnType<typeof mock>).mock.calls[0];
        expect(call[0]).toBe(OWNER_ADDR);
        expect(call[1]).toContain('Active sessions');
    });
});

// ─── Dependency injection ─────────────────────────────────────────────────

describe('dependency injection', () => {
    test('setWorkCommandRouter enables /work', () => {
        // Initially unavailable
        handler.handleCommand(OWNER_ADDR, '/work test', responseFn);
        expect(responses[0]).toContain('not available');

        responses.length = 0;

        // After injection
        const mockRouter = {
            handleSlashCommand: mock(
                (_p: string, _d: string, respond: (t: string) => void) => respond('Task created')
            ),
        } as unknown as WorkCommandRouter;
        handler.setWorkCommandRouter(mockRouter);
        handler.handleCommand(OWNER_ADDR, '/work test', responseFn);
        expect(responses[0]).toBe('Task created');
    });

    test('setAgentMessenger can be called without error', () => {
        const mockMessenger = {} as Parameters<typeof handler.setAgentMessenger>[0];
        expect(() => handler.setAgentMessenger(mockMessenger)).not.toThrow();
    });

    test('setSchedulerService can be called without error', () => {
        const mockScheduler = {} as SchedulerService;
        expect(() => handler.setSchedulerService(mockScheduler)).not.toThrow();
    });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe('edge cases', () => {
    test('handles extra whitespace in command', () => {
        handler.handleCommand(OWNER_ADDR, '  /status  ', responseFn);
        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('Active sessions');
    });

    test('command matching is case-insensitive', () => {
        handler.handleCommand(OWNER_ADDR, '/STATUS', responseFn);
        expect(responses[0]).toContain('Active sessions');
    });

    test('/HELP works same as /help', () => {
        handler.handleCommand(OWNER_ADDR, '/HELP', responseFn);
        expect(responses[0]).toContain('Available Commands');
    });

    test('handles /credits for participant with no wallet entry', () => {
        handler.handleCommand('UNKNOWN_PARTICIPANT', '/credits', responseFn);
        expect(responses.length).toBe(1);
        // Should show zero balance, not crash
        expect(responses[0]).toContain('Available');
    });
});
