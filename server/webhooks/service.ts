/**
 * WebhookService — processes incoming GitHub webhook events and triggers agent sessions.
 *
 * Handles:
 * - Signature validation (HMAC SHA-256 via GITHUB_WEBHOOK_SECRET)
 * - Event routing: issue_comment, pull_request_review_comment, issues
 * - @mention detection and matching to registered webhook handlers
 * - Agent session creation with full event context
 * - Rate limiting per registration to prevent abuse
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type { WebhookRegistration, WebhookEventType } from '../../shared/types';
import {
    findRegistrationsForRepo,
    createDelivery,
    updateDeliveryStatus,
    incrementTriggerCount,
} from '../db/webhooks';
import { getAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { createEventContext, runWithEventContext } from '../observability/event-context';
import { NotFoundError } from '../lib/errors';

const log = createLogger('Webhook');

/** Minimum time between triggers for the same registration (1 minute). */
const MIN_TRIGGER_INTERVAL_MS = 60_000;

/**
 * Parsed payload from a GitHub webhook event.
 * We only extract the fields we care about.
 */
export interface GitHubWebhookPayload {
    action: string;
    sender: { login: string };
    repository: { full_name: string; html_url: string };

    // issue_comment event
    comment?: {
        body: string;
        html_url: string;
        user: { login: string };
    };

    // issues event
    issue?: {
        number: number;
        title: string;
        body: string;
        html_url: string;
        user: { login: string };
        labels?: Array<{ name: string }>;
        pull_request?: { url: string }; // present when the "issue" is actually a PR
    };

    // pull_request_review_comment event
    pull_request?: {
        number: number;
        title: string;
        body: string;
        html_url: string;
        user: { login: string };
    };
}

type WebhookEventCallback = (event: {
    type: 'webhook_delivery';
    data: unknown;
}) => void;

export class WebhookService {
    private db: Database;
    private processManager: ProcessManager;
    private workTaskService: WorkTaskService | null;
    private webhookSecret: string | null;
    private eventCallbacks = new Set<WebhookEventCallback>();
    private recentTriggers = new Map<string, number>(); // registrationId -> last trigger timestamp

    constructor(
        db: Database,
        processManager: ProcessManager,
        workTaskService?: WorkTaskService | null,
    ) {
        this.db = db;
        this.processManager = processManager;
        this.workTaskService = workTaskService ?? null;
        this.webhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim() || null;

        if (!this.webhookSecret) {
            log.warn('GITHUB_WEBHOOK_SECRET not set — webhook signature validation disabled');
        }
    }

    /** Subscribe to webhook events (for WebSocket broadcast). */
    onEvent(callback: WebhookEventCallback): () => void {
        this.eventCallbacks.add(callback);
        return () => this.eventCallbacks.delete(callback);
    }

