import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { RequestContext } from '../middleware/guards';
import { BaseLlmProvider } from '../providers/base';
import { LlmProviderRegistry } from '../providers/registry';
import { _resetClaudeCliCache } from '../providers/router';
import type {
  ExecutionMode,
  LlmCompletionParams,
  LlmCompletionResult,
  LlmProviderInfo,
  LlmProviderType,
} from '../providers/types';
import { handleOpenRouterRoutes } from '../routes/openrouter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url.toString(), { method }), url };
}

function fakeContext(): RequestContext {
  return { authenticated: true, role: 'user', tenantId: 'default' };
}

function resetRegistry(): void {
  (LlmProviderRegistry as unknown as { instance: null }).instance = null;
  _resetClaudeCliCache(null);
}

// ─── Mock OpenRouter Provider ──────────────────────────────────────────────────

type MockModel = {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
};

class MockOpenRouterProvider extends BaseLlmProvider {
  readonly type: LlmProviderType = 'openrouter';
  readonly executionMode: ExecutionMode = 'managed';
  private _models: MockModel[];

  constructor(models: MockModel[] = []) {
    super();
    this._models = models;
  }

  getInfo(): LlmProviderInfo {
    return {
      type: 'openrouter',
      name: 'OpenRouter',
      executionMode: 'managed',
      models: this._models.map((m) => m.id),
      defaultModel: this._models[0]?.id ?? 'openai/gpt-4o',
      supportsTools: true,
      supportsStreaming: true,
    };
  }

  protected async doComplete(_params: LlmCompletionParams): Promise<LlmCompletionResult> {
    return { content: 'mock', model: 'mock-model', usage: { inputTokens: 1, outputTokens: 1 } };
  }

  async listModels(): Promise<MockModel[]> {
    return this._models;
  }
}

// ─── Test Data ────────────────────────────────────────────────────────────────

const testModels: MockModel[] = [
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    pricing: { prompt: '0.000005', completion: '0.000015' },
    context_length: 128000,
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    pricing: { prompt: '0.000010', completion: '0.000030' },
    context_length: 1000000,
  },
];

// ─── Environment Setup ────────────────────────────────────────────────────────

const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
const savedOpenaiKey = process.env.OPENAI_API_KEY;
const savedOpenrouterKey = process.env.OPENROUTER_API_KEY;
const savedEnabledProviders = process.env.ENABLED_PROVIDERS;

beforeEach(() => {
  resetRegistry();
  // Ensure registry doesn't fall back to ollama-only mode
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-dummy';
  process.env.OPENAI_API_KEY = 'sk-test-dummy';
  process.env.OPENROUTER_API_KEY = 'sk-or-test-dummy';
  delete process.env.ENABLED_PROVIDERS;
});

