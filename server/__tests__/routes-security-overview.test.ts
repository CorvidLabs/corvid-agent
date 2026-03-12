import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleSecurityOverviewRoutes } from '../routes/security-overview';

let db: Database;

function fakeReq(method: string, path: string): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    return { req: new Request(url.toString(), { method }), url };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterAll(() => db.close());

describe('Security Overview Routes', () => {
    it('GET /api/security/overview returns security config', async () => {
        const { req, url } = fakeReq('GET', '/api/security/overview');
        const res = handleSecurityOverviewRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);

        const data = await (res as Response).json();

        // Protected paths
        expect(Array.isArray(data.protectedBasenames)).toBe(true);
        expect(data.protectedBasenames.length).toBeGreaterThan(0);
        expect(Array.isArray(data.protectedSubstrings)).toBe(true);
        expect(data.protectedSubstrings.length).toBeGreaterThan(0);

        // Approved domains
        expect(Array.isArray(data.approvedDomains)).toBe(true);
        expect(data.approvedDomains).toContain('api.github.com');

        // Code scanner patterns
        expect(Array.isArray(data.blockedPatterns)).toBe(true);
        const critical = data.blockedPatterns.filter((p: { severity: string }) => p.severity === 'critical');
        const warnings = data.blockedPatterns.filter((p: { severity: string }) => p.severity === 'warning');
        expect(critical.length).toBeGreaterThan(0);
        expect(warnings.length).toBeGreaterThan(0);

        // Governance tiers
        expect(Array.isArray(data.governanceTiers)).toBe(true);
        expect(data.governanceTiers).toHaveLength(3);
        expect(data.governanceTiers[0].label).toBe('Constitutional');
        expect(data.governanceTiers[1].label).toBe('Structural');
        expect(data.governanceTiers[2].label).toBe('Operational');

        // Governance paths
        expect(data.governancePaths.layer0.basenames.length).toBeGreaterThan(0);
        expect(data.governancePaths.layer1.basenames.length).toBeGreaterThan(0);

        // Branch protection
        expect(data.branchProtection).toBeDefined();
        expect(data.branchProtection.enforced).toBe(true);
        expect(data.branchProtection.requiredReviews).toBe(1);
        expect(data.branchProtection.blockForcePushes).toBe(true);
        expect(data.branchProtection.blockDeletions).toBe(true);
        expect(data.branchProtection.enforceAdmins).toBe(true);
        expect(data.branchProtection.requiredStatusChecks.length).toBeGreaterThan(0);

        // Counts (both 0 in fresh DB)
        expect(data.allowlistCount).toBe(0);
        expect(data.blocklistCount).toBe(0);
        expect(data.autoMergeEnabled).toBe(true);
    });

    it('returns null for non-matching paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        expect(handleSecurityOverviewRoutes(req, url, db)).toBeNull();
    });

    it('returns null for non-GET methods', () => {
        const { req, url } = fakeReq('POST', '/api/security/overview');
        expect(handleSecurityOverviewRoutes(req, url, db)).toBeNull();
    });

    it('returns null for wrong subpath', () => {
        const { req, url } = fakeReq('GET', '/api/security/other');
        expect(handleSecurityOverviewRoutes(req, url, db)).toBeNull();
    });

    it('counts reflect actual DB rows', async () => {
        // Use a fresh DB for this test
        const testDb = new Database(':memory:');
        testDb.exec('PRAGMA foreign_keys = ON');
        runMigrations(testDb);

        testDb.query(`INSERT INTO github_allowlist (username) VALUES ('user1')`).run();
        testDb.query(`INSERT INTO github_allowlist (username) VALUES ('user2')`).run();
        testDb.query(`INSERT INTO repo_blocklist (repo, reason) VALUES ('bad/repo', 'test')`).run();

        const { req, url } = fakeReq('GET', '/api/security/overview');
        const res = handleSecurityOverviewRoutes(req, url, testDb);
        const data = await (res as Response).json();

        expect(data.allowlistCount).toBe(2);
        expect(data.blocklistCount).toBe(1);

        testDb.close();
    });

    it('blocked patterns have required fields', async () => {
        const { req, url } = fakeReq('GET', '/api/security/overview');
        const res = handleSecurityOverviewRoutes(req, url, db);
        const data = await (res as Response).json();

        for (const pattern of data.blockedPatterns) {
            expect(pattern).toHaveProperty('name');
            expect(pattern).toHaveProperty('category');
            expect(pattern).toHaveProperty('severity');
            expect(['critical', 'warning']).toContain(pattern.severity);
        }
    });

    it('governance tiers have required structure', async () => {
        const { req, url } = fakeReq('GET', '/api/security/overview');
        const res = handleSecurityOverviewRoutes(req, url, db);
        const data = await (res as Response).json();

        for (const tier of data.governanceTiers) {
            expect(typeof tier.tier).toBe('number');
            expect(typeof tier.label).toBe('string');
            expect(typeof tier.description).toBe('string');
            expect(typeof tier.quorumThreshold).toBe('number');
            expect(typeof tier.requiresHumanApproval).toBe('boolean');
            expect(typeof tier.allowsAutomation).toBe('boolean');
        }
    });
});
