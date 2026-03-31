#!/usr/bin/env bun
/**
 * Ollama Cloud Model AlgoChat Reliability Benchmark
 *
 * Tests each Ollama cloud model against real corvid-agent tool schemas
 * and AlgoChat-specific workflows to determine which models are reliable
 * enough for junior agent duties.
 *
 * Usage:
 *   bun scripts/benchmark-ollama-cloud.ts
 *   bun scripts/benchmark-ollama-cloud.ts --models qwen3.5:cloud kimi-k2.5:cloud
 *   bun scripts/benchmark-ollama-cloud.ts --agent <id> --model <model>
 *
 * Output: docs/ollama-cloud-benchmark.md
 */

const API = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';
const OUTPUT_FILE = `${import.meta.dir}/../docs/ollama-cloud-benchmark.md`;
const MAX_WAIT = 300_000;        // 5-minute absolute max per test
const INITIAL_TIMEOUT = 120_000; // 2-minute first-event timeout
const IDLE_TIMEOUT = 90_000;     // 90s idle timeout after activity
const POLL_INTERVAL = 8_000;

// ── CLI args ─────────────────────────────────────────────────

const args = Bun.argv.slice(2);

/** Extract --flag value pairs */
function argValue(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
}

/** Extract all values after --flag until next -- */
function argValues(flag: string): string[] {
    const idx = args.indexOf(flag);
    if (idx < 0) return [];
    const values: string[] = [];
    for (let i = idx + 1; i < args.length; i++) {
        if (args[i].startsWith('--')) break;
        values.push(args[i]);
    }
    return values;
}

// ── Model configuration ──────────────────────────────────────

interface ModelConfig {
    model: string;
    displayName: string;
    tier: number;
    supportsThinking: boolean;
    textBasedTools: boolean;  // uses prompt-injected tool schema vs native tools API
    contextK: number;
    role: string;  // current or candidate role
}

const DEFAULT_MODELS: ModelConfig[] = [
    {
        model: 'qwen3.5:cloud',
        displayName: 'Qwen 3.5 397B',
        tier: 1,
        supportsThinking: true,
        textBasedTools: true,
        contextK: 64,
        role: 'Starling (current)',
    },
    {
        model: 'kimi-k2.5:cloud',
        displayName: 'Kimi K2.5',
        tier: 2,
        supportsThinking: true,
        textBasedTools: true,
        contextK: 128,
        role: 'Merlin (current)',
    },
    {
        model: 'nemotron-3-super:cloud',
        displayName: 'Nemotron 3 Super',
        tier: 2,
        supportsThinking: false,
        textBasedTools: true,
        contextK: 128,
        role: 'Condor (current)',
    },
    {
        model: 'llama3.3',
        displayName: 'Llama 3.3 70B',
        tier: 3,
        supportsThinking: false,
        textBasedTools: false,
        contextK: 128,
        role: 'Alternative candidate',
    },
    {
        model: 'deepseek-v3.2:cloud',
        displayName: 'DeepSeek V3.2 671B',
        tier: 1,
        supportsThinking: true,
        textBasedTools: true,
        contextK: 64,
        role: 'Alternative candidate',
    },
];

// If --models flag given, filter to those model names
const modelFilter = argValues('--models');
const MODELS = modelFilter.length > 0
    ? DEFAULT_MODELS.filter((m) => modelFilter.includes(m.model))
    : DEFAULT_MODELS;

// ── Real tool schemas (from corvid-agent MCP tools) ──────────

