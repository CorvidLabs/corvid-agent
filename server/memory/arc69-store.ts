/**
 * ARC-69 Long-Term Memory Store
 *
 * Provides CRUD operations for mutable on-chain memories stored as
 * Algorand Standard Assets with ARC-69 metadata. Memory content is
 * encrypted using AlgoChat's self-to-self envelope so only the owning
 * agent can decrypt.
 *
 * Localnet only — other networks use the existing plain-transaction path.
 */
import type { Database } from 'bun:sqlite';
import type { ChatAccount } from '@corvidlabs/ts-algochat';
import { createLogger } from '../lib/logger';

/** Lazily load ts-algochat (optional dependency). */
async function getAlgoChat() {
    return import('@corvidlabs/ts-algochat');
}

const log = createLogger('Arc69Store');

// ── Types ──────────────────────────────────────────────────────────

export interface Arc69Context {
    db: Database;
    agentId: string;
    algodClient: import('algosdk').default.Algodv2;
    indexerClient: import('algosdk').default.Indexer;
    chatAccount: ChatAccount;
}

export interface Arc69Memory {
    asaId: number;
    key: string;
    content: string;
    txid: string;
    round: number;
    timestamp: string;
}

export interface Arc69NotePayload {
    standard: 'arc69';
    description: 'corvid-agent memory';
    mime_type: 'application/octet-stream';
    properties: {
        key: string;
        agent_id: string;
        envelope: string;
        v: number;
    };
}

// ── Helpers ────────────────────────────────────────────────────────

/** Encrypt memory content as an AlgoChat self-to-self envelope, returned as base64. */
async function encryptContent(content: string, account: ChatAccount): Promise<string> {
    const { encryptMessage, encodeEnvelope } = await getAlgoChat();
    const envelope = encryptMessage(
        content,
        account.encryptionKeys.publicKey,
        account.encryptionKeys.publicKey,
    );
    const encoded = encodeEnvelope(envelope);
    // Convert Uint8Array to base64 without Buffer
    return btoa(String.fromCharCode(...encoded));
}

/** Decrypt a base64-encoded AlgoChat envelope back to plaintext. */
async function decryptContent(envelopeB64: string, account: ChatAccount): Promise<string | null> {
    const { decryptMessage, decodeEnvelope } = await getAlgoChat();
    const raw = atob(envelopeB64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const envelope = decodeEnvelope(bytes);
    const result = decryptMessage(
        envelope,
        account.encryptionKeys.privateKey,
        account.encryptionKeys.publicKey,
    );
    return result?.text ?? null;
}

/** Build the ARC-69 JSON note as a Uint8Array for transaction notes. */
function buildNotePayload(key: string, agentId: string, envelopeB64: string): Uint8Array {
    const payload: Arc69NotePayload = {
        standard: 'arc69',
        description: 'corvid-agent memory',
        mime_type: 'application/octet-stream',
        properties: {
            key,
            agent_id: agentId,
            envelope: envelopeB64,
            v: 1,
        },
    };
    return new TextEncoder().encode(JSON.stringify(payload));
}

/** Parse an ARC-69 note from raw bytes, returning null on any parse failure. */
function parseNotePayload(noteBytes: Uint8Array): Arc69NotePayload | null {
    try {
        const json = new TextDecoder().decode(noteBytes);
        const parsed = JSON.parse(json);
        if (parsed?.standard !== 'arc69' || !parsed?.properties?.envelope) return null;
        return parsed as Arc69NotePayload;
    } catch {
        return null;
    }
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Mint a new ASA representing a memory.
 * Sets the agent wallet as manager. Stores encrypted content in ARC-69 note.
 */
export async function createMemoryAsa(
    ctx: Arc69Context,
    key: string,
    content: string,
): Promise<{ asaId: number; txid: string }> {
    const algosdk = (await import('algosdk')).default;
    const envelopeB64 = await encryptContent(content, ctx.chatAccount);
    const note = buildNotePayload(key, ctx.agentId, envelopeB64);

    // Validate note fits in Algorand's 1024-byte limit
    if (note.byteLength > 1024) {
        throw new Error(`ARC-69 note exceeds 1024 bytes (${note.byteLength}). Memory content is too large.`);
    }

    const params = await ctx.algodClient.getTransactionParams().do();
    const assetName = `mem:${key}`.slice(0, 32); // max 32 chars

    const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
        sender: ctx.chatAccount.address,
        total: 1,
        decimals: 0,
        defaultFrozen: false,
        manager: ctx.chatAccount.address,
        reserve: undefined,
        freeze: undefined,
        clawback: undefined,
        unitName: 'CRVMEM',
        assetName,
        assetURL: '',
        note,
        suggestedParams: params,
    });

    const signedTxn = txn.signTxn(ctx.chatAccount.account.sk);
    const { txid } = await ctx.algodClient.sendRawTransaction(signedTxn).do();

    // Wait for confirmation to get the ASA ID
    const confirmed = await algosdk.waitForConfirmation(ctx.algodClient, txid, 4);
    const asaId = Number(confirmed.assetIndex);

    log.info('Created memory ASA', { key, asaId, txid, agentId: ctx.agentId });
    return { asaId, txid };
}

/**
 * Send an acfg transaction to update the ARC-69 note with new content.
 */
