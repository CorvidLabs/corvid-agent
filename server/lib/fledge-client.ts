/**
 * FledgeClient — thin wrapper around the `fledge` CLI for plugin delegation.
 *
 * Shells out to `fledge <command> --json` and parses the JSON response.
 * Used by MCP tool handlers to delegate to fledge plugins (memory, sql,
 * localnet, algochat) with automatic fallback when fledge is unavailable.
 */
export interface FledgeResult {
  ok: boolean;
  [key: string]: unknown;
}

export class FledgeError extends Error {
  constructor(
    message: string,
    public exitCode: number,
  ) {
    super(message);
    this.name = 'FledgeError';
  }
}

export class FledgeClient {
  private cwd: string;
  private timeout: number;

  constructor(opts?: { cwd?: string; timeout?: number }) {
    this.cwd = opts?.cwd ?? process.cwd();
    this.timeout = opts?.timeout ?? 30_000;
  }

  async exec(command: string, args: string[] = []): Promise<FledgeResult> {
    const fullArgs = [...args, '--json'];
    const proc = Bun.spawn(['fledge', command, ...fullArgs], {
      cwd: this.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, FLEDGE_NON_INTERACTIVE: '1' },
    });

    const timer = setTimeout(() => proc.kill(), this.timeout);
    try {
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (exitCode !== 0) {
        const parsed = tryParseJson(stdout) ?? tryParseJson(stderr);
        if (parsed?.error) throw new FledgeError(parsed.error as string, exitCode);
        throw new FledgeError(stderr.trim() || `fledge ${command} exited with code ${exitCode}`, exitCode);
      }

      return tryParseJson(stdout) ?? { ok: true, raw: stdout.trim() };
    } finally {
      clearTimeout(timer);
    }
  }

  async memory(subcommand: string, flags: Record<string, string> = {}): Promise<FledgeResult> {
    const args = flattenFlags(flags);
    return this.exec('memory', [subcommand, ...args]);
  }

  async algochat(subcommand: string, args: string[] = []): Promise<FledgeResult> {
    return this.exec('algochat', [subcommand, ...args]);
  }

  async sql(subcommand: string, args: string[] = []): Promise<FledgeResult> {
    return this.exec('sql', [subcommand, ...args]);
  }

  async localnet(subcommand: string, args: string[] = []): Promise<FledgeResult> {
    return this.exec('localnet', [subcommand, ...args]);
  }

  /** Quick health check — can we reach the fledge binary? */
  async available(): Promise<boolean> {
    try {
      const proc = Bun.spawn(['fledge', '--version'], { stdout: 'pipe', stderr: 'pipe' });
      const code = await proc.exited;
      return code === 0;
    } catch {
      return false;
    }
  }
}

function flattenFlags(flags: Record<string, string>): string[] {
  return Object.entries(flags).flatMap(([k, v]) => [`--${k}`, v]);
}

function tryParseJson(text: string): FledgeResult | null {
  try {
    for (const line of text.trim().split('\n')) {
      if (line.startsWith('{')) return JSON.parse(line);
    }
    return null;
  } catch {
    return null;
  }
}
