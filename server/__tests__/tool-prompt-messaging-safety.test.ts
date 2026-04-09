import { describe, expect, test } from 'bun:test';
import { getMessagingSafetyPrompt, getWorktreeIsolationPrompt } from '../providers/ollama/tool-prompt-templates';

describe('getMessagingSafetyPrompt', () => {
  test('returns a non-empty string', () => {
    const result = getMessagingSafetyPrompt();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('includes messaging safety header', () => {
    const result = getMessagingSafetyPrompt();
    expect(result).toContain('## Messaging Safety');
  });

  test('prohibits writing scripts to send messages', () => {
    const result = getMessagingSafetyPrompt();
    expect(result).toContain('NEVER write scripts');
  });

  test('prohibits using coding tools to create messaging scripts', () => {
    const result = getMessagingSafetyPrompt();
    expect(result).toContain('NEVER use coding tools');
    expect(result).toContain('write_file');
    expect(result).toContain('run_command');
  });

  test('requires only MCP tools for messaging', () => {
    const result = getMessagingSafetyPrompt();
    expect(result).toContain('ONLY use your provided MCP tools');
  });

  test('covers multiple communication protocols', () => {
    const result = getMessagingSafetyPrompt();
    expect(result).toContain('HTTP');
    expect(result).toContain('SMTP');
    expect(result).toContain('WebSocket');
  });

  test('covers multiple communication channels', () => {
    const result = getMessagingSafetyPrompt();
    expect(result).toContain('Discord');
    expect(result).toContain('Slack');
    expect(result).toContain('email');
  });

  test('instructs to explain when no tool is available', () => {
    const result = getMessagingSafetyPrompt();
    expect(result).toContain('no tool is available');
  });

  test('returns identical result on repeated calls (pure function)', () => {
    const first = getMessagingSafetyPrompt();
    const second = getMessagingSafetyPrompt();
    expect(first).toBe(second);
  });
});

describe('getWorktreeIsolationPrompt', () => {
  test('returns a non-empty string', () => {
    const result = getWorktreeIsolationPrompt();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('includes branch isolation header', () => {
    const result = getWorktreeIsolationPrompt();
    expect(result).toContain('## Git Branch Isolation');
  });

  test('warns against interacting with other sessions branches', () => {
    const result = getWorktreeIsolationPrompt();
    expect(result).toContain('chat/*');
    expect(result).toContain('Do NOT checkout');
  });

  test('instructs to use main as base branch', () => {
    const result = getWorktreeIsolationPrompt();
    expect(result).toContain('main');
  });

  test('returns identical result on repeated calls (pure function)', () => {
    const first = getWorktreeIsolationPrompt();
    const second = getWorktreeIsolationPrompt();
    expect(first).toBe(second);
  });
});
