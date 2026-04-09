import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { OwnerQuestionManager } from '../process/owner-question-manager';

describe('OwnerQuestionManager', () => {
  let mgr: OwnerQuestionManager;

  beforeEach(() => {
    mgr = new OwnerQuestionManager();
  });

  afterEach(() => {
    mgr.shutdown();
  });

  // ─── createQuestion ──────────────────────────────────────────────────────

  test('createQuestion returns a promise that resolves when answered', async () => {
    const promise = mgr.createQuestion({
      sessionId: 's1',
      agentId: 'a1',
      question: 'Continue?',
    });

    const pending = mgr.getPendingForSession('s1');
    expect(pending).toHaveLength(1);
    expect(pending[0].question).toBe('Continue?');
    expect(pending[0].sessionId).toBe('s1');
    expect(pending[0].agentId).toBe('a1');

    const resolved = mgr.resolveQuestion(pending[0].id, {
      questionId: pending[0].id,
      answer: 'yes',
      selectedOption: null,
    });
    expect(resolved).toBe(true);

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.answer).toBe('yes');
  });

  test('createQuestion with options stores them', async () => {
    const promise = mgr.createQuestion({
      sessionId: 's1',
      agentId: 'a1',
      question: 'Pick one',
      options: ['A', 'B', 'C'],
    });

    const pending = mgr.getPendingForSession('s1');
    expect(pending[0].options).toEqual(['A', 'B', 'C']);

    mgr.resolveQuestion(pending[0].id, {
      questionId: pending[0].id,
      answer: 'B',
      selectedOption: 1,
    });

    const result = await promise;
    expect(result!.selectedOption).toBe(1);
  });

  test('createQuestion with context stores it', async () => {
    const promise = mgr.createQuestion({
      sessionId: 's1',
      agentId: 'a1',
      question: 'Approve?',
      context: 'Deploying to prod',
    });

    const pending = mgr.getPendingForSession('s1');
    expect(pending[0].context).toBe('Deploying to prod');

    mgr.resolveQuestion(pending[0].id, {
      questionId: pending[0].id,
      answer: 'approved',
      selectedOption: null,
    });
    await promise;
  });

  test('createQuestion clamps timeout to MIN/MAX bounds', async () => {
    // Below minimum (60s) — should clamp to 60000
    const promise1 = mgr.createQuestion({
      sessionId: 's1',
      agentId: 'a1',
      question: 'Fast?',
      timeoutMs: 1000,
    });
    const pending1 = mgr.getPendingForSession('s1');
    expect(pending1[0].timeoutMs).toBe(60000);
    mgr.resolveQuestion(pending1[0].id, {
      questionId: pending1[0].id,
      answer: 'ok',
      selectedOption: null,
    });
    await promise1;

    // Above maximum (600s) — should clamp to 600000
    const promise2 = mgr.createQuestion({
      sessionId: 's2',
      agentId: 'a1',
      question: 'Slow?',
      timeoutMs: 999999,
    });
    const pending2 = mgr.getPendingForSession('s2');
    expect(pending2[0].timeoutMs).toBe(600000);
    mgr.resolveQuestion(pending2[0].id, {
      questionId: pending2[0].id,
      answer: 'ok',
      selectedOption: null,
    });
    await promise2;
  });

  // ─── resolveQuestion ─────────────────────────────────────────────────────

  test('resolveQuestion returns false for unknown ID', () => {
    const result = mgr.resolveQuestion('nonexistent', {
      questionId: 'nonexistent',
      answer: 'nope',
      selectedOption: null,
    });
    expect(result).toBe(false);
  });

  test('resolveQuestion returns false for already-resolved question', async () => {
    const promise = mgr.createQuestion({
      sessionId: 's1',
      agentId: 'a1',
      question: 'Once?',
    });

    const pending = mgr.getPendingForSession('s1');
    const id = pending[0].id;

    const first = mgr.resolveQuestion(id, {
      questionId: id,
      answer: 'first',
      selectedOption: null,
    });
    expect(first).toBe(true);

    const second = mgr.resolveQuestion(id, {
      questionId: id,
      answer: 'second',
      selectedOption: null,
    });
    expect(second).toBe(false);

    await promise;
  });

  // ─── cancelSession ───────────────────────────────────────────────────────

  test('cancelSession resolves all pending questions for a session with null', async () => {
    const p1 = mgr.createQuestion({ sessionId: 's1', agentId: 'a1', question: 'Q1' });
    const p2 = mgr.createQuestion({ sessionId: 's1', agentId: 'a1', question: 'Q2' });
    const p3 = mgr.createQuestion({ sessionId: 's2', agentId: 'a1', question: 'Q3' });

    mgr.cancelSession('s1');

    expect(await p1).toBeNull();
    expect(await p2).toBeNull();

    // s2 question should still be pending
    expect(mgr.getPendingForSession('s2')).toHaveLength(1);

    // Cleanup s2
    const s2Pending = mgr.getPendingForSession('s2');
    mgr.resolveQuestion(s2Pending[0].id, {
      questionId: s2Pending[0].id,
      answer: 'ok',
      selectedOption: null,
    });
    await p3;
  });

  // ─── getPendingForSession ────────────────────────────────────────────────

  test('getPendingForSession returns empty array when no questions', () => {
    expect(mgr.getPendingForSession('nonexistent')).toEqual([]);
  });

  test('getPendingForSession only returns questions for the specified session', async () => {
    const p1 = mgr.createQuestion({ sessionId: 's1', agentId: 'a1', question: 'Q1' });
    const p2 = mgr.createQuestion({ sessionId: 's2', agentId: 'a1', question: 'Q2' });

    expect(mgr.getPendingForSession('s1')).toHaveLength(1);
    expect(mgr.getPendingForSession('s2')).toHaveLength(1);
    expect(mgr.getPendingForSession('s3')).toHaveLength(0);

    mgr.shutdown();
    await Promise.all([p1, p2]);
  });

  // ─── findByShortId ───────────────────────────────────────────────────────

  test('findByShortId finds question by UUID prefix', async () => {
    const promise = mgr.createQuestion({
      sessionId: 's1',
      agentId: 'a1',
      question: 'Find me?',
    });

    const pending = mgr.getPendingForSession('s1');
    const fullId = pending[0].id;
    const shortId = fullId.slice(0, 8);

    const found = mgr.findByShortId(shortId);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(fullId);

    mgr.resolveQuestion(fullId, {
      questionId: fullId,
      answer: 'found',
      selectedOption: null,
    });
    await promise;
  });

  test('findByShortId returns null for non-matching prefix', () => {
    expect(mgr.findByShortId('xxxxxxxx')).toBeNull();
  });

  // ─── resolveByShortId ────────────────────────────────────────────────────

  test('resolveByShortId resolves by prefix', async () => {
    const promise = mgr.createQuestion({
      sessionId: 's1',
      agentId: 'a1',
      question: 'Shortcut?',
    });

    const pending = mgr.getPendingForSession('s1');
    const shortId = pending[0].id.slice(0, 8);

    const resolved = mgr.resolveByShortId(shortId, {
      answer: 'shortcut-answer',
      selectedOption: null,
    });
    expect(resolved).toBe(true);

    const result = await promise;
    expect(result!.answer).toBe('shortcut-answer');
  });

  test('resolveByShortId returns false for non-matching prefix', () => {
    expect(mgr.resolveByShortId('zzzzzzzz', { answer: 'x', selectedOption: null })).toBe(false);
  });

  // ─── shutdown ────────────────────────────────────────────────────────────

  test('shutdown resolves all pending questions with null', async () => {
    const p1 = mgr.createQuestion({ sessionId: 's1', agentId: 'a1', question: 'Q1' });
    const p2 = mgr.createQuestion({ sessionId: 's2', agentId: 'a2', question: 'Q2' });

    mgr.shutdown();

    expect(await p1).toBeNull();
    expect(await p2).toBeNull();
    expect(mgr.getPendingForSession('s1')).toEqual([]);
    expect(mgr.getPendingForSession('s2')).toEqual([]);
  });

  // ─── no database (persistence is optional) ───────────────────────────────

  test('works without database set (no persistence)', async () => {
    // No setDatabase() call — should still work in-memory
    const promise = mgr.createQuestion({
      sessionId: 's1',
      agentId: 'a1',
      question: 'No DB?',
    });

    const pending = mgr.getPendingForSession('s1');
    mgr.resolveQuestion(pending[0].id, {
      questionId: pending[0].id,
      answer: 'works',
      selectedOption: null,
    });

    const result = await promise;
    expect(result!.answer).toBe('works');
  });
});
