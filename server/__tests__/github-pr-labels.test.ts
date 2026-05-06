import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

// Override mock.module leak from other test files (Bun 1.x mock leak).
// github-tool-handlers.test.ts and polling-ack-dedup.test.ts mock
// ../github/operations globally, replacing applyPrLabels with a no-op.
// Re-provide real implementations so Bun.spawn spy tests work.
mock.module('../github/operations', () => {
  const { buildSafeGhEnv } = require('../lib/env');

  function hasGhToken(): boolean {
    return !!process.env.GH_TOKEN;
  }

  async function runGh(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    if (!hasGhToken()) return { ok: false, stdout: '', stderr: 'GH_TOKEN not configured' };
    try {
      const proc = Bun.spawn(['gh', ...args], {
        cwd: process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
        env: buildSafeGhEnv(),
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { ok: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (err) {
      return { ok: false, stdout: '', stderr: err instanceof Error ? err.message : String(err) };
    }
  }

  const COMMIT_TYPE_LABEL_MAP: Record<string, string> = {
    feat: 'type:feature',
    fix: 'type:bugfix',
    chore: 'type:chore',
    docs: 'type:docs',
    refactor: 'type:refactor',
    test: 'type:test',
    perf: 'type:perf',
    ci: 'type:ci',
    build: 'type:build',
  };

  const TYPE_LABEL_COLORS: Record<string, string> = {
    'type:feature': '0075ca',
    'type:bugfix': 'd73a4a',
    'type:chore': 'e4e669',
    'type:docs': '0075ca',
    'type:refactor': '7057ff',
    'type:test': '008672',
    'type:perf': 'fbca04',
    'type:ci': 'c2e0c6',
    'type:build': 'fef2c0',
  };

  const AGENT_LABEL_COLOR = '6f42c1';

  function inferPrLabels(title: string, agentName?: string): string[] {
    const labels: string[] = [];
    const match = title.match(/^(\w+)(?:\([^)]+\))?[!]?:/);
    if (match) {
      const prefix = match[1].toLowerCase();
      const typeLabel = COMMIT_TYPE_LABEL_MAP[prefix];
      if (typeLabel) labels.push(typeLabel);
    }
    if (agentName) labels.push(`agent:${agentName.toLowerCase()}`);
    return labels;
  }

  async function ensureLabelExists(repo: string, name: string, color: string): Promise<void> {
    await runGh(['api', `repos/${repo}/labels`, '-X', 'POST', '-f', `name=${name}`, '-f', `color=${color}`]);
  }

  async function applyPrLabels(repo: string, prUrl: string, labels: string[]): Promise<void> {
    if (labels.length === 0) return;
    const prNumberMatch = prUrl.match(/\/pull\/(\d+)$/);
    if (!prNumberMatch) return;
    const prNumber = prNumberMatch[1];
    for (const label of labels) {
      const color = TYPE_LABEL_COLORS[label] ?? AGENT_LABEL_COLOR;
      try {
        await ensureLabelExists(repo, label, color);
      } catch {
        // ignore
      }
    }
    try {
      await runGh(['pr', 'edit', prNumber, '--repo', repo, '--add-label', labels.join(',')]);
    } catch {
      // ignore
    }
  }

  return {
    inferPrLabels,
    ensureLabelExists,
    applyPrLabels,
    isGitHubConfigured: () => hasGhToken(),
  };
});

import { applyPrLabels, ensureLabelExists, inferPrLabels } from '../github/operations';

describe('inferPrLabels', () => {
  test('maps feat prefix to type:feature', () => {
    expect(inferPrLabels('feat(github): add auto-labeling')).toEqual(['type:feature']);
  });

  test('maps fix prefix to type:bugfix', () => {
    expect(inferPrLabels('fix(discord): strip channel context')).toEqual(['type:bugfix']);
  });

  test('maps chore prefix to type:chore', () => {
    expect(inferPrLabels('chore: bump dependencies')).toEqual(['type:chore']);
  });

  test('maps docs prefix to type:docs', () => {
    expect(inferPrLabels('docs: update README')).toEqual(['type:docs']);
  });

  test('maps refactor prefix to type:refactor', () => {
    expect(inferPrLabels('refactor(auth): simplify token handling')).toEqual(['type:refactor']);
  });

  test('maps test prefix to type:test', () => {
    expect(inferPrLabels('test: add coverage for scheduler')).toEqual(['type:test']);
  });

  test('maps perf prefix to type:perf', () => {
    expect(inferPrLabels('perf: optimize query')).toEqual(['type:perf']);
  });

  test('maps ci prefix to type:ci', () => {
    expect(inferPrLabels('ci: update workflow')).toEqual(['type:ci']);
  });

  test('maps build prefix to type:build', () => {
    expect(inferPrLabels('build: update webpack config')).toEqual(['type:build']);
  });

  test('returns empty array when no conventional prefix', () => {
    expect(inferPrLabels('[Agent] implement new feature')).toEqual([]);
  });

  test('returns empty array for blank title', () => {
    expect(inferPrLabels('')).toEqual([]);
  });

  test('includes agent label when agentName provided', () => {
    expect(inferPrLabels('feat: new thing', 'Jackdaw')).toEqual(['type:feature', 'agent:jackdaw']);
  });

  test('includes only agent label when no type prefix matches', () => {
    expect(inferPrLabels('[Agent] misc work', 'Rook')).toEqual(['agent:rook']);
  });

  test('lowercases agent name in label', () => {
    expect(inferPrLabels('fix: bug', 'CorvidAgent')).toContain('agent:corvidagent');
  });

  test('handles breaking change marker in title', () => {
    expect(inferPrLabels('feat!: breaking new api')).toEqual(['type:feature']);
  });
});

// ── applyPrLabels / ensureLabelExists ──────────────────────────────────────

function mockSpawn() {
  return spyOn(Bun, 'spawn').mockImplementation(
    () =>
      ({
        stdout: new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(''));
            c.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        exited: Promise.resolve(0),
      }) as ReturnType<typeof Bun.spawn>,
  );
}

const originalGhToken = process.env.GH_TOKEN;

describe('applyPrLabels', () => {
  let spawnSpy: ReturnType<typeof mockSpawn>;

  beforeAll(() => {
    spawnSpy = mockSpawn();
  });

  afterAll(() => {
    spawnSpy.mockRestore();
  });

  beforeEach(() => {
    process.env.GH_TOKEN = 'test-token';
    spawnSpy.mockClear();
  });

  afterEach(() => {
    if (originalGhToken) {
      process.env.GH_TOKEN = originalGhToken;
    } else {
      delete process.env.GH_TOKEN;
    }
  });

  test('returns immediately for empty labels', async () => {
    await applyPrLabels('CorvidLabs/corvid-agent', 'https://github.com/CorvidLabs/corvid-agent/pull/99', []);
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  test('returns immediately for invalid PR URL', async () => {
    await applyPrLabels('CorvidLabs/corvid-agent', 'https://github.com/CorvidLabs/corvid-agent/issues/99', [
      'type:feature',
    ]);
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  test('creates labels and applies them via gh pr edit', async () => {
    await applyPrLabels('CorvidLabs/corvid-agent', 'https://github.com/CorvidLabs/corvid-agent/pull/42', [
      'type:bugfix',
    ]);
    // 1 call for ensureLabelExists + 1 call for gh pr edit
    expect(spawnSpy).toHaveBeenCalledTimes(2);
    const editArgs = spawnSpy.mock.calls[1][0] as string[];
    expect(editArgs).toContain('pr');
    expect(editArgs).toContain('edit');
    expect(editArgs).toContain('--add-label');
  });

  test('creates multiple labels before applying', async () => {
    await applyPrLabels('CorvidLabs/corvid-agent', 'https://github.com/CorvidLabs/corvid-agent/pull/10', [
      'type:feature',
      'agent:jackdaw',
    ]);
    // 2 calls for ensureLabelExists + 1 for gh pr edit
    expect(spawnSpy).toHaveBeenCalledTimes(3);
  });

  test('continues when ensureLabelExists throws', async () => {
    let callCount = 0;
    spawnSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('API error');
      return {
        stdout: new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(''));
            c.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        exited: Promise.resolve(0),
      } as ReturnType<typeof Bun.spawn>;
    });

    await expect(
      applyPrLabels('CorvidLabs/corvid-agent', 'https://github.com/CorvidLabs/corvid-agent/pull/5', ['type:chore']),
    ).resolves.toBeUndefined();
  });

  test('does not throw when gh pr edit fails', async () => {
    spawnSpy.mockImplementation(
      () =>
        ({
          stdout: new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(''));
              c.close();
            },
          }),
          stderr: new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('error'));
              c.close();
            },
          }),
          exited: Promise.resolve(1),
        }) as ReturnType<typeof Bun.spawn>,
    );

    await expect(
      applyPrLabels('CorvidLabs/corvid-agent', 'https://github.com/CorvidLabs/corvid-agent/pull/5', ['type:docs']),
    ).resolves.toBeUndefined();
  });
});

describe('ensureLabelExists', () => {
  let spawnSpy: ReturnType<typeof mockSpawn>;

  beforeAll(() => {
    spawnSpy = mockSpawn();
  });

  afterAll(() => {
    spawnSpy.mockRestore();
  });

  beforeEach(() => {
    process.env.GH_TOKEN = 'test-token';
    spawnSpy.mockClear();
  });

  afterEach(() => {
    if (originalGhToken) {
      process.env.GH_TOKEN = originalGhToken;
    } else {
      delete process.env.GH_TOKEN;
    }
  });

  test('calls gh api with correct repo and label args', async () => {
    await ensureLabelExists('CorvidLabs/corvid-agent', 'type:feature', '0075ca');
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const args = spawnSpy.mock.calls[0][0] as string[];
    expect(args).toContain('api');
    expect(args).toContain('repos/CorvidLabs/corvid-agent/labels');
    expect(args).toContain('name=type:feature');
    expect(args).toContain('color=0075ca');
  });
});
