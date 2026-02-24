/**
 * Barrel re-export for all MCP tool handlers.
 *
 * This module preserves the original public API of tool-handlers.ts so that
 * existing imports (`from './tool-handlers'` or `from '../mcp/tool-handlers'`)
 * continue to resolve without changes.
 */

// ─── Shared types & helpers ──────────────────────────────────────────────────
export { type McpToolContext, textResult, errorResult } from './types';

// ─── Messaging ───────────────────────────────────────────────────────────────
export { handleSendMessage, handleListAgents } from './messaging';

// ─── Memory ──────────────────────────────────────────────────────────────────
export { handleSaveMemory, handleRecallMemory } from './memory';

// ─── Session ─────────────────────────────────────────────────────────────────
export { handleExtendTimeout } from './session';

// ─── Credits ─────────────────────────────────────────────────────────────────
export { handleCheckCredits, handleGrantCredits, handleCreditConfig } from './credits';

// ─── Work tasks ──────────────────────────────────────────────────────────────
export { handleCreateWorkTask } from './work';

// ─── Scheduling ──────────────────────────────────────────────────────────────
export { handleManageSchedule } from './scheduling';

// ─── Workflows ───────────────────────────────────────────────────────────────
export { handleManageWorkflow } from './workflow';

// ─── Web search ──────────────────────────────────────────────────────────────
export { handleWebSearch, handleDeepResearch } from './search';

// ─── GitHub ──────────────────────────────────────────────────────────────────
export {
    handleGitHubStarRepo,
    handleGitHubUnstarRepo,
    handleGitHubForkRepo,
    handleGitHubListPrs,
    handleGitHubCreatePr,
    handleGitHubReviewPr,
    handleGitHubCreateIssue,
    handleGitHubListIssues,
    handleGitHubRepoInfo,
    handleGitHubGetPrDiff,
    handleGitHubCommentOnPr,
    handleGitHubFollowUser,
} from './github';

// ─── A2A ─────────────────────────────────────────────────────────────────────
export { handleDiscoverAgent, handleInvokeRemoteAgent } from './a2a';

// ─── Owner communication ─────────────────────────────────────────────────────
export { handleNotifyOwner, handleAskOwner } from './owner';

// ─── Notification configuration ──────────────────────────────────────────────
export { handleConfigureNotifications } from './notifications';

// ─── Reputation & trust ──────────────────────────────────────────────────────
export {
    handleCheckReputation,
    handleCheckHealthTrends,
    handlePublishAttestation,
    handleVerifyAgentReputation,
} from './reputation';

// ─── AST / Code navigation ──────────────────────────────────────────────────
export { handleCodeSymbols, handleFindReferences } from './ast';
