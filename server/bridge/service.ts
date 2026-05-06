import { posix } from 'node:path';
import type { ServerWebSocket } from 'bun';
import type {
  BridgeCapabilities,
  BridgeRequest,
  BridgeResponse,
  BridgeSessionInfo,
} from '../../shared/bridge-protocol';
import { createLogger } from '../lib/logger';
import type { BridgeSession, BridgeWsData } from './types';

const log = createLogger('BridgeService');

export const MAX_PATH_LENGTH = 4096;
export const MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10 MB
export const MAX_COMMAND_LENGTH = 8192;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 120;
export const IDLE_SESSION_TIMEOUT_MS = 30 * 60_000; // 30 minutes
export const IDLE_REAP_INTERVAL_MS = 60_000;

const SHELL_META = /[;|&`$(){}[\]<>!\n\r\\]/;
const DANGEROUS_COMMANDS = /^\s*(rm\s+-rf|mkfs|dd\s+if=|chmod\s+777|:(){ :|shutdown|reboot|halt|init\s+[06])/i;

export class BridgeService {
  private sessions = new Map<string, BridgeSession>();
  private requestCounts = new Map<string, { count: number; windowStart: number }>();
  private reapTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.reapTimer = setInterval(() => this.reapIdleSessions(), IDLE_REAP_INTERVAL_MS);
  }

  dispose(): void {
    if (this.reapTimer) {
      clearInterval(this.reapTimer);
      this.reapTimer = null;
    }
    for (const [id] of this.sessions) {
      this.removeSession(id);
    }
  }

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

    for (const [, pending] of session.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bridge session closed'));
    }
    session.pendingRequests.clear();
    this.requestCounts.delete(sessionId);

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
      this.validateRequest(request);
      this.enforceRateLimit(sessionId);
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
        break;
    }
  }

  private validateRequest(request: BridgeRequest): void {
    if (request.path !== undefined) {
      if (typeof request.path !== 'string' || request.path.length > MAX_PATH_LENGTH) {
        throw new Error(`Path exceeds maximum length of ${MAX_PATH_LENGTH} characters`);
      }
      this.validatePath(request.path);
    }

    if (request.content !== undefined) {
      if (typeof request.content !== 'string' || request.content.length > MAX_CONTENT_LENGTH) {
        throw new Error(`Content exceeds maximum size of ${MAX_CONTENT_LENGTH} bytes`);
      }
    }

    if (request.command !== undefined) {
      if (typeof request.command !== 'string' || request.command.length > MAX_COMMAND_LENGTH) {
        throw new Error(`Command exceeds maximum length of ${MAX_COMMAND_LENGTH} characters`);
      }
      this.validateCommand(request.command);
    }

    if (request.cwd !== undefined) {
      if (typeof request.cwd !== 'string' || request.cwd.length > MAX_PATH_LENGTH) {
        throw new Error(`Working directory exceeds maximum length of ${MAX_PATH_LENGTH} characters`);
      }
      this.validatePath(request.cwd);
    }
  }

  private validatePath(p: string): void {
    const normalized = posix.normalize(p);
    if (normalized.includes('..')) {
      throw new Error('Path traversal detected: paths must not contain ".."');
    }
    if (/\0/.test(p)) {
      throw new Error('Path contains null bytes');
    }
  }

  private validateCommand(cmd: string): void {
    if (SHELL_META.test(cmd)) {
      throw new Error('Command contains disallowed shell metacharacters');
    }
    if (DANGEROUS_COMMANDS.test(cmd)) {
      throw new Error('Command matches blocked pattern');
    }
  }

  private enforceRateLimit(sessionId: string): void {
    const now = Date.now();
    let bucket = this.requestCounts.get(sessionId);
    if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
      bucket = { count: 0, windowStart: now };
      this.requestCounts.set(sessionId, bucket);
    }
    bucket.count++;
    if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
      throw new Error(`Rate limit exceeded: max ${RATE_LIMIT_MAX_REQUESTS} requests per ${RATE_LIMIT_WINDOW_MS / 1000}s`);
    }
  }

  private reapIdleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      const idle = now - session.lastActivity.getTime();
      if (idle > IDLE_SESSION_TIMEOUT_MS) {
        log.warn(`Reaping idle bridge session: ${id} (idle ${Math.round(idle / 1000)}s)`);
        try {
          session.ws.close(4003, 'Idle timeout');
        } catch { /* already closed */ }
        this.removeSession(id);
      }
    }
  }
}
