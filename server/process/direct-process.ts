/**
 * Direct execution engine for non-SDK providers (e.g. Ollama).
 *
 * Implements the same SdkProcess interface so the ProcessManager and WebSocket
 * clients are unaware of the difference between SDK and direct mode.
 */

import type { Session, Agent, Project } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import type { ApprovalManager } from './approval-manager';
import type { ApprovalRequest, ApprovalRequestWire } from './approval-types';
import { formatToolDescription } from './approval-types';
import type { SdkProcess } from './sdk-process';
import type { LlmProvider, LlmToolCall } from '../providers/types';
import type { McpToolContext } from '../mcp/tool-handlers';
import { buildDirectTools, toProviderTools, type DirectToolDefinition } from '../mcp/direct-tools';
import { getToolInstructionPrompt, getResponseRoutingPrompt, detectModelFamily } from '../providers/ollama/tool-prompt-templates';
import { createLogger } from '../lib/logger';

const log = createLogger('DirectProcess');

const MAX_TOOL_ITERATIONS = 25;

export interface DirectProcessOptions {
    session: Session;
    project: Project;
    agent: Agent | null;
    prompt: string;
    provider: LlmProvider;
    approvalManager: ApprovalManager;
    onEvent: (event: ClaudeStreamEvent) => void;
    onExit: (code: number | null) => void;
    onApprovalRequest: (request: ApprovalRequestWire) => void;
    mcpToolContext: McpToolContext | null;
    /** The agent ID that sent the message triggering this session (for intercept logic). */
    senderAgentId?: string;
    /** The agent name that sent the message triggering this session (for intercept logic). */
    senderAgentName?: string;
}

let nextPseudoPid = 800_000;

