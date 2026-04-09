/**
 * AlgoChat initialization — sets up bridge, wallet, directory, and messenger.
 *
 * Extracted from server/index.ts as part of god-module decomposition (#442).
 */

import type { Database } from 'bun:sqlite';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BunServer = import('bun').Server<any>;

import type { AstParserService } from '../ast/service';
import type { UsageMeter } from '../billing/meter';
import { createUsdcRevenueService } from '../billing/usdc-revenue';
import type { AlgoChatState } from '../bootstrap';
import type { BrowserService } from '../browser/service';
import type { MemorySyncService } from '../db/memory-sync';
import { publishToTenant } from '../events/broadcasting';
import { createFlockClient } from '../flock-directory/deploy';
import type { FlockDirectoryService } from '../flock-directory/service';
import type { HealthMonitorService } from '../health/monitor';
import { assertProductionReady, createKeyProvider, detectPlaintextKeyConfig } from '../lib/key-provider';
import { createLogger } from '../lib/logger';
import type { ShutdownCoordinator } from '../lib/shutdown-coordinator';
import type { MemoryGraduationService } from '../memory/graduation-service';
import type { LibrarySyncService } from '../memory/library-sync';
import type { QuestionDispatcher } from '../notifications/question-dispatcher';
import type { ResponsePollingService } from '../notifications/response-poller';
import type { NotificationService } from '../notifications/service';
import type { PermissionBroker } from '../permissions/broker';
import type { MentionPollingService } from '../polling/service';
import type { ProcessManager } from '../process/manager';
import type { ReputationAttestation } from '../reputation/attestation';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationVerifier } from '../reputation/verifier';
import type { SchedulerService } from '../scheduler/service';
import { resolveAgentTenant } from '../tenant/resolve';
import type { WorkTaskService } from '../work/service';
import type { WorkflowService } from '../workflow/service';
import { broadcastAlgoChatMessage } from '../ws/handler';
import { AgentDirectory } from './agent-directory';
import { AgentMessenger } from './agent-messenger';
import { AgentWalletService } from './agent-wallet';
import { AlgoChatBridge } from './bridge';
import type { AlgoChatConfig } from './config';
import { OnChainTransactor } from './on-chain-transactor';
import { initAlgoChatService } from './service';
import { WorkCommandRouter } from './work-command-router';

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
  graduationService: MemoryGraduationService;
  librarySyncService: LibrarySyncService;
  responsePollingService: ResponsePollingService;
  usageMeter: UsageMeter;
  healthMonitorService: HealthMonitorService;
  mentionPollingService: MentionPollingService;
  flockDirectoryService: FlockDirectoryService;
  browserService?: BrowserService;
}

/**
 * Initialize AlgoChat services: bridge, wallet, directory, messenger.
 * Mutates algochatState in place with the created service instances.
 */
