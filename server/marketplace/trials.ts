/**
 * TrialService — Manages free trial periods for marketplace listings.
 *
 * A trial allows a buyer to use a paid listing for free, constrained by
 * a maximum number of uses and/or an expiry date.
 */
import type { Database } from 'bun:sqlite';
import type { MarketplaceListing } from './types';

export interface Trial {
    id: string;
    listingId: string;
    tenantId: string;
    usesRemaining: number | null;
    expiresAt: string | null;
    status: 'active' | 'expired' | 'converted';
    createdAt: string;
}

interface TrialRecord {
    id: string;
    listing_id: string;
    tenant_id: string;
    uses_remaining: number | null;
    expires_at: string | null;
    status: string;
    created_at: string;
}

function recordToTrial(row: TrialRecord): Trial {
    return {
        id: row.id,
        listingId: row.listing_id,
        tenantId: row.tenant_id,
        usesRemaining: row.uses_remaining,
        expiresAt: row.expires_at,
        status: row.status as Trial['status'],
        createdAt: row.created_at,
    };
}

export class TrialService {
    constructor(private db: Database) {}

    /**
     * Start a new trial for a listing + tenant pair.
     * Returns null if the listing has no trial configuration.
     */
    startTrial(listing: MarketplaceListing, tenantId: string): Trial | null {
        if (!listing.trialUses && !listing.trialDays) return null;

        const id = crypto.randomUUID();
        const expiresAt = listing.trialDays
            ? new Date(Date.now() + listing.trialDays * 86400000).toISOString()
            : null;

        this.db.query(`
            INSERT INTO marketplace_trials (id, listing_id, tenant_id, uses_remaining, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, listing.id, tenantId, listing.trialUses ?? null, expiresAt);

        return this.getTrialById(id)!;
    }

    /**
     * Get a trial by listing + tenant (unique constraint).
     */
    getTrial(listingId: string, tenantId: string): Trial | null {
        const row = this.db.query(
            'SELECT * FROM marketplace_trials WHERE listing_id = ? AND tenant_id = ?',
        ).get(listingId, tenantId) as TrialRecord | null;
        return row ? recordToTrial(row) : null;
    }

    /**
     * Get a trial by its ID.
     */
    getTrialById(id: string): Trial | null {
        const row = this.db.query(
            'SELECT * FROM marketplace_trials WHERE id = ?',
        ).get(id) as TrialRecord | null;
        return row ? recordToTrial(row) : null;
    }

    /**
     * Get the active trial for a listing + tenant, checking expiry and uses.
     * Returns null if no active trial or trial has expired/exhausted.
     */
    getActiveTrial(listingId: string, tenantId: string): Trial | null {
        const trial = this.getTrial(listingId, tenantId);
        if (!trial || trial.status !== 'active') return null;

        // Check expiry
        if (trial.expiresAt && new Date(trial.expiresAt) < new Date()) {
            this.db.query(
                "UPDATE marketplace_trials SET status = 'expired' WHERE id = ?",
            ).run(trial.id);
            return null;
        }

        // Check uses
        if (trial.usesRemaining !== null && trial.usesRemaining <= 0) {
            this.db.query(
                "UPDATE marketplace_trials SET status = 'expired' WHERE id = ?",
            ).run(trial.id);
            return null;
        }

        return trial;
    }

    /**
     * Consume one trial use. Returns true if successful, false if exhausted.
     */
    consumeTrialUse(trialId: string): boolean {
        const trial = this.getTrialById(trialId);
        if (!trial || trial.status !== 'active') return false;

        if (trial.usesRemaining !== null) {
            if (trial.usesRemaining <= 0) return false;
            this.db.query(
                'UPDATE marketplace_trials SET uses_remaining = uses_remaining - 1 WHERE id = ?',
            ).run(trialId);

            // Expire if this was the last use
            if (trial.usesRemaining - 1 <= 0) {
                this.db.query(
                    "UPDATE marketplace_trials SET status = 'expired' WHERE id = ?",
                ).run(trialId);
            }
        }

        return true;
    }
}
