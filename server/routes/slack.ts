import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import {
    listActiveQuestionDispatches,
    markDispatchAnswered,
    getQuestionDispatchesByQuestionId,
    updateQuestionDispatchStatus,
} from '../db/notifications';
import { sendSlack } from '../notifications/channels/slack';
import { createLogger } from '../lib/logger';
import { json } from '../lib/response';
import * as crypto from 'crypto';

const log = createLogger('SlackRoutes');

async function verifySlackSignature(
    req: Request,
    body: string,
    signingSecret: string,
): Promise<boolean> {
    const timestamp = req.headers.get('X-Slack-Request-Timestamp');
    const slackSignature = req.headers.get('X-Slack-Signature');
    if (!timestamp || !slackSignature) return false;

    // Reject requests older than 5 minutes
    const parsedTimestamp = parseInt(timestamp, 10);
    if (!Number.isFinite(parsedTimestamp)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parsedTimestamp) > 300) return false;

    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', signingSecret);
    hmac.update(sigBasestring);
    const mySignature = `v0=${hmac.digest('hex')}`;

    // Timing-safe comparison
    try {
        return crypto.timingSafeEqual(
            Buffer.from(mySignature),
            Buffer.from(slackSignature),
        );
    } catch {
        return false;
    }
}

export function handleSlackRoutes(
    req: Request,
    url: URL,
    db: Database,
    processManager: ProcessManager,
): Response | Promise<Response> | null {
    // POST /slack/events — Slack Events API + Interactivity
    if (url.pathname === '/slack/events' && req.method === 'POST') {
        return handleSlackEvents(req, db, processManager);
    }

    return null;
}

