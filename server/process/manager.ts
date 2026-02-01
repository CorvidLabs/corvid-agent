import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import { extractContentText } from './types';
import { spawnClaudeProcess, type ClaudeProcess } from './claude-process';
import { getProject } from '../db/projects';
import { getAgent } from '../db/agents';
import { updateSessionPid, updateSessionStatus, updateSessionCost, addSessionMessage } from '../db/sessions';

export type EventCallback = (sessionId: string, event: ClaudeStreamEvent) => void;

export class ProcessManager {
    private processes: Map<string, ClaudeProcess> = new Map();
    private subscribers: Map<string, Set<EventCallback>> = new Map();
    private globalSubscribers: Set<EventCallback> = new Set();
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    startProcess(session: Session, prompt?: string): void {
        if (this.processes.has(session.id)) {
            this.stopProcess(session.id);
        }

        const project = getProject(this.db, session.projectId);
        if (!project) {
            this.emitEvent(session.id, {
                type: 'error',
                error: { message: `Project ${session.projectId} not found`, type: 'not_found' },
            } as ClaudeStreamEvent);
            return;
        }

        const agent = session.agentId ? getAgent(this.db, session.agentId) : null;

        let cp: ClaudeProcess;
        try {
            cp = spawnClaudeProcess({
                session,
                project,
                agent,
                prompt: prompt ?? session.initialPrompt,
                onEvent: (event) => this.handleEvent(session.id, event),
                onExit: (code) => this.handleExit(session.id, code),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[ProcessManager] Failed to spawn claude for session ${session.id}:`, message);
            updateSessionStatus(this.db, session.id, 'error');
            this.emitEvent(session.id, {
                type: 'error',
                error: { message: `Failed to spawn claude: ${message}`, type: 'spawn_error' },
            } as ClaudeStreamEvent);
            return;
        }

        this.processes.set(session.id, cp);
        updateSessionPid(this.db, session.id, cp.pid);
        updateSessionStatus(this.db, session.id, 'running');

        console.log(`[ProcessManager] Started process for session ${session.id}, pid=${cp.pid}`);

        this.emitEvent(session.id, {
            type: 'session_started',
            session_id: session.id,
        } as ClaudeStreamEvent);
    }

    resumeProcess(session: Session, prompt?: string): void {
        if (this.processes.has(session.id)) {
            // Process still running, send message instead
            if (prompt) {
                this.sendMessage(session.id, prompt);
            }
            return;
        }

        const project = getProject(this.db, session.projectId);
        if (!project) return;

        const agent = session.agentId ? getAgent(this.db, session.agentId) : null;

        const cp = spawnClaudeProcess({
            session,
            project,
            agent,
            resume: true,
            prompt,
            onEvent: (event) => this.handleEvent(session.id, event),
            onExit: (code) => this.handleExit(session.id, code),
        });

        this.processes.set(session.id, cp);
        updateSessionPid(this.db, session.id, cp.pid);
        updateSessionStatus(this.db, session.id, 'running');
    }

    stopProcess(sessionId: string): void {
        const cp = this.processes.get(sessionId);
        if (cp) {
            cp.kill();
            this.processes.delete(sessionId);
            updateSessionPid(this.db, sessionId, null);
            updateSessionStatus(this.db, sessionId, 'stopped');

            this.emitEvent(sessionId, {
                type: 'session_stopped',
                session_id: sessionId,
            } as ClaudeStreamEvent);
        }
    }

    sendMessage(sessionId: string, content: string): boolean {
        const cp = this.processes.get(sessionId);
        if (!cp) return false;

        cp.sendMessage(content);
        addSessionMessage(this.db, sessionId, 'user', content);
        return true;
    }

    isRunning(sessionId: string): boolean {
        return this.processes.has(sessionId);
    }

    subscribe(sessionId: string, callback: EventCallback): void {
        let subs = this.subscribers.get(sessionId);
        if (!subs) {
            subs = new Set();
            this.subscribers.set(sessionId, subs);
        }
        subs.add(callback);
    }

    unsubscribe(sessionId: string, callback: EventCallback): void {
        const subs = this.subscribers.get(sessionId);
        if (subs) {
            subs.delete(callback);
            if (subs.size === 0) {
                this.subscribers.delete(sessionId);
            }
        }
    }

    subscribeAll(callback: EventCallback): void {
        this.globalSubscribers.add(callback);
    }

    unsubscribeAll(callback: EventCallback): void {
        this.globalSubscribers.delete(callback);
    }

    getActiveSessionIds(): string[] {
        return [...this.processes.keys()];
    }

    shutdown(): void {
        for (const [sessionId] of this.processes) {
            this.stopProcess(sessionId);
        }
    }

    private handleEvent(sessionId: string, event: ClaudeStreamEvent): void {
        // Persist assistant messages
        if (event.type === 'assistant' && event.message?.content) {
            const text = extractContentText(event.message.content);
            if (text) {
                addSessionMessage(this.db, sessionId, 'assistant', text);
            }
        }

        // Track cost (fields are at top level of result events)
        if (event.total_cost_usd !== undefined) {
            updateSessionCost(
                this.db,
                sessionId,
                event.total_cost_usd,
                event.num_turns ?? 0,
            );
        }

        this.emitEvent(sessionId, event);
    }

    private handleExit(sessionId: string, code: number | null): void {
        console.log(`[ProcessManager] Process exited for session ${sessionId}, code=${code}`);
        this.processes.delete(sessionId);
        updateSessionPid(this.db, sessionId, null);

        const status = code === 0 ? 'idle' : 'error';
        updateSessionStatus(this.db, sessionId, status);

        this.emitEvent(sessionId, {
            type: 'session_exited',
            session_id: sessionId,
            result: { cost_usd: 0, duration_ms: 0, num_turns: 0 },
        } as ClaudeStreamEvent);
    }

    private emitEvent(sessionId: string, event: ClaudeStreamEvent): void {
        const subs = this.subscribers.get(sessionId);
        if (subs) {
            for (const cb of subs) {
                cb(sessionId, event);
            }
        }
        for (const cb of this.globalSubscribers) {
            cb(sessionId, event);
        }
    }
}
