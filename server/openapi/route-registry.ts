/**
 * Declarative route metadata registry for OpenAPI spec generation.
 *
 * Each domain's routes live in their own file under ./routes/.
 * This module aggregates them into a single exported array.
 */

export type { HttpMethod, RouteEntry } from './routes/types';

import { agentRoutes } from './routes/agents';
import { algochatRoutes } from './routes/algochat';
import { allowlistRoutes } from './routes/allowlist';
import { analyticsRoutes } from './routes/analytics';
import { authRoutes } from './routes/auth';
import { billingRoutes } from './routes/billing';
import { councilRoutes } from './routes/councils';
import { escalationRoutes } from './routes/escalation';
import { integrationRoutes } from './routes/integrations';
import { marketplaceRoutes } from './routes/marketplace';
import { mcpRoutes } from './routes/mcp';
import { mentionPollingRoutes } from './routes/mention-polling';
import { pluginRoutes } from './routes/plugins';
import { projectRoutes } from './routes/projects';
import { providerRoutes } from './routes/providers';
import { reputationRoutes } from './routes/reputation';
import { sandboxRoutes } from './routes/sandbox';
import { scheduleRoutes } from './routes/schedules';
import { sessionRoutes } from './routes/sessions';
import { systemRoutes } from './routes/system';
import { toolCatalogRoutes } from './routes/tool-catalog';
import type { RouteEntry } from './routes/types';
import { webhookRoutes } from './routes/webhooks';
import { workTaskRoutes } from './routes/work-tasks';
import { workflowRoutes } from './routes/workflows';

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
