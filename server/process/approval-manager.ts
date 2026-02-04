import type { Database } from 'bun:sqlite';
import type { ApprovalRequest, ApprovalResponse } from './approval-types';
import { enqueueRequest, resolveRequest as resolveEscalation, getPendingRequests, type EscalationRequest } from '../db/escalation-queue';
import { createLogger } from '../lib/logger';

const log = createLogger('ApprovalManager');

const DEFAULT_TIMEOUT_WEB_MS = 55_000;
const DEFAULT_TIMEOUT_ALGOCHAT_MS = 120_000;

export type OperationalMode = 'normal' | 'queued' | 'paused';

interface PendingRequest {
    request: ApprovalRequest;
    resolve: (response: ApprovalResponse) => void;
    timer: ReturnType<typeof setTimeout>;
    senderAddress?: string;
}

/**
 * Map from escalation queue ID to the resolve function for the SDK process
 * that is waiting for the queued approval decision.
 */
interface QueuedResolver {
    sessionId: string;
    resolve: (response: ApprovalResponse) => void;
    requestId: string;
}

export class ApprovalManager {
    private pending: Map<string, PendingRequest> = new Map();
    private queuedResolvers: Map<number, QueuedResolver> = new Map();
    private _operationalMode: OperationalMode = 'normal';
    private db: Database | null = null;

    get operationalMode(): OperationalMode {
        return this._operationalMode;
    }

    set operationalMode(mode: OperationalMode) {
        log.info(`Operational mode changed: ${this._operationalMode} → ${mode}`);
        this._operationalMode = mode;
    }

    setDatabase(db: Database): void {
        this.db = db;
    }

    getDefaultTimeout(source: string): number {
        return source === 'algochat' ? DEFAULT_TIMEOUT_ALGOCHAT_MS : DEFAULT_TIMEOUT_WEB_MS;
    }

