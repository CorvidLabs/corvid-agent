/**
 * CursorProvider — first-class LlmProvider wrapping the cursor-agent CLI.
 *
 * Spawns cursor-agent as a subprocess, collects stream-json output, and returns
 * a normalized LlmCompletionResult. Supports concurrency limiting via
 * acquireSlot/releaseSlot.
 *
 * Routes through the standard direct-process path — no special-case in manager.ts.
 * The direct-process agentic loop calls doComplete() which runs cursor-agent to
 * completion (cursor handles its own tool loop internally), then returns the final
 * text. Since no toolCalls are returned, the direct-process loop exits naturally.
 *
 * Issue: #1529, #1547
 */

import type { Agent, Project } from '../../../shared/types';
import { BaseLlmProvider } from '../base';
import type {
    LlmProviderType,
    ExecutionMode,
    LlmCompletionParams,
    LlmCompletionResult,
    LlmProviderInfo,
} from '../types';
import { getModelsForProvider } from '../cost-table';
import {
    hasCursorAccess,
    getCursorBinPath,
    buildArgs,
    readStream,
    describeCursorToolCall,
} from '../../process/cursor-process';
import type { ClaudeStreamEvent } from '../../process/types';
import { createLogger } from '../../lib/logger';

const log = createLogger('CursorProvider');

/** Maximum parallel cursor-agent processes (configurable via env). */
const MAX_PARALLEL = Number(process.env.CURSOR_MAX_PARALLEL) || 2;

/** Timeout for a single cursor-agent completion (ms). */
const COMPLETION_TIMEOUT_MS = 10 * 60_000; // 10 minutes

interface SlotWaiter {
    resolve: (acquired: boolean) => void;
    signal?: AbortSignal;
}

/** Options passed via providerOptions from the direct-process. */
interface CursorProviderOptions {
    sessionId?: string;
    agent?: Agent | null;
    project?: Project;
    worktree?: string;
    worktreeBase?: string;
}

export class CursorProvider extends BaseLlmProvider {
    readonly type: LlmProviderType = 'cursor';
    readonly executionMode: ExecutionMode = 'direct';

    private activeSlots = 0;
    private readonly maxSlots = MAX_PARALLEL;
    private readonly waitQueue: SlotWaiter[] = [];

    /** Track cursor session IDs for --resume on follow-up calls. */
    private cursorSessionIds = new Map<string, string>();

    getInfo(): LlmProviderInfo {
        const models = getModelsForProvider('cursor').map((m) => m.model);
        return {
            type: this.type,
            name: 'Cursor Agent',
            executionMode: this.executionMode,
            models,
            defaultModel: models[0] ?? 'auto',
            supportsTools: true,
            supportsStreaming: false,
        };
    }