const CORVID_TOOL_SCHEMAS = {
    corvid_send_message: {
        name: 'corvid_send_message',
        description: 'Send a message to another agent or channel via AlgoChat or Discord.',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Agent ID, wallet address, or channel name' },
                message: { type: 'string', description: 'Message text to send' },
                channel: { type: 'string', enum: ['algochat', 'discord'], description: 'Channel to send on' },
            },
            required: ['to', 'message'],
        },
    },
    corvid_recall_memory: {
        name: 'corvid_recall_memory',
        description: 'Recall a memory by key or search query from the agent memory store.',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Exact memory key to retrieve' },
                query: { type: 'string', description: 'Semantic search query for fuzzy lookup' },
            },
        },
    },
    corvid_list_work_tasks: {
        name: 'corvid_list_work_tasks',
        description: 'List active or recent work tasks for a project.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID to list tasks for' },
                status: { type: 'string', enum: ['active', 'queued', 'completed', 'failed'], description: 'Filter by task status' },
                limit: { type: 'number', description: 'Max number of tasks to return (default 10)' },
            },
        },
    },
    corvid_save_memory: {
        name: 'corvid_save_memory',
        description: 'Save a new memory or update an existing one.',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Unique key for this memory' },
                content: { type: 'string', description: 'Memory content to store' },
                type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'], description: 'Memory category' },
            },
            required: ['key', 'content'],
        },
    },
};

// ── Test scenarios ────────────────────────────────────────────

interface ScenarioResult {
    scenario: string;
    passed: boolean;
    firstAttempt: boolean;
    durationMs: number;
    toolCallsAttempted: string[];
    toolCallsCorrect: number;
    responseText: string;
    notes: string;
}

interface TestScenario {
    id: string;
    name: string;
    description: string;
    prompt: string;
    /** Tools the model should call, in order */
    expectedTools: string[];
    /** Evaluate the collected result */
    evaluate(result: CollectedResult): { passed: boolean; notes: string };
}

const ALGOCHAT_SCENARIOS: TestScenario[] = [
    {
        id: 'S1',
        name: 'AlgoChat message handling',
        description: 'Receive a message, parse sender, compose and send a text reply using corvid_send_message',
        prompt: [
            'You received this AlgoChat message from agent "rook" (ID: rook-agent-id):',
            '"Hey, can you confirm you received the deployment update?"',
            '',
            'Reply to rook using the corvid_send_message tool to confirm you got the message.',
            'Use to: "rook-agent-id" and channel: "algochat".',
        ].join('\n'),
        expectedTools: ['corvid_send_message'],
        evaluate(result) {
            const hasToolCall = result.toolCalls.some((t) =>
                t.toLowerCase().includes('corvid_send_message') ||
                t.toLowerCase().includes('send_message'),
            );
            const textMentionsTool = result.assistantTexts.some((t) =>
                t.includes('corvid_send_message') || t.includes('"to"') || t.includes('"message"'),
            );
            const passed = hasToolCall || textMentionsTool;
            return {
                passed,
                notes: passed
                    ? 'Correctly invoked send_message'
                    : 'Did not call corvid_send_message',
            };
        },
    },
    {
        id: 'S2',
        name: 'Single tool call — memory recall',
        description: 'Use corvid_recall_memory to look up information and respond with results',
        prompt: [
            'Use the corvid_recall_memory tool with key "team-agents-alpha" to look up the Team Alpha roster.',
            'Report back what you find.',
        ].join('\n'),
        expectedTools: ['corvid_recall_memory'],
        evaluate(result) {
            const hasToolCall = result.toolCalls.some((t) =>
                t.toLowerCase().includes('recall_memory') || t.toLowerCase().includes('corvid_recall'),
            );
            const textMentionsTool = result.assistantTexts.some((t) =>
                t.includes('corvid_recall_memory') || t.includes('"key"') || t.includes('team-agents-alpha'),
            );
            const passed = hasToolCall || textMentionsTool;
            return {
                passed,
                notes: passed
                    ? 'Correctly invoked recall_memory with key param'
                    : 'Did not call corvid_recall_memory',
            };
        },
    },
    {
        id: 'S3',
        name: 'Multi-tool sequence',
        description: 'Receive instruction, use 2+ tools in sequence (recall memory then send message)',
        prompt: [
            'Two steps:',
            '1. Use corvid_recall_memory with key "rules-operational" to look up the operational rules.',
            '2. After retrieving them, use corvid_send_message to send a summary to agent "leif-agent-id" via algochat.',
            '',
            'Complete both steps in order.',
        ].join('\n'),
        expectedTools: ['corvid_recall_memory', 'corvid_send_message'],
        evaluate(result) {
            const hasRecall = result.toolCalls.some((t) =>
                t.toLowerCase().includes('recall_memory'),
            ) || result.assistantTexts.some((t) => t.includes('corvid_recall_memory'));
            const hasSend = result.toolCalls.some((t) =>
                t.toLowerCase().includes('send_message'),
            ) || result.assistantTexts.some((t) => t.includes('corvid_send_message'));
            const passed = hasRecall && hasSend;
            return {
                passed,
                notes: passed
                    ? 'Both tools called in sequence'
                    : `Missing: ${!hasRecall ? 'recall_memory ' : ''}${!hasSend ? 'send_message' : ''}`.trim(),
            };
        },
    },
    {
        id: 'S4',
        name: 'Task management query',
        description: 'Use corvid_list_work_tasks to check status and report back concisely',
        prompt: [
            'Use corvid_list_work_tasks to check for any active work tasks.',
            'Set status to "active" and limit to 5.',
            'Report what you find — if there are no active tasks, say so clearly.',
        ].join('\n'),
        expectedTools: ['corvid_list_work_tasks'],
        evaluate(result) {
            const hasToolCall = result.toolCalls.some((t) =>
                t.toLowerCase().includes('list_work_tasks') || t.toLowerCase().includes('work_tasks'),
            ) || result.assistantTexts.some((t) => t.includes('corvid_list_work_tasks'));
            return {
                passed: hasToolCall,
                notes: hasToolCall
                    ? 'Correctly called list_work_tasks'
                    : 'Did not call corvid_list_work_tasks',
            };
        },
    },
];

