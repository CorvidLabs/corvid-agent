/**
 * ARC-69 Shared Agent Library (CRVLIB)
 *
 * Provides CRUD operations for plaintext on-chain library entries stored as
 * Algorand Standard Assets with ARC-69 metadata. Unlike CRVMEM (encrypted),
 * CRVLIB content is plaintext and readable by any agent — it is a shared
 * knowledge commons for guides, standards, decisions, and runbooks.
 *
 * Supports multi-page "book" chaining where ASAs link together like chapters.
 *
 * Localnet only — CRVLIB requires a fast, free chain for practical use.
 */
import type { Database } from 'bun:sqlite';
import type { ChatAccount } from '@corvidlabs/ts-algochat';
import type { LibraryCategory } from '../db/agent-library';
import { createLogger } from '../lib/logger';

const log = createLogger('Arc69Library');

// ── Types ──────────────────────────────────────────────────────────

export interface LibraryContext {
  db: Database;
  agentId: string;
  agentName: string;
  algodClient: import('algosdk').default.Algodv2;
  indexerClient: import('algosdk').default.Indexer;
  chatAccount: ChatAccount;
}

export interface LibraryEntry {
  asaId: number;
  key: string;
  authorId: string;
  authorName: string;
  category: LibraryCategory;
  tags: string[];
  content: string;
  book: string | null;
  page: number | null;
  next: number | null;
  prev: number | null;
  total: number | null;
  txid: string;
  round: number;
  timestamp: string;
}

export interface LibraryNotePayload {
  standard: 'arc69';
  description: 'corvid-agent library';
  mime_type: 'text/plain';
  properties: {
    key: string;
    author_id: string;
    author_name: string;
    category: LibraryCategory;
    tags: string[];
    content: string;
    book?: string;
    page?: number;
    next?: number;
    prev?: number;
    total?: number;
    v: number;
  };
}

export interface CreateLibraryParams {
  key: string;
  content: string;
  category?: LibraryCategory;
  tags?: string[];
  book?: string;
  page?: number;
  prev?: number;
  total?: number;
}

export interface UpdateLibraryParams {
  key: string;
  content?: string;
  category?: LibraryCategory;
  tags?: string[];
  next?: number;
  prev?: number;
  total?: number;
}

export interface AppendPageParams {
  content: string;
  category?: LibraryCategory;
  tags?: string[];
}

export interface LibraryFilters {
  category?: LibraryCategory;
  authorAddress?: string;
  tag?: string;
  limit?: number;
}

// ── Guards ─────────────────────────────────────────────────────────

/**
 * Throw if not running on localnet.
 * CRVLIB is localnet-only — the shared library depends on free, fast transactions.
 */
