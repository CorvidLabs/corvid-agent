import { createLogger } from '../lib/logger';
import type { BridgeSession } from './types';
import type { BridgeCapabilities, BridgeRequest, BridgeResponse, BridgeSessionInfo } from '../../shared/bridge-protocol';
import type { ServerWebSocket } from 'bun';
import type { BridgeWsData } from './types';

const log = createLogger('BridgeService');

export class BridgeService {
  private sessions = new Map<string, BridgeSession>();

  listSessions(): BridgeSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      sessionId: s.sessionId,
      label: s.label,
      projectId: s.projectId,
      capabilities: s.capabilities,
      connectedAt: s.connectedAt.toISOString(),
      lastActivity: s.lastActivity.toISOString(),
    }));
  }

  getSession(sessionId: string): BridgeSession | undefined {
    return this.sessions.get(sessionId);
  }

  registerSession(
    sessionId: string,
    label: string,
    projectId: string,
    capabilities: BridgeCapabilities,
    ws: ServerWebSocket<BridgeWsData>,
  ): void {
    const now = new Date();
    const session: BridgeSession = {
      sessionId,
      label,
      projectId,
      capabilities,
      ws,
      connectedAt: now,
      lastActivity: now,
      pendingRequests: new Map(),
    };
    this.sessions.set(sessionId, session);
    log.info(`Bridge session registered: ${sessionId} (${label}) project=${projectId}`);
  }

  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clean up all pending requests
    for (const [, pending] of session.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bridge session closed'));
    }
    session.pendingRequests.clear();

    this.sessions.delete(sessionId);
    log.info(`Bridge session removed: ${sessionId}`);
  }

  sendRequest(sessionId: string, request: BridgeRequest, timeoutMs = 30000): Promise<BridgeResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error('Bridge session not found'));
    }

    try {
      this.validateCapability(session, request);
    } catch (err) {
      return Promise.reject(err);
    }

    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pendingRequests.delete(request.id);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      session.pendingRequests.set(request.id, { resolve, reject, timer });
      session.lastActivity = new Date();
      session.ws.send(JSON.stringify(request));
    });
  }

  handleResponse(sessionId: string, response: BridgeResponse): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn(`handleResponse: session not found: ${sessionId}`);
      return;
    }

    const pending = session.pendingRequests.get(response.id);
    if (!pending) {
      log.warn(`handleResponse: no pending request for id=${response.id}`);
      return;
    }

    clearTimeout(pending.timer);
    session.pendingRequests.delete(response.id);
    session.lastActivity = new Date();
    pending.resolve(response);
  }

  intersectCapabilities(clientCaps: BridgeCapabilities): BridgeCapabilities {
    const serverMax = {
      read: process.env.BRIDGE_ALLOW_READ !== 'false',
      write: process.env.BRIDGE_ALLOW_WRITE === 'true',
      exec: process.env.BRIDGE_ALLOW_EXEC === 'true',
    };
    return {
      read: clientCaps.read && serverMax.read,
      write: clientCaps.write && serverMax.write,
      exec: clientCaps.exec && serverMax.exec,
    };
  }

  private validateCapability(session: BridgeSession, request: BridgeRequest): void {
    const { capabilities } = session;

    switch (request.type) {
      case 'file.read':
      case 'file.list':
        if (!capabilities.read) {
          throw new Error(`Missing capability: 'read' is required for ${request.type}`);
        }
        break;
      case 'file.write':
        if (!capabilities.write) {
          throw new Error(`Missing capability: 'write' is required for ${request.type}`);
        }
        break;
      case 'exec':
        if (!capabilities.exec) {
          throw new Error(`Missing capability: 'exec' is required for ${request.type}`);
        }
        break;
      case 'ping':
        // No capability required
        break;
    }
  }
}
