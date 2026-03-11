/**
 * Service bootstrap — constructs, wires, and registers all application services.
 *
 * Extracted from server/index.ts to keep the composition root thin.
 * See issue #442 for the decomposition roadmap.
 */
import type { Database } from 'bun:sqlite';
import { closeDb } from './db/connection';
import { PerformanceCollector } from './performance/collector';
import { ProcessManager } from './process/manager';
import { SessionLifecycleManager } from './process/session-lifecycle';
import { MemorySyncService } from './db/memory-sync';
import { loadAlgoChatConfig } from './algochat/config';
import type { AlgoChatBridge } from './algochat/bridge';
import type { AgentWalletService } from './algochat/agent-wallet';
import type { AgentDirectory } from './algochat/agent-directory';
import type { AgentMessenger } from './algochat/agent-messenger';
import { SelfTestService } from './selftest/service';
import { WorkTaskService } from './work/service';
import { TaskQueueService } from './work/queue';
import { SchedulerService } from './scheduler/service';
import { UsageMonitor } from './usage/monitor';
import { WebhookService } from './webhooks/service';
import { MentionPollingService } from './polling/service';
import { WorkflowService } from './workflow/service';
import { NotificationService } from './notifications/service';
import { QuestionDispatcher } from './notifications/question-dispatcher';
import { ResponsePollingService } from './notifications/response-poller';
import { SandboxManager } from './sandbox/manager';
import { SandboxLifecycleAdapter } from './sandbox/lifecycle-adapter';
import { MarketplaceService } from './marketplace/service';
import { MarketplaceFederation } from './marketplace/federation';
import { ReputationScorer } from './reputation/scorer';
import { ReputationAttestation } from './reputation/attestation';
import { ReputationVerifier } from './reputation/verifier';
import { MemoryManager } from './memory/index';
import { AutonomousLoopService } from './improvement/service';
import { OutcomeTrackerService } from './feedback/outcome-tracker';
import { DailyReviewService } from './improvement/daily-review';
import { TelegramBridge } from './telegram/bridge';
import { DiscordBridge } from './discord/bridge';
import { SlackBridge } from './slack/bridge';
import { TenantService } from './tenant/context';
import { enableMultiTenantGuard } from './tenant/db-filter';
import { BillingService } from './billing/service';
import { UsageMeter } from './billing/meter';
import { HealthMonitorService } from './health/monitor';
import { type HealthCheckDeps } from './health/service';
import { DedupService } from './lib/dedup';
import { ShutdownCoordinator } from './lib/shutdown-coordinator';
import { createLogger } from './lib/logger';
import { LlmProviderRegistry } from './providers/registry';
import { AnthropicProvider } from './providers/anthropic/provider';
import { OllamaProvider } from './providers/ollama/provider';
import { AstParserService } from './ast/service';
import { PermissionBroker } from './permissions/broker';
import { FlockDirectoryService } from './flock-directory/service';
import { listProjects, createProject } from './db/projects';
import { initObservability } from './observability/index';

const log = createLogger('Bootstrap');

/**
 * Mutable holder for AlgoChat services that are initialized asynchronously
 * after the server starts. Fields start as null and are set by initAlgoChat().
 */
export interface AlgoChatState {
    bridge: AlgoChatBridge | null;
    walletService: AgentWalletService | null;
    messenger: AgentMessenger | null;
    directory: AgentDirectory | null;
}

/**
 * All application services, constructed and wired by {@link bootstrapServices}.
 */
export interface ServiceContainer {
    // Core infrastructure
    dedupService: DedupService;
    performanceCollector: PerformanceCollector;
    shutdownCoordinator: ShutdownCoordinator;
    providerRegistry: LlmProviderRegistry;
    astParserService: AstParserService;

    // Process management
    processManager: ProcessManager;
    sessionLifecycle: SessionLifecycleManager;

    // AlgoChat (mutable — set by initAlgoChat after server starts)
    algochatConfig: ReturnType<typeof loadAlgoChatConfig>;
    algochatState: AlgoChatState;
    memorySyncService: MemorySyncService;

