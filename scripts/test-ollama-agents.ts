#!/usr/bin/env bun
/**
 * Ollama Agent Capability Test Suite
 *
 * Runs a series of prompts against the local Qwen agent to evaluate
 * tool calling, reasoning, code comprehension, and council readiness.
 *
 * Uses a single persistent WebSocket to capture streaming events
 * (direct-mode sessions don't persist messages to the DB — only emit events).
 * Includes REST polling fallback for session completion detection.
 *
 * Usage: bun scripts/test-ollama-agents.ts
 * Output: scripts/ollama-test-results.md
 */

const API = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';
const AGENT_ID = 'e2cb4dfb-40c5-4a85-9c7d-afeb260f9c0a'; // Qwen Coder
const PROJECT_ID = '00028c43-3bc0-4c94-92f7-d5e88065e886'; // corvid-agent
const MAX_WAIT = 600_000; // 10 minutes absolute max per test
const INITIAL_TIMEOUT = 300_000; // 5 minutes for the first event (Ollama inference is slow)
const IDLE_TIMEOUT = 120_000; // 2 minutes of no activity after first event → timeout
const POLL_INTERVAL = 10_000; // Check session status every 10s
const OUTPUT_FILE = `${import.meta.dir}/ollama-test-results.md`;
const RESULTS_JSON = `${import.meta.dir}/test-results.json`;

// Append /no_think to disable Qwen3 extended thinking for faster responses
const NO_THINK = ' /no_think';

interface TestCase {
    id: string;
    tier: number;
    name: string;
    prompt: string;
    passCriteria: string;
}

const ALL_TESTS: TestCase[] = [
    // ── Tier 1: Basic Competence ────────────────────────────
    {
        id: 'T1.1',
        tier: 1,
        name: 'Tool calling accuracy',
        prompt: 'Read the file server/process/direct-process.ts and tell me what the MAX_TOOL_ITERATIONS constant is set to. Just give me the number.',
        passCriteria: 'Uses read_file tool, returns "25"',
    },
    {
        id: 'T1.2',
        tier: 1,
        name: 'Multi-step tool chain',
        prompt: 'List the files in server/algochat/ and then read the shortest one by filename length. Summarize what it does in 2-3 sentences.',
        passCriteria: 'Calls list_files then read_file on a real file, gives accurate summary',
    },
    {
        id: 'T1.3',
        tier: 1,
        name: 'Instruction following (messaging tool)',
        prompt: 'Use the corvid_list_agents tool to show me all available agents.',
        passCriteria: 'Calls corvid_list_agents and presents the results',
    },
    {
        id: 'T1.4',
        tier: 1,
        name: 'Not hallucinating',
        prompt: 'What database does this project use? Is there a PostgreSQL migration system? Answer based only on what you know about the project.',
        passCriteria: 'Says SQLite (bun:sqlite), says NO PostgreSQL. Does not invent features.',
    },
    // ── Tier 2: Reasoning Quality ───────────────────────────
    {
        id: 'T2.1',
        tier: 2,
        name: 'Code comprehension',
        prompt: 'Read server/process/direct-process.ts. What happens when a tool call execution fails (throws an error)? Trace the error path step by step.',
        passCriteria: 'Describes try/catch in tool execution, error message pushed to messages array, emitToolStatus called, loop continues',
    },
    {
        id: 'T2.2',
        tier: 2,
        name: 'Bug identification',
        prompt: 'Read this code and tell me if there\'s a problem:\n\nfunction processItems(items: string[]) {\n  const results = [];\n  for (let i = 0; i <= items.length; i++) {\n    results.push(items[i].toUpperCase());\n  }\n  return results;\n}',
        passCriteria: 'Identifies off-by-one error (<= should be <), explains undefined.toUpperCase() crash',
    },
    {
        id: 'T2.3',
        tier: 2,
        name: 'Architectural reasoning',
        prompt: 'Our Ollama provider serializes all requests through a single queue to prevent VRAM exhaustion. What are the trade-offs of this approach vs allowing parallel requests? Give concrete pros and cons.',
        passCriteria: 'Identifies: prevents OOM/VRAM crashes (pro), limits throughput/causes council latency (con), mentions possible solutions',
    },
    {
        id: 'T2.4',
        tier: 2,
        name: 'Code suggestion',
        prompt: 'Read server/algochat/subscription-manager.ts lines 555-600. Suggest one concrete improvement to the event handling logic. Be specific — reference actual code.',
        passCriteria: 'Reads the code, makes a specific actionable suggestion referencing real lines/functions',
    },
    // ── Tier 3: Council Readiness ───────────────────────────
    {
        id: 'T3.1',
        tier: 3,
        name: 'Critical evaluation',
        prompt: 'Another agent proposed: "We should add Redis for caching API responses in CorvidAgent." As a code reviewer, evaluate this proposal. Consider the current architecture.',
        passCriteria: 'Points out SQLite is already the DB, Redis adds operational complexity, suggests simpler alternatives',
    },
    {
        id: 'T3.2',
        tier: 3,
        name: 'Synthesis ability',
        prompt: 'Here are three opinions on adding WebSocket authentication:\n- Agent A: "Use JWT tokens in the connection URL query parameter"\n- Agent B: "Use a session cookie that the HTTP server sets on login"\n- Agent C: "The current approach of no auth on localhost is fine, just add auth for production"\n\nSynthesize these into a single recommendation with reasoning.',
        passCriteria: 'Weighs trade-offs of each, proposes concrete merged approach, doesn\'t just list them back',
    },
    {
        id: 'T3.3',
        tier: 3,
        name: 'Staying in role',
        prompt: 'You are in a council discussion about improving error handling. The previous speaker said: "We should wrap every function in try-catch and log the error." What\'s your response? Be direct.',
        passCriteria: 'Pushes back constructively — blanket try-catch hides bugs, advocates for targeted error boundaries',
    },
];

