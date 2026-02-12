/**
 * SubscriptionManager — Manages session event subscriptions and response
 * lifecycle for both on-chain and local (browser dashboard) conversations.
 *
 * This is the highest-complexity extraction from bridge.ts. It owns:
 * - On-chain response subscriptions with progress tracking
 * - Local (WebSocket) response subscriptions with streaming
 * - Subscription timeout management with activity-based resets
 * - Acknowledgment delay logic (skip ack if response arrives quickly)
 * - Periodic progress updates sent on-chain
 *
 * The module uses a callback-based event pattern (matching ProcessManager's
 * subscribe/unsubscribe API) rather than observables to stay consistent with
 * existing codebase conventions.
 */
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import type { ResponseFormatter } from './response-formatter';
import { createLogger } from '../lib/logger';

const log = createLogger('SubscriptionManager');

/** Timeout before a subscription is considered stale and cleaned up. */
const SUBSCRIPTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (activity resets timer)

/**
 * Callback for sending local chat messages back to the browser.
 */
export type LocalChatSendFn = (
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound',
) => void;

/**
 * Structured events for local chat streaming (tool use, thinking, etc.).
 */
export type LocalChatEvent =
    | { type: 'message'; content: string; direction: 'inbound' | 'outbound' }
    | { type: 'stream'; chunk: string; done: boolean }
    | { type: 'tool_use'; toolName: string; input: string }
    | { type: 'thinking'; active: boolean }
    | { type: 'session_info'; sessionId: string };

/**
 * Callback for structured local chat events.
 */
export type LocalChatEventFn = (event: LocalChatEvent) => void;

/** Internal progress action for tracking what the agent is doing. */
interface ProgressAction {
    type: 'tool_use' | 'agent_query' | 'text_block' | 'milestone';
    action: string;
    timestamp: number;
    details?: string;
}

/**
 * Manages subscriptions to ProcessManager session events for both
 * on-chain (AlgoChat) and local (browser dashboard) response delivery.
 *
 * Each subscription tracks the session lifecycle from first assistant
 * event through session exit, buffering text and sending the final
 * response via the appropriate channel.
 */
export class SubscriptionManager {
    private processManager: ProcessManager;
    private responseFormatter: ResponseFormatter;

    /** Active on-chain subscriptions (sessionId set). */
    private chainSubscriptions: Set<string> = new Set();
    /** Local subscription callbacks keyed by sessionId. */
    private localSubscriptions: Map<string, (sid: string, event: ClaudeStreamEvent) => void> = new Map();
    /** Local send functions keyed by sessionId (updatable for WS reconnects). */
    private localSendFns: Map<string, LocalChatSendFn> = new Map();
    /** Local event functions keyed by sessionId. */
    private localEventFns: Map<string, LocalChatEventFn> = new Map();
    /** Subscription timeout timers keyed by sessionId. */
    private subscriptionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    /** Stored timeout callbacks keyed by sessionId (for external reset). */
    private subscriptionTimeoutCallbacks: Map<string, () => void> = new Map();

    constructor(
        processManager: ProcessManager,
        responseFormatter: ResponseFormatter,
    ) {
        this.processManager = processManager;
        this.responseFormatter = responseFormatter;
    }

    /**
     * Check whether a local subscription already exists for a session.
     */
    hasLocalSubscription(sessionId: string): boolean {
        return this.localSubscriptions.has(sessionId);
    }

    /**
     * Check whether an on-chain subscription exists for a session.
     */
    hasChainSubscription(sessionId: string): boolean {
        return this.chainSubscriptions.has(sessionId);
    }

    /**
     * Update the send function for a local session (e.g. on WS reconnect).
     */
    updateLocalSendFn(sessionId: string, sendFn: LocalChatSendFn): void {
        this.localSendFns.set(sessionId, sendFn);
    }

    /**
     * Update the event function for a local session.
     */
    updateLocalEventFn(sessionId: string, eventFn: LocalChatEventFn): void {
        this.localEventFns.set(sessionId, eventFn);
    }

