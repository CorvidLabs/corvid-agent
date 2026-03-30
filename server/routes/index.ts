import type { Database } from 'bun:sqlite';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AlgoChatBridge } from '../algochat/bridge';
import { loadAlgoChatConfig } from '../algochat/config';
import type { UsageMeter } from '../billing/meter';
import type { BillingService } from '../billing/service';
import { updateMemoryTxid } from '../db/agent-memories';
import { searchAgentMessages } from '../db/agent-messages';
import { getWalletMessages, getWalletSummaries, searchAlgoChatMessages } from '../db/algochat-messages';
import { backupDatabase } from '../db/backup';
import { getBalance, grantCredits } from '../db/credits';
import { listConversations } from '../db/sessions';
import type { OutcomeTrackerService } from '../feedback/outcome-tracker';
import type { FlockDirectoryService } from '../flock-directory/service';
import { encryptMemoryContent } from '../lib/crypto';
import { createLogger } from '../lib/logger';
import { handleRouteError, json, safeNumParam } from '../lib/response';
import {
  CreditGrantSchema,
  EscalationResolveSchema,
  isAlgorandAddressFormat,
  OperationalModeSchema,
  PSKContactNicknameSchema,
  parseBodyOrThrow,
  SelfTestSchema,
  SwitchNetworkSchema,
  ValidationError,
} from '../lib/validation';
import type { MarketplaceFederation } from '../marketplace/federation';
import type { MarketplaceService } from '../marketplace/service';
import type { MemoryGraduationService } from '../memory/graduation-service';
import { type AuthConfig, applyCors, buildCorsHeaders, loadAuthConfig } from '../middleware/auth';
import { EndpointRateLimiter, loadEndpointRateLimitConfig } from '../middleware/endpoint-rate-limit';
import {
  applyGuards,
  authGuard,
  contentLengthGuard,
  createRequestContext,
  dashboardAuthGuard,
  endpointRateLimitGuard,
  type RequestContext,
  rateLimitGuard,
  requiresAdminRole,
  roleGuard,
  tenantGuard,
} from '../middleware/guards';
import { loadRateLimitConfig, RateLimiter } from '../middleware/rate-limit';
import type { PerformanceCollector } from '../performance/collector';
import type { PluginRegistry } from '../plugins/registry';
import type { MentionPollingService } from '../polling/service';
import type { ProcessManager } from '../process/manager';
import type { ReputationAttestation } from '../reputation/attestation';
import type { ReputationScorer } from '../reputation/scorer';
import type { SandboxManager } from '../sandbox/manager';
import type { SchedulerService } from '../scheduler/service';
import type { TenantService } from '../tenant/context';
import type { WebhookService } from '../webhooks/service';
import type { WorkTaskService } from '../work/service';
import type { WorkflowService } from '../workflow/service';
import { handleA2ARoutes } from './a2a';
import { handleAgentRoutes } from './agents';
import { handleAllowlistRoutes } from './allowlist';
import { handleAnalyticsRoutes } from './analytics';
import { handleAuthFlowRoutes } from './auth-flow';
import { handleBillingRoutes } from './billing';
import { handleBrainViewerRoutes } from './brain-viewer';
import { handleBridgeDeliveryRoutes } from './bridge-delivery';
import { handleBuddyRoutes } from './buddy';
import { handleContactRoutes } from './contacts';
import { handleCouncilRoutes } from './councils';
import { handleCursorRoutes } from './cursor';
import { handleDashboardRoutes } from './dashboard';
import { handleDiscordImageRoutes } from './discord-image';
import { handleExamRoutes } from './exam';
import { handleFeedbackRoutes } from './feedback';
import { handleFlockDirectoryRoutes } from './flock-directory';
import { handleFlockTestingRoutes } from './flock-testing';
import { handleGitHubAllowlistRoutes } from './github-allowlist';
import { handleLibraryRoutes } from './library';
import { handleGitHubPRDiffRoutes } from './github-pr-diff';
import { handleMarketplaceRoutes } from './marketplace';
import { handleMarketplaceAnalyticsRoutes } from './marketplace-analytics';
import { handleMcpApiRoutes } from './mcp-api';
import { handleMcpServerRoutes } from './mcp-servers';
import { handleMentionPollingRoutes } from './mention-polling';
import { handleOnboardingRoutes } from './onboarding';
import { handleOpenRouterRoutes } from './openrouter';
import { handlePerformanceRoutes } from './performance';
import { handlePersonaRoutes } from './personas';
import { handlePluginRoutes } from './plugins';
import { handleBrowseDirs, handleProjectRoutes } from './projects';
import { handleProposalRoutes } from './proposals';
import { handleRepoBlocklistRoutes } from './repo-blocklist';
import { handleReputationRoutes } from './reputation';
import { handleSandboxRoutes } from './sandbox';
import { handleScheduleRoutes } from './schedules';
import { handleSecurityOverviewRoutes } from './security-overview';
import { handleSessionRoutes } from './sessions';
import { handleSettingsRoutes } from './settings';
import { handleSkillBundleRoutes } from './skill-bundles';
import { handleSlackRoutes } from './slack';
import { handleSystemLogRoutes } from './system-logs';
import { handleTenantRoutes } from './tenants';
import { handleToolCatalogRoutes } from './tool-catalog';
import { handleUsageRoutes } from './usage';
import { handleVariantRoutes } from './variants';
import { handleWebhookRoutes } from './webhooks';
import { handleWorkTaskRoutes } from './work-tasks';
import { handleWorkflowRoutes } from './workflows';

