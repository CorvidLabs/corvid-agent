/**
 * Cursor Agent CLI process spawner.
 *
 * Spawns the `cursor-agent` CLI binary with stream-json I/O. The prompt is
 * passed as a positional CLI argument (not stdin). Follow-up messages spawn
 * a new process with --resume <cursorSessionId> to continue the conversation.
 *
 * Key CLI flags:
 *   --print              headless mode (non-interactive)
 *   --output-format      stream-json for structured events
 *   --model <id>         model selection (e.g. auto, gpt-5.4-medium)
 *   --workspace <path>   working directory
 *   --force / --yolo     auto-approve all tool calls
 *   --trust              trust workspace without prompting (headless)
 *   --worktree [name]    git worktree isolation
 *   --approve-mcps       auto-approve MCP servers
 */

import type { Agent, Project, Session } from '../../shared/types';
import { createLogger } from '../lib/logger';
import type { SdkProcess } from './sdk-process';
import type { ClaudeStreamEvent, DirectProcessMetrics, SessionTurnMetricsEvent } from './types';

const log = createLogger('CursorProcess');

const DEFAULT_CURSOR_BIN = `${process.env.HOME}/.local/bin/cursor-agent`;
const CURSOR_BIN = process.env.CURSOR_AGENT_BIN || Bun.which('cursor-agent') || DEFAULT_CURSOR_BIN;

export interface CursorProcessOptions {
  session: Session;
  project: Project;
  agent: Agent | null;
  prompt: string;
  onEvent: (event: ClaudeStreamEvent) => void;
  onExit: (code: number | null, errorMessage?: string) => void;
  worktree?: string;
  worktreeBase?: string;
}

export function hasCursorAccess(): boolean {
  try {
    const stat = Bun.file(CURSOR_BIN);
    return stat.size > 0;
  } catch {
    return false;
  }
}

export function getCursorBinPath(): string {
  return CURSOR_BIN;
}

// ── Exit code classification (issue #1531) ──────────────────────────────────

/**
 * Result of classifying a cursor-agent exit code + stderr output.
 *
 * `transient` signals whether the caller should retry (e.g. via FallbackManager)
 * or surface the error immediately.
 */
export interface CursorErrorClassification {
  /** True if the error is likely temporary and the request should be retried. */
  transient: boolean;
  /** Human-readable error description for logging / surfacing. */
  message: string;
  /** Machine-readable error category. */
  category: CursorErrorCategory;
}

export type CursorErrorCategory =
  | 'success'
  | 'invalid_args'
  | 'auth_failure'
  | 'invalid_model'
  | 'config_error'
  | 'network_timeout'
  | 'rate_limit'
  | 'network_error'
  | 'stream_idle_timeout'
  | 'general_error'
  | 'unknown';

/**
 * Exit-code-to-category mapping for known cursor-agent exit codes.
 *
 * Exit code 0 = success, 2 = invalid arguments (permanent).
 * Exit code 1 is ambiguous — stderr is examined to disambiguate.
 */
export const CURSOR_EXIT_CODE_MAP: Record<
  number,
  { category: CursorErrorCategory; transient: boolean; message: string }
> = {
  0: { category: 'success', transient: false, message: 'Success' },
  2: { category: 'invalid_args', transient: false, message: 'Invalid arguments — check CLI flags' },
  126: { category: 'config_error', transient: false, message: 'Binary not executable — check permissions' },
  127: { category: 'config_error', transient: false, message: 'Binary not found — check CURSOR_AGENT_BIN' },
  130: { category: 'general_error', transient: false, message: 'Process interrupted (SIGINT)' },
  137: { category: 'general_error', transient: true, message: 'Process killed (SIGKILL) — possible OOM or timeout' },
  143: { category: 'general_error', transient: true, message: 'Process terminated (SIGTERM)' },
};

