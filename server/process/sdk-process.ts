import {
  type CanUseTool,
  type McpSdkServerConfigWithInstance,
  type McpServerConfig,
  type PermissionResult,
  type Query,
  query,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { Agent, McpServerConfig as DbMcpServerConfig, Project, Session } from '../../shared/types';
import { createLogger } from '../lib/logger';
import {
  getMessagingSafetyPrompt,
  getProjectContextPrompt,
  getResponseRoutingPrompt,
  getWorktreeIsolationPrompt,
} from '../providers/ollama/tool-prompt-templates';
import type { ApprovalManager } from './approval-manager';
import type { ApprovalRequest, ApprovalRequestWire } from './approval-types';
import { formatToolDescription } from './approval-types';
import { getContextBudget } from './context-management';
import { prependRoutingContext } from './direct-process';
import { BASH_WRITE_OPERATORS, extractFilePathsFromInput, isProtectedPath } from './protected-paths';
import type { ClaudeStreamEvent } from './types';

const log = createLogger('SdkProcess');

// Environment variables safe to pass to agent subprocesses.
// Everything else (ALGOCHAT_MNEMONIC, WALLET_ENCRYPTION_KEY, API_KEY, etc.) is excluded.
export const ENV_ALLOWLIST = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_STREAM_CLOSE_TIMEOUT',
  // Node/Bun runtime
  'NODE_ENV',
  'NODE_PATH',
  'BUN_INSTALL',
  // Git
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  // Editor (for Claude Code)
  'EDITOR',
  'VISUAL',
  // Ollama
  'OLLAMA_HOST',
  // Ollama cloud proxy — set when launching Claude Code backed by Ollama
  'ANTHROPIC_BASE_URL',
]);

export function buildSafeEnv(projectEnvVars?: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key]) {
      safe[key] = process.env[key] as string;
    }
  }
  // Project-specific env vars are intentional — owner configured them per-project
  if (projectEnvVars) {
    Object.assign(safe, projectEnvVars);
  }
  // MCP stream timeout — how long the MCP stdio transport stays open.
  // Default 10 min is too short for long autonomous sessions (polling, work tasks).
  // Set to 2 hours to avoid tools dying mid-session.
  safe.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = '7200000';
  return safe;
}

export const API_FAILURE_THRESHOLD = 3;

export const API_ERROR_PATTERNS = ['ECONNREFUSED', 'ETIMEDOUT', 'fetch failed', 'ENOTFOUND', 'socket hang up'];

export function isApiError(error: string): boolean {
  const lower = error.toLowerCase();
  // Network errors
  if (API_ERROR_PATTERNS.some((p) => error.includes(p))) return true;
  // HTTP 5xx from Anthropic
  if (/5\d{2}/.test(error) && (lower.includes('anthropic') || lower.includes('api') || lower.includes('server error')))
    return true;
  // Rate limit (429)
  if (error.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) return true;
  // Overloaded
  if (lower.includes('overloaded') || lower.includes('capacity')) return true;
  return false;
}

export interface TurnCompleteMetrics {
  totalCostUsd: number;
  durationMs: number;
  numTurns: number;
}

export interface SdkProcessOptions {
  session: Session;
  project: Project;
  agent: Agent | null;
  prompt: string;
  approvalManager: ApprovalManager;
  onEvent: (event: ClaudeStreamEvent) => void;
  onExit: (code: number | null, errorMessage?: string) => void;
  onApprovalRequest: (request: ApprovalRequestWire) => void;
  onApiOutage?: () => void;
  mcpServers?: McpSdkServerConfigWithInstance[];
  /** External MCP server configs from the database (stdio servers like Figma, Slack, etc.) */
  externalMcpConfigs?: DbMcpServerConfig[];
  /** Persona system prompt section (from personas + agent_persona_assignments tables) */
  personaPrompt?: string;
  /** Skill bundle prompt additions (from assigned skill_bundles) */
  skillPrompt?: string;
  /** When true, disable ALL tools — pure conversation mode for untrusted users. */
  conversationOnly?: boolean;
  /** When provided, only these built-in tools are allowed — all others are disallowed. */
  toolAllowList?: string[];
  /** When true, process enters warm state after each model turn instead of exiting. */
  keepAlive?: boolean;
  /** Fires when model finishes a turn but process stays alive (keepAlive mode only). */
  onTurnComplete?: (metrics: TurnCompleteMetrics) => void;
}

