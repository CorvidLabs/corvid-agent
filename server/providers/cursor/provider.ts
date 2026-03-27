/**
 * CursorProvider — first-class LlmProvider wrapping the cursor-agent CLI.
 *
 * Spawns cursor-agent as a subprocess, collects stream-json output, and returns
 * a normalized LlmCompletionResult. Supports concurrency limiting via
 * acquireSlot/releaseSlot.
 *
 * Issue: #1529
 */

import { BaseLlmProvider } from '../base';
import type {
    LlmProviderType,
    ExecutionMode,
    LlmCompletionParams,
    LlmCompletionResult,
    LlmProviderInfo,
} from '../types';
import { getModelsForProvider } from '../cost-table';
import { hasCursorAccess, getCursorBinPath } from '../../process/cursor-process';
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

export class CursorProvider extends BaseLlmProvider {
    readonly type: LlmProviderType = 'cursor';
    readonly executionMode: ExecutionMode = 'direct';

    private activeSlots = 0;
    private readonly maxSlots = MAX_PARALLEL;
    private readonly waitQueue: SlotWaiter[] = [];

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

        // Wake the next waiter
        while (this.waitQueue.length > 0) {
            const waiter = this.waitQueue.shift()!;
            if (waiter.signal?.aborted) continue;
            this.activeSlots++;
            waiter.resolve(true);
            return;
        }
    }

    protected async doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        const binPath = getCursorBinPath();

        // Build the prompt from the last user message
        const lastUserMsg = [...params.messages].reverse().find((m) => m.role === 'user');
        const prompt = lastUserMsg?.content ?? '';

        const args = [
            '--print',
            '--output-format', 'stream-json',
            '--trust',
            '--model', params.model || 'auto',
            '--yolo',
            '--approve-mcps',
        ];

        if (params.systemPrompt) {
            args.push('--system-prompt', params.systemPrompt);
        }

        // Prompt goes as the last positional argument
        args.push(prompt);

        log.info('Starting cursor-agent completion', {
            model: params.model,
            promptLength: prompt.length,
        });

        const startTime = Date.now();

        const proc = Bun.spawn([binPath, ...args], {
            cwd: process.cwd(),
            stdout: 'pipe',
            stderr: 'pipe',
            env: { ...process.env },
        });

        // Collect output from stream-json events
        let content = '';
        let model = params.model || 'auto';

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
            // Parse stream-json events from stdout
            const stdout = proc.stdout;
            if (stdout) {
                const reader = stdout.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        try {
                            const event = JSON.parse(trimmed) as Record<string, unknown>;
                            this.processEvent(event, params, (text) => { content += text; });

                            // Extract model from result event
                            if (event.type === 'result' && typeof event.model === 'string') {
                                model = event.model;
                            }
                        } catch {
                            // Non-JSON output — skip
                        }
                    }
                }
            }

            const exitCode = await proc.exited;
            const durationMs = Date.now() - startTime;

            if (exitCode !== 0 && !params.signal?.aborted) {
                log.warn('cursor-agent exited with non-zero code', { exitCode, model, durationMs });
            }

            log.info('Cursor completion finished', { model, durationMs, contentLength: content.length });

            return {
                content,
                model,
            };
        } finally {
            clearTimeout(timeoutId);
            params.signal?.removeEventListener('abort', abortHandler);
        }
    }

    /**
     * Process a single stream-json event, extracting text content.
     */
    private processEvent(
        event: Record<string, unknown>,
        params: LlmCompletionParams,
        appendContent: (text: string) => void,
    ): void {
        const type = event.type as string;

        // Text content from content_block_delta events
        if (type === 'content_block_delta') {
            const delta = event.delta as Record<string, unknown> | undefined;
            if (delta && typeof delta.text === 'string') {
                appendContent(delta.text);
                params.onStream?.(delta.text);
                params.onActivity?.();
            }
            return;
        }

        // Text content from assistant_message or text events
        if (type === 'assistant_message' || type === 'text') {
            const text = event.content ?? event.text;
            if (typeof text === 'string') {
                appendContent(text);
                params.onStream?.(text);
                params.onActivity?.();
            }
            return;
        }

        // Activity signals for tool calls
        if (type === 'tool_call' || type === 'content_block_start') {
            params.onActivity?.();
        }

        // Result event — may contain final content
        if (type === 'result') {
            const resultContent = event.result as string | undefined;
            if (typeof resultContent === 'string' && resultContent.length > 0) {
                appendContent(resultContent);
            }
        }
    }
}
