/**
 * Federation — Cross-instance marketplace discovery.
 *
 * Allows corvid-agent instances to discover and consume listings
 * from other instances via HTTP federation protocol.
 */
import type { Database } from 'bun:sqlite';
import type { FederatedInstance, FederatedListing, MarketplaceListing } from './types';
import { createLogger } from '../lib/logger';
import { ValidationError, ExternalServiceError } from '../lib/errors';

const log = createLogger('MarketplaceFederation');

interface FederatedInstanceRecord {
    url: string;
    name: string;
    last_sync_at: string | null;
    listing_count: number;
    status: string;
}

function recordToInstance(row: FederatedInstanceRecord): FederatedInstance {
    return {
        url: row.url,
        name: row.name,
        lastSyncAt: row.last_sync_at,
        listingCount: row.listing_count,
        status: row.status as FederatedInstance['status'],
    };
}

export class MarketplaceFederation {
    private db: Database;
    private syncTimer: ReturnType<typeof setInterval> | null = null;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Validate that a URL is safe for federation (HTTPS only, no private IPs).
     */
    private validateFederationUrl(url: string): void {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new ValidationError('Invalid federation URL', { url });
        }
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            throw new ValidationError('Federation URLs must use http or https protocol', { url });
        }
        // Block private/loopback IPs to prevent SSRF
        const hostname = parsed.hostname;
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname === '0.0.0.0' ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
            hostname.startsWith('169.254.') ||
            hostname.endsWith('.local')
        ) {
            throw new ValidationError('Federation URLs must not point to private or loopback addresses', { url, hostname });
        }
    }

    /**
     * Register a remote instance for federation.
     */
    registerInstance(url: string, name: string): FederatedInstance {
        this.validateFederationUrl(url);
        // Normalize URL (remove trailing slash)
        const normalizedUrl = url.replace(/\/+$/, '');

        this.db.query(`
            INSERT OR REPLACE INTO federated_instances (url, name, status)
            VALUES (?, ?, 'active')
        `).run(normalizedUrl, name);

        log.info('Registered federated instance', { url: normalizedUrl, name });
        return this.getInstance(normalizedUrl)!;
    }

    /**
     * Remove a federated instance.
     */
    removeInstance(url: string): boolean {
        const normalizedUrl = url.replace(/\/+$/, '');
        // Also remove cached listings from this instance
        this.db.query(
            'DELETE FROM marketplace_listings WHERE instance_url = ?',
        ).run(normalizedUrl);
        const result = this.db.query(
            'DELETE FROM federated_instances WHERE url = ?',
        ).run(normalizedUrl);
        return result.changes > 0;
    }

    /**
     * Get a registered instance.
     */
    getInstance(url: string): FederatedInstance | null {
        const row = this.db.query(
            'SELECT * FROM federated_instances WHERE url = ?',
        ).get(url) as FederatedInstanceRecord | null;
        return row ? recordToInstance(row) : null;
    }

    /**
     * List all registered instances.
     */
    listInstances(): FederatedInstance[] {
        const rows = this.db.query(
            'SELECT * FROM federated_instances ORDER BY name',
        ).all() as FederatedInstanceRecord[];
        return rows.map(recordToInstance);
    }

    /**
     * Sync listings from a remote instance.
     * Fetches published listings from the remote's marketplace API.
     */
    async syncInstance(url: string): Promise<number> {
        this.validateFederationUrl(url);
        const normalizedUrl = url.replace(/\/+$/, '');
        let synced = 0;

        try {
            const response = await fetch(`${normalizedUrl}/api/marketplace/listings?status=published`);
            if (!response.ok) {
                throw new ExternalServiceError('Federation', `HTTP ${response.status}: ${response.statusText}`, { url: normalizedUrl });
            }

            const data = await response.json() as { listings: MarketplaceListing[] };
            const listings = data.listings ?? [];

            // Remove old cached listings from this instance
            this.db.query(
                'DELETE FROM marketplace_listings WHERE instance_url = ?',
            ).run(normalizedUrl);

            // Insert fresh listings
            const insert = this.db.query(`
                INSERT INTO marketplace_listings
                    (id, agent_id, name, description, long_description, category,
                     tags, pricing_model, price_credits, instance_url, status,
                     use_count, avg_rating, review_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
            `);

            for (const listing of listings) {
                insert.run(
                    `fed-${normalizedUrl}-${listing.id}`,
                    listing.agentId,
                    listing.name,
                    listing.description,
                    listing.longDescription,
                    listing.category,
                    JSON.stringify(listing.tags),
                    listing.pricingModel,
                    listing.priceCredits,
                    normalizedUrl,
                    listing.useCount,
                    listing.avgRating,
                    listing.reviewCount,
                );
                synced++;
            }

            // Update instance record
            this.db.query(`
                UPDATE federated_instances
                SET last_sync_at = datetime('now'), listing_count = ?, status = 'active'
                WHERE url = ?
            `).run(synced, normalizedUrl);

            log.info('Synced federated instance', { url: normalizedUrl, listings: synced });
        } catch (err) {
            // Mark unreachable
            this.db.query(
                "UPDATE federated_instances SET status = 'unreachable' WHERE url = ?",
            ).run(normalizedUrl);
            log.warn('Failed to sync instance', {
                url: normalizedUrl,
                error: err instanceof Error ? err.message : String(err),
            });
        }

        return synced;
    }

    /**
     * Sync all registered instances.
     */
    async syncAll(): Promise<{ synced: number; failed: number }> {
        const instances = this.listInstances();
        let synced = 0;
        let failed = 0;

        for (const instance of instances) {
            try {
                await this.syncInstance(instance.url);
                synced++;
            } catch {
                failed++;
            }
        }

        return { synced, failed };
    }

    /**
     * Get federated listings (from remote instances).
     */
    getFederatedListings(limit: number = 50): FederatedListing[] {
        const rows = this.db.query(`
            SELECT * FROM marketplace_listings
            WHERE instance_url IS NOT NULL
            ORDER BY avg_rating DESC, use_count DESC
            LIMIT ?
        `).all(limit) as (import('./types').ListingRecord)[];

        return rows.map((row) => ({
            id: row.id,
            agentId: row.agent_id,
            name: row.name,
            description: row.description,
            longDescription: row.long_description,
            category: row.category as MarketplaceListing['category'],
            tags: row.tags ? JSON.parse(row.tags) : [],
            pricingModel: row.pricing_model as MarketplaceListing['pricingModel'],
            priceCredits: row.price_credits,
            instanceUrl: row.instance_url,
            status: row.status as MarketplaceListing['status'],
            useCount: row.use_count,
            avgRating: row.avg_rating,
            reviewCount: row.review_count,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            sourceInstance: row.instance_url!,
        }));
    }

    /**
     * Start periodic sync (every 5 minutes).
     */
    startPeriodicSync(intervalMs: number = 300_000): void {
        if (this.syncTimer) return;
        this.syncTimer = setInterval(() => {
            this.syncAll().catch((err) => {
                log.warn('Periodic sync failed', { error: err instanceof Error ? err.message : String(err) });
            });
        }, intervalMs);
        log.info('Started periodic federation sync', { intervalMs });
    }

    /**
     * Stop periodic sync.
     */
    stopPeriodicSync(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }
}