    createRequest(request: ApprovalRequest, senderAddress?: string): Promise<ApprovalResponse> {
        // In paused mode, immediately deny all requests
        if (this._operationalMode === 'paused') {
            log.info(`Approval request ${request.id} immediately denied (paused mode)`);
            return Promise.resolve({
                requestId: request.id,
                behavior: 'deny',
                message: 'System is in paused mode — all tool requests denied',
            });
        }

        // In queued mode, immediately queue without waiting
        if (this._operationalMode === 'queued' && this.db) {
            return this.enqueueAndWait(request);
        }

        // Normal mode: wait for approval with timeout, then queue on timeout
        return new Promise<ApprovalResponse>((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(request.id);

                // Instead of auto-deny on timeout, persist to escalation queue
                if (this.db) {
                    const queued = enqueueRequest(this.db, request.sessionId, request.toolName, request.toolInput);
                    log.info(`Approval request ${request.id} timed out — queued as escalation #${queued.id}`);

                    this.queuedResolvers.set(queued.id, {
                        sessionId: request.sessionId,
                        resolve,
                        requestId: request.id,
                    });
                } else {
                    log.info(`Approval request ${request.id} timed out after ${request.timeoutMs}ms`);
                    resolve({
                        requestId: request.id,
                        behavior: 'deny',
                        message: 'Approval timed out',
                    });
                }
            }, request.timeoutMs);

            this.pending.set(request.id, { request, resolve, timer, senderAddress });
            log.debug(`Created approval request ${request.id}`, {
                sessionId: request.sessionId,
                toolName: request.toolName,
            });
        });
    }

    private enqueueAndWait(request: ApprovalRequest): Promise<ApprovalResponse> {
        return new Promise<ApprovalResponse>((resolve) => {
            const queued = enqueueRequest(this.db!, request.sessionId, request.toolName, request.toolInput);
            log.info(`Approval request ${request.id} immediately queued as escalation #${queued.id} (queued mode)`);

            this.queuedResolvers.set(queued.id, {
                sessionId: request.sessionId,
                resolve,
                requestId: request.id,
            });
        });
    }

    resolveRequest(requestId: string, response: ApprovalResponse): boolean {
        const entry = this.pending.get(requestId);
        if (!entry) {
            log.debug(`Approval request ${requestId} not found (already resolved or timed out)`);
            return false;
        }

        clearTimeout(entry.timer);
        this.pending.delete(requestId);
        entry.resolve(response);
        log.info(`Resolved approval request ${requestId}`, { behavior: response.behavior });
        return true;
    }

    /**
     * Resolve a queued escalation request. This unblocks the SDK process
     * that was waiting for the decision.
     */
    resolveQueuedRequest(queueId: number, approved: boolean): boolean {
        if (!this.db) return false;

        const resolution = approved ? 'approved' : 'denied';
        const escalation = resolveEscalation(this.db, queueId, resolution);
        if (!escalation) {
            log.debug(`Escalation #${queueId} not found or already resolved`);
            return false;
        }

        const resolver = this.queuedResolvers.get(queueId);
        if (resolver) {
            this.queuedResolvers.delete(queueId);
            resolver.resolve({
                requestId: resolver.requestId,
                behavior: approved ? 'allow' : 'deny',
                message: approved ? 'Approved from escalation queue' : 'Denied from escalation queue',
            });
            log.info(`Resolved escalation #${queueId}`, { approved, sessionId: resolver.sessionId });
            return true;
        }

        log.info(`Escalation #${queueId} resolved in DB but no active resolver found`, { resolution });
        return true;
    }

    getQueuedRequests(): EscalationRequest[] {
        if (!this.db) return [];
        return getPendingRequests(this.db);
    }

    /**
     * Resolve a pending request by matching a short ID prefix.
     * Used by AlgoChat where users reply with abbreviated IDs.
     */
    resolveByShortId(
        shortId: string,
        partial: { behavior: 'allow' | 'deny'; message?: string },
        senderAddress?: string,
    ): boolean {
        const lower = shortId.toLowerCase();
        for (const [id, entry] of this.pending) {
            if (id.toLowerCase().startsWith(lower)) {
                // Verify sender matches the original request sender (if tracked)
                if (entry.senderAddress && senderAddress && entry.senderAddress !== senderAddress) {
                    log.warn(`Approval response from wrong sender`, {
                        expected: entry.senderAddress,
                        actual: senderAddress,
                        shortId,
                    });
                    return false;
                }
                return this.resolveRequest(id, {
                    requestId: id,
                    behavior: partial.behavior,
                    message: partial.message,
                });
            }
        }
        log.debug(`No pending approval matching short ID "${shortId}"`);
        return false;
    }

    /**
     * Associate a sender address with an existing pending request.
     * Used by AlgoChat to mark which on-chain participant should be
     * allowed to respond to the approval.
     */
    setSenderAddress(requestId: string, senderAddress: string): void {
        const entry = this.pending.get(requestId);
        if (entry) {
            entry.senderAddress = senderAddress;
        }
    }

    getPendingForSession(sessionId: string): ApprovalRequest[] {
        const result: ApprovalRequest[] = [];
        for (const entry of this.pending.values()) {
            if (entry.request.sessionId === sessionId) {
                result.push(entry.request);
            }
        }
        return result;
    }

    hasPendingRequests(): boolean {
        return this.pending.size > 0;
    }

    cancelSession(sessionId: string): void {
        for (const [id, entry] of this.pending) {
            if (entry.request.sessionId === sessionId) {
                clearTimeout(entry.timer);
                this.pending.delete(id);
                entry.resolve({
                    requestId: id,
                    behavior: 'deny',
                    message: 'Session stopped',
                });
            }
        }

        // Also clean up any queued resolvers for this session
        for (const [queueId, resolver] of this.queuedResolvers) {
            if (resolver.sessionId === sessionId) {
                this.queuedResolvers.delete(queueId);
                resolver.resolve({
                    requestId: resolver.requestId,
                    behavior: 'deny',
                    message: 'Session stopped',
                });
            }
        }
    }

    shutdown(): void {
        for (const [id, entry] of this.pending) {
            clearTimeout(entry.timer);
            entry.resolve({
                requestId: id,
                behavior: 'deny',
                message: 'Server shutting down',
            });
        }
        this.pending.clear();

        for (const [, resolver] of this.queuedResolvers) {
            resolver.resolve({
                requestId: resolver.requestId,
                behavior: 'deny',
                message: 'Server shutting down',
            });
        }
        this.queuedResolvers.clear();
    }
}
