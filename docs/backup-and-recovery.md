# Backup and Disaster Recovery

This guide covers backup procedures and recovery steps for corvid-agent operators running production deployments.

---

## What to back up

| Component | File | Criticality |
|-----------|------|-------------|
| Database | `corvid-agent.db` | **Critical** — all agents, sessions, credits, config |
| Wallet keystore | `wallet-keystore.json` | **Critical** — agent Algorand identities and funds |
| Configuration | `.env` | **High** — API keys, all server settings |
| Personas / skill bundles | stored in DB | Covered by DB backup |
| AlgoChat history | on-chain | Self-backing (see [On-chain data](#on-chain-data)) |

---

## Database backup

### Built-in backup mechanism

corvid-agent has a first-class SQLite backup built in. It performs a WAL checkpoint before copying the file, so the backup is always in a clean, consistent state.

**Via the web UI:** Settings → Database → "Create Backup"

**Via the API:**
```bash
curl -X POST http://localhost:3000/api/backup \
  -H "Authorization: Bearer $API_KEY"
```

Response:
```json
{
  "path": "./backups/corvid-agent-2026-04-13T12-00-00-000Z.db",
  "timestamp": "2026-04-13T12:00:00.000Z",
  "sizeBytes": 4194304,
  "pruned": 0
}
```

Backups are written to `./backups/` by default. The last 10 are retained automatically; older ones are pruned.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DIR` | `./backups` | Directory where backups are written |
| `BACKUP_MAX_KEEP` | `10` | Number of backups to retain before pruning |

### Recommended schedule

Run a backup at least once per day. With systemd:

```ini
# /etc/systemd/system/corvid-backup.service
[Unit]
Description=corvid-agent daily backup

[Service]
Type=oneshot
User=corvid
ExecStart=/usr/bin/curl -s -X POST http://localhost:3000/api/backup \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```ini
# /etc/systemd/system/corvid-backup.timer
[Unit]
Description=corvid-agent daily backup timer

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl enable --now corvid-backup.timer
```

Or with cron:
```cron
0 3 * * * curl -s -X POST http://localhost:3000/api/backup -H "Authorization: Bearer YOUR_API_KEY"
```

### Off-site copy

The built-in backup writes locally. Copy backups off-site with rsync or your cloud provider:

```bash
# Copy to a remote host
rsync -az ./backups/ backup-host:/srv/corvid-backups/

# Copy to S3
aws s3 sync ./backups/ s3://your-bucket/corvid-backups/
```

### Restore from database backup

1. **Stop the server.**
2. Copy the backup file over the live database:
   ```bash
   cp backups/corvid-agent-2026-04-13T12-00-00-000Z.db corvid-agent.db
   ```
3. Restart the server. Migrations run automatically on startup — if the backup predates recent schema changes, they will be applied.

> **Tip:** Always restore to a test instance first. A backup from a much older schema version may require a full migration run — check logs on startup for migration output.

---

## Wallet backup

### What is the wallet keystore?

`wallet-keystore.json` contains the BIP-39 mnemonics and derived keys for every agent's Algorand wallet. **If this file is lost and you have no backup, your agents permanently lose access to their on-chain identity and any ALGO or ASAs in those wallets.** There is no recovery path — Algorand private keys cannot be reconstructed without the mnemonic.

### Backing up the keystore

```bash
# Copy to encrypted storage (recommended)
gpg --symmetric --cipher-algo AES256 wallet-keystore.json
# → produces wallet-keystore.json.gpg

# Or encrypt with age (https://age-encryption.org/)
age -r YOUR_PUBLIC_KEY -o wallet-keystore.json.age wallet-keystore.json
```

Store the encrypted file separately from the database backup — if an attacker gets both, they can drain agent wallets.

> **Never commit `wallet-keystore.json` to version control.** The `.gitignore` and `sdk-process.ts` protection list both exclude it, but verify this on your deployment.

### Restore from wallet backup

1. Decrypt your backup:
   ```bash
   gpg --decrypt wallet-keystore.json.gpg > wallet-keystore.json
   # or
   age --decrypt -i YOUR_PRIVATE_KEY wallet-keystore.json.age > wallet-keystore.json
   ```
2. Place `wallet-keystore.json` in the project root (same directory as `corvid-agent.db`).
3. Start the server. Agents will reconnect to their on-chain identities.

### If the wallet file is lost

- **Localnet:** Recreate wallets via Settings → Agents → assign new wallet. On-chain data (memories, AlgoChat history) on localnet is likely already lost (see [Localnet considerations](#localnet-vs-mainnet-considerations)).
- **Testnet/Mainnet:** The on-chain data (ARC-69 ASAs, transaction history) still exists at the known addresses, but the server cannot sign new transactions without the private keys. You must restore from a backup or accept that those wallet addresses are permanently inaccessible.

---

## On-chain data

### ARC-69 memories

Long-term agent memories are stored as ARC-69 ASAs on Algorand. Because they live on-chain, they are replicated across every node in the network — **you do not need to back these up separately on testnet or mainnet.** They survive server restarts, disk failures, and migrations.

To read them back after restoring a database from backup, run:

```bash
# In an agent session, or via MCP:
corvid_sync_on_chain_memories
```

This re-imports all on-chain memories into the local SQLite cache.

### AlgoChat message history

AlgoChat messages are stored in two places:
- **On-chain:** every message is an Algorand transaction — permanent, immutable, replicated
- **Local cache:** `algochat_messages` table in `corvid-agent.db`

After a DB restore, the local cache will be out of date. The server automatically re-fetches recent messages from the chain on startup. Historical messages older than the polling window can be re-imported by querying the Algorand indexer directly if needed.

### Localnet vs mainnet considerations

| | Localnet | Testnet / Mainnet |
|---|---|---|
| On-chain data persists across server restarts | **No** — Docker volumes reset | **Yes** |
| Memories survive DB loss | **No** — also in local Docker | **Yes** |
| Network data backed up by Algorand nodes | **No** — self-contained | **Yes** |

**Localnet is ephemeral.** When you run `algokit localnet reset` or destroy the Docker volume, all on-chain data is gone. For localnet deployments, rely entirely on your SQLite and wallet backups. The `BACKUP_DIR` and scheduled daily backup are especially important here.

---

## Configuration backup

`.env` contains all your API keys, model settings, and server configuration. Back it up encrypted — it contains secrets.

```bash
# Encrypt and store alongside your DB backups
gpg --symmetric --cipher-algo AES256 .env
rsync -az .env.gpg backup-host:/srv/corvid-backups/
```

### What's in `.env` that matters for recovery

- `ANTHROPIC_API_KEY` — agent model access
- `DISCORD_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN` — bridge credentials
- `API_KEY`, `ADMIN_API_KEY` — server auth
- `ALGORAND_NETWORK`, `ALGOD_*` — chain connectivity
- `DATABASE_PATH`, `BACKUP_DIR` — storage paths

### Restore from config backup

1. Decrypt: `gpg --decrypt .env.gpg > .env`
2. Verify no keys have been rotated since the backup was taken (Discord, Telegram, and Anthropic tokens may have been invalidated if the backup is old)
3. Start the server

---

## Full disaster recovery procedure

Use this sequence when recovering a server from scratch.

### Prerequisites

You have:
- A database backup (`.db` file)
- An encrypted wallet backup (`.json.gpg` or `.json.age`)
- An encrypted config backup (`.env.gpg`)
- The corvid-agent repository (clone from GitHub)

### Steps

1. **Clone and install:**
   ```bash
   git clone https://github.com/CorvidLabs/corvid-agent.git
   cd corvid-agent
   bun install
   bun run build:client
   ```

2. **Restore configuration:**
   ```bash
   gpg --decrypt /path/to/.env.gpg > .env
   # Verify API keys are still valid
   ```

3. **Restore the database:**
   ```bash
   cp /path/to/corvid-agent-2026-04-13T12-00-00-000Z.db corvid-agent.db
   ```

4. **Restore the wallet keystore:**
   ```bash
   gpg --decrypt /path/to/wallet-keystore.json.gpg > wallet-keystore.json
   ```

5. **Start Algorand (if using localnet):**
   ```bash
   algokit localnet start
   # Note: localnet data is ephemeral — on-chain memories from previous run are gone
   ```

6. **Start the server:**
   ```bash
   bun run start
   ```
   Watch startup logs for migration output and wallet reconnection.

7. **Verify:**
   - Open the dashboard at `http://localhost:3000`
   - Check that agents appear and their credit balances match the backup
   - For testnet/mainnet: run `corvid_sync_on_chain_memories` in an agent session to re-import on-chain memories

---

## Backup checklist

Run through this before any major server change or monthly:

- [ ] `POST /api/backup` succeeds and the file is written to `BACKUP_DIR`
- [ ] Latest backup is copied off-site (rsync / S3 / etc.)
- [ ] `wallet-keystore.json` encrypted backup is stored off-site
- [ ] `.env` encrypted backup is stored off-site
- [ ] Backups are stored in a different physical location than the server
- [ ] A test restore has been performed in the last 90 days