// Load auth config once at module level
let authConfig: AuthConfig | null = null;
function getAuthConfig(): AuthConfig {
  if (!authConfig) authConfig = loadAuthConfig();
  return authConfig;
}

/** Reset cached auth config — for test isolation only. */
export function resetAuthConfigForTest(): void {
  authConfig = null;
}

// Load rate limiters once at module level
const rateLimiter = new RateLimiter(loadRateLimitConfig());
const endpointRateLimiter = new EndpointRateLimiter(loadEndpointRateLimitConfig());

/** Attach database to rate limiter for persistent state across restarts. */
export function initRateLimiterDb(db: Database): void {
  rateLimiter.setDb(db);
}

const log = createLogger('Router');

/**
 * Global error handler — catches any unhandled error from route handlers
 * and returns a proper JSON 500 response instead of crashing the server.
 */
function errorResponse(err: unknown): Response {
  // Log full error details server-side — never expose to client
  if (err instanceof Error) {
    log.error('Unhandled route error', { error: err.message, stack: err.stack });
  } else {
    log.error('Unhandled route error', { error: String(err) });
  }
  // Return a generic 500 — serverError() never includes error details in response
  return json({ error: 'Internal server error', timestamp: new Date().toISOString() }, 500);
}

export type NetworkSwitchFn = (network: 'testnet' | 'mainnet') => Promise<void>;

export interface RouteServices {
  db: Database;
  processManager: ProcessManager;
  algochatBridge: AlgoChatBridge | null;
  agentWalletService?: AgentWalletService | null;
  agentMessenger?: AgentMessenger | null;
  workTaskService?: WorkTaskService | null;
  selfTestService?: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } } | null;
  agentDirectory?: AgentDirectory | null;
  networkSwitchFn?: NetworkSwitchFn | null;
  schedulerService?: SchedulerService | null;
  webhookService?: WebhookService | null;
  mentionPollingService?: MentionPollingService | null;
  workflowService?: WorkflowService | null;
  sandboxManager?: SandboxManager | null;
  marketplace?: MarketplaceService | null;
  marketplaceFederation?: MarketplaceFederation | null;
  reputationScorer?: ReputationScorer | null;
  reputationAttestation?: ReputationAttestation | null;
  billing?: BillingService | null;
  usageMeter?: UsageMeter | null;
  tenantService?: TenantService | null;
  performanceCollector?: PerformanceCollector | null;
  outcomeTracker?: OutcomeTrackerService | null;
  flockDirectory?: FlockDirectoryService | null;
  pluginRegistry?: PluginRegistry | null;
}

