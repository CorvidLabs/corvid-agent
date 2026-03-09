/**
 * McpServiceContainer — Holds references to all MCP-related services and
 * builds McpToolContext objects for agent sessions.
 *
 * Extracted from ProcessManager to reduce its field count (14 nullable service
 * fields → 1 composed container) and consolidate the context-building logic.
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { WorkTaskService } from '../work/service';
import type { SchedulerService } from '../scheduler/service';
import type { WorkflowService } from '../workflow/service';
import type { NotificationService } from '../notifications/service';
import type { QuestionDispatcher } from '../notifications/question-dispatcher';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationAttestation } from '../reputation/attestation';
import type { ReputationVerifier } from '../reputation/verifier';
import type { AstParserService } from '../ast/service';
import type { PermissionBroker } from '../permissions/broker';
import type { FlockDirectoryService } from '../flock-directory/service';
import type { ProcessManager } from './manager';
import type { McpToolContext } from '../mcp/tool-handlers';
import type { OwnerQuestionManager } from './owner-question-manager';
import type { ScheduleActionType } from '../../shared/types/schedules';
import { createLogger } from '../lib/logger';

const log = createLogger('McpServiceContainer');

export interface McpServices {
    messenger: AgentMessenger;
    directory: AgentDirectory;
    walletService: AgentWalletService;
    encryptionConfig?: { serverMnemonic?: string | null; network?: string };
    workTaskService?: WorkTaskService;
    schedulerService?: SchedulerService;
    workflowService?: WorkflowService;
    notificationService?: NotificationService;
    questionDispatcher?: QuestionDispatcher;
    reputationScorer?: ReputationScorer;
    reputationAttestation?: ReputationAttestation;
    reputationVerifier?: ReputationVerifier;
    astParserService?: AstParserService;
    permissionBroker?: PermissionBroker;
    processManager?: ProcessManager;
    flockDirectoryService?: FlockDirectoryService;
}

export interface BuildContextOptions {
    agentId: string;
    db: Database;
    sessionSource?: string;
    sessionId?: string;
    depth?: number;
    schedulerMode?: boolean;
    schedulerActionType?: ScheduleActionType;
    resolvedToolPermissions?: string[] | null;
    /** Emit a status event to session subscribers. */
    emitStatus?: (message: string) => void;
    /** Extend the session's inactivity timeout. */
    extendTimeout?: (additionalMs: number) => boolean;
    /** Broadcast a message to owner WS topic. */
    broadcastOwnerMessage?: (message: unknown) => void;
    /** Owner question manager for blocking agent→owner questions. */
    ownerQuestionManager?: OwnerQuestionManager;
}

export class McpServiceContainer {
    private services: McpServices | null = null;

    get isAvailable(): boolean {
        return this.services !== null;
    }

    setServices(services: McpServices): void {
        this.services = services;
        log.info('MCP services registered — agent sessions will receive corvid_* tools');
    }

    buildContext(options: BuildContextOptions): McpToolContext | null {
        if (!this.services) return null;
        const { messenger, directory, walletService, encryptionConfig } = this.services;

        return {
            agentId: options.agentId,
            db: options.db,
            agentMessenger: messenger,
            agentDirectory: directory,
            agentWalletService: walletService,
            depth: options.depth,
            sessionSource: options.sessionSource,
            serverMnemonic: encryptionConfig?.serverMnemonic,
            network: encryptionConfig?.network,
            workTaskService: this.services.workTaskService,
            schedulerService: this.services.schedulerService,
            workflowService: this.services.workflowService,
            schedulerMode: options.schedulerMode,
            schedulerActionType: options.schedulerActionType,
            schedulerToolUsage: options.schedulerMode ? new Map() : undefined,
            emitStatus: options.emitStatus,
            extendTimeout: options.extendTimeout,
            broadcastOwnerMessage: options.broadcastOwnerMessage,
            ownerQuestionManager: options.ownerQuestionManager,
            sessionId: options.sessionId,
            notificationService: this.services.notificationService,
            questionDispatcher: this.services.questionDispatcher,
            reputationScorer: this.services.reputationScorer,
            reputationAttestation: this.services.reputationAttestation,
            reputationVerifier: this.services.reputationVerifier,
            resolvedToolPermissions: options.resolvedToolPermissions,
            astParserService: this.services.astParserService,
            permissionBroker: this.services.permissionBroker,
            processManager: this.services.processManager,
            flockDirectoryService: this.services.flockDirectoryService,
        };
    }
}
