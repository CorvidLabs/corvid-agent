/**
 * OpenRouter model discovery routes.
 *
 * Provides endpoints for listing available models on OpenRouter
 * with pricing information for the dashboard model selector.
 */

import { json } from '../lib/response';
import type { RequestContext } from '../middleware/guards';
import { getModelsForProvider } from '../providers/cost-table';
import type { OpenRouterProvider } from '../providers/openrouter/provider';
import { LlmProviderRegistry } from '../providers/registry';

/** Get the OpenRouterProvider instance from the registry, or null. */
function getOpenRouterProvider(): OpenRouterProvider | null {
  const provider = LlmProviderRegistry.getInstance().get('openrouter');
  if (provider && provider.type === 'openrouter') {
    return provider as OpenRouterProvider;
  }
  return null;
}

/**
 * Handle all /api/openrouter/* routes.
 */
export function handleOpenRouterRoutes(
  req: Request,
  url: URL,
  _context: RequestContext,
): Response | Promise<Response> | null {
  if (!url.pathname.startsWith('/api/openrouter')) return null;

  // GET /api/openrouter/status — provider availability
  if (url.pathname === '/api/openrouter/status' && req.method === 'GET') {
    const provider = getOpenRouterProvider();
    if (!provider) {
      return json({ status: 'unavailable', reason: 'OpenRouter provider not registered' }, 503);
    }
    return json({
      status: 'available',
      info: provider.getInfo(),
      configuredModels: getModelsForProvider('openrouter').length,
    });
  }

  // GET /api/openrouter/models — list all models from OpenRouter API
  if (url.pathname === '/api/openrouter/models' && req.method === 'GET') {
    const provider = getOpenRouterProvider();
    if (!provider) {
      return json({ error: 'OpenRouter provider not registered' }, 503);
    }
    return handleListModels(provider, url);
  }

  // GET /api/openrouter/models/configured — list models in our cost table
  if (url.pathname === '/api/openrouter/models/configured' && req.method === 'GET') {
    const models = getModelsForProvider('openrouter');
    return json({ models });
  }

  return null;
}

async function handleListModels(provider: OpenRouterProvider, url: URL): Promise<Response> {
  const models = await provider.listModels();
  if (models.length === 0) {
    return json({ models: [], error: 'Could not fetch models from OpenRouter' });
  }

  // Optional search filter
  const query = url.searchParams.get('q')?.toLowerCase();
  const filtered = query
    ? models.filter((m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query))
    : models;

  return json({
    models: filtered.map((m) => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length,
      pricing: {
        promptPerMillion: parseFloat(m.pricing.prompt) * 1_000_000,
        completionPerMillion: parseFloat(m.pricing.completion) * 1_000_000,
      },
    })),
    total: filtered.length,
  });
}
