import { describe, expect, test } from 'bun:test';
import { inferPrLabels } from '../github/operations';

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
