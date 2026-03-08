/**
 * SandboxLifecycleAdapter — Connects SandboxManager to session lifecycle
 * events via the SessionEventBus, without modifying the ProcessManager.
 *
 * Listens for session_started / session_stopped / session_exited events
 * and assigns or releases containers accordingly.
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { EventCallback } from '../process/interfaces';
import type { ClaudeStreamEvent } from '../process/types';
import type { SandboxManager } from './manager';
import { getSession } from '../db/sessions';
import { createLogger } from '../lib/logger';

const log = createLogger('SandboxLifecycleAdapter');

/** Minimal event subscription interface — satisfied by both SessionEventBus and ProcessManager. */
interface EventSubscriber {
    subscribeAll(callback: EventCallback): void;
    unsubscribeAll(callback: EventCallback): void;
}

export class SandboxLifecycleAdapter {
    private db: Database;
    private sandboxManager: SandboxManager;
    private eventBus: EventSubscriber;
    private listener: EventCallback;

    constructor(db: Database, sandboxManager: SandboxManager, eventBus: EventSubscriber) {
        this.db = db;
        this.sandboxManager = sandboxManager;
        this.eventBus = eventBus;

        this.listener = (sessionId: string, event: ClaudeStreamEvent) => {
            this.handleEvent(sessionId, event);
        };
    }

    /** Start listening for session lifecycle events. */
    start(): void {
        this.eventBus.subscribeAll(this.listener);
        log.info('SandboxLifecycleAdapter subscribed to session events');
    }

    /** Stop listening and clean up. */
    stop(): void {
        this.eventBus.unsubscribeAll(this.listener);
        log.info('SandboxLifecycleAdapter unsubscribed from session events');
    }

    /** Get the sandbox container assigned to a session, if any. */
    getSessionContainer(sessionId: string): { containerId: string; sandboxId: string } | null {
        const entry = this.sandboxManager.getContainerForSession(sessionId);
        if (!entry) return null;
        return { containerId: entry.containerId, sandboxId: entry.sandboxId };
    }

    private handleEvent(sessionId: string, event: ClaudeStreamEvent): void {
        if (!this.sandboxManager.isEnabled()) return;

        switch (event.type) {
            case 'session_started':
                this.onSessionStarted(sessionId);
                break;
            case 'session_stopped':
            case 'session_exited':
                this.onSessionEnded(sessionId);
                break;
        }
    }

    private onSessionStarted(sessionId: string): void {
        // Look up session from DB to get agentId and workDir
        const session = getSession(this.db, sessionId);
        if (!session?.agentId) return;

        this.sandboxManager
            .assignContainer(session.agentId, sessionId, session.workDir ?? null)
            .then((containerId) => {
                log.info('Sandbox container assigned', {
                    sessionId,
                    containerId: containerId.slice(0, 12),
                });
            })
            .catch((err) => {
                log.warn('Failed to assign sandbox container', {
                    sessionId,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
    }

    private onSessionEnded(sessionId: string): void {
        this.sandboxManager.releaseContainer(sessionId).catch((err) => {
            log.warn('Failed to release sandbox container', {
                sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }
}
