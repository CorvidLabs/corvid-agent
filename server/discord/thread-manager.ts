/**
 * Discord thread response streaming and session recovery.
 *
 * Handles streaming agent responses into Discord threads/channels and
 * re-subscribing to active sessions after server restart.
 *
 * Thread lifecycle (archival, creation) → thread-lifecycle.ts
 * Session state types and DB lookup     → thread-session-map.ts
 * Response subscription implementations → thread-response/
 */

export { archiveStaleThreads, archiveThread, createStandaloneThread } from './thread-lifecycle';
export { subscribeForAdaptiveInlineResponse } from './thread-response/adaptive-response';
export { subscribeForResponseWithEmbed } from './thread-response/embed-response';
export { subscribeForInlineResponse } from './thread-response/inline-response';
export { subscribeForInlineProgressResponse } from './thread-response/progress-response';
export {
  recoverActiveMentionSessions,
  recoverActiveThreadSessions,
  recoverActiveThreadSubscriptions,
  resolveDefaultAgent,
} from './thread-response/recovery';
export { sessionErrorEmbed } from './thread-response/utils';
// Re-export from focused sub-modules so existing consumers don't need to update imports.
export type { ThreadCallbackInfo, ThreadSessionInfo } from './thread-session-map';
export { formatDuration, normalizeTimestamp, tryRecoverThread } from './thread-session-map';
