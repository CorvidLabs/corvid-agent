/**
 * BuddyService — orchestrates paired agent collaboration.
 *
 * When buddy mode is active on a task, the lead agent does its work
 * then the buddy reviews/assists. They go back and forth for up to
 * maxRounds. The final output comes from the lead agent.
 *
 * This is intentionally lightweight vs councils — no voting, no
 * synthesis stages, just a simple request-response loop.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { BuddySession, CreateBuddySessionInput } from '../../shared/types/buddy';
import type { Session } from '../../shared/types/sessions';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import {
    createBuddySession,
    updateBuddySessionStatus,
    addBuddyMessage,
    getBuddySession,
} from '../db/buddy';
import { getAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import { createLogger } from '../lib/logger';

const log = createLogger('BuddyService');

const DEFAULT_MAX_ROUNDS = 3;

export interface BuddyServiceDeps {
    db: Database;
    processManager: ProcessManager;
}

export class BuddyService {
    private db: Database;
    private processManager: ProcessManager;
    private sessionUpdateListeners = new Set<(session: BuddySession) => void>();

    constructor(deps: BuddyServiceDeps) {
        this.db = deps.db;
        this.processManager = deps.processManager;
    }

    /** Register a callback for buddy session updates (for WS broadcast). */
    onSessionUpdate(cb: (session: BuddySession) => void): () => void {
        this.sessionUpdateListeners.add(cb);
        return () => { this.sessionUpdateListeners.delete(cb); };
    }

    private emitSessionUpdate(sessionId: string): void {
        const session = getBuddySession(this.db, sessionId);
        if (!session) return;
        for (const cb of this.sessionUpdateListeners) {
            try { cb(session); } catch { /* ignore */ }
        }
    }

    /**
     * Start a buddy session. This creates the session record and kicks off
     * the first round by having the lead agent process the prompt.
     *
     * Returns the buddy session immediately — rounds run asynchronously.
     */
    async startSession(input: CreateBuddySessionInput): Promise<BuddySession> {
        const leadAgent = getAgent(this.db, input.leadAgentId);
        const buddyAgent = getAgent(this.db, input.buddyAgentId);
        if (!leadAgent) throw new Error(`Lead agent not found: ${input.leadAgentId}`);
        if (!buddyAgent) throw new Error(`Buddy agent not found: ${input.buddyAgentId}`);

        const session = createBuddySession(this.db, {
            ...input,
            maxRounds: input.maxRounds ?? DEFAULT_MAX_ROUNDS,
        });

        log.info('Buddy session started', {
            sessionId: session.id,
            lead: leadAgent.name,
            buddy: buddyAgent.name,
            maxRounds: session.maxRounds,
            source: session.source,
        });

        // Run the conversation loop asynchronously
        this.runConversationLoop(session.id).catch((err) => {
            log.error('Buddy conversation loop failed', {
                sessionId: session.id,
                error: err instanceof Error ? err.message : String(err),
            });
            updateBuddySessionStatus(this.db, session.id, 'failed');
            this.emitSessionUpdate(session.id);
        });

        return session;
    }

    /**
     * Run the back-and-forth conversation between lead and buddy.
     * Each round: lead produces output → buddy reviews → repeat.
     */
    private async runConversationLoop(buddySessionId: string): Promise<void> {
        const session = getBuddySession(this.db, buddySessionId);
        if (!session) return;

        const leadAgent = getAgent(this.db, session.leadAgentId);
        const buddyAgent = getAgent(this.db, session.buddyAgentId);
        if (!leadAgent || !buddyAgent) {
            updateBuddySessionStatus(this.db, buddySessionId, 'failed');
            return;
        }

        // Round 1: Lead agent processes the original prompt
        let lastLeadOutput = await this.runAgentTurn(
            buddySessionId,
            session.leadAgentId,
            'lead',
            1,
            session.prompt,
        );

        if (!lastLeadOutput) {
            updateBuddySessionStatus(this.db, buddySessionId, 'failed');
            this.emitSessionUpdate(buddySessionId);
            return;
        }

        // Buddy review rounds
        for (let round = 1; round <= session.maxRounds; round++) {
            updateBuddySessionStatus(this.db, buddySessionId, 'active', round);
            this.emitSessionUpdate(buddySessionId);

            // Buddy reviews lead's output
            const buddyPrompt = this.buildBuddyReviewPrompt(
                session.prompt,
                leadAgent.name,
                buddyAgent.name,
                lastLeadOutput,
                round,
                session.maxRounds,
            );

            const buddyOutput = await this.runAgentTurn(
                buddySessionId,
                session.buddyAgentId,
                'buddy',
                round,
                buddyPrompt,
            );

            if (!buddyOutput) {
                log.warn('Buddy agent failed to respond, using lead output', {
                    sessionId: buddySessionId,
                    round,
                });
                break;
            }

            // Check if buddy says "LGTM" / approves — stop early
            if (this.isApproval(buddyOutput)) {
                log.info('Buddy approved — ending early', { sessionId: buddySessionId, round });
                break;
            }

            // If this is the last round, don't loop back to lead
            if (round >= session.maxRounds) break;

            // Lead incorporates buddy feedback
            const leadPrompt = this.buildLeadRevisionPrompt(
                session.prompt,
                buddyAgent.name,
                buddyOutput,
                round + 1,
            );

            lastLeadOutput = await this.runAgentTurn(
                buddySessionId,
                session.leadAgentId,
                'lead',
                round + 1,
                leadPrompt,
            );

            if (!lastLeadOutput) {
                log.warn('Lead agent failed on revision round', {
                    sessionId: buddySessionId,
                    round: round + 1,
                });
                break;
            }
        }

        updateBuddySessionStatus(this.db, buddySessionId, 'completed');
        this.emitSessionUpdate(buddySessionId);
        log.info('Buddy session completed', { sessionId: buddySessionId });
    }

    /**
     * Run a single agent turn — create a conversation-only session,
     * capture the output, and record it as a buddy message.
     */
    private async runAgentTurn(
        buddySessionId: string,
        agentId: string,
        role: 'lead' | 'buddy',
        round: number,
        prompt: string,
    ): Promise<string | null> {
        const agent = getAgent(this.db, agentId);
        if (!agent) return null;

        // Create a lightweight session for this turn
        const agentSession = createSession(this.db, {
            agentId,
            projectId: agent.defaultProjectId ?? undefined,
            name: `buddy:${buddySessionId}:${role}:r${round}`,
            initialPrompt: prompt,
            source: 'algochat',
        });

        try {
            const output = await this.captureSessionOutput(agentSession, prompt);
            if (output) {
                addBuddyMessage(this.db, buddySessionId, agentId, round, role, output);
            }
            return output;
        } catch (err) {
            log.error('Agent turn failed', {
                buddySessionId,
                agentId,
                role,
                round,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    /**
     * Start a session process and capture its full text output.
     */
    private captureSessionOutput(session: Session, prompt: string): Promise<string | null> {
        return new Promise((resolve) => {
            const chunks: string[] = [];
            let resolved = false;

            const callback = (sid: string, event: ClaudeStreamEvent) => {
                if (sid !== session.id) return;

                if (event.type === 'assistant' && event.message?.content) {
                    const text = extractContentText(event.message.content);
                    if (text) chunks.push(text);
                }
                if (event.type === 'result') {
                    resolved = true;
                    this.processManager.unsubscribe(session.id, callback);
                    const text = event.result ? extractContentText(event.result) : '';
                    if (text) chunks.push(text);
                    resolve(chunks.join('') || null);
                }
            };

            this.processManager.subscribe(session.id, callback);

            this.processManager.startProcess(session, prompt, { conversationOnly: true });

            // Safety timeout: 5 minutes per turn
            setTimeout(() => {
                if (!resolved) {
                    this.processManager.unsubscribe(session.id, callback);
                    this.processManager.stopProcess(session.id);
                    resolve(chunks.join('') || null);
                }
            }, 5 * 60 * 1000);
        });
    }

    private buildBuddyReviewPrompt(
        originalPrompt: string,
        leadName: string,
        buddyName: string,
        leadOutput: string,
        round: number,
        maxRounds: number,
    ): string {
        return [
            `You are ${buddyName}, acting as a buddy reviewer for ${leadName}.`,
            ``,
            `## Original Task`,
            originalPrompt,
            ``,
            `## ${leadName}'s Output (Round ${round}/${maxRounds})`,
            leadOutput.slice(0, 8000),
            ``,
            `## Your Role`,
            `Review the output above. If it looks good, respond with "LGTM" or "Approved".`,
            `If you see issues, suggest specific improvements. Be concise and actionable.`,
            `Focus on correctness, completeness, and quality — not style preferences.`,
        ].join('\n');
    }

    private buildLeadRevisionPrompt(
        originalPrompt: string,
        buddyName: string,
        buddyFeedback: string,
        round: number,
    ): string {
        return [
            `Your buddy ${buddyName} reviewed your work and has feedback.`,
            ``,
            `## Original Task`,
            originalPrompt,
            ``,
            `## Buddy Feedback`,
            buddyFeedback.slice(0, 8000),
            ``,
            `## Instructions`,
            `Address the feedback above. This is revision round ${round}.`,
            `Produce your updated output. If you disagree with the feedback, explain why.`,
        ].join('\n');
    }

    private isApproval(output: string): boolean {
        const lower = output.toLowerCase().trim();
        const approvalPhrases = ['lgtm', 'looks good to me', 'approved', 'no issues', 'ship it'];
        // Check if the output is short and contains an approval phrase
        if (lower.length < 200) {
            return approvalPhrases.some((phrase) => lower.includes(phrase));
        }
        // For longer outputs, check the first line
        const firstLine = lower.split('\n')[0];
        return approvalPhrases.some((phrase) => firstLine.includes(phrase));
    }
}