/** Stderr patterns that indicate transient (retryable) failures. */
const TRANSIENT_STDERR_PATTERNS: Array<{ pattern: RegExp; category: CursorErrorCategory; message: string }> = [
  { pattern: /ECONNRESET/i, category: 'network_error', message: 'Connection reset — transient network failure' },
  { pattern: /ETIMEDOUT/i, category: 'network_timeout', message: 'Connection timed out — transient network failure' },
  { pattern: /ECONNREFUSED/i, category: 'network_error', message: 'Connection refused — service may be starting up' },
  { pattern: /EPIPE/i, category: 'network_error', message: 'Broken pipe — transient network failure' },
  { pattern: /rate.?limit/i, category: 'rate_limit', message: 'Rate limited — back off and retry' },
  { pattern: /429/, category: 'rate_limit', message: 'Rate limited (HTTP 429) — back off and retry' },
  { pattern: /503/, category: 'network_error', message: 'Service unavailable (HTTP 503) — transient' },
  { pattern: /502/, category: 'network_error', message: 'Bad gateway (HTTP 502) — transient' },
  { pattern: /timeout/i, category: 'network_timeout', message: 'Request timed out — transient' },
  { pattern: /overloaded/i, category: 'rate_limit', message: 'Server overloaded — transient' },
  { pattern: /fetch.?failed/i, category: 'network_error', message: 'Network fetch failed — transient' },
  { pattern: /network.?error/i, category: 'network_error', message: 'Network error — transient' },
];

/** Stderr patterns that indicate permanent (non-retryable) failures. */
const PERMANENT_STDERR_PATTERNS: Array<{ pattern: RegExp; category: CursorErrorCategory; message: string }> = [
  {
    pattern: /auth(entication|orization)?.?(fail|error|denied|invalid)/i,
    category: 'auth_failure',
    message: 'Authentication failed — check credentials',
  },
  { pattern: /invalid.?api.?key/i, category: 'auth_failure', message: 'Invalid API key' },
  { pattern: /unauthorized/i, category: 'auth_failure', message: 'Unauthorized — check API key or token' },
  { pattern: /forbidden/i, category: 'auth_failure', message: 'Forbidden — insufficient permissions' },
  { pattern: /invalid.?model/i, category: 'invalid_model', message: 'Invalid model — model not available' },
  { pattern: /model.?not.?found/i, category: 'invalid_model', message: 'Model not found' },
  { pattern: /unknown.?model/i, category: 'invalid_model', message: 'Unknown model identifier' },
  { pattern: /invalid.?config/i, category: 'config_error', message: 'Invalid configuration' },
];

/**
 * Classify a cursor-agent exit code and stderr output into transient/permanent.
 *
 * The FallbackManager uses the `transient` flag to decide whether to retry
 * with the next provider in the chain or surface the error immediately.
 *
 * Classification priority:
 * 1. Known exit codes with unambiguous meaning (2, 126, 127)
 * 2. Permanent stderr patterns (auth, model, config errors)
 * 3. Transient stderr patterns (network, rate limit, timeout)
 * 4. Exit code 1 with no matching patterns → general_error (non-transient)
 * 5. Null exit code → process crashed, treated as transient
 */
export function classifyCursorError(exitCode: number | null, stderr: string = ''): CursorErrorClassification {
  // Exit code 0 is success
  if (exitCode === 0) {
    return { transient: false, message: 'Success', category: 'success' };
  }

  // Known exit codes with unambiguous meaning
  if (exitCode !== null && exitCode !== 1 && CURSOR_EXIT_CODE_MAP[exitCode]) {
    return CURSOR_EXIT_CODE_MAP[exitCode];
  }

  // Check permanent stderr patterns first (more specific → fail fast)
  for (const { pattern, category, message } of PERMANENT_STDERR_PATTERNS) {
    if (pattern.test(stderr)) {
      return { transient: false, message, category };
    }
  }

  // Check transient stderr patterns
  for (const { pattern, category, message } of TRANSIENT_STDERR_PATTERNS) {
    if (pattern.test(stderr)) {
      return { transient: true, message, category };
    }
  }

  // Null exit code → process didn't exit normally (crashed/killed externally)
  if (exitCode === null) {
    return { transient: true, message: 'Process exited abnormally — possible crash', category: 'unknown' };
  }

  // Exit code 1 with no matching stderr → ambiguous, default non-transient
  if (exitCode === 1) {
    const stderrSnippet = stderr.trim().slice(0, 200);
    return {
      transient: false,
      message: stderrSnippet ? `cursor-agent error: ${stderrSnippet}` : 'cursor-agent exited with error code 1',
      category: 'general_error',
    };
  }

  // Unknown non-zero exit code
  return {
    transient: false,
    message: `cursor-agent exited with code ${exitCode}`,
    category: 'unknown',
  };
}

