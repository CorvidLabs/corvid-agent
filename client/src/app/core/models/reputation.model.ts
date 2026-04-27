export type TrustLevel = 'untrusted' | 'low' | 'medium' | 'high' | 'verified';

export interface ReputationComponents {
    taskCompletion: number;
    peerRating: number;
    creditPattern: number;
    securityCompliance: number;
    activityLevel: number;
}

export interface ReputationScore {
    agentId: string;
    overallScore: number;
    trustLevel: TrustLevel;
    components: ReputationComponents;
    attestationHash: string | null;
    computedAt: string;
    hasActivity: boolean;
}

export type ReputationEventType =
    | 'task_completed'
    | 'task_failed'
    | 'review_received'
    | 'credit_spent'
    | 'credit_earned'
    | 'security_violation'
    | 'session_completed'
    | 'attestation_published'
    | 'improvement_loop_completed'
    | 'improvement_loop_failed';

export interface ReputationEvent {
    id: string;
    agentId: string;
    eventType: ReputationEventType;
    scoreImpact: number;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface ComponentExplanation {
    component: keyof ReputationComponents;
    score: number;
    weight: number;
    weightedContribution: number;
    isDefault: boolean;
    reason: string;
    evidence: Record<string, unknown>;
    recentEvents: ReputationEventRecord[];
}

export interface ReputationEventRecord {
    id: string;
    agent_id: string;
    event_type: string;
    score_impact: number;
    metadata: string;
    created_at: string;
}

export interface ScoreExplanation {
    agentId: string;
    overallScore: number;
    trustLevel: TrustLevel;
    decayFactor: number;
    rawScore: number;
    components: ComponentExplanation[];
    computedAt: string;
}

export interface AgentReputationStats {
    agentId: string;
    events: Record<string, { count: number; totalImpact: number }>;
    feedback: Record<string, { positive: number; negative: number }>;
    feedbackTotal: { positive: number; negative: number; total: number };
}

export interface ReputationHistoryPoint {
    overallScore: number;
    trustLevel: string;
    components: ReputationComponents;
    computedAt: string;
}

export interface ActivitySummary {
    id: number;
    period: string;
    periodStart: string;
    periodEnd: string;
    payload: string;
    hash: string;
    txid: string | null;
    publishedAt: string | null;
    createdAt: string;
}

export interface MemoryAttestation {
    id: number;
    memoryKey: string;
    agentId: string;
    hash: string;
    payload: string;
    txid: string | null;
    createdAt: string;
    publishedAt: string | null;
}