    async isAvailable(): Promise<boolean> {
        if (!hasCursorAccess()) return false;

        // Verify version check passes (binary is actually executable)
        try {
            const proc = Bun.spawn([getCursorBinPath(), '--version'], {
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const code = await proc.exited;
            return code === 0;
        } catch {
            return false;
        }
    }

    async acquireSlot(_model: string, signal?: AbortSignal, onStatus?: (msg: string) => void): Promise<boolean> {
        if (signal?.aborted) return false;

        if (this.activeSlots < this.maxSlots) {
            this.activeSlots++;
            return true;
        }

        // Queue the request
        if (onStatus) {
            onStatus(`Queued — ${this.waitQueue.length + 1} waiting (${this.activeSlots}/${this.maxSlots} slots in use)`);
        }

        return new Promise<boolean>((resolve) => {
            const waiter: SlotWaiter = { resolve, signal };
            this.waitQueue.push(waiter);

            if (signal) {
                signal.addEventListener('abort', () => {
                    const idx = this.waitQueue.indexOf(waiter);
                    if (idx >= 0) {
                        this.waitQueue.splice(idx, 1);
                        resolve(false);
                    }
                }, { once: true });
            }
        });
    }

    releaseSlot(_model: string): void {
        this.activeSlots = Math.max(0, this.activeSlots - 1);

        // Clean up any stored cursor session ID for this slot
        // (session cleanup is handled by the caller via providerOptions.sessionId)

        // Wake the next waiter
        while (this.waitQueue.length > 0) {
            const waiter = this.waitQueue.shift()!;
            if (waiter.signal?.aborted) continue;
            this.activeSlots++;
            waiter.resolve(true);
            return;
        }
    }

    /** Clean up stored cursor session ID when a session ends. */
    cleanupSession(sessionId: string): void {
        this.cursorSessionIds.delete(sessionId);
    }

    protected async doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        const binPath = getCursorBinPath();
        const opts = (params.providerOptions ?? {}) as CursorProviderOptions;
        const { sessionId, agent, project, worktree, worktreeBase } = opts;

        // Build the prompt from the last user message
        const lastUserMsg = [...params.messages].reverse().find((m) => m.role === 'user');
        const prompt = lastUserMsg?.content ?? '';

        // Use buildArgs from cursor-process for proper workspace, agent flags, env vars
        const effectiveProject: Project = project ?? {
            id: 'provider-default',
            name: 'Default',
            description: '',
            workingDir: process.cwd(),
            claudeMd: '',
            envVars: {},
            gitUrl: null,
            dirStrategy: 'persistent',
            baseClonePath: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const args = buildArgs(effectiveProject, agent ?? null, worktree, worktreeBase);

        // Add model flag if not already provided by buildArgs (no agent or agent has no model)
        if (!agent?.model && params.model) {
            args.push('--model', params.model);
        }

        // Add system prompt if provided
        if (params.systemPrompt) {
            args.push('--system-prompt', params.systemPrompt);
        }

        // Check if this is a follow-up (resume) call
        const storedCursorSessionId = sessionId ? this.cursorSessionIds.get(sessionId) : undefined;
        if (storedCursorSessionId) {
            args.push('--resume', storedCursorSessionId);
        }

        // Prompt goes as the last positional argument
        if (prompt) {
            args.push(prompt);
        }

        log.info('Starting cursor-agent completion', {
            model: params.model,
            promptLength: prompt.length,
            resume: !!storedCursorSessionId,
            sessionId,
        });

        const startTime = Date.now();

        const proc = Bun.spawn([binPath, ...args], {
            cwd: effectiveProject.workingDir,
            stdin: 'pipe',
            stdout: 'pipe',
            stderr: 'pipe',
            env: {
                ...process.env,
                ...effectiveProject.envVars,
            },
        });

        // Collect output from stream-json events
        let content = '';
        let model = params.model || 'auto';
        let turnToolCallCount = 0;

        const abortHandler = () => {
            try { proc.kill(); } catch { /* already exited */ }
        };
        params.signal?.addEventListener('abort', abortHandler, { once: true });

        // Set up completion timeout
        const timeoutId = setTimeout(() => {
            log.warn('Cursor completion timed out', { model, durationMs: COMPLETION_TIMEOUT_MS });
            try { proc.kill(); } catch { /* already exited */ }
        }, COMPLETION_TIMEOUT_MS);

        try {
            // Forward stream-json events from stdout
            if (proc.stdout) {
                await readStream(proc.stdout, (event: ClaudeStreamEvent) => {
                    const raw = event as unknown as Record<string, unknown>;
                    const type = raw.type as string;

                    // Capture cursor session ID for --resume on follow-up calls
                    if (type === 'system' && typeof raw.session_id === 'string') {
                        if (sessionId) {
                            this.cursorSessionIds.set(sessionId, raw.session_id as string);
                        }
                        log.debug(`Captured cursor session ID: ${raw.session_id}`);
                    }

                    // Text content from content_block_delta events
                    if (type === 'content_block_delta') {
                        const delta = raw.delta as Record<string, unknown> | undefined;
                        if (delta && typeof delta.text === 'string') {
                            content += delta.text;
                            params.onStream?.(delta.text);
                            params.onActivity?.();
                        }
                        return;
                    }

                    // Text content from assistant_message or text events
                    if (type === 'assistant_message' || type === 'text') {
                        const text = raw.content ?? raw.text;
                        if (typeof text === 'string') {
                            content += text;
                            params.onStream?.(text);
                            params.onActivity?.();
                        }
                        return;
                    }

                    // Tool call activity — count for metrics and signal activity
                    if (type === 'tool_call' && (raw as { subtype?: string }).subtype === 'started') {
                        turnToolCallCount++;
                        params.onActivity?.();
                        const toolStatus = describeCursorToolCall(raw);
                        if (toolStatus) {
                            params.onStatus?.(toolStatus);
                        }
                        return;
                    }

                    if (type === 'content_block_start' || type === 'tool_call') {
                        params.onActivity?.();
                    }

                    // Result event — extract model and final content
                    if (type === 'result') {
                        if (typeof raw.model === 'string') {
                            model = raw.model as string;
                        }
                        const resultContent = raw.result;
                        if (typeof resultContent === 'string' && resultContent.length > 0) {
                            content += resultContent;
                        }
                    }
                });
            }

            // Read stderr for diagnostics
            if (proc.stderr) {
                readStream(proc.stderr, (event) => {
                    const message = typeof event === 'object' && event !== null ? JSON.stringify(event) : String(event);
                    log.debug(`cursor-agent stderr: ${typeof message === 'string' ? message.slice(0, 200) : ''}`);
                });
            }

            const exitCode = await proc.exited;
            const durationMs = Date.now() - startTime;

            if (exitCode !== 0 && !params.signal?.aborted) {
                log.warn('cursor-agent exited with non-zero code', { exitCode, model, durationMs });
            }

            log.info('Cursor completion finished', {
                model,
                durationMs,
                contentLength: content.length,
                toolCalls: turnToolCallCount,
                sessionId,
            });

            return {
                content,
                model,
            };
        } finally {
            clearTimeout(timeoutId);
            params.signal?.removeEventListener('abort', abortHandler);
        }
    }
}
