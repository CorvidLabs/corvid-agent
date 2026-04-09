export type FlockAgentStatus = 'active' | 'inactive' | 'deregistered';

export interface FlockAgent {
  id: string;
  address: string;
  name: string;
  description: string;
  instanceUrl: string | null;
  capabilities: string[];
  status: FlockAgentStatus;
  reputationScore: number;
  attestationCount: number;
  councilParticipations: number;
  uptimePct: number;
  lastHeartbeat: string | null;
  registeredAt: string;
  updatedAt: string;
}

export type FlockSortField = 'reputation' | 'name' | 'uptime' | 'registered' | 'attestations';
export type FlockSortOrder = 'asc' | 'desc';

export interface FlockDirectorySearchParams {
  query?: string;
  status?: FlockAgentStatus;
  capability?: string;
  minReputation?: number;
  sortBy?: FlockSortField;
  sortOrder?: FlockSortOrder;
  limit?: number;
  offset?: number;
}

export interface FlockDirectorySearchResult {
  agents: FlockAgent[];
  total: number;
  limit: number;
  offset: number;
}
