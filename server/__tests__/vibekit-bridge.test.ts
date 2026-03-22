import { describe, test, expect } from 'bun:test';
import { buildVibeKitConfig, detectVibeKit, VIBEKIT_TOOL_CATEGORIES, ALL_VIBEKIT_TOOLS } from '../mcp/vibekit-bridge';

describe('VibeKit Bridge', () => {
    describe('buildVibeKitConfig', () => {
        test('returns a valid McpServerConfig with defaults', () => {
            const config = buildVibeKitConfig('agent-1');
            expect(config.name).toBe('vibekit');
            expect(config.command).toBe('vibekit');
            expect(config.args).toEqual(['mcp']);
            expect(config.agentId).toBe('agent-1');
            expect(config.enabled).toBe(true);
            expect(config.envVars).toBeDefined();
            expect(config.envVars!.ALGORAND_NETWORK).toBe('testnet');
        });

        test('uses null agentId for global config', () => {
            const config = buildVibeKitConfig(null);
            expect(config.agentId).toBeNull();
            expect(config.id).toBe('vibekit-global');
        });

        test('respects custom network in envConfig', () => {
            const config = buildVibeKitConfig('agent-1', { network: 'mainnet' });
            expect(config.envVars!.ALGORAND_NETWORK).toBe('mainnet');
        });

        test('passes custom Algod URL from envConfig', () => {
            const config = buildVibeKitConfig('agent-1', {
                algodUrl: 'https://custom-algod.example.com',
                algodToken: 'my-token',
            });
            expect(config.envVars!.ALGOD_SERVER).toBe('https://custom-algod.example.com');
            expect(config.envVars!.ALGOD_TOKEN).toBe('my-token');
        });

        test('passes custom Indexer URL from envConfig', () => {
            const config = buildVibeKitConfig('agent-1', {
                indexerUrl: 'https://custom-indexer.example.com',
                indexerToken: 'idx-token',
            });
            expect(config.envVars!.INDEXER_SERVER).toBe('https://custom-indexer.example.com');
            expect(config.envVars!.INDEXER_TOKEN).toBe('idx-token');
        });

        test('config has correct timestamps', () => {
            const before = new Date().toISOString();
            const config = buildVibeKitConfig('agent-1');
            const after = new Date().toISOString();
            expect(config.createdAt >= before).toBe(true);
            expect(config.createdAt <= after).toBe(true);
        });
    });

    describe('detectVibeKit', () => {
        test('returns null or a version string', async () => {
            const result = await detectVibeKit();
            // VibeKit may or may not be installed in CI
            expect(result === null || typeof result === 'string').toBe(true);
        });
    });

    describe('tool categories', () => {
        test('VIBEKIT_TOOL_CATEGORIES has expected categories', () => {
            expect(VIBEKIT_TOOL_CATEGORIES.contracts).toContain('appDeploy');
            expect(VIBEKIT_TOOL_CATEGORIES.assets).toContain('createAsset');
            expect(VIBEKIT_TOOL_CATEGORIES.accounts).toContain('listAccounts');
            expect(VIBEKIT_TOOL_CATEGORIES.state).toContain('readGlobalState');
            expect(VIBEKIT_TOOL_CATEGORIES.indexer).toContain('lookupTransaction');
            expect(VIBEKIT_TOOL_CATEGORIES.transactions).toContain('sendGroupTransactions');
            expect(VIBEKIT_TOOL_CATEGORIES.utilities).toContain('validateAddress');
        });

        test('ALL_VIBEKIT_TOOLS contains all category tools', () => {
            for (const tools of Object.values(VIBEKIT_TOOL_CATEGORIES)) {
                for (const tool of tools) {
                    expect(ALL_VIBEKIT_TOOLS).toContain(tool);
                }
            }
        });

        test('ALL_VIBEKIT_TOOLS has no duplicates', () => {
            const unique = new Set(ALL_VIBEKIT_TOOLS);
            expect(unique.size).toBe(ALL_VIBEKIT_TOOLS.length);
        });
    });
});
