/**
 * Declarative route metadata registry for OpenAPI spec generation.
 *
 * Each domain's routes live in their own file under ./routes/.
 * This module aggregates them into a single exported array.
 */

export type { HttpMethod, RouteEntry } from './routes/types';
import type { RouteEntry } from './routes/types';

import { systemRoutes } from './routes/system';
import { providerRoutes } from './routes/providers';
import { projectRoutes } from './routes/projects';
import { agentRoutes } from './routes/agents';
import { sessionRoutes } from './routes/sessions';
import { councilRoutes } from './routes/councils';
import { workTaskRoutes } from './routes/work-tasks';
import { mcpRoutes } from './routes/mcp';
import { allowlistRoutes } from './routes/allowlist';
import { analyticsRoutes } from './routes/analytics';
import { scheduleRoutes } from './routes/schedules';
import { webhookRoutes } from './routes/webhooks';
import { mentionPollingRoutes } from './routes/mention-polling';
import { workflowRoutes } from './routes/workflows';
import { sandboxRoutes } from './routes/sandbox';
import { marketplaceRoutes } from './routes/marketplace';
import { reputationRoutes } from './routes/reputation';
import { billingRoutes } from './routes/billing';
import { authRoutes } from './routes/auth';
import { pluginRoutes } from './routes/plugins';
import { escalationRoutes } from './routes/escalation';
import { algochatRoutes } from './routes/algochat';
import { integrationRoutes } from './routes/integrations';
import { toolCatalogRoutes } from './routes/tool-catalog';

export const routes: RouteEntry[] = [
    ...systemRoutes,
    ...providerRoutes,
    ...projectRoutes,
    ...agentRoutes,
    ...sessionRoutes,
    ...councilRoutes,
    ...workTaskRoutes,
    ...mcpRoutes,
    ...allowlistRoutes,
    ...analyticsRoutes,
    ...scheduleRoutes,
    ...webhookRoutes,
    ...mentionPollingRoutes,
    ...workflowRoutes,
    ...sandboxRoutes,
    ...marketplaceRoutes,
    ...reputationRoutes,
    ...billingRoutes,
    ...authRoutes,
    ...pluginRoutes,
    ...escalationRoutes,
    ...algochatRoutes,
    ...integrationRoutes,
    ...toolCatalogRoutes,
];
