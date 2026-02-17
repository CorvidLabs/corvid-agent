/**
 * A2A inbound task handler — manages task lifecycle for remote agent invocations.
 *
 * In-memory task store with a cap of 1000 entries.
 * Creates sessions, starts agent processes, and captures results.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { A2ATask } from './types';
import type { Agent, Session } from '../../shared/types';
import { listAgents as defaultListAgents } from '../db/agents';
import { createSession as defaultCreateSession } from '../db/sessions';
import { createLogger } from '../lib/logger';

const log = createLogger('A2ATaskHandler');

const MAX_TASKS = 1000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// In-memory task store
const tasks = new Map<string, A2ATask>();

function pruneOldTasks(): void {
    if (tasks.size <= MAX_TASKS) return;
    // Remove oldest completed/failed tasks
    const entries = [...tasks.entries()]
        .filter(([, t]) => t.state === 'completed' || t.state === 'failed')
        .sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt));

    const toRemove = entries.slice(0, tasks.size - MAX_TASKS + 100);
    for (const [id] of toRemove) {
        tasks.delete(id);
    }
}

export interface A2ATaskDeps {
    db: Database;
    processManager: ProcessManager;
    /** Override for testing — defaults to db/agents.listAgents */
    listAgents?: (db: Database) => Agent[];
    /** Override for testing — defaults to db/sessions.createSession */
    createSession?: (db: Database, input: Record<string, unknown>) => Session;
}

/**
 * Handle an inbound tasks/send request.
 * Resolves target agent, creates a session, starts a process.
 */
export function handleTaskSend(
    deps: A2ATaskDeps,
    body: { message: string; skill?: string; timeoutMs?: number },
): A2ATask {
    pruneOldTasks();

    const { db, processManager } = deps;
    const listAgentsFn = deps.listAgents ?? defaultListAgents;
    const createSessionFn = deps.createSession ?? defaultCreateSession;

    // Find a suitable agent (first available with a default project)
    const agents = listAgentsFn(db);
    const agent = agents.find((a) => a.defaultProjectId);
    if (!agent) {
        throw new Error('No agent with a default project is available to handle A2A tasks');
    }

    const projectId = agent.defaultProjectId!;
    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();

    const task: A2ATask = {
        id: taskId,
        state: 'submitted',
        messages: [
            { role: 'user', parts: [{ type: 'text', text: body.message }] },
        ],
        sessionId: null,
        createdAt: now,
        updatedAt: now,
    };

    tasks.set(taskId, task);

    // Create session
    const session = createSessionFn(db, {
        projectId,
        agentId: agent.id,
        name: `A2A Task: ${body.message.slice(0, 50)}`,
        initialPrompt: body.message,
        source: 'agent',
    });

    task.sessionId = session.id;
    task.state = 'working';
    task.updatedAt = new Date().toISOString();

    // Subscribe for completion
    const timeoutMs = body.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => {
        if (task.state === 'working') {
            task.state = 'failed';
            task.messages.push({
                role: 'agent',
                parts: [{ type: 'text', text: 'Task timed out' }],
            });
            task.updatedAt = new Date().toISOString();
        }
    }, timeoutMs);

    processManager.subscribe(session.id, (_sessionId: string, event: unknown) => {
        const ev = event as { type?: string; message?: { content?: unknown }; result?: string };

        if (ev.type === 'assistant' && ev.message?.content) {
            const text = extractText(ev.message.content);
            if (text) {
                task.messages.push({
                    role: 'agent',
                    parts: [{ type: 'text', text }],
                });
                task.updatedAt = new Date().toISOString();
            }
        }

        if (ev.type === 'session_exited' || ev.type === 'session_stopped') {
            clearTimeout(timeout);
            if (task.state === 'working') {
                task.state = 'completed';
                task.updatedAt = new Date().toISOString();
            }
        }

        if (ev.type === 'error') {
            clearTimeout(timeout);
            task.state = 'failed';
            task.updatedAt = new Date().toISOString();
        }
    });

    // Start the process
    processManager.startProcess(session, body.message, { schedulerMode: true });

    log.info('A2A task started', {
        taskId,
        sessionId: session.id,
        agentId: agent.id,
        messagePreview: body.message.slice(0, 80),
    });

    return task;
}

/**
 * Get a task by ID.
 */
export function handleTaskGet(taskId: string): A2ATask | null {
    return tasks.get(taskId) ?? null;
}

/** Extract text from assistant message content (handles array or string). */
function extractText(content: unknown): string | null {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        for (const block of content) {
            if (block && typeof block === 'object' && 'text' in block) {
                return (block as { text: string }).text;
            }
        }
    }
    return null;
}

/** Reset task store (for testing). */
export function clearTaskStore(): void {
    tasks.clear();
}
