/**
 * PSKContactManager — PSK contact CRUD, URI building, and PSKManager lifecycle.
 *
 * Extracted from AlgoChatBridge to isolate multi-contact PSK management
 * (creating, listing, renaming, deleting contacts) and the per-contact
 * PSKManager lifecycle (setup, start, stop, lookup).
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import { PSKManager } from './psk';
import type { PSKMessage } from './psk';
import { createLogger } from '../lib/logger';

const log = createLogger('PSKContactManager');

export class PSKContactManager {
    private db: Database;
    private config: AlgoChatConfig;
    private service: AlgoChatService;

    /** Active PSK managers keyed by contact ID (psk_contacts.id) */
    private pskManagers: Map<string, PSKManager> = new Map();
    /** Reverse lookup: mobile address → contact ID (populated when address is discovered) */
    private pskAddressToId: Map<string, string> = new Map();

    /** Callback wired by the bridge for routing incoming PSK messages. */
    private onPskMessage: ((msg: PSKMessage) => void) | null = null;

    constructor(db: Database, config: AlgoChatConfig, service: AlgoChatService) {
        this.db = db;
        this.config = config;
        this.service = service;
    }

    /** Set the callback invoked when a PSK manager receives a message. */
    setOnPskMessage(callback: (msg: PSKMessage) => void): void {
        this.onPskMessage = callback;
    }

    // ── Multi-contact PSK CRUD ─────────────────────────────────────────

    /** Create a new PSK contact. Generates a fresh PSK, stores in DB, starts a PSK manager. */
    createPSKContact(nickname: string): { id: string; uri: string; nickname: string } {
        const id = crypto.randomUUID();
        const psk = crypto.getRandomValues(new Uint8Array(32));
        const network = this.config.network;

        this.db.prepare(`
            INSERT INTO psk_contacts (id, nickname, network, initial_psk, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `).run(id, nickname, network, psk);

        // Also create an algochat_psk_state row so the PSKManager can operate
        this.db.prepare(`
            INSERT OR REPLACE INTO algochat_psk_state
                (address, network, initial_psk, label, send_counter, peer_last_counter, seen_counters, last_round, updated_at)
            VALUES (?, ?, ?, ?, 0, 0, '[]', 0, datetime('now'))
        `).run(id, network, psk, nickname);

        // Create and start PSKManager (no known mobile address yet — uses contact ID as address)
        const mgr = new PSKManager(this.db, this.service, { address: id, psk, label: nickname }, network, id);
        this.pskManagers.set(id, mgr);
        // Don't start polling by sender yet — discovery poller handles unmatched contacts
        // mgr.start() will be called once the mobile address is discovered

        const uri = this.buildPSKUri(psk, nickname);
        log.info(`Created PSK contact "${nickname}"`, { id });

        return { id, uri, nickname };
    }

    /** List all PSK contacts for the current network. */
    listPSKContacts(): Array<{
        id: string;
        nickname: string;
        network: string;
        mobileAddress: string | null;
        active: boolean;
        createdAt: string;
    }> {
        const rows = this.db.prepare(
            'SELECT id, nickname, network, mobile_address, active, created_at FROM psk_contacts WHERE network = ? ORDER BY created_at ASC'
        ).all(this.config.network) as Array<{
            id: string;
            nickname: string;
            network: string;
            mobile_address: string | null;
            active: number;
            created_at: string;
        }>;
        return rows.map((r) => ({
            id: r.id,
            nickname: r.nickname,
            network: r.network,
            mobileAddress: r.mobile_address,
            active: r.active === 1,
            createdAt: r.created_at,
        }));
    }

    /** Rename a PSK contact. */
    renamePSKContact(id: string, nickname: string): boolean {
        const result = this.db.prepare(
            "UPDATE psk_contacts SET nickname = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(nickname, id);
        return (result.changes ?? 0) > 0;
    }

    /** Delete a PSK contact permanently. Stops its manager and removes all state. */
    cancelPSKContact(id: string): boolean {
        // Stop and remove the manager first
        const mgr = this.pskManagers.get(id);
        if (mgr) {
            mgr.stop();
            const addr = mgr.contactAddress;
            if (this.pskAddressToId.get(addr) === id) {
                this.pskAddressToId.delete(addr);
            }
            this.pskManagers.delete(id);
        }

        // Delete PSK ratchet state (address may be contact ID or the real mobile address)
        const contact = this.db.prepare('SELECT mobile_address FROM psk_contacts WHERE id = ?').get(id) as { mobile_address: string | null } | null;
        if (contact) {
            const stateAddr = contact.mobile_address ?? id;
            this.db.prepare('DELETE FROM algochat_psk_state WHERE address = ? AND network = ?').run(stateAddr, this.config.network);
        }

        // Hard-delete from psk_contacts
        const result = this.db.prepare('DELETE FROM psk_contacts WHERE id = ?').run(id);
        if ((result.changes ?? 0) === 0) return false;

        log.info(`Deleted PSK contact`, { id });
        return true;
    }

    /** Get the PSK URI for a contact (for QR display). */
    getPSKContactURI(id: string): string | null {
        const row = this.db.prepare(
            'SELECT initial_psk, nickname FROM psk_contacts WHERE id = ?'
        ).get(id) as { initial_psk: Uint8Array; nickname: string } | null;
        if (!row) return null;

        const pskBytes = row.initial_psk instanceof Uint8Array
            ? row.initial_psk
            : new Uint8Array(row.initial_psk as ArrayBuffer);
        return this.buildPSKUri(pskBytes, row.nickname);
    }

    // ── Legacy single-contact PSK API (backward compat) ──────────────

    /** Get or generate a PSK exchange URI for the first contact (backward compat). */
    getPSKExchangeURI(): { uri: string; address: string; network: string; label: string } | null {
        const contacts = this.listPSKContacts();
        if (contacts.length === 0) return null;
        const first = contacts[0];
        const uri = this.getPSKContactURI(first.id);
        if (!uri) return null;
        return {
            uri,
            address: this.service.chatAccount.address,
            network: this.config.network,
            label: first.nickname,
        };
    }

    /** Generate a new PSK exchange URI (backward compat — creates a new contact named "Mobile"). */
    generatePSKExchangeURI(): { uri: string; address: string; network: string; label: string } {
        const result = this.createPSKContact('Mobile');
        return {
            uri: result.uri,
            address: this.service.chatAccount.address,
            network: this.config.network,
            label: result.nickname,
        };
    }

    // ── PSKManager lifecycle ──────────────────────────────────────────

    /** Load all active PSK contacts from DB and create PSKManagers for each. */
    setupPSKManagers(): void {
        // Also support the legacy env-based PSK contact for backward compat
        if (this.config.pskContact) {
            this.setupLegacyPskContact();
        }

        // Load multi-contact entries from psk_contacts table
        const rows = this.db.prepare(
            'SELECT id, nickname, network, initial_psk, mobile_address FROM psk_contacts WHERE network = ? AND active = 1'
        ).all(this.config.network) as Array<{
            id: string;
            nickname: string;
            network: string;
            initial_psk: Uint8Array;
            mobile_address: string | null;
        }>;

        for (const row of rows) {
            if (this.pskManagers.has(row.id)) continue; // skip if already loaded (e.g. legacy)

            const pskBytes = row.initial_psk instanceof Uint8Array
                ? row.initial_psk
                : new Uint8Array(row.initial_psk as ArrayBuffer);

            // The PSKManager address is either the discovered mobile address or the contact ID
            const address = row.mobile_address ?? row.id;

            const mgr = new PSKManager(
                this.db, this.service,
                { address, psk: pskBytes, label: row.nickname },
                this.config.network,
                row.id,
            );
            this.pskManagers.set(row.id, mgr);

            if (row.mobile_address) {
                // Known mobile address: set up reverse lookup and poll by sender
                this.pskAddressToId.set(row.mobile_address, row.id);
                this.wirePskManagerCallbacks(mgr, row.id);
            }

            log.info(`PSK manager loaded for "${row.nickname}"`, { id: row.id, hasAddress: !!row.mobile_address });
        }
    }

    /** Start only matched PSK managers (ones with a known mobile address). */
    startMatched(intervalMs: number): void {
        const matchedIds = new Set(this.pskAddressToId.values());
        for (const [contactId, mgr] of this.pskManagers) {
            if (matchedIds.has(contactId)) {
                mgr.start(intervalMs);
            }
        }
    }

    /** Stop all PSK managers. */
    stopAll(): void {
        for (const mgr of this.pskManagers.values()) {
            mgr.stop();
        }
    }

    /** Check whether there are unmatched contacts (no mobile_address yet). */
    hasUnmatchedContacts(): boolean {
        const row = this.db.prepare(
            'SELECT COUNT(*) as count FROM psk_contacts WHERE network = ? AND active = 1 AND mobile_address IS NULL'
        ).get(this.config.network) as { count: number };
        return row.count > 0;
    }

    /**
     * Promote a discovered contact: record the mobile address, stop old managers,
     * create a fresh PSKManager with the real address, and start polling.
     */
    promoteContact(
        contactId: string,
        mobileAddress: string,
        pskBytes: Uint8Array,
        nickname: string,
        intervalMs: number,
    ): void {
        this.db.prepare(
            "UPDATE psk_contacts SET mobile_address = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(mobileAddress, contactId);

        // If this address was claimed by a legacy manager, stop it
        const legacyContactId = this.pskAddressToId.get(mobileAddress);
        if (legacyContactId && legacyContactId !== contactId) {
            const legacyMgr = this.pskManagers.get(legacyContactId);
            if (legacyMgr) {
                legacyMgr.stop();
                log.info(`Stopped legacy PSK manager`, {
                    legacyContactId,
                    replacedBy: contactId,
                });
            }
            this.pskManagers.delete(legacyContactId);
            this.pskAddressToId.delete(mobileAddress);
        }

        // Stop the old manager keyed by contact ID (the unmatched one with UUID address)
        const oldMgr = this.pskManagers.get(contactId);
        if (oldMgr) oldMgr.stop();

        // Migrate algochat_psk_state from contact-id key to real address.
        this.db.prepare(
            'DELETE FROM algochat_psk_state WHERE address = ? AND network = ?'
        ).run(mobileAddress, this.config.network);
        this.db.prepare(
            'UPDATE algochat_psk_state SET address = ? WHERE address = ? AND network = ?'
        ).run(mobileAddress, contactId, this.config.network);

        // Create fresh manager with real address
        const mgr = new PSKManager(
            this.db, this.service,
            { address: mobileAddress, psk: pskBytes, label: nickname },
            this.config.network,
            contactId,
        );
        this.pskManagers.set(contactId, mgr);
        this.pskAddressToId.set(mobileAddress, contactId);
        this.wirePskManagerCallbacks(mgr, contactId);
        mgr.start(intervalMs);
    }

    /** Look up a PSKManager by participant address (for response routing). */
    lookupPskManager(address: string): PSKManager | null {
        const contactId = this.pskAddressToId.get(address);
        if (!contactId) return null;
        return this.pskManagers.get(contactId) ?? null;
    }

    /** Check if an address belongs to a PSK contact. */
    isPskContact(address: string): boolean {
        return this.pskAddressToId.has(address);
    }

    // ── Private helpers ───────────────────────────────────────────────

    private buildPSKUri(psk: Uint8Array, label: string): string {
        const address = this.service.chatAccount.address;
        const network = this.config.network;
        const pskBase64 = btoa(String.fromCharCode(...psk))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        return `algochat-psk://v1?addr=${address}&psk=${pskBase64}&label=${encodeURIComponent(label)}&network=${network}`;
    }

    /** Set up the legacy single PSK contact from env config. */
    private setupLegacyPskContact(): void {
        const cfg = this.config.pskContact!;

        // Check if there's already a psk_contacts entry for this (migrated or manually created)
        const existing = this.db.prepare(
            "SELECT id FROM psk_contacts WHERE mobile_address = ? AND network = ? AND active = 1"
        ).get(cfg.address, this.config.network) as { id: string } | null;

        if (existing) {
            // Already in multi-contact system; skip legacy setup
            return;
        }

        const mgr = new PSKManager(this.db, this.service, cfg, this.config.network, `legacy-${cfg.address}`);
        const contactId = mgr.contactId;
        this.pskManagers.set(contactId, mgr);
        this.pskAddressToId.set(cfg.address, contactId);
        this.wirePskManagerCallbacks(mgr, contactId);

        log.info(`Legacy PSK manager initialized`, {
            label: cfg.label ?? null,
            address: cfg.address.slice(0, 8) + '...',
            contactId,
        });
    }

    /** Wire a PSKManager's onMessage callback to the bridge handler. */
    private wirePskManagerCallbacks(mgr: PSKManager, _contactId: string): void {
        mgr.onMessage((msg) => {
            if (this.onPskMessage) {
                this.onPskMessage(msg);
            }
        });
    }
}