afterEach(() => {
  resetRegistry();
  if (savedAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
  if (savedOpenaiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedOpenaiKey;
  if (savedOpenrouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedOpenrouterKey;
  if (savedEnabledProviders === undefined) delete process.env.ENABLED_PROVIDERS;
  else process.env.ENABLED_PROVIDERS = savedEnabledProviders;
});

// ─── GET /api/openrouter/status ───────────────────────────────────────────────

describe('GET /api/openrouter/status', () => {
  it('returns 503 when OpenRouter provider is not registered', async () => {
    const { req, url } = fakeReq('GET', '/api/openrouter/status');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(503);
    const data = await (res as Response).json();
    expect(data.status).toBe('unavailable');
    expect(typeof data.reason).toBe('string');
  });

  it('returns 200 with provider info when registered', async () => {
    LlmProviderRegistry.getInstance().register(new MockOpenRouterProvider(testModels));

    const { req, url } = fakeReq('GET', '/api/openrouter/status');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.status).toBe('available');
    expect(data.info.type).toBe('openrouter');
    expect(data.info.name).toBe('OpenRouter');
    expect(typeof data.configuredModels).toBe('number');
  });

  it('configuredModels reflects the cost table count', async () => {
    LlmProviderRegistry.getInstance().register(new MockOpenRouterProvider(testModels));

    const { req, url } = fakeReq('GET', '/api/openrouter/status');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    const data = await (res as Response).json();
    // Cost table has openrouter entries; configuredModels should be > 0
    expect(data.configuredModels).toBeGreaterThan(0);
  });
});

// ─── GET /api/openrouter/models ───────────────────────────────────────────────

describe('GET /api/openrouter/models', () => {
  it('returns 503 when OpenRouter provider is not registered', async () => {
    const { req, url } = fakeReq('GET', '/api/openrouter/models');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(503);
    const data = await (res as Response).json();
    expect(typeof data.error).toBe('string');
  });

  it('lists all models when provider returns results', async () => {
    LlmProviderRegistry.getInstance().register(new MockOpenRouterProvider(testModels));

    const { req, url } = fakeReq('GET', '/api/openrouter/models');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.models).toHaveLength(2);
    expect(data.total).toBe(2);
  });

  it('transforms pricing to per-million values', async () => {
    LlmProviderRegistry.getInstance().register(new MockOpenRouterProvider(testModels));

    const { req, url } = fakeReq('GET', '/api/openrouter/models');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    const data = await (res as Response).json();
    const gpt4o = data.models.find((m: { id: string }) => m.id === 'openai/gpt-4o');
    expect(gpt4o).toBeDefined();
    // 0.000005 * 1_000_000 = 5.0
    expect(gpt4o.pricing.promptPerMillion).toBeCloseTo(5.0);
    // 0.000015 * 1_000_000 = 15.0
    expect(gpt4o.pricing.completionPerMillion).toBeCloseTo(15.0);
  });

  it('each model has required shape fields', async () => {
    LlmProviderRegistry.getInstance().register(new MockOpenRouterProvider(testModels));

    const { req, url } = fakeReq('GET', '/api/openrouter/models');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    const data = await (res as Response).json();
    for (const model of data.models) {
      expect(typeof model.id).toBe('string');
      expect(typeof model.name).toBe('string');
      expect(typeof model.contextLength).toBe('number');
      expect(typeof model.pricing.promptPerMillion).toBe('number');
      expect(typeof model.pricing.completionPerMillion).toBe('number');
    }
  });

  it('filters models by query string (case-insensitive)', async () => {
    LlmProviderRegistry.getInstance().register(new MockOpenRouterProvider(testModels));

    const url = new URL('http://localhost:3000/api/openrouter/models?q=gemini');
    const req = new Request(url.toString(), { method: 'GET' });
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.models).toHaveLength(1);
    expect(data.models[0].id).toBe('google/gemini-2.5-pro');
    expect(data.total).toBe(1);
  });

  it('filter by model name (case-insensitive)', async () => {
    LlmProviderRegistry.getInstance().register(new MockOpenRouterProvider(testModels));

    const url = new URL('http://localhost:3000/api/openrouter/models?q=GPT');
    const req = new Request(url.toString(), { method: 'GET' });
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    const data = await (res as Response).json();
    expect(data.models).toHaveLength(1);
    expect(data.models[0].id).toBe('openai/gpt-4o');
  });

  it('filter with no matches returns empty list', async () => {
    LlmProviderRegistry.getInstance().register(new MockOpenRouterProvider(testModels));

    const url = new URL('http://localhost:3000/api/openrouter/models?q=nonexistent-model-xyz');
    const req = new Request(url.toString(), { method: 'GET' });
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    const data = await (res as Response).json();
    expect(data.models).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it('returns empty models with error when provider returns no models', async () => {
    LlmProviderRegistry.getInstance().register(new MockOpenRouterProvider([]));

    const { req, url } = fakeReq('GET', '/api/openrouter/models');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.models).toEqual([]);
    expect(typeof data.error).toBe('string');
  });
});

// ─── GET /api/openrouter/models/configured ────────────────────────────────────

describe('GET /api/openrouter/models/configured', () => {
  it('returns configured models from cost table', async () => {
    const { req, url } = fakeReq('GET', '/api/openrouter/models/configured');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.models.length).toBeGreaterThan(0);
  });

  it('does not require the OpenRouter provider to be registered', async () => {
    // No provider registered — endpoint reads directly from cost table
    const { req, url } = fakeReq('GET', '/api/openrouter/models/configured');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(Array.isArray(data.models)).toBe(true);
  });

  it('each configured model has provider field set to openrouter', async () => {
    const { req, url } = fakeReq('GET', '/api/openrouter/models/configured');
    const res = await Promise.resolve(handleOpenRouterRoutes(req, url, fakeContext()));
    const data = await (res as Response).json();
    for (const model of data.models) {
      expect(model.provider).toBe('openrouter');
    }
  });
});

// ─── Non-matching paths ───────────────────────────────────────────────────────

describe('non-matching requests', () => {
  it('returns null for unrelated path', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    expect(handleOpenRouterRoutes(req, url, fakeContext())).toBeNull();
  });

  it('returns null for unknown subpath under /api/openrouter/', () => {
    const { req, url } = fakeReq('GET', '/api/openrouter/unknown-endpoint');
    expect(handleOpenRouterRoutes(req, url, fakeContext())).toBeNull();
  });

  it('returns null for wrong method on /api/openrouter/status', () => {
    const { req, url } = fakeReq('POST', '/api/openrouter/status');
    expect(handleOpenRouterRoutes(req, url, fakeContext())).toBeNull();
  });

  it('returns null for wrong method on /api/openrouter/models', () => {
    const { req, url } = fakeReq('DELETE', '/api/openrouter/models');
    expect(handleOpenRouterRoutes(req, url, fakeContext())).toBeNull();
  });
});
