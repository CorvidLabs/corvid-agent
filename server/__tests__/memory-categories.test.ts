import { test, expect, describe } from 'bun:test';
import { categorize, allCategories } from '../memory/categories';

describe('Memory Categories', () => {
    // ─── Credential Detection ────────────────────────────────────────────────

    describe('credential category', () => {
        test('detects API key by key name', () => {
            const result = categorize('api-key', 'sk-abc123');
            expect(result.category).toBe('credential');
            expect(result.confidence).toBeGreaterThan(0.3);
        });

        test('detects token by content', () => {
            const result = categorize('auth', 'bearer token for GitHub OAuth');
            expect(result.category).toBe('credential');
        });

        test('detects password reference', () => {
            const result = categorize('db-password', 'hunter2');
            expect(result.category).toBe('credential');
        });
    });

    // ─── Config Detection ────────────────────────────────────────────────────

    describe('config category', () => {
        test('detects config by key pattern', () => {
            const result = categorize('server-config', 'port 8080, host localhost');
            expect(result.category).toBe('config');
        });

        test('detects environment variables', () => {
            const result = categorize('env-vars', 'NODE_ENV=production DATABASE_URL=...');
            expect(result.category).toBe('config');
        });

        test('detects settings by content', () => {
            const result = categorize('app-setup', 'timeout setting is 30 seconds, endpoint is /api/v2');
            expect(result.category).toBe('config');
        });
    });

    // ─── Code Detection ──────────────────────────────────────────────────────

    describe('code category', () => {
        test('detects code snippet', () => {
            const result = categorize('code-snippet', 'async function fetchData() { return await fetch(url); }');
            expect(result.category).toBe('code');
        });

        test('detects TypeScript code', () => {
            const result = categorize('types', 'interface User { id: string; name: string; export class UserService }');
            expect(result.category).toBe('code');
        });
    });

    // ─── Person Detection ────────────────────────────────────────────────────

    describe('person category', () => {
        test('detects person by key', () => {
            const result = categorize('contact-info', 'John Doe, email john@example.com');
            expect(result.category).toBe('person');
        });

        test('detects team member', () => {
            const result = categorize('team', 'team member Alice is the manager');
            expect(result.category).toBe('person');
        });
    });

    // ─── Project Detection ───────────────────────────────────────────────────

    describe('project category', () => {
        test('detects project by key', () => {
            const result = categorize('project-details', 'corvid-agent repo on GitHub');
            expect(result.category).toBe('project');
        });

        test('detects deployment info', () => {
            const result = categorize('deploy-info', 'deploy branch main, release version 2.0');
            expect(result.category).toBe('project');
        });
    });

    // ─── Task Detection ──────────────────────────────────────────────────────

    describe('task category', () => {
        test('detects todo items', () => {
            const result = categorize('todo-list', 'action item: follow up with team on deadline');
            expect(result.category).toBe('task');
        });

        test('detects reminder', () => {
            const result = categorize('reminder', 'task: review PR by Friday, priority high');
            expect(result.category).toBe('task');
        });
    });

    // ─── General / Fallback ──────────────────────────────────────────────────

    describe('general category', () => {
        test('returns general for unrecognized content', () => {
            const result = categorize('xyz', 'lorem ipsum dolor sit amet');
            expect(result.category).toBe('general');
            expect(result.confidence).toBe(0.0);
        });
    });

    // ─── Confidence Scoring ──────────────────────────────────────────────────

    describe('confidence scoring', () => {
        test('higher confidence for stronger signals', () => {
            const weak = categorize('misc', 'has a config in it');
            const strong = categorize('server-config', 'configuration setting for environment variables, endpoint url, port, host');

            expect(strong.confidence).toBeGreaterThan(weak.confidence);
        });

        test('confidence is between 0 and 1', () => {
            const result = categorize('api-key', 'secret token password credential auth');
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        });
    });

    // ─── allCategories helper ────────────────────────────────────────────────

    test('allCategories returns all category types', () => {
        const cats = allCategories();
        expect(cats).toContain('config');
        expect(cats).toContain('code');
        expect(cats).toContain('person');
        expect(cats).toContain('project');
        expect(cats).toContain('credential');
        expect(cats).toContain('preference');
        expect(cats).toContain('fact');
        expect(cats).toContain('conversation');
        expect(cats).toContain('task');
        expect(cats).toContain('general');
        expect(cats.length).toBe(10);
    });
});
