/**
 * Provider routing logic — determines which LLM provider (SDK, Cursor, Ollama)
 * to use for a given session based on agent config and system state.
 *
 * Extracted from manager.ts to keep routing decisions testable and isolated.
 *
 * @module
 */

import { createLogger } from '../lib/logger';

const log = createLogger('ProviderRouting');

/** Result of a provider routing decision. */
export interface RoutingDecision {
  /** Which provider to use (sdk, cursor, ollama). */
  provider: string;
  /** Why this provider was selected. */
  reason: 'default' | 'agent_config' | 'no_claude_access' | 'cursor_binary_missing' | 'ollama_via_claude_proxy';
  /** Whether this was a fallback from the original intent. */
  fallback: boolean;
  /** Model to use (may be cleared if original model is incompatible with the fallback provider). */
  effectiveModel: string;
}

/**
 * Determine the provider routing decision based on agent config and system state.
 * Pure function — no side effects, suitable for unit testing.
 */
export function resolveProviderRouting(opts: {
  providerType: import('../providers/types').LlmProviderType | undefined;
  agentModel: string;
  hasCursorBinary: boolean;
  hasClaudeAccess: boolean;
  hasOllamaProvider: boolean;
  ollamaDefaultModel?: string;
}): RoutingDecision {
  const {
    providerType,
    agentModel,
    hasCursorBinary,
    hasClaudeAccess: hasCloud,
    hasOllamaProvider,
    ollamaDefaultModel,
  } = opts;

  // Cursor agent configured but binary missing → degrade to SDK
  if (providerType === 'cursor' && !hasCursorBinary) {
    const isCursorOnlyModel =
      agentModel === 'auto' ||
      agentModel.startsWith('composer') ||
      agentModel.startsWith('gpt-') ||
      agentModel.startsWith('gemini-') ||
      agentModel.startsWith('grok-');
    return {
      provider: 'sdk',
      reason: 'cursor_binary_missing',
      fallback: true,
      effectiveModel: isCursorOnlyModel ? '' : agentModel,
    };
  }

  // No explicit provider + no cloud access → try Ollama
  if (!providerType && !hasCloud && hasOllamaProvider) {
    // Check if Ollama should use Claude Code proxy for better tool/reasoning support
    if (process.env.OLLAMA_USE_CLAUDE_PROXY === 'true') {
      log.info('OLLAMA_USE_CLAUDE_PROXY enabled — routing Ollama through SDK (Claude Code)');
      const isOllamaModel =
        !agentModel || agentModel.includes(':') || agentModel.startsWith('qwen') || agentModel.startsWith('llama');
      return {
        provider: 'sdk',
        reason: 'ollama_via_claude_proxy',
        fallback: true,
        effectiveModel: isOllamaModel ? agentModel : (ollamaDefaultModel ?? ''),
      };
    }
    const isOllamaModel =
      !agentModel || agentModel.includes(':') || agentModel.startsWith('qwen') || agentModel.startsWith('llama');
    return {
      provider: 'ollama',
      reason: 'no_claude_access',
      fallback: true,
      effectiveModel: isOllamaModel ? agentModel : (ollamaDefaultModel ?? ''),
    };
  }

  // Normal routing
  return {
    provider: providerType ?? 'sdk',
    reason: providerType ? 'agent_config' : 'default',
    fallback: false,
    effectiveModel: agentModel,
  };
}

// SDK (Claude Code) tool names → direct-process (Ollama) equivalents
const SDK_TO_DIRECT_TOOL_MAP: Record<string, string> = {
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
  Glob: 'list_files',
  Grep: 'search_files',
  Shell: 'run_command',
};

/**
 * Translate SDK-style tool names to direct-process names and merge
 * mcpToolAllowList. Returns undefined if both inputs are empty/absent
 * (meaning "allow all tools").
 */
export function resolveDirectToolAllowList(
  toolAllowList?: string[],
  mcpToolAllowList?: string[],
): string[] | undefined {
  const hasToolList = toolAllowList && toolAllowList.length > 0;
  const hasMcpList = mcpToolAllowList && mcpToolAllowList.length > 0;

  if (!hasToolList && !hasMcpList) return undefined;

  const result: string[] = [];

  if (hasToolList) {
    for (const name of toolAllowList) {
      const mapped = SDK_TO_DIRECT_TOOL_MAP[name];
      result.push(mapped ?? name);
    }
  }

  if (hasMcpList) {
    for (const name of mcpToolAllowList) {
      if (!result.includes(name)) {
        result.push(name);
      }
    }
  }

  return result.length > 0 ? result : undefined;
}