// Filter: run specific tests via CLI arg, or all tests if none specified
// Usage: bun scripts/test-ollama-agents.ts T2.3 T3.1
const filterIds = process.argv.slice(2);
const tests = filterIds.length > 0
    ? ALL_TESTS.filter(t => filterIds.includes(t.id))
    : ALL_TESTS;

// ── Helpers ─────────────────────────────────────────────────

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
}

interface Session {
    id: string;
    status: string;
    totalTurns: number;
}

interface CollectedResult {
    assistantTexts: string[];
    toolCalls: string[];
    status: 'completed' | 'timeout' | 'error';
    errorMsg?: string;
}

// ── Persistent WebSocket ────────────────────────────────────

type SessionListener = {
    assistantTexts: string[];
    toolCalls: string[];
    allEvents: string[]; // debug log of all event types
    resolve: (result: CollectedResult) => void;
    resolved: boolean;
    maxTimer: ReturnType<typeof setTimeout>;   // absolute max wall-clock
    idleTimer: ReturnType<typeof setTimeout>;   // resets on activity
    pollTimer: ReturnType<typeof setInterval>;
};

const listeners = new Map<string, SessionListener>();
let globalWs: WebSocket | null = null;

function connectWs(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            globalWs = ws;
            resolve(ws);
        };

        ws.onerror = () => {
            reject(new Error('WebSocket connection failed'));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data as string);

                if (msg.type === 'session_event') {
                    const sessionId = msg.sessionId;
                    const listener = listeners.get(sessionId);
                    if (!listener || listener.resolved) return;

                    const evt = msg.event;
                    const data = evt?.data as Record<string, unknown> | undefined;
                    if (!data) return;

                    const eventType = (data.type as string) ?? evt.eventType;
                    listener.allEvents.push(eventType);

                    // Activity detected — reset idle timer
                    if (eventType === 'tool_status' || eventType === 'assistant' || eventType === 'thinking') {
                        clearTimeout(listener.idleTimer);
                        listener.idleTimer = setTimeout(() => finishListener(sessionId, 'timeout'), IDLE_TIMEOUT);
                    }

                    // Collect assistant text
                    if (eventType === 'assistant' && data.message) {
                        const message = data.message as Record<string, unknown>;
                        const content = message.content;
                        if (typeof content === 'string' && content.trim()) {
                            listener.assistantTexts.push(content.trim());
                        } else if (Array.isArray(content)) {
                            for (const block of content) {
                                if ((block as Record<string, unknown>).type === 'text') {
                                    const text = (block as Record<string, unknown>).text as string;
                                    if (text?.trim()) listener.assistantTexts.push(text.trim());
                                }
                            }
                        }
                    }

                    // Collect tool calls
                    if (eventType === 'tool_status' && data.statusMessage) {
                        listener.toolCalls.push(data.statusMessage as string);
                    }

                    // Session completed
                    if (eventType === 'result' || eventType === 'session_exited') {
                        finishListener(sessionId, 'completed');
                    }

                    // Error
                    if (eventType === 'error') {
                        const error = data.error as Record<string, unknown> | undefined;
                        finishListener(sessionId, 'error', (error?.message as string) ?? 'unknown error');
                    }
                }
            } catch {
                // ignore parse errors
            }
        };

        ws.onclose = () => {
            globalWs = null;
            // Mark all active listeners as errored
            for (const [sessionId, listener] of listeners) {
                if (!listener.resolved) {
                    finishListener(sessionId, 'error', 'WebSocket closed unexpectedly');
                }
            }
        };
    });
}

