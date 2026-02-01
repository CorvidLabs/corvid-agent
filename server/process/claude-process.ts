import type { Session, Agent, Project } from '../../shared/types';
import type { ClaudeStreamEvent, ClaudeInputMessage } from './types';
const CLAUDE_BIN = Bun.which('claude') ?? 'claude';

export interface ClaudeProcessOptions {
    session: Session;
    project: Project;
    agent: Agent | null;
    resume?: boolean;
    prompt?: string;
    onEvent: (event: ClaudeStreamEvent) => void;
    onExit: (code: number | null) => void;
}

export interface ClaudeProcess {
    proc: ReturnType<typeof Bun.spawn>;
    pid: number;
    sendMessage: (content: string) => void;
    kill: () => void;
}

export function spawnClaudeProcess(options: ClaudeProcessOptions): ClaudeProcess {
    const { session, project, agent, resume, prompt, onEvent, onExit } = options;

    const args = buildArgs(session, project, agent, resume, prompt);

    const proc = Bun.spawn([CLAUDE_BIN, ...args], {
        cwd: project.workingDir,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            ...process.env,
            ...project.envVars,
        },
    });

    const pid = proc.pid;

    // Read stdout line by line for stream-json events
    readStream(proc.stdout, onEvent);
    readStream(proc.stderr, (event) => {
        onEvent({
            type: 'error',
            error: { message: String(event), type: 'stderr' },
        } as ClaudeStreamEvent);
    });

    // Send initial prompt via stdin (the OS pipe buffer handles the timing)
    const initialPrompt = prompt ?? (!resume ? session.initialPrompt : undefined);
    if (initialPrompt) {
        sendMessage(initialPrompt);
        // Close stdin so Claude knows input is complete (especially for --print mode)
        try {
            (proc.stdin as unknown as { end(): void }).end();
        } catch {
            // Fallback: try closing via Bun's FileSink API
            try {
                proc.stdin?.flush();
            } catch { /* already closed */ }
        }
    }

    // Monitor exit
    proc.exited.then((code) => {
        onExit(code);
    });

    function sendMessage(content: string): void {
        const msg: ClaudeInputMessage = {
            type: 'user',
            message: { role: 'user', content },
        };
        const sink = proc.stdin;
        if (sink) {
            try {
                (sink as { write(data: string): void; flush(): void }).write(JSON.stringify(msg) + '\n');
                (sink as { flush(): void }).flush();
            } catch {
                // Process may have exited
            }
        }
    }

    function kill(): void {
        proc.kill();
    }

    return { proc, pid, sendMessage, kill };
}

function buildArgs(
    session: Session,
    project: Project,
    agent: Agent | null,
    resume?: boolean,
    prompt?: string,
): string[] {
    const args: string[] = [
        '--print',
        '--output-format', 'stream-json',
        '--input-format', 'stream-json',
        '--verbose',
    ];

    if (resume) {
        args.push('--resume', session.id);
    }

    if (agent) {
        if (agent.model) {
            args.push('--model', agent.model);
        }
        if (agent.systemPrompt) {
            args.push('--system-prompt', agent.systemPrompt);
        }
        if (agent.appendPrompt) {
            args.push('--append-system-prompt', agent.appendPrompt);
        }
        if (agent.allowedTools) {
            args.push('--allowedTools', agent.allowedTools);
        }
        if (agent.disallowedTools) {
            args.push('--disallowedTools', agent.disallowedTools);
        }
        if (agent.permissionMode && agent.permissionMode !== 'default') {
            args.push('--permission-mode', agent.permissionMode);
        }
        if (agent.maxBudgetUsd !== null && agent.maxBudgetUsd !== undefined) {
            args.push('--max-turns-budget', String(agent.maxBudgetUsd));
        }

        // Custom flags
        for (const [key, value] of Object.entries(agent.customFlags)) {
            if (value === 'true' || value === '') {
                args.push(`--${key}`);
            } else {
                args.push(`--${key}`, value);
            }
        }
    }

    if (project.claudeMd) {
        args.push('--project-context', project.claudeMd);
    }

    // Prompt is sent via stdin in stream-json format (not as positional arg)

    return args;
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
                    onEvent(event);
                } catch {
                    // Not JSON, treat as raw output
                    onEvent({
                        type: 'raw',
                        message: { content: trimmed },
                    } as ClaudeStreamEvent);
                }
            }
        }
    } catch {
        // Stream closed
    }
}
