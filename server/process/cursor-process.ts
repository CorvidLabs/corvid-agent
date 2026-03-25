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

  function forwardCursorStdoutEvent(event: ClaudeStreamEvent): void {
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
    log.debug(`cursor-agent stderr: ${typeof message === 'string' ? message.slice(0, 200) : ''}`);
  });

  currentProc.exited
    .then((code) => {
      if (!killed) {
        onExit(code);
      }
    })
    .catch((err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`Cursor process exit rejected for session ${session.id}`, { error: errorMsg });
      if (!killed) {
        onExit(1, errorMsg);
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

    readStream(currentProc.stdout, forwardCursorStdoutEvent);
    readStream(currentProc.stderr, (event) => {
      const message = typeof event === 'object' && event !== null ? JSON.stringify(event) : String(event);
      log.debug(`cursor-agent stderr (resume): ${typeof message === 'string' ? message.slice(0, 200) : ''}`);
    });

    currentProc.exited
      .then((code) => {
        if (!killed) {
          onExit(code);
        }
      })
      .catch((err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (!killed) {
          onExit(1, errorMsg);
        }
      });

    return true;
  }

  function kill(): void {
    killed = true;
    try {
      currentProc.kill();
    } catch {
      // Process may have already exited
    }
  }

  return { pid, sendMessage, kill };
}

function buildArgs(project: Project, agent: Agent | null, worktree?: string, worktreeBase?: string): string[] {
  const args: string[] = ['--print', '--output-format', 'stream-json', '--trust'];

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
// biome-ignore lint/suspicious/noExplicitAny: cursor-agent tool_call shape is dynamic
function describeCursorToolCall(event: any): string | null {
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

function extractCursorCostAndTurns(raw: Record<string, unknown>): Pick<SessionTurnMetricsEvent, 'total_cost_usd' | 'num_turns'> {
  const out: Pick<SessionTurnMetricsEvent, 'total_cost_usd' | 'num_turns'> = {};
  if (typeof raw.total_cost_usd === 'number') out.total_cost_usd = raw.total_cost_usd;
  if (typeof raw.num_turns === 'number') out.num_turns = raw.num_turns;
  return out;
}

function isDirectProcessMetricsShape(v: unknown): v is DirectProcessMetrics {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return typeof m.model === 'string' && typeof m.tier === 'string' && typeof m.totalIterations === 'number';
}

function mapCursorResultToTurnMetrics(
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

async function readStream(
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
