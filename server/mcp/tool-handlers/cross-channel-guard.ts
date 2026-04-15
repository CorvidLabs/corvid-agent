/**
 * Cross-channel messaging enforcement for corvid_send_message.
 *
 * When an agent session originates from an external channel (Discord, Telegram),
 * calling corvid_send_message routes the inter-agent exchange through AlgoChat
 * internally — but the *originating channel* still expects the agent's final
 * response to flow back to it. This guard detects that mismatch, logs a
 * structured warning, and returns an advisory message that callers can append
 * to the tool result to keep the agent aware of the routing constraint.
 *
 * This module is intentionally separate from messaging.ts so it can be tested
 * and reviewed independently. Integration into handleSendMessage (messaging.ts)
 * requires a governance-approved edit (Layer 1 / Structural). See TODO(#1067).
 *
 * @module
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('CrossChannelGuard');

/**
 * Session sources that represent external user-facing channels.
 * When corvid_send_message is called from these sources, the response
 * must eventually flow back through the originating channel — not through
 * a different one (e.g. AlgoChat).
 */
const CHANNEL_BOUND_SOURCES = new Set(['discord', 'telegram']);

/**
 * Result of a cross-channel check.
 */
export interface CrossChannelCheckResult {
  /** Whether a cross-channel routing concern was detected. */
  isCrossChannel: boolean;
  /**
   * Advisory message to include in the tool result when isCrossChannel is true.
   * Undefined when isCrossChannel is false.
   */
  advisory?: string;
}

/**
 * Check whether a corvid_send_message call from the given session context
 * introduces a cross-channel routing concern.
 *
 * Logs a structured warning when a concern is detected. The returned advisory
 * string should be appended to the tool result so the agent is informed of
 * the constraint.
 *
 * @param sessionSource - The originating channel of the current session (e.g. 'discord', 'web').
 * @param sessionId - The current session ID (for log correlation).
 * @param agentId - The sending agent's ID.
 * @param targetAgentId - The target agent's ID.
 * @returns A result indicating whether a cross-channel concern was detected.
 */
export function checkCrossChannelSend(
  sessionSource: string | undefined,
  sessionId: string | undefined,
  agentId: string,
  targetAgentId: string,
): CrossChannelCheckResult {
  if (!sessionSource || !CHANNEL_BOUND_SOURCES.has(sessionSource)) {
    return { isCrossChannel: false };
  }

  log.warn('Cross-channel send detected', {
    sessionSource,
    sessionId,
    agentId,
    targetAgentId,
  });

  const advisory =
    `[Cross-channel advisory] This session originated from ${sessionSource}. ` +
    `Your final response must be returned directly in this conversation so it routes back to the originating channel — ` +
    `do not rely on ${targetAgentId}'s reply as a substitute for your own response to the user. ` +
    `Use corvid_send_message only to gather information, then reply directly here.`;

  return { isCrossChannel: true, advisory };
}

/**
 * Returns true if the given session source is a channel-bound source that
 * triggers cross-channel enforcement. Exported for use in tests and middleware.
 */
export function isChannelBoundSource(sessionSource: string | undefined): boolean {
  return !!sessionSource && CHANNEL_BOUND_SOURCES.has(sessionSource);
}
