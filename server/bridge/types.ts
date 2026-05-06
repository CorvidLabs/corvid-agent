import type { ServerWebSocket } from 'bun';
import type { BridgeCapabilities, BridgeRequest, BridgeResponse, BridgeSessionInfo } from '../../shared/bridge-protocol';

export interface BridgeSession {
  sessionId: string;
  label: string;
  projectId: string;
  capabilities: BridgeCapabilities;
  ws: ServerWebSocket<BridgeWsData>;
  connectedAt: Date;
  lastActivity: Date;
  pendingRequests: Map<string, {
    resolve: (response: BridgeResponse) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>;
}

export interface BridgeWsData {
  type: 'bridge';
  sessionId: string;
  authenticated: boolean;
  authTimeoutTimer?: ReturnType<typeof setTimeout> | null;
}

export type { BridgeCapabilities, BridgeRequest, BridgeResponse, BridgeSessionInfo };
