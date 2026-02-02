import type { ApprovalRequest, ApprovalResponse } from './approval-types';
import { createLogger } from '../lib/logger';

const log = createLogger('ApprovalManager');

const DEFAULT_TIMEOUT_WEB_MS = 55_000;
const DEFAULT_TIMEOUT_ALGOCHAT_MS = 120_000;

interface PendingRequest {
    request: ApprovalRequest;
    resolve: (response: ApprovalResponse) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class ApprovalManager {
    private pending: Map<string, PendingRequest> = new Map();

    getDefaultTimeout(source: string): number {
        return source === 'algochat' ? DEFAULT_TIMEOUT_ALGOCHAT_MS : DEFAULT_TIMEOUT_WEB_MS;
    }

    createRequest(request: ApprovalRequest): Promise<ApprovalResponse> {
        return new Promise<ApprovalResponse>((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(request.id);
                log.info(`Approval request ${request.id} timed out after ${request.timeoutMs}ms`);
                resolve({
                    requestId: request.id,
                    behavior: 'deny',
                    message: 'Approval timed out',
                });
            }, request.timeoutMs);

            this.pending.set(request.id, { request, resolve, timer });
            log.debug(`Created approval request ${request.id}`, {
                sessionId: request.sessionId,
                toolName: request.toolName,
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
     * Resolve a pending request by matching a short ID prefix.
     * Used by AlgoChat where users reply with abbreviated IDs.
     */
    resolveByShortId(shortId: string, partial: { behavior: 'allow' | 'deny'; message?: string }): boolean {
        const lower = shortId.toLowerCase();
        for (const [id] of this.pending) {
            if (id.toLowerCase().startsWith(lower)) {
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
    }
}
