import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('OwnerQuestionManager');

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MIN_TIMEOUT_MS = 60_000; // 1 minute
const MAX_TIMEOUT_MS = 600_000; // 10 minutes

export interface OwnerQuestion {
    id: string;
    sessionId: string;
    agentId: string;
    question: string;
    options: string[] | null;
    context: string | null;
    createdAt: string;
    timeoutMs: number;
}

export interface OwnerQuestionResponse {
    questionId: string;
    answer: string;
    selectedOption: number | null;
}

interface PendingQuestion {
    question: OwnerQuestion;
    resolve: (response: OwnerQuestionResponse | null) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class OwnerQuestionManager {
    private pending: Map<string, PendingQuestion> = new Map();
    private db: Database | null = null;

    setDatabase(db: Database): void {
        this.db = db;
    }

    createQuestion(params: {
        sessionId: string;
        agentId: string;
        question: string;
        options?: string[] | null;
        context?: string | null;
        timeoutMs?: number;
    }): Promise<OwnerQuestionResponse | null> {
        const timeoutMs = Math.max(MIN_TIMEOUT_MS, Math.min(params.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));

        const question: OwnerQuestion = {
            id: crypto.randomUUID(),
            sessionId: params.sessionId,
            agentId: params.agentId,
            question: params.question,
            options: params.options ?? null,
            context: params.context ?? null,
            createdAt: new Date().toISOString(),
            timeoutMs,
        };

        this.persistQuestion(question);

        return new Promise<OwnerQuestionResponse | null>((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(question.id);
                this.persistTimeout(question.id);
                log.info(`Owner question ${question.id} timed out after ${timeoutMs}ms`);
                resolve(null);
            }, timeoutMs);

            this.pending.set(question.id, { question, resolve, timer });
            log.debug(`Created owner question ${question.id}`, {
                sessionId: params.sessionId,
                agentId: params.agentId,
                questionPreview: params.question.slice(0, 100),
            });
        });
    }

    resolveQuestion(questionId: string, response: OwnerQuestionResponse): boolean {
        const entry = this.pending.get(questionId);
        if (!entry) {
            log.debug(`Owner question ${questionId} not found (already resolved or timed out)`);
            return false;
        }

        clearTimeout(entry.timer);
        this.pending.delete(questionId);
        this.persistResponse(questionId, response);
        entry.resolve(response);
        log.info(`Resolved owner question ${questionId}`, {
            answerPreview: response.answer.slice(0, 100),
            selectedOption: response.selectedOption,
        });
        return true;
    }

    cancelSession(sessionId: string): void {
        for (const [id, entry] of this.pending) {
            if (entry.question.sessionId === sessionId) {
                clearTimeout(entry.timer);
                this.pending.delete(id);
                this.persistTimeout(id);
                entry.resolve(null);
            }
        }
    }

    getPendingForSession(sessionId: string): OwnerQuestion[] {
        const result: OwnerQuestion[] = [];
        for (const entry of this.pending.values()) {
            if (entry.question.sessionId === sessionId) {
                result.push(entry.question);
            }
        }
        return result;
    }

    shutdown(): void {
        for (const [id, entry] of this.pending) {
            clearTimeout(entry.timer);
            this.persistTimeout(id);
            entry.resolve(null);
        }
        this.pending.clear();
    }

    private persistQuestion(question: OwnerQuestion): void {
        if (!this.db) return;
        try {
            this.db.query(
                `INSERT INTO owner_questions (id, session_id, agent_id, question, options, context, timeout_ms, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                question.id,
                question.sessionId,
                question.agentId,
                question.question,
                question.options ? JSON.stringify(question.options) : null,
                question.context,
                question.timeoutMs,
                question.createdAt,
            );
        } catch (err) {
            log.warn('Failed to persist owner question', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    private persistResponse(questionId: string, response: OwnerQuestionResponse): void {
        if (!this.db) return;
        try {
            this.db.query(
                `UPDATE owner_questions SET status = 'answered', answer = ?, resolved_at = datetime('now') WHERE id = ?`,
            ).run(response.answer, questionId);
        } catch (err) {
            log.warn('Failed to persist owner question response', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    private persistTimeout(questionId: string): void {
        if (!this.db) return;
        try {
            this.db.query(
                `UPDATE owner_questions SET status = 'timeout', resolved_at = datetime('now') WHERE id = ?`,
            ).run(questionId);
        } catch (err) {
            log.warn('Failed to persist owner question timeout', { error: err instanceof Error ? err.message : String(err) });
        }
    }
}
