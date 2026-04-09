import { createLogger } from '../../lib/logger';
import { BaseLlmProvider } from '../base';
import type {
  ExecutionMode,
  LlmCompletionParams,
  LlmCompletionResult,
  LlmProviderInfo,
  LlmProviderType,
  LlmToolCall,
  LlmToolDefinition,
} from '../types';

const log = createLogger('OpenRouterProvider');

/** OpenAI-compatible message format used by OpenRouter. */
interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

interface OpenRouterChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string;
}

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: OpenRouterChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenRouterStreamDelta {
  choices: Array<{
    delta: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter models available for routing.
 * Uses OpenRouter's model ID format (provider/model for third-party models).
 */
const OPENROUTER_MODELS = [
  'openai/gpt-4o',
  'openai/gpt-4.1',
  'openai/o3',
  'openai/o4-mini',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat-v3',
  'deepseek/deepseek-coder',
  'mistralai/mistral-large',
  'cohere/command-r-plus',
  'qwen/qwen-2.5-coder-32b-instruct',
];

const DEFAULT_MODEL = 'openai/gpt-4o';
const BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider extends BaseLlmProvider {
  readonly type: LlmProviderType = 'openrouter';
  readonly executionMode: ExecutionMode = 'direct';

  private getApiKey(): string | undefined {
    return process.env.OPENROUTER_API_KEY;
  }

  getInfo(): LlmProviderInfo {
    return {
      type: this.type,
      name: 'OpenRouter',
      executionMode: this.executionMode,
      models: OPENROUTER_MODELS,
      defaultModel: DEFAULT_MODEL,
      supportsTools: true,
      supportsStreaming: true,
    };
  }

  protected async doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const messages = this.buildMessages(params);
    const tools = params.tools ? this.buildTools(params.tools) : undefined;
    const useStreaming = !!params.onStream || !!params.onActivity;

    if (useStreaming) {
      return this.doStreamingComplete(apiKey, params.model, messages, tools, params);
    }

    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      max_tokens: params.maxTokens ?? 1024,
    };
    if (params.temperature !== undefined) body.temperature = params.temperature;
    if (tools && tools.length > 0) body.tools = tools;

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    return this.parseResponse(data);
  }

  async isAvailable(): Promise<boolean> {
    return !!this.getApiKey();
  }

  /**
   * List all models available on OpenRouter.
   * Proxies the /api/v1/models endpoint for dashboard discovery.
   */
  async listModels(): Promise<
    Array<{ id: string; name: string; pricing: { prompt: string; completion: string }; context_length: number }>
  > {
    const apiKey = this.getApiKey();
    if (!apiKey) return [];

    try {
      const response = await fetch(`${BASE_URL}/models`, {
        headers: this.buildHeaders(apiKey),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return [];

      const data = (await response.json()) as {
        data: Array<{
          id: string;
          name: string;
          pricing: { prompt: string; completion: string };
          context_length: number;
        }>;
      };
      return data.data ?? [];
    } catch (err) {
      log.warn('Failed to list OpenRouter models', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://corvidlabs.com',
      'X-Title': 'CorvidAgent',
    };
  }

  private buildMessages(params: LlmCompletionParams): OpenRouterMessage[] {
    const messages: OpenRouterMessage[] = [];

    // System prompt as first message
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }

    // Convert conversation messages
    for (const msg of params.messages) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId,
        });
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    return messages;
  }

  private buildTools(
    tools: LlmToolDefinition[],
  ): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      },
    }));
  }

  private parseResponse(data: OpenRouterResponse): LlmCompletionResult {
    const choice = data.choices[0];
    if (!choice) {
      throw new Error('OpenRouter returned no choices');
    }

    const toolCalls: LlmToolCall[] | undefined = choice.message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }));

    return {
      content: choice.message.content ?? '',
      model: data.model,
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private async doStreamingComplete(
    apiKey: string,
    model: string,
    messages: OpenRouterMessage[],
    tools:
      | Array<{
          type: 'function';
          function: { name: string; description: string; parameters: Record<string, unknown> };
        }>
      | undefined,
    params: LlmCompletionParams,
  ): Promise<LlmCompletionResult> {
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: params.maxTokens ?? 1024,
      stream: true,
    };
    if (params.temperature !== undefined) body.temperature = params.temperature;
    if (tools && tools.length > 0) body.tools = tools;

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    if (!response.body) {
      throw new Error('OpenRouter returned no streaming body');
    }

    let content = '';
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    const toolCallParts = new Map<number, { id: string; name: string; arguments: string }>();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed?.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const chunk = JSON.parse(payload) as OpenRouterStreamDelta;
            const delta = chunk.choices?.[0]?.delta;

            if (delta?.content) {
              content += delta.content;
              params.onStream?.(delta.content);
            }

            // Accumulate tool call fragments
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCallParts.get(tc.index);
                if (existing) {
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                } else {
                  toolCallParts.set(tc.index, {
                    id: tc.id ?? '',
                    name: tc.function?.name ?? '',
                    arguments: tc.function?.arguments ?? '',
                  });
                }
              }
            }

            if (chunk.usage) {
              usage = {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
              };
            }

            params.onActivity?.();
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCalls: LlmToolCall[] = [];
    for (const [, part] of toolCallParts) {
      try {
        toolCalls.push({
          id: part.id,
          name: part.name,
          arguments: JSON.parse(part.arguments),
        });
      } catch {
        log.warn('Failed to parse streamed tool call arguments', { name: part.name });
      }
    }

    return {
      content,
      model,
      usage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
