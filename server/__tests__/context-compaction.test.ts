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
