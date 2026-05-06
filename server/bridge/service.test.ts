import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { BridgeService } from './service';
import type { BridgeCapabilities, BridgeRequest, BridgeResponse } from '../../shared/bridge-protocol';

function makeMockWs() {
  return { send: mock(() => {}), readyState: 1 } as any;
}

const fullCaps: BridgeCapabilities = { read: true, write: true, exec: true };
const readOnlyCaps: BridgeCapabilities = { read: true, write: false, exec: false };

describe('BridgeService', () => {
  let service: BridgeService;

  beforeEach(() => {
    service = new BridgeService();
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

    // WebSocket should have received the JSON payload
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sentArg = ws.send.mock.calls[0][0] as string;
    expect(JSON.parse(sentArg)).toMatchObject({ id: 'req-2', type: 'file.read' });

    // Simulate the bridge client responding
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
});
