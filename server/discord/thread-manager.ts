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

// Re-export from focused sub-modules so existing consumers don't need to update imports.
export type { ThreadSessionInfo, ThreadCallbackInfo } from './thread-session-map';
export { normalizeTimestamp, formatDuration, tryRecoverThread } from './thread-session-map';
export { archiveThread, archiveStaleThreads, createStandaloneThread } from './thread-lifecycle';
export { sessionErrorEmbed } from './thread-response/utils';
export { subscribeForResponseWithEmbed } from './thread-response/embed-response';
export { subscribeForInlineResponse } from './thread-response/inline-response';
export { subscribeForAdaptiveInlineResponse } from './thread-response/adaptive-response';
export { subscribeForInlineProgressResponse } from './thread-response/progress-response';
export {
  recoverActiveThreadSubscriptions,
  recoverActiveMentionSessions,
  recoverActiveThreadSessions,
  resolveDefaultAgent,
} from './thread-response/recovery';