function assertLocalnet(): void {
  const network = process.env.ALGORAND_NETWORK ?? 'localnet';
  if (network !== 'localnet') {
    throw new Error(
      `CRVLIB operations are localnet-only (ALGORAND_NETWORK=${network}). ` +
        'Set ALGORAND_NETWORK=localnet to use the shared agent library.',
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────

/** Build the ARC-69 JSON note as a Uint8Array for transaction notes. */
export function buildNotePayload(
  key: string,
  authorId: string,
  authorName: string,
  category: LibraryCategory,
  tags: string[],
  content: string,
  bookMeta?: {
    book?: string;
    page?: number;
    next?: number;
    prev?: number;
    total?: number;
  },
): Uint8Array {
  const payload: LibraryNotePayload = {
    standard: 'arc69',
    description: 'corvid-agent library',
    mime_type: 'text/plain',
    properties: {
      key,
      author_id: authorId,
      author_name: authorName,
      category,
      tags,
      content,
      v: 1,
    },
  };

  if (bookMeta?.book !== undefined) payload.properties.book = bookMeta.book;
  if (bookMeta?.page !== undefined) payload.properties.page = bookMeta.page;
  if (bookMeta?.next !== undefined) payload.properties.next = bookMeta.next;
  if (bookMeta?.prev !== undefined) payload.properties.prev = bookMeta.prev;
  if (bookMeta?.total !== undefined) payload.properties.total = bookMeta.total;

  return new TextEncoder().encode(JSON.stringify(payload));
}

/** Parse an ARC-69 library note from raw bytes, returning null on parse failure. */
export function parseNotePayload(noteBytes: Uint8Array): LibraryNotePayload | null {
  try {
    const json = new TextDecoder().decode(noteBytes);
    const parsed = JSON.parse(json);
    if (parsed?.standard !== 'arc69' || !parsed?.properties?.key || !parsed?.properties?.author_id) {
      return null;
    }
    // Distinguish library notes from memory notes (no envelope, has author_name)
    if (parsed?.properties?.envelope) return null;
    return parsed as LibraryNotePayload;
  } catch {
    return null;
  }
}

/** Decode a transaction note field to Uint8Array, handling SDK and raw REST formats. */
function decodeNoteField(note: unknown): Uint8Array | null {
  if (!note) return null;
  if (note instanceof Uint8Array) return note;
  if (typeof note === 'string') {
    try {
      const raw = atob(note);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes;
    } catch {
      return null;
    }
  }
  return null;
}

/** Extract a LibraryEntry from a transaction record, returning null on failure. */
function txnToLibraryEntry(tx: Record<string, unknown>, asaId: number): LibraryEntry | null {
  const noteRaw = tx.note;
  const noteBytes = decodeNoteField(noteRaw);
  if (!noteBytes || noteBytes.length === 0) return null;

  const payload = parseNotePayload(noteBytes);
  if (!payload) return null;

  const p = payload.properties;
  const confirmedRound = (tx.confirmedRound ?? tx['confirmed-round'] ?? 0) as number | bigint;
  const roundTime = (tx.roundTime ?? tx['round-time']) as number | undefined;

  return {
    asaId,
    key: p.key,
    authorId: p.author_id,
    authorName: p.author_name,
    category: p.category,
    tags: p.tags ?? [],
    content: p.content,
    book: p.book ?? null,
    page: p.page ?? null,
    next: p.next ?? null,
    prev: p.prev ?? null,
    total: p.total ?? null,
    txid: tx.id as string,
    round: Number(confirmedRound),
    timestamp: roundTime ? new Date(Number(roundTime) * 1000).toISOString() : new Date().toISOString(),
  };
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Mint a new CRVLIB ASA with plaintext ARC-69 note.
 * Content is NOT encrypted — CRVLIB is a shared commons readable by all agents.
 */
export async function createLibraryEntry(
  ctx: LibraryContext,
  params: CreateLibraryParams,
): Promise<{ asaId: number; txid: string }> {
  assertLocalnet();
  const algosdk = (await import('algosdk')).default;
  const category = params.category ?? 'reference';
  const tags = params.tags ?? [];

  const note = buildNotePayload(params.key, ctx.agentId, ctx.agentName, category, tags, params.content, {
    book: params.book,
    page: params.page,
    prev: params.prev,
    total: params.total,
  });

  if (note.byteLength > 1024) {
    throw new Error(
      `CRVLIB note exceeds 1024 bytes (${note.byteLength}). ` +
        `Content too large — use book chaining to split across multiple pages.`,
    );
  }

  const txParams = await ctx.algodClient.getTransactionParams().do();
  const assetName = `lib:${params.key}`.slice(0, 32);

  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    sender: ctx.chatAccount.address,
    total: 1,
    decimals: 0,
    defaultFrozen: false,
    manager: ctx.chatAccount.address,
    reserve: undefined,
    freeze: undefined,
    clawback: undefined,
    unitName: 'CRVLIB',
    assetName,
    assetURL: '',
    note,
    suggestedParams: txParams,
  });

  const signedTxn = txn.signTxn(ctx.chatAccount.account.sk);
  const { txid } = await ctx.algodClient.sendRawTransaction(signedTxn).do();

  const confirmed = await algosdk.waitForConfirmation(ctx.algodClient, txid, 4);
  const asaId = Number(confirmed.assetIndex);

  log.info('Created library ASA', { key: params.key, asaId, txid, agentId: ctx.agentId });
  return { asaId, txid };
}

/**
 * Send an acfg transaction to update the ARC-69 note for an existing CRVLIB ASA.
 */
export async function updateLibraryEntry(
  ctx: LibraryContext,
  asaId: number,
  params: UpdateLibraryParams,
  existing: LibraryEntry,
): Promise<{ txid: string }> {
  assertLocalnet();
  const algosdk = (await import('algosdk')).default;

  const category = params.category ?? existing.category;
  const tags = params.tags ?? existing.tags;
  const content = params.content ?? existing.content;
  const next = params.next ?? existing.next ?? undefined;
  const prev = params.prev ?? existing.prev ?? undefined;
  const total = params.total ?? existing.total ?? undefined;

  const note = buildNotePayload(params.key, ctx.agentId, ctx.agentName, category, tags, content, {
    book: existing.book ?? undefined,
    page: existing.page ?? undefined,
    next,
    prev,
    total,
  });

  if (note.byteLength > 1024) {
    throw new Error(`CRVLIB note exceeds 1024 bytes (${note.byteLength}). Content too large.`);
  }

  const txParams = await ctx.algodClient.getTransactionParams().do();

  const txn = algosdk.makeAssetConfigTxnWithSuggestedParamsFromObject({
    sender: ctx.chatAccount.address,
    assetIndex: asaId,
    manager: ctx.chatAccount.address,
    reserve: undefined,
    freeze: undefined,
    clawback: undefined,
    note,
    suggestedParams: txParams,
    strictEmptyAddressChecking: false,
  });

  const signedTxn = txn.signTxn(ctx.chatAccount.account.sk);
  const { txid } = await ctx.algodClient.sendRawTransaction(signedTxn).do();
  await algosdk.waitForConfirmation(ctx.algodClient, txid, 4);

  log.info('Updated library ASA', { key: params.key, asaId, txid, agentId: ctx.agentId });
  return { txid };
}

/**
 * Delete a library entry.
 * - soft: sends acfg with empty note (ASA preserved, content cleared)
 * - hard: destroys the ASA entirely
 */
export async function deleteLibraryEntry(
  ctx: LibraryContext,
  asaId: number,
  mode: 'soft' | 'hard' = 'soft',
): Promise<{ txid: string }> {
  assertLocalnet();
  const algosdk = (await import('algosdk')).default;
  const txParams = await ctx.algodClient.getTransactionParams().do();

  const txn =
    mode === 'hard'
      ? algosdk.makeAssetDestroyTxnWithSuggestedParamsFromObject({
          sender: ctx.chatAccount.address,
          assetIndex: asaId,
          suggestedParams: txParams,
        })
      : algosdk.makeAssetConfigTxnWithSuggestedParamsFromObject({
          sender: ctx.chatAccount.address,
          assetIndex: asaId,
          manager: ctx.chatAccount.address,
          reserve: undefined,
          freeze: undefined,
          clawback: undefined,
          note: new Uint8Array(0),
          suggestedParams: txParams,
          strictEmptyAddressChecking: false,
        });

  const signedTxn = txn.signTxn(ctx.chatAccount.account.sk);
  const { txid } = await ctx.algodClient.sendRawTransaction(signedTxn).do();
  await algosdk.waitForConfirmation(ctx.algodClient, txid, 4);

  log.info('Deleted library ASA', { asaId, mode, txid, agentId: ctx.agentId });
  return { txid };
}

/**
 * Fetch the latest acfg transaction for a CRVLIB ASA and parse its plaintext note.
 * Returns null if the ASA has no readable note (soft-deleted or missing).
 */
export async function readLibraryEntry(ctx: LibraryContext, asaId: number): Promise<LibraryEntry | null> {
  assertLocalnet();
  try {
    const response = await ctx.indexerClient.searchForTransactions().assetID(asaId).txType('acfg').do();

    const txns = response.transactions ?? [];
    if (txns.length === 0) return null;

    // Take the most recent acfg (last in ascending order)
    const tx = txns[txns.length - 1] as unknown as Record<string, unknown>;
    return txnToLibraryEntry(tx, asaId);
  } catch (err) {
    log.debug('Failed to read library ASA', {
      asaId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * List all CRVLIB ASAs discovered on-chain across ALL agents.
 * Uses searchForAssets with unit name filter to discover entries from any creator.
 * Optionally filter by creator address (authorAddress), category, or tags.
 */
export async function listLibraryEntries(ctx: LibraryContext, filters: LibraryFilters = {}): Promise<LibraryEntry[]> {
  assertLocalnet();
  const entries: LibraryEntry[] = [];

  try {
    // Use searchForAssets with unit name filter to find ALL CRVLIB ASAs
    // from any agent — not just the caller's own creator address.
    let query = ctx.indexerClient.searchForAssets().unit('CRVLIB');

    // If filtering by a specific author, scope to their creator address
    if (filters.authorAddress) {
      query = query.creator(filters.authorAddress);
    }

    const response = await query.do();
    const assets = (response.assets ?? []) as unknown as Array<Record<string, unknown>>;

    for (const asset of assets) {
      if (asset.deleted) continue;

      const asaId = (asset.index ?? asset['asset-id']) as number | undefined;
      if (!asaId) continue;

      const entry = await readLibraryEntry(ctx, Number(asaId));
      if (!entry) continue;

      if (filters.category && entry.category !== filters.category) continue;
      if (filters.tag && !entry.tags.includes(filters.tag)) continue;

      entries.push(entry);

      if (filters.limit && entries.length >= filters.limit) break;
    }
  } catch (err) {
    log.debug('Failed to list library ASAs', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return entries;
}

/**
 * Read all pages of a book in order.
 * Finds page 1 by searching the local DB for entries with book=bookKey and page=1,
 * then follows `next` ASA links through the chain.
 *
 * Page key convention: all pages use `{bookKey}/page-{n}` suffix (page 1 = `{bookKey}/page-1`).
 */
export async function readBook(ctx: LibraryContext, bookKey: string): Promise<LibraryEntry[]> {
  assertLocalnet();
  const { getBookPages } = await import('../db/agent-library');

  // Find page 1 by searching for book=bookKey, page=1 in the local DB.
  // This matches both the /page-1 suffix convention and any chain-synced entries.
  const dbPages = getBookPages(ctx.db, bookKey);
  const page1Db = dbPages.find((p) => p.page === 1);

  if (!page1Db?.asaId) {
    log.debug('Book page 1 not found in DB', { bookKey });
    return [];
  }

  const pages: LibraryEntry[] = [];
  let currentAsaId: number | null = page1Db.asaId;

  while (currentAsaId !== null) {
    const entry = await readLibraryEntry(ctx, currentAsaId);
    if (!entry) break;

    pages.push(entry);
    currentAsaId = entry.next ?? null;

    // Safety: stop if we've somehow looped or gone past a sane limit
    if (pages.length > 100) {
      log.warn('readBook: too many pages, stopping at 100', { bookKey });
      break;
    }
  }

  return pages;
}

/**
 * Append a new page to an existing book.
 *
 * Page key convention: all pages use `{bookKey}/page-{n}` suffix.
 * Page 1 must have been created with key `{bookKey}/page-1` and book/page metadata set.
 *
 * 1. Finds the current last page (by following `next` links from page 1)
 * 2. Mints a new CRVLIB ASA for the new page
 * 3. Updates the previous last page's `next` pointer to the new ASA
 * 4. Updates page 1's `total` count
 */
export async function appendPage(
  ctx: LibraryContext,
  bookKey: string,
  params: AppendPageParams,
): Promise<{ asaId: number; txid: string }> {
  // assertLocalnet() is called inside readBook → readLibraryEntry
  const pages = await readBook(ctx, bookKey);
  if (pages.length === 0) {
    throw new Error(`Book "${bookKey}" not found. Create page 1 with key "${bookKey}/page-1" first.`);
  }

  const page1 = pages[0];
  const lastPage = pages[pages.length - 1];
  const newPageNumber = pages.length + 1;
  const pageKey = `${bookKey}/page-${newPageNumber}`;

  // Mint the new page ASA
  const { asaId: newAsaId, txid: mintTxid } = await createLibraryEntry(ctx, {
    key: pageKey,
    content: params.content,
    category: params.category ?? page1.category,
    tags: params.tags ?? page1.tags,
    book: bookKey,
    page: newPageNumber,
    prev: lastPage.asaId,
    total: newPageNumber,
  });

  // Update last page's `next` pointer
  await updateLibraryEntry(ctx, lastPage.asaId, { key: lastPage.key, next: newAsaId }, lastPage);

  // Update page 1's `total` count (if page 1 is not also the last page)
  if (page1.asaId !== lastPage.asaId) {
    await updateLibraryEntry(ctx, page1.asaId, { key: page1.key, total: newPageNumber }, page1);
  }

  log.info('Appended book page', {
    bookKey,
    pageNumber: newPageNumber,
    asaId: newAsaId,
    txid: mintTxid,
  });
  return { asaId: newAsaId, txid: mintTxid };
}

/**
 * Look up the CRVLIB ASA ID for a given key from the local DB.
 */
export function resolveLibraryAsa(db: Database, key: string): number | null {
  const row = db.query('SELECT asa_id FROM agent_library WHERE key = ? AND asa_id IS NOT NULL').get(key) as {
    asa_id: number;
  } | null;
  return row?.asa_id ?? null;
}
