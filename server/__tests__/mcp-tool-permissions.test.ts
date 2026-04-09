import { describe, expect, it } from 'bun:test';
import { DEFAULT_ALLOWED_TOOLS, resolveAllowedTools } from '../mcp/tool-permissions';

describe('resolveAllowedTools', () => {
  it('returns default tools when permissions is null', () => {
    expect(resolveAllowedTools(null)).toBe(DEFAULT_ALLOWED_TOOLS);
  });

  it('returns default tools when permissions is undefined', () => {
    expect(resolveAllowedTools(undefined)).toBe(DEFAULT_ALLOWED_TOOLS);
  });

  it('returns default tools when permissions is an empty array', () => {
    const result = resolveAllowedTools([]);
    expect(result).toBe(DEFAULT_ALLOWED_TOOLS);
  });

  it('returns only the specified tools when permissions is non-empty', () => {
    const result = resolveAllowedTools(['corvid_send_message', 'corvid_save_memory']);
    expect(result.size).toBe(2);
    expect(result.has('corvid_send_message')).toBe(true);
    expect(result.has('corvid_save_memory')).toBe(true);
    expect(result.has('corvid_recall_memory')).toBe(false);
  });

  it('DEFAULT_ALLOWED_TOOLS contains expected core tools', () => {
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_send_message')).toBe(true);
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_recall_memory')).toBe(true);
    expect(DEFAULT_ALLOWED_TOOLS.has('corvid_save_memory')).toBe(true);
  });
});