/** All built-in Claude Code tools that must be blocked in conversation-only mode. */
const ALL_BUILTIN_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Bash',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'TodoRead',
  'TodoWrite',
  'NotebookEdit',
  'Agent',
  'EnterPlanMode',
  'ExitPlanMode',
  'EnterWorktree',
  'ExitWorktree',
  'TaskStart',
  'TaskStatus',
  'TaskOutput',
  'TaskStop',
  'AskFollowUpQuestion',
];

export interface SdkProcess {
  pid: number;
  sendMessage: (
    content: string | import('@anthropic-ai/sdk/resources/messages/messages').ContentBlockParam[],
  ) => boolean;
  kill: () => void;
  /** Returns true if the process can still accept and process messages. */
  isAlive: () => boolean;
  /** Returns true if the process completed a turn and is idle waiting for streamInput(). */
  isWarm: () => boolean;
}

let nextPseudoPid = 900_000;

export function startSdkProcess(options: SdkProcessOptions): SdkProcess {
  const {
    session,
    project,
    agent,
    prompt,
    approvalManager,
    onEvent,
    onExit,
    onApprovalRequest,
    onApiOutage,
    mcpServers,
    externalMcpConfigs,
    personaPrompt,
    skillPrompt,
    conversationOnly,
    toolAllowList,
    keepAlive,
    onTurnComplete,
  } = options;

  const abortController = new AbortController();
  const pseudoPid = nextPseudoPid++;
  let inputDone = false;
  let warm = false;

  const canUseTool: CanUseTool = async (toolName, input, _opts) => {
    // Protected path check — runs BEFORE bypass modes so even full-auto agents are blocked
    const inputObj = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
    if (FILE_TOOLS.has(toolName)) {
      const filePaths = extractFilePathsFromInput(inputObj);
      const blocked = filePaths.find(isProtectedPath);
      if (blocked) {
        log.warn(`Blocked ${toolName} on protected path`, { sessionId: session.id, filePath: blocked });
        return { behavior: 'deny' as const, message: `Cannot modify protected file: ${blocked}` };
      }
    }
    if (toolName === 'Bash') {
      const command = typeof inputObj.command === 'string' ? inputObj.command : '';
      if (BASH_WRITE_OPERATORS.test(command)) {
        // Extract potential file paths from the command and check each
        const tokens = command.split(/\s+/);
        const matchedPath = tokens.find((t) => isProtectedPath(t));
        if (matchedPath) {
          log.warn('Blocked Bash write to protected path', {
            sessionId: session.id,
            command: command.slice(0, 200),
            matchedPath,
          });
          return {
            behavior: 'deny' as const,
            message: `Cannot modify protected files via shell commands: ${matchedPath}`,
          };
        }
      }
    }

    // Auto-approve tool use for bypass permission modes (full-auto, bypassPermissions, etc.)
    // NOTE: Plan mode tools (EnterPlanMode, ExitPlanMode) are handled at the SDK
    // disallowedTools level for bypass modes — see below where sdkOptions is built.
    const BYPASS_MODES = new Set(['bypassPermissions', 'dontAsk', 'acceptEdits', 'full-auto']);
    if (BYPASS_MODES.has(permissionMode)) {
      return { behavior: 'allow' as const };
    }

    log.info(`canUseTool called for session ${session.id}`, { toolName, input: JSON.stringify(input).slice(0, 200) });
    const requestId = crypto.randomUUID().slice(0, 8);
    const timeoutMs = approvalManager.getDefaultTimeout(session.source);

    const request: ApprovalRequest = {
      id: requestId,
      sessionId: session.id,
      toolName,
      toolInput: input,
      description: formatToolDescription(toolName, input),
      createdAt: Date.now(),
      timeoutMs,
      source: session.source,
    };

    // Notify the channel (WS or AlgoChat)
    onApprovalRequest({
      id: request.id,
      sessionId: request.sessionId,
      toolName: request.toolName,
      description: request.description,
      createdAt: request.createdAt,
      timeoutMs: request.timeoutMs,
    });

    // Wait for user response
    const response = await approvalManager.createRequest(request);

    const result: PermissionResult =
      response.behavior === 'allow'
        ? {
            behavior: 'allow' as const,
            updatedInput: response.updatedInput,
          }
        : {
            behavior: 'deny' as const,
            message: response.message ?? 'Permission denied by user',
          };

    return result;
  };

  // Build SDK options
  const permissionMode = agent?.permissionMode ?? 'default';

  // Map our permission modes to SDK-compatible values.
  // The SDK doesn't have 'full-auto' — map it to 'bypassPermissions'.
  // The SDK uses 'acceptEdits' not 'auto-edit'.
  const SDK_MODE_MAP: Record<string, import('@anthropic-ai/claude-agent-sdk').PermissionMode> = {
    'full-auto': 'bypassPermissions',
    'auto-edit': 'acceptEdits',
  };
  const sdkPermissionMode =
    SDK_MODE_MAP[permissionMode] ?? (permissionMode as import('@anthropic-ai/claude-agent-sdk').PermissionMode);
  const needsBypass = sdkPermissionMode === 'bypassPermissions';

  // Build environment and log if proxying via Ollama
  const safeEnv = buildSafeEnv(project.envVars);
  if (safeEnv.ANTHROPIC_BASE_URL) {
    log.info('SDK env passing ANTHROPIC_BASE_URL to child', {
      url: safeEnv.ANTHROPIC_BASE_URL,
      hasApiKey: !!safeEnv.ANTHROPIC_API_KEY,
    });
  }

  const sdkOptions: import('@anthropic-ai/claude-agent-sdk').Options = {
    abortController,
    cwd: project.workingDir,
    canUseTool,
    permissionMode: sdkPermissionMode,
    allowDangerouslySkipPermissions: needsBypass || undefined,
    includePartialMessages: true,
    env: safeEnv,
    // Chrome extension bridge does not work from SDK-spawned subprocesses.
    // Browser automation is provided by corvid_browser (Playwright) instead.
    // Do NOT pass extraArgs: { chrome: null } — it injects non-functional
    // Chrome tool instructions that confuse agents.
  };

  if (agent?.model) {
    sdkOptions.model = agent.model;
  }

  // For AlgoChat/agent/Discord-sourced sessions, prepend routing context to the prompt
  const effectivePrompt = prependRoutingContext(prompt, session.source);

  // Build combined append content from agent config + persona + skills
  const appendParts: string[] = [];
  if (agent?.systemPrompt) appendParts.push(agent.systemPrompt);
  if (agent?.appendPrompt) appendParts.push(agent.appendPrompt);
  if (personaPrompt) appendParts.push(personaPrompt);
  if (skillPrompt) appendParts.push(`## Skill Instructions\n${skillPrompt}`);
  // Always append messaging safety — unconditional guard preventing agents from
  // generating scripts to bypass MCP tool-only messaging. See spec invariant #7.
  appendParts.push(getMessagingSafetyPrompt());
  // Explicit instruction to read observations and conversation history on resume
  appendParts.push(
    '## Context Restoration\n\nBefore responding to any message, ALWAYS read the <recent_observations> section (if present) to understand relevant insights from past sessions. Similarly, ALWAYS read the <conversation_history> section (if present) to understand the current discussion context. These sections are critical for maintaining continuity.',
  );
  // Add channel affinity routing guidance to system prompt
  appendParts.push(getResponseRoutingPrompt());
  // Add worktree isolation context so the agent knows it's in an isolated branch
  // and should not interact with other sessions' branches.
  if (session.workDir) {
    appendParts.push(getWorktreeIsolationPrompt());
  }
  // Pin the active project in the system prompt so it survives context compression.
  // Without this, agents can "forget" which repo they're working on after context
  // fills up and fall back to operating on their home project (issue #1628).
  appendParts.push(getProjectContextPrompt(project));

  if (appendParts.length > 0) {
    const combinedAppend = appendParts.join('\n\n');
    if (agent?.systemPrompt) {
      // Agent has a full system prompt — use preset+append pattern
      sdkOptions.systemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: combinedAppend,
      };
    } else {
      // Only append content (no full override) — append to claude_code preset
      sdkOptions.systemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: combinedAppend,
      };
    }
  }

  // NOTE: In the SDK, allowedTools means "auto-approve these tools without calling
  // canUseTool". Since we're on the approval path, we set `tools` to define which
  // tools are available, but do NOT set `allowedTools` — so canUseTool is called
  // for each one.
  if (agent?.allowedTools) {
    sdkOptions.tools = agent.allowedTools.split(',').map((t) => t.trim());
  }

  // Conversation-only mode: block ALL built-in tools. No file ops, no bash, no web, nothing.
  // This is the security lockdown for untrusted public-facing sessions.
  // toolAllowList mode: only allow specific tools (e.g. read-only for buddy review).
  const systemDisallowed: string[] = [];
  if (conversationOnly) {
    systemDisallowed.push(...ALL_BUILTIN_TOOLS);
  } else if (toolAllowList && toolAllowList.length > 0) {
    const allowed = new Set(toolAllowList);
    systemDisallowed.push(...ALL_BUILTIN_TOOLS.filter((t) => !allowed.has(t)));
  }
  // Plan mode tools (EnterPlanMode, ExitPlanMode) require an interactive user
  // to approve plans. They're incompatible with bypassPermissions mode and will
  // error at the SDK level. Disallow them to prevent confusing errors. (#71)
  if (needsBypass) {
    systemDisallowed.push('EnterPlanMode', 'ExitPlanMode');
  }
  const agentDisallowed = agent?.disallowedTools
    ? agent.disallowedTools
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const allDisallowed = [...new Set([...systemDisallowed, ...agentDisallowed])];
  if (allDisallowed.length > 0) {
    sdkOptions.disallowedTools = allDisallowed;
  }

  if (agent?.maxBudgetUsd !== null && agent?.maxBudgetUsd !== undefined) {
    sdkOptions.maxBudgetUsd = agent.maxBudgetUsd;
  }

  if (project.claudeMd) {
    sdkOptions.settingSources = ['user', 'project'];
  }

  // Build MCP servers record — corvid tools + any external servers (Figma, Slack, etc.)
  const mcpRecord: Record<string, McpServerConfig> = {};
  if (mcpServers && mcpServers.length > 0) {
    for (const server of mcpServers) {
      mcpRecord[server.name] = server;
    }
  }
  if (externalMcpConfigs && externalMcpConfigs.length > 0) {
    for (const ext of externalMcpConfigs) {
      mcpRecord[ext.name] = {
        type: 'stdio',
        command: ext.command,
        args: ext.args,
        env: { ...(process.env as Record<string, string>), ...ext.envVars },
      };
      log.info(`Adding external MCP server "${ext.name}" to SDK session`, {
        sessionId: session.id,
        command: ext.command,
      });
    }
  }
  if (Object.keys(mcpRecord).length > 0) {
    sdkOptions.mcpServers = mcpRecord;
  }

  log.debug(`Starting SDK process for session ${session.id}`, {
    cwd: project.workingDir,
    permissionMode,
    model: agent?.model ?? 'default',
  });

  log.info(`Starting SDK query for session ${session.id}`, {
    permissionMode: sdkOptions.permissionMode,
    hasCanUseTool: !!sdkOptions.canUseTool,
    model: sdkOptions.model,
    cwd: sdkOptions.cwd,
  });

  // Start the SDK query
  const q: Query = query({
    prompt: effectivePrompt,
    options: sdkOptions,
  });

  // Consume the async generator in the background
  let consecutiveApiErrors = 0;

  (async () => {
    let messageCount = 0;
    try {
      for await (const message of q) {
        messageCount++;
        log.debug(`SDK message #${messageCount} for session ${session.id}`, {
          type: message.type,
          subtype: (message as Record<string, unknown>).subtype,
        });
        // Successful message received — reset API error counter
        consecutiveApiErrors = 0;

        // Emit context_usage before result so Discord embeds can include it in the footer
        if (message.type === 'result') {
          const contextUsage = extractContextUsageFromResult(message, agent?.model);
          if (contextUsage) {
            onEvent({
              type: 'context_usage',
              session_id: session.id,
              ...contextUsage,
            } as ClaudeStreamEvent);
          }
        }

        const event = mapSdkMessageToEvent(message, session.id);
        if (event) {
          onEvent(event);
        }

        // Keep-alive turn boundary: when keepAlive is enabled and model finishes a turn,
        // transition to warm state instead of exiting. The async iterator stays open
        // waiting for streamInput() to feed a new user message.
        if (message.type === 'result' && keepAlive) {
          warm = true;
          log.info(`SDK process entering warm state for session ${session.id}`, { pid: pseudoPid });
          if (onTurnComplete) {
            const result = message as import('@anthropic-ai/claude-agent-sdk').SDKResultMessage;
            onTurnComplete({
              totalCostUsd: result.total_cost_usd ?? 0,
              durationMs: result.duration_ms ?? 0,
              numTurns: result.num_turns ?? 0,
            });
          }
        }
      }
      if (messageCount === 0) {
        log.warn(`SDK query completed with 0 messages for session ${session.id}`, { prompt: prompt.slice(0, 100) });
      }
      warm = false;
      onExit(0);
    } catch (err) {
      warm = false;
      if (err instanceof Error && err.name === 'AbortError') {
        onExit(0);
        return;
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`SDK process error for session ${session.id}`, { error: errorMsg });

      // Track consecutive API errors
      if (isApiError(errorMsg)) {
        consecutiveApiErrors++;
        log.warn(`Consecutive API error #${consecutiveApiErrors} for session ${session.id}`, { error: errorMsg });

        if (consecutiveApiErrors >= API_FAILURE_THRESHOLD && onApiOutage) {
          log.warn(`API outage detected for session ${session.id} after ${consecutiveApiErrors} consecutive failures`);
          onApiOutage();
          return; // Don't call onExit — manager handles the pause
        }
      } else {
        consecutiveApiErrors = 0;
      }

      onEvent({
        type: 'error',
        error: { message: errorMsg, type: 'sdk_error' },
      } as ClaudeStreamEvent);
      onExit(1, errorMsg);
    } finally {
      inputDone = true;
      warm = false;
    }
  })();

  function sendMessage(
    content: string | import('@anthropic-ai/sdk/resources/messages/messages').ContentBlockParam[],
  ): boolean {
    if (inputDone || abortController.signal.aborted) {
      log.info(
        `sendMessage rejected for session ${session.id}: inputDone=${inputDone}, aborted=${abortController.signal.aborted}`,
      );
      return false;
    }

    const wasWarm = warm;
    if (warm) {
      warm = false; // Transition from warm → processing
      log.info(`SDK process transitioning warm → processing for session ${session.id}`, { pid: pseudoPid });
    }

    const isMultimodal = Array.isArray(content);
    log.info(`sendMessage: streaming ${isMultimodal ? 'multimodal' : 'text'} content to session ${session.id}`, {
      isMultimodal,
      blockCount: isMultimodal ? content.length : 0,
      blockTypes: isMultimodal ? content.map((b) => b.type) : [],
      contentPreview: isMultimodal ? JSON.stringify(content).slice(0, 300) : (content as string).slice(0, 200),
    });

    // Stream input to the running query
    q.streamInput(
      (async function* () {
        yield {
          type: 'user' as const,
          message: { role: 'user' as const, content },
          parent_tool_use_id: null,
          session_id: session.id,
        } as import('@anthropic-ai/claude-agent-sdk').SDKUserMessage;
      })(),
    ).catch((err) => {
      log.warn(`streamInput failed for session ${session.id}`, {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        wasWarm,
      });
      // If streamInput fails on a warm process, mark as done so caller falls back to cold start
      if (wasWarm) {
        inputDone = true;
      }
    });

    return true;
  }

  function kill(): void {
    inputDone = true;
    abortController.abort();
    q.close();
  }

  function isAlive(): boolean {
    return !inputDone && !abortController.signal.aborted;
  }

  function isWarm(): boolean {
    return warm && !inputDone && !abortController.signal.aborted;
  }

  return { pid: pseudoPid, sendMessage, kill, isAlive, isWarm };
}

