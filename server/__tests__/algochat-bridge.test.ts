/**
 * Tests for AlgoChatBridge — the central orchestrator for the AlgoChat system.
 *
 * Since AlgoChatBridge requires AlgoChatService (which needs real blockchain config),
 * these tests focus on:
 *
 * 1. Pure/static helper functions (parseQuestionResponseFromChat, base64ToBytes)
 *    — tested indirectly via the module-level regex patterns
 * 2. PSK contact CRUD at the DB level (psk_contacts table)
 * 3. Group sender pure functions (parseGroupPrefix, reassembleGroupMessage, splitMessage)
 * 4. Approval format functions (formatApprovalForChain, parseApprovalResponse)
 *
 * @module
 */

import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { parseGroupPrefix, reassembleGroupMessage, splitMessage } from '../algochat/group-sender';
import { formatApprovalForChain, parseApprovalResponse } from '../algochat/approval-format';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ─── parseQuestionResponseFromChat (module-private, tested via regex) ─────

describe('parseQuestionResponseFromChat pattern', () => {
    // The bridge uses: /^\[ANS:([a-f0-9-]{8})\]\s*(.+)$/i
    const QUESTION_RESPONSE_REGEX = /^\[ANS:([a-f0-9-]{8})\]\s*(.+)$/i;

    function parseQuestionResponseFromChat(content: string): { shortId: string; answer: string } | null {
        const match = content.match(QUESTION_RESPONSE_REGEX);
        if (!match) return null;
        return { shortId: match[1].toLowerCase(), answer: match[2].trim() };
    }

    test('parses a valid answer with text', () => {
        const result = parseQuestionResponseFromChat('[ANS:abcd1234] Yes, proceed');
        expect(result).not.toBeNull();
        expect(result!.shortId).toBe('abcd1234');
        expect(result!.answer).toBe('Yes, proceed');
    });

    test('parses a numeric answer (option selection)', () => {
        const result = parseQuestionResponseFromChat('[ANS:deadbeef] 2');
        expect(result).not.toBeNull();
        expect(result!.shortId).toBe('deadbeef');
        expect(result!.answer).toBe('2');
    });

    test('is case insensitive for the ANS prefix', () => {
        const result = parseQuestionResponseFromChat('[ans:abcd1234] hello');
        expect(result).not.toBeNull();
        expect(result!.shortId).toBe('abcd1234');
    });

    test('normalizes shortId to lowercase', () => {
        const result = parseQuestionResponseFromChat('[ANS:ABCD1234] hello');
        expect(result).not.toBeNull();
        expect(result!.shortId).toBe('abcd1234');
    });

    test('returns null for non-matching content', () => {
        expect(parseQuestionResponseFromChat('just a normal message')).toBeNull();
        expect(parseQuestionResponseFromChat('[APPROVE?:abc12345] something')).toBeNull();
        expect(parseQuestionResponseFromChat('')).toBeNull();
    });

    test('returns null when shortId is too short', () => {
        expect(parseQuestionResponseFromChat('[ANS:abc] hello')).toBeNull();
    });

    test('returns null when answer is empty', () => {
        expect(parseQuestionResponseFromChat('[ANS:abcd1234]')).toBeNull();
    });

    test('trims whitespace from the answer', () => {
        const result = parseQuestionResponseFromChat('[ANS:abcd1234]   padded answer   ');
        expect(result).not.toBeNull();
        expect(result!.answer).toBe('padded answer');
    });

    test('handles hyphens in shortId (UUID prefix)', () => {
        const result = parseQuestionResponseFromChat('[ANS:abcd-123] answer');
        expect(result).not.toBeNull();
        expect(result!.shortId).toBe('abcd-123');
    });
});

// ─── base64ToBytes (module-private, tested via equivalent logic) ──────────

