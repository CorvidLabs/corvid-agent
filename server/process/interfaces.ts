/**
 * Service contracts for the process management subsystem.
 *
 * These interfaces define the boundaries between the ProcessManager
 * orchestrator and its composed services. Following the same
 * compose-by-delegation pattern used in the AlgoChatBridge decomposition
 * (ResponseFormatter, CommandHandler, SubscriptionManager, DiscoveryService).
 *
 * @module
 */
import type { ClaudeStreamEvent } from './types';

// ── Event callback types ────────────────────────────────────────────────

/** Callback for session-scoped and global event subscriptions. */
export type EventCallback = (sessionId: string, event: ClaudeStreamEvent) => void;

// ── ISessionEventBus ────────────────────────────────────────────────────

/**
 * Manages event subscription, emission, and listener lifecycle for
 * session-scoped and global event streams.
 *
 * Event taxonomy:
 * - **Lifecycle events:** session_started, session_stopped, session_exited,
 *   paused, resumed, timeout_warning
 * - **Output events:** assistant messages, tool_use, tool_status, cost_update
 * - **Control events:** approval_request, approval_resolved, error, system
 *
 * All events use the `ClaudeStreamEvent` discriminated union with a `type`
 * field for type-safe handling.
 */
export interface ISessionEventBus {
    /**
     * Subscribe to events for a specific session.
     * Multiple callbacks can be registered per session.
     */
    subscribe(sessionId: string, callback: EventCallback): void;

    /**
     * Unsubscribe a callback from a specific session's events.
     * Automatically cleans up the session's subscriber set when empty.
     */
    unsubscribe(sessionId: string, callback: EventCallback): void;

    /**
     * Subscribe to events from ALL sessions (global listener).
     * Used by cross-cutting concerns like AlgoChatBridge notifications.
     */
    subscribeAll(callback: EventCallback): void;

    /**
     * Unsubscribe a global listener.
     */
    unsubscribeAll(callback: EventCallback): void;

    /**
     * Emit an event to all subscribers (session-scoped + global).
     * Swallows individual callback errors to prevent one bad subscriber
     * from breaking the event pipeline.
     */
    emit(sessionId: string, event: ClaudeStreamEvent): void;

    /**
     * Remove all subscribers for a specific session.
     * Called during session cleanup to prevent memory leaks.
     */
    removeSessionSubscribers(sessionId: string): void;

    /**
     * Remove all session-scoped subscribers (used during shutdown).
     * Does NOT clear global subscribers — those belong to long-lived
     * services that manage their own lifecycle.
     */
    clearAllSessionSubscribers(): void;

    /**
     * Get the count of session subscriber entries (Map size, not total callbacks).
     */
    getSubscriberCount(): number;

    /**
     * Get the count of global subscribers.
     */
    getGlobalSubscriberCount(): number;

    /**
     * Prune subscriber entries for sessions that match the given predicate.
     * Used by the orphan pruner to clean up subscribers for sessions that
     * no longer have active processes. Returns the number of entries pruned.
     */
    pruneSubscribers(shouldPrune: (sessionId: string) => boolean): number;
}
