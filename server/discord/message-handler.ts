/**
 * Discord message routing and handling — thin entry point.
 *
 * Delegates to:
 *   message-router.ts  — top-level routing (threads, mentions, permissions)
 *   work-dispatch.ts   — /work intake and task lifecycle callbacks
 */

export type { MentionSessionInfo, MessageHandlerContext } from './message-router';
export { handleMessage, withAuthorContext } from './message-router';
export { sendTaskResult } from './work-dispatch';
