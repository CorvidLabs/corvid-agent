import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import { listProjects, createProject } from '../db/projects';
import { listAgents, createAgent, updateAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { examCases } from './cases';
import type {
    ExamCase,
    ExamCategory,
    ExamResponse,
    ExamResult,
    ExamScorecard,
} from './types';
import { EXAM_CATEGORIES } from './types';

const log = createLogger('ExamRunner');

const EXAM_PROJECT_NAME = 'Model Exam';
const EXAM_AGENT_NAME = 'Exam Proctor';
const CASE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per case

export class ExamRunner {
    private db: Database;
    private processManager: ProcessManager;

    constructor(db: Database, processManager: ProcessManager) {
        this.db = db;
        this.processManager = processManager;
    }

    private ensureSetup(model: string): { projectId: string; agentId: string } {
        const projects = listProjects(this.db);
        let project = projects.find(p => p.name === EXAM_PROJECT_NAME);
        if (!project) {
            project = createProject(this.db, {
                name: EXAM_PROJECT_NAME,
                workingDir: process.cwd(),
                claudeMd: 'Model competency exam. Follow instructions precisely.',
            });
            log.info('Created exam project', { id: project.id });
        }

        const agents = listAgents(this.db);
        let agent = agents.find(a => a.name === EXAM_AGENT_NAME);
        if (!agent) {
            agent = createAgent(this.db, {
                name: EXAM_AGENT_NAME,
                systemPrompt: 'You are being tested. Follow instructions precisely.',
                model,
                permissionMode: 'full-auto' as const,
                maxBudgetUsd: 5.0,
                algochatEnabled: false,
            });
            log.info('Created exam agent', { id: agent.id });
        } else {
            updateAgent(this.db, agent.id, { model });
        }

        return { projectId: project.id, agentId: agent.id };
    }

    async runExam(model: string, categories?: ExamCategory[]): Promise<ExamScorecard> {
        const startTime = Date.now();
        const { projectId, agentId } = this.ensureSetup(model);

        const casesToRun = categories
            ? examCases.filter(c => categories.includes(c.category))
            : examCases;

        log.info('Starting exam', { model, caseCount: casesToRun.length, categories: categories ?? 'all' });

        const results: ExamResult[] = [];
        for (const examCase of casesToRun) {
            const result = await this.runCase(examCase, projectId, agentId);
            results.push(result);
            log.info(`Case ${examCase.id}: ${result.grade.passed ? 'PASS' : 'FAIL'} (${result.grade.score})`, {
                reason: result.grade.reason,
                durationMs: result.durationMs,
            });
        }

        const scorecard = this.buildScorecard(model, results, Date.now() - startTime);
        log.info('Exam complete', {
            model,
            overall: scorecard.overall,
            durationMs: scorecard.durationMs,
        });

        return scorecard;
    }

    private async runCase(
        examCase: ExamCase,
        projectId: string,
        agentId: string,
    ): Promise<ExamResult> {
        const startTime = Date.now();

        try {
            const response = await this.executeCase(examCase, projectId, agentId);
            const grade = examCase.grade(response);
            return {
                caseId: examCase.id,
                category: examCase.category,
                name: examCase.name,
                grade,
                durationMs: Date.now() - startTime,
            };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            log.error(`Case ${examCase.id} errored`, { error: errorMsg });
            return {
                caseId: examCase.id,
                category: examCase.category,
                name: examCase.name,
                grade: { passed: false, reason: `Runtime error: ${errorMsg}`, score: 0 },
                durationMs: Date.now() - startTime,
            };
        }
    }

    private async executeCase(
        examCase: ExamCase,
        projectId: string,
        agentId: string,
    ): Promise<ExamResponse> {
        // For cases with custom system prompts, temporarily update the agent
        if (examCase.systemPrompt) {
            updateAgent(this.db, agentId, { systemPrompt: examCase.systemPrompt });
        }

        const session = createSession(this.db, {
            projectId,
            agentId,
            name: `Exam: ${examCase.id}`,
            initialPrompt: examCase.prompt,
            source: 'web',
        });

        let contentParts: string[] = [];
        let toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
        let turns = 0;
        let error: string | undefined;
        let resolved = false;

        return new Promise<ExamResponse>((resolve) => {
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve({ content: contentParts.join(''), toolCalls, turns, error: 'Timeout' });
                }
            }, CASE_TIMEOUT_MS);

            const callback = (sid: string, event: ClaudeStreamEvent) => {
                if (sid !== session.id) return;

                switch (event.type) {
                    case 'assistant':
                        if (event.message?.content) {
                            const text = extractContentText(event.message.content);
                            if (text) contentParts.push(text);
                        }
                        turns++;
                        break;

                    case 'tool_status': {
                        // Parse tool name from "[tool_name] Running tool_name..."
                        const match = event.statusMessage?.match(/^\[([^\]]+)\]\s+Running/);
                        if (match) {
                            const toolName = match[1];
                            // Avoid duplicates from the same tool call
                            if (!toolCalls.some(tc => tc.name === toolName && Object.keys(tc.arguments).length === 0)) {
                                toolCalls.push({ name: toolName, arguments: {} });
                            }
                        }
                        break;
                    }

                    case 'error':
                        error = event.error?.message ?? 'Unknown error';
                        break;

                    case 'session_exited':
                    case 'session_stopped':
                    case 'result':
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);

                            // For multi-turn (follow-up) cases, send follow-ups before resolving
                            if (examCase.followUps && examCase.followUps.length > 0 && event.type !== 'result') {
                                // The session just started and delivered initial response —
                                // we need to send follow-ups, but the session has already exited.
                                // Content already captured is from initial prompt.
                            }

                            cleanup();
                            resolve({ content: contentParts.join('\n'), toolCalls, turns, error });
                        }
                        break;
                }
            };

            const cleanup = () => {
                this.processManager.unsubscribe(session.id, callback);
                // Restore default system prompt if we changed it
                if (examCase.systemPrompt) {
                    updateAgent(this.db, agentId, { systemPrompt: 'You are being tested. Follow instructions precisely.' });
                }
            };

            this.processManager.subscribe(session.id, callback);

            // For multi-turn cases, we need to handle follow-ups
            if (examCase.followUps && examCase.followUps.length > 0) {
                this.runMultiTurnCase(session.id, examCase, callback, contentParts, toolCalls, timeout, resolve, () => {
                    resolved = true;
                    cleanup();
                });
            }

            this.processManager.startProcess(session, examCase.prompt);
        });
    }

    private runMultiTurnCase(
        sessionId: string,
        examCase: ExamCase,
        _originalCallback: (sid: string, event: ClaudeStreamEvent) => void,
        contentParts: string[],
        toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
        timeout: ReturnType<typeof setTimeout>,
        resolve: (response: ExamResponse) => void,
        markResolved: () => void,
    ): void {
        if (!examCase.followUps || examCase.followUps.length === 0) return;

        let followUpIndex = 0;
        let waitingForResponse = false;
        let initialResponseReceived = false;

        // Override the callback to handle follow-ups
        const multiTurnCallback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            if (event.type === 'assistant' && event.message?.content) {
                const text = extractContentText(event.message.content);
                if (text) {
                    if (!initialResponseReceived) {
                        // This is the response to the initial prompt — clear it for follow-ups
                        initialResponseReceived = true;
                        contentParts.length = 0; // We only care about the last response for grading
                    }
                    if (waitingForResponse) {
                        contentParts.push(text);
                    }
                }
            }

            // After initial response, send follow-ups
            if ((event.type === 'result' || event.type === 'session_exited') && !initialResponseReceived) {
                initialResponseReceived = true;
                // Session ended after initial prompt — send follow-up via new message
                if (followUpIndex < examCase.followUps!.length) {
                    contentParts.length = 0;
                    waitingForResponse = true;
                    const sent = this.processManager.sendMessage(sessionId, examCase.followUps![followUpIndex]);
                    if (!sent) {
                        // Session already ended, can't send follow-up
                        clearTimeout(timeout);
                        markResolved();
                        resolve({
                            content: contentParts.join('\n'),
                            toolCalls,
                            turns: followUpIndex + 1,
                            error: 'Session ended before follow-ups could be sent',
                        });
                    }
                    followUpIndex++;
                }
            }

            // When we get a response to a follow-up, check if there are more
            if (event.type === 'assistant' && waitingForResponse && initialResponseReceived) {
                waitingForResponse = false;
                if (followUpIndex < examCase.followUps!.length) {
                    waitingForResponse = true;
                    this.processManager.sendMessage(sessionId, examCase.followUps![followUpIndex]);
                    followUpIndex++;
                    contentParts.length = 0; // Only keep last response
                } else {
                    // All follow-ups answered
                    clearTimeout(timeout);
                    markResolved();
                    this.processManager.unsubscribe(sessionId, multiTurnCallback);
                    resolve({
                        content: contentParts.join('\n'),
                        toolCalls,
                        turns: followUpIndex + 1,
                    });
                }
            }
        };

        this.processManager.subscribe(sessionId, multiTurnCallback);
    }

    private buildScorecard(model: string, results: ExamResult[], durationMs: number): ExamScorecard {
        const categories = {} as Record<ExamCategory, { score: number; passed: number; total: number }>;

        for (const cat of EXAM_CATEGORIES) {
            const catResults = results.filter(r => r.category === cat);
            const passed = catResults.filter(r => r.grade.passed).length;
            const total = catResults.length;
            const score = total > 0
                ? Math.round((catResults.reduce((sum, r) => sum + r.grade.score, 0) / total) * 100)
                : 0;
            categories[cat] = { score, passed, total };
        }

        const totalScore = results.length > 0
            ? Math.round((results.reduce((sum, r) => sum + r.grade.score, 0) / results.length) * 100)
            : 0;

        return {
            model,
            timestamp: new Date().toISOString(),
            overall: totalScore,
            categories,
            results,
            durationMs,
        };
    }
}
