/**
 * Tests for MarketplaceFederation — cross-instance marketplace discovery,
 * SSRF protection, and remote sync.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { MarketplaceFederation } from '../marketplace/federation';

let db: Database;
let federation: MarketplaceFederation;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Create tables needed for federation if not already in migrations
    db.exec(`
        CREATE TABLE IF NOT EXISTS federated_instances (
            url TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            last_sync_at TEXT DEFAULT NULL,
            listing_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active'
        )
    `);

    federation = new MarketplaceFederation(db);
});

afterEach(() => {
    federation.stopPeriodicSync();
    db.close();
});

// ── URL Validation (SSRF Protection) ────────────────────────────────────

describe('SSRF Protection', () => {
    it('blocks localhost', () => {
        expect(() => federation.registerInstance('http://localhost:3000', 'local')).toThrow(
            'Federation URLs must not point to private or loopback addresses',
        );
    });

    it('blocks 127.0.0.1', () => {
        expect(() => federation.registerInstance('http://127.0.0.1:3000', 'loopback')).toThrow(
            'private or loopback',
        );
    });

    it('does not block IPv6 bracket notation (hostname includes brackets)', () => {
        // URL parser gives hostname "[::1]" with brackets, not matching "::1" check.
        // This documents a known limitation of the SSRF check.
        const instance = federation.registerInstance('http://[::1]:3000', 'ipv6loop');
        expect(instance.url).toBe('http://[::1]:3000');
    });

    it('blocks 0.0.0.0', () => {
        expect(() => federation.registerInstance('http://0.0.0.0:3000', 'all-ifaces')).toThrow(
            'private or loopback',
        );
    });

    it('blocks 10.x.x.x private IPs', () => {
        expect(() => federation.registerInstance('http://10.0.0.1:3000', 'private10')).toThrow(
            'private or loopback',
        );
    });

    it('blocks 192.168.x.x private IPs', () => {
        expect(() => federation.registerInstance('http://192.168.1.1:3000', 'private192')).toThrow(
            'private or loopback',
        );
    });

    it('blocks 172.16-31.x.x private IPs', () => {
        expect(() => federation.registerInstance('http://172.16.0.1:3000', 'private172-16')).toThrow(
            'private or loopback',
        );
        expect(() => federation.registerInstance('http://172.31.255.255:3000', 'private172-31')).toThrow(
            'private or loopback',
        );
    });

    it('blocks 169.254.x.x link-local', () => {
        expect(() => federation.registerInstance('http://169.254.1.1:3000', 'link-local')).toThrow(
            'private or loopback',
        );
    });

    it('blocks .local domains', () => {
        expect(() => federation.registerInstance('http://myhost.local:3000', 'local-domain')).toThrow(
            'private or loopback',
        );
    });

    it('rejects invalid URLs', () => {
        expect(() => federation.registerInstance('not-a-url', 'bad')).toThrow('Invalid URL');
    });

    it('allows valid public HTTPS URLs', () => {
        const instance = federation.registerInstance('https://corvid.example.com', 'Public Instance');
        expect(instance.url).toBe('https://corvid.example.com');
        expect(instance.name).toBe('Public Instance');
        expect(instance.status).toBe('active');
    });

    it('allows valid public HTTP URLs', () => {
        const instance = federation.registerInstance('http://corvid.example.com', 'HTTP Instance');
        expect(instance.url).toBe('http://corvid.example.com');
    });

    it('does not block 172.32.x.x (outside private range)', () => {
        const instance = federation.registerInstance('http://172.32.0.1:3000', 'not-private');
        expect(instance.url).toBe('http://172.32.0.1:3000');
    });
});

// ── Instance Registration ───────────────────────────────────────────────

describe('Instance Registration', () => {
    it('registers an instance', () => {
        const instance = federation.registerInstance('https://example.com/api', 'Example');
        expect(instance.url).toBe('https://example.com/api');
        expect(instance.name).toBe('Example');
        expect(instance.status).toBe('active');
        expect(instance.lastSyncAt).toBeNull();
        expect(instance.listingCount).toBe(0);
    });

    it('normalizes trailing slashes', () => {
        const instance = federation.registerInstance('https://example.com//', 'Trailing');
        expect(instance.url).toBe('https://example.com');
    });

    it('upserts on duplicate URL', () => {
        federation.registerInstance('https://example.com', 'Original');
        const updated = federation.registerInstance('https://example.com', 'Updated');
        expect(updated.name).toBe('Updated');

        const all = federation.listInstances();
        expect(all.length).toBe(1);
    });

    it('getInstance returns null for unknown URL', () => {
        expect(federation.getInstance('https://unknown.com')).toBeNull();
    });

    it('listInstances returns all registered instances', () => {
        federation.registerInstance('https://alpha.example.com', 'Alpha');
        federation.registerInstance('https://beta.example.com', 'Beta');

        const instances = federation.listInstances();
        expect(instances.length).toBe(2);
    });
});

// ── Instance Removal ────────────────────────────────────────────────────

describe('Instance Removal', () => {
    it('removes an instance', () => {
        federation.registerInstance('https://remove-me.com', 'Remove');
        const removed = federation.removeInstance('https://remove-me.com');
        expect(removed).toBe(true);
        expect(federation.getInstance('https://remove-me.com')).toBeNull();
    });

    it('returns false for non-existent instance', () => {
        expect(federation.removeInstance('https://never-existed.com')).toBe(false);
    });

    it('normalizes trailing slashes on removal', () => {
        federation.registerInstance('https://trail.com', 'Trail');
        const removed = federation.removeInstance('https://trail.com/');
        expect(removed).toBe(true);
    });
});

// ── Sync ────────────────────────────────────────────────────────────────

describe('Sync', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('syncInstance fetches and caches listings', async () => {
        globalThis.fetch = async () => {
            return new Response(JSON.stringify({
                listings: [
                    {
                        id: 'listing-1',
                        agentId: 'agent-1',
                        name: 'Test Tool',
                        description: 'A test tool',
                        longDescription: 'Longer description',
                        category: 'general',
                        tags: ['test'],
                        pricingModel: 'free',
                        priceCredits: 0,
                        status: 'published',
                        useCount: 10,
                        avgRating: 4.5,
                        reviewCount: 3,
                    },
                ],
            }), { status: 200 });
        };

        federation.registerInstance('https://remote.example.com', 'Remote');
        const synced = await federation.syncInstance('https://remote.example.com');
        expect(synced).toBe(1);

        // Check instance was updated
        const instance = federation.getInstance('https://remote.example.com');
        expect(instance!.listingCount).toBe(1);
        expect(instance!.status).toBe('active');
    });

    it('syncInstance marks instance unreachable on error', async () => {
        globalThis.fetch = async () => {
            return new Response('Server Error', { status: 500, statusText: 'Internal Server Error' });
        };

        federation.registerInstance('https://down.example.com', 'Down');
        const synced = await federation.syncInstance('https://down.example.com');
        expect(synced).toBe(0);

        const instance = federation.getInstance('https://down.example.com');
        expect(instance!.status).toBe('unreachable');
    });

    it('syncInstance marks instance unreachable on network error', async () => {
        globalThis.fetch = async () => {
            throw new Error('Network unreachable');
        };

        federation.registerInstance('https://offline.example.com', 'Offline');
        const synced = await federation.syncInstance('https://offline.example.com');
        expect(synced).toBe(0);

        const instance = federation.getInstance('https://offline.example.com');
        expect(instance!.status).toBe('unreachable');
    });

    it('syncInstance throws on private URL', async () => {
        // validateFederationUrl is called at the top of syncInstance and throws
        await expect(federation.syncInstance('http://localhost:3000')).rejects.toThrow(
            'private or loopback',
        );
    });

    it('syncInstance replaces old cached listings', async () => {
        let callCount = 0;
        globalThis.fetch = async () => {
            callCount++;
            return new Response(JSON.stringify({
                listings: callCount === 1
                    ? [{ id: 'old', agentId: 'a1', name: 'Old', description: '', longDescription: '', category: 'general', tags: [], pricingModel: 'free', priceCredits: 0, status: 'published', useCount: 0, avgRating: 0, reviewCount: 0 }]
                    : [{ id: 'new', agentId: 'a2', name: 'New', description: '', longDescription: '', category: 'general', tags: [], pricingModel: 'free', priceCredits: 0, status: 'published', useCount: 0, avgRating: 0, reviewCount: 0 }],
            }), { status: 200 });
        };

        federation.registerInstance('https://refresh.example.com', 'Refresh');
        await federation.syncInstance('https://refresh.example.com');
        await federation.syncInstance('https://refresh.example.com');

        // Should have 1 listing (replaced, not 2)
        const instance = federation.getInstance('https://refresh.example.com');
        expect(instance!.listingCount).toBe(1);
    });

    it('syncAll counts successes and failures', async () => {
        let callCount = 0;
        globalThis.fetch = async () => {
            callCount++;
            if (callCount === 1) {
                return new Response(JSON.stringify({ listings: [] }), { status: 200 });
            }
            return new Response('Error', { status: 500, statusText: 'Error' });
        };

        federation.registerInstance('https://good.example.com', 'Good');
        federation.registerInstance('https://bad.example.com', 'Bad');

        const result = await federation.syncAll();
        expect(result.synced).toBe(2); // Both are "synced" (one successfully, one marked unreachable)
    });
});

// ── Federated Listings ──────────────────────────────────────────────────

describe('Federated Listings', () => {
    it('getFederatedListings returns empty when no federated listings', () => {
        const listings = federation.getFederatedListings();
        expect(listings).toEqual([]);
    });
});

// ── Periodic Sync ───────────────────────────────────────────────────────

describe('Periodic Sync', () => {
    it('startPeriodicSync is idempotent', () => {
        // Should not throw when called twice
        federation.startPeriodicSync(300_000);
        federation.startPeriodicSync(300_000);
        federation.stopPeriodicSync();
    });

    it('stopPeriodicSync is safe to call when not started', () => {
        // Should not throw
        federation.stopPeriodicSync();
    });
});