export function startDirectProcess(options: DirectProcessOptions): SdkProcess {
    const {
        session,
        project,
        agent,
        prompt,
        provider,
        approvalManager,
        onEvent,
        onExit,
        onApprovalRequest,
        mcpToolContext,
        senderAgentId,
        senderAgentName,
    } = options;

    const pseudoPid = nextPseudoPid++;
    let aborted = false;
    let toolsDisabled = false;

    // Message queue for follow-up user messages
    const pendingMessages: string[] = [];
    let processing = false;

    // Build tools
    const directTools = mcpToolContext ? buildDirectTools(mcpToolContext) : [];
    const toolMap = new Map<string, DirectToolDefinition>();
    for (const t of directTools) {
        toolMap.set(t.name, t);
    }

    const model = agent?.model || provider.getInfo().defaultModel;

    // Build system prompt (with tool instructions if tools are available)
    const toolNames = directTools.map((t) => t.name);
    const systemPrompt = buildSystemPrompt(agent, project, model, toolNames, !toolsDisabled && directTools.length > 0);

    // Conversation history for the current session
    const messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }> = [];

    // For AlgoChat/agent-sourced sessions, prepend routing context to the initial prompt
    const effectivePrompt = prependRoutingContext(prompt, session.source);

    // Start the main loop
    runLoop(effectivePrompt).catch((err) => {
        if (aborted) return;
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Direct process error for session ${session.id}`, { error: errorMsg });
        onEvent({
            type: 'error',
            error: { message: errorMsg, type: 'direct_process_error' },
        } as ClaudeStreamEvent);
        onExit(1);
    });

    async function runLoop(userMessage: string): Promise<void> {
        processing = true;
        messages.push({ role: 'user', content: userMessage });

        let iteration = 0;
        while (!aborted && iteration < MAX_TOOL_ITERATIONS) {
            iteration++;

            const providerTools = (!toolsDisabled && directTools.length > 0)
                ? toProviderTools(directTools)
                : undefined;

            let result;
            try {
                result = await provider.complete({
                    model,
                    systemPrompt,
                    messages,
                    tools: providerTools,
                });
            } catch (err) {
                // Tool fallback: if the model doesn't support tools, retry without them
                const errorMsg = err instanceof Error ? err.message : String(err);
                if (!toolsDisabled && providerTools && isToolUnsupportedError(errorMsg)) {
                    log.warn(`Model ${model} does not support tools — disabling for this session`);
                    toolsDisabled = true;
                    // Retry without tools
                    result = await provider.complete({
                        model,
                        systemPrompt,
                        messages,
                    });
                } else {
                    throw err;
                }
            }

            if (aborted) return;

            // Emit assistant response
            if (result.content) {
                onEvent({
                    type: 'assistant',
                    message: {
                        role: 'assistant',
                        content: [{ type: 'text', text: result.content }],
                    },
                } as ClaudeStreamEvent);
            }

            // Handle tool calls
            if (result.toolCalls && result.toolCalls.length > 0) {
                // Add assistant message with tool call indication
                messages.push({ role: 'assistant', content: result.content || '' });

                let intercepted = false;
                for (const toolCall of result.toolCalls) {
                    if (aborted) return;

                    const toolDef = toolMap.get(toolCall.name);
                    if (!toolDef) {
                        const errorText = `Unknown tool: ${toolCall.name}`;
                        messages.push({ role: 'tool', content: errorText, toolCallId: toolCall.id });
                        emitToolStatus(toolCall.name, errorText, true);
                        continue;
                    }

                    // Permission check via approval flow
                    const permitted = await checkToolPermission(
                        toolCall, session, agent, approvalManager, onApprovalRequest,
                    );
                    if (aborted) return;

                    if (!permitted) {
                        const deniedText = `Permission denied for tool: ${toolCall.name}`;
                        messages.push({ role: 'tool', content: deniedText, toolCallId: toolCall.id });
                        emitToolStatus(toolCall.name, deniedText, true);
                        continue;
                    }

                    // Intercept corvid_send_message when the model tries to reply
                    // to the original sender instead of responding with plain text.
                    // This is common with smaller models (e.g. Qwen/Llama via Ollama)
                    // that ignore system prompt instructions about not using tools to reply.
                    if (toolCall.name === 'corvid_send_message' && senderAgentId) {
                        const toAgent = (toolCall.arguments as { to_agent?: string }).to_agent ?? '';
                        const isSelfReply =
                            toAgent === senderAgentId ||
                            (senderAgentName != null && toAgent.toLowerCase() === senderAgentName.toLowerCase());

                        if (isSelfReply) {
                            const interceptedMessage = (toolCall.arguments as { message?: string }).message ?? '';
                            log.info('Intercepted corvid_send_message self-reply', {
                                sessionId: session.id,
                                senderAgentId,
                                toAgent,
                                messagePreview: interceptedMessage.slice(0, 100),
                            });

                            // Treat the intercepted message as the model's plain text response
                            if (interceptedMessage) {
                                onEvent({
                                    type: 'assistant',
                                    message: {
                                        role: 'assistant',
                                        content: [{ type: 'text', text: interceptedMessage }],
                                    },
                                } as ClaudeStreamEvent);
                                messages.push({ role: 'assistant', content: interceptedMessage });
                            }

                            // Signal to break out of both loops — this is the final response
                            intercepted = true;
                            break;
                        }
                    }

                    // Execute tool
                    emitToolStatus(toolCall.name, `Running ${toolCall.name}...`, false);
                    try {
                        const toolResult = await toolDef.handler(toolCall.arguments);
                        messages.push({
                            role: 'tool',
                            content: toolResult.text,
                            toolCallId: toolCall.id,
                        });
                        emitToolStatus(toolCall.name, toolResult.isError ? `Error: ${toolResult.text.slice(0, 200)}` : `Done`, false);
                    } catch (err) {
                        const errorText = `Tool execution error: ${err instanceof Error ? err.message : String(err)}`;
                        messages.push({ role: 'tool', content: errorText, toolCallId: toolCall.id });
                        emitToolStatus(toolCall.name, errorText, true);
                    }
                }

                // If a self-reply was intercepted, we're done — break out of the outer loop
                if (intercepted) break;

                // Continue loop to let the model process tool results
                continue;
            }

            // No tool calls — model is done
            messages.push({ role: 'assistant', content: result.content || '' });
            break;
        }

        if (aborted) return;

        // Emit result event
        onEvent({
            type: 'result',
            subtype: 'success',
            total_cost_usd: 0, // Local models are free
            duration_ms: 0,
            num_turns: iteration,
            session_id: session.id,
        } as ClaudeStreamEvent);

        processing = false;

        // Check for queued messages
        if (pendingMessages.length > 0 && !aborted) {
            const next = pendingMessages.shift()!;
            runLoop(next).catch((err) => {
                if (aborted) return;
                const errorMsg = err instanceof Error ? err.message : String(err);
                log.error(`Direct process error for session ${session.id}`, { error: errorMsg });
                onEvent({
                    type: 'error',
                    error: { message: errorMsg, type: 'direct_process_error' },
                } as ClaudeStreamEvent);
                onExit(1);
            });
        } else {
            onExit(0);
        }
    }

    function emitToolStatus(toolName: string, message: string, _isError: boolean): void {
        onEvent({
            type: 'tool_status',
            statusMessage: `[${toolName}] ${message}`,
        });
    }

    function sendMessage(content: string): boolean {
        if (aborted) return false;
        if (processing) {
            pendingMessages.push(content);
        } else {
            runLoop(content).catch((err) => {
                if (aborted) return;
                const errorMsg = err instanceof Error ? err.message : String(err);
                log.error(`Direct process error for session ${session.id}`, { error: errorMsg });
                onEvent({
                    type: 'error',
                    error: { message: errorMsg, type: 'direct_process_error' },
                } as ClaudeStreamEvent);
                onExit(1);
            });
        }
        return true;
    }

    function kill(): void {
        aborted = true;
        approvalManager.cancelSession(session.id);
    }

    return { pid: pseudoPid, sendMessage, kill };
}

/**
 * For AlgoChat/agent-sourced messages, prepend a routing hint so the model
 * knows to reply with text directly rather than wrapping responses in
 * corvid_send_message tool calls.
 */
function prependRoutingContext(message: string, source: string): string {
    if (source === 'algochat' || source === 'agent') {
        return `[This message was sent to you via AlgoChat. Reply directly with text. Do NOT use corvid_send_message to respond — your text reply will be automatically routed back to the sender.]\n\n${message}`;
    }
    return message;
}

function buildSystemPrompt(
    agent: Agent | null,
    project: Project,
    model: string,
    toolNames: string[],
    hasTools: boolean,
): string {
    const parts: string[] = [];

    if (agent?.systemPrompt) {
        parts.push(agent.systemPrompt);
    } else {
        parts.push(
            'You are a helpful AI assistant. You have access to tools that let you interact with other agents, save/recall memories, and manage tasks.',
            `You are working in the project directory: ${project.workingDir}`,
        );
    }

    if (agent?.appendPrompt) {
        parts.push('', agent.appendPrompt);
    }

    // Append tool-specific instructions when tools are available
    if (hasTools && toolNames.length > 0) {
        const family = detectModelFamily(model);
        parts.push('', getToolInstructionPrompt(family, toolNames));

        // Add response routing instructions if messaging tools are present
        if (toolNames.includes('corvid_send_message')) {
            parts.push('', getResponseRoutingPrompt());
        }
    }

    return parts.join('\n');
}

async function checkToolPermission(
    toolCall: LlmToolCall,
    session: Session,
    agent: Agent | null,
    approvalManager: ApprovalManager,
    onApprovalRequest: (request: ApprovalRequestWire) => void,
): Promise<boolean> {
    const permissionMode = agent?.permissionMode ?? 'default';
    const BYPASS_MODES = new Set(['full-auto', 'auto-edit']);

    // corvid_* tools are MCP tools — auto-approve in bypass modes
    if (BYPASS_MODES.has(permissionMode)) {
        return true;
    }

    // For non-bypass modes, request approval
    const requestId = crypto.randomUUID().slice(0, 8);
    const timeoutMs = approvalManager.getDefaultTimeout(session.source);

    const request: ApprovalRequest = {
        id: requestId,
        sessionId: session.id,
        toolName: toolCall.name,
        toolInput: toolCall.arguments,
        description: formatToolDescription(toolCall.name, toolCall.arguments),
        createdAt: Date.now(),
        timeoutMs,
        source: session.source,
    };

    onApprovalRequest({
        id: request.id,
        sessionId: request.sessionId,
        toolName: request.toolName,
        description: request.description,
        createdAt: request.createdAt,
        timeoutMs: request.timeoutMs,
    });

    const response = await approvalManager.createRequest(request);
    return response.behavior === 'allow';
}

function isToolUnsupportedError(errorMsg: string): boolean {
    const lower = errorMsg.toLowerCase();
    return (
        lower.includes('does not support tools') ||
        lower.includes('tool') && lower.includes('not supported') ||
        lower.includes('unknown parameter') && lower.includes('tool')
    );
}
