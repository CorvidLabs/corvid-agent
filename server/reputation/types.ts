// ─── Trust Levels ───────────────────────────────────────────────────────────

export type TrustLevel = 'untrusted' | 'low' | 'medium' | 'high' | 'verified';

// ─── Reputation Score ───────────────────────────────────────────────────────

export interface ReputationScore {
    agentId: string;
    /** Overall composite score (0-100) */
    overallScore: number;
    /** Derived trust level */
    trustLevel: TrustLevel;
    /** Component scores */
    components: ReputationComponents;
    /** On-chain attestation hash (if published) */
    attestationHash: string | null;
    /** When the score was last computed */
    computedAt: string;
}

export interface ReputationComponents {
    /** Task completion rate (0-100) */
    taskCompletion: number;
    /** Average peer ratings from marketplace reviews (0-100) */
    peerRating: number;
    /** Credit spending patterns score (0-100) — higher = more responsible */
    creditPattern: number;
    /** Security compliance score (0-100) — penalized for violations */
    securityCompliance: number;
    /** Activity level score (0-100) — based on recent sessions/tasks */
    activityLevel: number;
}

// ─── Reputation Events ──────────────────────────────────────────────────────

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
    /** Positive or negative score impact */
    scoreImpact: number;
    /** Extra context */
    metadata: Record<string, unknown>;
    createdAt: string;
}

// ─── Score Weights ──────────────────────────────────────────────────────────

export interface ScoreWeights {
    taskCompletion: number;
    peerRating: number;
    creditPattern: number;
    securityCompliance: number;
    activityLevel: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
    taskCompletion: 0.30,
    peerRating: 0.25,
    creditPattern: 0.15,
    securityCompliance: 0.20,
    activityLevel: 0.10,
};

// ─── DB Records ─────────────────────────────────────────────────────────────

export interface ReputationRecord {
    agent_id: string;
    overall_score: number;
    trust_level: string;
    task_completion: number;
    peer_rating: number;
    credit_pattern: number;
    security_compliance: number;
    activity_level: number;
    attestation_hash: string | null;
    computed_at: string;
}

export interface ReputationEventRecord {
    id: string;
    agent_id: string;
    event_type: string;
    score_impact: number;
    metadata: string;
    created_at: string;
}

// ─── Input Types ────────────────────────────────────────────────────────────

export interface RecordEventInput {
    agentId: string;
    eventType: ReputationEventType;
    scoreImpact: number;
    metadata?: Record<string, unknown>;
}
