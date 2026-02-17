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
import { type CodingToolContext, buildSafeEnvForCoding } from '../mcp/coding-tools';
import { getToolInstructionPrompt, getResponseRoutingPrompt, getCodingToolPrompt, detectModelFamily } from '../providers/ollama/tool-prompt-templates';
import { createLogger } from '../lib/logger';

const log = createLogger('DirectProcess');

const MAX_TOOL_ITERATIONS = 25;
const MAX_MESSAGES = 40;
const KEEP_RECENT = 30;

/**
 * Trim conversation history to bound memory usage.
 * Keeps the first user message (original prompt context) and the most recent
 * KEEP_RECENT messages so the model retains enough context to continue.
 */
function trimMessages(
    messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }>,
): void {
    if (messages.length <= MAX_MESSAGES) return;

    const first = messages[0];
    const recent = messages.slice(-KEEP_RECENT);

    // Avoid duplicating the first message if it's already in the recent window
    if (recent[0] === first) {
        messages.length = 0;
        messages.push(...recent);
    } else {
        messages.length = 0;
        messages.push(first, ...recent);
    }

    log.info(`Trimmed conversation history to ${messages.length} messages`);
}

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
    /** Called to reset the session timeout when the agent is still active. */
    extendTimeout?: (additionalMs: number) => void;
    /** Persona system prompt section (from agent_personas table) */
    personaPrompt?: string;
    /** Skill bundle prompt additions (from assigned skill_bundles) */
    skillPrompt?: string;
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
        extendTimeout,
        personaPrompt,
        skillPrompt,
    } = options;

    const pseudoPid = nextPseudoPid++;
    let aborted = false;
    let toolsDisabled = false;
    const abortController = new AbortController();

    // Message queue for follow-up user messages
    const pendingMessages: string[] = [];
    let processing = false;

    // Council deliberation sessions (member, discusser, reviewer) should reason,
    // not call tools. Only chairman/chat sessions get tools.
    const isDeliberationSession = session.councilRole === 'member'
        || session.councilRole === 'discusser'
        || session.councilRole === 'reviewer';

    // Build coding context (always available — file/command tools don't need MCP)
    const codingCtx: CodingToolContext = {
        workingDir: project.workingDir,
        env: buildSafeEnvForCoding(),
    };

    // Build tools — skip for council deliberation sessions
    const directTools = isDeliberationSession ? [] : buildDirectTools(mcpToolContext, codingCtx);
    const toolMap = new Map<string, DirectToolDefinition>();
    for (const t of directTools) {
        toolMap.set(t.name, t);
    }

    const model = agent?.model || provider.getInfo().defaultModel;

    // Build system prompt (with tool instructions if tools are available)
    const toolDefs = directTools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
    const systemPrompt = buildSystemPrompt(agent, project, model, toolDefs, !toolsDisabled && directTools.length > 0, isDeliberationSession, personaPrompt, skillPrompt);

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

        // Signal that the agent is working
        onEvent({ type: 'thinking', thinking: true } as ClaudeStreamEvent);

        // Extend session timeout on activity (debounced to once per minute)
        let lastExtend = 0;
        const EXTEND_DEBOUNCE_MS = 60_000;
        const TIMEOUT_EXTENSION_MS = 30 * 60 * 1000; // 30 minutes

        const extendTimeoutIfNeeded = () => {
            if (extendTimeout) {
                const now = Date.now();
                if (now - lastExtend > EXTEND_DEBOUNCE_MS) {
                    extendTimeout(TIMEOUT_EXTENSION_MS);
                    lastExtend = now;
                }
            }
        };

        // Acquire inference slot BEFORE the agentic loop so this agent runs all
        // its turns to completion without yielding. This keeps the model loaded
        // in Ollama's memory (preserves KV cache) and avoids context-switching.
        const onSlotStatus = (status: string) => {
            if (status) {
                onEvent({
                    type: 'queue_status',
                    statusMessage: status,
                } as ClaudeStreamEvent);
            } else {
                onEvent({ type: 'thinking', thinking: true } as ClaudeStreamEvent);
            }
        };

        // Heartbeat while waiting for slot (so UI doesn't look frozen)
        const slotHeartbeat = setInterval(() => {
            extendTimeoutIfNeeded();
            onEvent({ type: 'thinking', thinking: true } as ClaudeStreamEvent);
        }, 10_000);

        if (provider.acquireSlot) {
            await provider.acquireSlot(model, abortController.signal, onSlotStatus);
        }
        clearInterval(slotHeartbeat);

        if (aborted) {
            provider.releaseSlot?.(model);
            return;
        }

        let iteration = 0;
        let lastToolCallKey = '';
        let repeatCount = 0;
        const MAX_REPEATS = 2; // Break if same tool+args called 3 times in a row

        try {

        while (!aborted && iteration < MAX_TOOL_ITERATIONS) {
            iteration++;

            const providerTools = (!toolsDisabled && directTools.length > 0)
                ? toProviderTools(directTools)
                : undefined;

            const activityCallback = () => {
                onEvent({ type: 'thinking', thinking: true } as ClaudeStreamEvent);
                extendTimeoutIfNeeded();
            };

            // Heartbeat while waiting for inference
            const heartbeat = setInterval(activityCallback, 10_000);

            let result;
            try {
                trimMessages(messages);
                result = await provider.complete({
                    model,
                    systemPrompt,
                    messages,
                    tools: providerTools,
                    signal: abortController.signal,
                    onActivity: activityCallback,
                });
            } catch (err) {
                clearInterval(heartbeat);
                // Tool fallback: if the model doesn't support tools, retry without them
                const errorMsg = err instanceof Error ? err.message : String(err);
                if (!toolsDisabled && providerTools && isToolUnsupportedError(errorMsg)) {
                    log.warn(`Model ${model} does not support tools — disabling for this session`);
                    toolsDisabled = true;
                    // Retry without tools
                    trimMessages(messages);
                    result = await provider.complete({
                        model,
                        systemPrompt,
                        messages,
                        signal: abortController.signal,
                        onActivity: activityCallback,
                    });
                } else {
                    throw err;
                }
            } finally {
                clearInterval(heartbeat);
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

            // Emit performance metrics (tok/s) if available
            if (result.performance && result.performance.tokensPerSecond > 0) {
                onEvent({
                    type: 'performance',
                    model: result.model,
                    tokensPerSecond: result.performance.tokensPerSecond,
                    outputTokens: result.usage?.outputTokens ?? 0,
                    evalDurationMs: result.performance.evalDurationMs,
                } as ClaudeStreamEvent);
            }

            // Handle tool calls
            if (result.toolCalls && result.toolCalls.length > 0) {
                // Detect repeated identical tool calls (small models get stuck in loops)
                const callKey = result.toolCalls.map(tc => `${tc.name}:${JSON.stringify(tc.arguments)}`).join('|');
                if (callKey === lastToolCallKey) {
                    repeatCount++;
                    if (repeatCount >= MAX_REPEATS) {
                        log.warn(`Breaking tool loop: same call repeated ${repeatCount + 1} times`, { calls: callKey.slice(0, 200) });
                        messages.push({ role: 'assistant', content: result.content || '' });
                        break;
                    }
                } else {
                    lastToolCallKey = callKey;
                    repeatCount = 0;
                }

                // Add assistant message with tool call indication
                messages.push({ role: 'assistant', content: result.content || '' });

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

                // Continue loop to let the model process tool results
                continue;
            }

            // No tool calls — model is done
            messages.push({ role: 'assistant', content: result.content || '' });
            break;
        }

        } finally {
            // Release the slot so the next agent can run
            provider.releaseSlot?.(model);
        }

        if (aborted) return;

        // Signal that the agent is done thinking
        onEvent({ type: 'thinking', thinking: false } as ClaudeStreamEvent);

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
        abortController.abort();
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

interface ToolDef {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

function buildSystemPrompt(
    agent: Agent | null,
    project: Project,
    model: string,
    toolDefs: ToolDef[],
    hasTools: boolean,
    isDeliberation = false,
    personaPrompt?: string,
    skillPrompt?: string,
): string {
    const parts: string[] = [];

    // Council deliberation sessions: override with reasoning-only instructions
    if (isDeliberation) {
        parts.push(
            'You are a council member participating in a structured deliberation.',
            'Answer the question directly using your expertise and reasoning.',
            'Do NOT attempt to call tools, read files, or review code — you have no tools available.',
            'Provide your analysis, recommendations, and trade-offs based on your knowledge.',
            'Be specific and opinionated. Take a clear position rather than listing generic pros and cons.',
        );
        if (agent?.systemPrompt) {
            parts.push('', `Your role: ${agent.systemPrompt}`);
        }
        if (agent?.appendPrompt) {
            parts.push('', agent.appendPrompt);
        }
        if (personaPrompt) parts.push('', personaPrompt);
        return parts.join('\n');
    }

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

    // Inject persona and skill prompts
    if (personaPrompt) parts.push('', personaPrompt);
    if (skillPrompt) parts.push('', `## Skill Instructions\n${skillPrompt}`);

    // Append tool-specific instructions when tools are available
    const toolNames = toolDefs.map((t) => t.name);
    if (hasTools && toolDefs.length > 0) {
        const family = detectModelFamily(model);
        parts.push('', getToolInstructionPrompt(family, toolNames, toolDefs));

        // Add response routing instructions if messaging tools are present
        if (toolNames.includes('corvid_send_message')) {
            parts.push('', getResponseRoutingPrompt());
        }

        // Add coding tool guidelines if coding tools are present
        if (toolNames.includes('read_file')) {
            parts.push('', getCodingToolPrompt());
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