function finishListener(sessionId: string, status: CollectedResult['status'], errorMsg?: string) {
    const listener = listeners.get(sessionId);
    if (!listener || listener.resolved) return;
    listener.resolved = true;
    clearTimeout(listener.maxTimer);
    clearTimeout(listener.idleTimer);
    clearInterval(listener.pollTimer);
    listener.resolve({
        assistantTexts: listener.assistantTexts,
        toolCalls: listener.toolCalls,
        status,
        errorMsg,
    });
}

/**
 * Register a listener and subscribe via WS BEFORE creating the session.
 * Returns a promise that resolves when the session completes or times out.
 */
function watchSession(sessionId: string): Promise<CollectedResult> {
    return new Promise((resolve) => {
        const listener: SessionListener = {
            assistantTexts: [],
            toolCalls: [],
            allEvents: [],
            resolve,
            resolved: false,
            maxTimer: setTimeout(() => finishListener(sessionId, 'timeout'), MAX_WAIT),
            idleTimer: setTimeout(() => finishListener(sessionId, 'timeout'), INITIAL_TIMEOUT),
            pollTimer: setInterval(async () => {
                // REST polling fallback: check if session completed or still active
                try {
                    const session = await api<Session>('GET', `/api/sessions/${sessionId}`);
                    if (session.status === 'idle' || session.status === 'error' || session.status === 'stopped') {
                        if (!listener.resolved) {
                            console.log(`    [poll] Session status: ${session.status}, turns: ${session.totalTurns}`);
                            finishListener(sessionId, session.status === 'error' ? 'error' : 'completed');
                        }
                    } else if (session.status === 'running') {
                        // Session is still active (Ollama is generating tokens).
                        // Reset the idle timer so we don't timeout while the model is working.
                        clearTimeout(listener.idleTimer);
                        listener.idleTimer = setTimeout(() => finishListener(sessionId, 'timeout'), IDLE_TIMEOUT);
                    }
                } catch {
                    // ignore poll errors
                }
            }, POLL_INTERVAL),
        };

        listeners.set(sessionId, listener);

        // Subscribe via existing WS
        if (globalWs?.readyState === WebSocket.OPEN) {
            globalWs.send(JSON.stringify({ type: 'subscribe', sessionId }));
        }
    });
}

// ── Main ────────────────────────────────────────────────────

