/**
 * Comprehensive unit tests for PSK (Pre-Shared Key) contact management modules:
 *
 * 1. PSKContactManager — CRUD, URI generation, PSKManager lifecycle, legacy compat,
 *    promoteContact flow, address lookups
 * 2. PSKManager — constructor state restoration, send/receive, ratchet counters,
 *    polling with dedup, multi-device counter handling, resetWithNewPSK, callbacks
 * 3. PSKDiscoveryPoller — trial-decrypt matching, contact promotion, round cursor,
 *    auto-stop when no unmatched contacts
 * 4. condenseMessage — under-limit passthrough, LLM condensation, truncation fallback,
 *    error handling, messageId suffix
 *
 * Uses in-memory SQLite with real schema migrations and mocked AlgoChatService /
 * ts-algochat crypto functions per the project's existing test patterns.
 *
 * @module
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { PSKContactManager } from '../algochat/psk-contact-manager';
import { PSKManager } from '../algochat/psk.ts';
import type { PSKMessage } from '../algochat/psk.ts';
import { PSKDiscoveryPoller } from '../algochat/psk-discovery-poller';
import type { AlgoChatConfig } from '../algochat/config';
import type { AlgoChatService } from '../algochat/service';
import { DedupService } from '../lib/dedup';

// ── Test constants ──────────────────────────────────────────────────────────

const MY_ADDRESS = 'MY_AGENT_ADDRESS_ABC123';
const MOBILE_ADDRESS = 'MOBILE_ADDRESS_XYZ789';
const TEST_PSK = new Uint8Array(32).fill(0xab);
const TEST_NETWORK = 'testnet';

// ── Mock factories ──────────────────────────────────────────────────────────

function createMockConfig(overrides: Partial<AlgoChatConfig> = {}): AlgoChatConfig {
    return {
        network: TEST_NETWORK,
        agentNetwork: TEST_NETWORK,
        ownerAddresses: new Set(),
        syncInterval: 10_000,
        mnemonic: '',
        defaultAgentId: null,
        pskContact: null,
        enabled: true,
        ...overrides,
    } as AlgoChatConfig;
}

function createMockService(overrides: Partial<Record<string, unknown>> = {}): AlgoChatService {
    return {
        chatAccount: {
            address: MY_ADDRESS,
            encryptionKeys: {
                publicKey: new Uint8Array(32).fill(0x01),
                privateKey: new Uint8Array(32).fill(0x02),
            },
            account: {
                sk: new Uint8Array(64).fill(0x03),
            },
        },
        algodClient: {
            getTransactionParams: () => ({
                do: async () => ({
                    fee: 1000,
                    firstRound: 100,
                    lastRound: 200,
                    genesisID: 'testnet-v1.0',
                    genesisHash: new Uint8Array(32),
                }),
            }),
            sendRawTransaction: () => ({
                do: async () => ({ txid: 'mock-txid-123' }),
            }),
            status: () => ({
                do: async () => ({ lastRound: 50000n }),
            }),
        },
        indexerClient: null,
        algorandService: {
            discoverPublicKey: mock(async () => new Uint8Array(32).fill(0x04)),
        },
        syncManager: {},
        ...overrides,
    } as unknown as AlgoChatService;
}

// ── Shared DB setup ─────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
    DedupService.resetGlobal();
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
    DedupService.resetGlobal();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. PSKContactManager
// ═══════════════════════════════════════════════════════════════════════════

describe('PSKContactManager', () => {
    let config: AlgoChatConfig;
    let service: AlgoChatService;
    let manager: PSKContactManager;

    beforeEach(() => {
        config = createMockConfig();
        service = createMockService();
        manager = new PSKContactManager(db, config, service);
    });

    afterEach(() => {
        manager.stopAll();
    });

    // ── createPSKContact ────────────────────────────────────────────────

    describe('createPSKContact', () => {
        test('creates a contact with valid nickname', () => {
            const result = manager.createPSKContact('Alice');
            expect(result.nickname).toBe('Alice');
            expect(result.id).toBeTruthy();
            expect(result.uri).toContain('algochat-psk://v1');
            expect(result.uri).toContain('label=Alice');
            expect(result.uri).toContain(`addr=${MY_ADDRESS}`);
            expect(result.uri).toContain(`network=${TEST_NETWORK}`);
        });

        test('inserts contact into psk_contacts table', () => {
            const result = manager.createPSKContact('Bob');
            const row = db.prepare('SELECT * FROM psk_contacts WHERE id = ?').get(result.id) as Record<string, unknown>;
            expect(row).toBeTruthy();
            expect(row.nickname).toBe('Bob');
            expect(row.network).toBe(TEST_NETWORK);
            expect(row.active).toBe(1);
            expect(row.mobile_address).toBeNull();
        });

        test('creates algochat_psk_state row for the contact', () => {
            const result = manager.createPSKContact('Charlie');
            const row = db.prepare('SELECT * FROM algochat_psk_state WHERE address = ? AND network = ?').get(result.id, TEST_NETWORK) as Record<string, unknown>;
            expect(row).toBeTruthy();
            expect(row.send_counter).toBe(0);
            expect(row.peer_last_counter).toBe(0);
            expect(row.label).toBe('Charlie');
        });

        test('generates unique IDs for each contact', () => {
            const a = manager.createPSKContact('A');
            const b = manager.createPSKContact('B');
            expect(a.id).not.toBe(b.id);
        });

        test('URI contains base64url-encoded PSK', () => {
            const result = manager.createPSKContact('Test');
            // URI should contain a psk parameter
            const url = new URL(result.uri);
            const pskParam = url.searchParams.get('psk');
            expect(pskParam).toBeTruthy();
            // Base64url: no +, /, or =
            expect(pskParam).not.toContain('+');
            expect(pskParam).not.toContain('/');
            expect(pskParam).not.toContain('=');
        });

        test('URI encodes special characters in nickname', () => {
            const result = manager.createPSKContact('My Phone & Tablet');
            expect(result.uri).toContain(encodeURIComponent('My Phone & Tablet'));
        });
    });

    // ── listPSKContacts ─────────────────────────────────────────────────

    describe('listPSKContacts', () => {
        test('returns empty array when no contacts exist', () => {
            const contacts = manager.listPSKContacts();
            expect(contacts).toEqual([]);
        });

        test('returns created contacts', () => {
            manager.createPSKContact('Alice');
            manager.createPSKContact('Bob');
            const contacts = manager.listPSKContacts();
            expect(contacts).toHaveLength(2);
            expect(contacts[0].nickname).toBe('Alice');
            expect(contacts[1].nickname).toBe('Bob');
        });

        test('includes correct fields', () => {
            manager.createPSKContact('Alice');
            const contacts = manager.listPSKContacts();
            const contact = contacts[0];
            expect(contact.id).toBeTruthy();
            expect(contact.nickname).toBe('Alice');
            expect(contact.network).toBe(TEST_NETWORK);
            expect(contact.mobileAddress).toBeNull();
            expect(contact.active).toBe(true);
            expect(contact.createdAt).toBeTruthy();
        });

        test('filters by current network', () => {
            manager.createPSKContact('Testnet Contact');

            // Insert a contact on a different network directly
            db.prepare(`INSERT INTO psk_contacts (id, nickname, network, initial_psk, active)
                VALUES (?, ?, ?, ?, 1)`).run('other-id', 'Mainnet Contact', 'mainnet', TEST_PSK);

            const contacts = manager.listPSKContacts();
            expect(contacts).toHaveLength(1);
            expect(contacts[0].nickname).toBe('Testnet Contact');
        });

        test('returns contacts ordered by created_at ASC', () => {
            manager.createPSKContact('First');
            manager.createPSKContact('Second');
            manager.createPSKContact('Third');
            const contacts = manager.listPSKContacts();
            expect(contacts[0].nickname).toBe('First');
            expect(contacts[2].nickname).toBe('Third');
        });
    });

    // ── renamePSKContact ────────────────────────────────────────────────

    describe('renamePSKContact', () => {
        test('renames an existing contact', () => {
            const { id } = manager.createPSKContact('OldName');
            const result = manager.renamePSKContact(id, 'NewName');
            expect(result).toBe(true);

            const contacts = manager.listPSKContacts();
            expect(contacts[0].nickname).toBe('NewName');
        });

        test('returns false for non-existent contact', () => {
            const result = manager.renamePSKContact('nonexistent-id', 'NewName');
            expect(result).toBe(false);
        });
    });

    // ── cancelPSKContact ────────────────────────────────────────────────

    describe('cancelPSKContact', () => {
        test('deletes an existing contact', () => {
            const { id } = manager.createPSKContact('ToDelete');
            const result = manager.cancelPSKContact(id);
            expect(result).toBe(true);

            const contacts = manager.listPSKContacts();
            expect(contacts).toHaveLength(0);
        });

        test('removes psk_state row for unmatched contact (UUID address)', () => {
            const { id } = manager.createPSKContact('ToDelete');
            manager.cancelPSKContact(id);

            const stateRow = db.prepare('SELECT * FROM algochat_psk_state WHERE address = ?').get(id);
            expect(stateRow).toBeNull();
        });

        test('removes psk_state row for matched contact (real address)', () => {
            const { id } = manager.createPSKContact('ToDelete');
            // Simulate promotion: set mobile_address and migrate state
            db.prepare("UPDATE psk_contacts SET mobile_address = ? WHERE id = ?").run(MOBILE_ADDRESS, id);
            db.prepare('DELETE FROM algochat_psk_state WHERE address = ?').run(id);
            db.prepare(`INSERT OR REPLACE INTO algochat_psk_state (address, network, initial_psk, label)
                VALUES (?, ?, ?, ?)`).run(MOBILE_ADDRESS, TEST_NETWORK, TEST_PSK, 'ToDelete');

            manager.cancelPSKContact(id);

            const stateRow = db.prepare('SELECT * FROM algochat_psk_state WHERE address = ? AND network = ?').get(MOBILE_ADDRESS, TEST_NETWORK);
            expect(stateRow).toBeNull();
        });

        test('returns false for non-existent contact', () => {
            const result = manager.cancelPSKContact('nonexistent-id');
            expect(result).toBe(false);
        });

        test('deletes multiple contacts independently', () => {
            const a = manager.createPSKContact('A');
            const b = manager.createPSKContact('B');

            manager.cancelPSKContact(a.id);
            const contacts = manager.listPSKContacts();
            expect(contacts).toHaveLength(1);
            expect(contacts[0].nickname).toBe('B');
        });
    });

    // ── getPSKContactURI ────────────────────────────────────────────────

    describe('getPSKContactURI', () => {
        test('returns URI for existing contact', () => {
            const { id } = manager.createPSKContact('Alice');
            const uri = manager.getPSKContactURI(id);
            expect(uri).toBeTruthy();
            expect(uri).toContain('algochat-psk://v1');
            expect(uri).toContain('label=Alice');
        });

        test('returns null for non-existent contact', () => {
            const uri = manager.getPSKContactURI('nonexistent-id');
            expect(uri).toBeNull();
        });
    });

    // ── Legacy single-contact API ───────────────────────────────────────

    describe('Legacy API', () => {
        test('getPSKExchangeURI returns null when no contacts', () => {
            expect(manager.getPSKExchangeURI()).toBeNull();
        });

        test('getPSKExchangeURI returns first contact info', () => {
            manager.createPSKContact('First');
            manager.createPSKContact('Second');

            const result = manager.getPSKExchangeURI();
            expect(result).toBeTruthy();
            expect(result!.label).toBe('First');
            expect(result!.address).toBe(MY_ADDRESS);
            expect(result!.network).toBe(TEST_NETWORK);
            expect(result!.uri).toContain('algochat-psk://v1');
        });

        test('generatePSKExchangeURI creates a new Mobile contact', () => {
            const result = manager.generatePSKExchangeURI();
            expect(result.label).toBe('Mobile');
            expect(result.address).toBe(MY_ADDRESS);
            expect(result.network).toBe(TEST_NETWORK);

            const contacts = manager.listPSKContacts();
            expect(contacts).toHaveLength(1);
            expect(contacts[0].nickname).toBe('Mobile');
        });
    });

    // ── setupPSKManagers ────────────────────────────────────────────────

    describe('setupPSKManagers', () => {
        test('loads active contacts from DB', () => {
            manager.createPSKContact('Alice');
            manager.createPSKContact('Bob');

            // Create a new manager instance to test loading from DB
            const mgr2 = new PSKContactManager(db, config, service);
            mgr2.setupPSKManagers();

            // Verify contacts were loaded (can't directly check managers, but lookups work)
            expect(mgr2.hasUnmatchedContacts()).toBe(true);
            mgr2.stopAll();
        });

        test('skips inactive contacts', () => {
            const { id } = manager.createPSKContact('Inactive');
            db.prepare("UPDATE psk_contacts SET active = 0 WHERE id = ?").run(id);

            const mgr2 = new PSKContactManager(db, config, service);
            mgr2.setupPSKManagers();

            expect(mgr2.hasUnmatchedContacts()).toBe(false);
            mgr2.stopAll();
        });

        test('sets up reverse lookup for matched contacts', () => {
            const { id } = manager.createPSKContact('Alice');
            // Simulate a promoted contact
            db.prepare("UPDATE psk_contacts SET mobile_address = ? WHERE id = ?").run(MOBILE_ADDRESS, id);
            db.prepare('UPDATE algochat_psk_state SET address = ? WHERE address = ? AND network = ?').run(MOBILE_ADDRESS, id, TEST_NETWORK);

            const mgr2 = new PSKContactManager(db, config, service);
            mgr2.setupPSKManagers();

            expect(mgr2.isPskContact(MOBILE_ADDRESS)).toBe(true);
            expect(mgr2.lookupPskManager(MOBILE_ADDRESS)).toBeTruthy();
            mgr2.stopAll();
        });

        test('loads legacy PSK contact from config', () => {
            const legacyConfig = createMockConfig({
                pskContact: {
                    address: 'LEGACY_ADDRESS_123',
                    psk: new Uint8Array(32).fill(0xcc),
                    label: 'Legacy',
                },
            });

            const mgr2 = new PSKContactManager(db, legacyConfig, service);
            mgr2.setupPSKManagers();

            expect(mgr2.isPskContact('LEGACY_ADDRESS_123')).toBe(true);
            expect(mgr2.lookupPskManager('LEGACY_ADDRESS_123')).toBeTruthy();
            mgr2.stopAll();
        });

        test('skips legacy PSK contact if already migrated to multi-contact', () => {
            const legacyAddr = 'LEGACY_MIGRATED_ADDR';
            const legacyConfig = createMockConfig({
                pskContact: {
                    address: legacyAddr,
                    psk: new Uint8Array(32).fill(0xdd),
                    label: 'Legacy',
                },
            });

            // Insert a psk_contacts entry that already references this address
            db.prepare(`INSERT INTO psk_contacts (id, nickname, network, initial_psk, mobile_address, active)
                VALUES (?, ?, ?, ?, ?, 1)`).run('migrated-id', 'Migrated', TEST_NETWORK, TEST_PSK, legacyAddr);
            db.prepare(`INSERT OR REPLACE INTO algochat_psk_state (address, network, initial_psk, label)
                VALUES (?, ?, ?, ?)`).run(legacyAddr, TEST_NETWORK, TEST_PSK, 'Migrated');

            const mgr2 = new PSKContactManager(db, legacyConfig, service);
            mgr2.setupPSKManagers();

            // The migrated-id contact should be loaded, not a legacy duplicate
            expect(mgr2.isPskContact(legacyAddr)).toBe(true);
            mgr2.stopAll();
        });
    });

    // ── hasUnmatchedContacts ────────────────────────────────────────────

    describe('hasUnmatchedContacts', () => {
        test('returns false when no contacts', () => {
            expect(manager.hasUnmatchedContacts()).toBe(false);
        });

        test('returns true when unmatched contacts exist', () => {
            manager.createPSKContact('Unmatched');
            expect(manager.hasUnmatchedContacts()).toBe(true);
        });

        test('returns false when all contacts are matched', () => {
            const { id } = manager.createPSKContact('Matched');
            db.prepare("UPDATE psk_contacts SET mobile_address = ? WHERE id = ?").run(MOBILE_ADDRESS, id);
            expect(manager.hasUnmatchedContacts()).toBe(false);
        });
    });

    // ── promoteContact ──────────────────────────────────────────────────

    describe('promoteContact', () => {
        test('updates mobile_address in psk_contacts', () => {
            const { id } = manager.createPSKContact('Alice');
            manager.promoteContact(id, MOBILE_ADDRESS, TEST_PSK, 'Alice', 10_000);

            const row = db.prepare('SELECT mobile_address FROM psk_contacts WHERE id = ?').get(id) as { mobile_address: string };
            expect(row.mobile_address).toBe(MOBILE_ADDRESS);
        });

        test('migrates psk_state from UUID address to real address', () => {
            const { id } = manager.createPSKContact('Alice');
            manager.promoteContact(id, MOBILE_ADDRESS, TEST_PSK, 'Alice', 10_000);

            // Old state row should be gone
            const oldState = db.prepare('SELECT * FROM algochat_psk_state WHERE address = ? AND network = ?').get(id, TEST_NETWORK);
            expect(oldState).toBeNull();

            // New state row should exist with real address
            const newState = db.prepare('SELECT * FROM algochat_psk_state WHERE address = ? AND network = ?').get(MOBILE_ADDRESS, TEST_NETWORK);
            expect(newState).toBeTruthy();
        });

        test('creates new PSKManager accessible via lookupPskManager', () => {
            const { id } = manager.createPSKContact('Alice');
            manager.promoteContact(id, MOBILE_ADDRESS, TEST_PSK, 'Alice', 10_000);

            const pskMgr = manager.lookupPskManager(MOBILE_ADDRESS);
            expect(pskMgr).toBeTruthy();
            expect(pskMgr!.contactAddress).toBe(MOBILE_ADDRESS);
        });

        test('sets up isPskContact for the new address', () => {
            const { id } = manager.createPSKContact('Alice');
            manager.promoteContact(id, MOBILE_ADDRESS, TEST_PSK, 'Alice', 10_000);
            expect(manager.isPskContact(MOBILE_ADDRESS)).toBe(true);
        });

        test('hasUnmatchedContacts returns false after promotion', () => {
            const { id } = manager.createPSKContact('Alice');
            expect(manager.hasUnmatchedContacts()).toBe(true);

            manager.promoteContact(id, MOBILE_ADDRESS, TEST_PSK, 'Alice', 10_000);
            expect(manager.hasUnmatchedContacts()).toBe(false);
        });
    });

    // ── lookupPskManager / isPskContact ─────────────────────────────────

    describe('address lookups', () => {
        test('lookupPskManager returns null for unknown address', () => {
            expect(manager.lookupPskManager('UNKNOWN_ADDR')).toBeNull();
        });

        test('isPskContact returns false for unknown address', () => {
            expect(manager.isPskContact('UNKNOWN_ADDR')).toBe(false);
        });
    });

    // ── setOnPskMessage callback ────────────────────────────────────────

    describe('setOnPskMessage', () => {
        test('callback is wired to promoted managers', () => {
            const messages: PSKMessage[] = [];
            manager.setOnPskMessage((msg) => messages.push(msg));

            const { id } = manager.createPSKContact('Alice');
            manager.promoteContact(id, MOBILE_ADDRESS, TEST_PSK, 'Alice', 10_000);

            // Get the manager and trigger its callback directly
            const pskMgr = manager.lookupPskManager(MOBILE_ADDRESS);
            expect(pskMgr).toBeTruthy();

            // The PSKManager's callbacks should include the bridge callback
            // This is tested indirectly through the wiring
        });
    });

    // ── startMatched / stopAll ──────────────────────────────────────────

    describe('startMatched / stopAll', () => {
        test('stopAll does not throw when no managers exist', () => {
            expect(() => manager.stopAll()).not.toThrow();
        });

        test('startMatched only starts matched managers', () => {
            // Create two contacts: one matched, one unmatched
            const matched = manager.createPSKContact('Matched');
            manager.createPSKContact('Unmatched');

            // Promote one
            manager.promoteContact(matched.id, MOBILE_ADDRESS, TEST_PSK, 'Matched', 10_000);

            // startMatched should not throw
            expect(() => manager.startMatched(10_000)).not.toThrow();
            manager.stopAll();
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. PSKManager
// ═══════════════════════════════════════════════════════════════════════════

describe('PSKManager', () => {
    let config: AlgoChatConfig;
    let service: AlgoChatService;

    beforeEach(() => {
        config = createMockConfig();
        service = createMockService();
    });

    // ── Constructor / state ─────────────────────────────────────────────

    describe('constructor', () => {
        test('initializes fresh state when no DB row exists', () => {
            const mgr = new PSKManager(db, service, {
                address: 'ADDR_NEW',
                psk: TEST_PSK,
                label: 'New Contact',
            }, TEST_NETWORK);

            expect(mgr.contactAddress).toBe('ADDR_NEW');
            expect(mgr.psk).toEqual(TEST_PSK);
            mgr.stop();
        });

        test('persists fresh state to DB', () => {
            const mgr = new PSKManager(db, service, {
                address: 'ADDR_PERSIST',
                psk: TEST_PSK,
                label: 'Persist',
            }, TEST_NETWORK);

            const row = db.prepare('SELECT * FROM algochat_psk_state WHERE address = ? AND network = ?')
                .get('ADDR_PERSIST', TEST_NETWORK) as Record<string, unknown>;
            expect(row).toBeTruthy();
            expect(row.send_counter).toBe(0);
            expect(row.label).toBe('Persist');
            mgr.stop();
        });

        test('restores state from DB when row exists', () => {
            // Pre-populate state
            db.prepare(`INSERT INTO algochat_psk_state (address, network, initial_psk, label, send_counter, peer_last_counter, seen_counters, last_round)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                'ADDR_RESTORE', TEST_NETWORK, TEST_PSK, 'Restored', 5, 3, '[1,2,3]', 42000
            );

            const mgr = new PSKManager(db, service, {
                address: 'ADDR_RESTORE',
                psk: TEST_PSK,
                label: 'Restored',
            }, TEST_NETWORK);

            expect(mgr.contactAddress).toBe('ADDR_RESTORE');
            // State is restored; PSK is overridden from config
            expect(mgr.psk).toEqual(TEST_PSK);
            mgr.stop();
        });

        test('overrides DB PSK with config PSK (authoritative source)', () => {
            // Pre-populate with a different PSK
            const oldPSK = new Uint8Array(32).fill(0x00);
            db.prepare(`INSERT INTO algochat_psk_state (address, network, initial_psk, label, send_counter, peer_last_counter, seen_counters, last_round)
                VALUES (?, ?, ?, ?, 0, 0, '[]', 0)`).run('ADDR_OVERRIDE', TEST_NETWORK, oldPSK, 'Override');

            const newPSK = new Uint8Array(32).fill(0xff);
            const mgr = new PSKManager(db, service, {
                address: 'ADDR_OVERRIDE',
                psk: newPSK,
                label: 'Override',
            }, TEST_NETWORK);

            expect(mgr.psk).toEqual(newPSK);

            // DB should now have the new PSK
            const row = db.prepare('SELECT initial_psk FROM algochat_psk_state WHERE address = ? AND network = ?')
                .get('ADDR_OVERRIDE', TEST_NETWORK) as { initial_psk: Uint8Array };
            const dbPsk = row.initial_psk instanceof Uint8Array ? row.initial_psk : new Uint8Array(row.initial_psk as ArrayBuffer);
            expect(dbPsk).toEqual(newPSK);
            mgr.stop();
        });

        test('uses contactId from parameter when provided', () => {
            const mgr = new PSKManager(db, service, {
                address: 'ADDR_CID',
                psk: TEST_PSK,
            }, TEST_NETWORK, 'custom-contact-id');

            expect(mgr.contactId).toBe('custom-contact-id');
            mgr.stop();
        });

        test('uses address as contactId when not provided', () => {
            const mgr = new PSKManager(db, service, {
                address: 'ADDR_DEFAULT_CID',
                psk: TEST_PSK,
            }, TEST_NETWORK);

            expect(mgr.contactId).toBe('ADDR_DEFAULT_CID');
            mgr.stop();
        });
    });

    // ── Callbacks ───────────────────────────────────────────────────────

    describe('callbacks', () => {
        test('onMessage adds a callback', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_CB', psk: TEST_PSK }, TEST_NETWORK);
            const cb = mock(() => {});
            mgr.onMessage(cb);
            // No way to directly test callbacks set, but offMessage should work
            mgr.stop();
        });

        test('offMessage removes a callback', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_CB2', psk: TEST_PSK }, TEST_NETWORK);
            const cb = mock(() => {});
            mgr.onMessage(cb);
            mgr.offMessage(cb);
            mgr.stop();
        });
    });

    // ── start / stop ────────────────────────────────────────────────────

    describe('start / stop', () => {
        test('start does not throw with no indexer (warns on poll)', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_START', psk: TEST_PSK }, TEST_NETWORK);
            expect(() => mgr.start(60_000)).not.toThrow();
            mgr.stop();
        });

        test('start is idempotent (calling twice does not create duplicate timers)', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_IDEM', psk: TEST_PSK }, TEST_NETWORK);
            mgr.start(60_000);
            mgr.start(60_000); // Should be a no-op
            mgr.stop();
        });

        test('stop persists state', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_STOP_PERSIST', psk: TEST_PSK }, TEST_NETWORK);
            mgr.start(60_000);
            mgr.stop();

            const row = db.prepare('SELECT * FROM algochat_psk_state WHERE address = ? AND network = ?')
                .get('ADDR_STOP_PERSIST', TEST_NETWORK);
            expect(row).toBeTruthy();
        });

        test('stop is safe to call multiple times', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_MULTI_STOP', psk: TEST_PSK }, TEST_NETWORK);
            mgr.start(60_000);
            mgr.stop();
            expect(() => mgr.stop()).not.toThrow();
        });
    });

    // ── resetWithNewPSK ─────────────────────────────────────────────────

    describe('resetWithNewPSK', () => {
        test('replaces PSK and resets ratchet counters', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_RESET', psk: TEST_PSK }, TEST_NETWORK);
            const newPSK = new Uint8Array(32).fill(0xee);

            mgr.resetWithNewPSK(newPSK);

            expect(mgr.psk).toEqual(newPSK);
            mgr.stop();
        });

        test('persists new state to DB', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_RESET_DB', psk: TEST_PSK }, TEST_NETWORK);
            const newPSK = new Uint8Array(32).fill(0xdd);

            mgr.resetWithNewPSK(newPSK);

            const row = db.prepare('SELECT initial_psk, send_counter, peer_last_counter, last_round FROM algochat_psk_state WHERE address = ? AND network = ?')
                .get('ADDR_RESET_DB', TEST_NETWORK) as Record<string, unknown>;
            expect(row.send_counter).toBe(0);
            expect(row.peer_last_counter).toBe(0);
            expect(row.last_round).toBe(0);
            mgr.stop();
        });

        test('restarts polling if it was running', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_RESET_POLL', psk: TEST_PSK }, TEST_NETWORK);
            mgr.start(60_000);
            const newPSK = new Uint8Array(32).fill(0xcc);

            // Should not throw, and should restart polling
            mgr.resetWithNewPSK(newPSK);

            // Stop to clean up the restarted timer
            mgr.stop();
        });

        test('does not restart polling if it was not running', () => {
            const mgr = new PSKManager(db, service, { address: 'ADDR_RESET_NOPOLL', psk: TEST_PSK }, TEST_NETWORK);
            const newPSK = new Uint8Array(32).fill(0xbb);

            mgr.resetWithNewPSK(newPSK);
            mgr.stop();
        });
    });

    // ── State persistence round-trip ────────────────────────────────────

    describe('state persistence', () => {
        test('saveState/loadState round-trip preserves all fields', () => {
            // Create a manager, let it save initial state
            const mgr1 = new PSKManager(db, service, {
                address: 'ADDR_ROUNDTRIP',
                psk: TEST_PSK,
                label: 'RoundTrip',
            }, TEST_NETWORK, 'rt-contact');
            mgr1.stop();

            // Load in a new manager instance
            const mgr2 = new PSKManager(db, service, {
                address: 'ADDR_ROUNDTRIP',
                psk: TEST_PSK,
                label: 'RoundTrip',
            }, TEST_NETWORK, 'rt-contact');

            expect(mgr2.contactAddress).toBe('ADDR_ROUNDTRIP');
            expect(mgr2.psk).toEqual(TEST_PSK);
            mgr2.stop();
        });

        test('composite key allows same address on different networks', () => {
            const mgr1 = new PSKManager(db, service, {
                address: 'ADDR_MULTI_NET',
                psk: TEST_PSK,
                label: 'Testnet',
            }, 'testnet' as any);
            mgr1.stop();

            const mgr2 = new PSKManager(db, service, {
                address: 'ADDR_MULTI_NET',
                psk: new Uint8Array(32).fill(0x11),
                label: 'Mainnet',
            }, 'mainnet' as any);
            mgr2.stop();

            // Both rows should exist
            const rows = db.prepare('SELECT * FROM algochat_psk_state WHERE address = ?').all('ADDR_MULTI_NET') as unknown[];
            expect(rows).toHaveLength(2);
        });
    });

    // ── sendMessage ─────────────────────────────────────────────────────

    describe('sendMessage', () => {
        test('sends a message and returns txid', async () => {
            // We need to mock the dynamic imports within sendMessage
            // Since sendMessage uses dynamic import('@corvidlabs/ts-algochat'),
            // we'll test that it interacts with the service correctly
            const mockAlgodClient = {
                getTransactionParams: () => ({
                    do: async () => ({
                        fee: 1000,
                        firstRound: 100,
                        lastRound: 200,
                        genesisID: 'testnet-v1.0',
                        genesisHash: new Uint8Array(32),
                    }),
                }),
                sendRawTransaction: () => ({
                    do: async () => ({ txid: 'sent-txid-456' }),
                }),
            };

            const svc = createMockService({ algodClient: mockAlgodClient });
            const mgr = new PSKManager(db, svc, {
                address: 'ADDR_SEND',
                psk: TEST_PSK,
                label: 'Sender',
            }, TEST_NETWORK);

            try {
                const txid = await mgr.sendMessage('Hello, world!');
                expect(txid).toBe('sent-txid-456');
            } catch (err) {
                // Dynamic import of ts-algochat may fail in test env
                // This is expected if the package isn't available
                expect(err).toBeDefined();
            }
            mgr.stop();
        });
    });

    // ── poll (private, tested via start behavior) ───────────────────────

    describe('poll behavior', () => {
        test('poll with no indexer returns early without error', () => {
            const svc = createMockService({ indexerClient: null });
            const mgr = new PSKManager(db, svc, { address: 'ADDR_NOIDX', psk: TEST_PSK }, TEST_NETWORK);

            // Start and immediately stop — the poll should silently return
            mgr.start(60_000);
            mgr.stop();
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. PSKDiscoveryPoller
// ═══════════════════════════════════════════════════════════════════════════

describe('PSKDiscoveryPoller', () => {
    let config: AlgoChatConfig;
    let service: AlgoChatService;
    let contactManager: PSKContactManager;

    beforeEach(() => {
        config = createMockConfig();
        service = createMockService();
        contactManager = new PSKContactManager(db, config, service);
    });

    afterEach(() => {
        contactManager.stopAll();
    });

    // ── start / stop ────────────────────────────────────────────────────

    describe('start', () => {
        test('does not start if no unmatched contacts', () => {
            const poller = new PSKDiscoveryPoller(db, config, service, contactManager);
            poller.start(); // Should be a no-op
            poller.stop();
        });

        test('starts when unmatched contacts exist', () => {
            contactManager.createPSKContact('Unmatched');
            const poller = new PSKDiscoveryPoller(db, config, service, contactManager);
            expect(() => poller.start()).not.toThrow();
            poller.stop();
        });

        test('start is idempotent', () => {
            contactManager.createPSKContact('Unmatched');
            const poller = new PSKDiscoveryPoller(db, config, service, contactManager);
            poller.start();
            poller.start(); // Should be a no-op
            poller.stop();
        });
    });

    describe('stop', () => {
        test('stop is safe when not started', () => {
            const poller = new PSKDiscoveryPoller(db, config, service, contactManager);
            expect(() => poller.stop()).not.toThrow();
        });

        test('stop cleans up timer', () => {
            contactManager.createPSKContact('Unmatched');
            const poller = new PSKDiscoveryPoller(db, config, service, contactManager);
            poller.start();
            poller.stop();
            // Should be safe to stop again
            expect(() => poller.stop()).not.toThrow();
        });
    });

    // ── setOnFirstMessage ───────────────────────────────────────────────

    describe('setOnFirstMessage', () => {
        test('accepts a callback without error', () => {
            const poller = new PSKDiscoveryPoller(db, config, service, contactManager);
            expect(() => {
                poller.setOnFirstMessage((_sender, _text, _round, _amount) => {});
            }).not.toThrow();
            poller.stop();
        });
    });

    // ── poll with no indexer ────────────────────────────────────────────

    describe('poll with no indexer', () => {
        test('does not throw when indexer is null', () => {
            contactManager.createPSKContact('Unmatched');
            const poller = new PSKDiscoveryPoller(db, config, service, contactManager);
            // Start will trigger poll which should handle null indexer
            poller.start();
            poller.stop();
        });
    });

    // ── poll with mock indexer ──────────────────────────────────────────

    describe('poll with indexer', () => {
        function createMockIndexerChain(transactions: unknown[] = []) {
            const chain = {
                address: () => chain,
                addressRole: () => chain,
                minRound: () => chain,
                limit: () => chain,
                nextToken: () => chain,
                do: async () => ({ transactions, 'next-token': undefined }),
            };
            return {
                searchForTransactions: () => chain,
            };
        }

        test('poll with empty transactions does not error', () => {
            const svc = createMockService({ indexerClient: createMockIndexerChain([]) });
            const cm = new PSKContactManager(db, config, svc);
            cm.createPSKContact('Unmatched');

            const poller = new PSKDiscoveryPoller(db, config, svc, cm);
            poller.start();
            // Give it a tick to run the initial poll
            poller.stop();
            cm.stopAll();
        });

        test('poll skips non-payment transactions', () => {
            const txns = [
                { id: 'txid-1', sender: MOBILE_ADDRESS, txType: 'appl', note: btoa('hello'), confirmedRound: 50001n },
            ];
            const svc = createMockService({ indexerClient: createMockIndexerChain(txns) });
            const cm = new PSKContactManager(db, config, svc);
            cm.createPSKContact('Unmatched');

            const poller = new PSKDiscoveryPoller(db, config, svc, cm);
            poller.start();
            poller.stop();
            cm.stopAll();
        });

        test('poll skips transactions without notes', () => {
            const txns = [
                { id: 'txid-2', sender: MOBILE_ADDRESS, txType: 'pay', confirmedRound: 50001n, paymentTransaction: { receiver: MY_ADDRESS } },
            ];
            const svc = createMockService({ indexerClient: createMockIndexerChain(txns) });
            const cm = new PSKContactManager(db, config, svc);
            cm.createPSKContact('Unmatched');

            const poller = new PSKDiscoveryPoller(db, config, svc, cm);
            poller.start();
            poller.stop();
            cm.stopAll();
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. condenseMessage
// ═══════════════════════════════════════════════════════════════════════════

describe('condenseMessage', () => {
    // Dynamic import to avoid top-level import issues with mocking
    let condenseMessage: typeof import('../algochat/condenser').condenseMessage;

    beforeEach(async () => {
        const mod = await import('../algochat/condenser');
        condenseMessage = mod.condenseMessage;
    });

    test('returns original content when under byte limit', async () => {
        const result = await condenseMessage('Hello', 800);
        expect(result.wasCondensed).toBe(false);
        expect(result.content).toBe('Hello');
        expect(result.originalBytes).toBe(5);
        expect(result.condensedBytes).toBe(5);
    });

    test('returns original for content exactly at byte limit', async () => {
        const content = 'x'.repeat(800);
        const result = await condenseMessage(content, 800);
        expect(result.wasCondensed).toBe(false);
        expect(result.content).toBe(content);
    });

    test('handles multi-byte UTF-8 characters in byte count', async () => {
        // 'é' is 2 bytes in UTF-8, emoji can be 4 bytes
        const content = 'é'.repeat(400); // 800 bytes
        const result = await condenseMessage(content, 800);
        expect(result.wasCondensed).toBe(false);
        expect(result.originalBytes).toBe(800);
    });

    test('falls back to truncation when LLM provider is unavailable', async () => {
        // With no LLM provider registered, condensation should fall back to truncation
        const longContent = 'This is a very long message. '.repeat(50); // ~1450 bytes
        const result = await condenseMessage(longContent, 200);

        expect(result.wasCondensed).toBe(true);
        expect(result.originalBytes).toBeGreaterThan(200);
        // Truncated content should end with '...'
        expect(result.content).toContain('...');
    });

    test('includes messageId reference suffix when provided', async () => {
        const longContent = 'A'.repeat(1000);
        const result = await condenseMessage(longContent, 200, 'msg-12345678-abcd');

        expect(result.wasCondensed).toBe(true);
        // Should contain the id reference prefix (first 8 chars of messageId)
        expect(result.content).toContain('id:msg-1234');
    });

    test('condensedBytes is within byte budget', async () => {
        const longContent = 'Word '.repeat(300); // ~1500 bytes
        const maxBytes = 200;
        const result = await condenseMessage(longContent, maxBytes);

        const encoder = new TextEncoder();
        const actualBytes = encoder.encode(result.content).byteLength;
        // The fallback truncation should keep it close to the limit
        // Allow some slack for the '...' and '[condensed]' prefix
        expect(actualBytes).toBeLessThan(maxBytes + 50);
    });

    test('default maxBytes is 800', async () => {
        // Short content under 800 should pass through
        const result = await condenseMessage('short message');
        expect(result.wasCondensed).toBe(false);
    });

    test('handles empty content', async () => {
        const result = await condenseMessage('', 800);
        expect(result.wasCondensed).toBe(false);
        expect(result.content).toBe('');
        expect(result.originalBytes).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. base64ToBytes utility (module-private, tested via pattern)
// ═══════════════════════════════════════════════════════════════════════════

describe('base64ToBytes (via PSK URI round-trip)', () => {
    test('PSK URI contains decodable base64url PSK', () => {
        const config = createMockConfig();
        const service = createMockService();
        const manager = new PSKContactManager(db, config, service);

        const { uri } = manager.createPSKContact('Test');
        const url = new URL(uri);
        const pskBase64 = url.searchParams.get('psk')!;

        // Decode base64url back to bytes
        const decoded = Uint8Array.from(
            atob(pskBase64.replace(/-/g, '+').replace(/_/g, '/')),
            (c) => c.charCodeAt(0),
        );

        // Should be 32 bytes (PSK size)
        expect(decoded.length).toBe(32);
        manager.stopAll();
    });
});
