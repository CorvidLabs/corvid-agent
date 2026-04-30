import { describe, expect, test } from 'bun:test';

describe('context compaction', () => {
  test('MAX_TURNS_BEFORE_CONTEXT_RESET constant is removed', async () => {
    const managerSource = await Bun.file('server/process/manager.ts').text();
    expect(managerSource).not.toContain('MAX_TURNS_BEFORE_CONTEXT_RESET');
  });
});
