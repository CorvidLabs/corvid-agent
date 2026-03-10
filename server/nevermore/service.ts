/**
 * NevermoreService — Bridge Nevermore NFT holders to corvid-agent credits.
 *
 * Verifies NFT ownership on Algorand and grants a one-time credit allocation.
 * Supports revoking holders whose NFT is no longer in their wallet.
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { grantCredits } from '../db/credits';

const log = createLogger('NevermoreService');

/** Default credit allocation for Nevermore holders. */
export const NEVERMORE_CREDITS = 500;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NftHolder {
    id: string;
    walletAddress: string;
    assetId: number;
    verifiedAt: string;
    creditsGranted: number;
    status: 'active' | 'revoked';
    createdAt: string;
}

interface NftHolderRecord {
    id: string;
    wallet_address: string;
    asset_id: number;
    verified_at: string;
    credits_granted: number;
    status: string;
    created_at: string;
}

function recordToHolder(row: NftHolderRecord): NftHolder {
    return {
        id: row.id,
        walletAddress: row.wallet_address,
        assetId: row.asset_id,
        verifiedAt: row.verified_at,
        creditsGranted: row.credits_granted,
        status: row.status as NftHolder['status'],
        createdAt: row.created_at,
    };
}

// ─── Algorand ASA Verification ───────────────────────────────────────────────

export interface AssetVerifier {
    /** Check if a wallet holds a specific ASA. Returns the balance (0 = not held). */
    getAssetBalance(walletAddress: string, assetId: number): Promise<number>;
}

/**
 * Default verifier using Algorand SDK. Queries algod for account info.
 */
export class AlgorandAssetVerifier implements AssetVerifier {
    private algodClient: unknown;

    constructor(algodClient: unknown) {
        this.algodClient = algodClient;
    }

    async getAssetBalance(walletAddress: string, assetId: number): Promise<number> {
        try {
            const client = this.algodClient as { accountInformation(addr: string): { do(): Promise<{ assets?: Array<{ 'asset-id': number; amount: number }> }> } };
            const info = await client.accountInformation(walletAddress).do();
            const asset = info.assets?.find((a) => a['asset-id'] === assetId);
            return asset?.amount ?? 0;
        } catch {
            return 0;
        }
    }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class NevermoreService {
    private db: Database;
    private verifier: AssetVerifier | null;
    private assetId: number;
    private creditAllocation: number;

    constructor(
        db: Database,
        assetId: number,
        opts?: { verifier?: AssetVerifier | null; creditAllocation?: number },
    ) {
        this.db = db;
        this.assetId = assetId;
        this.verifier = opts?.verifier ?? null;
        this.creditAllocation = opts?.creditAllocation ?? NEVERMORE_CREDITS;
    }

    /**
     * Verify NFT ownership and grant credits if valid.
     * Returns the holder record on success, null if the wallet doesn't hold the NFT.
     * Throws if a holder record already exists for this wallet+asset pair.
     */
    async verify(walletAddress: string): Promise<NftHolder | null> {
        // Check for existing holder
        const existing = this.getHolder(walletAddress);
        if (existing) {
            if (existing.status === 'active') {
                return existing; // Already verified
            }
            // Revoked — allow re-verification below
        }

        // Verify NFT ownership on-chain
        if (this.verifier) {
            const balance = await this.verifier.getAssetBalance(walletAddress, this.assetId);
            if (balance <= 0) {
                return null;
            }
        }

        const id = crypto.randomUUID();

        if (existing && existing.status === 'revoked') {
            // Re-activate revoked holder
            this.db.query(`
                UPDATE nft_holders
                SET status = 'active', verified_at = datetime('now'), credits_granted = credits_granted + ?
                WHERE id = ?
            `).run(this.creditAllocation, existing.id);

            grantCredits(this.db, walletAddress, this.creditAllocation, 'nevermore_nft_holder');
            log.info('NFT holder re-verified', { walletAddress: walletAddress.slice(0, 8) + '...', assetId: this.assetId });
            return this.getHolderById(existing.id);
        }

        // New holder
        this.db.query(`
            INSERT INTO nft_holders (id, wallet_address, asset_id, credits_granted)
            VALUES (?, ?, ?, ?)
        `).run(id, walletAddress, this.assetId, this.creditAllocation);

        grantCredits(this.db, walletAddress, this.creditAllocation, 'nevermore_nft_holder');
        log.info('NFT holder verified and credits granted', {
            walletAddress: walletAddress.slice(0, 8) + '...',
            assetId: this.assetId,
            credits: this.creditAllocation,
        });

        return this.getHolderById(id);
    }

    /**
     * Get holder status for a wallet.
     */
    getHolder(walletAddress: string): NftHolder | null {
        const row = this.db.query(
            'SELECT * FROM nft_holders WHERE wallet_address = ? AND asset_id = ?',
        ).get(walletAddress, this.assetId) as NftHolderRecord | null;

        return row ? recordToHolder(row) : null;
    }

    /**
     * Get holder by ID.
     */
    getHolderById(id: string): NftHolder | null {
        const row = this.db.query(
            'SELECT * FROM nft_holders WHERE id = ?',
        ).get(id) as NftHolderRecord | null;

        return row ? recordToHolder(row) : null;
    }

    /**
     * Revoke a holder (e.g., NFT was transferred away).
     */
    revoke(walletAddress: string): boolean {
        const result = this.db.query(`
            UPDATE nft_holders SET status = 'revoked'
            WHERE wallet_address = ? AND asset_id = ? AND status = 'active'
        `).run(walletAddress, this.assetId);

        if (result.changes > 0) {
            log.info('NFT holder revoked', { walletAddress: walletAddress.slice(0, 8) + '...' });
        }

        return result.changes > 0;
    }

    /**
     * List all holders (optionally filtered by status).
     */
    listHolders(status?: NftHolder['status']): NftHolder[] {
        const rows = status
            ? this.db.query('SELECT * FROM nft_holders WHERE asset_id = ? AND status = ? ORDER BY created_at DESC')
                  .all(this.assetId, status) as NftHolderRecord[]
            : this.db.query('SELECT * FROM nft_holders WHERE asset_id = ? ORDER BY created_at DESC')
                  .all(this.assetId) as NftHolderRecord[];

        return rows.map(recordToHolder);
    }

    /**
     * Re-verify all active holders against on-chain state.
     * Revokes holders who no longer hold the NFT.
     */
    async audit(): Promise<{ verified: number; revoked: number }> {
        if (!this.verifier) return { verified: 0, revoked: 0 };

        const holders = this.listHolders('active');
        let verified = 0;
        let revoked = 0;

        for (const holder of holders) {
            const balance = await this.verifier.getAssetBalance(holder.walletAddress, this.assetId);
            if (balance > 0) {
                verified++;
            } else {
                this.revoke(holder.walletAddress);
                revoked++;
            }
        }

        if (revoked > 0) {
            log.info('NFT holder audit complete', { verified, revoked });
        }

        return { verified, revoked };
    }
}
