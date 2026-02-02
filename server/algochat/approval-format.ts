import type { ApprovalRequest } from '../process/approval-types';

const MAX_DESCRIPTION_BYTES = 700; // Leave room for prefix/suffix within ~800 byte on-chain limit

/**
 * Format an approval request for sending on-chain via AlgoChat.
 * The output includes a short ID prefix that the user can reference in their reply.
 */
export function formatApprovalForChain(request: ApprovalRequest): string {
    const shortId = request.id.slice(0, 8);
    let description = request.description;

    // Truncate if too long for on-chain message
    const encoded = new TextEncoder().encode(description);
    if (encoded.length > MAX_DESCRIPTION_BYTES) {
        // Binary-safe truncation: slice bytes then decode
        const sliced = encoded.slice(0, MAX_DESCRIPTION_BYTES - 3);
        description = new TextDecoder().decode(sliced) + '...';
    }

    return `[APPROVE?:${shortId}] ${description}\n\nReply 'yes ${shortId}' or 'no ${shortId}'`;
}

/**
 * Parse a user's on-chain reply to an approval request.
 * Matches patterns like:
 *   "yes abc12345"
 *   "approve abc12345"
 *   "no abc12345"
 *   "deny abc12345"
 */
export function parseApprovalResponse(content: string): { shortId: string; behavior: 'allow' | 'deny' } | null {
    const trimmed = content.trim().toLowerCase();

    // Match: yes/approve/y + shortId
    const allowMatch = trimmed.match(/^(?:yes|approve|y)\s+([a-f0-9]{4,10})$/i);
    if (allowMatch) {
        return { shortId: allowMatch[1], behavior: 'allow' };
    }

    // Match: no/deny/n + shortId
    const denyMatch = trimmed.match(/^(?:no|deny|n)\s+([a-f0-9]{4,10})$/i);
    if (denyMatch) {
        return { shortId: denyMatch[1], behavior: 'deny' };
    }

    return null;
}