// ── HTTP + WebSocket helpers ──────────────────────────────────

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
    return res.json() as Promise<T>;
}

interface Session {
    id: string;
    status: string;
    totalTurns?: number;
}

interface Agent {
    id: string;
    name: string;
    model: string;
}

interface CollectedResult {
    assistantTexts: string[];
    toolCalls: string[];
    allEvents: string[];
    status: 'completed' | 'timeout' | 'error';
    errorMsg?: string;
}

interface SessionListener {
    assistantTexts: string[];
    toolCalls: string[];
    allEvents: string[];
    resolve: (r: CollectedResult) => void;
    resolved: boolean;
    maxTimer: ReturnType<typeof setTimeout>;
    idleTimer: ReturnType<typeof setTimeout>;
    pollTimer: ReturnType<typeof setInterval>;
}

const listeners = new Map<string, SessionListener>();
let globalWs: WebSocket | null = null;

function connectWs(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        ws.onopen = () => { globalWs = ws; resolve(ws); };
        ws.onerror = () => reject(new Error('WebSocket connection failed'));
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data as string);
                if (msg.type !== 'session_event') return;
                const sessionId = msg.sessionId as string;
                const listener = listeners.get(sessionId);
                if (!listener || listener.resolved) return;
                const evt = msg.event;
                const data = evt?.data as Record<string, unknown> | undefined;
                if (!data) return;
                const eventType = (data.type as string) ?? evt.eventType;
                listener.allEvents.push(eventType);
                if (['tool_status', 'assistant', 'thinking'].includes(eventType)) {
                    clearTimeout(listener.idleTimer);
                    listener.idleTimer = setTimeout(() => finishListener(sessionId, 'timeout'), IDLE_TIMEOUT);
                }
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
                if (eventType === 'tool_status' && data.statusMessage) {
                    listener.toolCalls.push(data.statusMessage as string);
                }
                if (eventType === 'result' || eventType === 'session_exited') {
                    finishListener(sessionId, 'completed');
                }
                if (eventType === 'error') {
                    const error = data.error as Record<string, unknown> | undefined;
                    finishListener(sessionId, 'error', (error?.message as string) ?? 'unknown error');
                }
            } catch { /* ignore parse errors */ }
        };
        ws.onclose = () => {
            globalWs = null;
            for (const [sid, l] of listeners) {
                if (!l.resolved) finishListener(sid, 'error', 'WebSocket closed unexpectedly');
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
    listener.resolve({ assistantTexts: listener.assistantTexts, toolCalls: listener.toolCalls, allEvents: listener.allEvents, status, errorMsg });
}

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
                try {
                    const session = await api<Session>('GET', `/api/sessions/${sessionId}`);
                    if (['idle', 'error', 'stopped'].includes(session.status)) {
                        if (!listener.resolved) finishListener(sessionId, session.status === 'error' ? 'error' : 'completed');
                    } else if (session.status === 'running') {
                        clearTimeout(listener.idleTimer);
                        listener.idleTimer = setTimeout(() => finishListener(sessionId, 'timeout'), IDLE_TIMEOUT);
                    }
                } catch { /* ignore */ }
            }, POLL_INTERVAL),
        };
        listeners.set(sessionId, listener);
        if (globalWs?.readyState === WebSocket.OPEN) {
            globalWs.send(JSON.stringify({ type: 'subscribe', sessionId }));
        }
    });
}

