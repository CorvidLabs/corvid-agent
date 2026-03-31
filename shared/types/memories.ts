export type MemoryStatus = 'short_term' | 'pending' | 'confirmed' | 'failed';

export interface AgentMemory {
    id: string;
    agentId: string;
    key: string;
    content: string;
    txid: string | null;
    asaId: number | null;
    status: MemoryStatus;
    createdAt: string;
    updatedAt: string;
    /** ISO timestamp after which a short_term memory is eligible for archival. NULL for promoted memories. */
    expiresAt: string | null;
    /** Number of times this memory has been recalled. Used for TTL extension. */
    accessCount: number;
}

// ─── Memory Observations (short-term → graduation candidates) ───────────────

export type ObservationSource =
    | 'session'       // From session interactions
    | 'feedback'      // From user feedback
    | 'daily-review'  // From daily review synthesis
    | 'health'        // From health snapshot trends
    | 'pr-outcome'    // From PR merge/rejection patterns
    | 'manual';       // Explicitly recorded by agent or user

export type ObservationStatus = 'active' | 'graduated' | 'expired' | 'dismissed';

export interface MemoryObservation {
    id: string;
    agentId: string;
    source: ObservationSource;
    sourceId: string | null;
    content: string;
    /** Suggested memory key if this observation graduates */
    suggestedKey: string | null;
    /** Relevance score — incremented on access/reference */
    relevanceScore: number;
    /** Number of times this observation was recalled or referenced */
    accessCount: number;
    lastAccessedAt: string | null;
    status: ObservationStatus;
    /** Memory key it was graduated as (null until graduated) */
    graduatedKey: string | null;
    createdAt: string;
    /** Observations expire after this date if not graduated */
    expiresAt: string | null;
}