export async function initAlgoChat(deps: AlgoChatInitDeps): Promise<void> {
  const {
    db,
    server,
    processManager,
    algochatConfig,
    algochatState,
    workTaskService,
    schedulerService,
    workflowService,
    notificationService,
    questionDispatcher,
    reputationScorer,
    reputationAttestation,
    reputationVerifier,
    astParserService,
    permissionBroker,
    shutdownCoordinator,
    flockDirectoryService,
    browserService,
  } = deps;

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
      log.warn(
        `Failed to init agent network (${algochatConfig.agentNetwork}), falling back to ${algochatConfig.network}`,
      );
    }
  }

  // Use the agent-network config for wallet and messenger operations
  const agentNetworkConfig =
    algochatConfig.agentNetwork !== algochatConfig.network
      ? { ...algochatConfig, network: algochatConfig.agentNetwork }
      : algochatConfig;

  algochatState.bridge = new AlgoChatBridge(db, processManager, algochatConfig, service);

  // Scan for plaintext key configuration issues (#924)
  const plaintextWarnings = detectPlaintextKeyConfig(agentNetworkConfig.network);
  if (plaintextWarnings.length > 0 && agentNetworkConfig.network === 'mainnet') {
    log.error('Plaintext key configuration issues detected on mainnet', {
      warnings: plaintextWarnings,
    });
  }

  // Initialize agent wallet service on the agent network (localnet for funding/keys)
  const keyProvider = createKeyProvider(agentNetworkConfig.network, agentNetworkConfig.mnemonic);

  // Validate production readiness on testnet/mainnet (blocks startup if misconfigured)
  try {
    await assertProductionReady(keyProvider, agentNetworkConfig.network);
  } catch (err) {
    log.error('KeyProvider production readiness check failed', {
      network: agentNetworkConfig.network,
      error: err instanceof Error ? err.message : String(err),
    });
    if (agentNetworkConfig.network === 'mainnet') {
      throw err; // Fatal on mainnet — refuse to start with weak key config
    }
    // On testnet, warn but continue (allows development with degraded security)
    log.warn('Continuing with degraded key security on testnet — NOT safe for mainnet');
  }

  algochatState.walletService = new AgentWalletService(db, agentNetworkConfig, agentService, keyProvider);

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
  const onChainTransactor = new OnChainTransactor(
    db,
    agentService,
    algochatState.walletService,
    algochatState.directory,
  );
  algochatState.bridge.setOnChainTransactor(onChainTransactor);

  algochatState.messenger = new AgentMessenger(db, agentNetworkConfig, onChainTransactor, processManager);
  const workCommandRouter = new WorkCommandRouter(db);
  workCommandRouter.setWorkTaskService(workTaskService);
  algochatState.messenger.setWorkCommandRouter(workCommandRouter);
  algochatState.bridge.setAgentMessenger(algochatState.messenger);

  // Register MCP services so agent sessions get corvid_* tools
  processManager.setMcpServices({
    messenger: algochatState.messenger,
    directory: algochatState.directory,
    walletService: algochatState.walletService,
    encryptionConfig: {
      serverMnemonic: algochatConfig.mnemonic,
      network: agentNetworkConfig.network,
    },
    workTaskService,
    schedulerService,
    workflowService,
    notificationService,
    questionDispatcher,
    reputationScorer,
    reputationAttestation,
    reputationVerifier,
    astParserService,
    permissionBroker,
    processManager,
    flockDirectoryService,
    browserService,
  });

  // Forward AlgoChat events to WebSocket clients
  algochatState.bridge.onEvent((participant, content, direction) => {
    broadcastAlgoChatMessage(server, participant, content, direction);
  });

  // Publish encryption keys for all existing agent wallets
  await algochatState.walletService.publishAllKeys();

  // Ensure all agent wallets are opted into USDC ASA (required for receiving USDC)
  await algochatState.walletService.ensureAllUsdcOptIns();

  algochatState.bridge.start();
  shutdownCoordinator.register({ name: 'AlgoChatBridge', priority: 25, handler: () => algochatState.bridge?.stop() });

  // Start USDC revenue service if OWNER_WALLET_ADDRESS is configured
  const usdcRevenueService = createUsdcRevenueService(db, algochatState.walletService);
  if (usdcRevenueService) {
    usdcRevenueService.start();
    shutdownCoordinator.register({ name: 'UsdcRevenue', priority: 20, handler: () => usdcRevenueService.stop() });
  }

  // ── Flock Directory on-chain integration ─────────────────────────────
  // Deploy (or reconnect to) the FlockDirectory smart contract and wire
  // it into the off-chain FlockDirectoryService for hybrid operation.
  try {
    const onChainClient = await createFlockClient(db, service, algochatConfig.network);
    if (onChainClient) {
      flockDirectoryService.setOnChainClient(onChainClient, {
        senderAddress: service.chatAccount.address,
        sk: service.chatAccount.account.sk,
        network: algochatConfig.network,
      });
      log.info('Flock Directory on-chain integration active', {
        appId: onChainClient.getAppId(),
        network: algochatConfig.network,
      });
    }

    // Self-register this corvid-agent instance
    const serverUrl = process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const agentName = process.env.AGENT_NAME ?? 'corvid-agent';
    const selfAddress = service.chatAccount.address;
    await flockDirectoryService.selfRegister({
      address: selfAddress,
      name: agentName,
      description: 'CorvidAgent — autonomous AI development agent on Algorand',
      instanceUrl: serverUrl,
      capabilities: ['code', 'review', 'test', 'deploy', 'algochat', 'mcp'],
    });

    // ── Periodic heartbeat + stale sweep ────────────────────────────
    // Heartbeat every 12 hours to keep this agent active in the directory.
    // Stale sweep every 6 hours to mark unresponsive agents as inactive (24h threshold).
    // This gives ~2 heartbeats/day — enough to verify the directory is working
    // without being excessive.
    const HEARTBEAT_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
    const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

    const heartbeatTimer = setInterval(() => {
      flockDirectoryService
        .selfRegister({
          address: selfAddress,
          name: agentName,
          description: 'CorvidAgent — autonomous AI development agent on Algorand',
          instanceUrl: serverUrl,
          capabilities: ['code', 'review', 'test', 'deploy', 'algochat', 'mcp'],
        })
        .catch((err) => {
          log.debug('Flock Directory heartbeat failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }, HEARTBEAT_INTERVAL_MS);

    const sweepTimer = setInterval(() => {
      try {
        flockDirectoryService.sweepStaleAgents();
      } catch (err) {
        log.debug('Flock Directory stale sweep failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, SWEEP_INTERVAL_MS);

    shutdownCoordinator.register({
      name: 'FlockDirectoryTimers',
      priority: 0,
      handler: () => {
        clearInterval(heartbeatTimer);
        clearInterval(sweepTimer);
      },
    });

    log.info('Flock Directory heartbeat and sweep timers started', {
      heartbeatIntervalMin: HEARTBEAT_INTERVAL_MS / 60_000,
      sweepIntervalMin: SWEEP_INTERVAL_MS / 60_000,
    });
  } catch (err) {
    log.warn('Flock Directory on-chain init failed (off-chain still works)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Switch AlgoChat to a different network (testnet/mainnet).
 */
export async function switchNetwork(deps: AlgoChatInitDeps, network: 'testnet' | 'mainnet'): Promise<void> {
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
  const {
    algochatConfig,
    algochatState,
    memorySyncService,
    schedulerService,
    workflowService,
    notificationService,
    questionDispatcher,
    responsePollingService,
    usageMeter,
    healthMonitorService,
    mentionPollingService,
  } = deps;

  // Wire agent message broadcasts once messenger is available
  if (algochatState.messenger) {
    algochatState.messenger.onMessageUpdate((message) => {
      const msg = JSON.stringify({ type: 'agent_message_update', message });
      const fromTid = message.fromAgentId ? resolveAgentTenant(deps.db, message.fromAgentId) : undefined;
      publishToTenant(deps.server, 'algochat', msg, fromTid);
    });
  }

  // Start memory sync and graduation services if AlgoChat is available
  if (algochatState.messenger) {
    memorySyncService.setServices(algochatState.messenger, algochatConfig.mnemonic, algochatConfig.network);
    if (algochatState.walletService) {
      memorySyncService.setWalletService(algochatState.walletService);
    }
    memorySyncService.start();

    deps.graduationService.setServices(algochatState.messenger, algochatConfig.mnemonic, algochatConfig.network);
    if (algochatState.walletService) {
      deps.graduationService.setWalletService(algochatState.walletService);
    }
    deps.graduationService.start();

    // Start library sync service (CRVLIB — shared plaintext knowledge base)
    if (algochatState.walletService) {
      deps.librarySyncService.setServices(algochatState.walletService, algochatConfig.network);
      deps.librarySyncService.start();
    }
  }

  // Start the scheduler now that all services are available
  if (algochatState.messenger) {
    schedulerService.setAgentMessenger(algochatState.messenger);
    workflowService.setAgentMessenger(algochatState.messenger);
    notificationService.setAgentMessenger(algochatState.messenger);
    questionDispatcher.setAgentMessenger(algochatState.messenger);
    deps.workTaskService.setAgentMessenger(algochatState.messenger);
  }
  notificationService.start();
  responsePollingService.start();
  schedulerService.start();
  mentionPollingService.start();
  workflowService.start();
  usageMeter.start();
  healthMonitorService.start();
}
