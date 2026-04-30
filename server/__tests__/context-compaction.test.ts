import { describe, expect, test } from 'bun:test';
import { determineWarningLevel } from '../process/context-management';

describe('context compaction', () => {
  test('MAX_TURNS_BEFORE_CONTEXT_RESET constant is removed', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    expect(managerSource).not.toContain('MAX_TURNS_BEFORE_CONTEXT_RESET');
  });
});

describe('turn counter persistence', () => {
  test('sessionMeta initialization references session.totalTurns', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    // After the fix, turnCount should be initialized from session data, not hardcoded 0
    // Look for the pattern after "this.processes.set(session.id, sp)" (in resumeProcess)
    expect(managerSource).toMatch(/this\.processes\.set\(session\.id, sp\);[\s\S]*?turnCount: session\.totalTurns/);
  });

  test('applyCostUpdateIfPresent uses cumulative meta.turnCount, not SDK num_turns', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    // The cost update should use the in-memory cumulative turn count, not the SDK's per-run value
    expect(managerSource).toContain('meta?.turnCount ?? event.num_turns');
  });

  test('session_exited event does not include total_cost_usd (avoids zeroing DB)', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    // The exit event should NOT carry total_cost_usd: 0 — that would trigger updateSessionCost(db, id, 0, 0)
    const exitEventMatch = managerSource.match(/type:\s*['"]session_exited['"][\s\S]*?\}\s*as\s*ClaudeStreamEvent/);
    expect(exitEventMatch).toBeTruthy();
    expect(exitEventMatch![0]).not.toContain('total_cost_usd');
  });
});

describe('fallback context usage', () => {
  test('computeFallbackContextUsage method exists on ProcessManager', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    expect(managerSource).toContain('computeFallbackContextUsage');
  });

  test('fallback is triggered when context_usage has 0 estimated tokens', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    expect(managerSource).toContain('estimatedTokens === 0');
    expect(managerSource).toContain('computeFallbackContextUsage');
  });
});

describe('auto-compact at 90%', () => {
  test('compactSession method exists on ProcessManager', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    expect(managerSource).toContain('compactSession(');
  });

  test('handleEvent tracks context_usage and triggers compaction at 90%', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    expect(managerSource).toContain("event.type === 'context_usage'");
    expect(managerSource).toContain('AUTO_COMPACT_THRESHOLD');
  });
});

describe('warning messages mention /compact', () => {
  test('70% warning mentions /compact', () => {
    const result = determineWarningLevel(72);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('/compact');
  });

  test('85% critical warning mentions /compact', () => {
    const result = determineWarningLevel(87);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('/compact');
  });

  test('50% info does not mention /compact', () => {
    const result = determineWarningLevel(55);
    expect(result).not.toBeNull();
    expect(result!.message).not.toContain('/compact');
  });
});

describe('/compact command', () => {
  test('sessions route handles compact action', async () => {
    const routeSource = await Bun.file('server/routes/sessions.ts').text();
    expect(routeSource).toContain("action === 'compact'");
  });

  test('sendMessage intercepts /compact command', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    expect(managerSource).toContain('/compact');
    expect(managerSource).toContain('compactSession');
  });
});
