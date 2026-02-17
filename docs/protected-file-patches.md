# Protected File Patches for v1.0

These patches integrate the Phase 2-4 modules into the protected files.
Apply them manually in the order shown below.

---

## 1. `server/db/schema.ts` — Migrations 39-43

**Change `SCHEMA_VERSION` from 38 to 43:**

```diff
-const SCHEMA_VERSION = 38;
+const SCHEMA_VERSION = 43;
```

**Add after migration 38 (after the closing `],` of migration 38, before the `};`):**

```typescript
    39: [
        // Plugin registry — dynamically loaded tool plugins
        `CREATE TABLE IF NOT EXISTS plugins (
            name TEXT PRIMARY KEY,
            package_name TEXT NOT NULL,
            version TEXT NOT NULL,
            description TEXT DEFAULT '',
            author TEXT DEFAULT '',
            capabilities TEXT NOT NULL DEFAULT '[]',
            status TEXT DEFAULT 'active',
            loaded_at TEXT DEFAULT (datetime('now')),
            config TEXT DEFAULT '{}'
        )`,
        `CREATE TABLE IF NOT EXISTS plugin_capabilities (
            plugin_name TEXT NOT NULL REFERENCES plugins(name) ON DELETE CASCADE,
            capability TEXT NOT NULL,
            granted INTEGER DEFAULT 0,
            granted_at TEXT DEFAULT NULL,
            PRIMARY KEY (plugin_name, capability)
        )`,
    ],
    40: [
        // Container sandbox configurations per agent
        `CREATE TABLE IF NOT EXISTS sandbox_configs (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            image TEXT DEFAULT 'corvid-agent-sandbox:latest',
            cpu_limit REAL DEFAULT 1.0,
            memory_limit_mb INTEGER DEFAULT 512,
            storage_limit_mb INTEGER DEFAULT 1024,
            timeout_seconds INTEGER DEFAULT 1800,
            network_policy TEXT DEFAULT 'restricted',
            pids_limit INTEGER DEFAULT 100,
            env_vars TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_sandbox_configs_agent ON sandbox_configs(agent_id)`,
    ],
    41: [
        // Agent marketplace — listings and reviews
        `CREATE TABLE IF NOT EXISTS marketplace_listings (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            category TEXT DEFAULT 'general',
            tags TEXT DEFAULT '[]',
            pricing_model TEXT DEFAULT 'free',
            price_credits INTEGER DEFAULT 0,
            status TEXT DEFAULT 'draft',
            version TEXT DEFAULT '1.0.0',
            avg_rating REAL DEFAULT 0,
            total_reviews INTEGER DEFAULT 0,
            total_uses INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_agent ON marketplace_listings(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON marketplace_listings(status)`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category ON marketplace_listings(category)`,

        `CREATE TABLE IF NOT EXISTS marketplace_reviews (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
            reviewer_id TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_listing ON marketplace_reviews(listing_id)`,

        // Cross-instance federation registry
        `CREATE TABLE IF NOT EXISTS federated_instances (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL UNIQUE,
            name TEXT DEFAULT '',
            status TEXT DEFAULT 'active',
            last_sync_at TEXT DEFAULT NULL,
            listing_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )`,
    ],
    42: [
        // Agent reputation — scoring and trust attestation
        `CREATE TABLE IF NOT EXISTS agent_reputation (
            agent_id TEXT PRIMARY KEY,
            overall_score REAL DEFAULT 0,
            task_completion REAL DEFAULT 0,
            peer_rating REAL DEFAULT 0,
            credit_standing REAL DEFAULT 0,
            security_record REAL DEFAULT 0,
            activity_consistency REAL DEFAULT 0,
            trust_level TEXT DEFAULT 'unknown',
            total_events INTEGER DEFAULT 0,
            computed_at TEXT DEFAULT (datetime('now'))
        )`,

        `CREATE TABLE IF NOT EXISTS reputation_events (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            value REAL DEFAULT 0,
            source TEXT DEFAULT '',
            reference_id TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_reputation_events_agent ON reputation_events(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_reputation_events_type ON reputation_events(event_type)`,

        `CREATE TABLE IF NOT EXISTS reputation_attestations (
            agent_id TEXT PRIMARY KEY,
            score_hash TEXT NOT NULL,
            score_payload TEXT NOT NULL,
            txid TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )`,
    ],
    43: [
        // Multi-tenant isolation
        `CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            owner_email TEXT NOT NULL,
            stripe_customer_id TEXT DEFAULT NULL,
            plan TEXT DEFAULT 'free',
            max_agents INTEGER DEFAULT 3,
            max_concurrent_sessions INTEGER DEFAULT 2,
            sandbox_enabled INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,

        `CREATE TABLE IF NOT EXISTS api_keys (
            key_hash TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            label TEXT DEFAULT 'default',
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id)`,

        // Usage-based billing
        `CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            stripe_subscription_id TEXT NOT NULL,
            plan TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            current_period_start TEXT NOT NULL,
            current_period_end TEXT NOT NULL,
            cancel_at_period_end INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id)`,

        `CREATE TABLE IF NOT EXISTS usage_records (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            credits_used INTEGER DEFAULT 0,
            api_calls INTEGER DEFAULT 0,
            session_count INTEGER DEFAULT 0,
            storage_mb REAL DEFAULT 0,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            reported INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id)`,

        `CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            stripe_invoice_id TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            currency TEXT DEFAULT 'usd',
            status TEXT DEFAULT 'open',
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            paid_at TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id)`,
    ],
```

---

## 2. `server/index.ts` — Initialize new services and routes

**Add imports after the existing imports (after line 46, `import { ResponsePollingService } ...`):**

```typescript
import { PluginRegistry } from './plugins/registry';
import { SandboxManager } from './sandbox/manager';
import { SandboxPolicy } from './sandbox/policy';
import { MarketplaceService } from './marketplace/service';
import { MarketplaceFederation } from './marketplace/federation';
import { ReputationScorer } from './reputation/scorer';
import { ReputationAttestation } from './reputation/attestation';
import { TenantService } from './tenant/context';
import { BillingService } from './billing/service';
import { UsageMeter } from './billing/meter';
import { ModelRouter } from './providers/router';
import { FallbackManager } from './providers/fallback';
import { handleSandboxRoutes } from './routes/sandbox';
import { handleMarketplaceRoutes } from './routes/marketplace';
import { handleReputationRoutes } from './routes/reputation';
import { handleBillingRoutes } from './routes/billing';
import { handleAuthFlowRoutes } from './routes/auth-flow';
```

**Add service initialization after `const responsePollingService = ...` (after line 134):**

```typescript
// Initialize plugin registry
const pluginRegistry = new PluginRegistry(db);

// Initialize sandbox manager (opt-in via SANDBOX_ENABLED=true)
const sandboxEnabled = process.env.SANDBOX_ENABLED === 'true';
const sandboxManager = sandboxEnabled ? new SandboxManager(db) : null;
if (sandboxManager) {
    sandboxManager.start().catch((err) => {
        log.warn('Sandbox manager failed to start', { error: err instanceof Error ? err.message : String(err) });
    });
}
const sandboxPolicy = new SandboxPolicy(db);

// Initialize marketplace
const marketplaceService = new MarketplaceService(db);
const marketplaceFederation = new MarketplaceFederation(db, marketplaceService);

// Initialize reputation system
const reputationScorer = new ReputationScorer(db);
const reputationAttestation = new ReputationAttestation(db);

// Initialize multi-tenant (opt-in via MULTI_TENANT=true)
const multiTenant = process.env.MULTI_TENANT === 'true';
const tenantService = new TenantService(db, multiTenant);

// Initialize billing
const billingService = new BillingService(db);
const usageMeter = new UsageMeter(db, billingService);

// Initialize model router and fallback manager
const modelRouter = new ModelRouter();
const fallbackManager = new FallbackManager(providerRegistry);
```

**Add to `gracefulShutdown()` function (before `processManager.shutdown()`):**

```typescript
    usageMeter.stop();
    marketplaceFederation.stop();
    if (sandboxManager) sandboxManager.shutdown();
```

**Add to the `initAlgoChat().then()` block, after `responsePollingService.start()` (around line 558):**

```typescript
    // Start usage meter for billing
    usageMeter.start();
```

---

## 3. `server/routes/index.ts` — Register new route handlers

**Add imports after existing imports (after `import { handleWorkflowRoutes } ...` line 15):**

```typescript
import { handleSandboxRoutes } from './sandbox';
import { handleMarketplaceRoutes } from './marketplace';
import { handleReputationRoutes } from './reputation';
import { handleBillingRoutes } from './billing';
import { handleAuthFlowRoutes } from './auth-flow';
```

**Add route dispatch inside `handleRoutes()`, after the workflow routes block (after line 177, before the MCP API routes block):**

```typescript
    // Sandbox routes (container management)
    const sandboxResponse = handleSandboxRoutes(req, url, db);
    if (sandboxResponse) return sandboxResponse;

    // Marketplace routes
    const marketplaceResponse = handleMarketplaceRoutes(req, url, db);
    if (marketplaceResponse) return marketplaceResponse;

    // Reputation routes
    const reputationResponse = handleReputationRoutes(req, url, db);
    if (reputationResponse) return reputationResponse;

    // Billing routes
    const billingResponse = await handleBillingRoutes(req, url, db);
    if (billingResponse) return billingResponse;

    // Auth flow routes (device authorization for CLI login)
    const authFlowResponse = handleAuthFlowRoutes(req, url, db);
    if (authFlowResponse) return authFlowResponse;
```

---

## 4. `server/notifications/service.ts` — Add WhatsApp and Signal channels

**Add imports after existing channel imports (after `import { sendAlgoChat } ...` line 15):**

```typescript
import { sendWhatsApp } from './channels/whatsapp';
import { sendSignal } from './channels/signal';
```

**Add cases in `dispatchToChannel()` switch statement, before the `default:` case (after the `case 'algochat':` block ending around line 170):**

```typescript
                case 'whatsapp': {
                    const phoneId = config.phoneNumberId as string;
                    const accessToken = (config.accessToken as string) || process.env.WHATSAPP_ACCESS_TOKEN;
                    if (!phoneId || !accessToken) {
                        result = { success: false, error: 'WhatsApp phoneNumberId and accessToken required' };
                        break;
                    }
                    const recipientPhone = config.recipientPhone as string;
                    if (!recipientPhone) {
                        result = { success: false, error: 'WhatsApp recipientPhone required' };
                        break;
                    }
                    result = await sendWhatsApp(phoneId, accessToken, recipientPhone, payload);
                    break;
                }
                case 'signal': {
                    const signalApiUrl = (config.apiUrl as string) || process.env.SIGNAL_API_URL || 'http://localhost:8080';
                    const senderNumber = (config.senderNumber as string) || process.env.SIGNAL_SENDER_NUMBER;
                    const recipientNumber = config.recipientNumber as string;
                    if (!senderNumber || !recipientNumber) {
                        result = { success: false, error: 'Signal senderNumber and recipientNumber required' };
                        break;
                    }
                    result = await sendSignal(signalApiUrl, senderNumber, recipientNumber, payload);
                    break;
                }
```

---

## 5. `server/notifications/question-dispatcher.ts` — Add WhatsApp and Signal question dispatch

**Add imports after existing imports (after `import { sendAlgoChatQuestion } ...` line 7):**

```typescript
import { sendWhatsAppQuestion } from './channels/whatsapp-question';
import { sendSignalQuestion } from './channels/signal-question';
```

**Add cases in `dispatchToChannel()` switch statement, before the `case 'discord':` case (after the `case 'algochat':` block ending around line 121):**

```typescript
            case 'whatsapp': {
                const phoneId = config.phoneNumberId as string;
                const accessToken = (config.accessToken as string) || process.env.WHATSAPP_ACCESS_TOKEN;
                const recipientPhone = config.recipientPhone as string;
                if (!phoneId || !accessToken || !recipientPhone)
                    return { success: false, error: 'WhatsApp phoneNumberId, accessToken, and recipientPhone required' };
                return sendWhatsAppQuestion(
                    phoneId,
                    accessToken,
                    recipientPhone,
                    question.id,
                    question.question,
                    question.options,
                    question.context,
                    question.agentId,
                );
            }
            case 'signal': {
                const signalApiUrl = (config.apiUrl as string) || process.env.SIGNAL_API_URL || 'http://localhost:8080';
                const senderNumber = (config.senderNumber as string) || process.env.SIGNAL_SENDER_NUMBER;
                const recipientNumber = config.recipientNumber as string;
                if (!senderNumber || !recipientNumber)
                    return { success: false, error: 'Signal senderNumber and recipientNumber required' };
                return sendSignalQuestion(
                    signalApiUrl,
                    senderNumber,
                    recipientNumber,
                    question.id,
                    question.question,
                    question.options,
                    question.agentId,
                );
            }
```

**Also update the `case 'discord':` to include WhatsApp/Signal in the "no response support" list for `discord` only (leave it as-is since discord is the only notification-only channel).**

---

## 6. `server/process/manager.ts` — Add ModelRouter support

No changes needed for Phase 2-4. The `ModelRouter` is a standalone utility that can be used by callers without modifying manager.ts. If you want auto-routing when `agent.model === 'auto'`:

**In `startProcess()` (around line 217), after `const provider = providerType ? ...`:**

```diff
         const provider = providerType ? LlmProviderRegistry.getInstance().get(providerType) : undefined;

+        // Auto-select model if agent.model is 'auto'
+        // (Requires ModelRouter to be imported and instantiated)
+        // const modelRouter = new ModelRouter();
+        // if (agent?.model === 'auto') {
+        //     const selected = modelRouter.selectModel(resolvedPrompt);
+        //     if (selected) agent = { ...agent, model: selected.modelId, provider: selected.provider };
+        // }
+
         if (provider && provider.executionMode === 'direct') {
```

> **Note:** This is optional and commented out since it requires importing `ModelRouter` and deciding on the integration point. The `ModelRouter` can also be used at the API layer in route handlers instead.

---

## 7. `server/process/sdk-process.ts` — Container sandbox wrapping

No changes needed for the current implementation. Container sandboxing works at the `SandboxManager` level by assigning containers to sessions. The `sdk-process.ts` continues to run the SDK query as before; the container wrapping happens at the orchestration layer (in `manager.ts` or `index.ts`).

If you want to add sandbox support directly in the process:

**Add to `SdkProcessOptions` interface:**

```diff
 export interface SdkProcessOptions {
     session: Session;
     project: Project;
     agent: Agent | null;
     prompt: string;
     approvalManager: ApprovalManager;
     onEvent: (event: ClaudeStreamEvent) => void;
     onExit: (code: number | null) => void;
     onApprovalRequest: (request: ApprovalRequestWire) => void;
     onApiOutage?: () => void;
     mcpServers?: McpSdkServerConfigWithInstance[];
+    containerId?: string; // If set, execute inside this Docker container
 }
```

> **Note:** Full container integration requires additional work in `startSdkProcess()` to redirect the SDK query execution into the Docker container. The `sandbox/container.ts` module provides `execInContainer()` for this purpose.

---

## 8. `server/mcp/sdk-tools.ts` — Accept plugin tools

**Modify `createCorvidMcpServer()` to accept optional plugin tools:**

```diff
-export function createCorvidMcpServer(ctx: McpToolContext) {
+export function createCorvidMcpServer(ctx: McpToolContext, pluginTools?: ReturnType<typeof tool>[]) {
     const tools = [
         // ... existing 29 tools ...
     ];

+    // Merge plugin tools if provided
+    if (pluginTools && pluginTools.length > 0) {
+        tools.push(...pluginTools);
+    }
+
     // Local (web) sessions get all tools ...
```

Then in `manager.ts`, when building MCP servers, pass plugin tools:

```diff
-                return ctx ? [createCorvidMcpServer(ctx)] : undefined;
+                if (!ctx) return undefined;
+                const pluginTools = pluginRegistry?.getToolsForContext(ctx) ?? [];
+                return [createCorvidMcpServer(ctx, pluginTools)];
```

> **Note:** This requires the `PluginRegistry` to expose a `getToolsForContext()` method that returns `tool()` instances. The registry module (`server/plugins/registry.ts`) already exists; extend it with this method.

---

## 9. `package.json` — Add CLI bin entry and bump version

```diff
 {
   "name": "corvid-agent",
-  "version": "0.8.0",
+  "version": "1.0.0",
   "description": "AI agent framework with on-chain identity and messaging via AlgoChat on Algorand",
   ...
+  "bin": {
+    "corvid-agent": "./cli/index.ts"
+  },
   "scripts": {
```

---

## Application Order

Apply patches in this order to minimize conflicts:

1. **`schema.ts`** — migrations first (no dependencies)
2. **`package.json`** — version bump and bin entry
3. **`server/notifications/service.ts`** — WhatsApp/Signal channels
4. **`server/notifications/question-dispatcher.ts`** — WhatsApp/Signal questions
5. **`server/mcp/sdk-tools.ts`** — plugin tool merging
6. **`server/routes/index.ts`** — register new routes
7. **`server/index.ts`** — initialize services (depends on routes being registered)
8. **`server/process/manager.ts`** — optional ModelRouter integration
9. **`server/process/sdk-process.ts`** — optional container sandbox integration

## Verification

After applying all patches:

```bash
bunx tsc --noEmit --skipLibCheck
bun test
```

Both must pass. Current baseline: 1330 tests, 0 failures.
