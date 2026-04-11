/**
 * Builds the resume prompt for a session by assembling conversation history,
 * context summaries, observations, and server-restart notices.
 *
 * Extracted from manager.ts to isolate prompt construction logic.
 *
 * @module
 */

import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import { boostObservation, listObservations } from '../db/observations';
import { getSessionMessages } from '../db/sessions';
interface SessionMeta {
  contextSummary?: string;
}

/**
 * Build a resume prompt from session history, observations, and context.
 *
 * Assembles:
 * - Previous context summary (from context resets)
 * - Recent observations for the agent (boosted on access)
 * - Conversation history (last 20 messages, each truncated to 2000 chars)
 * - Server restart completion notice (if applicable)
 * - The new user prompt (if any)
 */
export function buildResumePrompt(
  db: Database,
  session: Session,
  meta: SessionMeta | undefined,
  newPrompt?: string,
): string {
  const messages = getSessionMessages(db, session.id);

  // Check for a pending server-restart confirmation and clear it
  const restartRow = db
    .query('SELECT server_restart_initiated_at FROM sessions WHERE id = ?')
    .get(session.id) as { server_restart_initiated_at: string | null } | null;
  const restartInitiatedAt = restartRow?.server_restart_initiated_at ?? null;
  if (restartInitiatedAt) {
    db.query('UPDATE sessions SET server_restart_initiated_at = NULL WHERE id = ?').run(session.id);
  }

  // Load recent active observations for this agent and increment their access count
  const observations = session.agentId
    ? listObservations(db, session.agentId, { status: 'active', limit: 5 })
    : [];
  for (const obs of observations) {
    boostObservation(db, obs.id, 0);
  }

  if (messages.length === 0) return newPrompt ?? session.initialPrompt ?? '';

  const recent = messages.slice(-20);
  const historyLines = recent
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const text = m.content.length > 2000 ? `${m.content.slice(0, 2000)}...` : m.content;
      return `[${role}]: ${text}`;
    });

  const instruction = newPrompt
    ? 'The following is the conversation history from this session. Use it for context when responding to the new message.'
    : 'The following is the conversation history from this session. The session was interrupted -- continue the conversation based on the history above.';

  const parts: string[] = [];

  // Prepend context summary from previous session lifetime if available
  if (meta?.contextSummary) {
    parts.push('<previous_context_summary>', meta.contextSummary, '</previous_context_summary>', '');
  }

  // Inject relevant short-term observations to restore per-agent context (#1751)
  if (observations.length > 0) {
    const obsLines = observations.map((o) => `- [${o.source}] (score: ${o.relevanceScore.toFixed(1)}) ${o.content}`);
    parts.push(
      '<recent_observations>',
      'Relevant observations from past sessions with this agent:',
      '',
      ...obsLines,
      '</recent_observations>',
      '',
    );
  }

  parts.push('<conversation_history>', instruction, '', ...historyLines, '</conversation_history>');

  // If a server restart was initiated from this session, inject a completion note
  // so the agent does not re-trigger the restart on resume (fixes #1570).
  if (restartInitiatedAt) {
    parts.push(
      '',
      '<server_restart_completed>',
      `The server was restarted during this session (initiated at ${restartInitiatedAt}).`,
      'The restart completed successfully — the server is now running with updated code.',
      'Do NOT restart the server again. Continue with the next task in your plan.',
      '</server_restart_completed>',
    );
  }

  if (newPrompt) {
    parts.push('', newPrompt);
  }

  return parts.join('\n');
}