async function handleSlackEvents(
    req: Request,
    db: Database,
    processManager: ProcessManager,
): Promise<Response> {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    const botToken = process.env.SLACK_BOT_TOKEN;

    if (!signingSecret) {
        log.warn('SLACK_SIGNING_SECRET not configured');
        return json({ error: 'Slack not configured' }, 503);
    }

    const rawBody = await req.text();

    // Verify signature
    const valid = await verifySlackSignature(req, rawBody, signingSecret);
    if (!valid) {
        log.warn('Slack signature verification failed');
        return json({ error: 'Invalid signature' }, 401);
    }

    // Check content type — Slack sends interactive payloads as application/x-www-form-urlencoded
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
        // Interactive payload (button clicks)
        const params = new URLSearchParams(rawBody);
        const payloadStr = params.get('payload');
        if (!payloadStr) return json({ error: 'Missing payload' }, 400);

        let payload: {
            type: string;
            actions?: Array<{ action_id: string; value: string }>;
            channel?: { id: string };
            message?: { ts: string; thread_ts?: string };
            user?: { id: string };
        };
        try {
            payload = JSON.parse(payloadStr) as typeof payload;
        } catch {
            return json({ error: 'Invalid payload' }, 400);
        }

        if (payload.type === 'block_actions' && payload.actions) {
            for (const action of payload.actions) {
                // Parse action_id: "q:shortId:optionIdx"
                const match = action.action_id.match(/^q:([^:]+):(\d+)$/);
                if (!match) continue;

                const [, shortId, optionStr] = match;
                const optionIdx = parseInt(optionStr, 10);

                // Find the matching question dispatch
                const dispatches = listActiveQuestionDispatches(db);
                const dispatch = dispatches.find(
                    (d) => d.channelType === 'slack' && d.questionId.startsWith(shortId),
                );

                if (dispatch) {
                    // Look up options from the question
                    const row = db.query(
                        'SELECT options FROM owner_questions WHERE id = ?',
                    ).get(dispatch.questionId) as { options: string | null } | null;

                    const options: string[] = row?.options ? JSON.parse(row.options) : [];
                    const answer = optionIdx < options.length ? options[optionIdx] : String(optionIdx);

                    const resolved = processManager.ownerQuestionManager.resolveQuestion(dispatch.questionId, {
                        questionId: dispatch.questionId,
                        answer,
                        selectedOption: optionIdx < options.length ? optionIdx : null,
                    });

                    if (resolved) {
                        log.info('Resolved question via Slack button', { questionId: dispatch.questionId });
                        markDispatchAnswered(db, dispatch.id);

                        // Mark all other dispatches for this question as answered
                        const allDispatches = getQuestionDispatchesByQuestionId(db, dispatch.questionId);
                        for (const d of allDispatches) {
                            if (d.status === 'sent') {
                                updateQuestionDispatchStatus(db, d.id, 'answered');
                            }
                        }
                    }
                }
            }
        }

        return json({ ok: true });
    }

    // JSON payload — Events API
    let body: Record<string, unknown>;
    try {
        body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }

    // URL verification challenge
    if (body.type === 'url_verification') {
        return json({ challenge: body.challenge });
    }

    // Event callback
    if (body.type === 'event_callback') {
        const event = body.event as {
            type: string;
            text?: string;
            thread_ts?: string;
            ts?: string;
            channel?: string;
            user?: string;
            bot_id?: string;
        } | undefined;

        if (!event) return json({ ok: true });

        // Ignore bot messages to prevent loops
        if (event.bot_id) return json({ ok: true });

        // Only handle messages in threads (thread replies to question messages)
        if (event.type === 'message' && event.thread_ts && event.text) {
            const dispatches = listActiveQuestionDispatches(db);
            const dispatch = dispatches.find((d) => {
                if (d.channelType !== 'slack' || !d.externalRef) return false;
                // externalRef format: "channel:ts"
                const parts = d.externalRef.split(':');
                if (parts.length !== 2) return false;
                const [channel, ts] = parts;
                return channel === event.channel && ts === event.thread_ts;
            });

            if (dispatch) {
                // Look up options to try to match
                const row = db.query(
                    'SELECT options FROM owner_questions WHERE id = ?',
                ).get(dispatch.questionId) as { options: string | null } | null;

                const options: string[] = row?.options ? JSON.parse(row.options) : [];
                const trimmed = event.text.trim();
                let answer = trimmed;
                let selectedOption: number | null = null;

                // Try to match by number
                const numMatch = trimmed.match(/^(\d+)$/);
                if (numMatch && options.length > 0) {
                    const idx = parseInt(numMatch[1], 10) - 1;
                    if (idx >= 0 && idx < options.length) {
                        answer = options[idx];
                        selectedOption = idx;
                    }
                }

                // Try exact text match
                if (selectedOption === null && options.length > 0) {
                    const lowerTrimmed = trimmed.toLowerCase();
                    const matchIdx = options.findIndex((opt) => opt.toLowerCase() === lowerTrimmed);
                    if (matchIdx >= 0) {
                        answer = options[matchIdx];
                        selectedOption = matchIdx;
                    }
                }

                const resolved = processManager.ownerQuestionManager.resolveQuestion(dispatch.questionId, {
                    questionId: dispatch.questionId,
                    answer,
                    selectedOption,
                });

                if (resolved) {
                    log.info('Resolved question via Slack thread reply', { questionId: dispatch.questionId });
                    markDispatchAnswered(db, dispatch.id);

                    const allDispatches = getQuestionDispatchesByQuestionId(db, dispatch.questionId);
                    for (const d of allDispatches) {
                        if (d.status === 'sent') {
                            updateQuestionDispatchStatus(db, d.id, 'answered');
                        }
                    }

                    // Send confirmation in thread
                    if (botToken && event.channel) {
                        sendSlack(botToken, event.channel, {
                            notificationId: '',
                            agentId: '',
                            sessionId: null,
                            title: null,
                            message: 'Answer received!',
                            level: 'success',
                            timestamp: new Date().toISOString(),
                        }, event.thread_ts).catch(() => {});
                    }
                }
            }
        }
    }

    return json({ ok: true });
}