async function main() {
    console.log('Ollama Agent Test Suite');
    console.log('======================\n');
    console.log(`Agent: Qwen Coder (${AGENT_ID.slice(0, 8)})`);
    console.log(`Model: qwen3:8b`);
    console.log(`Output: ${OUTPUT_FILE}\n`);

    // Verify server is reachable
    try {
        await api<unknown>('GET', '/api/agents');
    } catch {
        console.error('ERROR: Cannot reach server at ' + API);
        console.error('Make sure the server is running.');
        process.exit(1);
    }

    // Establish persistent WebSocket connection
    console.log('Connecting WebSocket...');
    await connectWs();
    console.log('WebSocket connected.\n');

    const results: Array<{
        test: TestCase;
        response: string;
        errorMsg?: string;
        toolCalls: string[];
        allEvents: string[];
        status: string;
        durationMs: number;
    }> = [];

    for (const test of tests) {
        console.log(`[${test.id}] ${test.name}...`);
        const startTime = Date.now();

        try {
            // Create session (starts processing immediately)
            const session = await api<Session>('POST', '/api/sessions', {
                projectId: PROJECT_ID,
                agentId: AGENT_ID,
                name: `Test: ${test.id} ${test.name}`,
                initialPrompt: test.prompt + NO_THINK,
            });

            console.log(`  Session: ${session.id.slice(0, 8)} (running)`);

            // Register listener and subscribe (WS already connected)
            const resultPromise = watchSession(session.id);

            // Wait for completion
            const result = await resultPromise;
            const durationMs = Date.now() - startTime;
            const response = result.assistantTexts.join('\n\n---\n\n');

            // Get listener debug info
            const listener = listeners.get(session.id);
            const allEvents = listener?.allEvents ?? [];

            const statusIcon = result.status === 'completed' ? '✓' : result.status === 'timeout' ? '⏱' : '✗';
            console.log(`  ${statusIcon} ${result.status} in ${(durationMs / 1000).toFixed(1)}s`);
            if (result.errorMsg) console.log(`    Error: ${result.errorMsg}`);
            console.log(`    ${result.assistantTexts.length} assistant response(s), ${result.toolCalls.length} tool call(s)`);
            console.log(`    Events received: [${allEvents.join(', ')}]`);
            if (response) {
                const preview = response.replace(/\n/g, ' ').slice(0, 120);
                console.log(`    Preview: ${preview}${response.length > 120 ? '...' : ''}`);
            }

            results.push({
                test,
                response: response || result.errorMsg || '',
                toolCalls: result.toolCalls,
                allEvents,
                status: result.status,
                errorMsg: result.errorMsg,
                durationMs,
            });

            // Kill session on timeout/error to free the Ollama concurrency slot.
            // Without this, the next test queues behind the stuck request.
            if (result.status !== 'completed') {
                try {
                    await api<unknown>('DELETE', `/api/sessions/${session.id}`);
                } catch {
                    // ignore — session may already be gone
                }
            }

            // Clean up listener
            listeners.delete(session.id);

            // Clean up session
            await api('DELETE', `/api/sessions/${session.id}`).catch(() => {});
        } catch (err) {
            const durationMs = Date.now() - startTime;
            const errMsg = err instanceof Error ? err.message : String(err);
            console.log(`  ✗ ERROR: ${errMsg}`);
            results.push({
                test,
                response: `ERROR: ${errMsg}`,
                toolCalls: [],
                allEvents: [],
                status: 'error',
                durationMs,
            });
        }

        // Write incremental results JSON for the dashboard
        await Bun.write(RESULTS_JSON, JSON.stringify(results.map(r => ({
            id: r.test.id, tier: r.test.tier, name: r.test.name,
            prompt: r.test.prompt, passCriteria: r.test.passCriteria,
            response: r.response, errorMsg: r.errorMsg, toolCalls: r.toolCalls,
            events: r.allEvents, status: r.status, durationMs: r.durationMs,
        })), null, 2));

        // Small delay between tests to let Ollama cool down
        if (test !== tests[tests.length - 1]) {
            await Bun.sleep(2000);
        }
    }

    // Close persistent WS
    globalWs?.close();

    // ── Generate report ──────────────────────────────────────

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const lines: string[] = [];

    lines.push(`# Ollama Agent Test Results`);
    lines.push(`**Date:** ${now}`);
    lines.push(`**Agent:** Qwen Coder (qwen3:8b)`);
    lines.push(`**Tests:** ${results.length}`);
    lines.push('');

    // Summary table
    lines.push('## Summary');
    lines.push('');
    lines.push('| ID | Test | Status | Time | Tools | Response |');
    lines.push('|----|------|--------|------|-------|----------|');
    for (const r of results) {
        const icon = r.status === 'completed' ? '✓' : r.status === 'timeout' ? '⏱' : '✗';
        const preview = r.response.replace(/\n/g, ' ').slice(0, 60);
        lines.push(`| ${r.test.id} | ${r.test.name} | ${icon} ${r.status} | ${(r.durationMs / 1000).toFixed(1)}s | ${r.toolCalls.length} | ${preview}${r.response.length > 60 ? '...' : ''} |`);
    }
    lines.push('');

    // Tier scoring
    for (const tier of [1, 2, 3]) {
        const tierResults = results.filter((r) => r.test.tier === tier);
        const completed = tierResults.filter((r) => r.status === 'completed').length;
        const total = tierResults.length;
        const tierName = tier === 1 ? 'Basic Competence' : tier === 2 ? 'Reasoning Quality' : 'Council Readiness';
        const required = tier === 1 ? `${total}/${total}` : tier === 2 ? '3/4' : '2/3';
        lines.push(`**Tier ${tier} (${tierName}):** ${completed}/${total} completed (need ${required} to pass)`);
    }
    lines.push('');

    // Detailed results
    lines.push('---');
    lines.push('');
    lines.push('## Detailed Results');
    lines.push('');

    for (const r of results) {
        lines.push(`### ${r.test.id}: ${r.test.name}`);
        lines.push(`**Tier:** ${r.test.tier} | **Status:** ${r.status} | **Time:** ${(r.durationMs / 1000).toFixed(1)}s`);
        lines.push('');
        lines.push('**Prompt:**');
        lines.push('```');
        lines.push(r.test.prompt);
        lines.push('```');
        lines.push('');
        lines.push('**Pass Criteria:**');
        lines.push(`> ${r.test.passCriteria}`);
        lines.push('');
        if (r.allEvents.length > 0) {
            lines.push(`**Events:** \`${r.allEvents.join(' → ')}\``);
            lines.push('');
        }
        if (r.toolCalls.length > 0) {
            lines.push('**Tool Calls:**');
            for (const tc of r.toolCalls) {
                lines.push(`- \`${tc}\``);
            }
            lines.push('');
        }
        lines.push('**Response:**');
        lines.push('```');
        lines.push(r.response || '(no response)');
        lines.push('```');
        lines.push('');
        lines.push('**Grade:** _TODO: manual review_');
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    // Write file
    await Bun.write(OUTPUT_FILE, lines.join('\n'));
    console.log(`\nResults written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
