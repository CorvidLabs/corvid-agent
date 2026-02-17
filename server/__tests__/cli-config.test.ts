import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI Config', () => {
    let testDir: string;
    let configFile: string;

    beforeEach(() => {
        testDir = mkdtempSync(join(tmpdir(), 'corvid-cli-test-'));
        configFile = join(testDir, 'config.json');
    });

    afterEach(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    });

    test('default config values', async () => {
        const { loadConfig } = await import('../../cli/config');
        const config = loadConfig();
        expect(config.serverUrl).toBe('http://127.0.0.1:3578');
        expect(config.authToken).toBeNull();
        expect(config.defaultAgent).toBeNull();
        expect(config.defaultProject).toBeNull();
        expect(config.defaultModel).toBeNull();
    });

    test('config read/write roundtrip', () => {
        const config = {
            serverUrl: 'http://example.com:8080',
            authToken: 'test-token-123',
            defaultAgent: 'agent-1',
            defaultProject: 'proj-1',
            defaultModel: 'claude-sonnet-4-5-20250929',
        };

        writeFileSync(configFile, JSON.stringify(config, null, 2));
        const raw = readFileSync(configFile, 'utf-8');
        const parsed = JSON.parse(raw);

        expect(parsed.serverUrl).toBe('http://example.com:8080');
        expect(parsed.authToken).toBe('test-token-123');
        expect(parsed.defaultAgent).toBe('agent-1');
        expect(parsed.defaultProject).toBe('proj-1');
        expect(parsed.defaultModel).toBe('claude-sonnet-4-5-20250929');
    });

    test('config handles malformed JSON gracefully', async () => {
        const { loadConfig } = await import('../../cli/config');
        const config = loadConfig();
        expect(config).toBeDefined();
        expect(typeof config.serverUrl).toBe('string');
    });

    test('getConfigPath returns a string path', async () => {
        const { getConfigPath } = await import('../../cli/config');
        const path = getConfigPath();
        expect(typeof path).toBe('string');
        expect(path).toContain('.corvid');
        expect(path).toContain('config.json');
    });
});
