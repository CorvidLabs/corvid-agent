import { describe, expect, test } from 'bun:test';
import { describeCursorToolCall } from '../process/cursor-process';

describe('describeCursorToolCall', () => {
  test('returns null for null/undefined/non-object input', () => {
    expect(describeCursorToolCall(null)).toBeNull();
    expect(describeCursorToolCall(undefined)).toBeNull();
    expect(describeCursorToolCall('string')).toBeNull();
    expect(describeCursorToolCall(42)).toBeNull();
  });

  test('returns null when tool_call is missing or not an object', () => {
    expect(describeCursorToolCall({})).toBeNull();
    expect(describeCursorToolCall({ tool_call: null })).toBeNull();
    expect(describeCursorToolCall({ tool_call: 'not-object' })).toBeNull();
  });

  test('readToolCall with path extracts basename', () => {
    const event = { tool_call: { readToolCall: { args: { path: '/foo/bar/package.json' } } } };
    expect(describeCursorToolCall(event)).toBe('Reading package.json');
  });

  test('readToolCall without path returns fallback', () => {
    const event = { tool_call: { readToolCall: { args: {} } } };
    expect(describeCursorToolCall(event)).toBe('Reading file');
  });

  test('writeToolCall with path', () => {
    const event = { tool_call: { writeToolCall: { args: { path: '/src/index.ts' } } } };
    expect(describeCursorToolCall(event)).toBe('Writing index.ts');
  });

  test('writeToolCall without path', () => {
    const event = { tool_call: { writeToolCall: { args: {} } } };
    expect(describeCursorToolCall(event)).toBe('Writing file');
  });

  test('editToolCall with path', () => {
    const event = { tool_call: { editToolCall: { args: { path: '/a/b/utils.ts' } } } };
    expect(describeCursorToolCall(event)).toBe('Editing utils.ts');
  });

  test('editToolCall without path', () => {
    const event = { tool_call: { editToolCall: { args: {} } } };
    expect(describeCursorToolCall(event)).toBe('Editing file');
  });

  test('shellToolCall with command', () => {
    const event = { tool_call: { shellToolCall: { args: { command: 'git status' } } } };
    expect(describeCursorToolCall(event)).toBe('Running: git status');
  });

  test('terminalToolCall with command', () => {
    const event = { tool_call: { terminalToolCall: { args: { command: 'bun test' } } } };
    expect(describeCursorToolCall(event)).toBe('Running: bun test');
  });

  test('shellToolCall without command', () => {
    const event = { tool_call: { shellToolCall: { args: {} } } };
    expect(describeCursorToolCall(event)).toBe('Running command');
  });

  test('shellToolCall truncates long commands to 60 chars', () => {
    const long = 'a'.repeat(100);
    const event = { tool_call: { shellToolCall: { args: { command: long } } } };
    expect(describeCursorToolCall(event)).toBe(`Running: ${'a'.repeat(60)}`);
  });

  test('globToolCall', () => {
    const event = { tool_call: { globToolCall: { args: {} } } };
    expect(describeCursorToolCall(event)).toBe('Listing files');
  });

  test('listFilesToolCall', () => {
    const event = { tool_call: { listFilesToolCall: { args: {} } } };
    expect(describeCursorToolCall(event)).toBe('Listing files');
  });

  test('grepToolCall with pattern', () => {
    const event = { tool_call: { grepToolCall: { args: { pattern: 'TODO' } } } };
    expect(describeCursorToolCall(event)).toBe('Searching: TODO');
  });

  test('searchToolCall with pattern', () => {
    const event = { tool_call: { searchToolCall: { args: { pattern: 'fixme' } } } };
    expect(describeCursorToolCall(event)).toBe('Searching: fixme');
  });

  test('grepToolCall without pattern', () => {
    const event = { tool_call: { grepToolCall: { args: {} } } };
    expect(describeCursorToolCall(event)).toBe('Searching files');
  });

  test('grepToolCall truncates long patterns to 50 chars', () => {
    const long = 'x'.repeat(80);
    const event = { tool_call: { grepToolCall: { args: { pattern: long } } } };
    expect(describeCursorToolCall(event)).toBe(`Searching: ${'x'.repeat(50)}`);
  });

  test('unknown tool returns "Using <name>"', () => {
    const event = { tool_call: { customToolCall: { args: {} } } };
    expect(describeCursorToolCall(event)).toBe('Using custom');
  });

  test('empty tool_call object returns null', () => {
    const event = { tool_call: {} };
    expect(describeCursorToolCall(event)).toBeNull();
  });
});