export async function updateMemoryAsa(
    ctx: Arc69Context,
    asaId: number,
    key: string,
    content: string,
): Promise<{ txid: string }> {
    const algosdk = (await import('algosdk')).default;
    const envelopeB64 = await encryptContent(content, ctx.chatAccount);
    const note = buildNotePayload(key, ctx.agentId, envelopeB64);

    if (note.byteLength > 1024) {
        throw new Error(`ARC-69 note exceeds 1024 bytes (${note.byteLength}). Memory content is too large.`);
    }

    const params = await ctx.algodClient.getTransactionParams().do();

    const txn = algosdk.makeAssetConfigTxnWithSuggestedParamsFromObject({
        sender: ctx.chatAccount.address,
        assetIndex: asaId,
        manager: ctx.chatAccount.address,
        reserve: undefined,
        freeze: undefined,
        clawback: undefined,
        note,
        suggestedParams: params,
        strictEmptyAddressChecking: false,
    });

    const signedTxn = txn.signTxn(ctx.chatAccount.account.sk);
    const { txid } = await ctx.algodClient.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(ctx.algodClient, txid, 4);

    log.info('Updated memory ASA', { key, asaId, txid, agentId: ctx.agentId });
    return { txid };
}

/**
 * Delete a memory ASA.
 * - soft: sends acfg with empty note (ASA preserved, content forgotten)
 * - hard: destroys the ASA entirely
 */
export async function deleteMemoryAsa(
    ctx: Arc69Context,
    asaId: number,
    mode: 'soft' | 'hard' = 'soft',
): Promise<{ txid: string }> {
    const algosdk = (await import('algosdk')).default;
    const params = await ctx.algodClient.getTransactionParams().do();

    let txn;
    if (mode === 'hard') {
        txn = algosdk.makeAssetDestroyTxnWithSuggestedParamsFromObject({
            sender: ctx.chatAccount.address,
            assetIndex: asaId,
            suggestedParams: params,
        });
    } else {
        // Soft delete: acfg with empty note
        txn = algosdk.makeAssetConfigTxnWithSuggestedParamsFromObject({
            sender: ctx.chatAccount.address,
            assetIndex: asaId,
            manager: ctx.chatAccount.address,
            reserve: undefined,
            freeze: undefined,
            clawback: undefined,
            note: new Uint8Array(0),
            suggestedParams: params,
            strictEmptyAddressChecking: false,
        });
    }

    const signedTxn = txn.signTxn(ctx.chatAccount.account.sk);
    const { txid } = await ctx.algodClient.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(ctx.algodClient, txid, 4);

    log.info('Deleted memory ASA', { asaId, mode, txid, agentId: ctx.agentId });
    return { txid };
}

/**
 * Fetch the latest acfg transaction for an ASA and decrypt its ARC-69 note.
 * Returns null if the ASA has no readable note (soft-deleted or missing).
 */
export async function readMemoryAsa(
    ctx: Arc69Context,
    asaId: number,
): Promise<Arc69Memory | null> {
    try {
        // Query the indexer for all acfg transactions for this ASA, take the latest.
        // The indexer returns results in ascending order so we take the last one.
        const response = await ctx.indexerClient
            .searchForTransactions()
            .assetID(asaId)
            .txType('acfg')
            .do();

        const txns = response.transactions ?? [];
        if (txns.length === 0) return null;

        const tx = txns[txns.length - 1] as unknown as Record<string, unknown>;
        if (!tx.note) return null;

        // The algosdk returns note as Uint8Array (already decoded from base64).
        // Handle both Uint8Array (SDK) and base64 string (raw REST) formats.
        let noteBytes: Uint8Array;
        if (tx.note instanceof Uint8Array) {
            noteBytes = tx.note;
        } else {
            const raw = atob(tx.note as string);
            noteBytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) noteBytes[i] = raw.charCodeAt(i);
        }
        if (noteBytes.length === 0) return null;

        const payload = parseNotePayload(noteBytes);
        if (!payload) return null;

        const content = await decryptContent(payload.properties.envelope, ctx.chatAccount);
        if (!content) return null;

        const confirmedRound = (tx.confirmedRound ?? tx['confirmed-round'] ?? 0) as number | bigint;
        const roundTime = (tx.roundTime ?? tx['round-time']) as number | undefined;

        return {
            asaId,
            key: payload.properties.key,
            content,
            txid: tx.id as string,
            round: Number(confirmedRound),
            timestamp: roundTime
                ? new Date(Number(roundTime) * 1000).toISOString()
                : new Date().toISOString(),
        };
    } catch (err) {
        log.debug('Failed to read memory ASA', {
            asaId,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/**
 * List all memory ASAs created by this agent on localnet.
 * Queries the indexer for ASAs created by the agent's wallet address
 * with unit name 'CRVMEM'.
 */
export async function listMemoryAsas(
    ctx: Arc69Context,
): Promise<Arc69Memory[]> {
    const memories: Arc69Memory[] = [];

    try {
        // Query all assets created by this agent
        const response = await ctx.indexerClient
            .lookupAccountCreatedAssets(ctx.chatAccount.address)
            .do();

        const assets = (response.assets ?? []) as unknown as Array<Record<string, unknown>>;

        for (const asset of assets) {
            const params = (asset.params ?? asset) as Record<string, unknown>;
            // Filter by unit name
            const unitName = (params['unit-name'] ?? params.unitName) as string | undefined;
            if (unitName !== 'CRVMEM') continue;

            const asaId = (asset.index ?? asset['asset-id']) as number | undefined;
            if (!asaId) continue;

            // If the asset is deleted/destroyed, skip it
            if (asset.deleted) continue;

            const memory = await readMemoryAsa(ctx, Number(asaId));
            if (memory) {
                memories.push(memory);
            }
        }
    } catch (err) {
        log.debug('Failed to list memory ASAs', {
            error: err instanceof Error ? err.message : String(err),
        });
    }

    return memories;
}

// Re-export from agent-memories for backward compatibility (dynamic imports use this path)
export { resolveAsaForKey } from '../db/agent-memories';
