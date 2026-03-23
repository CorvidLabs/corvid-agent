/**
 * Conversation access control — determines whether a participant may message an agent.
 *
 * Evaluation order:
 * 1. Owner always passes (bypass everything)
 * 2. Agent must exist and be enabled
 * 3. Blocklist check (denied even if on allowlist)
 * 4. Mode check: private → deny, allowlist → check per-agent allowlist, public → allow
 * 5. Rate-limit check
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { ConversationAccessResult, ConversationMode, DenyReason } from '../../shared/types';

// Re-export types for spec coverage
export type { ConversationAccessResult, ConversationMode, DenyReason };
import { getAgent } from '../db/agents';
import { isOnAgentBlocklist, isOnAgentAllowlist, getConversationRateLimit } from '../db/conversation-access';
import { createLogger } from '../lib/logger';

const log = createLogger('ConversationAccess');

/**
 * Check whether a participant is allowed to send a conversational message
 * to the given agent.
 */
export function checkConversationAccess(
    db: Database,
    agentId: string,
    participant: string,
    config: AlgoChatConfig,
): ConversationAccessResult {
    // 1. Owner always passes
    if (config.ownerAddresses.has(participant)) {
        return { allowed: true, reason: null };
    }

    // 2. Agent must exist and be enabled
    const agent = getAgent(db, agentId);
    if (!agent || agent.disabled) {
        return { allowed: false, reason: 'agent_disabled' };
    }

    // 3. Blocklist check — takes precedence over allowlist
    if (isOnAgentBlocklist(db, agentId, participant)) {
        log.info('Conversation blocked (blocklist)', { agentId, address: participant.slice(0, 8) + '...' });
        return { allowed: false, reason: 'blocked' };
    }

    // 4. Mode check
    const mode: ConversationMode = agent.conversationMode || 'private';

    if (mode === 'private') {
        log.info('Conversation denied (private mode)', { agentId, address: participant.slice(0, 8) + '...' });
        return { allowed: false, reason: 'private' };
    }

    if (mode === 'allowlist') {
        if (!isOnAgentAllowlist(db, agentId, participant)) {
            log.info('Conversation denied (not on allowlist)', { agentId, address: participant.slice(0, 8) + '...' });
            return { allowed: false, reason: 'not_on_allowlist' };
        }
    }

    // mode === 'public' or passed allowlist check — proceed to rate limit

    // 5. Rate-limit check
    const windowSeconds = agent.conversationRateLimitWindow || 3600;
    const maxMessages = agent.conversationRateLimitMax || 10;
    const rateStatus = getConversationRateLimit(db, agentId, participant, windowSeconds, maxMessages);

    if (!rateStatus.allowed) {
        log.info('Conversation rate-limited', {
            agentId,
            address: participant.slice(0, 8) + '...',
            remaining: rateStatus.remaining,
            resetsAt: rateStatus.resetsAt,
        });
        return { allowed: false, reason: 'rate_limited' };
    }

    return { allowed: true, reason: null };
}

/**
 * Get the conversation mode for an agent. Returns 'private' for unknown agents.
 */
export function getAgentConversationMode(db: Database, agentId: string): ConversationMode {
    const agent = getAgent(db, agentId);
    return agent?.conversationMode || 'private';
}

/**
 * Update an agent's conversation mode.
 * Does NOT enforce self-protection — the caller (route handler) must check that.
 */
export function setAgentConversationMode(db: Database, agentId: string, mode: ConversationMode): void {
    db.query(
        `UPDATE agents SET conversation_mode = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(mode, agentId);
}
