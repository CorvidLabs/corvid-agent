/**
 * Barrel re-export for all MCP tool handlers.
 *
 * This module preserves the original public API of tool-handlers.ts so that
 * existing imports (`from './tool-handlers'` or `from '../mcp/tool-handlers'`)
 * continue to resolve without changes.
 */

// ─── A2A ─────────────────────────────────────────────────────────────────────
export { handleDiscoverAgent, handleInvokeRemoteAgent } from './a2a';
// ─── AST / Code navigation ──────────────────────────────────────────────────
export { handleCodeSymbols, handleFindReferences } from './ast';
// ─── Browser automation ────────────────────────────────────────────────────
export { handleBrowser } from './browser';
// ─── Contacts / identity ────────────────────────────────────────────────────
export { handleLookupContact } from './contacts';
// ─── Councils ─────────────────────────────────────────────────────────────────
export { handleLaunchCouncil } from './councils';
// ─── Credits ─────────────────────────────────────────────────────────────────
export { handleCheckCredits, handleCreditConfig, handleGrantCredits } from './credits';
// ─── Discord messaging ─────────────────────────────────────────────────────
export { handleDiscordSendImage, handleDiscordSendMessage } from './discord';
// ─── Flock Directory ────────────────────────────────────────────────────────
export { handleFlockDirectory } from './flock-directory';
// ─── GitHub ──────────────────────────────────────────────────────────────────
export {
  handleGitHubCommentOnPr,
  handleGitHubCreateIssue,
  handleGitHubCreatePr,
  handleGitHubFollowUser,
  handleGitHubForkRepo,
  handleGitHubGetPrDiff,
  handleGitHubListIssues,
  handleGitHubListPrs,
  handleGitHubRepoInfo,
  handleGitHubReviewPr,
  handleGitHubStarRepo,
  handleGitHubUnstarRepo,
} from './github';
// ─── Shared library (CRVLIB) ──────────────────────────────────────────────
export { handleLibraryDelete, handleLibraryListOnChain, handleLibraryRead, handleLibraryWrite } from './library';
// ─── Memory ──────────────────────────────────────────────────────────────────
export {
  handleDeleteMemory,
  handleReadOnChainMemories,
  handleRecallMemory,
  handleSaveMemory,
  handleSyncOnChainMemories,
} from './memory';
// ─── Messaging ───────────────────────────────────────────────────────────────
export { handleListAgents, handleSendMessage } from './messaging';
// ─── Notification configuration ──────────────────────────────────────────────
export { handleConfigureNotifications } from './notifications';
// ─── Observations (memory graduation) ──────────────────────────────────────
export {
  handleBoostObservation,
  handleDismissObservation,
  handleListObservations,
  handleObservationStats,
  handleRecordObservation,
} from './observations';
// ─── Owner communication ─────────────────────────────────────────────────────
export { handleAskOwner, handleNotifyOwner } from './owner';
// ─── Projects ────────────────────────────────────────────────────────────────
export { handleCurrentProject, handleListProjects } from './projects';
// ─── Reputation & trust ──────────────────────────────────────────────────────
export {
  handleCheckHealthTrends,
  handleCheckReputation,
  handlePublishAttestation,
  handleVerifyAgentReputation,
} from './reputation';
// ─── Scheduling ──────────────────────────────────────────────────────────────
export { handleManageSchedule } from './scheduling';
// ─── Web search ──────────────────────────────────────────────────────────────
export { handleDeepResearch, handleWebSearch } from './search';
// ─── Server operations ────────────────────────────────────────────────────
export { handleRestartServer } from './server-ops';
// ─── Session ─────────────────────────────────────────────────────────────────
export { handleExtendTimeout } from './session';
// ─── Shared types & helpers ──────────────────────────────────────────────────
export { errorResult, type McpToolContext, textResult } from './types';
// ─── Work tasks ──────────────────────────────────────────────────────────────
export { handleCheckWorkStatus, handleCreateWorkTask, handleListWorkTasks } from './work';
// ─── Workflows ───────────────────────────────────────────────────────────────
export { handleManageWorkflow } from './workflow';
