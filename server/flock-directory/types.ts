export interface FlockAgentRecord {
    id: string;
    address: string;
    name: string;
    description: string;
    instance_url: string | null;
    capabilities: string;
    status: string;
    reputation_score: number;
    attestation_count: number;
    council_participations: number;
    uptime_pct: number;
    last_heartbeat: string | null;
    registered_at: string;
    updated_at: string;
}

export interface RegisterFlockAgentInput {
    address: string;
    name: string;
    description?: string;
    instanceUrl?: string;
    capabilities?: string[];
}

export interface UpdateFlockAgentInput {
    name?: string;
    description?: string;
    instanceUrl?: string | null;
    capabilities?: string[];
    reputationScore?: number;
    attestationCount?: number;
    councilParticipations?: number;
    uptimePct?: number;
}
