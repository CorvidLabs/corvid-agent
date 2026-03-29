import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../../algochat/agent-messenger';
import type { AgentDirectory } from '../../algochat/agent-directory';
import type { AgentWalletService } from '../../algochat/agent-wallet';
import type { WorkTaskService } from '../../work/service';
import type { SchedulerService } from '../../scheduler/service';
import type { WorkflowService } from '../../workflow/service';
import type { OwnerQuestionManager } from '../../process/owner-question-manager';
import type { NotificationService } from '../../notifications/service';
import type { QuestionDispatcher } from '../../notifications/question-dispatcher';
import type { ReputationScorer } from '../../reputation/scorer';
import type { ReputationAttestation } from '../../reputation/attestation';
import type { ReputationVerifier } from '../../reputation/verifier';
import type { AstParserService } from '../../ast/service';
import type { PermissionBroker } from '../../permissions/broker';
import type { ProcessManager } from '../../process/manager';
import type { FlockDirectoryService } from '../../flock-directory/service';
import type { BrowserService } from '../../browser/service';
import type { SessionInvocationBudget } from '../../a2a/invocation-guard';
import type { ScheduleActionType } from '../../../shared/types/schedules';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolAccessConfig, SessionMessageRateLimiter } from '../tool-guardrails';

export interface McpToolContext {
    agentId: string;
    db: Database;
    agentMessenger: AgentMessenger;
    agentDirectory: AgentDirectory;
    agentWalletService: AgentWalletService;
    depth?: number;
    /** Session source — 'web', 'algochat', 'agent', or 'discord'. */
    sessionSource?: string;
    /** Emit a status message for UI progress updates (e.g. "Querying CorvidLabs..."). */
    emitStatus?: (message: string) => void;
    /** Server mnemonic for encryption (from AlgoChat config). */
    serverMnemonic?: string | null;
    /** Network name for encryption key policy (localnet allows default key). */
    network?: string;
    /** Work task service for creating agent work tasks. */
    workTaskService?: WorkTaskService;
    /** Scheduler service for managing automated schedules. */
    schedulerService?: SchedulerService;
    /** Workflow service for graph-based orchestration. */
    workflowService?: WorkflowService;
    /** Extend the current session's timeout by the given ms. */
    extendTimeout?: (additionalMs: number) => boolean;
    /** True when the session was started by the scheduler — restricts certain tools. */
    schedulerMode?: boolean;
    /** The action type that triggered this scheduler session (enables tiered tool gating). */
    schedulerActionType?: ScheduleActionType;
    /** Mutable counters for rate-limiting gated tools in scheduler sessions. */
    schedulerToolUsage?: Map<string, number>;
    /** Broadcast a message to all connected WS clients on the 'owner' topic. */
    broadcastOwnerMessage?: (message: unknown) => void;
    /** Owner question manager for blocking agent→owner questions. */
    ownerQuestionManager?: OwnerQuestionManager;
    /** Session ID for this agent session (needed for question tracking). */
    sessionId?: string;
    /** Notification service for multi-channel owner notifications. */
    notificationService?: NotificationService;
    /** Question dispatcher for sending questions to external channels. */
    questionDispatcher?: QuestionDispatcher;
    /** Reputation scorer for querying agent reputation. */
    reputationScorer?: ReputationScorer;
    /** Reputation attestation service for publishing on-chain. */
    reputationAttestation?: ReputationAttestation;
    /** Reputation verifier for scanning remote agent attestations. */
    reputationVerifier?: ReputationVerifier;
    /** Pre-resolved tool permissions (agent base + skill bundle tools + project bundle tools).
     *  When set, used instead of reading agent.mcpToolPermissions directly. */
    resolvedToolPermissions?: string[] | null;
    /** AST parser service for structural code navigation (corvid_code_symbols, corvid_find_references). */
    astParserService?: AstParserService;
    /** Permission Broker for capability-based action authorization. */
    permissionBroker?: PermissionBroker;
    /** Process manager for launching council sessions. */
    processManager?: ProcessManager;
    /** Flock Directory service for agent registry operations. */
    flockDirectoryService?: FlockDirectoryService;
    /** Per-session invocation budget for remote agent calls. */
    invocationBudget?: SessionInvocationBudget;
    /** Browser automation service (Playwright + system Chrome). */
    browserService?: BrowserService;
    /** Tool access configuration for session-level guardrails (closes #1054). */
    toolAccessConfig?: ToolAccessConfig;
    /** Per-session rate limiter for agent-to-agent messaging (closes #1054). */
    messageRateLimiter?: SessionMessageRateLimiter;
}

export function textResult(text: string): CallToolResult {
    return { content: [{ type: 'text', text }] };
}

export function errorResult(text: string): CallToolResult {
    return { content: [{ type: 'text', text }], isError: true };
}
