import type { Database } from 'bun:sqlite';
import type { AgentMessage } from '../../shared/types';
import { createAgentMessage, getAgentMessage, getThreadMessages, updateAgentMessageStatus } from '../db/agent-messages';
import { getAgent } from '../db/agents';
import { recordAudit } from '../db/audit';
import { createSession, updateSessionAlgoSpent } from '../db/sessions';
import { ExternalServiceError, NotFoundError, ValidationError } from '../lib/errors';
import { createLogger } from '../lib/logger';
import { createEventContext, runWithEventContext } from '../observability/event-context';
import { agentMessagesTotal } from '../observability/metrics';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import type { AlgoChatConfig } from './config';
import { MessagingGuard, type MessagingGuardConfig } from './messaging-guard';
import type { OnChainTransactor } from './on-chain-transactor';
import type { WorkCommandRouter } from './work-command-router';

const log = createLogger('AgentMessenger');

const DEFAULT_PAYMENT_MICRO = 1000; // 0.001 ALGO

export interface AgentInvokeRequest {
  fromAgentId: string;
  toAgentId: string;
  content: string;
  paymentMicro?: number;
  projectId?: string;
  threadId?: string;
  /** Invocation depth for preventing infinite agent-to-agent chains. */
  depth?: number;
  /**
   * When true, return immediately after message dispatch without waiting
   * for a response. The message is still tracked for delivery confirmation
   * but no session is created for the receiving agent to respond.
   */
  fireAndForget?: boolean;
}

export interface AgentInvokeResult {
  message: AgentMessage;
  sessionId: string | null;
}

type MessageUpdateCallback = (message: AgentMessage) => void;
export class AgentMessenger {
  readonly db: Database;
  private transactor: OnChainTransactor | null;
  private processManager: ProcessManager;
  private workCommandRouter: WorkCommandRouter | null = null;
  private messageUpdateListeners = new Set<MessageUpdateCallback>();
  readonly guard: MessagingGuard;

  constructor(
    db: Database,
    _config: AlgoChatConfig,
    transactor: OnChainTransactor | null,
    processManager: ProcessManager,
    guardConfig?: Partial<MessagingGuardConfig>,
  ) {
    this.db = db;
    this.transactor = transactor;
    this.processManager = processManager;
    this.guard = new MessagingGuard(guardConfig);
    this.guard.setDb(db);
  }

  setWorkCommandRouter(router: WorkCommandRouter): void {
    this.workCommandRouter = router;
  }

  /** Register a callback for agent message status changes (for WS broadcast). */
  onMessageUpdate(cb: MessageUpdateCallback): () => void {
    this.messageUpdateListeners.add(cb);
    return () => {
      this.messageUpdateListeners.delete(cb);
    };
  }

  private emitMessageUpdate(messageId: string): void {
    const updated = getAgentMessage(this.db, messageId);
    if (!updated) return;
    for (const cb of this.messageUpdateListeners) {
      try {
        cb(updated);
      } catch (e) {
        log.warn('messageUpdate listener threw', { error: e });
      }
    }
  }

  /**
   * Build a conversation history block from prior messages in a thread.
   * Excludes the current message (by ID). Caps at 10 exchanges or 8000 chars.
   */
  private buildThreadHistory(threadId: string, currentMessageId: string): string | null {
    const priorMessages = getThreadMessages(this.db, threadId).filter((m) => m.id !== currentMessageId);

    if (priorMessages.length === 0) return null;

    const MAX_EXCHANGES = 10;
    const MAX_CHARS = 8000;
    const lines: string[] = [];
    let totalChars = 0;

    // Each message is an exchange: content + optional response
    const recent = priorMessages.slice(-MAX_EXCHANGES);
    for (const msg of recent) {
      const fromName = getAgent(this.db, msg.fromAgentId)?.name ?? msg.fromAgentId.slice(0, 8);
      const toName = getAgent(this.db, msg.toAgentId)?.name ?? msg.toAgentId.slice(0, 8);

      const contentLine = `[${fromName}]: ${msg.content}`;
      if (totalChars + contentLine.length > MAX_CHARS) break;
      lines.push(contentLine);
      totalChars += contentLine.length;

      if (msg.response) {
        const responseLine = `[${toName}]: ${msg.response}`;
        if (totalChars + responseLine.length > MAX_CHARS) break;
        lines.push(responseLine);
        totalChars += responseLine.length;
      }
    }

    if (lines.length === 0) return null;

    return `Previous messages in this conversation:\n\n${lines.join('\n\n')}`;
  }