    // Work orchestration
    selfTestService: SelfTestService;
    workTaskService: WorkTaskService;
    taskQueueService: TaskQueueService;
    schedulerService: SchedulerService;
    webhookService: WebhookService;
    mentionPollingService: MentionPollingService;
    workflowService: WorkflowService;

    // Notifications
    notificationService: NotificationService;
    questionDispatcher: QuestionDispatcher;
    responsePollingService: ResponsePollingService;

    // Optional subsystems
    sandboxManager: SandboxManager | null;
    marketplaceService: MarketplaceService;
    marketplaceFederation: MarketplaceFederation;
    reputationScorer: ReputationScorer;
    reputationAttestation: ReputationAttestation;
    reputationVerifier: ReputationVerifier;
    memoryManager: MemoryManager;
    outcomeTrackerService: OutcomeTrackerService;
    improvementLoopService: AutonomousLoopService;
    dailyReviewService: DailyReviewService;
    usageMonitor: UsageMonitor;
    healthMonitorService: HealthMonitorService;

    // Tenant & billing
    multiTenant: boolean;
    tenantService: TenantService;
    billingService: BillingService;
    usageMeter: UsageMeter;

    // Communication bridges
    telegramBridge: TelegramBridge | null;
    discordBridge: DiscordBridge | null;
    slackBridge: SlackBridge | null;

    // Security
    permissionBroker: PermissionBroker;

    // Agent directory
    flockDirectoryService: FlockDirectoryService;
}

/**
 * Construct all application services, wire cross-dependencies,
 * and register shutdown handlers.
 *
 * This is a synchronous-heavy function with a few fire-and-forget async calls
 * (observability init, Ollama health check). The returned container is ready
 * to use immediately; async side-effects complete in the background.
 */
