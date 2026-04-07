/**
 * Tests for mcp/tool-permissions — resolveAllowedTools and DEFAULT_ALLOWED_TOOLS.
 */
import { describe, expect, test } from 'bun:test';
import { DEFAULT_ALLOWED_TOOLS, resolveAllowedTools } from '../mcp/tool-permissions';

describe('DEFAULT_ALLOWED_TOOLS', () => {
  test('contains core messaging tools', () => {
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_send_message')).toBe(true);
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_notify_owner')).toBe(true);
  });

  test('contains memory tools', () => {
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_save_memory')).toBe(true);
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_recall_memory')).toBe(true);
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_delete_memory')).toBe(true);
  });

  test('contains github tools', () => {
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_github_list_prs')).toBe(true);
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_github_create_pr')).toBe(true);
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_github_create_issue')).toBe(true);
  });

  test('is a Set with more than 20 entries', () => {
    expect(DEFAULT_ALLOWED_TOOLS.size).toBeGreaterThan(20);
  });
});

describe('resolveAllowedTools', () => {
  test('returns DEFAULT_ALLOWED_TOOLS when given null', () => {
    const result = resolveAllowedTools(null);
    expect(result).toBe(DEFAULT_ALLOWED_TOOLS);
  });

  test('returns DEFAULT_ALLOWED_TOOLS when given undefined', () => {
    const result = resolveAllowedTools(undefined);
    expect(result).toBe(DEFAULT_ALLOWED_TOOLS);
  });

  test('returns DEFAULT_ALLOWED_TOOLS when given empty array', () => {
    const result = resolveAllowedTools([]);
    expect(result).toBe(DEFAULT_ALLOWED_TOOLS);
  });

  test('returns a restricted set when given a non-empty array', () => {
    const result = resolveAllowedTools(['corvid_send_message', 'corvid_web_search']);
    expect(result.has('corvid_send_message')).toBe(true);
    expect(result.has('corvid_web_search')).toBe(true);
    expect(result.has('corvid_save_memory')).toBe(false);
    expect(result.size).toBe(2);
  });

  test('returns a Set for a single-tool array', () => {
    const result = resolveAllowedTools(['corvid_recall_memory']);
    expect(result instanceof Set).toBe(true);
    expect(result.has('corvid_recall_memory')).toBe(true);
    expect(result.size).toBe(1);
  });

  test('handles unknown tool names gracefully', () => {
    const result = resolveAllowedTools(['some_unknown_tool']);
    expect(result.has('some_unknown_tool')).toBe(true);
    expect(result.size).toBe(1);
  });
});
