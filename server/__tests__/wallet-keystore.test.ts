import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, unlinkSync, writeFileSync, chmodSync, statSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const IS_WINDOWS = process.platform === 'win32';

// We test through the module functions. The module reads WALLET_KEYSTORE_PATH
// from env at import time, so we set it before importing.
// Use os.tmpdir() for cross-platform temp directory support.
const TEST_DIR = mkdtempSync(join(tmpdir(), 'corvid-keystore-test-'));
const TEST_KEYSTORE_PATH = join(TEST_DIR, 'test-wallet-keystore.json');
const TEST_TMP_PATH = TEST_KEYSTORE_PATH + '.tmp';

// Override the keystore path for testing
process.env.WALLET_KEYSTORE_PATH = TEST_KEYSTORE_PATH;

// Dynamic import to pick up the env override
const {
    readKeystore,
    getKeystoreEntry,
    saveKeystoreEntry,
    removeKeystoreEntry,
    KEYSTORE_PATH,
} = await import('../lib/wallet-keystore');

function cleanup(): void {
    for (const p of [TEST_KEYSTORE_PATH, TEST_TMP_PATH]) {
        try { unlinkSync(p); } catch { /* ignore */ }
    }
}

describe('wallet-keystore', () => {
    beforeEach(cleanup);
    afterEach(cleanup);

    it('uses the overridden keystore path', () => {
        expect(KEYSTORE_PATH).toBe(TEST_KEYSTORE_PATH);
    });

    it('returns empty data when file does not exist', () => {
        const data = readKeystore();
        expect(data).toEqual({});
    });

    it('saves and retrieves an entry', () => {
        saveKeystoreEntry('agent-1', 'ADDR123', 'encrypted-data-here');

        const entry = getKeystoreEntry('agent-1');
        expect(entry).not.toBeNull();
        expect(entry!.address).toBe('ADDR123');
        expect(entry!.encryptedMnemonic).toBe('encrypted-data-here');
    });

    it('returns null for non-existent entry', () => {
        saveKeystoreEntry('agent-1', 'ADDR123', 'encrypted');
        expect(getKeystoreEntry('agent-2')).toBeNull();
    });

    it('removes an entry', () => {
        saveKeystoreEntry('agent-1', 'ADDR123', 'encrypted');
        saveKeystoreEntry('agent-2', 'ADDR456', 'encrypted2');

        removeKeystoreEntry('agent-1');

        expect(getKeystoreEntry('agent-1')).toBeNull();
        expect(getKeystoreEntry('agent-2')).not.toBeNull();
    });

    it('removing non-existent entry is a no-op', () => {
        saveKeystoreEntry('agent-1', 'ADDR123', 'encrypted');
        removeKeystoreEntry('agent-nonexistent');

        // Original entry should still be there
        expect(getKeystoreEntry('agent-1')).not.toBeNull();
    });

    // POSIX file permission tests — skip on Windows where chmod is a no-op
    it.skipIf(IS_WINDOWS)('creates file with 0o600 permissions', () => {
        saveKeystoreEntry('agent-1', 'ADDR123', 'encrypted');

        expect(existsSync(TEST_KEYSTORE_PATH)).toBe(true);
        const stat = statSync(TEST_KEYSTORE_PATH);
        const mode = stat.mode & 0o777;
        expect(mode).toBe(0o600);
    });

    it.skipIf(IS_WINDOWS)('auto-fixes overly permissive file permissions on read', () => {
        // Write a valid keystore file with wide-open permissions
        writeFileSync(TEST_KEYSTORE_PATH, JSON.stringify({
            'agent-1': { address: 'ADDR123', encryptedMnemonic: 'encrypted' },
        }), 'utf-8');
        chmodSync(TEST_KEYSTORE_PATH, 0o644); // world-readable!

        // Reading should auto-fix permissions and still return data
        const data = readKeystore();
        expect(data['agent-1']).toBeDefined();
        expect(data['agent-1'].address).toBe('ADDR123');

        // Verify permissions were fixed
        const stat = statSync(TEST_KEYSTORE_PATH);
        const mode = stat.mode & 0o777;
        expect(mode).toBe(0o600);
    });

    it('rejects invalid JSON gracefully', () => {
        writeFileSync(TEST_KEYSTORE_PATH, 'not valid json', { encoding: 'utf-8', mode: 0o600 });

        const data = readKeystore();
        expect(data).toEqual({});
    });

    it('rejects array-shaped JSON gracefully', () => {
        writeFileSync(TEST_KEYSTORE_PATH, '[]', { encoding: 'utf-8', mode: 0o600 });

        const data = readKeystore();
        expect(data).toEqual({});
    });

    it('skips entries with invalid shape', () => {
        writeFileSync(TEST_KEYSTORE_PATH, JSON.stringify({
            'valid': { address: 'ADDR', encryptedMnemonic: 'enc' },
            'bad-no-address': { encryptedMnemonic: 'enc' },
            'bad-no-mnemonic': { address: 'ADDR' },
            'bad-number': 42,
            'bad-null': null,
        }), { encoding: 'utf-8', mode: 0o600 });

        const data = readKeystore();
        expect(Object.keys(data)).toEqual(['valid']);
        expect(data['valid'].address).toBe('ADDR');
    });

    it('overwrites existing entry for same agent name', () => {
        saveKeystoreEntry('agent-1', 'ADDR-OLD', 'encrypted-old');
        saveKeystoreEntry('agent-1', 'ADDR-NEW', 'encrypted-new');

        const entry = getKeystoreEntry('agent-1');
        expect(entry!.address).toBe('ADDR-NEW');
        expect(entry!.encryptedMnemonic).toBe('encrypted-new');
    });

    it('preserves other entries when saving', () => {
        saveKeystoreEntry('agent-1', 'ADDR1', 'enc1');
        saveKeystoreEntry('agent-2', 'ADDR2', 'enc2');

        const data = readKeystore();
        expect(Object.keys(data).sort()).toEqual(['agent-1', 'agent-2']);
    });
});
