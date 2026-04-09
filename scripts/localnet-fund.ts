/**
 * Fund all agent wallets on localnet from the KMD dispenser.
 *
 * Usage:
 *   bun scripts/localnet-fund.ts           # Fund all agents below threshold
 *   bun scripts/localnet-fund.ts --force   # Fund all agents regardless of balance
 *   bun scripts/localnet-fund.ts --amount 20  # Fund with 20 ALGO (default: 10)
 */

import { Database } from 'bun:sqlite';

const DB_PATH = process.env.DB_PATH ?? 'corvid-agent.db';
const KMD_URL = process.env.LOCALNET_KMD_URL ?? 'http://localhost:4002';
const ALGOD_URL = process.env.LOCALNET_ALGOD_URL ?? 'http://localhost:4001';
const KMD_TOKEN = 'a'.repeat(64);
const ALGOD_TOKEN = 'a'.repeat(64);

const force = process.argv.includes('--force');
const amountIdx = process.argv.indexOf('--amount');
const fundAlgo = amountIdx !== -1 ? Number(process.argv[amountIdx + 1]) : 10;
const fundMicro = fundAlgo * 1_000_000;

interface AgentRow {
  id: string;
  name: string;
  wallet_address: string | null;
}

async function main() {
  const db = new Database(DB_PATH, { readonly: true });
  const agents = db
    .query<AgentRow, []>('SELECT id, name, wallet_address FROM agents WHERE wallet_address IS NOT NULL')
    .all();
  db.close();

  if (agents.length === 0) {
    console.log('No agents with wallets found.');
    return;
  }

  const algosdk = (await import('algosdk')).default;
  const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL);

  // Get dispenser account from KMD
  const parsed = new URL(KMD_URL);
  const kmd = new algosdk.Kmd(KMD_TOKEN, `${parsed.protocol}//${parsed.hostname}`, parseInt(parsed.port || '4002', 10));
  const wallets = await kmd.listWallets();
  const defaultWallet = wallets.wallets.find((w: { name: string }) => w.name === 'unencrypted-default-wallet');
  if (!defaultWallet) {
    console.error('LocalNet default wallet not found. Is algokit localnet running?');
    process.exit(1);
  }

  const walletHandle = (await kmd.initWalletHandle(defaultWallet.id, '')).wallet_handle_token;
  const keys = await kmd.listKeys(walletHandle);
  const dispenserAddress = keys.addresses[0];
  const keyResponse = await kmd.exportKey(walletHandle, '', dispenserAddress);
  const dispenserAccount = algosdk.mnemonicToSecretKey(algosdk.secretKeyToMnemonic(keyResponse.private_key));

  let funded = 0;
  let skipped = 0;

  for (const agent of agents) {
    const address = agent.wallet_address!;
    try {
      const info = await algod.accountInformation(address).do();
      const balance = Number(info.amount ?? 0);
      const assetCount = Array.isArray(info.assets) ? info.assets.length : 0;
      const minBalance = (1 + assetCount) * 100_000;
      const threshold = minBalance + 2_000_000; // 2 ALGO buffer

      const balanceAlgo = (balance / 1_000_000).toFixed(2);
      const thresholdAlgo = (threshold / 1_000_000).toFixed(2);

      if (!force && balance >= threshold) {
        console.log(`  ✓ ${agent.name} — ${balanceAlgo} ALGO (min: ${thresholdAlgo}, ${assetCount} ASAs) — OK`);
        skipped++;
        continue;
      }

      const params = await algod.getTransactionParams().do();
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: dispenserAddress,
        receiver: address,
        amount: fundMicro,
        suggestedParams: params,
      });
      const signedTxn = txn.signTxn(dispenserAccount.sk);
      await algod.sendRawTransaction(signedTxn).do();

      console.log(
        `  ↑ ${agent.name} — ${balanceAlgo} → +${fundAlgo} ALGO (was below ${thresholdAlgo}, ${assetCount} ASAs)`,
      );
      funded++;
    } catch (err) {
      console.error(`  ✗ ${agent.name} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await kmd.releaseWalletHandle(walletHandle);
  console.log(`\nDone. Funded: ${funded}, Skipped: ${skipped}, Total: ${agents.length}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
