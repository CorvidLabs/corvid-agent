export interface BridgeAuthMessage {
  type: 'auth';
  token: string;
  projectId: string;
  capabilities: BridgeCapabilities;
  label?: string;
}

export interface BridgeCapabilities {
  read: boolean;
  write: boolean;
  exec: boolean;
}

export interface BridgeRequest {
  id: string;
  type: 'file.read' | 'file.write' | 'file.list' | 'exec' | 'ping';
  path?: string;
  content?: string;
  command?: string;
  cwd?: string;
  timeout?: number;
}

export interface BridgeResponse {
  id: string;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BridgeSessionInfo {
  sessionId: string;
  label: string;
  projectId: string;
  capabilities: BridgeCapabilities;
  connectedAt: string;
  lastActivity: string;
}