export async function bootstrapServices(db: Database, startTime: number): Promise<ServiceContainer> {
    // ── Core infrastructure ──────────────────────────────────────────────
    const dedupService = DedupService.init(db);
    dedupService.start();

    const performanceCollector = new PerformanceCollector(db, 'corvid-agent.db', startTime);
    performanceCollector.start();

    const SHUTDOWN_GRACE_MS = parseInt(process.env.SHUTDOWN_GRACE_MS ?? '30000', 10);
    const shutdownCoordinator = new ShutdownCoordinator(SHUTDOWN_GRACE_MS);

    // Non-blocking, opt-in — logs warnings internally when OTLP endpoint is unavailable
    initObservability().catch(() => {});

    const astParserService = new AstParserService();
    astParserService.init().catch((err) => {
        log.warn('AST parser service failed to initialize', { error: err instanceof Error ? err.message : String(err) });
    });

    const permissionBroker = new PermissionBroker(db);

    // ── LLM providers ────────────────────────────────────────────────────
    const providerRegistry = LlmProviderRegistry.getInstance();
    providerRegistry.register(new AnthropicProvider());
    const ollamaProvider = new OllamaProvider();
    providerRegistry.register(ollamaProvider);

    // Ollama startup validation — health-check when Ollama is the only enabled provider
    const isOllamaOnly = !providerRegistry.get('anthropic') && !providerRegistry.get('openai');
    if (isOllamaOnly) {
        const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
        try {
            const tagsResponse = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(5_000) });
            if (tagsResponse.ok) {
                const tagsData = (await tagsResponse.json()) as { models?: Array<{ name: string }> };
                const modelCount = tagsData.models?.length ?? 0;
                if (modelCount === 0) {
                    log.warn('Ollama is running but no models are pulled. Suggested: ollama pull qwen3:8b');
                } else {
                    log.info(`Ollama health check OK — ${modelCount} model(s) available`);
                }
            } else {
                log.error(`Ollama health check failed (HTTP ${tagsResponse.status}). Is Ollama running at ${ollamaHost}?`);
            }
        } catch (err) {
            log.error('Ollama is unreachable — install from https://ollama.com and run: ollama serve', {
                host: ollamaHost,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    ollamaProvider.refreshModels().catch((err) => {
        log.warn('Ollama not available on startup', { error: err instanceof Error ? err.message : String(err) });
    });

    // Ensure a project exists for the server's own codebase
    {
        const projects = listProjects(db);
        const selfProject = projects.find((p) => p.workingDir === process.cwd());
        if (!selfProject) {
            createProject(db, { name: 'corvid-agent', workingDir: process.cwd() });
        }
    }

    // ── Process management ───────────────────────────────────────────────
    const processManager = new ProcessManager(db);
    const sessionLifecycle = new SessionLifecycleManager(db);
    const memorySyncService = new MemorySyncService(db);

    // ── AlgoChat state (initialized later by initAlgoChat) ───────────────
    const algochatConfig = loadAlgoChatConfig();
    const algochatState: AlgoChatState = {
        bridge: null,
        walletService: null,
        messenger: null,
        directory: null,
    };

    // ── Work orchestration ───────────────────────────────────────────────
    const selfTestService = new SelfTestService(db, processManager);
    const workTaskService = new WorkTaskService(db, processManager, astParserService);
    workTaskService.recoverInterruptedTasks().catch((err) =>
        log.error('Failed to recover interrupted work tasks', { error: err instanceof Error ? err.message : String(err) }),
    );

    // TaskQueueService — dispatches pending tasks with concurrency control
    const taskQueueService = new TaskQueueService(db, workTaskService);
    workTaskService.setTaskQueueService(taskQueueService);
    taskQueueService.start();

    const schedulerService = new SchedulerService(db, processManager, workTaskService);
    const webhookService = new WebhookService(db, processManager, workTaskService);
    const mentionPollingService = new MentionPollingService(db, processManager, workTaskService);
    const workflowService = new WorkflowService(db, processManager, workTaskService);

    // ── Notifications ────────────────────────────────────────────────────
    const notificationService = new NotificationService(db);
    const questionDispatcher = new QuestionDispatcher(db);
    const responsePollingService = new ResponsePollingService(db, processManager.ownerQuestionManager);

    // ── Optional subsystems ──────────────────────────────────────────────
    const sandboxEnabled = process.env.SANDBOX_ENABLED === 'true';
    const sandboxManager = sandboxEnabled ? new SandboxManager(db) : null;
    let sandboxLifecycleAdapter: SandboxLifecycleAdapter | null = null;
    if (sandboxManager) {
        sandboxLifecycleAdapter = new SandboxLifecycleAdapter(db, sandboxManager, processManager);
        sandboxLifecycleAdapter.start();
        sandboxManager.initialize().catch((err: Error) => {
            log.warn('Sandbox manager failed to initialize', { error: err.message });
        });
    }

    const marketplaceService = new MarketplaceService(db);
    const marketplaceFederation = new MarketplaceFederation(db);
    const flockDirectoryService = new FlockDirectoryService(db);

    const reputationScorer = new ReputationScorer(db);
    const reputationAttestation = new ReputationAttestation(db);
    const reputationVerifier = new ReputationVerifier();

    const memoryManager = new MemoryManager(db);
    const outcomeTrackerService = new OutcomeTrackerService(db, memoryManager);

    const improvementLoopService = new AutonomousLoopService(
        db, processManager, workTaskService, memoryManager, reputationScorer,
    );
    improvementLoopService.setOutcomeTrackerService(outcomeTrackerService);

    const dailyReviewService = new DailyReviewService(db, memoryManager);

    // ── Cross-dependency wiring ──────────────────────────────────────────
    schedulerService.setImprovementLoopService(improvementLoopService);
    schedulerService.setReputationServices(reputationScorer, reputationAttestation);
    schedulerService.setNotificationService(notificationService);
    schedulerService.setDailyReviewService(dailyReviewService);
    webhookService.setSchedulerService(schedulerService);
    mentionPollingService.setSchedulerService(schedulerService);

    // ── Usage monitoring ─────────────────────────────────────────────────
    const usageMonitor = new UsageMonitor(db, processManager);
    usageMonitor.setNotificationService(notificationService);
    usageMonitor.backfillCosts();
    usageMonitor.start();

    // ── Health monitoring ────────────────────────────────────────────────
    const healthMonitorDeps: HealthCheckDeps = {
        db,
        startTime,
        version: (require('../package.json') as { version: string }).version,
        getActiveSessions: () => processManager.getActiveSessionIds(),
        isAlgoChatConnected: () => algochatState.bridge !== null,
        isShuttingDown: () => shutdownCoordinator.getStatus().phase !== 'idle',
        getSchedulerStats: () => schedulerService.getStats(),
        getMentionPollingStats: () => mentionPollingService.getStats(),
        getWorkflowStats: () => workflowService.getStats(),
    };
    const healthMonitorService = new HealthMonitorService(db, healthMonitorDeps);
    healthMonitorService.setNotificationService(notificationService);

    // ── Multi-tenant ─────────────────────────────────────────────────────
    const multiTenant = process.env.MULTI_TENANT === 'true';
    const tenantService = new TenantService(db, multiTenant);
    if (multiTenant) {
        enableMultiTenantGuard();
        log.info('Multi-tenant guard enabled — DEFAULT_TENANT_ID calls will throw');
    }

    // ── Billing ──────────────────────────────────────────────────────────
    const billingService = new BillingService(db);
    const usageMeter = new UsageMeter(db, billingService);

    // ── Communication bridges (opt-in via env vars) ──────────────────────
    let telegramBridge: TelegramBridge | null = null;
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        telegramBridge = new TelegramBridge(
            db,
            processManager,
            {
                botToken: process.env.TELEGRAM_BOT_TOKEN,
                chatId: process.env.TELEGRAM_CHAT_ID,
                allowedUserIds: (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
                mode: (process.env.TELEGRAM_BRIDGE_MODE as 'chat' | 'work_intake') ?? undefined,
            },
            workTaskService,
        );
        telegramBridge.start();
        shutdownCoordinator.registerService('TelegramBridge', telegramBridge, 20);
        log.info('Telegram bridge initialized');
    }

    let discordBridge: DiscordBridge | null = null;
    if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID) {
        discordBridge = new DiscordBridge(
            db,
            processManager,
            {
                botToken: process.env.DISCORD_BOT_TOKEN,
                channelId: process.env.DISCORD_CHANNEL_ID,
                allowedUserIds: process.env.DISCORD_ALLOWED_USER_IDS
                    ? process.env.DISCORD_ALLOWED_USER_IDS.split(',').map(s => s.trim()).filter(Boolean)
                    : [],
                additionalChannelIds: process.env.DISCORD_ADDITIONAL_CHANNEL_IDS
                    ? process.env.DISCORD_ADDITIONAL_CHANNEL_IDS.split(',').map(s => s.trim()).filter(Boolean)
                    : undefined,
                mode: (process.env.DISCORD_BRIDGE_MODE as 'chat' | 'work_intake') ?? undefined,
                defaultAgentId: process.env.DISCORD_DEFAULT_AGENT_ID ?? undefined,
                appId: process.env.DISCORD_APP_ID ?? undefined,
                guildId: process.env.DISCORD_GUILD_ID ?? undefined,
                publicMode: process.env.DISCORD_PUBLIC_MODE === 'true',
                rolePermissions: process.env.DISCORD_ROLE_PERMISSIONS
                    ? JSON.parse(process.env.DISCORD_ROLE_PERMISSIONS)
                    : undefined,
                defaultPermissionLevel: process.env.DISCORD_DEFAULT_PERMISSION_LEVEL
                    ? parseInt(process.env.DISCORD_DEFAULT_PERMISSION_LEVEL, 10)
                    : undefined,
                rateLimitByLevel: process.env.DISCORD_RATE_LIMIT_BY_LEVEL
                    ? JSON.parse(process.env.DISCORD_RATE_LIMIT_BY_LEVEL)
                    : undefined,
            },
            workTaskService,
        );
        discordBridge.start();
        shutdownCoordinator.registerService('DiscordBridge', discordBridge, 20);
        log.info('Discord bridge initialized');
    }

    let slackBridge: SlackBridge | null = null;
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET) {
        slackBridge = new SlackBridge(db, processManager, {
            botToken: process.env.SLACK_BOT_TOKEN,
            signingSecret: process.env.SLACK_SIGNING_SECRET,
            channelId: process.env.SLACK_CHANNEL_ID ?? '',
            allowedUserIds: process.env.SLACK_ALLOWED_USER_IDS
                ? process.env.SLACK_ALLOWED_USER_IDS.split(',').map(s => s.trim()).filter(Boolean)
                : [],
        });
        slackBridge.start();
        shutdownCoordinator.registerService('SlackBridge', slackBridge, 20);
        log.info('Slack bridge initialized');
    }

    // ── Shutdown registration ────────────────────────────────────────────
    // Priority convention: 0=pollers/schedulers, 10=processing, 20=bridges, 30=process manager, 40=persistence, 50=database
    shutdownCoordinator.registerService('ResponsePollingService', responsePollingService, 0);
    shutdownCoordinator.registerService('NotificationService', notificationService, 0);
    shutdownCoordinator.registerService('WorkflowService', workflowService, 0);
    shutdownCoordinator.registerService('SchedulerService', schedulerService, 0);
    shutdownCoordinator.register({ name: 'TaskQueueService', priority: 0, handler: () => taskQueueService.stop() });
    shutdownCoordinator.registerService('MentionPollingService', mentionPollingService, 0);
    shutdownCoordinator.registerService('SessionLifecycleManager', sessionLifecycle, 0);
    shutdownCoordinator.register({ name: 'UsageMonitor', priority: 0, handler: () => usageMonitor.stop() });
    shutdownCoordinator.registerService('HealthMonitorService', healthMonitorService, 0);
    shutdownCoordinator.registerService('UsageMeter', usageMeter, 5);
    shutdownCoordinator.register({ name: 'MarketplaceFederation', priority: 5, handler: () => marketplaceFederation.stopPeriodicSync() });
    shutdownCoordinator.register({
        name: 'WorkTaskDrain',
        priority: 10,
        handler: () => workTaskService.drainRunningTasks(),
        timeoutMs: 310_000, // 5 min drain + 10s buffer
    });
    shutdownCoordinator.registerService('MemorySyncService', memorySyncService, 10);
    if (sandboxLifecycleAdapter) {
        shutdownCoordinator.register({ name: 'SandboxLifecycleAdapter', priority: 14, handler: () => sandboxLifecycleAdapter!.stop() });
    }
    if (sandboxManager) {
        shutdownCoordinator.register({ name: 'SandboxManager', priority: 15, handler: () => sandboxManager.shutdown(), timeoutMs: 10_000 });
    }
    shutdownCoordinator.register({ name: 'ProcessManager', priority: 30, handler: () => processManager.shutdown(), timeoutMs: 15_000 });
    shutdownCoordinator.register({ name: 'PerformanceCollector', priority: 0, handler: () => performanceCollector.stop() });
    shutdownCoordinator.registerService('DedupService', dedupService, 40);
    shutdownCoordinator.register({ name: 'Database', priority: 50, handler: () => closeDb() });

    return {
        dedupService,
        performanceCollector,
        shutdownCoordinator,
        providerRegistry,
        astParserService,
        processManager,
        sessionLifecycle,
        algochatConfig,
        algochatState,
        memorySyncService,
        selfTestService,
        workTaskService,
        taskQueueService,
        schedulerService,
        webhookService,
        mentionPollingService,
        workflowService,
        notificationService,
        questionDispatcher,
        responsePollingService,
        sandboxManager,
        marketplaceService,
        marketplaceFederation,
        reputationScorer,
        reputationAttestation,
        reputationVerifier,
        memoryManager,
        outcomeTrackerService,
        improvementLoopService,
        dailyReviewService,
        usageMonitor,
        healthMonitorService,
        multiTenant,
        tenantService,
        billingService,
        usageMeter,
        telegramBridge,
        discordBridge,
        slackBridge,
        permissionBroker,
        flockDirectoryService,
    };
}