    /**
     * Validate the GitHub webhook signature.
     * Returns true if valid, false if invalid.
     * If no secret is configured, always returns true (but logs a warning).
     */
    async validateSignature(payload: string, signature: string | null): Promise<boolean> {
        if (!this.webhookSecret) {
            log.warn('Webhook rejected: no GITHUB_WEBHOOK_SECRET configured — set it to accept webhooks');
            return false;
        }

        if (!signature) {
            log.warn('Webhook request missing X-Hub-Signature-256 header');
            return false;
        }

        // GitHub sends: sha256=<hex>
        const expectedPrefix = 'sha256=';
        if (!signature.startsWith(expectedPrefix)) {
            log.warn('Invalid signature format', { signature: signature.slice(0, 20) });
            return false;
        }

        const receivedHex = signature.slice(expectedPrefix.length);

        try {
            const key = new TextEncoder().encode(this.webhookSecret);
            const data = new TextEncoder().encode(payload);

            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                key,
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign'],
            );

            const mac = await crypto.subtle.sign('HMAC', cryptoKey, data);
            const expectedHex = Array.from(new Uint8Array(mac))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

            // Timing-safe comparison
            if (receivedHex.length !== expectedHex.length) return false;
            let result = 0;
            for (let i = 0; i < expectedHex.length; i++) {
                result |= receivedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
            }
            return result === 0;
        } catch (err) {
            log.error('Signature validation error', { error: err instanceof Error ? err.message : String(err) });
            return false;
        }
    }

    /**
     * Process an incoming GitHub webhook event.
     * Returns a summary of what happened.
     */
    async processEvent(
        event: string,
        payload: GitHubWebhookPayload,
    ): Promise<{ processed: number; skipped: number; details: string[] }> {
        const ctx = createEventContext('webhook');
        return runWithEventContext(ctx, async () => {
        const repo = payload.repository.full_name;
        const action = payload.action;
        const sender = payload.sender.login;

        log.info('Processing webhook event', { event, action, repo, sender });

        // Find all active registrations for this repo
        const registrations = findRegistrationsForRepo(this.db, repo);
        if (registrations.length === 0) {
            log.debug('No registrations found for repo', { repo });
            return { processed: 0, skipped: 0, details: [`No registrations for ${repo}`] };
        }

        let processed = 0;
        let skipped = 0;
        const details: string[] = [];

        for (const reg of registrations) {
            // Check if the event type matches
            const eventType = this.mapGitHubEventToType(event, payload);
            if (!eventType || !reg.events.includes(eventType)) {
                log.debug('Event type not registered', { event, eventType, registrationId: reg.id });
                skipped++;
                details.push(`${reg.id}: Event ${event}/${action} not registered`);
                continue;
            }

            // Check for @mention
            const mentionBody = this.extractMentionBody(event, payload);
            if (!mentionBody) {
                skipped++;
                details.push(`${reg.id}: No comment body to check for mentions`);
                continue;
            }

            if (!this.containsMention(mentionBody, reg.mentionUsername)) {
                skipped++;
                details.push(`${reg.id}: No @${reg.mentionUsername} mention found`);
                continue;
            }

            // Don't trigger on our own comments (prevent infinite loops)
            const commentAuthor = this.getCommentAuthor(event, payload);
            if (commentAuthor && commentAuthor.toLowerCase() === reg.mentionUsername.toLowerCase()) {
                skipped++;
                details.push(`${reg.id}: Ignoring self-mention`);
                continue;
            }

            // Rate limit check
            if (this.isRateLimited(reg.id)) {
                skipped++;
                details.push(`${reg.id}: Rate limited (too soon since last trigger)`);
                continue;
            }

            // Create delivery record
            const htmlUrl = this.getHtmlUrl(event, payload);
            const delivery = createDelivery(
                this.db,
                reg.id,
                event,
                action,
                repo,
                sender,
                mentionBody,
                htmlUrl,
            );

            this.emit({ type: 'webhook_delivery', data: delivery });

            // Process the trigger
            try {
                await this.triggerAgent(reg, delivery.id, event, payload, mentionBody, htmlUrl);
                processed++;
                details.push(`${reg.id}: Triggered agent session`);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.error('Failed to trigger agent', { registrationId: reg.id, error: message });
                updateDeliveryStatus(this.db, delivery.id, 'failed', { result: message });
                details.push(`${reg.id}: Failed — ${message}`);
            }
        }

        return { processed, skipped, details };
        }); // runWithEventContext
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    /**
     * Map GitHub event name + payload to our WebhookEventType.
     */
    private mapGitHubEventToType(event: string, payload: GitHubWebhookPayload): WebhookEventType | null {
        switch (event) {
            case 'issue_comment':
                // GitHub sends issue_comment for both issues AND PRs
                if (payload.issue?.pull_request) {
                    return 'issue_comment_pr';
                }
                return 'issue_comment';
            case 'issues':
                return 'issues';
            case 'pull_request_review_comment':
                return 'pull_request_review_comment';
            default:
                return null;
        }
    }

    /**
     * Extract the text body to search for @mentions.
     */
    private extractMentionBody(event: string, payload: GitHubWebhookPayload): string | null {
        switch (event) {
            case 'issue_comment':
                return payload.comment?.body ?? null;
            case 'issues':
                return payload.issue?.body ?? null;
            case 'pull_request_review_comment':
                return payload.comment?.body ?? null;
            default:
                return null;
        }
    }

    /**
     * Get the author of the comment/issue (to prevent self-triggering).
     */
    private getCommentAuthor(event: string, payload: GitHubWebhookPayload): string | null {
        switch (event) {
            case 'issue_comment':
            case 'pull_request_review_comment':
                return payload.comment?.user?.login ?? null;
            case 'issues':
                return payload.issue?.user?.login ?? null;
            default:
                return null;
        }
    }

    /**
     * Get the HTML URL for the comment/issue/PR.
     */
    private getHtmlUrl(event: string, payload: GitHubWebhookPayload): string {
        switch (event) {
            case 'issue_comment':
            case 'pull_request_review_comment':
                return payload.comment?.html_url ?? payload.issue?.html_url ?? payload.repository.html_url;
            case 'issues':
                return payload.issue?.html_url ?? payload.repository.html_url;
            default:
                return payload.repository.html_url;
        }
    }

    /**
     * Check if a text body contains an @mention of the given username.
     * Handles common variations: @username, @Username, etc.
     */
    private containsMention(body: string, username: string): boolean {
        // Match @username with word boundary (not preceded by another @ or alphanumeric)
        const regex = new RegExp(`(?:^|\\s|[^\\w])@${escapeRegex(username)}(?:\\s|$|[^\\w])`, 'i');
        return regex.test(body);
    }

    /**
     * Per-registration rate limiting.
     */
    private isRateLimited(registrationId: string): boolean {
        const lastTrigger = this.recentTriggers.get(registrationId);
        if (lastTrigger && (Date.now() - lastTrigger) < MIN_TRIGGER_INTERVAL_MS) {
            return true;
        }
        this.recentTriggers.set(registrationId, Date.now());
        return false;
    }

    /**
     * Trigger an agent session based on the webhook event.
     */
    private async triggerAgent(
        reg: WebhookRegistration,
        deliveryId: string,
        event: string,
        payload: GitHubWebhookPayload,
        mentionBody: string,
        htmlUrl: string,
    ): Promise<void> {
        const agent = getAgent(this.db, reg.agentId);
        if (!agent) {
            throw new NotFoundError('Agent', reg.agentId);
        }

        // Build the prompt with full context
        const prompt = this.buildPrompt(event, payload, mentionBody, htmlUrl, reg);

        const isWorkTaskRequest = this.isWorkTaskRequest(mentionBody);

        if (isWorkTaskRequest && this.workTaskService) {
            // If the mention asks for code changes, create a work task
            const task = await this.workTaskService.create({
                agentId: reg.agentId,
                description: `GitHub webhook: ${mentionBody.slice(0, 500)}`,
                projectId: reg.projectId,
                source: 'agent',
                sourceId: deliveryId,
            });

            updateDeliveryStatus(this.db, deliveryId, 'completed', {
                result: `Work task created: ${task.id}`,
                workTaskId: task.id,
                sessionId: task.sessionId ?? undefined,
            });

            incrementTriggerCount(this.db, reg.id);
            log.info('Webhook triggered work task', { registrationId: reg.id, workTaskId: task.id });
        } else {
            // Create a regular session for the agent to respond
            const session = createSession(this.db, {
                projectId: reg.projectId,
                agentId: reg.agentId,
                name: `Webhook: ${this.getSessionName(event, payload)}`,
                initialPrompt: prompt,
                source: 'agent',
            });

            updateDeliveryStatus(this.db, deliveryId, 'processing', {
                sessionId: session.id,
            });

            this.processManager.startProcess(session, prompt, { schedulerMode: true });

            updateDeliveryStatus(this.db, deliveryId, 'completed', {
                result: `Session started: ${session.id}`,
                sessionId: session.id,
            });

            incrementTriggerCount(this.db, reg.id);
            log.info('Webhook triggered agent session', { registrationId: reg.id, sessionId: session.id });
        }
    }

    /**
     * Build a comprehensive prompt for the agent session.
     */
    private buildPrompt(
        event: string,
        payload: GitHubWebhookPayload,
        mentionBody: string,
        htmlUrl: string,
        _reg: WebhookRegistration,
    ): string {
        const repo = payload.repository.full_name;
        const sender = payload.sender.login;
        const issueNumber = payload.issue?.number;
        const issueTitle = payload.issue?.title ?? '';
        const prNumber = payload.pull_request?.number;
        const prTitle = payload.pull_request?.title ?? '';

        let context = '';

        if (event === 'issue_comment' && !payload.issue?.pull_request) {
            context = [
                `## GitHub Issue Comment — @mention trigger`,
                ``,
                `**Repository:** ${repo}`,
                `**Issue:** #${issueNumber} "${issueTitle}"`,
                `**Comment by:** @${sender}`,
                `**URL:** ${htmlUrl}`,
                ``,
                `### Comment`,
                `\`\`\``,
                mentionBody,
                `\`\`\``,
                ``,
                `### Issue Body`,
                `\`\`\``,
                payload.issue?.body ?? '(empty)',
                `\`\`\``,
            ].join('\n');
        } else if (event === 'issue_comment' && payload.issue?.pull_request) {
            context = [
                `## GitHub PR Comment — @mention trigger`,
                ``,
                `**Repository:** ${repo}`,
                `**PR:** #${issueNumber} "${issueTitle}"`,
                `**Comment by:** @${sender}`,
                `**URL:** ${htmlUrl}`,
                ``,
                `### Comment`,
                `\`\`\``,
                mentionBody,
                `\`\`\``,
            ].join('\n');
        } else if (event === 'pull_request_review_comment') {
            context = [
                `## GitHub PR Review Comment — @mention trigger`,
                ``,
                `**Repository:** ${repo}`,
                `**PR:** #${prNumber} "${prTitle}"`,
                `**Comment by:** @${sender}`,
                `**URL:** ${htmlUrl}`,
                ``,
                `### Review Comment`,
                `\`\`\``,
                mentionBody,
                `\`\`\``,
            ].join('\n');
        } else if (event === 'issues') {
            context = [
                `## GitHub Issue — @mention trigger`,
                ``,
                `**Repository:** ${repo}`,
                `**Issue:** #${issueNumber} "${issueTitle}"`,
                `**Opened by:** @${sender}`,
                `**URL:** ${htmlUrl}`,
                payload.issue?.labels?.length
                    ? `**Labels:** ${payload.issue.labels.map(l => l.name).join(', ')}`
                    : '',
                ``,
                `### Issue Body`,
                `\`\`\``,
                mentionBody,
                `\`\`\``,
            ].filter(Boolean).join('\n');
        }

        const instructions = [
            ``,
            `## Instructions`,
            ``,
            `You were @mentioned in the above GitHub ${event === 'issues' ? 'issue' : 'comment'}.`,
            `Analyze the request and respond helpfully.`,
            ``,
            `- Use \`gh\` CLI commands to interact with GitHub (comment, review, etc.)`,
            `- For issue comments: \`gh issue comment ${issueNumber} --repo ${repo} --body "..."\``,
            `- For PR comments: \`gh pr comment ${issueNumber ?? prNumber} --repo ${repo} --body "..."\``,
            `- If code changes are requested, use \`corvid_create_work_task\` to create a work task that will implement the changes on a branch and open a PR.`,
            `- Always leave a response comment on the issue/PR so the person who mentioned you gets a notification.`,
            `- Be concise, helpful, and professional.`,
        ].join('\n');

        return context + instructions;
    }

    /**
     * Generate a short session name from the event.
     */
    private getSessionName(event: string, payload: GitHubWebhookPayload): string {
        const repo = payload.repository.full_name.split('/')[1] ?? payload.repository.full_name;
        if (event === 'issue_comment' || event === 'issues') {
            return `${repo} #${payload.issue?.number ?? '?'}: ${(payload.issue?.title ?? '').slice(0, 40)}`;
        }
        if (event === 'pull_request_review_comment') {
            return `${repo} PR#${payload.pull_request?.number ?? '?'}: ${(payload.pull_request?.title ?? '').slice(0, 40)}`;
        }
        return `${repo}: ${event}`;
    }

    /**
     * Detect if the mention is explicitly requesting code changes
     * (vs. just asking a question / requesting a review).
     */
    private isWorkTaskRequest(body: string): boolean {
        const workKeywords = [
            /\bfix\s+(this|the|that|it)\b/i,
            /\bimplement\s+(this|the|that)\b/i,
            /\bplease\s+(fix|implement|add|create|update|refactor)\b/i,
            /\bcreate\s+a?\s*(pr|pull\s*request)\b/i,
            /\bopen\s+a?\s*(pr|pull\s*request)\b/i,
            /\bmake\s+(this|the|that|these)\s+change/i,
        ];
        return workKeywords.some(pattern => pattern.test(body));
    }

    private emit(event: { type: string; data: unknown }): void {
        for (const cb of this.eventCallbacks) {
            try {
                cb(event as Parameters<WebhookEventCallback>[0]);
            } catch (err) {
                log.error('Webhook event callback error', { error: err instanceof Error ? err.message : String(err) });
            }
        }
    }
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
