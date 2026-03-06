/**
 * AlgoChat initialization — sets up bridge, wallet, directory, and messenger.
 *
 * Extracted from server/index.ts as part of god-module decomposition (#442).
 */

import type { Database } from 'bun:sqlite';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BunServer = import('bun').Server<any>;
import type { ProcessManager } from '../process/manager';
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
import type { ShutdownCoordinator } from '../lib/shutdown-coordinator';
import type { MemorySyncService } from '../db/memory-sync';
import type { ResponsePollingService } from '../notifications/response-poller';
import type { UsageMeter } from '../billing/meter';
import type { HealthMonitorService } from '../health/monitor';
import type { MentionPollingService } from '../polling/service';
import type { AlgoChatConfig } from './config';
import type { AlgoChatState } from '../bootstrap';
import { initAlgoChatService } from './service';
import { AlgoChatBridge } from './bridge';
import { AgentWalletService } from './agent-wallet';
import { AgentDirectory } from './agent-directory';
import { AgentMessenger } from './agent-messenger';
import { OnChainTransactor } from './on-chain-transactor';
import { WorkCommandRouter } from './work-command-router';
import { broadcastAlgoChatMessage } from '../ws/handler';
import { publishToTenant } from '../events/broadcasting';
import { createLogger } from '../lib/logger';

const log = createLogger('AlgoChatInit');

export interface AlgoChatInitDeps {
    db: Database;
    server: BunServer;
    processManager: ProcessManager;
    algochatConfig: AlgoChatConfig;
    algochatState: AlgoChatState;
    workTaskService: WorkTaskService;
    schedulerService: SchedulerService;
    workflowService: WorkflowService;
    notificationService: NotificationService;
    questionDispatcher: QuestionDispatcher;
    reputationScorer: ReputationScorer;
    reputationAttestation: ReputationAttestation;
    reputationVerifier: ReputationVerifier;
    astParserService: AstParserService;
    permissionBroker: PermissionBroker;
    shutdownCoordinator: ShutdownCoordinator;
    memorySyncService: MemorySyncService;
    responsePollingService: ResponsePollingService;
    usageMeter: UsageMeter;
    healthMonitorService: HealthMonitorService;
    mentionPollingService: MentionPollingService;
}

/**
 * Initialize AlgoChat services: bridge, wallet, directory, messenger.
 * Mutates algochatState in place with the created service instances.
 */
export async function initAlgoChat(deps: AlgoChatInitDeps): Promise<void> {
    const { db, server, processManager, algochatConfig, algochatState, workTaskService,
        schedulerService, workflowService, notificationService, questionDispatcher,
        reputationScorer, reputationAttestation, reputationVerifier, astParserService,
        permissionBroker, shutdownCoordinator } = deps;

    if (!algochatConfig.enabled) {
        log.info('AlgoChat disabled');
        return;
    }

    const service = await initAlgoChatService(algochatConfig);
    if (!service) return;

    // If agent network differs from main network, create a separate service for agents
    let agentService = service;
    if (algochatConfig.agentNetwork !== algochatConfig.network) {
        const agentConfig = { ...algochatConfig, network: algochatConfig.agentNetwork };
        const localService = await initAlgoChatService(agentConfig);
        if (localService) {
            agentService = localService;
            log.info(`Agent network: ${algochatConfig.agentNetwork} (separate from ${algochatConfig.network})`);
        } else {
            log.warn(`Failed to init agent network (${algochatConfig.agentNetwork}), falling back to ${algochatConfig.network}`);
        }
    }

    // Use the agent-network config for wallet and messenger operations
    const agentNetworkConfig = algochatConfig.agentNetwork !== algochatConfig.network
        ? { ...algochatConfig, network: algochatConfig.agentNetwork }
        : algochatConfig;

    algochatState.bridge = new AlgoChatBridge(db, processManager, algochatConfig, service);

    // Initialize agent wallet service on the agent network (localnet for funding/keys)
    algochatState.walletService = new AgentWalletService(db, agentNetworkConfig, agentService);

    // Only let the bridge use agent wallets if both networks match
    if (algochatConfig.agentNetwork === algochatConfig.network) {
        algochatState.bridge.setAgentWalletService(algochatState.walletService);
    }

    // Initialize agent directory and messenger on the agent network
    algochatState.directory = new AgentDirectory(db, algochatState.walletService);
    algochatState.bridge.setAgentDirectory(algochatState.directory);
    algochatState.bridge.setApprovalManager(processManager.approvalManager);
    algochatState.bridge.setOwnerQuestionManager(processManager.ownerQuestionManager);
    algochatState.bridge.setWorkTaskService(workTaskService);

    // Create OnChainTransactor — handles all Algorand transaction operations
    const onChainTransactor = new OnChainTransactor(db, agentService, algochatState.walletService, algochatState.directory);
    algochatState.bridge.setOnChainTransactor(onChainTransactor);

    algochatState.messenger = new AgentMessenger(db, agentNetworkConfig, onChainTransactor, processManager);
    const workCommandRouter = new WorkCommandRouter(db);
    workCommandRouter.setWorkTaskService(workTaskService);
    algochatState.messenger.setWorkCommandRouter(workCommandRouter);
    algochatState.bridge.setAgentMessenger(algochatState.messenger);

    // Register MCP services so agent sessions get corvid_* tools
    processManager.setMcpServices(
        algochatState.messenger, algochatState.directory, algochatState.walletService,
        { serverMnemonic: algochatConfig.mnemonic, network: agentNetworkConfig.network },
        workTaskService, schedulerService, workflowService, notificationService, questionDispatcher,
        reputationScorer, reputationAttestation, reputationVerifier, astParserService, permissionBroker,
    );

    // Forward AlgoChat events to WebSocket clients
    algochatState.bridge.onEvent((participant, content, direction) => {
        broadcastAlgoChatMessage(server, participant, content, direction);
    });

    // Publish encryption keys for all existing agent wallets
    await algochatState.walletService.publishAllKeys();

    algochatState.bridge.start();
    shutdownCoordinator.register({ name: 'AlgoChatBridge', priority: 25, handler: () => algochatState.bridge?.stop() });
}