describe('base64ToBytes equivalent', () => {
    function base64ToBytes(input: string | Uint8Array): Uint8Array {
        if (input instanceof Uint8Array) return input;
        const binary = atob(input);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    test('decodes a simple base64 string', () => {
        // "Hello" in base64 is "SGVsbG8="
        const result = base64ToBytes('SGVsbG8=');
        expect(result).toBeInstanceOf(Uint8Array);
        expect(new TextDecoder().decode(result)).toBe('Hello');
    });

    test('passes through Uint8Array unchanged', () => {
        const input = new Uint8Array([1, 2, 3]);
        const result = base64ToBytes(input);
        expect(result).toBe(input); // same reference
    });

    test('handles empty base64 string', () => {
        const result = base64ToBytes('');
        expect(result.length).toBe(0);
    });

    test('handles binary data (non-UTF8)', () => {
        // Encode bytes 0x00 through 0xFF
        const original = new Uint8Array(256);
        for (let i = 0; i < 256; i++) original[i] = i;
        const base64 = btoa(String.fromCharCode(...original));

        const result = base64ToBytes(base64);
        expect(result.length).toBe(256);
        expect(result[0]).toBe(0);
        expect(result[255]).toBe(255);
    });
});

// ─── PSK Contacts DB CRUD ────────────────────────────────────────────────

describe('psk_contacts DB operations', () => {
    const NETWORK = 'testnet';

    function insertContact(
        id: string,
        nickname: string,
        network: string = NETWORK,
        mobileAddress: string | null = null,
        active: number = 1,
    ): void {
        const psk = crypto.getRandomValues(new Uint8Array(32));
        db.prepare(`
            INSERT INTO psk_contacts (id, nickname, network, initial_psk, mobile_address, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(id, nickname, network, psk, mobileAddress, active);
    }

    test('insert and query a PSK contact', () => {
        insertContact('c1', 'Alice');

        const rows = db.prepare(
            'SELECT id, nickname, network, active FROM psk_contacts WHERE network = ?'
        ).all(NETWORK) as Array<{ id: string; nickname: string; network: string; active: number }>;

        expect(rows.length).toBe(1);
        expect(rows[0].id).toBe('c1');
        expect(rows[0].nickname).toBe('Alice');
        expect(rows[0].network).toBe(NETWORK);
        expect(rows[0].active).toBe(1);
    });

    test('stores and retrieves initial_psk as BLOB', () => {
        const psk = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);
        db.prepare(`
            INSERT INTO psk_contacts (id, nickname, network, initial_psk, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `).run('c-blob', 'BlobTest', NETWORK, psk);

        const row = db.prepare(
            'SELECT initial_psk FROM psk_contacts WHERE id = ?'
        ).get('c-blob') as { initial_psk: Uint8Array };

        // bun:sqlite returns BLOBs as Buffer (Uint8Array subclass)
        expect(row.initial_psk).toBeInstanceOf(Uint8Array);
        expect(row.initial_psk[0]).toBe(0xDE);
        expect(row.initial_psk[3]).toBe(0xEF);
        expect(row.initial_psk.length).toBe(6);
    });

    test('query by network filters correctly', () => {
        insertContact('c1', 'Alice', 'testnet');
        insertContact('c2', 'Bob', 'mainnet');
        insertContact('c3', 'Carol', 'testnet');

        const testnetRows = db.prepare(
            'SELECT id FROM psk_contacts WHERE network = ? ORDER BY created_at ASC'
        ).all('testnet') as Array<{ id: string }>;

        expect(testnetRows.length).toBe(2);
        expect(testnetRows.map((r) => r.id)).toEqual(['c1', 'c3']);

        const mainnetRows = db.prepare(
            'SELECT id FROM psk_contacts WHERE network = ?'
        ).all('mainnet') as Array<{ id: string }>;

        expect(mainnetRows.length).toBe(1);
        expect(mainnetRows[0].id).toBe('c2');
    });

    test('update nickname', () => {
        insertContact('c1', 'Alice');

        const result = db.prepare(
            "UPDATE psk_contacts SET nickname = ?, updated_at = datetime('now') WHERE id = ?"
        ).run('Alice Updated', 'c1');

        expect(result.changes).toBe(1);

        const row = db.prepare('SELECT nickname FROM psk_contacts WHERE id = ?').get('c1') as { nickname: string };
        expect(row.nickname).toBe('Alice Updated');
    });

    test('update nickname returns 0 changes for non-existent contact', () => {
        const result = db.prepare(
            "UPDATE psk_contacts SET nickname = ?, updated_at = datetime('now') WHERE id = ?"
        ).run('Nobody', 'nonexistent');

        expect(result.changes).toBe(0);
    });

    test('delete contact', () => {
        insertContact('c1', 'Alice');
        insertContact('c2', 'Bob');

        const result = db.prepare('DELETE FROM psk_contacts WHERE id = ?').run('c1');
        expect(result.changes).toBe(1);

        const remaining = db.prepare('SELECT id FROM psk_contacts').all() as Array<{ id: string }>;
        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe('c2');
    });

    test('delete non-existent contact returns 0 changes', () => {
        const result = db.prepare('DELETE FROM psk_contacts WHERE id = ?').run('nonexistent');
        expect(result.changes).toBe(0);
    });

    test('update mobile_address on discovery', () => {
        insertContact('c1', 'Alice');

        db.prepare(
            "UPDATE psk_contacts SET mobile_address = ?, updated_at = datetime('now') WHERE id = ?"
        ).run('ALGO_ADDR_ABC123', 'c1');

        const row = db.prepare(
            'SELECT mobile_address FROM psk_contacts WHERE id = ?'
        ).get('c1') as { mobile_address: string | null };

        expect(row.mobile_address).toBe('ALGO_ADDR_ABC123');
    });

    test('query only active contacts with no mobile address (unmatched)', () => {
        insertContact('c1', 'Alice', NETWORK, null, 1);       // unmatched, active
        insertContact('c2', 'Bob', NETWORK, 'ALGO_ADDR', 1);  // matched, active
        insertContact('c3', 'Carol', NETWORK, null, 0);        // unmatched, inactive

        const row = db.prepare(
            'SELECT COUNT(*) as count FROM psk_contacts WHERE network = ? AND active = 1 AND mobile_address IS NULL'
        ).get(NETWORK) as { count: number };

        expect(row.count).toBe(1); // only Alice
    });

    test('list contacts ordered by created_at ASC', () => {
        // Insert in reverse order to test ordering
        insertContact('c3', 'Carol');
        insertContact('c1', 'Alice');
        insertContact('c2', 'Bob');

        const rows = db.prepare(
            'SELECT id, nickname FROM psk_contacts WHERE network = ? ORDER BY created_at ASC'
        ).all(NETWORK) as Array<{ id: string; nickname: string }>;

        // All inserted with datetime('now') so ordering is insertion order
        expect(rows.length).toBe(3);
        expect(rows[0].id).toBe('c3');
        expect(rows[1].id).toBe('c1');
        expect(rows[2].id).toBe('c2');
    });
});

// ─── algochat_psk_state DB operations ────────────────────────────────────

describe('algochat_psk_state DB operations', () => {
    const NETWORK = 'testnet';

    test('insert and query PSK state', () => {
        const psk = crypto.getRandomValues(new Uint8Array(32));

        db.prepare(`
            INSERT OR REPLACE INTO algochat_psk_state
                (address, network, initial_psk, label, send_counter, peer_last_counter, seen_counters, last_round, updated_at)
            VALUES (?, ?, ?, ?, 0, 0, '[]', 0, datetime('now'))
        `).run('contact-uuid', NETWORK, psk, 'Alice');

        const row = db.prepare(
            'SELECT address, network, label, send_counter FROM algochat_psk_state WHERE address = ? AND network = ?'
        ).get('contact-uuid', NETWORK) as { address: string; network: string; label: string; send_counter: number };

        expect(row.address).toBe('contact-uuid');
        expect(row.network).toBe(NETWORK);
        expect(row.label).toBe('Alice');
        expect(row.send_counter).toBe(0);
    });

    test('composite primary key allows same address on different networks', () => {
        const psk = crypto.getRandomValues(new Uint8Array(32));

        db.prepare(`
            INSERT INTO algochat_psk_state (address, network, initial_psk, label)
            VALUES (?, ?, ?, ?)
        `).run('addr1', 'testnet', psk, 'Testnet Contact');

        db.prepare(`
            INSERT INTO algochat_psk_state (address, network, initial_psk, label)
            VALUES (?, ?, ?, ?)
        `).run('addr1', 'mainnet', psk, 'Mainnet Contact');

        const rows = db.prepare('SELECT * FROM algochat_psk_state WHERE address = ?').all('addr1');
        expect(rows.length).toBe(2);
    });

    test('migrate PSK state address (discovery flow)', () => {
        const psk = crypto.getRandomValues(new Uint8Array(32));

        // Initial state uses contact UUID as address
        db.prepare(`
            INSERT INTO algochat_psk_state (address, network, initial_psk, label, send_counter)
            VALUES (?, ?, ?, ?, ?)
        `).run('contact-uuid', NETWORK, psk, 'Alice', 5);

        // On discovery, migrate to real mobile address
        db.prepare(
            'DELETE FROM algochat_psk_state WHERE address = ? AND network = ?'
        ).run('REAL_MOBILE_ADDR', NETWORK);

        db.prepare(
            'UPDATE algochat_psk_state SET address = ? WHERE address = ? AND network = ?'
        ).run('REAL_MOBILE_ADDR', 'contact-uuid', NETWORK);

        // Old address should be gone
        const oldRow = db.prepare(
            'SELECT * FROM algochat_psk_state WHERE address = ? AND network = ?'
        ).get('contact-uuid', NETWORK);
        expect(oldRow).toBeNull();

        // New address should have the migrated state
        const newRow = db.prepare(
            'SELECT send_counter, label FROM algochat_psk_state WHERE address = ? AND network = ?'
        ).get('REAL_MOBILE_ADDR', NETWORK) as { send_counter: number; label: string };

        expect(newRow.send_counter).toBe(5);
        expect(newRow.label).toBe('Alice');
    });
});

// ─── Group Sender: parseGroupPrefix ──────────────────────────────────────

describe('parseGroupPrefix', () => {
    test('parses a valid group chunk prefix', () => {
        const result = parseGroupPrefix('[GRP:1/3]Hello world');
        expect(result).not.toBeNull();
        expect(result!.index).toBe(1);
        expect(result!.total).toBe(3);
        expect(result!.body).toBe('Hello world');
    });

    test('parses a chunk with double-digit indices', () => {
        const result = parseGroupPrefix('[GRP:12/25]content here');
        expect(result).not.toBeNull();
        expect(result!.index).toBe(12);
        expect(result!.total).toBe(25);
        expect(result!.body).toBe('content here');
    });

    test('returns null for non-group message', () => {
        expect(parseGroupPrefix('just a normal message')).toBeNull();
    });

    test('returns null for empty string', () => {
        expect(parseGroupPrefix('')).toBeNull();
    });

    test('returns null when prefix is not at start', () => {
        expect(parseGroupPrefix('text [GRP:1/2]body')).toBeNull();
    });

    test('handles empty body after prefix', () => {
        const result = parseGroupPrefix('[GRP:1/1]');
        expect(result).not.toBeNull();
        expect(result!.body).toBe('');
    });

    test('handles body containing special characters', () => {
        const result = parseGroupPrefix('[GRP:2/3]{"json": "value", "num": 42}');
        expect(result).not.toBeNull();
        expect(result!.body).toBe('{"json": "value", "num": 42}');
    });
});

// ─── Group Sender: reassembleGroupMessage ────────────────────────────────

describe('reassembleGroupMessage', () => {
    test('reassembles chunks in order', () => {
        const chunks = [
            '[GRP:1/3]Hello ',
            '[GRP:2/3]beautiful ',
            '[GRP:3/3]world!',
        ];
        expect(reassembleGroupMessage(chunks)).toBe('Hello beautiful world!');
    });

    test('reassembles chunks regardless of input order', () => {
        const chunks = [
            '[GRP:3/3]world!',
            '[GRP:1/3]Hello ',
            '[GRP:2/3]beautiful ',
        ];
        expect(reassembleGroupMessage(chunks)).toBe('Hello beautiful world!');
    });

    test('returns null for incomplete set', () => {
        const chunks = [
            '[GRP:1/3]Hello ',
            '[GRP:3/3]world!',
        ];
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    test('returns null for empty array', () => {
        expect(reassembleGroupMessage([])).toBeNull();
    });

    test('returns null for non-group messages', () => {
        expect(reassembleGroupMessage(['just text', 'more text'])).toBeNull();
    });

    test('returns null when indices are not sequential', () => {
        const chunks = [
            '[GRP:1/3]Hello ',
            '[GRP:1/3]duplicate ',
            '[GRP:3/3]world!',
        ];
        // Two chunks with index 1, missing index 2
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    test('reassembles single-chunk group message', () => {
        // Unusual but valid: a group of 1
        expect(reassembleGroupMessage(['[GRP:1/1]single chunk'])).toBe('single chunk');
    });
});

// ─── Group Sender: splitMessage ──────────────────────────────────────────

describe('splitMessage', () => {
    test('returns single chunk for short message (no prefix)', () => {
        const result = splitMessage('Hello', 100);
        expect(result.length).toBe(1);
        expect(result[0]).toBe('Hello');
    });

    test('splits long message into prefixed chunks', () => {
        // Use a small maxPayload to force splitting
        const content = 'A'.repeat(200);
        const result = splitMessage(content, 50);

        expect(result.length).toBeGreaterThan(1);

        // Every chunk should have a group prefix
        for (const chunk of result) {
            expect(chunk).toMatch(/^\[GRP:\d+\/\d+\]/);
        }
    });

    test('split and reassemble roundtrips correctly', () => {
        const original = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
        const chunks = splitMessage(original, 50);

        expect(chunks.length).toBeGreaterThan(1);

        const reassembled = reassembleGroupMessage(chunks);
        expect(reassembled).toBe(original);
    });

    test('chunk indices are sequential 1/N to N/N', () => {
        const content = 'X'.repeat(300);
        const chunks = splitMessage(content, 50);

        for (let i = 0; i < chunks.length; i++) {
            const parsed = parseGroupPrefix(chunks[i]);
            expect(parsed).not.toBeNull();
            expect(parsed!.index).toBe(i + 1);
            expect(parsed!.total).toBe(chunks.length);
        }
    });

    test('throws for non-positive maxPayload', () => {
        expect(() => splitMessage('hello', 0)).toThrow('maxPayload must be positive');
        expect(() => splitMessage('hello', -1)).toThrow('maxPayload must be positive');
    });

    test('handles UTF-8 multibyte characters without splitting mid-character', () => {
        // Each emoji is 4 bytes in UTF-8
        const content = '\u{1F600}'.repeat(50); // 200 bytes of emoji
        const chunks = splitMessage(content, 30);

        expect(chunks.length).toBeGreaterThan(1);

        // Reassemble should produce the original (no mangled characters)
        const reassembled = reassembleGroupMessage(chunks);
        expect(reassembled).toBe(content);
    });
});

// ─── Approval Format ─────────────────────────────────────────────────────

describe('formatApprovalForChain', () => {
    test('formats a basic approval request', () => {
        const result = formatApprovalForChain({
            id: 'abcdef1234567890',
            sessionId: 'sess-1',
            toolName: 'bash',
            description: 'Run npm install',
            toolInput: {},
            source: 'algochat',
            createdAt: Date.now(),
            timeoutMs: 120_000,
        });

        expect(result).toContain('[APPROVE?:abcdef12]');
        expect(result).toContain('Run npm install');
        expect(result).toContain("'yes abcdef12'");
        expect(result).toContain("'no abcdef12'");
    });

    test('truncates very long descriptions', () => {
        const longDesc = 'A'.repeat(1000);
        const result = formatApprovalForChain({
            id: 'abcdef1234567890',
            sessionId: 'sess-1',
            toolName: 'bash',
            description: longDesc,
            toolInput: {},
            source: 'algochat',
            createdAt: Date.now(),
            timeoutMs: 120_000,
        });

        // The encoded description should be truncated
        expect(result).toContain('...');
        // Total output should be reasonable for on-chain message
        expect(new TextEncoder().encode(result).byteLength).toBeLessThan(1024);
    });
});

describe('parseApprovalResponse', () => {
    test('parses "yes" + shortId as allow', () => {
        const result = parseApprovalResponse('yes abcdef12');
        expect(result).not.toBeNull();
        expect(result!.shortId).toBe('abcdef12');
        expect(result!.behavior).toBe('allow');
    });

    test('parses "approve" + shortId as allow', () => {
        const result = parseApprovalResponse('approve abcdef12');
        expect(result).not.toBeNull();
        expect(result!.behavior).toBe('allow');
    });

    test('parses "y" + shortId as allow', () => {
        const result = parseApprovalResponse('y abcdef12');
        expect(result).not.toBeNull();
        expect(result!.behavior).toBe('allow');
    });

    test('parses "no" + shortId as deny', () => {
        const result = parseApprovalResponse('no abcdef12');
        expect(result).not.toBeNull();
        expect(result!.shortId).toBe('abcdef12');
        expect(result!.behavior).toBe('deny');
    });

    test('parses "deny" + shortId as deny', () => {
        const result = parseApprovalResponse('deny abcdef12');
        expect(result).not.toBeNull();
        expect(result!.behavior).toBe('deny');
    });

    test('parses "n" + shortId as deny', () => {
        const result = parseApprovalResponse('n abcdef12');
        expect(result).not.toBeNull();
        expect(result!.behavior).toBe('deny');
    });

    test('is case insensitive', () => {
        const result = parseApprovalResponse('YES ABCDEF12');
        expect(result).not.toBeNull();
        expect(result!.behavior).toBe('allow');
    });

    test('trims whitespace', () => {
        const result = parseApprovalResponse('  yes abcdef12  ');
        expect(result).not.toBeNull();
        expect(result!.behavior).toBe('allow');
    });

    test('returns null for unrelated content', () => {
        expect(parseApprovalResponse('hello world')).toBeNull();
        expect(parseApprovalResponse('')).toBeNull();
        expect(parseApprovalResponse('[ANS:abcd1234] answer')).toBeNull();
    });

    test('returns null when shortId is too short', () => {
        expect(parseApprovalResponse('yes abc')).toBeNull();
    });

    test('returns null when shortId is too long', () => {
        expect(parseApprovalResponse('yes abcdef12345')).toBeNull();
    });

    test('handles 4-character short IDs', () => {
        const result = parseApprovalResponse('yes abcd');
        expect(result).not.toBeNull();
        expect(result!.shortId).toBe('abcd');
    });

    test('handles 10-character short IDs', () => {
        const result = parseApprovalResponse('yes abcdef1234');
        expect(result).not.toBeNull();
        expect(result!.shortId).toBe('abcdef1234');
    });
});

// ─── PSK URI building (pattern validation) ───────────────────────────────

describe('PSK URI format', () => {
    test('buildPSKUri produces a well-formed algochat-psk URI', () => {
        // Replicate the logic from bridge.ts buildPSKUri
        const psk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        const address = 'ALGO_ADDR_TEST';
        const network = 'testnet';
        const label = 'My Phone';

        const pskBase64 = btoa(String.fromCharCode(...psk))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const uri = `algochat-psk://v1?addr=${address}&psk=${pskBase64}&label=${encodeURIComponent(label)}&network=${network}`;

        expect(uri).toStartWith('algochat-psk://v1?');
        expect(uri).toContain('addr=ALGO_ADDR_TEST');
        expect(uri).toContain('network=testnet');
        expect(uri).toContain('label=My%20Phone');
        // PSK value should be URL-safe base64 (no +, /, or = in the psk parameter)
        const pskParam = new URL(uri.replace('algochat-psk://', 'https://')).searchParams.get('psk')!;
        expect(pskParam).not.toMatch(/[+/=]/);
        expect(pskParam.length).toBeGreaterThan(0);
    });

    test('PSK base64 is URL-safe', () => {
        // Test with a PSK that produces +, /, and = in standard base64
        const psk = new Uint8Array([0xFF, 0xFE, 0xFD, 0xFC, 0xFB, 0xFA]);
        const standard = btoa(String.fromCharCode(...psk));

        const urlSafe = standard
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        expect(urlSafe).not.toMatch(/[+/=]/);

        // Verify we can decode back to the original
        const decoded = atob(urlSafe.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) {
            bytes[i] = decoded.charCodeAt(i);
        }
        expect(bytes).toEqual(psk);
    });
});

// ─── Device name envelope parsing (handleIncomingMessage pattern) ────────

describe('device name envelope parsing', () => {
    test('extracts message and device name from JSON envelope', () => {
        const content = '{"m":"hello world","d":"iPhone"}';
        const parsed = JSON.parse(content);
        expect(parsed.m).toBe('hello world');
        expect(parsed.d).toBe('iPhone');
    });

    test('plain text is not parsed as envelope', () => {
        const content = 'just a plain message';
        // The bridge only tries to parse if content starts with '{'
        expect(content.startsWith('{')).toBe(false);
    });

    test('malformed JSON starting with { falls back to plain text', () => {
        const content = '{broken json';
        expect(content.startsWith('{')).toBe(true);
        expect(() => JSON.parse(content)).toThrow();
    });

    test('JSON without m field is treated as plain text', () => {
        const content = '{"other": "value"}';
        const parsed = JSON.parse(content);
        expect(typeof parsed.m).toBe('undefined');
    });

    test('prepends device name for agent context', () => {
        const deviceName = 'iPad';
        const messageContent = 'Hello from my device';
        const agentContent = deviceName ? `[From: ${deviceName}] ${messageContent}` : messageContent;
        expect(agentContent).toBe('[From: iPad] Hello from my device');
    });

    test('no device name does not modify content', () => {
        const deviceName: string | undefined = undefined;
        const messageContent = 'Hello';
        const agentContent = deviceName ? `[From: ${deviceName}] ${messageContent}` : messageContent;
        expect(agentContent).toBe('Hello');
    });
});

// ─── Group chunk safety guard regex ──────────────────────────────────────

describe('raw group chunk safety guard', () => {
    // The bridge uses: /^\[GRP:\d+\/\d+\]/.test(messageContent)
    const RAW_GROUP_REGEX = /^\[GRP:\d+\/\d+\]/;

    test('detects raw group chunks', () => {
        expect(RAW_GROUP_REGEX.test('[GRP:1/3]partial chunk')).toBe(true);
        expect(RAW_GROUP_REGEX.test('[GRP:99/99]')).toBe(true);
    });

    test('does not flag normal messages', () => {
        expect(RAW_GROUP_REGEX.test('Hello world')).toBe(false);
        expect(RAW_GROUP_REGEX.test('some [GRP:1/3] in middle')).toBe(false);
        expect(RAW_GROUP_REGEX.test('')).toBe(false);
    });
});

// ─── Transaction dedup (pattern test) ────────────────────────────────────

describe('transaction dedup set behavior', () => {
    test('Set deduplicates txids', () => {
        const processedTxids = new Set<string>();
        processedTxids.add('txid-1');
        processedTxids.add('txid-2');
        processedTxids.add('txid-1'); // duplicate

        expect(processedTxids.size).toBe(2);
        expect(processedTxids.has('txid-1')).toBe(true);
        expect(processedTxids.has('txid-3')).toBe(false);
    });

    test('prune to last 500 entries', () => {
        let processedTxids = new Set<string>();
        for (let i = 0; i < 600; i++) {
            processedTxids.add(`txid-${i}`);
        }

        expect(processedTxids.size).toBe(600);

        // Replicate bridge pruning logic
        if (processedTxids.size > 500) {
            const all = [...processedTxids];
            processedTxids = new Set(all.slice(all.length - 500));
        }

        expect(processedTxids.size).toBe(500);
        // Should keep the most recent entries
        expect(processedTxids.has('txid-599')).toBe(true);
        expect(processedTxids.has('txid-100')).toBe(true);
        // Should have pruned the oldest
        expect(processedTxids.has('txid-0')).toBe(false);
        expect(processedTxids.has('txid-99')).toBe(false);
    });
});