export async function handleRequest(
  req: Request,
  db: Database,
  processManager: ProcessManager,
  algochatBridge: AlgoChatBridge | null,
  agentWalletService?: AgentWalletService | null,
  agentMessenger?: AgentMessenger | null,
  workTaskService?: WorkTaskService | null,
  selfTestService?: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } } | null,
  agentDirectory?: AgentDirectory | null,
  networkSwitchFn?: NetworkSwitchFn | null,
  schedulerService?: SchedulerService | null,
  webhookService?: WebhookService | null,
  mentionPollingService?: MentionPollingService | null,
  workflowService?: WorkflowService | null,
  sandboxManager?: SandboxManager | null,
  marketplace?: MarketplaceService | null,
  marketplaceFederation?: MarketplaceFederation | null,
  reputationScorer?: ReputationScorer | null,
  reputationAttestation?: ReputationAttestation | null,
  billing?: BillingService | null,
  usageMeter?: UsageMeter | null,
  tenantService?: TenantService | null,
  performanceCollector?: PerformanceCollector | null,
  outcomeTracker?: OutcomeTrackerService | null,
  flockDirectory?: FlockDirectoryService | null,
  onAgentChange?: (() => void) | null,
  graduationService?: MemoryGraduationService | null,
  pluginRegistry?: PluginRegistry | null,
): Promise<Response | null> {
  const url = new URL(req.url);
  const config = getAuthConfig();

  // CORS preflight — use configured CORS headers
  if (req.method === 'OPTIONS') {
    const corsHeaders = buildCorsHeaders(req, config);
    corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Slack webhook — validated by signing secret, no API key auth
  if (url.pathname === '/slack/events' && req.method === 'POST') {
    const slackResponse = handleSlackRoutes(req, url, db, processManager);
    if (slackResponse) {
      const resolved = slackResponse instanceof Promise ? await slackResponse : slackResponse;
      applyCors(resolved, req, config);
      return resolved;
    }
  }

  // Non-API paths (e.g. /agents, /projects) are client SPA routes served
  // as static files — they must bypass auth so the browser can load the HTML.
  // Auth for API requests is handled below.
  if (
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/a2a/') &&
    !url.pathname.startsWith('/webhooks/') &&
    !url.pathname.startsWith('/slack/')
  ) {
    return null;
  }

  // Build request context and apply declarative guard chain
  const context = createRequestContext(url.searchParams.get('wallet') || undefined);

  // Guard chain: content-length → global rate limit → auth → tenant → endpoint rate limit → (optional role guard)
  const guards = [
    contentLengthGuard(),
    rateLimitGuard(rateLimiter),
    authGuard(config),
    tenantGuard(db, tenantService ?? null),
    endpointRateLimitGuard(endpointRateLimiter),
  ];

  // Dashboard-specific auth: requires DASHBOARD_API_KEY on non-localhost
  if (url.pathname.startsWith('/api/dashboard')) {
    guards.push(dashboardAuthGuard(config.bindHost));
  }

  // Apply admin role guard for sensitive endpoints
  if (requiresAdminRole(url.pathname)) {
    guards.push(roleGuard('admin'));
  }

  const denied = applyGuards(req, url, context, ...guards);
  if (denied) {
    applyCors(denied, req, config);
    return denied;
  }

  try {
    const response = await handleRoutes(
      req,
      url,
      db,
      context,
      processManager,
      algochatBridge,
      agentWalletService,
      agentMessenger,
      workTaskService,
      selfTestService,
      agentDirectory,
      networkSwitchFn,
      schedulerService,
      webhookService,
      mentionPollingService,
      workflowService,
      sandboxManager,
      marketplace,
      marketplaceFederation,
      reputationScorer,
      reputationAttestation,
      billing,
      usageMeter,
      tenantService,
      performanceCollector,
      outcomeTracker,
      flockDirectory,
      onAgentChange,
      graduationService,
      pluginRegistry,
    );
    if (response) {
      applyCors(response, req, config);
      if (context.rateLimitHeaders) {
        for (const [header, value] of Object.entries(context.rateLimitHeaders)) {
          response.headers.set(header, value);
        }
      }
    }
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}

/** Inner route dispatch — separated so the global try/catch in handleRequest can wrap it. */
async function handleRoutes(
  req: Request,
  url: URL,
  db: Database,
  context: RequestContext,
  processManager: ProcessManager,
  algochatBridge: AlgoChatBridge | null,
  agentWalletService?: AgentWalletService | null,
  agentMessenger?: AgentMessenger | null,
  workTaskService?: WorkTaskService | null,
  selfTestService?: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } } | null,
  agentDirectory?: AgentDirectory | null,
  networkSwitchFn?: NetworkSwitchFn | null,
  schedulerService?: SchedulerService | null,
  webhookService?: WebhookService | null,
  mentionPollingService?: MentionPollingService | null,
  workflowService?: WorkflowService | null,
  sandboxManager?: SandboxManager | null,
  marketplace?: MarketplaceService | null,
  marketplaceFederation?: MarketplaceFederation | null,
  reputationScorer?: ReputationScorer | null,
  reputationAttestation?: ReputationAttestation | null,
  billing?: BillingService | null,
  usageMeter?: UsageMeter | null,
  tenantService?: TenantService | null,
  performanceCollector?: PerformanceCollector | null,
  outcomeTracker?: OutcomeTrackerService | null,
  flockDirectory?: FlockDirectoryService | null,
  onAgentChange?: (() => void) | null,
  graduationService?: MemoryGraduationService | null,
  pluginRegistry?: PluginRegistry | null,
): Promise<Response | null> {
  if (url.pathname === '/api/browse-dirs' && req.method === 'GET') {
    return handleBrowseDirs(req, url, db);
  }

  // Tenant routes (registration, info, members)
  const tenantResponse = await handleTenantRoutes(req, url, db, context, tenantService ?? null);
  if (tenantResponse) return tenantResponse;

  // Onboarding status (lightweight, no auth dependency on services)
  const onboardingResponse = handleOnboardingRoutes(req, url, db, algochatBridge, agentWalletService ?? null);
  if (onboardingResponse) return onboardingResponse;

  const projectResponse = handleProjectRoutes(req, url, db, context);
  if (projectResponse) return projectResponse;

  const agentResponse = handleAgentRoutes(req, url, db, context, agentWalletService, agentMessenger, onAgentChange);
  if (agentResponse) return agentResponse;

  // Persona routes (agent identity/personality)
  const personaResponse = handlePersonaRoutes(req, url, db, context);
  if (personaResponse) return personaResponse;

  // Buddy mode routes (paired agent collaboration)
  const buddyResponse = handleBuddyRoutes(req, url, db, context);
  if (buddyResponse) return buddyResponse;

  // Variant routes (preset skill + persona combinations)
  const variantResponse = handleVariantRoutes(req, url, db, context);
  if (variantResponse) return variantResponse;

  // Skill bundle routes (composable tool + prompt packages)
  const skillBundleResponse = handleSkillBundleRoutes(req, url, db, context);
  if (skillBundleResponse) return skillBundleResponse;

  // External MCP server config routes
  const mcpServerResponse = handleMcpServerRoutes(req, url, db, context);
  if (mcpServerResponse) return mcpServerResponse;

  // Tool catalog (public, no auth required)
  const toolCatalogResponse = handleToolCatalogRoutes(req, url);
  if (toolCatalogResponse) return toolCatalogResponse;

  const allowlistResponse = handleAllowlistRoutes(req, url, db);
  if (allowlistResponse) return allowlistResponse;

  const githubAllowlistResponse = handleGitHubAllowlistRoutes(req, url, db);
  if (githubAllowlistResponse) return githubAllowlistResponse;

  const githubPRDiffResponse = handleGitHubPRDiffRoutes(req, url, context);
  if (githubPRDiffResponse)
    return githubPRDiffResponse instanceof Promise ? await githubPRDiffResponse : githubPRDiffResponse;

  const repoBlocklistResponse = handleRepoBlocklistRoutes(req, url, db, context);
  if (repoBlocklistResponse) return repoBlocklistResponse;

  // Contact identity routes (cross-platform identity mapping)
  const contactResponse = handleContactRoutes(req, url, db, context);
  if (contactResponse) return contactResponse;

  // Library routes (CRVLIB — on-chain ARC-69 library entries)
  const libraryResponse = handleLibraryRoutes(req, url, db, context);
  if (libraryResponse) return libraryResponse;

  const securityOverviewResponse = handleSecurityOverviewRoutes(req, url, db);
  if (securityOverviewResponse) return securityOverviewResponse;

  const bridgeDeliveryResponse = handleBridgeDeliveryRoutes(req, url);
  if (bridgeDeliveryResponse) return bridgeDeliveryResponse;

  const discordImageResponse = handleDiscordImageRoutes(req, url, context);
  if (discordImageResponse)
    return discordImageResponse instanceof Promise ? await discordImageResponse : discordImageResponse;

  const dashboardResponse = handleDashboardRoutes(req, url, db, context);
  if (dashboardResponse) return dashboardResponse;

  const brainViewerResponse = handleBrainViewerRoutes(req, url, db, context, graduationService);
  if (brainViewerResponse)
    return brainViewerResponse instanceof Promise ? await brainViewerResponse : brainViewerResponse;

  const analyticsResponse = handleAnalyticsRoutes(req, url, db, context);
  if (analyticsResponse) return analyticsResponse;

  const openRouterResponse = handleOpenRouterRoutes(req, url, context);
  if (openRouterResponse) return openRouterResponse instanceof Promise ? await openRouterResponse : openRouterResponse;

  const cursorResponse = handleCursorRoutes(req, url);
  if (cursorResponse) return cursorResponse instanceof Promise ? await cursorResponse : cursorResponse;

  const performanceResponse = handlePerformanceRoutes(req, url, db, performanceCollector ?? null);
  if (performanceResponse) return performanceResponse;

  const usageResponse = handleUsageRoutes(req, url, db, context);
  if (usageResponse) return usageResponse;

  const feedbackResponse = handleFeedbackRoutes(req, url, db, outcomeTracker ?? null, context);
  if (feedbackResponse) return feedbackResponse;

  const systemLogResponse = handleSystemLogRoutes(req, url, db, context);
  if (systemLogResponse) return systemLogResponse;

  const settingsResponse = await handleSettingsRoutes(req, url, db, context, getAuthConfig());
  if (settingsResponse) return settingsResponse;

  const sessionResponse = await handleSessionRoutes(req, url, db, processManager, context, workTaskService);
  if (sessionResponse) return sessionResponse;

  const councilResponse = handleCouncilRoutes(req, url, db, processManager, agentMessenger, context, reputationScorer);
  if (councilResponse) return councilResponse;

  const proposalResponse = handleProposalRoutes(req, url, db, context, reputationScorer);
  if (proposalResponse) return proposalResponse;

  if (workTaskService) {
    const workTaskResponse = handleWorkTaskRoutes(req, url, workTaskService, context, db);
    if (workTaskResponse) return workTaskResponse;
  }

  // Schedule routes (automation)
  const scheduleResponse = handleScheduleRoutes(req, url, db, schedulerService ?? null, context);
  if (scheduleResponse) return scheduleResponse;

  // Webhook routes (GitHub event-driven automation)
  const webhookResponse = handleWebhookRoutes(req, url, db, webhookService ?? null, context);
  if (webhookResponse) return webhookResponse;

  // Mention polling routes (local-first GitHub @mention detection)
  const pollingResponse = handleMentionPollingRoutes(req, url, db, mentionPollingService ?? null, context);
  if (pollingResponse) return pollingResponse;

  // Workflow routes (graph-based orchestration)
  const workflowResponse = handleWorkflowRoutes(req, url, db, workflowService ?? null, context);
  if (workflowResponse) return workflowResponse;

  // Sandbox routes (container management)
  const sandboxResponse = handleSandboxRoutes(req, url, db, sandboxManager, context);
  if (sandboxResponse) return sandboxResponse;

  // Marketplace routes
  const marketplaceResponse = handleMarketplaceRoutes(req, url, db, marketplace, marketplaceFederation, context);
  if (marketplaceResponse) return marketplaceResponse;

  // Marketplace analytics routes
  const marketplaceAnalyticsResponse = handleMarketplaceAnalyticsRoutes(req, url, db, context);
  if (marketplaceAnalyticsResponse) return marketplaceAnalyticsResponse;

  // Reputation routes
  const reputationResponse = handleReputationRoutes(req, url, db, reputationScorer, reputationAttestation, context);
  if (reputationResponse) return reputationResponse;

  // Flock Directory routes
  const flockDirResponse = handleFlockDirectoryRoutes(req, url, db, flockDirectory, context);
  if (flockDirResponse) return flockDirResponse;

  // Flock Testing routes (test results, stats, on-demand test trigger)
  const flockTestResponse = await handleFlockTestingRoutes(req, url, db, null, context, {
    flockDirectory,
  });
  if (flockTestResponse) return flockTestResponse;

  // Billing routes
  const billingResponse = await handleBillingRoutes(req, url, db, billing, usageMeter, context);
  if (billingResponse) return billingResponse;

  // Auth flow routes (device authorization for CLI login)
  const authFlowResponse = handleAuthFlowRoutes(req, url, db, context);
  if (authFlowResponse) return authFlowResponse;

  // Plugin routes
  const pluginResponse = handlePluginRoutes(req, url, db, pluginRegistry ?? null);
  if (pluginResponse) return pluginResponse;

  // A2A inbound task routes
  const a2aResponse = await handleA2ARoutes(req, url, db, processManager);
  if (a2aResponse) return a2aResponse;

  // MCP API routes (used by stdio server subprocess)
  const mcpDeps =
    agentMessenger && agentDirectory && agentWalletService
      ? (() => {
          const algoChatCfg = loadAlgoChatConfig();
          return {
            db,
            agentMessenger,
            agentDirectory,
            agentWalletService,
            serverMnemonic: algoChatCfg.mnemonic,
            network: algoChatCfg.agentNetwork,
          };
        })()
      : null;
  const mcpResponse = handleMcpApiRoutes(req, url, mcpDeps);
  if (mcpResponse) return mcpResponse;

  // Resume a paused session (e.g. after API outage)
  const resumeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/resume$/);
  if (resumeMatch && req.method === 'POST') {
    const sessionId = resumeMatch[1];
    const resumed = processManager.resumeSession(sessionId);
    if (resumed) {
      return json({ ok: true, message: `Session ${sessionId} resumed` });
    }
    return json({ error: `Session ${sessionId} is not paused` }, 400);
  }

  // Escalation queue — list pending requests
  if (url.pathname === '/api/escalation-queue' && req.method === 'GET') {
    const requests = processManager.approvalManager.getQueuedRequests();
    return json({ requests });
  }

  // Escalation queue — resolve a request
  const escalationMatch = url.pathname.match(/^\/api\/escalation-queue\/(\d+)\/resolve$/);
  if (escalationMatch && req.method === 'POST') {
    return handleEscalationResolve(req, processManager, parseInt(escalationMatch[1], 10));
  }

  // Operational mode — get/set
  if (url.pathname === '/api/operational-mode' && req.method === 'GET') {
    return json({ mode: processManager.approvalManager.operationalMode });
  }
  if (url.pathname === '/api/operational-mode' && req.method === 'POST') {
    return handleSetOperationalMode(req, processManager);
  }

  // Feed history — returns recent agent messages AND algochat messages for the AlgoChat Feed
  if (url.pathname === '/api/feed/history' && req.method === 'GET') {
    const limit = safeNumParam(url.searchParams.get('limit'), 50);
    const offset = safeNumParam(url.searchParams.get('offset'), 0);
    const search = url.searchParams.get('search') ?? undefined;
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const threadId = url.searchParams.get('threadId') ?? undefined;

    const agentResult = searchAgentMessages(db, { limit, offset, search, agentId, threadId });
    const algochatResult = searchAlgoChatMessages(db, { limit, offset, search });

    return json({
      messages: agentResult.messages,
      algochatMessages: algochatResult.messages,
      total: agentResult.total,
      algochatTotal: algochatResult.total,
      limit,
      offset,
    });
  }

  // AlgoChat routes
  if (url.pathname === '/api/algochat/status' && req.method === 'GET') {
    const status = algochatBridge
      ? await algochatBridge.getStatus()
      : {
          enabled: false,
          address: null,
          network: 'testnet' as const,
          syncInterval: 30000,
          activeConversations: 0,
          balance: 0,
        };
    return json(status);
  }

  // Switch AlgoChat network (testnet <-> mainnet)
  if (url.pathname === '/api/algochat/network' && req.method === 'POST') {
    if (!networkSwitchFn) {
      return json({ error: 'Network switching not available' }, 503);
    }
    try {
      const data = await parseBodyOrThrow(req, SwitchNetworkSchema);
      await networkSwitchFn(data.network);
      return json({ ok: true, network: data.network });
    } catch (err) {
      return handleRouteError(err);
    }
  }

  if (url.pathname === '/api/algochat/conversations' && req.method === 'POST') {
    return json(listConversations(db));
  }

  // PSK exchange URI for mobile client connections
  if (url.pathname === '/api/algochat/psk-exchange' && req.method === 'GET') {
    if (!algochatBridge) {
      return json({ error: 'AlgoChat not configured' }, 503);
    }
    try {
      const result = algochatBridge.getPSKExchangeURI();
      return json(result);
    } catch (err) {
      return handleRouteError(err);
    }
  }

  // Generate new PSK for mobile client connections
  if (url.pathname === '/api/algochat/psk-exchange' && req.method === 'POST') {
    if (!algochatBridge) {
      return json({ error: 'AlgoChat not configured' }, 503);
    }
    try {
      const result = algochatBridge.generatePSKExchangeURI();
      return json(result);
    } catch (err) {
      return handleRouteError(err);
    }
  }

  // PSK contacts — list all for current network
  if (url.pathname === '/api/algochat/psk-contacts' && req.method === 'GET') {
    if (!algochatBridge) {
      return json({ error: 'AlgoChat not configured' }, 503);
    }
    return json({ contacts: algochatBridge.listPSKContacts() });
  }

  // PSK contacts — create new contact
  if (url.pathname === '/api/algochat/psk-contacts' && req.method === 'POST') {
    if (!algochatBridge) {
      return json({ error: 'AlgoChat not configured' }, 503);
    }
    try {
      const data = await parseBodyOrThrow(req, PSKContactNicknameSchema);
      const result = algochatBridge.createPSKContact(data.nickname);
      return json(result);
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.detail }, 400);
      return handleRouteError(err);
    }
  }

  // PSK contacts — rename
  const pskContactPatchMatch = url.pathname.match(/^\/api\/algochat\/psk-contacts\/([^/]+)$/);
  if (pskContactPatchMatch && req.method === 'PATCH') {
    if (!algochatBridge) {
      return json({ error: 'AlgoChat not configured' }, 503);
    }
    try {
      const id = decodeURIComponent(pskContactPatchMatch[1]);
      const data = await parseBodyOrThrow(req, PSKContactNicknameSchema);
      const ok = algochatBridge.renamePSKContact(id, data.nickname);
      if (!ok) return json({ error: 'Contact not found' }, 404);
      return json({ ok: true });
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.detail }, 400);
      return handleRouteError(err);
    }
  }

  // PSK contacts — cancel (soft-delete)
  const pskContactDeleteMatch = url.pathname.match(/^\/api\/algochat\/psk-contacts\/([^/]+)$/);
  if (pskContactDeleteMatch && req.method === 'DELETE') {
    if (!algochatBridge) {
      return json({ error: 'AlgoChat not configured' }, 503);
    }
    try {
      const id = decodeURIComponent(pskContactDeleteMatch[1]);
      const ok = algochatBridge.cancelPSKContact(id);
      if (!ok) return json({ error: 'Contact not found' }, 404);
      return json({ ok: true });
    } catch (err) {
      return handleRouteError(err);
    }
  }

  // PSK contacts — get QR URI
  const pskContactQrMatch = url.pathname.match(/^\/api\/algochat\/psk-contacts\/([^/]+)\/qr$/);
  if (pskContactQrMatch && req.method === 'GET') {
    if (!algochatBridge) {
      return json({ error: 'AlgoChat not configured' }, 503);
    }
    const id = decodeURIComponent(pskContactQrMatch[1]);
    const uri = algochatBridge.getPSKContactURI(id);
    if (!uri) return json({ error: 'Contact not found' }, 404);
    return json({ uri });
  }

  // Database backup
  if (url.pathname === '/api/backup' && req.method === 'POST') {
    try {
      const result = backupDatabase(db, process.env.DATABASE_PATH ?? 'corvid-agent.db');
      return json(result);
    } catch (err) {
      log.error('Backup failed', { error: err instanceof Error ? err.message : String(err) });
      return json({ error: 'Backup failed' }, 500);
    }
  }

  // Memory backfill — re-send memories with NULL txids on-chain
  if (url.pathname === '/api/memories/backfill' && req.method === 'POST') {
    return handleMemoryBackfill(db, agentMessenger ?? null);
  }

  // Model exam routes
  const examResponse = await handleExamRoutes(req, url, db, processManager);
  if (examResponse) return examResponse;

  // Self-test route
  if (url.pathname === '/api/selftest/run' && req.method === 'POST') {
    if (!selfTestService) {
      return json({ error: 'Self-test service not available' }, 503);
    }
    return handleSelfTestRun(req, selfTestService);
  }

  // Wallet viewer — summary of all external wallets
  if (url.pathname === '/api/wallets/summary' && req.method === 'GET') {
    const search = url.searchParams.get('search') ?? undefined;
    const wallets = getWalletSummaries(db, { search });
    return json({ wallets });
  }

  // Wallet viewer — messages for a specific wallet
  const walletMsgMatch = url.pathname.match(/^\/api\/wallets\/([^/]+)\/messages$/);
  if (walletMsgMatch && req.method === 'GET') {
    const address = decodeURIComponent(walletMsgMatch[1]).toUpperCase();
    if (!isAlgorandAddressFormat(address)) {
      return json({ error: 'Invalid Algorand address format' }, 400);
    }
    const limit = safeNumParam(url.searchParams.get('limit'), 50);
    const offset = safeNumParam(url.searchParams.get('offset'), 0);
    const result = getWalletMessages(db, address, limit, offset);
    return json(result);
  }

  // Wallet viewer — grant credits to a wallet
  const walletCreditsMatch = url.pathname.match(/^\/api\/wallets\/([^/]+)\/credits$/);
  if (walletCreditsMatch && req.method === 'POST') {
    const address = decodeURIComponent(walletCreditsMatch[1]).toUpperCase();
    try {
      const data = await parseBodyOrThrow(req, CreditGrantSchema);
      if (!isAlgorandAddressFormat(address)) {
        return json({ error: 'Invalid Algorand address format' }, 400);
      }
      grantCredits(db, address, Math.round(data.amount), data.reference);
      const balance = getBalance(db, address);
      return json({ ok: true, balance });
    } catch (err) {
      return handleRouteError(err);
    }
  }

  return null;
}

