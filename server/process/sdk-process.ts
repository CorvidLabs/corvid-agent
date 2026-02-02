import type { Session, Agent, Project } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import type { ApprovalManager } from './approval-manager';
import type { ApprovalRequest, ApprovalRequestWire } from './approval-types';
import { formatToolDescription } from './approval-types';
import { query, type Query, type SDKMessage, type PermissionResult, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '../lib/logger';

const log = createLogger('SdkProcess');

export interface SdkProcessOptions {
    session: Session;
    project: Project;
    agent: Agent | null;
    prompt: string;
    approvalManager: ApprovalManager;
    onEvent: (event: ClaudeStreamEvent) => void;
    onExit: (code: number | null) => void;
    onApprovalRequest: (request: ApprovalRequestWire) => void;
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
    } = options;

    const abortController = new AbortController();
    const pseudoPid = nextPseudoPid++;
    let inputDone = false;

    const canUseTool: CanUseTool = async (toolName, input, _opts) => {
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
    const sdkOptions: import('@anthropic-ai/claude-agent-sdk').Options = {
        abortController,
        cwd: project.workingDir,
        canUseTool,
        permissionMode: permissionMode as import('@anthropic-ai/claude-agent-sdk').PermissionMode,
        includePartialMessages: true,
        env: {
            ...process.env,
            ...project.envVars,
        },
    };

    if (agent?.model) {
        sdkOptions.model = agent.model;
    }

    if (agent?.systemPrompt) {
        if (agent.appendPrompt) {
            sdkOptions.systemPrompt = {
                type: 'preset',
                preset: 'claude_code',
                append: `${agent.systemPrompt}\n\n${agent.appendPrompt}`,
            };
        } else {
            sdkOptions.systemPrompt = agent.systemPrompt;
        }
    } else if (agent?.appendPrompt) {
        sdkOptions.systemPrompt = {
            type: 'preset',
            preset: 'claude_code',
            append: agent.appendPrompt,
        };
    }

    // NOTE: In the SDK, allowedTools means "auto-approve these tools without calling
    // canUseTool". Since we're on the approval path, we set `tools` to define which
    // tools are available, but do NOT set `allowedTools` — so canUseTool is called
    // for each one.
    if (agent?.allowedTools) {
        sdkOptions.tools = agent.allowedTools.split(',').map((t) => t.trim());
    }

    if (agent?.disallowedTools) {
        sdkOptions.disallowedTools = agent.disallowedTools.split(',').map((t) => t.trim());
    }

    if (agent?.maxBudgetUsd !== null && agent?.maxBudgetUsd !== undefined) {
        sdkOptions.maxBudgetUsd = agent.maxBudgetUsd;
    }

    if (project.claudeMd) {
        sdkOptions.settingSources = ['user', 'project'];
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
    (async () => {
        try {
            for await (const message of q) {
                log.debug(`SDK message for session ${session.id}`, { type: message.type });
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
