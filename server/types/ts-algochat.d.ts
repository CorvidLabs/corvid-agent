/**
 * Type declarations for @corvidlabs/ts-algochat
 *
 * This is an optional dependency that may not be installed in all environments.
 * These stubs satisfy TypeScript without requiring the actual package.
 */
declare module '@corvidlabs/ts-algochat' {
  // ── Core types ───────────────────────────────────────────────────

  export interface EncryptionKeys {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  }

  export interface ChatAccount {
    address: string;
    account: {
      sk: Uint8Array;
      addr: string;
    };
    mnemonic: string;
    encryptionKeys: EncryptionKeys;
  }

  export interface GeneratedChatAccount {
    account: ChatAccount;
    mnemonic: string;
  }

  export interface PSKState {
    sendCounter: number;
    peerLastCounter: number;
    seenCounters: Set<number>;
  }

  export interface PSKEnvelope {
    ratchetCounter: number;
    senderPublicKey?: Uint8Array;
    [key: string]: unknown;
  }

  export interface DecryptedMessage {
    text: string;
    [key: string]: unknown;
  }

  export interface SyncMessage {
    content: string;
    txid?: string;
    id: string;
    round?: number;
    confirmedRound: number;
    amount?: number;
    direction?: 'sent' | 'received';
    sender?: string;
    timestamp: Date;
    [key: string]: unknown;
  }

  // ── Network presets ──────────────────────────────────────────────

  export interface NetworkPreset {
    algodUrl: string;
    algodToken: string;
    indexerUrl?: string;
    indexerToken?: string;
  }

  export function localnet(): NetworkPreset;
  export function testnet(): NetworkPreset;
  export function mainnet(): NetworkPreset;

  // ── Protocol constants ───────────────────────────────────────────

  export const PROTOCOL: {
    MAX_PAYLOAD_SIZE: number;
    TAG_SIZE: number;
    MIN_PAYMENT: number;
    [key: string]: unknown;
  };

  // ── Account creation ─────────────────────────────────────────────

  export function createRandomChatAccount(): GeneratedChatAccount;
  export function createChatAccountFromMnemonic(mnemonic: string): ChatAccount;

  // ── Encryption / Envelope ────────────────────────────────────────

  export function encryptMessage(
    plaintext: string | Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
  ): Uint8Array;

  export function decryptMessage(
    envelope: unknown,
    privateKey: Uint8Array,
    publicKey: Uint8Array,
  ): DecryptedMessage | null;

  export function encodeEnvelope(data: unknown): Uint8Array;
  export function decodeEnvelope(data: Uint8Array): unknown;

  // ── PSK functions ────────────────────────────────────────────────

  export function advanceSendCounter(state: PSKState): { counter: number; state: PSKState };
  export function derivePSKAtCounter(initialPSK: Uint8Array, counter: number): Uint8Array;

  export function encryptPSKMessage(
    plaintext: string | Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    psk: Uint8Array,
    counter: number,
  ): PSKEnvelope;

  export function decryptPSKMessage(
    envelope: PSKEnvelope,
    privateKey: Uint8Array,
    publicKey: Uint8Array,
    psk: Uint8Array,
  ): DecryptedMessage | null;

  export function encodePSKEnvelope(envelope: PSKEnvelope): Uint8Array;
  export function decodePSKEnvelope(data: Uint8Array): PSKEnvelope;
  export function isPSKMessage(data: Uint8Array): boolean;
  export function validateCounter(state: PSKState, counter: number): boolean;
  export function recordReceive(state: PSKState, counter: number): PSKState;

  // ── Service classes ──────────────────────────────────────────────

  export class AlgorandService {
    constructor(config: unknown);
    sendMessage(
      sender: ChatAccount,
      recipientAddress: string,
      recipientPublicKey: Uint8Array,
      content: string,
      options?: { amount?: number },
    ): Promise<{ txid: string; fee?: number }>;
    publishKey(account: ChatAccount): Promise<string>;
    discoverPublicKey(address: string, timeout?: number): Promise<Uint8Array>;
    fetchMessages(
      account: ChatAccount,
      participant: string,
      afterRound?: number,
      limit?: number,
    ): Promise<SyncMessage[]>;
    [key: string]: unknown;
  }

  export class SendQueue {
    constructor();
    [key: string]: unknown;
  }

  export interface ConversationHandle {
    participant: string;
    setLastFetchedRound(round: number): void;
    [key: string]: unknown;
  }

  export class SyncManager {
    constructor(
      algorandService: AlgorandService,
      chatAccount: ChatAccount,
      queue: SendQueue,
      options?: { syncInterval?: number; processQueue?: boolean },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, handler: (...args: any[]) => void): void;
    getConversations(): ConversationHandle[];
    getOrCreateConversation(participant: string): ConversationHandle;
    addParticipant(address: string): void;
    sync(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    [key: string]: unknown;
  }
}
