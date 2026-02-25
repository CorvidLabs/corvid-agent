import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleNotifyOwner(
    ctx: McpToolContext,
    args: { title?: string; message: string; level?: string },
): Promise<CallToolResult> {
    const level = args.level ?? 'info';
    const validLevels = ['info', 'warning', 'success', 'error'];
    if (!validLevels.includes(level)) {
        return errorResult(`Invalid level "${level}". Use one of: ${validLevels.join(', ')}`);
    }

    if (!args.message?.trim()) {
        return errorResult('A message is required.');
    }

    // Use NotificationService for multi-channel dispatch when available
    if (ctx.notificationService) {
        try {
            const result = await ctx.notificationService.notify({
                agentId: ctx.agentId,
                sessionId: ctx.sessionId,
                title: args.title,
                message: args.message,
                level,
            });

            log.info('Agent notification sent (multi-channel)', {
                agentId: ctx.agentId,
                level,
                notificationId: result.notificationId,
                channels: result.channels,
            });

            const channelList = result.channels.length > 0 ? result.channels.join(', ') : 'websocket';
            return textResult(
                `Notification sent to owner via [${channelList}]: "${args.message.slice(0, 100)}${args.message.length > 100 ? '...' : ''}"`,
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('Multi-channel notification failed, falling back to WS', { error: message });
            // Fall through to WebSocket-only fallback
        }
    }

    // Fallback: WebSocket-only broadcast
    const notification = {
        type: 'agent_notification',
        agentId: ctx.agentId,
        sessionId: ctx.sessionId ?? '',
        title: args.title ?? null,
        message: args.message,
        level,
        timestamp: new Date().toISOString(),
    };

    if (ctx.broadcastOwnerMessage) {
        ctx.broadcastOwnerMessage(notification);
    }

    log.info('Agent notification sent', {
        agentId: ctx.agentId,
        level,
        messagePreview: args.message.slice(0, 100),
    });

    return textResult(`Notification sent to owner: "${args.message.slice(0, 100)}${args.message.length > 100 ? '...' : ''}"`);
}

export async function handleAskOwner(
    ctx: McpToolContext,
    args: { question: string; options?: string[]; context?: string; timeout_minutes?: number },
): Promise<CallToolResult> {
    if (!ctx.ownerQuestionManager) {
        return errorResult('Owner question service is not available.');
    }

    if (!args.question?.trim()) {
        return errorResult('A question is required.');
    }

    const timeoutMinutes = Math.max(1, Math.min(args.timeout_minutes ?? 2, 10));
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Broadcast the question to all connected WS clients
    const questionData = {
        sessionId: ctx.sessionId ?? '',
        agentId: ctx.agentId,
        question: args.question,
        options: args.options ?? null,
        context: args.context ?? null,
        timeoutMs,
    };

    // Create the blocking question — this will return the question ID
    const responsePromise = ctx.ownerQuestionManager.createQuestion(questionData);

    // Get the pending question to retrieve its ID for the broadcast
    const pending = ctx.ownerQuestionManager.getPendingForSession(ctx.sessionId ?? '');
    const latestQuestion = pending[pending.length - 1];

    if (latestQuestion && ctx.broadcastOwnerMessage) {
        ctx.broadcastOwnerMessage({
            type: 'agent_question',
            question: latestQuestion,
        });
    }

    // Dispatch to configured external channels (GitHub, Telegram, AlgoChat)
    if (ctx.questionDispatcher && latestQuestion) {
        ctx.questionDispatcher.dispatch(latestQuestion).catch((err) => {
            log.warn('Question channel dispatch failed', { error: err instanceof Error ? err.message : String(err) });
        });
    }

    ctx.emitStatus?.(`Waiting for owner response (${timeoutMinutes}min timeout)...`);

    const response = await responsePromise;

    if (!response) {
        log.info('Owner did not respond to question', {
            agentId: ctx.agentId,
            questionPreview: args.question.slice(0, 100),
        });
        return textResult(
            `Owner did not respond within ${timeoutMinutes} minute${timeoutMinutes > 1 ? 's' : ''}. ` +
            'You may proceed with your best judgment or try again later.',
        );
    }

    log.info('Owner responded to question', {
        agentId: ctx.agentId,
        answerPreview: response.answer.slice(0, 100),
    });

    const optionInfo = response.selectedOption !== null && args.options
        ? ` (selected option ${response.selectedOption + 1}: "${args.options[response.selectedOption]}")`
        : '';
    return textResult(`Owner response: ${response.answer}${optionInfo}`);
}
