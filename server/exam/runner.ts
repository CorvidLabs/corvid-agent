import type { Database } from 'bun:sqlite';
import { createAgent, listAgents, updateAgent } from '../db/agents';
import { saveExamRun } from '../db/model-exams';
import { createProject, listProjects } from '../db/projects';
import { createSession } from '../db/sessions';
import { isCloudModel } from '../lib/agent-tiers';
import { createLogger } from '../lib/logger';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import { examCases } from './cases';
import type { ExamCase, ExamCategory, ExamResponse, ExamResult, ExamScorecard } from './types';
import { EXAM_CATEGORIES } from './types';

export { isCloudModel } from '../lib/agent-tiers';

const log = createLogger('ExamRunner');

const EXAM_PROJECT_NAME = 'Model Exam';
const EXAM_AGENT_NAME = 'Exam Proctor';
const CASE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes per case
const MIN_MODEL_SIZE_B = 8; // Minimum 8B parameters

/** Parse parameter count in billions from a model name or size string. */
export function parseModelSizeB(input: string): number | null {
  // Match patterns like ":8b", ":14b", ":671b", "4.0B", "14.8B"
  const match = input.match(/[\s:_-](\d+(?:\.\d+)?)\s*[bB](?:[^a-zA-Z]|$)/);
  return match ? parseFloat(match[1]) : null;
}

/** Strip <think>...</think> blocks that some models emit for chain-of-thought reasoning. */
export function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** Detect API error messages that get stored as assistant content. */
export function isApiError(text: string): string | undefined {
  const match = text.match(/^API Error:\s*(\d+)\s*(.*)/s);
  return match ? `API ${match[1]}: ${match[2].slice(0, 100)}` : undefined;
}

function isToolUseBlock(block: unknown): block is { type: 'tool_use'; name: string; input?: Record<string, unknown> } {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    (block as { type: unknown }).type === 'tool_use' &&
    'name' in block &&
    typeof (block as { name: unknown }).name === 'string'
  );
}

/**
 * Extract tool_use blocks from SDK assistant message content.
 * SDK responses include tool calls as content blocks with type: 'tool_use'.
 */
export function extractSdkToolCalls(content: unknown[]): Array<{ name: string; arguments: Record<string, unknown> }> {
  const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  for (const block of content) {
    if (isToolUseBlock(block)) {
      toolCalls.push({ name: block.name, arguments: block.input ?? {} });
    }
  }
  return toolCalls;
}

/**
 * Detect model provider from model name.
 * Exported for testability.
 */
export function detectProvider(model: string): string {
  // Claude models always go through Anthropic
  if (model.startsWith('claude-')) {
    return 'anthropic';
  }
  // Cloud models go through Ollama (proxied to their cloud)
  if (isCloudModel(model)) {
    return 'ollama';
  }
  // Ollama models typically have format "name:tag" (e.g. qwen3:8b, llama3.1:8b)
  // or are known open-source model families
  const ollamaPatterns = [
    /:/, // contains colon (qwen3:8b, llama3:70b, etc.)
    /^(qwen|llama|mistral|gemma|phi|deepseek|codellama|vicuna|orca|neural|solar|yi|command-r|starcoder|minimax|glm|kimi|gpt-oss)/i,
  ];
  if (ollamaPatterns.some((p) => p.test(model))) {
    return 'ollama';
  }
  // Default to ollama for exam (most likely local model testing)
  return 'ollama';
}

/**
 * Build an effective prompt for a follow-up turn, incorporating conversation history.
 * Exported for testability.
 */
export function buildConversationPrompt(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  if (conversationHistory.length === 0) {
    return userMessage;
  }
  const historyText = conversationHistory
    .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
    .join('\n\n');
  return `[Previous conversation]\n${historyText}\n\n[Current message — respond to this]\n${userMessage}`;
}

export class ExamRunner {
  private db: Database;
  private processManager: ProcessManager;

  constructor(db: Database, processManager: ProcessManager) {
    this.db = db;
    this.processManager = processManager;
  }

