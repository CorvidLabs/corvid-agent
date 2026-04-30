import { describe, expect, test } from 'bun:test';

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
