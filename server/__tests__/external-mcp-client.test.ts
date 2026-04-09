import { describe, expect, test } from 'bun:test';
import { ExternalMcpClientManager } from '../mcp/external-client';

describe('ExternalMcpClientManager', () => {
  test('getAllTools returns empty array initially', () => {
    const manager = new ExternalMcpClientManager();
    expect(manager.getAllTools()).toEqual([]);
  });

  test('connectionCount is 0 initially', () => {
    const manager = new ExternalMcpClientManager();
    expect(manager.connectionCount).toBe(0);
  });

  test('disconnectAll on empty connections does not throw', async () => {
    const manager = new ExternalMcpClientManager();
    // Should complete without error
    await manager.disconnectAll();
    expect(manager.connectionCount).toBe(0);
  });

  test('disconnectAll resets connection count', async () => {
    const manager = new ExternalMcpClientManager();
    await manager.disconnectAll();
    expect(manager.connectionCount).toBe(0);
    expect(manager.getAllTools()).toEqual([]);
  });
});

// ── Namespace generation logic ──────────────────────────────────────────
// The private buildToolProxies method applies this transform to server names:
//   name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

describe('tool namespace generation pattern', () => {
  /** Replicates the namespace prefix logic from buildToolProxies. */
  function namespacePrefix(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  test('lowercases and replaces hyphens with underscores', () => {
    expect(namespacePrefix('github-server')).toBe('github_server');
  });

  test('replaces spaces with underscores', () => {
    expect(namespacePrefix('My Custom Server')).toBe('my_custom_server');
  });

  test('strips leading and trailing underscores', () => {
    expect(namespacePrefix('--special--')).toBe('special');
  });

  test('handles already clean names', () => {
    expect(namespacePrefix('github')).toBe('github');
  });

  test('collapses consecutive special chars into single underscore', () => {
    expect(namespacePrefix('foo---bar___baz')).toBe('foo_bar_baz');
  });

  test('preserves digits', () => {
    expect(namespacePrefix('server2-v3')).toBe('server2_v3');
  });

  test('generates correct namespaced tool name', () => {
    const prefix = namespacePrefix('github-server');
    const toolName = `${prefix}_list_repos`;
    expect(toolName).toBe('github_server_list_repos');
  });
});
