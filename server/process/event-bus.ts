/**
 * SessionEventBus — Manages event subscription, emission, and listener
 * lifecycle for the process management subsystem.
 *
 * Extracted from ProcessManager following the compose-by-delegation pattern
 * established in the AlgoChatBridge decomposition (PR #48).
 *
 * Responsibilities:
 * - Session-scoped event subscriptions (per-session callback sets)
 * - Global event subscriptions (cross-cutting listeners like AlgoChatBridge)
 * - Event emission with error isolation (one bad callback can't break others)
 * - Subscriber lifecycle management (cleanup, orphan prevention)
 *
 * The ProcessManager composes this service and delegates all event plumbing
 * to it. Business logic (what events to emit, when) remains in the manager.
 *
 * @module
 */
import type { ClaudeStreamEvent } from './types';
import type { ISessionEventBus, EventCallback } from './interfaces';
import { createLogger } from '../lib/logger';

const log = createLogger('SessionEventBus');

export class SessionEventBus implements ISessionEventBus {
    private subscribers: Map<string, Set<EventCallback>> = new Map();
    private globalSubscribers: Set<EventCallback> = new Set();

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

    emit(sessionId: string, event: ClaudeStreamEvent): void {
        const subs = this.subscribers.get(sessionId);
        if (subs) {
            for (const cb of subs) {
                try {
                    cb(sessionId, event);
                } catch (err) {
                    log.error('Subscriber callback threw', {
                        sessionId,
                        eventType: event.type,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }
        for (const cb of this.globalSubscribers) {
            try {
                cb(sessionId, event);
            } catch (err) {
                log.error('Global subscriber callback threw', {
                    sessionId,
                    eventType: event.type,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    removeSessionSubscribers(sessionId: string): void {
        this.subscribers.delete(sessionId);
    }

    clearAllSessionSubscribers(): void {
        this.subscribers.clear();
    }

    getSubscriberCount(): number {
        return this.subscribers.size;
    }

    getGlobalSubscriberCount(): number {
        return this.globalSubscribers.size;
    }

    pruneSubscribers(shouldPrune: (sessionId: string) => boolean): number {
        let pruned = 0;
        for (const sessionId of this.subscribers.keys()) {
            if (shouldPrune(sessionId)) {
                this.subscribers.delete(sessionId);
                pruned++;
            }
        }
        return pruned;
    }
}