  private ensureSetup(model: string): { projectId: string; agentId: string } {
    // Detect provider from model name — Ollama models contain ':' or known prefixes
    const provider = this.detectProvider(model);

    const projects = listProjects(this.db);
    let project = projects.find((p) => p.name === EXAM_PROJECT_NAME);
    if (!project) {
      project = createProject(this.db, {
        name: EXAM_PROJECT_NAME,
        workingDir: process.cwd(),
        claudeMd: 'Model competency exam. Follow instructions precisely.',
      });
      log.info('Created exam project', { id: project.id });
    }

    const agents = listAgents(this.db);
    let agent = agents.find((a) => a.name === EXAM_AGENT_NAME);
    if (!agent) {
      agent = createAgent(this.db, {
        name: EXAM_AGENT_NAME,
        systemPrompt: 'You are being tested. Follow instructions precisely.',
        model,
        provider,
        permissionMode: 'full-auto' as const,
        maxBudgetUsd: 5.0,
        algochatEnabled: false,
      });
      log.info('Created exam agent', { id: agent.id, provider });
    } else {
      updateAgent(this.db, agent.id, { model, provider });
    }

    return { projectId: project.id, agentId: agent.id };
  }

  private detectProvider(model: string): string {
    return detectProvider(model);
  }

  /** Query Ollama's /api/show endpoint for model parameter size. */
  private async queryModelSize(model: string): Promise<number | null> {
    try {
      const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
      const response = await fetch(`${host}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { details?: { parameter_size?: string } };
      const sizeStr = data.details?.parameter_size;
      if (!sizeStr) return null;
      return parseModelSizeB(`:${sizeStr}`);
    } catch {
      return null;
    }
  }

  async runExam(model: string, categories?: ExamCategory[], persistDb?: Database): Promise<ExamScorecard> {
    const startTime = Date.now();

    // Enforce minimum model size (cloud models are exempt — they're huge)
    if (!isCloudModel(model)) {
      const sizeFromName = parseModelSizeB(model);
      if (sizeFromName !== null && sizeFromName < MIN_MODEL_SIZE_B) {
        throw new Error(
          `Model "${model}" is ${sizeFromName}B parameters — minimum is ${MIN_MODEL_SIZE_B}B. ` +
            `Small models are too slow and unreliable for agent tasks.`,
        );
      }
      // If we can't parse from name, check Ollama API
      if (sizeFromName === null) {
        const apiSize = await this.queryModelSize(model);
        if (apiSize !== null && apiSize < MIN_MODEL_SIZE_B) {
          throw new Error(
            `Model "${model}" is ${apiSize}B parameters — minimum is ${MIN_MODEL_SIZE_B}B. ` +
              `Small models are too slow and unreliable for agent tasks.`,
          );
        }
      }
    }

    const { projectId, agentId } = this.ensureSetup(model);

    const casesToRun = categories ? examCases.filter((c) => categories.includes(c.category)) : examCases;

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

    // Persist results if a database handle was provided
    if (persistDb) {
      try {
        saveExamRun(persistDb, scorecard);
        log.info('Exam results persisted', { model });
      } catch (err) {
        log.error('Failed to persist exam results', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return scorecard;
  }

  private async runCase(examCase: ExamCase, projectId: string, agentId: string): Promise<ExamResult> {
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

  private async executeCase(examCase: ExamCase, projectId: string, agentId: string): Promise<ExamResponse> {
    // Multi-turn cases need separate sessions per turn (SDK sessions are single-shot)
    if (examCase.followUps && examCase.followUps.length > 0) {
      return this.executeMultiTurnCase(examCase, projectId, agentId);
    }

    return this.executeSingleTurnCase(examCase, projectId, agentId, examCase.prompt);
  }

  /**
   * Execute a multi-turn case by running separate sessions for each turn.
   * SDK sessions end when the model finishes responding, so follow-ups
   * must be sent as new sessions with conversation history in the prompt.
   */
  private async executeMultiTurnCase(examCase: ExamCase, projectId: string, agentId: string): Promise<ExamResponse> {
    const allTurns = [examCase.prompt, ...examCase.followUps!];
    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    let lastResponse: ExamResponse = { content: '', toolCalls: [], turns: 0 };

    for (let i = 0; i < allTurns.length; i++) {
      const userMessage = allTurns[i];

      // Build prompt with conversation history for follow-up turns
      const effectivePrompt = buildConversationPrompt(userMessage, conversationHistory);

      lastResponse = await this.executeSingleTurnCase(examCase, projectId, agentId, effectivePrompt);

      // Record the exchange in history
      conversationHistory.push({ role: 'user', content: userMessage });
      conversationHistory.push({ role: 'assistant', content: lastResponse.content });

      // If there was an error, stop early
      if (lastResponse.error) break;
    }

    return lastResponse;
  }

  private async executeSingleTurnCase(
    examCase: ExamCase,
    projectId: string,
    agentId: string,
    prompt: string,
  ): Promise<ExamResponse> {
    // For cases with custom system prompts, temporarily update the agent
    if (examCase.systemPrompt) {
      updateAgent(this.db, agentId, { systemPrompt: examCase.systemPrompt });
    }

    // Enable algochat for algochat category cases
    const needsAlgochat = examCase.category === 'algochat';
    if (needsAlgochat) {
      updateAgent(this.db, agentId, { algochatEnabled: true });
    }

    // Set tool permissions for cases that specify required tools
    if (examCase.tools && examCase.tools.length > 0) {
      updateAgent(this.db, agentId, { mcpToolPermissions: examCase.tools });
    }

    const session = createSession(this.db, {
      projectId,
      agentId,
      name: `Exam: ${examCase.id}`,
      initialPrompt: prompt,
      source: 'web',
    });

    const contentParts: string[] = [];
    const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
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
              // Extract tool calls from SDK tool_use content blocks
              if (Array.isArray(event.message.content)) {
                toolCalls.push(...extractSdkToolCalls(event.message.content));
              }
            }
            turns++;
            break;

          case 'tool_status': {
            // Parse tool name from "[tool_name] Running tool_name..."
            const match = event.statusMessage?.match(/^\[([^\]]+)\]\s+Running/);
            if (match) {
              const toolName = match[1];
              // Avoid duplicates from the same tool call
              if (!toolCalls.some((tc) => tc.name === toolName && Object.keys(tc.arguments).length === 0)) {
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
              cleanup();
              const rawContent = contentParts.join('\n');
              const content = stripThinkBlocks(rawContent);
              // Detect API errors captured as assistant content
              const apiError = isApiError(content);
              if (apiError && !error) error = apiError;
              resolve({ content: apiError ? '' : content, toolCalls, turns, error });
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
        // Restore algochat if we enabled it
        if (needsAlgochat) {
          updateAgent(this.db, agentId, { algochatEnabled: false });
        }
        // Restore tool permissions if we set them
        if (examCase.tools) {
          updateAgent(this.db, agentId, { mcpToolPermissions: null });
        }
      };

      this.processManager.subscribe(session.id, callback);
      this.processManager.startProcess(session, prompt);
    });
  }

  private buildScorecard(model: string, results: ExamResult[], durationMs: number): ExamScorecard {
    const categories = {} as Record<ExamCategory, { score: number; passed: number; total: number }>;

    for (const cat of EXAM_CATEGORIES) {
      const catResults = results.filter((r) => r.category === cat);
      const passed = catResults.filter((r) => r.grade.passed).length;
      const total = catResults.length;
      const score = total > 0 ? Math.round((catResults.reduce((sum, r) => sum + r.grade.score, 0) / total) * 100) : 0;
      categories[cat] = { score, passed, total };
    }

    const totalScore =
      results.length > 0 ? Math.round((results.reduce((sum, r) => sum + r.grade.score, 0) / results.length) * 100) : 0;

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