/** Stream idle timeout (120s) — kills process if no output for this duration. */
export const STREAM_IDLE_TIMEOUT_MS = 120_000;

export function spawnCursorProcess(options: CursorProcessOptions): SdkProcess {
  const { session, project, agent, prompt, onEvent, onExit, worktree, worktreeBase } = options;

  const baseArgs = buildArgs(project, agent, worktree, worktreeBase);

  // cursor-agent takes the prompt as a positional argument after all flags
  const spawnArgs = [...baseArgs];
  if (prompt) {
    spawnArgs.push(prompt);
  }

  log.info(`Spawning cursor-agent for session ${session.id}`, {
    cwd: project.workingDir,
    model: agent?.model,
    args: spawnArgs.join(' ').slice(0, 200),
    bin: CURSOR_BIN,
  });

  let currentProc = Bun.spawn([CURSOR_BIN, ...spawnArgs], {
    cwd: project.workingDir,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      ...project.envVars,
    },
  });

  const pid = currentProc.pid;
  let cursorSessionId: string | null = null;
  let killed = false;
  /** Tool calls started in the current cursor-agent turn (for metrics parity). */
  let turnToolCallCount = 0;
  /** Collected stderr output for error classification (#1531). */
  let stderrBuffer = '';
  /** Stream idle timeout handle — kills process if no stdout for STREAM_IDLE_TIMEOUT_MS. */
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function resetIdleTimer(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!killed) {
        log.warn(`Stream idle timeout (${STREAM_IDLE_TIMEOUT_MS}ms) for session ${session.id} — killing process`);
        killed = true;
        try {
          currentProc.kill();
        } catch {
          /* already exited */
        }
        const classification = classifyCursorError(null, 'stream idle timeout');
        onExit(null, `[cursor:${classification.category}:transient] ${classification.message}`);
      }
    }, STREAM_IDLE_TIMEOUT_MS);
  }

  resetIdleTimer();

  function forwardCursorStdoutEvent(event: ClaudeStreamEvent): void {
    // Reset idle timer on any stdout activity (#1531)
    resetIdleTimer();

    // Capture the cursor-agent session ID from the init event for --resume
    if (event.type === 'system' && 'session_id' in event && typeof event.session_id === 'string') {
      cursorSessionId = event.session_id as string;
      log.debug(`Captured cursor session ID: ${cursorSessionId}`);
    }

    // cursor-agent emits `result` after each turn. Forwarding them unsubscribes
    // Discord/work listeners early. Instead: end-of-turn markers + internal metrics.
    if (event.type === 'result') {
      log.debug('Filtering cursor-agent result event (will use session_exited instead)', {
        sessionId: session.id,
        subtype: event.subtype,
      });
      onEvent({ type: 'message_stop' } as ClaudeStreamEvent);
      const raw = event as unknown as Record<string, unknown>;
      const metrics = mapCursorResultToTurnMetrics(raw, agent, turnToolCallCount);
      turnToolCallCount = 0;
      const costTurns = extractCursorCostAndTurns(raw);
      onEvent({
        type: 'session_turn_metrics',
        metrics,
        ...costTurns,
      } as SessionTurnMetricsEvent);
      return;
    }

    const rawType = (event as { type: string }).type;
    if (rawType === 'tool_call' && (event as { subtype?: string }).subtype === 'started') {
      turnToolCallCount++;
      // Match Claude SDK / direct-process so stall detection & dashboards see tool use.
      onEvent({
        type: 'content_block_start',
        content_block: { type: 'tool_use' },
      } as ClaudeStreamEvent);
      const toolStatus = describeCursorToolCall(event);
      if (toolStatus) {
        onEvent({ type: 'tool_status', statusMessage: toolStatus } as ClaudeStreamEvent);
      }
    }

    onEvent(event);
  }

  readStream(currentProc.stdout, forwardCursorStdoutEvent);

  readStream(currentProc.stderr, (event) => {
    const message = typeof event === 'object' && event !== null ? JSON.stringify(event) : String(event);
    if (typeof message === 'string') {
      stderrBuffer += `${message}\n`;
    }
    log.debug(`cursor-agent stderr: ${typeof message === 'string' ? message.slice(0, 200) : ''}`);
  });

  currentProc.exited
    .then((code) => {
      if (idleTimer) clearTimeout(idleTimer);
      if (!killed) {
        if (code !== 0) {
          const classification = classifyCursorError(code, stderrBuffer);
          const tag = classification.transient ? 'transient' : 'permanent';
          log.warn(`cursor-agent exit classified`, {
            exitCode: code,
            category: classification.category,
            transient: classification.transient,
          });
          onExit(code, `[cursor:${classification.category}:${tag}] ${classification.message}`);
        } else {
          onExit(code);
        }
      }
    })
    .catch((err) => {
      if (idleTimer) clearTimeout(idleTimer);
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`Cursor process exit rejected for session ${session.id}`, { error: errorMsg });
      if (!killed) {
        const classification = classifyCursorError(1, errorMsg);
        const tag = classification.transient ? 'transient' : 'permanent';
        onExit(1, `[cursor:${classification.category}:${tag}] ${classification.message}`);
      }
    });

  /**
   * Send a follow-up message by spawning a new cursor-agent process with
   * --resume to continue the same conversation.
   */
  function sendMessage(content: string | unknown[]): boolean {
    const text =
      typeof content === 'string'
        ? content
        : (content as Array<{ type: string; text?: string }>)
            .filter((b) => b.type === 'text' && b.text)
            .map((b) => b.text)
            .join('\n');

    if (!text) return false;

    if (!cursorSessionId) {
      log.warn(`Cannot send follow-up: no cursor session ID captured yet for session ${session.id}`);
      return false;
    }

    const resumeArgs = [...baseArgs, '--resume', cursorSessionId, text];

    log.info(`Resuming cursor-agent for session ${session.id}`, {
      cursorSessionId,
      content: text.slice(0, 80),
    });

    currentProc = Bun.spawn([CURSOR_BIN, ...resumeArgs], {
      cwd: project.workingDir,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        ...project.envVars,
      },
    });

    // Reset stderr buffer and idle timer for the new process
    stderrBuffer = '';
    resetIdleTimer();

    readStream(currentProc.stdout, forwardCursorStdoutEvent);
    readStream(currentProc.stderr, (event) => {
      const message = typeof event === 'object' && event !== null ? JSON.stringify(event) : String(event);
      if (typeof message === 'string') {
        stderrBuffer += `${message}\n`;
      }
      log.debug(`cursor-agent stderr (resume): ${typeof message === 'string' ? message.slice(0, 200) : ''}`);
    });

    currentProc.exited
      .then((code) => {
        if (idleTimer) clearTimeout(idleTimer);
        if (!killed) {
          if (code !== 0) {
            const classification = classifyCursorError(code, stderrBuffer);
            const tag = classification.transient ? 'transient' : 'permanent';
            onExit(code, `[cursor:${classification.category}:${tag}] ${classification.message}`);
          } else {
            onExit(code);
          }
        }
      })
      .catch((err) => {
        if (idleTimer) clearTimeout(idleTimer);
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (!killed) {
          const classification = classifyCursorError(1, errorMsg);
          const tag = classification.transient ? 'transient' : 'permanent';
          onExit(1, `[cursor:${classification.category}:${tag}] ${classification.message}`);
        }
      });

    return true;
  }

  function kill(): void {
    killed = true;
    if (idleTimer) clearTimeout(idleTimer);
    try {
      currentProc.kill();
    } catch {
      // Process may have already exited
    }
  }

  function isAlive(): boolean {
    return !killed;
  }

  return { pid, sendMessage, kill, isAlive };
}

