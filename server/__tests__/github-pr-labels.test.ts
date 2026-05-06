import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
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
              c.close();
            },
          }),
          exited: Promise.resolve(0),
        }) as ReturnType<typeof Bun.spawn>,
    );
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