/**
 * Extract context usage from an SDK result message using per-iteration token data.
 */
function extractContextUsageFromResult(
  message: SDKMessage,
  model?: string,
): { estimatedTokens: number; contextWindow: number; usagePercent: number } | null {
  const result = message as import('@anthropic-ai/claude-agent-sdk').SDKResultMessage;
  if (result.subtype !== 'success') return null;

  const success = result as import('@anthropic-ai/claude-agent-sdk').SDKResultSuccess;

  // Try modelUsage first — it has contextWindow per model
  const modelEntries = Object.values(success.modelUsage ?? {});
  if (modelEntries.length > 0) {
    const primary = modelEntries[0];
    const contextWindow = primary.contextWindow || getContextBudget(model);
    const estimatedTokens = primary.inputTokens;
    if (estimatedTokens > 0) {
      const usagePercent = Math.round((estimatedTokens / contextWindow) * 100);
      return { estimatedTokens, contextWindow, usagePercent };
    }
    log.debug('modelUsage has 0 inputTokens, falling through', {
      model,
      keys: Object.keys(success.modelUsage ?? {}),
      contextWindow: primary.contextWindow,
    });
  }

  // Fall back to cumulative input_tokens from usage
  if (success.usage?.input_tokens) {
    const contextWindow = getContextBudget(model);
    const estimatedTokens = success.usage.input_tokens;
    const usagePercent = Math.round((estimatedTokens / contextWindow) * 100);
    return { estimatedTokens, contextWindow, usagePercent };
  }

  log.debug('No context usage data available from SDK result', {
    model,
    hasModelUsage: modelEntries.length > 0,
    hasUsage: !!success.usage,
    inputTokens: success.usage?.input_tokens,
  });

  return null;
}

