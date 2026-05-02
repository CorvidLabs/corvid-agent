import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import {
  handleBoostObservation,
  handleDismissObservation,
  handleListObservations,
  handleObservationStats,
  handleRecordObservation,
} from '../mcp/tool-handlers/observations';
import type { McpToolContext } from '../mcp/tool-handlers/types';

const AGENT_ID = 'test-agent-obs-001';

let db: Database;

function createCtx(): McpToolContext {
  return {
    agentId: AGENT_ID,
    db,
    agentMessenger: {} as McpToolContext['agentMessenger'],
    agentDirectory: {} as McpToolContext['agentDirectory'],
    agentWalletService: {
      getAlgoChatService: () => ({ indexerClient: null }),
    } as unknown as McpToolContext['agentWalletService'],
    network: 'localnet',
  };
}

function getText(result: { content: Array<{ type: string; text?: string }> }): string {
  return (result.content[0] as { type: 'text'; text: string }).text;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query('INSERT INTO agents (id, name) VALUES (?, ?)').run(AGENT_ID, 'TestAgent');
});

afterEach(() => db.close());

describe('handleRecordObservation', () => {
  test('records an observation with defaults', async () => {
    const result = await handleRecordObservation(createCtx(), {
      content: 'User prefers verbose output',
    });
    expect(result.isError).toBeUndefined();
    const text = getText(result);
    expect(text).toContain('Observation recorded');
    expect(text).toContain('source: manual');
    expect(text).toContain('Relevance: 1');
  });

  test('records with explicit source and score', async () => {
    const result = await handleRecordObservation(createCtx(), {
      content: 'Health check passed',
      source: 'health',
      relevance_score: 2.5,
      suggested_key: 'health-status',
    });
    expect(result.isError).toBeUndefined();
    const text = getText(result);
    expect(text).toContain('source: health');
    expect(text).toContain('Relevance: 2.5');
  });

  test('falls back to manual for invalid source', async () => {
    const result = await handleRecordObservation(createCtx(), {
      content: 'Test observation',
      source: 'bogus-source',
    });
    expect(result.isError).toBeUndefined();
    expect(getText(result)).toContain('source: manual');
  });
});

describe('handleListObservations', () => {
  test('returns empty message when no observations', async () => {
    const result = await handleListObservations(createCtx(), {});
    expect(result.isError).toBeUndefined();
    expect(getText(result)).toContain('No observations found');
  });

  test('lists recorded observations', async () => {
    const ctx = createCtx();
    await handleRecordObservation(ctx, { content: 'First observation' });
    await handleRecordObservation(ctx, { content: 'Second observation' });

    const result = await handleListObservations(ctx, {});
    expect(result.isError).toBeUndefined();
    const text = getText(result);
    expect(text).toContain('Found 2 observations');
    expect(text).toContain('First observation');
    expect(text).toContain('Second observation');
  });

  test('searches by query', async () => {
    const ctx = createCtx();
    await handleRecordObservation(ctx, { content: 'The database schema changed' });
    await handleRecordObservation(ctx, { content: 'User likes dark mode' });

    const result = await handleListObservations(ctx, { query: 'database' });
    expect(result.isError).toBeUndefined();
    const text = getText(result);
    expect(text).toContain('database schema');
  });

  test('returns no-match message for empty search', async () => {
    const ctx = createCtx();
    await handleRecordObservation(ctx, { content: 'Something unrelated' });

    const result = await handleListObservations(ctx, { query: 'xyznonexistent' });
    const text = getText(result);
    expect(text).toContain('No observations found matching');
  });
});

describe('handleBoostObservation', () => {
  test('boosts observation score', async () => {
    const ctx = createCtx();
    await handleRecordObservation(ctx, { content: 'Important insight' });

    const list = await handleListObservations(ctx, {});
    const idMatch = getText(list).match(/score: ([\d.]+)/);
    expect(idMatch).toBeTruthy();

    const rows = db
      .query<{ id: string }, [string]>('SELECT id FROM memory_observations WHERE agent_id = ?')
      .all(AGENT_ID);
    expect(rows.length).toBe(1);

    const result = await handleBoostObservation(ctx, { id: rows[0].id });
    expect(result.isError).toBeUndefined();
    expect(getText(result)).toContain('boosted by 1');
  });

  test('boosts by custom amount', async () => {
    const ctx = createCtx();
    await handleRecordObservation(ctx, { content: 'Test' });
    const rows = db
      .query<{ id: string }, [string]>('SELECT id FROM memory_observations WHERE agent_id = ?')
      .all(AGENT_ID);

    const result = await handleBoostObservation(ctx, { id: rows[0].id, score_boost: 0.5 });
    expect(result.isError).toBeUndefined();
    expect(getText(result)).toContain('boosted by 0.5');
  });

  test('succeeds silently for nonexistent id', async () => {
    const result = await handleBoostObservation(createCtx(), { id: 'nonexistent-id' });
    expect(result.isError).toBeUndefined();
    expect(getText(result)).toContain('boosted by 1');
  });
});

describe('handleDismissObservation', () => {
  test('dismisses an observation', async () => {
    const ctx = createCtx();
    await handleRecordObservation(ctx, { content: 'Stale info' });
    const rows = db
      .query<{ id: string }, [string]>('SELECT id FROM memory_observations WHERE agent_id = ?')
      .all(AGENT_ID);

    const result = await handleDismissObservation(ctx, { id: rows[0].id });
    expect(result.isError).toBeUndefined();
    expect(getText(result)).toContain('dismissed');
  });

  test('succeeds silently for nonexistent id', async () => {
    const result = await handleDismissObservation(createCtx(), { id: 'nonexistent-id' });
    expect(result.isError).toBeUndefined();
    expect(getText(result)).toContain('dismissed');
  });
});

describe('handleObservationStats', () => {
  test('returns stats with zero counts initially', async () => {
    const result = await handleObservationStats(createCtx());
    expect(result.isError).toBeUndefined();
    const text = getText(result);
    expect(text).toContain('Active: 0');
    expect(text).toContain('Graduated: 0');
    expect(text).toContain('Expired: 0');
    expect(text).toContain('Dismissed: 0');
  });

  test('reflects recorded and dismissed observations', async () => {
    const ctx = createCtx();
    await handleRecordObservation(ctx, { content: 'Obs 1' });
    await handleRecordObservation(ctx, { content: 'Obs 2' });
    await handleRecordObservation(ctx, { content: 'Obs 3' });

    const rows = db
      .query<{ id: string }, [string]>('SELECT id FROM memory_observations WHERE agent_id = ?')
      .all(AGENT_ID);
    await handleDismissObservation(ctx, { id: rows[0].id });

    const result = await handleObservationStats(ctx);
    const text = getText(result);
    expect(text).toContain('Active: 2');
    expect(text).toContain('Dismissed: 1');
  });
});
