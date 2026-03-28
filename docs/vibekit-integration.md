# VibeKit Integration — Smart Contract Development

CorvidAgent + VibeKit gives you a complete Algorand development stack: CorvidAgent handles orchestration (work tasks, scheduling, code reviews, inter-agent communication) while VibeKit handles blockchain operations (contract deployment, asset management, transaction signing).

## Setup

### 1. Install both tools

```bash
# corvid-agent
git clone https://github.com/CorvidLabs/corvid-agent.git && cd corvid-agent
corvid-agent init --mcp     # configures MCP + copies Agent Skills

# VibeKit
curl -fsSL https://getvibekit.ai/install | sh
vibekit init                 # configures blockchain MCP tools + Agent Skills
```

### 2. Verify both MCP servers

Your `.mcp.json` (or Claude Desktop config) should have both entries:

```json
{
  "mcpServers": {
    "corvid-agent": {
      "command": "bun",
      "args": ["path/to/corvid-agent/server/mcp/stdio-server.ts"],
      "env": {
        "CORVID_API_URL": "http://127.0.0.1:3000"
      }
    },
    "vibekit": {
      "command": "vibekit",
      "args": ["mcp"],
      "env": {
        "ALGORAND_NETWORK": "testnet"
      }
    }
  }
}
```

### 3. Start both servers

```bash
# Terminal 1: corvid-agent
cd corvid-agent && bun run dev

# VibeKit MCP starts automatically when your AI editor connects
```

## What each tool provides

| Capability | CorvidAgent | VibeKit |
|-----------|-------------|---------|
| Deploy contracts | Work tasks create branches + PRs | `appDeploy` deploys directly to chain |
| Code review | `corvid_github_review_pr` | — |
| Asset management | — | `createAsset`, `assetTransfer`, etc. |
| Scheduling | `corvid_manage_schedule` | — |
| Transaction signing | — | Vault/Keyring (keys never reach AI) |
| Multi-agent councils | `corvid_launch_council` | — |
| Blockchain queries | — | Indexer tools, state readers |
| On-chain messaging | `corvid_send_message` (AlgoChat) | — |
| Agent registry | `corvid_flock_directory` | — |

## Example workflows

### Deploy a voting contract

```
1. Use corvid_create_work_task to write the contract:
   "Write a PuyaTs voting contract with create_proposal, vote, and get_results methods.
    Include unit tests."

2. After the PR is created and reviewed, use appDeploy to deploy it:
   "Deploy the voting contract from artifacts/ to testnet"

3. Use appCall to test it:
   "Call create_proposal with title='Budget Q2' and duration=86400"
```

### Schedule contract monitoring

```
Use corvid_manage_schedule:
  action: "custom"
  cron: "0 */4 * * *"  (every 4 hours)
  prompt: "Use lookupApplication to check app 12345 on testnet.
           Read global state. If total_votes exceeds threshold,
           use corvid_notify_owner to alert that quorum is reached."
```

### Security review before mainnet

```
Use corvid_launch_council:
  topic: "Security review of escrow contract for mainnet deployment"
  governance: "unanimous"
  context: "Use appListMethods to enumerate the ABI.
            Review access controls, reentrancy, and state transitions.
            Use simulateTransactions to test edge cases."
```

## Key management

VibeKit ensures private keys never reach the AI assistant:

- **OS Keyring** (default): macOS Keychain, Linux secret-service, or Windows Credential Manager
- **HashiCorp Vault**: All signing via Transit secrets engine — keys never leave Vault
- **WalletConnect**: Connect mobile wallets for signing approval

CorvidAgent has its own `KeyProvider` abstraction for on-chain identity (AlgoChat, attestations). The two systems are independent — VibeKit manages contract signing keys, CorvidAgent manages agent identity keys.

## Network configuration

| Network | Use case | Config |
|---------|----------|--------|
| `localnet` | Development | Requires Docker + `algokit localnet start` |
| `testnet` | Testing | Free Nodely API (no token needed) |
| `mainnet` | Production | Free Nodely API or custom endpoint |

Both tools default to `localnet` and share the same Algorand network infrastructure.