export function mapSdkMessageToEvent(message: SDKMessage, sessionId: string): ClaudeStreamEvent | null {
  switch (message.type) {
    case 'assistant':
      return {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: message.message.content as import('./types').ContentBlock[],
        },
      } as ClaudeStreamEvent;

    case 'result': {
      const result = message as import('@anthropic-ai/claude-agent-sdk').SDKResultMessage;
      return {
        type: 'result',
        subtype: result.subtype,
        total_cost_usd: result.total_cost_usd,
        duration_ms: result.duration_ms,
        num_turns: result.num_turns,
        result: 'result' in result ? (result as { result?: string }).result : undefined,
        session_id: sessionId,
      } as ClaudeStreamEvent;
    }

    case 'stream_event': {
      const streamMsg = message as import('@anthropic-ai/claude-agent-sdk').SDKPartialAssistantMessage;
      const rawEvent = streamMsg.event as unknown as Record<string, unknown>;
      // Map Anthropic stream events to our format
      if (rawEvent.type === 'content_block_delta') {
        return {
          type: 'content_block_delta',
          delta: (rawEvent as { delta?: unknown }).delta as { type?: string; text?: string },
        } as ClaudeStreamEvent;
      }
      if (rawEvent.type === 'content_block_start') {
        return {
          type: 'content_block_start',
          content_block: (rawEvent as { content_block?: unknown }).content_block as { type: string; text?: string },
        } as ClaudeStreamEvent;
      }
      return null;
    }

    case 'system':
      // Emit system events as-is for logging
      return {
        type: 'system',
        subtype: (message as { subtype?: string }).subtype,
        message: { content: JSON.stringify(message) },
      } as ClaudeStreamEvent;

    default:
      return null;
  }
}