// ── Agent resolution ──────────────────────────────────────────

/**
 * Find an agent using the specified model, or create a temporary one for testing.
 * Prefers an existing agent to avoid orphans.
 */
async function resolveAgentForModel(model: string): Promise<Agent | null> {
    try {
        const agents = await api<Agent[]>('GET', '/api/agents');
        const match = agents.find((a) => a.model === model);
        if (match) return match;

        // Try a broadened search — model prefix match
        const base = model.replace(/:cloud$/, '').replace(/-cloud$/, '');
        const prefix = agents.find((a) => a.model.startsWith(base));
        if (prefix) return prefix;

        return null;
    } catch {
        return null;
    }
}

// ── Tool schema injection ─────────────────────────────────────

/**
 * Build a system prompt addendum that describes our tool schemas.
 * Used for TEXT_BASED_TOOL models where tools must be described in the prompt.
 */
function buildToolSchemaPrompt(): string {
    const tools = Object.values(CORVID_TOOL_SCHEMAS);
    const lines: string[] = [
        'You have access to the following tools. Call them by outputting JSON in this format:',
        '```json',
        '{"tool": "<tool_name>", "args": {<arguments>}}',
        '```',
        '',
        'Available tools:',
        '',
    ];
    for (const tool of tools) {
        lines.push(`### ${tool.name}`);
        lines.push(tool.description);
        const props = tool.inputSchema.properties;
        const required = (tool.inputSchema as { required?: string[] }).required ?? [];
        for (const [propName, propDef] of Object.entries(props)) {
            const req = required.includes(propName) ? ' (required)' : '';
            const def = propDef as { type: string; description: string; enum?: string[] };
            const enumNote = def.enum ? ` [${def.enum.join('|')}]` : '';
            lines.push(`- **${propName}**${req}: ${def.description}${enumNote}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

const TOOL_SCHEMA_PROMPT = buildToolSchemaPrompt();

// ── Run benchmark for one model ───────────────────────────────

interface ModelBenchmarkResult {
    model: ModelConfig;
    agent: Agent | null;
    scenarios: ScenarioResult[];
    totalPassed: number;
    firstAttemptRate: number;
    avgDurationMs: number;
    skipped: boolean;
    skipReason?: string;
}

async function benchmarkModel(
    modelConfig: ModelConfig,
    projectId: string,
): Promise<ModelBenchmarkResult> {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Model: ${modelConfig.displayName} (${modelConfig.model})`);
    console.log(`Role: ${modelConfig.role}`);
    console.log(`${'─'.repeat(60)}`);

    const agent = await resolveAgentForModel(modelConfig.model);
    if (!agent) {
        console.log(`  SKIP — no agent found for model ${modelConfig.model}`);
        return {
            model: modelConfig,
            agent: null,
            scenarios: [],
            totalPassed: 0,
            firstAttemptRate: 0,
            avgDurationMs: 0,
            skipped: true,
            skipReason: `No agent configured for model "${modelConfig.model}"`,
        };
    }

    console.log(`Agent: ${agent.name} (${agent.id.slice(0, 8)})`);

    const scenarioResults: ScenarioResult[] = [];

    for (const scenario of ALGOCHAT_SCENARIOS) {
        console.log(`\n  [${scenario.id}] ${scenario.name}`);
        const startTime = Date.now();

        try {
            // Prepend tool schema context for text-based tool models
            const prompt = modelConfig.textBasedTools
                ? `${TOOL_SCHEMA_PROMPT}\n---\n\n${scenario.prompt}`
                : scenario.prompt;

            const session = await api<Session>('POST', '/api/sessions', {
                projectId,
                agentId: agent.id,
                name: `Benchmark: ${modelConfig.model} ${scenario.id}`,
                initialPrompt: prompt,
            });

            console.log(`    Session: ${session.id.slice(0, 8)}`);
            const resultPromise = watchSession(session.id);
            const result = await resultPromise;
            const durationMs = Date.now() - startTime;

            const evaluation = scenario.evaluate(result);
            const icon = result.status === 'completed' ? (evaluation.passed ? '✓' : '✗') : '⏱';
            console.log(`    ${icon} ${result.status} in ${(durationMs / 1000).toFixed(1)}s — ${evaluation.notes}`);

            const responsePreview = result.assistantTexts.join(' ').slice(0, 100);
            if (responsePreview) console.log(`    Preview: ${responsePreview}${responsePreview.length === 100 ? '...' : ''}`);

            scenarioResults.push({
                scenario: scenario.id,
                passed: result.status === 'completed' && evaluation.passed,
                firstAttempt: result.status === 'completed',
                durationMs,
                toolCallsAttempted: result.toolCalls,
                toolCallsCorrect: evaluation.passed ? scenario.expectedTools.length : 0,
                responseText: result.assistantTexts.join('\n').slice(0, 500),
                notes: result.status !== 'completed' ? `${result.status}: ${result.errorMsg ?? ''}` : evaluation.notes,
            });

            // Kill stuck sessions to free concurrency slot
            if (result.status !== 'completed') {
                await api('DELETE', `/api/sessions/${session.id}`).catch(() => {});
            } else {
                await api('DELETE', `/api/sessions/${session.id}`).catch(() => {});
            }
            listeners.delete(session.id);
        } catch (err) {
            const durationMs = Date.now() - startTime;
            const errMsg = err instanceof Error ? err.message : String(err);
            console.log(`    ✗ ERROR: ${errMsg}`);
            scenarioResults.push({
                scenario: scenario.id,
                passed: false,
                firstAttempt: false,
                durationMs,
                toolCallsAttempted: [],
                toolCallsCorrect: 0,
                responseText: '',
                notes: `Error: ${errMsg}`,
            });
        }

        // Brief cooldown between tests
        await Bun.sleep(2000);
    }

    const totalPassed = scenarioResults.filter((r) => r.passed).length;
    const firstAttempts = scenarioResults.filter((r) => r.firstAttempt).length;
    const avgDurationMs = scenarioResults.reduce((sum, r) => sum + r.durationMs, 0) / scenarioResults.length;

    return {
        model: modelConfig,
        agent,
        scenarios: scenarioResults,
        totalPassed,
        firstAttemptRate: firstAttempts / scenarioResults.length,
        avgDurationMs,
        skipped: false,
    };
}

// ── Report generation ─────────────────────────────────────────

function generateReport(results: ModelBenchmarkResult[], runDate: string): string {
    const lines: string[] = [];

    lines.push('# Ollama Cloud Model AlgoChat Reliability Benchmark');
    lines.push('');
    lines.push(`**Date:** ${runDate}`);
    lines.push(`**Models tested:** ${results.filter((r) => !r.skipped).length}`);
    lines.push(`**Scenarios per model:** ${ALGOCHAT_SCENARIOS.length}`);
    lines.push('');

    // ── Summary table ──
    lines.push('## Summary');
    lines.push('');
    lines.push('| Model | Role | Tier | Pass Rate | First-Attempt | Avg Time | Recommendation |');
    lines.push('|-------|------|------|-----------|---------------|----------|----------------|');

    for (const r of results) {
        if (r.skipped) {
            lines.push(`| ${r.model.displayName} | ${r.model.role} | ${r.model.tier} | SKIPPED | — | — | ${r.skipReason} |`);
            continue;
        }
        const passRate = `${r.totalPassed}/${ALGOCHAT_SCENARIOS.length}`;
        const faRate = `${(r.firstAttemptRate * 100).toFixed(0)}%`;
        const avgTime = `${(r.avgDurationMs / 1000).toFixed(1)}s`;
        const rec = r.totalPassed === ALGOCHAT_SCENARIOS.length ? 'Ready' : r.totalPassed >= 3 ? 'Conditional' : 'Needs work';
        lines.push(`| ${r.model.displayName} | ${r.model.role} | ${r.model.tier} | ${passRate} | ${faRate} | ${avgTime} | ${rec} |`);
    }

    lines.push('');

    // ── Scenario breakdown ──
    lines.push('## Scenario Breakdown');
    lines.push('');
    lines.push('| Model | S1: AlgoChat Reply | S2: Memory Recall | S3: Multi-Tool | S4: Task Query |');
    lines.push('|-------|-------------------|-------------------|----------------|----------------|');

    for (const r of results) {
        if (r.skipped) continue;
        const cells = ALGOCHAT_SCENARIOS.map((s) => {
            const sr = r.scenarios.find((x) => x.scenario === s.id);
            if (!sr) return '—';
            return sr.passed ? `✓ ${(sr.durationMs / 1000).toFixed(1)}s` : `✗ ${sr.notes.slice(0, 30)}`;
        });
        lines.push(`| ${r.model.displayName} | ${cells.join(' | ')} |`);
    }

    lines.push('');

    // ── Per-model details ──
    lines.push('## Per-Model Details');
    lines.push('');

    for (const r of results) {
        lines.push(`### ${r.model.displayName} (\`${r.model.model}\`)`);
        lines.push('');
        lines.push(`- **Role:** ${r.model.role}`);
        lines.push(`- **Capability tier:** ${r.model.tier} (1=frontier, 3=basic)`);
        lines.push(`- **Thinking mode:** ${r.model.supportsThinking ? 'Yes' : 'No'}`);
        lines.push(`- **Tool parsing:** ${r.model.textBasedTools ? 'Text-based (prompt-injected schema)' : 'Native Ollama tools API'}`);
        lines.push(`- **Context window:** ${r.model.contextK}K tokens`);

        if (r.skipped) {
            lines.push(`- **Status:** SKIPPED — ${r.skipReason}`);
        } else {
            lines.push(`- **Agent used:** ${r.agent?.name ?? 'unknown'} (${r.agent?.id?.slice(0, 8) ?? '?'})`);
            lines.push(`- **Pass rate:** ${r.totalPassed}/${ALGOCHAT_SCENARIOS.length}`);
            lines.push('');
            lines.push('| Scenario | Result | Duration | Notes |');
            lines.push('|----------|--------|----------|-------|');
            for (const sr of r.scenarios) {
                const icon = sr.passed ? '✓' : '✗';
                lines.push(`| ${sr.scenario} | ${icon} ${sr.passed ? 'PASS' : 'FAIL'} | ${(sr.durationMs / 1000).toFixed(1)}s | ${sr.notes} |`);
            }
            if (r.scenarios.some((s) => s.responseText)) {
                lines.push('');
                lines.push('<details><summary>Response samples</summary>');
                lines.push('');
                for (const sr of r.scenarios) {
                    if (!sr.responseText) continue;
                    lines.push(`**${sr.scenario}:**`);
                    lines.push('```');
                    lines.push(sr.responseText.slice(0, 300));
                    lines.push('```');
                    lines.push('');
                }
                lines.push('</details>');
            }
        }

        lines.push('');
    }

    // ── Recommendations ──
    lines.push('## Recommendations');
    lines.push('');

    const ranked = results
        .filter((r) => !r.skipped)
        .sort((a, b) => b.totalPassed - a.totalPassed || a.avgDurationMs - b.avgDurationMs);

    if (ranked.length > 0) {
        lines.push('### Agent Role Assignments');
        lines.push('');

        const best = ranked[0];
        const tier1 = ranked.filter((r) => r.model.tier <= 1 && r.totalPassed >= 3);
        const tier2 = ranked.filter((r) => r.model.tier <= 2 && r.totalPassed >= 3);

        lines.push('**Starling** (junior, AlgoChat first-responder):');
        const starlingPick = tier2.find((r) => r.model.contextK >= 64) ?? ranked[0];
        lines.push(`- Recommended: **${starlingPick.model.displayName}** (${starlingPick.totalPassed}/${ALGOCHAT_SCENARIOS.length} scenarios, ${starlingPick.model.contextK}K context)`);
        lines.push('');

        lines.push('**Merlin** (junior, backend tasks):');
        const merlinPick = tier2.find((r) => r !== starlingPick) ?? ranked[0];
        lines.push(`- Recommended: **${merlinPick.model.displayName}** (${merlinPick.totalPassed}/${ALGOCHAT_SCENARIOS.length} scenarios, tier ${merlinPick.model.tier})`);
        lines.push('');

        lines.push('**Condor** (heavy-lift, complex analysis):');
        const condorPick = tier1.length > 0 ? tier1[0] : best;
        lines.push(`- Recommended: **${condorPick.model.displayName}** (${condorPick.totalPassed}/${ALGOCHAT_SCENARIOS.length} scenarios, tier ${condorPick.model.tier}, thinking: ${condorPick.model.supportsThinking ? 'yes' : 'no'})`);
        lines.push('');

        lines.push('### Config Changes Required');
        lines.push('');
        for (const r of results) {
            if (r.skipped) continue;
            if (r.totalPassed < 3) {
                lines.push(`- **${r.model.displayName}**: Not recommended for junior duties without prompt tuning. Pass rate ${r.totalPassed}/${ALGOCHAT_SCENARIOS.length}.`);
            }
        }
        const textBasedModels = results.filter((r) => !r.skipped && r.model.textBasedTools && r.totalPassed >= 3);
        if (textBasedModels.length > 0) {
            lines.push(`- All recommended models use text-based tool parsing — ensure \`TEXT_BASED_TOOL_FAMILIES\` is up to date in \`server/providers/ollama/provider.ts\`.`);
        }
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Generated by \`scripts/benchmark-ollama-cloud.ts\` on ${runDate}*`);

    return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
    console.log('Ollama Cloud Model AlgoChat Reliability Benchmark');
    console.log('==================================================\n');

    // Resolve project
    let projectId = argValue('--project') ?? '';
    if (!projectId) {
        try {
            const projects = await api<Array<{ id: string; name: string }>>('GET', '/api/projects');
            const corvid = projects.find((p) => p.name === 'corvid-agent');
            projectId = corvid?.id ?? projects[0]?.id ?? '';
            if (projectId) console.log(`Project: ${corvid?.name ?? projects[0]?.name} (${projectId.slice(0, 8)})`);
        } catch {
            console.error('ERROR: Cannot reach server at ' + API);
            console.error('Make sure corvid-agent server is running (bun run dev)');
            process.exit(1);
        }
    }

    if (!projectId) {
        console.error('ERROR: No project found. Pass --project <id> explicitly.');
        process.exit(1);
    }

    console.log(`\nModels to benchmark: ${MODELS.length}`);
    for (const m of MODELS) console.log(`  - ${m.displayName} (${m.model})`);

    // Connect WebSocket
    console.log('\nConnecting WebSocket...');
    try {
        await connectWs();
        console.log('WebSocket connected.');
    } catch (err) {
        console.error(`WebSocket failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }

    const allResults: ModelBenchmarkResult[] = [];
    for (const model of MODELS) {
        const result = await benchmarkModel(model, projectId);
        allResults.push(result);
    }

    globalWs?.close();

    // Generate and write report
    const runDate = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const report = generateReport(allResults, runDate);
    await Bun.write(OUTPUT_FILE, report);

    // Print summary
    console.log('\n\nBenchmark Complete');
    console.log('==================');
    for (const r of allResults) {
        if (r.skipped) {
            console.log(`  ${r.model.displayName}: SKIPPED (${r.skipReason})`);
        } else {
            const rate = `${r.totalPassed}/${ALGOCHAT_SCENARIOS.length}`;
            console.log(`  ${r.model.displayName}: ${rate} passed (${(r.avgDurationMs / 1000).toFixed(1)}s avg)`);
        }
    }
    console.log(`\nReport written to: ${OUTPUT_FILE}`);
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
