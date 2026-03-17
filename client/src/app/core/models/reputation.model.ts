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

export interface AgentReputationStats {
    agentId: string;
    events: Record<string, { count: number; totalImpact: number }>;
    feedback: Record<string, { positive: number; negative: number }>;
    feedbackTotal: { positive: number; negative: number; total: number };
}