async function handleSelfTestRun(
  req: Request,
  selfTestService: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } },
): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, SelfTestSchema);
    const testType = data?.testType ?? 'all';

    const result = selfTestService.run(testType);
    return json({ sessionId: result.sessionId });
  } catch (err) {
    return handleRouteError(err);
  }
}

async function handleEscalationResolve(
  req: Request,
  processManager: ProcessManager,
  queueId: number,
): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, EscalationResolveSchema);

    const resolved = processManager.approvalManager.resolveQueuedRequest(queueId, data.approved);
    if (resolved) {
      return json({ ok: true, message: `Escalation #${queueId} ${data.approved ? 'approved' : 'denied'}` });
    }
    return json({ error: `Escalation #${queueId} not found or already resolved` }, 404);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleSetOperationalMode(req: Request, processManager: ProcessManager): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, OperationalModeSchema);

    processManager.approvalManager.operationalMode = data.mode;
    return json({ ok: true, mode: data.mode });
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

interface NullTxidRow {
  id: string;
  agent_id: string;
  key: string;
  content: string;
}

async function handleMemoryBackfill(db: Database, agentMessenger: AgentMessenger | null): Promise<Response> {
  if (!agentMessenger) {
    return json({ error: 'Agent messenger not available' }, 503);
  }

  const rows = db
    .query(
      "SELECT id, agent_id, key, content FROM agent_memories WHERE status IN ('pending', 'failed') ORDER BY created_at ASC",
    )
    .all() as NullTxidRow[];

  if (rows.length === 0) {
    return json({ ok: true, backfilled: 0, message: 'No pending or failed memories' });
  }

  const config = loadAlgoChatConfig();
  const results: Array<{ id: string; key: string; agentId: string; txid: string | null; error?: string }> = [];

  for (const row of rows) {
    try {
      const encrypted = await encryptMemoryContent(row.content, config.mnemonic, config.network);
      const txid = await agentMessenger.sendOnChainToSelf(row.agent_id, `[MEMORY:${row.key}] ${encrypted}`);
      if (txid) {
        updateMemoryTxid(db, row.id, txid);
      }
      results.push({ id: row.id, key: row.key, agentId: row.agent_id, txid });
    } catch (err) {
      results.push({
        id: row.id,
        key: row.key,
        agentId: row.agent_id,
        txid: null,
        error: 'Failed to publish memory',
      });
    }
  }

  const succeeded = results.filter((r) => r.txid !== null).length;
  log.info('Memory backfill complete', { total: rows.length, succeeded });

  return json({ ok: true, backfilled: succeeded, total: rows.length, results });
}
