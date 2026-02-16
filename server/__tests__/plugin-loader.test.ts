import { test, expect, describe } from 'bun:test';
import { isValidPluginName, validateManifest, buildPluginToolName, loadPluginFromPackage } from '../plugins/loader';

describe('Plugin Naming', () => {
    test('valid plugin names', () => {
        expect(isValidPluginName('my-plugin')).toBe(true);
        expect(isValidPluginName('test')).toBe(true);
        expect(isValidPluginName('a123')).toBe(true);
        expect(isValidPluginName('hello-world-plugin')).toBe(true);
    });

    test('invalid plugin names', () => {
        expect(isValidPluginName('')).toBe(false);
        expect(isValidPluginName('MyPlugin')).toBe(false);
        expect(isValidPluginName('my_plugin')).toBe(false);
        expect(isValidPluginName('123abc')).toBe(false);
        expect(isValidPluginName('-starts-with-dash')).toBe(false);
        expect(isValidPluginName('has spaces')).toBe(false);
    });

    test('rejects names over 50 characters', () => {
        expect(isValidPluginName('a'.repeat(51))).toBe(false);
        expect(isValidPluginName('a'.repeat(50))).toBe(true);
    });
});

describe('Plugin Tool Name Building', () => {
    test('builds namespaced tool name', () => {
        expect(buildPluginToolName('my-plugin', 'search')).toBe('corvid_plugin_my_plugin_search');
    });

    test('replaces hyphens with underscores', () => {
        expect(buildPluginToolName('cool-plugin', 'do-thing')).toBe('corvid_plugin_cool_plugin_do-thing');
    });
});

describe('Manifest Validation', () => {
    const validManifest = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'A test plugin',
        author: 'Test Author',
        capabilities: ['db:read'],
    };

    test('accepts valid manifest', () => {
        const result = validateManifest(validManifest);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    test('rejects null/undefined manifest', () => {
        expect(validateManifest(null).valid).toBe(false);
        expect(validateManifest(undefined).valid).toBe(false);
    });

    test('rejects manifest without name', () => {
        const result = validateManifest({ ...validManifest, name: '' });
        expect(result.valid).toBe(false);
    });

    test('rejects manifest with invalid name', () => {
        const result = validateManifest({ ...validManifest, name: 'BadName' });
        expect(result.valid).toBe(false);
    });

    test('rejects manifest without version', () => {
        const result = validateManifest({ ...validManifest, version: '' });
        expect(result.valid).toBe(false);
    });

    test('rejects manifest with invalid capabilities', () => {
        const result = validateManifest({ ...validManifest, capabilities: ['admin:all'] });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Invalid capabilities');
    });

    test('rejects manifest without capabilities array', () => {
        const result = validateManifest({ ...validManifest, capabilities: 'not-array' });
        expect(result.valid).toBe(false);
    });

    test('accepts manifest with empty capabilities', () => {
        const result = validateManifest({ ...validManifest, capabilities: [] });
        expect(result.valid).toBe(true);
    });

    test('accepts manifest with multiple valid capabilities', () => {
        const result = validateManifest({
            ...validManifest,
            capabilities: ['db:read', 'network:outbound', 'fs:project-dir'],
        });
        expect(result.valid).toBe(true);
    });
});

describe('Plugin Loading', () => {
    test('fails for nonexistent package', async () => {
        const result = await loadPluginFromPackage('@corvid-plugin/nonexistent-package-12345');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to import');
    });

    test('fails for package without plugin export', async () => {
        // Use a known package that exists but isn't a corvid plugin
        const result = await loadPluginFromPackage('zod');
        expect(result.success).toBe(false);
        // Will fail because zod doesn't export a CorvidPlugin
    });
});
