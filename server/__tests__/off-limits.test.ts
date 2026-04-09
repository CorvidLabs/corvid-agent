/**
 * Tests for server/github/off-limits.ts
 *
 * Uses a test-specific fixture file so tests are self-contained and do not
 * depend on any instance-specific .claude/off-limits-repos.txt.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Write a test fixture before importing the module
const fixtureDir = resolve(import.meta.dir, '../../.claude');
const fixturePath = resolve(fixtureDir, 'off-limits-repos.txt');

mkdirSync(fixtureDir, { recursive: true });
writeFileSync(
  fixturePath,
  [
    '# Test fixture — repos that should be blocked',
    'testorg/blocked-repo',
    'AnotherOrg/AnotherRepo',
    'wildcard-org/*',
    '',
  ].join('\n'),
);

// Now import the module (it will read our fixture)
const { isRepoOffLimits, assertRepoAllowed, _resetCache } = await import('../github/off-limits');

beforeEach(() => _resetCache());

afterAll(() => {
  try {
    unlinkSync(fixturePath);
  } catch {
    /* ignore */
  }
});

describe('off-limits repos', () => {
  test('blocks repos listed in off-limits-repos.txt', () => {
    expect(isRepoOffLimits('testorg/blocked-repo')).toBe(true);
  });

  test('matching is case-insensitive', () => {
    expect(isRepoOffLimits('TESTORG/BLOCKED-REPO')).toBe(true);
    expect(isRepoOffLimits('anotherorg/anotherrepo')).toBe(true);
  });

  test('allows repos not on the list', () => {
    expect(isRepoOffLimits('someorg/some-repo')).toBe(false);
    expect(isRepoOffLimits('octocat/hello-world')).toBe(false);
  });

  test('assertRepoAllowed throws for blocked repos', () => {
    expect(() => assertRepoAllowed('testorg/blocked-repo')).toThrow(/off-limits/);
  });

  test('assertRepoAllowed does not throw for allowed repos', () => {
    expect(() => assertRepoAllowed('someorg/some-repo')).not.toThrow();
  });

  test('blocks all repos under a wildcard org', () => {
    expect(isRepoOffLimits('wildcard-org/repo-a')).toBe(true);
    expect(isRepoOffLimits('wildcard-org/repo-b')).toBe(true);
    expect(isRepoOffLimits('Wildcard-Org/Repo-C')).toBe(true);
  });

  test('wildcard org does not match unrelated repos', () => {
    expect(isRepoOffLimits('someorg/some-repo')).toBe(false);
    expect(isRepoOffLimits('wildcard-organization/repo')).toBe(false);
  });
});
