/**
 * Approval flow bridge — connects SDK/direct-process approval request callbacks
 * to the session event bus so WebSocket subscribers receive real-time approval
 * events.
 *
 * Extracted from ProcessManager to isolate the approval event wiring from
 * session lifecycle concerns.
 *
 * @module
 */

import type { ApprovalManager } from './approval-manager';
import type { ApprovalRequestWire } from './approval-types';
import type { ISessionEventBus } from './interfaces';
import type { ClaudeStreamEvent } from './types';

/**
 * Build the event payload for an approval request so it can be emitted
 * to session subscribers (WebSocket clients, AlgoChat bridge, etc.).
 */
export function buildApprovalRequestEvent(request: ApprovalRequestWire): ClaudeStreamEvent {
  return {
    type: 'approval_request',
    ...request,
  } as ClaudeStreamEvent;
}

/**
 * Create the `onApprovalRequest` callback that process spawners pass to
 * startSdkProcess / startDirectProcess. When the SDK raises an approval
 * request, this callback emits the event to all session subscribers.
 *
 * @param eventBus - The session event bus to emit events to
 * @returns A callback `(sessionId, request) => void` for use as onApprovalRequest
 */
export function createApprovalRequestHandler(
  eventBus: ISessionEventBus,
): (sessionId: string, request: ApprovalRequestWire) => void {
  return (sessionId: string, request: ApprovalRequestWire): void => {
    eventBus.emit(sessionId, buildApprovalRequestEvent(request));
  };
}

/**
 * Resolve a pending approval by request ID, delegating to ApprovalManager.
 * Returns false if the request was not found.
 */
export function resolveApproval(
  approvalManager: ApprovalManager,
  requestId: string,
  behavior: 'allow' | 'deny',
  message?: string,
): boolean {
  return approvalManager.resolveRequest(requestId, { requestId, behavior, message });
}

/**
 * Cancel all pending approvals for a session (called on session stop/cleanup).
 * Delegates to ApprovalManager.cancelSession — exposed here for use by
 * cleanup code that imports from approval-flow rather than approval-manager.
 */
export function cancelSessionApprovals(approvalManager: ApprovalManager, sessionId: string): void {
  approvalManager.cancelSession(sessionId);
}
