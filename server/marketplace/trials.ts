/**
 * TrialService — Free trial periods for paid marketplace listings.
 *
 * Supports two trial modes:
 *   1. Usage-based (trial_uses): N free uses before per-use billing kicks in
 *   2. Time-based (trial_days): N days of free access before subscription billing starts
 *
 * Trial lifecycle:
 *   active → expired (uses exhausted or time elapsed)
 *   active → converted (buyer purchases after trial)
 */
import type { Database } from 'bun:sqlite';
import type { MarketplaceTrial, TrialRecord, MarketplaceListing } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('MarketplaceTrials');

// ─── Row Mapper ──────────────────────────────────────────────────────────────

function recordToTrial(row: TrialRecord): MarketplaceTrial {
    return {
        id: row.id,
        listingId: row.listing_id,
        tenantId: row.tenant_id,
        usesRemaining: row.uses_remaining,
        expiresAt: row.expires_at,
        status: row.status as MarketplaceTrial['status'],
        createdAt: row.created_at,
    };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class TrialService {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Start a free trial for a buyer on a listing.
     * Returns null if the listing has no trial configured, or if a trial already exists.
     */
    startTrial(listing: MarketplaceListing, tenantId: string): MarketplaceTrial | null {
        // Check listing has a trial configured
        if (!listing.trialUses && !listing.trialDays) {
            return null;
        }

        // Check for existing trial (any status)
        const existing = this.getTrial(listing.id, tenantId);
        if (existing) {
            return null;
        }

        const id = crypto.randomUUID();
        const usesRemaining = listing.trialUses ?? null;

        let expiresAt: string | null = null;
        if (listing.trialDays) {
            const expiry = new Date();
            expiry.setUTCDate(expiry.getUTCDate() + listing.trialDays);
            expiresAt = expiry.toISOString().replace('T', ' ').slice(0, 19);
        }

        this.db.query(`
            INSERT INTO marketplace_trials
                (id, listing_id, tenant_id, uses_remaining, expires_at, status)
            VALUES (?, ?, ?, ?, ?, 'active')
        `).run(id, listing.id, tenantId, usesRemaining, expiresAt);

        log.info('Trial started', {
            id, listingId: listing.id, tenantId,
            usesRemaining, expiresAt,
        });

        return this.getTrialById(id)!;
    }

    /**
     * Get the active trial for a buyer-listing pair.
     * Returns null if no trial exists or trial is not active.
     */
    getActiveTrial(listingId: string, tenantId: string): MarketplaceTrial | null {
        const row = this.db.query(`
            SELECT * FROM marketplace_trials
            WHERE listing_id = ? AND tenant_id = ? AND status = 'active'
        `).get(listingId, tenantId) as TrialRecord | null;

        if (!row) return null;

        const trial = recordToTrial(row);

        // Check if time-based trial has expired
        if (trial.expiresAt && new Date(trial.expiresAt + 'Z') <= new Date()) {
            this.expireTrial(trial.id);
            return null;
        }

        // Check if usage-based trial has been exhausted
        if (trial.usesRemaining !== null && trial.usesRemaining <= 0) {
            this.expireTrial(trial.id);
            return null;
        }

        return trial;
    }

    /**
     * Get any trial (any status) for a buyer-listing pair.
     */
    getTrial(listingId: string, tenantId: string): MarketplaceTrial | null {
        const row = this.db.query(`
            SELECT * FROM marketplace_trials
            WHERE listing_id = ? AND tenant_id = ?
        `).get(listingId, tenantId) as TrialRecord | null;

        return row ? recordToTrial(row) : null;
    }

    /**
     * Get a trial by its ID.
     */
    getTrialById(id: string): MarketplaceTrial | null {
        const row = this.db.query(
            'SELECT * FROM marketplace_trials WHERE id = ?',
        ).get(id) as TrialRecord | null;

        return row ? recordToTrial(row) : null;
    }

    /**
     * Consume one trial use. Returns true if use was consumed, false if trial exhausted.
     */
    consumeTrialUse(trialId: string): boolean {
        const trial = this.getTrialById(trialId);
        if (!trial || trial.status !== 'active') return false;

        if (trial.usesRemaining === null) {
            // Time-based trial only — no uses to consume, just verify not expired
            if (trial.expiresAt && new Date(trial.expiresAt + 'Z') <= new Date()) {
                this.expireTrial(trialId);
                return false;
            }
            return true;
        }

        if (trial.usesRemaining <= 0) {
            this.expireTrial(trialId);
            return false;
        }

        const newRemaining = trial.usesRemaining - 1;
        this.db.query(`
            UPDATE marketplace_trials SET uses_remaining = ? WHERE id = ?
        `).run(newRemaining, trialId);

        // Auto-expire if no uses left
        if (newRemaining <= 0) {
            this.expireTrial(trialId);
        }

        log.info('Trial use consumed', { trialId, usesRemaining: newRemaining });
        return true;
    }

    /**
     * Mark a trial as converted (buyer purchased after trial).
     */
    convertTrial(trialId: string): MarketplaceTrial | null {
        const trial = this.getTrialById(trialId);
        if (!trial) return null;

        this.db.query(`
            UPDATE marketplace_trials SET status = 'converted' WHERE id = ?
        `).run(trialId);

        log.info('Trial converted', { trialId, listingId: trial.listingId, tenantId: trial.tenantId });
        return this.getTrialById(trialId);
    }

    /**
     * Expire time-based trials past their expires_at. Called by scheduler.
     */
    expireTrials(): number {
        const result = this.db.query(`
            UPDATE marketplace_trials
            SET status = 'expired'
            WHERE status = 'active'
              AND expires_at IS NOT NULL
              AND expires_at <= datetime('now')
        `).run();

        if (result.changes > 0) {
            log.info('Expired time-based trials', { count: result.changes });
        }

        return result.changes;
    }

    // ─── Private ─────────────────────────────────────────────────────────

    private expireTrial(trialId: string): void {
        this.db.query(`
            UPDATE marketplace_trials SET status = 'expired' WHERE id = ? AND status = 'active'
        `).run(trialId);
    }
}