/**
 * Switch AlgoChat to a different network (testnet/mainnet).
 */
export async function switchNetwork(
    deps: AlgoChatInitDeps,
    network: 'testnet' | 'mainnet',
): Promise<void> {
    log.info(`Switching AlgoChat network to ${network}`);

    // Stop existing services
    if (deps.algochatState.bridge) {
        deps.algochatState.bridge.stop();
        deps.algochatState.bridge = null;
    }
    deps.algochatState.walletService = null;
    deps.algochatState.messenger = null;
    deps.algochatState.directory = null;

    // Update the config
    (deps.algochatConfig as { network: string }).network = network;

    // Reinitialize
    await initAlgoChat(deps);
    log.info(`Network switched to ${network}`);
}

/**
 * Post-initialization wiring — call after initAlgoChat completes.
 * Sets up messenger-dependent services and starts background services.
 */
export function wirePostInit(deps: AlgoChatInitDeps): void {
    const { algochatConfig, algochatState, memorySyncService, schedulerService,
        workflowService, notificationService, questionDispatcher,
        responsePollingService, usageMeter, healthMonitorService, mentionPollingService } = deps;

    // Wire agent message broadcasts once messenger is available
    if (algochatState.messenger) {
        algochatState.messenger.onMessageUpdate((message) => {
            const msg = JSON.stringify({ type: 'agent_message_update', message });
            const fromTid = message.fromAgentId
                ? resolveAgentTenantForBroadcast(deps.db, message.fromAgentId)
                : undefined;
            publishToTenant(deps.server, 'algochat', msg, fromTid);
        });
    }

    // Start memory sync service if AlgoChat is available
    if (algochatState.messenger) {
        memorySyncService.setServices(algochatState.messenger, algochatConfig.mnemonic, algochatConfig.network);
        memorySyncService.start();
    }

    // Start the scheduler now that all services are available
    if (algochatState.messenger) {
        schedulerService.setAgentMessenger(algochatState.messenger);
        workflowService.setAgentMessenger(algochatState.messenger);
        notificationService.setAgentMessenger(algochatState.messenger);
        questionDispatcher.setAgentMessenger(algochatState.messenger);
    }
    notificationService.start();
    responsePollingService.start();
    schedulerService.start();
    mentionPollingService.start();
    workflowService.start();
    usageMeter.start();
    healthMonitorService.start();
}

// Internal helper — TODO: deduplicate with broadcasting.ts in a future PR
function resolveAgentTenantForBroadcast(db: Database, agentId: string): string | undefined {
    const row = db.query('SELECT tenant_id FROM agents WHERE id = ?').get(agentId) as { tenant_id: string } | null;
    const tid = row?.tenant_id;
    return tid && tid !== 'default' ? tid : undefined;
}
