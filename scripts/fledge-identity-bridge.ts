#!/usr/bin/env bun
/**
 * Seeds fledge plugin state files with corvid-agent's existing wallet credentials.
 *
 * Run once after installing fledge plugins to bridge identities so that
 * `fledge memory`, `fledge algochat` etc. use the same on-chain wallet as
 * corvid-agent's internal systems.
 *
 * Usage: bun run scripts/fledge-identity-bridge.ts [--agent-id corvid-agent]
 */
import { Database } from 'bun:sqlite';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import algosdk from 'algosdk';

const AGENT_ID = process.argv.includes('--agent-id')
  ? process.argv[process.argv.indexOf('--agent-id') + 1]
  : 'corvid-agent';

const PROJECT_DIR = process.cwd();
const FLEDGE_DIR = join(PROJECT_DIR, '.fledge');
const DB_PATH = join(PROJECT_DIR, 'corvid-agent.db');

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  // 1. Read agent wallet
  const agent = db
    .query('SELECT id, wallet_address, wallet_mnemonic_encrypted FROM agents WHERE id = ?')
    .get(AGENT_ID) as { id: string; wallet_address: string | null; wallet_mnemonic_encrypted: string | null } | null;

  if (!agent?.wallet_address) {
    console.error(`Agent "${AGENT_ID}" not found or has no wallet.`);
    db.close();
    process.exit(1);
  }

  // 2. Decrypt mnemonic
  const { decryptMnemonic } = await import('../server/lib/crypto');
  const mnemonic = await decryptMnemonic(agent.wallet_mnemonic_encrypted!, DB_PATH);
  if (!mnemonic) {
    console.error('Failed to decrypt mnemonic.');
    db.close();
    process.exit(1);
  }

  // 3. Derive Algorand account
  const account = algosdk.mnemonicToSecretKey(mnemonic);

  // 4. Derive X25519 encryption keys (via ts-algochat if available)
  let encryptionPublicKey: string | undefined;
  let encryptionSecretKey: string | undefined;
  try {
    const { createChatAccountFromMnemonic } = await import('@corvidlabs/ts-algochat');
    const chatAccount = createChatAccountFromMnemonic(mnemonic);
    encryptionPublicKey = Buffer.from(chatAccount.encryptionKeys.publicKey).toString('base64');
    encryptionSecretKey = Buffer.from(chatAccount.encryptionKeys.secretKey).toString('base64');
  } catch {
    console.warn('ts-algochat not available — skipping encryption keys (algochat plugin will generate its own).');
  }

  // 5. Write fledge state files
  mkdirSync(FLEDGE_DIR, { recursive: true });

  // Memory plugin identity
  const memoryIdentity = {
    address: agent.wallet_address,
    mnemonic,
    signingKey: Buffer.from(account.sk).toString('base64'),
    ...(encryptionPublicKey && { encryptionPublicKey }),
    ...(encryptionSecretKey && { encryptionSecretKey }),
    bridgedFrom: 'corvid-agent',
    bridgedAt: new Date().toISOString(),
  };

  const memPath = join(FLEDGE_DIR, 'memory-identity.json');
  writeFileSync(memPath, JSON.stringify(memoryIdentity, null, 2));
  chmodSync(memPath, 0o600);
  console.log(`✓ Wrote ${memPath}`);

  // AlgoChat plugin state
  const pskContacts = db.query('SELECT * FROM psk_contacts WHERE 1=1').all() as Array<{
    nickname: string;
    mobile_address: string;
    initial_psk: string;
  }>;

  const algochatState = {
    address: agent.wallet_address,
    mnemonic,
    ...(encryptionPublicKey && { publicKey: encryptionPublicKey }),
    ...(encryptionSecretKey && { secretKey: encryptionSecretKey }),
    contacts: pskContacts.map((c) => ({
      name: c.nickname,
      address: c.mobile_address,
      psk: c.initial_psk,
    })),
    bridgedFrom: 'corvid-agent',
    bridgedAt: new Date().toISOString(),
  };

  const acPath = join(FLEDGE_DIR, 'algochat-state.json');
  writeFileSync(acPath, JSON.stringify(algochatState, null, 2));
  chmodSync(acPath, 0o600);
  console.log(`✓ Wrote ${acPath}`);

  db.close();
  console.log(`\nIdentity bridge complete for agent "${AGENT_ID}".`);
  console.log(`Wallet: ${agent.wallet_address}`);
  console.log(`Contacts: ${pskContacts.length}`);
  console.log('\nVerify: fledge memory identity --json');
}

main().catch((err) => {
  console.error('Bridge failed:', err.message ?? err);
  process.exit(1);
});
