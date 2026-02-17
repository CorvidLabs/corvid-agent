import type { Session, Agent, Project } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import type { ApprovalManager } from './approval-manager';
import type { ApprovalRequest, ApprovalRequestWire } from './approval-types';
import { formatToolDescription } from './approval-types';
import { isProtectedPath, extractFilePathsFromInput, BASH_WRITE_OPERATORS } from './protected-paths';
import { query, type Query, type SDKMessage, type PermissionResult, type CanUseTool, type McpSdkServerConfigWithInstance, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '../lib/logger';

const log = createLogger('SdkProcess');

// Environment variables safe to pass to agent subprocesses.
// Everything else (ALGOCHAT_MNEMONIC, WALLET_ENCRYPTION_KEY, API_KEY, etc.) is excluded.
const ENV_ALLOWLIST = new Set([
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
]);

function buildSafeEnv(projectEnvVars?: Record<string, string>): Record<string, string> {
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

const API_FAILURE_THRESHOLD = 3;

const API_ERROR_PATTERNS = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'fetch failed',
    'ENOTFOUND',
    'socket hang up',
];

function isApiError(error: string): boolean {
    const lower = error.toLowerCase();
    // Network errors
    if (API_ERROR_PATTERNS.some((p) => error.includes(p))) return true;
    // HTTP 5xx from Anthropic
    if (/5\d{2}/.test(error) && (lower.includes('anthropic') || lower.includes('api') || lower.includes('server error'))) return true;
    // Rate limit (429)
    if (error.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) return true;
    // Overloaded
    if (lower.includes('overloaded') || lower.includes('capacity')) return true;
    return false;
}

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
    /** Persona system prompt section (from agent_personas table) */
    personaPrompt?: string;
    /** Skill bundle prompt additions (from assigned skill_bundles) */
    skillPrompt?: string;
}

export interface SdkProcess {
    pid: number;
    sendMessage: (content: string) => boolean;
    kill: () => void;
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
        personaPrompt,
        skillPrompt,
    } = options;

    const abortController = new AbortController();
    const pseudoPid = nextPseudoPid++;
    let inputDone = false;

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
                    log.warn('Blocked Bash write to protected path', { sessionId: session.id, command: command.slice(0, 200), matchedPath });
                    return { behavior: 'deny' as const, message: `Cannot modify protected files via shell commands: ${matchedPath}` };
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

        const result: PermissionResult = response.behavior === 'allow'
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
    const sdkPermissionMode = SDK_MODE_MAP[permissionMode] ?? permissionMode as import('@anthropic-ai/claude-agent-sdk').PermissionMode;
    const needsBypass = sdkPermissionMode === 'bypassPermissions';

    const sdkOptions: import('@anthropic-ai/claude-agent-sdk').Options = {
        abortController,
        cwd: project.workingDir,
        canUseTool,
        permissionMode: sdkPermissionMode,
        allowDangerouslySkipPermissions: needsBypass || undefined,
        includePartialMessages: true,
        env: buildSafeEnv(project.envVars),
    };

    if (agent?.model) {
        sdkOptions.model = agent.model;
    }

    // Build combined append content from agent config + persona + skills
    const appendParts: string[] = [];
    if (agent?.systemPrompt) appendParts.push(agent.systemPrompt);
    if (agent?.appendPrompt) appendParts.push(agent.appendPrompt);
    if (personaPrompt) appendParts.push(personaPrompt);
    if (skillPrompt) appendParts.push(`## Skill Instructions\n${skillPrompt}`);

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

    // Plan mode tools (EnterPlanMode, ExitPlanMode) require an interactive user
    // to approve plans. They're incompatible with bypassPermissions mode and will
    // error at the SDK level. Disallow them to prevent confusing errors. (#71)
    const systemDisallowed: string[] = [];
    if (needsBypass) {
        systemDisallowed.push('EnterPlanMode', 'ExitPlanMode');
    }
    const agentDisallowed = agent?.disallowedTools
        ? agent.disallowedTools.split(',').map((t) => t.trim()).filter(Boolean)
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

    if (mcpServers && mcpServers.length > 0) {
        const mcpRecord: Record<string, McpServerConfig> = {};
        for (const server of mcpServers) {
            mcpRecord[server.name] = server;
        }
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
        prompt,
        options: sdkOptions,
    });

    // Consume the async generator in the background
    let consecutiveApiErrors = 0;

    (async () => {
        try {
            for await (const message of q) {
                log.debug(`SDK message for session ${session.id}`, { type: message.type });
                // Successful message received — reset API error counter
                consecutiveApiErrors = 0;
                const event = mapSdkMessageToEvent(message, session.id);
                if (event) {
                    onEvent(event);
                }
            }
            onExit(0);
        } catch (err) {
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
            onExit(1);
        } finally {
            inputDone = true;
        }
    })();

    function sendMessage(content: string): boolean {
        if (inputDone || abortController.signal.aborted) return false;

        // Stream input to the running query
        q.streamInput((async function* () {
            yield {
                type: 'user' as const,
                message: { role: 'user' as const, content },
                parent_tool_use_id: null,
                session_id: session.id,
            } as import('@anthropic-ai/claude-agent-sdk').SDKUserMessage;
        })()).catch((err) => {
            log.warn(`streamInput failed for session ${session.id}`, {
                error: err instanceof Error ? err.message : String(err),
            });
        });

        return true;
    }

    function kill(): void {
        inputDone = true;
        abortController.abort();
        q.close();
    }

    return { pid: pseudoPid, sendMessage, kill };
}

function mapSdkMessageToEvent(message: SDKMessage, sessionId: string): ClaudeStreamEvent | null {
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