  async invoke(request: AgentInvokeRequest): Promise<AgentInvokeResult> {
    const { fromAgentId, toAgentId, content, projectId } = request;
    const paymentMicro = request.paymentMicro ?? DEFAULT_PAYMENT_MICRO;
    const threadId = request.threadId ?? crypto.randomUUID();
    const fireAndForget = request.fireAndForget ?? false;

    // Generate or inherit trace context for this invocation chain
    const eventCtx = createEventContext('agent');
    const traceId = eventCtx.traceId;

    // Guards
    if (fromAgentId === toAgentId) {
      throw new ValidationError('An agent cannot invoke itself', { fromAgentId, toAgentId });
    }

    const fromAgent = getAgent(this.db, fromAgentId);
    if (!fromAgent) throw new NotFoundError('Source agent', fromAgentId);

    const toAgent = getAgent(this.db, toAgentId);
    if (!toAgent) throw new NotFoundError('Target agent', toAgentId);

    // Route [WORK] prefix through WorkCommandRouter
    if (content.startsWith('[WORK]') && this.workCommandRouter?.hasService) {
      return this.workCommandRouter.handleAgentWorkRequest({
        fromAgentId,
        fromAgentName: fromAgent.name,
        toAgentId,
        content,
        paymentMicro,
        threadId,
        projectId,
        emitMessageUpdate: (messageId) => this.emitMessageUpdate(messageId),
      });
    }

    // Circuit breaker + per-agent rate limit + blocklist + drift check
    const guardResult = this.guard.check(fromAgentId, toAgentId, content.length);
    if (!guardResult.allowed) {
      const errorCode = (guardResult.reason ?? 'RATE_LIMITED') as
        | 'CIRCUIT_OPEN'
        | 'RATE_LIMITED'
        | 'AGENT_BLOCKED'
        | 'BEHAVIORAL_DRIFT';
      const errorMessages: Record<string, string> = {
        CIRCUIT_OPEN: `Circuit breaker open for agent ${toAgent.name} — calls temporarily blocked`,
        RATE_LIMITED: `Rate limit exceeded: ${fromAgent.name} is sending too many messages (retry after ${Math.ceil((guardResult.retryAfterMs ?? 0) / 1000)}s)`,
        AGENT_BLOCKED: `Agent ${fromAgent.name} is blacklisted and cannot send messages`,
        BEHAVIORAL_DRIFT: `Behavioral anomaly detected for ${fromAgent.name} — messaging pattern flagged for review`,
      };
      const errorMsg = errorMessages[errorCode] ?? 'Message rejected by guard';

      // Create the message row in failed state so it's visible in history
      const failedMessage = createAgentMessage(this.db, {
        fromAgentId,
        toAgentId,
        content,
        paymentMicro,
        threadId,
        fireAndForget,
      });
      updateAgentMessageStatus(this.db, failedMessage.id, 'failed', {
        response: errorMsg,
        errorCode,
      });
      this.emitMessageUpdate(failedMessage.id);
      agentMessagesTotal.inc({ direction: 'outbound', status: 'rejected' });

      log.warn(`Messaging guard rejected: ${guardResult.reason}`, {
        fromAgentId,
        toAgentId,
        errorCode,
        retryAfterMs: guardResult.retryAfterMs,
      });

      const updated = getAgentMessage(this.db, failedMessage.id);
      return { message: updated ?? failedMessage, sessionId: null };
    }

    // Create the agent_messages row
    const agentMessage = createAgentMessage(this.db, {
      fromAgentId,
      toAgentId,
      content,
      paymentMicro,
      threadId,
      fireAndForget,
    });

    log.info(`Agent invoke: ${fromAgent.name} → ${toAgent.name}`, {
      messageId: agentMessage.id,
      threadId,
      traceId,
      paymentMicro,
      fireAndForget,
    });

    // Record audit and metrics for agent message send
    agentMessagesTotal.inc({ direction: 'outbound', status: 'sent' });
    recordAudit(
      this.db,
      'agent_message_send',
      fromAgent.name,
      'agent_message',
      agentMessage.id,
      `${fromAgent.name} → ${toAgent.name}${fireAndForget ? ' [F&F]' : ''}: ${content.slice(0, 200)}`,
      traceId,
    );

    // Send on-chain payment from Agent A → Agent B via OnChainTransactor
    let txid: string | null = null;
    try {
      if (this.transactor) {
        const result = await this.transactor.sendMessage({
          fromAgentId,
          toAgentId,
          content,
          paymentMicro,
          messageId: agentMessage.id,
        });
        if (result.blockedByLimit && result.limitError) {
          updateAgentMessageStatus(this.db, agentMessage.id, 'failed', {
            response: `Spending limit: ${result.limitError}`,
            errorCode: 'SPENDING_LIMIT',
          });
          this.emitMessageUpdate(agentMessage.id);
          this.guard.recordFailure(toAgentId);
          const failedMessage = getAgentMessage(this.db, agentMessage.id);
          return { message: failedMessage ?? agentMessage, sessionId: null };
        }
        txid = result.txid;
      }
    } catch (err) {
      log.warn('On-chain send failed, proceeding without txid', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    updateAgentMessageStatus(this.db, agentMessage.id, 'sent', { txid: txid ?? undefined });
    this.emitMessageUpdate(agentMessage.id);

    // Fire-and-forget: mark as completed after delivery, don't create a session
    if (fireAndForget) {
      updateAgentMessageStatus(this.db, agentMessage.id, 'completed');
      this.emitMessageUpdate(agentMessage.id);
      this.guard.recordSuccess(toAgentId);

      log.info(`Fire-and-forget message delivered`, {
        messageId: agentMessage.id,
        txid,
      });

      const updatedMessage = getAgentMessage(this.db, agentMessage.id);
      return {
        message: updatedMessage ?? agentMessage,
        sessionId: null,
      };
    }

    // Create a session for Agent B to process the message
    const resolvedProjectId = projectId ?? toAgent.defaultProjectId ?? this.getDefaultProjectId();

    // Build conversation history for threads with prior messages
    const historyBlock = this.buildThreadHistory(threadId, agentMessage.id);
    // Reply instruction placed BOTH before and after the message content.
    // Weaker models (Ollama) often ignore trailing instructions but respect
    // leading ones, while stronger models benefit from the reminder at the end.
    const replyPrefix =
      '[REPLY WITH TEXT ONLY. Do NOT call corvid_send_message or corvid_save_memory. Just write your answer as plain text output.]\n\n';
    const replySuffix =
      '\n\nIMPORTANT: Reply by writing your full response as plain text output. ' +
      'Do NOT use corvid_save_memory or corvid_send_message to respond — just write your answer directly as text.';
    const messageBody = `Agent "${fromAgent.name}" sent you a message (${(paymentMicro / 1_000_000).toFixed(6)} ALGO):\n\n${content}`;
    const prompt = historyBlock
      ? `${replyPrefix}${historyBlock}\n\n---\n\n${messageBody}${replySuffix}`
      : `${replyPrefix}${messageBody}${replySuffix}`;

    const session = createSession(this.db, {
      projectId: resolvedProjectId,
      agentId: toAgentId,
      name: `Agent Msg: ${fromAgent.name} → ${toAgent.name}`,
      initialPrompt: prompt,
      source: 'agent',
    });

    updateAgentMessageStatus(this.db, agentMessage.id, 'processing', { sessionId: session.id });
    // Note: don't emit here — 'sent' already emitted the initial update.
    // Emitting 'processing' would cause duplicate SEND entries in the feed.

    // Track initial on-chain send cost against the new session
    if (txid && paymentMicro > 0) {
      updateSessionAlgoSpent(this.db, session.id, paymentMicro);
    }

    // Subscribe to session events and buffer the response
    this.subscribeForAgentResponse(agentMessage.id, session.id, fromAgentId, toAgentId);

    // Start the session process within trace context (pass depth for invoke chain limiting)
    runWithEventContext(eventCtx, () => {
      this.processManager.startProcess(session, prompt, { depth: request.depth });
    });

    const updatedMessage = getAgentMessage(this.db, agentMessage.id);
    return {
      message: updatedMessage ?? agentMessage,
      sessionId: session.id,
    };
  }

  private subscribeForAgentResponse(
    messageId: string,
    sessionId: string,
    fromAgentId: string,
    toAgentId: string,
  ): void {
    let responseBuffer = '';
    let lastTurnResponse = '';
    // Fallback: if the agent saves to memory instead of replying with text,
    // capture the memory content so we return *something* instead of EMPTY_RESPONSE.
    let memoryShadow = '';
    let completed = false;

    const finish = () => {
      if (completed) return;
      completed = true;
      this.processManager.unsubscribe(sessionId, callback);

      const response = responseBuffer.trim() || lastTurnResponse.trim() || memoryShadow.trim();
      if (!response) {
        updateAgentMessageStatus(this.db, messageId, 'failed', {
          errorCode: 'EMPTY_RESPONSE',
        });
        this.emitMessageUpdate(messageId);
        this.guard.recordFailure(toAgentId);
        return;
      }

      // Send the response back on-chain from B → A via OnChainTransactor
      const sendResponse = this.transactor
        ? this.transactor
            .sendMessage({
              fromAgentId: toAgentId,
              toAgentId: fromAgentId,
              content: response,
              paymentMicro: 0,
              messageId,
              sessionId,
            })
            .then((r) => r.txid)
        : Promise.resolve(null);

      sendResponse
        .then((responseTxid) => {
          updateAgentMessageStatus(this.db, messageId, 'completed', {
            response,
            responseTxid: responseTxid ?? undefined,
          });
          this.emitMessageUpdate(messageId);
          this.guard.recordSuccess(toAgentId);
          log.info(`Agent message completed`, { messageId, responseTxid });
        })
        .catch((err) => {
          // Mark failed — response was generated but on-chain send didn't succeed
          updateAgentMessageStatus(this.db, messageId, 'failed', {
            response,
            errorCode: 'RESPONSE_SEND_FAILED',
          });
          this.emitMessageUpdate(messageId);
          this.guard.recordFailure(toAgentId);
          log.warn('On-chain response send failed', {
            messageId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    };

    const callback = (sid: string, event: ClaudeStreamEvent) => {
      if (sid !== sessionId) return;
      if (event.type === 'result' || event.type === 'session_exited' || event.type === 'session_stopped') {
        log.info('[subscribeForAgentResponse] event', {
          type: event.type,
          sessionId: sessionId.slice(0, 8),
          bufLen: responseBuffer.length,
          lastLen: lastTurnResponse.length,
          completed,
        });
      }

      // SDK-style assistant events (Claude SDK provider).
      // These contain the FULL turn text — replace (not append) the buffer
      // to avoid doubling when content_block_delta streaming already captured
      // the same text incrementally.
      if (event.type === 'assistant' && event.message?.content) {
        const text = extractContentText(event.message.content);
        if (text) {
          responseBuffer = text;
        }
      }

      // Cursor-style streamed text (content_block_delta from cursor-agent CLI)
      // and direct-process streaming. These arrive incrementally during generation.
      if (event.type === 'content_block_delta') {
        const delta = (event as unknown as Record<string, unknown>).delta as Record<string, unknown> | undefined;
        if (delta && typeof delta.text === 'string') {
          responseBuffer += delta.text;
        }
      }

      // Cursor-style assistant_message / text events (not in ClaudeStreamEvent union)
      {
        const rawType = (event as unknown as Record<string, unknown>).type as string;
        if (rawType === 'assistant_message' || rawType === 'text') {
          const raw = event as unknown as Record<string, unknown>;
          const text = raw.content ?? raw.text;
          if (typeof text === 'string') {
            responseBuffer += text;
          }
        }
      }

      // Fallback capture: if the agent misroutes its reply through a tool
      // call instead of plain text, capture the content so we return
      // *something* instead of EMPTY_RESPONSE. Common with Ollama models
      // that ignore response routing instructions.
      if (event.type === 'content_block_start') {
        const block = (event as unknown as Record<string, unknown>).content_block as
          | Record<string, unknown>
          | undefined;
        if (block?.type === 'tool_use') {
          const input = block.input as Record<string, unknown> | undefined;
          // corvid_save_memory: model tried to save its reply as a memory
          if (block.name === 'corvid_save_memory' && input && typeof input.content === 'string') {
            memoryShadow = input.content;
          }
          // corvid_send_message: model tried to send its reply back via tool
          if (block.name === 'corvid_send_message' && input && typeof input.content === 'string') {
            memoryShadow = input.content;
          }
          // corvid_discord_send_message: model tried to reply via Discord tool
          if (block.name === 'corvid_discord_send_message' && input && typeof input.content === 'string') {
            memoryShadow = input.content;
          }
        }
      }

      // 'message_stop' marks end of a model turn — save and reset
      if (event.type === 'message_stop') {
        lastTurnResponse = responseBuffer;
        responseBuffer = '';
      }

      // 'result' marks the session-level completion. Only overwrite
      // lastTurnResponse if the buffer has new content (avoids clobbering
      // a valid response captured at message_stop).
      if (event.type === 'result') {
        if (responseBuffer.length > 0) {
          lastTurnResponse = responseBuffer;
          responseBuffer = '';
        }
      }

      // Finalize when the session exits, stops, or completes with a result
      if (event.type === 'session_exited' || event.type === 'session_stopped' || event.type === 'result') {
        log.info('[subscribeForAgentResponse] settling', {
          sessionId: sessionId.slice(0, 8),
          bufLen: responseBuffer.length,
          lastLen: lastTurnResponse.length,
          memoryShadowLen: memoryShadow.length,
        });
        finish();
      }
    };

    this.processManager.subscribe(sessionId, callback);

    // Safety timeout: clean up the subscription if the session never exits.
    // This prevents indefinite orphaned subscriptions (e.g., target agent hangs).
    const SUBSCRIBE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    setTimeout(() => {
      if (!completed) {
        log.warn('Agent response subscription timed out', { messageId, sessionId });
        // Stop the process if still running
        if (this.processManager.isRunning(sessionId)) {
          this.processManager.stopProcess(sessionId);
        } else {
          // Process already gone but we never got the exit event — clean up manually
          finish();
        }
      }
    }, SUBSCRIBE_TIMEOUT_MS);
  }

  /**
   * Invoke an agent and wait for the full response text.
   * Calls invoke() then subscribes to the session's events, buffering assistant
   * content until the session completes. Returns the response text and thread ID.
   */
  async invokeAndWait(
    request: AgentInvokeRequest,
    timeoutMs: number = 5 * 60 * 1000,
  ): Promise<{ response: string; threadId: string }> {
    // Subscribe globally BEFORE invoke() to avoid a race condition where
    // fast agents (Ollama cloud models) finish before session-specific
    // subscription is registered. We buffer ALL events during invoke(),
    // then replay the ones matching our session once we know the sessionId.
    let responseBuffer = '';
    let lastTurnResponse = '';
    let memoryShadow = '';
    let settled = false;
    let targetSessionId: string | null = null;
    let resolvePromise: ((value: { response: string; threadId: string }) => void) | null = null;
    let rejectPromise: ((reason: Error) => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let threadId = '';
    let messageId = '';
    const earlyEvents: Array<{ sid: string; event: ClaudeStreamEvent }> = [];

    const settle = (response: string | null, error?: string) => {
      if (settled) return;
      log.info('[invokeAndWait] settling', {
        hasResponse: !!response,
        responseLen: response?.length ?? 0,
        error: error ?? 'none',
        bufLen: responseBuffer.length,
        lastLen: lastTurnResponse.length,
      });
      settled = true;
      if (timer) clearTimeout(timer);
      if (targetSessionId) {
        this.processManager.unsubscribe(targetSessionId, handleEvent);
      }
      if (response && resolvePromise) {
        resolvePromise({ response, threadId });
      } else if (rejectPromise) {
        rejectPromise(new Error(error ?? 'Agent returned empty response'));
      }
    };

    const handleEvent = (sid: string, event: ClaudeStreamEvent) => {
      // Before we know the session ID, buffer all events for later replay
      if (!targetSessionId) {
        earlyEvents.push({ sid, event });
        log.debug('[invokeAndWait] buffered early event', { type: event.type, sid: sid.slice(0, 8) });
        return;
      }
      if (sid !== targetSessionId || settled) return;
      if (event.type === 'result' || event.type === 'session_exited' || event.type === 'session_stopped') {
        log.info('[invokeAndWait] handleEvent', {
          type: event.type,
          sid: sid.slice(0, 8),
          bufLen: responseBuffer.length,
          lastLen: lastTurnResponse.length,
        });
      }

      // SDK-style assistant events (Claude SDK provider).
      // These contain the FULL turn text — replace (not append) the buffer
      // to avoid doubling when content_block_delta streaming already captured
      // the same text incrementally.
      if (event.type === 'assistant' && event.message?.content) {
        const text = extractContentText(event.message.content);
        if (text) {
          responseBuffer = text;
        }
      }

      // Cursor-style streamed text (content_block_delta from cursor-agent CLI)
      // and direct-process streaming. These arrive incrementally during generation.
      if (event.type === 'content_block_delta') {
        const delta = (event as unknown as Record<string, unknown>).delta as Record<string, unknown> | undefined;
        if (delta && typeof delta.text === 'string') {
          responseBuffer += delta.text;
        }
      }

      // Cursor-style assistant_message / text events (not in ClaudeStreamEvent union)
      {
        const rawType = (event as unknown as Record<string, unknown>).type as string;
        if (rawType === 'assistant_message' || rawType === 'text') {
          const raw = event as unknown as Record<string, unknown>;
          const text = raw.content ?? raw.text;
          if (typeof text === 'string') {
            responseBuffer += text;
          }
        }
      }

      // Fallback capture: if the agent misroutes its reply through a tool
      // call instead of plain text, capture the content as a shadow response.
      if (event.type === 'content_block_start') {
        const block = (event as unknown as Record<string, unknown>).content_block as
          | Record<string, unknown>
          | undefined;
        if (block?.type === 'tool_use') {
          const input = block.input as Record<string, unknown> | undefined;
          if (block.name === 'corvid_save_memory' && input && typeof input.content === 'string') {
            memoryShadow = input.content;
          }
          if (block.name === 'corvid_send_message' && input && typeof input.content === 'string') {
            memoryShadow = input.content;
          }
          if (block.name === 'corvid_discord_send_message' && input && typeof input.content === 'string') {
            memoryShadow = input.content;
          }
        }
      }

      // 'message_stop' marks end of a model turn — save and reset
      if (event.type === 'message_stop') {
        lastTurnResponse = responseBuffer;
        responseBuffer = '';
      }

      // 'result' marks session-level completion. Only overwrite
      // lastTurnResponse if the buffer has new content.
      if (event.type === 'result') {
        if (responseBuffer.length > 0) {
          lastTurnResponse = responseBuffer;
          responseBuffer = '';
        }
      }

      // Resolve when the session exits, stops, or completes with a result
      if (event.type === 'session_exited' || event.type === 'session_stopped' || event.type === 'result') {
        const response = responseBuffer.trim() || lastTurnResponse.trim() || memoryShadow.trim();
        settle(response || null);
      }
    };

    // Pre-subscribe globally so we capture events even if the process
    // completes before invoke() returns.
    this.processManager.subscribeAll(handleEvent);

    let result: AgentInvokeResult;
    try {
      result = await this.invoke(request);
    } catch (err) {
      this.processManager.unsubscribeAll(handleEvent);
      throw err;
    }

    const sessionId = result.sessionId;
    if (!sessionId) {
      this.processManager.unsubscribeAll(handleEvent);
      throw new ExternalServiceError('AgentMessenger', 'No session created for agent invoke');
    }

    targetSessionId = sessionId;
    threadId = result.message.threadId ?? request.threadId ?? crypto.randomUUID();
    messageId = result.message.id;

    // Switch from global to session-specific subscription to avoid
    // processing events from unrelated sessions.
    this.processManager.subscribe(sessionId, handleEvent);
    this.processManager.unsubscribeAll(handleEvent);

    // Replay any events that were buffered before we knew the session ID.
    // handleEvent now has targetSessionId set, so it will process them.
    for (const { sid, event } of earlyEvents) {
      handleEvent(sid, event);
    }
    earlyEvents.length = 0;

    // If events were already captured via global subscription and the
    // session already settled, return immediately.
    if (settled) {
      const response = responseBuffer.trim() || lastTurnResponse.trim() || memoryShadow.trim();
      if (response) {
        return { response, threadId };
      }
      throw new Error('Agent returned empty response');
    }

    return new Promise<{ response: string; threadId: string }>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;

      timer = setTimeout(() => {
        const response = responseBuffer.trim() || lastTurnResponse.trim() || memoryShadow.trim();
        // Stop the orphaned session so it doesn't run indefinitely
        if (this.processManager.isRunning(sessionId)) {
          log.warn('Stopping orphaned agent session on timeout', { sessionId, timeoutMs });
          this.processManager.stopProcess(sessionId);
        }
        settle(response || null, `Agent invoke timed out after ${timeoutMs}ms`);
      }, timeoutMs);

      // If the process already finished (events captured via global subscription),
      // check if we already have a response.
      if (!this.processManager.isRunning(sessionId)) {
        setTimeout(() => {
          if (settled) return;
          const response = responseBuffer.trim() || lastTurnResponse.trim() || memoryShadow.trim();
          if (response) {
            settle(response);
          } else {
            // Last resort: check if subscribeForAgentResponse captured the
            // response in the DB (it subscribes before startProcess in invoke()).
            const msg = getAgentMessage(this.db, messageId);
            settle(msg?.response ?? null, 'Agent session already exited with no response');
          }
        }, 500);
      }
    });
  }

  /**
   * Send an on-chain message from an agent to itself (for memory/audit storage).
   * Delegates to OnChainTransactor.
   */
  async sendOnChainToSelf(agentId: string, content: string): Promise<string | null> {
    if (!this.transactor) return null;
    return this.transactor.sendToSelf(agentId, content);
  }

  /**
   * Read on-chain memories for an agent. Delegates to OnChainTransactor.
   */
  async readOnChainMemories(
    agentId: string,
    serverMnemonic: string | null | undefined,
    network: string | undefined,
    options?: { limit?: number; afterRound?: number; search?: string },
  ): Promise<import('./on-chain-transactor').OnChainMemory[]> {
    if (!this.transactor) return [];
    return this.transactor.readOnChainMemories(agentId, serverMnemonic, network, options);
  }

  /**
   * Send a notification to an arbitrary Algorand address from an agent.
   * Best-effort — returns txid or null, never throws.
   */
  async sendNotificationToAddress(fromAgentId: string, toAddress: string, content: string): Promise<string | null> {
    if (!this.transactor) return null;
    return this.transactor.sendNotificationToAddress(fromAgentId, toAddress, content);
  }

  /** Best-effort on-chain message send. Returns txid or null. Never throws. */
  async sendOnChainBestEffort(
    fromAgentId: string,
    toAgentId: string,
    content: string,
    messageId?: string,
  ): Promise<string | null> {
    if (!this.transactor) return null;
    return this.transactor.sendBestEffort(fromAgentId, toAgentId, content, messageId);
  }

  private getDefaultProjectId(): string {
    const { listProjects, createProject } = require('../db/projects');
    const projects = listProjects(this.db);
    if (projects.length > 0) return projects[0].id;

    const project = createProject(this.db, {
      name: 'Agent Messages',
      workingDir: process.cwd(),
    });
    return project.id;
  }
}