export function buildArgs(project: Project, agent: Agent | null, worktree?: string, worktreeBase?: string): string[] {
  const args: string[] = [
    '--print',
    '--output-format',
    'stream-json',
    '--stream-partial-output', // Stream text deltas for real-time output
    '--trust',
  ];

  if (project.workingDir) {
    args.push('--workspace', project.workingDir);
  }

  if (worktree) {
    args.push('--worktree', worktree);
    if (worktreeBase) {
      args.push('--worktree-base', worktreeBase);
    }
  }

  if (agent) {
    if (agent.model) {
      args.push('--model', agent.model);
    }
    if (agent.permissionMode === 'full-auto') {
      args.push('--yolo');
    }
    args.push('--approve-mcps');

    if (agent.customFlags) {
      for (const [key, value] of Object.entries(agent.customFlags)) {
        if (value === 'true' || value === '') {
          args.push(`--${key}`);
        } else {
          args.push(`--${key}`, value);
        }
      }
    }
  }

  return args;
}

/**
 * Extract a human-readable description from a cursor-agent tool_call event.
 * Returns e.g. "Reading package.json" or "Running: git status"
 */
export function describeCursorToolCall(event: any): string | null {
  const tc = event.tool_call;
  if (!tc || typeof tc !== 'object') return null;

  if (tc.readToolCall) {
    const path = tc.readToolCall.args?.path;
    return path ? `Reading ${basename(path)}` : 'Reading file';
  }
  if (tc.writeToolCall) {
    const path = tc.writeToolCall.args?.path;
    return path ? `Writing ${basename(path)}` : 'Writing file';
  }
  if (tc.editToolCall) {
    const path = tc.editToolCall.args?.path;
    return path ? `Editing ${basename(path)}` : 'Editing file';
  }
  if (tc.shellToolCall || tc.terminalToolCall) {
    const cmd = (tc.shellToolCall ?? tc.terminalToolCall)?.args?.command;
    return cmd ? `Running: ${cmd.slice(0, 60)}` : 'Running command';
  }
  if (tc.globToolCall || tc.listFilesToolCall) {
    return 'Listing files';
  }
  if (tc.grepToolCall || tc.searchToolCall) {
    const pattern = (tc.grepToolCall ?? tc.searchToolCall)?.args?.pattern;
    return pattern ? `Searching: ${pattern.slice(0, 50)}` : 'Searching files';
  }

  const toolName = Object.keys(tc)[0]?.replace(/ToolCall$/, '');
  return toolName ? `Using ${toolName}` : null;
}