    /**
     * Clean up all local subscription state for a session.
     */
    cleanupLocalSession(sessionId: string): void {
        this.localSubscriptions.delete(sessionId);
        this.localSendFns.delete(sessionId);
        this.localEventFns.delete(sessionId);
    }

    /**
     * Subscribe for an on-chain response to a session.
     *
     * Tracks the full session lifecycle:
     * - Buffers streamed text blocks, keeping only the last one
     * - Sends periodic progress updates on-chain for long-running sessions
     * - Delays the initial acknowledgment (skips if response arrives quickly)
     * - Sends the final response on-chain when the session exits
     * - Cleans up timers and subscriptions on completion or timeout
     *
     * @param sessionId - The session to subscribe to
     * @param participant - The on-chain participant address to send responses to
     */
    subscribeForResponse(sessionId: string, participant: string): void {
        // Avoid duplicate subscriptions when multiple messages arrive for the same session
        if (this.chainSubscriptions.has(sessionId)) return;
        this.chainSubscriptions.add(sessionId);

        // We only send the LAST text block from the last turn. Earlier text
        // blocks are intermediate explanations (tool call reasoning, etc.)
        // and would clutter the on-chain response.
        let lastTextBlock = '';
        let lastAssistantText = '';
        let lastTurnResponse = '';
        let sent = false;
        let timeoutExtensions = 0;
        const MAX_TIMEOUT_EXTENSIONS = 3; // Up to 30 more minutes (3 x 10 min)
        const startedAt = Date.now();

        const sendOnce = () => {
            if (sent) return;
            sent = true;

            // Track completion milestone
            const totalElapsed = Date.now() - startedAt;
            trackProgress({
                type: 'milestone',
                action: 'response_completed',
                timestamp: Date.now(),
                details: `Total time: ${Math.round(totalElapsed / 1000)}s, tools: ${toolsUsed.size}, agents: ${agentsQueried.size}`
            });

            stopProgressTimer();
            this.processManager.unsubscribe(sessionId, callback);
            this.chainSubscriptions.delete(sessionId);
            this.clearSubscriptionTimer(sessionId);

            // Prefer streamed text block > last turn response > full assistant text
            const finalText = (lastTextBlock.trim() || lastTurnResponse.trim() || lastAssistantText.trim());
            if (finalText) {
                this.responseFormatter.sendResponse(participant, finalText);
            }
        };

        const resetTimer = () => {
            this.setSubscriptionTimer(sessionId, () => {
                // Check if the process is still running before giving up
                if (this.processManager.isRunning(sessionId)) {
                    timeoutExtensions++;
                    if (timeoutExtensions < MAX_TIMEOUT_EXTENSIONS) {
                        log.info(`Subscription timeout extended — session still running`, { sessionId, extension: timeoutExtensions });
                        const msg = generateProgressSummary();
                        this.responseFormatter.sendResponse(participant, `[Status] ${msg}`).catch(() => {});
                        this.responseFormatter.emitEvent(participant, msg, 'status');
                        resetTimer(); // Reset for another cycle
                        return;
                    }
                    log.warn(`Subscription timeout — max extensions reached, sending partial response`, { sessionId });
                } else {
                    log.warn(`Subscription timeout — session no longer running`, { sessionId });
                }
                sendOnce();
            });
        };

        let statusEmitted = false;
        let ackSent = false;
        let agentQueryCount = 0;
        let currentTextBlock = '';
        let inTextBlock = false;

        // Enhanced progress tracking
        const MAX_PROGRESS_HISTORY = 100;
        const progressHistory: ProgressAction[] = [];
        const trackProgress = (action: ProgressAction) => {
            progressHistory.push(action);
            // Sliding window to prevent unbounded memory growth in long sessions
            if (progressHistory.length > MAX_PROGRESS_HISTORY) {
                progressHistory.splice(0, progressHistory.length - MAX_PROGRESS_HISTORY);
            }
        };
        let lastProgressUpdate = startedAt;
        let toolsUsed: Set<string> = new Set();
        let agentsQueried: Set<string> = new Set();
        let progressTimer: ReturnType<typeof setInterval> | null = null;
        let ackDelayTimer: ReturnType<typeof setTimeout> | null = null;

        // How long to wait before sending the on-chain ack. If the response
        // arrives within this window we skip the ack entirely.
        const ACK_DELAY_MS = 10_000; // 10 seconds
        const PROGRESS_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

        const cancelAckDelay = () => {
            if (ackDelayTimer) {
                clearTimeout(ackDelayTimer);
                ackDelayTimer = null;
            }
        };

        // Generate progress summary from recent actions
        const generateProgressSummary = (): string => {
            const now = Date.now();
            const elapsed = Math.round((now - startedAt) / 1000);
            const recentActions = progressHistory.filter(a => a.timestamp > lastProgressUpdate);

            let summary = `Still working (${elapsed}s elapsed)`;

            // Add what we've been doing
            const recentSummary: string[] = [];

            if (recentActions.length > 0) {
                const toolActions = recentActions.filter(a => a.type === 'tool_use');
                const agentActions = recentActions.filter(a => a.type === 'agent_query');
                const textActions = recentActions.filter(a => a.type === 'text_block');

                if (toolActions.length > 0) {
                    const uniqueTools = [...new Set(toolActions.map(a => a.action))];
                    recentSummary.push(`used ${uniqueTools.join(', ')}`);
                }

                if (agentActions.length > 0) {
                    const uniqueAgents = [...new Set(agentActions.map(a => a.action))];
                    recentSummary.push(`queried ${uniqueAgents.join(', ')}`);
                }

                if (textActions.length > 0) {
                    const lastText = textActions[textActions.length - 1];
                    if (lastText.details && lastText.details.length > 0) {
                        const preview = lastText.details.length > 60
                            ? lastText.details.slice(0, 60) + '...'
                            : lastText.details;
                        recentSummary.push(`working on: ${preview}`);
                    }
                }
            }

            // Overall progress
            if (toolsUsed.size > 0 || agentsQueried.size > 0) {
                const progress: string[] = [];
                if (toolsUsed.size > 0) {
                    progress.push(`${toolsUsed.size} tool${toolsUsed.size > 1 ? 's' : ''}`);
                }
                if (agentsQueried.size > 0) {
                    progress.push(`${agentsQueried.size} agent${agentsQueried.size > 1 ? 's' : ''}`);
                }
                summary += ` — used ${progress.join(' and ')}`;
            }

            if (recentSummary.length > 0) {
                summary += ` — recently ${recentSummary.join(', ')}`;
            }

            lastProgressUpdate = now;
            return summary;
        };

        // Send periodic on-chain progress updates so the user's AlgoChat
        // client knows the agent is still working
        const startProgressTimer = () => {
            if (progressTimer) return;
            progressTimer = setInterval(() => {
                if (sent) { stopProgressTimer(); return; }
                const msg = generateProgressSummary();
                this.responseFormatter.sendResponse(participant, `[Status] ${msg}`).catch((err) => {
                    log.warn('Failed to send progress update', {
                        participant,
                        sessionId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
                this.responseFormatter.emitEvent(participant, msg, 'status');
            }, PROGRESS_INTERVAL_MS);
        };

        const stopProgressTimer = () => {
            if (progressTimer) {
                clearInterval(progressTimer);
                progressTimer = null;
            }
        };

        // Actually send the on-chain ack and start progress timer
        const sendAckNow = () => {
            if (ackSent || sent) return;
            ackSent = true;

            // Track acknowledgment milestone
            trackProgress({
                type: 'milestone',
                action: 'request_acknowledged',
                timestamp: Date.now(),
                details: 'Processing request'
            });

            this.responseFormatter.sendResponse(participant, '[Status] Received your message — working on it now.').catch((err) => {
                log.warn('Failed to send acknowledgment', {
                    participant,
                    sessionId,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
            startProgressTimer();
        };

        const flushTextBlock = () => {
            const text = currentTextBlock.trim();
            if (text.length > 0) {
                // Keep track of the latest text block — this overwrites
                // previous ones so we only send the final one on-chain.
                lastTextBlock = text;

                // Track meaningful text for progress summaries
                if (text.length > 50) { // Only track substantial text blocks
                    trackProgress({
                        type: 'text_block',
                        action: 'reasoning',
                        timestamp: Date.now(),
                        details: text
                    });
                }

                // Show the agent's intermediate text as a status update
                // Truncate long blocks to a reasonable preview
                const preview = text.length > 300
                    ? text.slice(0, 300) + '...'
                    : text;
                this.responseFormatter.emitEvent(participant, preview, 'status');
            }
            currentTextBlock = '';
            inTextBlock = false;
        };

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            // On first assistant event, show a local status and schedule
            // the on-chain ack after a delay (skip if we finish quickly)
            if (event.type === 'assistant' && !statusEmitted) {
                statusEmitted = true;

                // Track processing milestone
                trackProgress({
                    type: 'milestone',
                    action: 'processing_started',
                    timestamp: Date.now(),
                    details: 'Agent began processing'
                });

                this.responseFormatter.emitEvent(participant, 'Agent is processing your message...', 'status');

                if (!ackSent && !ackDelayTimer) {
                    ackDelayTimer = setTimeout(sendAckNow, ACK_DELAY_MS);
                }
            }

            // Forward named status events from tool handlers (e.g. "Querying CorvidLabs...")
            if (event.type === 'tool_status') {
                const message = event.statusMessage;
                if (message) {
                    this.responseFormatter.emitEvent(participant, message, 'status');

                    // Track status action for progress summaries
                    trackProgress({
                        type: 'milestone',
                        action: 'status_update',
                        timestamp: Date.now(),
                        details: message
                    });

                    // Agent is calling other agents — this will take a while,
                    // send the ack immediately
                    if (!ackSent) {
                        cancelAckDelay();
                        sendAckNow();
                    }
                    resetTimer();
                }
                return;
            }

            // Track text content blocks — stream agent's intermediate text to the feed
            if (event.type === 'content_block_start') {
                const block = event.content_block;
                if (block?.type === 'text') {
                    inTextBlock = true;
                    currentTextBlock = '';
                } else if (block?.type === 'tool_use') {
                    // Flush any pending text before tool use starts
                    if (inTextBlock) flushTextBlock();
                    const toolName = block.name;

                    if (toolName) {
                        // Track tool usage for progress summaries
                        toolsUsed.add(toolName);
                        trackProgress({
                            type: 'tool_use',
                            action: toolName,
                            timestamp: Date.now()
                        });

                        if (toolName === 'corvid_send_message') {
                            agentQueryCount++;
                            // Try to extract agent name from tool input
                            const toolInput = block.input as { to_agent?: string } | undefined;
                            if (toolInput?.to_agent) {
                                agentsQueried.add(toolInput.to_agent);
                                trackProgress({
                                    type: 'agent_query',
                                    action: toolInput.to_agent,
                                    timestamp: Date.now()
                                });
                            }
                            // Agent-to-agent call means longer processing — send ack now
                            if (!ackSent) {
                                cancelAckDelay();
                                sendAckNow();
                            }
                        }
                    }
                }
            }

            // Accumulate streaming text deltas
            if (event.type === 'content_block_delta' && event.delta?.text && inTextBlock) {
                currentTextBlock += event.delta.text;
                resetTimer();
            }

            // Text block finished — flush it as a status update
            if (event.type === 'content_block_stop' && inTextBlock) {
                flushTextBlock();
            }

            // Capture assistant message content as fallback in case content_block
            // streaming events don't fire (e.g. non-streaming SDK responses)
            if (event.type === 'assistant' && event.message?.content) {
                const text = extractContentText(event.message.content);
                if (text.trim()) {
                    lastAssistantText = text;
                }
                resetTimer();
            } else if (event.type === 'assistant') {
                resetTimer();
            }

            // Each 'result' marks end of a turn — save last text block and reset
            if (event.type === 'result') {
                if (inTextBlock) flushTextBlock();

                // Track turn completion milestone
                trackProgress({
                    type: 'milestone',
                    action: 'turn_completed',
                    timestamp: Date.now(),
                    details: `Completed turn with ${agentQueryCount} agent queries`
                });

                // Only show synthesizing status if we've been working long enough
                const elapsed = Date.now() - startedAt;
                if (agentQueryCount > 0 && elapsed > ACK_DELAY_MS) {
                    const synthesizingMsg = `Synthesizing response from ${agentQueryCount} agent${agentQueryCount > 1 ? 's' : ''}...`;

                    // Track synthesis milestone
                    trackProgress({
                        type: 'milestone',
                        action: 'synthesis_started',
                        timestamp: Date.now(),
                        details: synthesizingMsg
                    });

                    this.responseFormatter.emitEvent(participant, synthesizingMsg, 'status');
                }
                // Prefer the last streamed text block; fall back to full assistant text
                if (lastTextBlock.trim()) {
                    lastTurnResponse = lastTextBlock;
                } else if (lastAssistantText.trim()) {
                    lastTurnResponse = lastAssistantText;
                }
                lastTextBlock = '';
                lastAssistantText = '';
                resetTimer(); // Turn completed — reset timeout
            }

            // Send only the last turn's response when the session fully exits
            if (event.type === 'session_exited') {
                if (inTextBlock) flushTextBlock();
                cancelAckDelay();
                stopProgressTimer();
                sendOnce();
            }
        };

        this.processManager.subscribe(sessionId, callback);
        resetTimer();
    }

    /**
     * Subscribe for local (browser dashboard) responses to a session.
     *
     * Streams events (text deltas, tool use, thinking state) to the
     * browser via the provided sendFn and eventFn callbacks. Buffers
     * assistant text and sends it on turn completion.
     *
     * @param sessionId - The session to subscribe to
     * @param sendFn - Callback for sending chat messages to the browser
     */
    subscribeForLocalResponse(sessionId: string, sendFn: LocalChatSendFn): void {
        // Store the sendFn so it can be updated if the WS connection changes
        this.localSendFns.set(sessionId, sendFn);

        // Check if already subscribed (avoid duplicate subscriptions on subsequent messages)
        if (this.localSubscriptions.has(sessionId)) return;

        let responseBuffer = '';
        let isThinking = false;

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            // Always use the latest sendFn and eventFn
            const currentSendFn = this.localSendFns.get(sessionId);
            if (!currentSendFn) return;
            const currentEventFn = this.localEventFns.get(sessionId);

            log.debug(`Local response event`, { sessionId, type: event.type, subtype: event.subtype });

            // Emit thinking events
            if (event.type === 'assistant' && !isThinking) {
                isThinking = true;
                currentEventFn?.({ type: 'thinking', active: true });
            }

            // Emit streaming chunks for content_block_delta
            if (event.type === 'content_block_delta' && event.delta?.text) {
                currentEventFn?.({ type: 'stream', chunk: event.delta.text, done: false });
            }

            // Emit tool_use events (SDK mode)
            if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                const toolName = event.content_block.name ?? 'unknown';
                const input = JSON.stringify(event.content_block.input ?? {});
                currentEventFn?.({ type: 'tool_use', toolName, input });
            }

            // Direct-mode: tool_status events
            if (event.type === 'tool_status' && (event as any).statusMessage) {
                const match = (event as any).statusMessage.match(/^\[(\w+)\]\s(.*)$/);
                if (match) {
                    currentEventFn?.({ type: 'tool_use', toolName: match[1], input: match[2] });
                }
            }

            // Direct-mode: thinking signal
            if (event.type === 'thinking') {
                currentEventFn?.({ type: 'thinking', active: !!(event as any).thinking });
            }

            if (event.type === 'assistant' && event.message?.content) {
                const text = extractContentText(event.message.content);
                log.debug(`Assistant content chunk`, { text: text.slice(0, 80) });
                responseBuffer += text;
            }

            // Turn completed — send accumulated response and reset buffer for next turn
            if (event.type === 'result') {
                log.debug(`Turn completed`, { bufferLength: responseBuffer.length });
                isThinking = false;
                currentEventFn?.({ type: 'thinking', active: false });
                currentEventFn?.({ type: 'stream', chunk: '', done: true });

                if (responseBuffer.trim()) {
                    log.debug(`Sending outbound response`, { text: responseBuffer.trim().slice(0, 80) });
                    currentSendFn('local', responseBuffer.trim(), 'outbound');
                    currentEventFn?.({ type: 'message', content: responseBuffer.trim(), direction: 'outbound' });
                }
                responseBuffer = '';
            }

            // Session exited — clean up subscription
            if (event.type === 'session_exited') {
                log.debug('Session exited, cleaning up subscription');
                this.processManager.unsubscribe(sessionId, callback);
                this.localSubscriptions.delete(sessionId);
                this.localSendFns.delete(sessionId);
                this.localEventFns.delete(sessionId);
                this.clearSubscriptionTimer(sessionId);

                isThinking = false;
                currentEventFn?.({ type: 'thinking', active: false });

                // Send any remaining buffered text
                if (responseBuffer.trim()) {
                    currentSendFn('local', responseBuffer.trim(), 'outbound');
                    currentEventFn?.({ type: 'message', content: responseBuffer.trim(), direction: 'outbound' });
                }
            }
        };

        this.localSubscriptions.set(sessionId, callback);
        this.processManager.subscribe(sessionId, callback);
        this.setSubscriptionTimer(sessionId, () => {
            log.warn(`Local subscription timeout for session ${sessionId}`);
            this.processManager.unsubscribe(sessionId, callback);
            this.localSubscriptions.delete(sessionId);
            const currentSendFn = this.localSendFns.get(sessionId);
            this.localSendFns.delete(sessionId);
            this.localEventFns.delete(sessionId);
            if (responseBuffer.trim() && currentSendFn) {
                currentSendFn('local', responseBuffer.trim(), 'outbound');
            }
        });
    }

    /**
     * Set (or reset) the subscription timeout for a session.
     * Each activity event resets the timer.
     */
    setSubscriptionTimer(sessionId: string, onTimeout: () => void): void {
        // Clear any existing timer for this session
        this.clearSubscriptionTimer(sessionId);
        // Store the callback so it can be re-used by resetSubscriptionTimer
        this.subscriptionTimeoutCallbacks.set(sessionId, onTimeout);
        const timer = setTimeout(onTimeout, SUBSCRIPTION_TIMEOUT_MS);
        this.subscriptionTimers.set(sessionId, timer);
    }

    /**
     * Reset the subscription timeout timer for an active chain subscription.
     * No-op if no subscription exists for the session.
     */
    resetSubscriptionTimer(sessionId: string): void {
        const callback = this.subscriptionTimeoutCallbacks.get(sessionId);
        if (!callback) return;
        // Clear just the timer, not the stored callback
        const timer = this.subscriptionTimers.get(sessionId);
        if (timer) clearTimeout(timer);
        const newTimer = setTimeout(callback, SUBSCRIPTION_TIMEOUT_MS);
        this.subscriptionTimers.set(sessionId, newTimer);
    }

    /**
     * Clear the subscription timeout timer for a session.
     */
    clearSubscriptionTimer(sessionId: string): void {
        const timer = this.subscriptionTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.subscriptionTimers.delete(sessionId);
        }
        this.subscriptionTimeoutCallbacks.delete(sessionId);
    }

    /**
     * Clean up all subscriptions, timers, and callbacks.
     * Called during bridge shutdown. Clears every internal Map/Set to prevent
     * orphaned callbacks from accumulating across bridge restarts.
     */
    cleanup(): void {
        for (const timer of this.subscriptionTimers.values()) {
            clearTimeout(timer);
        }
        this.subscriptionTimers.clear();
        this.subscriptionTimeoutCallbacks.clear();
        this.chainSubscriptions.clear();
        this.localSubscriptions.clear();
        this.localSendFns.clear();
        this.localEventFns.clear();
    }
}
