export interface A2AAgentProvider {
  organization: string;
  url: string;
}

export interface A2AAgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
}

export interface A2AAgentAuthentication {
  schemes: string[];
  credentials?: string;
}

export interface A2AAgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  inputModes: string[];
  outputModes: string[];
}

export interface McpServerConfig {
  id: string;
  agentId: string | null;
  name: string;
  command: string;
  args: string[];
  envVars: Record<string, string>;
  cwd: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMcpServerConfigInput {
  agentId?: string | null;
  name: string;
  command: string;
  args?: string[];
  envVars?: Record<string, string>;
  cwd?: string | null;
  enabled?: boolean;
}

export interface UpdateMcpServerConfigInput {
  name?: string;
  command?: string;
  args?: string[];
  envVars?: Record<string, string>;
  cwd?: string | null;
  enabled?: boolean;
}

export interface A2AProtocolExtension {
  protocol: string;
  description: string;
  endpoint?: string;
}

export interface A2AAgentCard {
  name: string;
  description: string;
  url: string;
  provider?: A2AAgentProvider;
  version: string;
  documentationUrl?: string;
  capabilities: A2AAgentCapabilities;
  authentication: A2AAgentAuthentication;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: A2AAgentSkill[];
  supportedProtocols?: A2AProtocolExtension[];
}