function basename(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

export function extractCursorCostAndTurns(
  raw: Record<string, unknown>,
): Pick<SessionTurnMetricsEvent, 'total_cost_usd' | 'num_turns'> {
  const out: Pick<SessionTurnMetricsEvent, 'total_cost_usd' | 'num_turns'> = {};
  if (typeof raw.total_cost_usd === 'number') out.total_cost_usd = raw.total_cost_usd;
  if (typeof raw.num_turns === 'number') out.num_turns = raw.num_turns;
  return out;
}

export function isDirectProcessMetricsShape(v: unknown): v is DirectProcessMetrics {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return typeof m.model === 'string' && typeof m.tier === 'string' && typeof m.totalIterations === 'number';
}

export function mapCursorResultToTurnMetrics(
  raw: Record<string, unknown>,
  agent: Agent | null,
  turnToolCallCount: number,
): DirectProcessMetrics {
  const nested = raw.metrics;
  if (isDirectProcessMetricsShape(nested)) {
    return {
      ...nested,
      toolCallCount: Math.max(nested.toolCallCount ?? 0, turnToolCallCount),
    };
  }
  const model = (typeof raw.model === 'string' && raw.model) || agent?.model || 'cursor';
  const numTurns = typeof raw.num_turns === 'number' ? raw.num_turns : 1;
  const durationMs = typeof raw.duration_ms === 'number' ? raw.duration_ms : 0;
  return {
    model,
    tier: 'unknown',
    totalIterations: numTurns,
    toolCallCount: turnToolCallCount,
    maxChainDepth: 0,
    nudgeCount: 0,
    midChainNudgeCount: 0,
    explorationDriftCount: 0,
    stallDetected: false,
    stallType: null,
    terminationReason: 'normal',
    durationMs,
    needsSummary: false,
    totalLowQualityResponses: 0,
    totalVacuousToolCalls: 0,
    qualityNudgeCount: 0,
  };
}

export async function readStream(
  stream: ReadableStream<Uint8Array> | null,
  onEvent: (event: ClaudeStreamEvent) => void,
): Promise<void> {
  if (!stream) return;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
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
          const event = JSON.parse(trimmed) as ClaudeStreamEvent;
          log.debug('cursor-agent event', { type: event.type, subtype: event.subtype });
          onEvent(event);
        } catch {
          // Non-JSON output (spinners, progress bars) — skip silently
        }
      }
    }
  } catch (err) {
    log.debug('Cursor process stream ended', { error: err instanceof Error ? err.message : String(err) });
  }
}
