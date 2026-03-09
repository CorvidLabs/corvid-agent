---
name: smart-contracts
description: Use this skill when the user wants to build, deploy, test, or interact with Algorand smart contracts. Triggers include "deploy a contract", "write a smart contract", "call a method", "create an ASA", "create a token", "application state", "ABI", "opt in to app", "PuyaTs", "PuyaPy", "Algorand contract", "mainnet deploy", "testnet deploy", or any blockchain development task on Algorand.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Smart Contracts — Algorand Blockchain Development

Build, deploy, and interact with Algorand smart contracts using VibeKit MCP tools alongside CorvidAgent's orchestration capabilities.

## Setup

CorvidAgent handles orchestration (work tasks, scheduling, reviews). VibeKit handles blockchain operations (deploy, call, manage assets). Both run as MCP servers side-by-side:

```bash
# Install VibeKit CLI
curl -fsSL https://getvibekit.ai/install | sh

# Set up both in one go
corvid-agent init --mcp    # configures corvid-agent MCP
vibekit init               # configures VibeKit MCP + Agent Skills
```

Or configure both manually in `.mcp.json`:

```json
{
  "mcpServers": {
    "corvid-agent": {
      "command": "bun",
      "args": ["server/mcp/stdio-server.ts"]
    },
    "vibekit": {
      "command": "vibekit",
      "args": ["mcp"],
      "env": { "ALGORAND_NETWORK": "testnet" }
    }
  }
}
```

## VibeKit MCP Tools (42 tools)

### Contract Operations
| Tool | Description |
|------|-------------|
| `appDeploy` | Deploy a new smart contract |
| `appCall` | Execute a method call on a contract |
| `appListMethods` | List available ABI methods |
| `appGetInfo` | Get info about a deployed contract |
| `appOptIn` | Opt an account into a contract |
| `appCloseOut` | Close out from a contract |
| `appDelete` | Remove a deployed contract |

### Asset Management (ASA)
| Tool | Description |
|------|-------------|
| `createAsset` | Create an Algorand Standard Asset |
| `getAssetInfo` | Get asset information |
| `assetOptIn` | Opt in to receive an asset |
| `assetTransfer` | Transfer an asset |
| `assetOptOut` | Opt out of an asset |
| `assetFreeze` | Freeze/unfreeze an asset |
| `assetConfig` | Modify asset configuration |
| `assetDestroy` | Destroy an asset |

### Account Management
| Tool | Description |
|------|-------------|
| `listAccounts` | List available accounts |
| `getAccountInfo` | Get account details and balances |
| `createAccount` | Create a new account |
| `fundAccount` | Fund an account via dispenser |
| `sendPayment` | Send a payment transaction |

### Application State
| Tool | Description |
|------|-------------|
| `readGlobalState` | Read application global state |
| `readLocalState` | Read application local state |
| `readBox` | Read application box storage |

### Blockchain Queries (Indexer)
| Tool | Description |
|------|-------------|
| `lookupTransaction` | Look up a specific transaction |
| `searchTransactions` | Search transactions with filters |
| `lookupApplication` | Look up a deployed application |
| `lookupApplicationLogs` | Get application event logs |
| `lookupAsset` | Look up asset details |

### Transactions
| Tool | Description |
|------|-------------|
| `sendGroupTransactions` | Compose and send atomic transaction groups |
| `simulateTransactions` | Simulate transactions before submitting |

### Utilities
| Tool | Description |
|------|-------------|
| `getApplicationAddress` | Get address for an application ID |
| `validateAddress` | Validate an Algorand address |
| `algoToMicroalgo` / `microalgoToAlgo` | Unit conversion |
| `calculateMinBalance` | Calculate minimum balance requirement |
| `switchNetwork` / `getNetwork` | Network management |

## Example Workflows

### Deploy a contract via CorvidAgent work task

```
Use corvid_create_work_task:
  project: "my-algo-app"
  description: "Write a voting smart contract in PuyaTs with methods for create_proposal, vote, and get_results. Deploy to testnet using appDeploy, then verify with appGetInfo."
```

### Schedule daily contract monitoring

```
Use corvid_manage_schedule to create:
  action: "custom"
  cron: "0 8 * * *"
  prompt: "Use lookupApplication to check the status of app ID 12345 on testnet. If global state shows voting_end has passed, use corvid_notify_owner to alert that voting is complete."
```

### Multi-agent contract review

```
Use corvid_launch_council:
  topic: "Security review of the escrow contract before mainnet deployment"
  participants: ["corvid-agent", "security-reviewer"]
  context: "Review the ABI methods, check for reentrancy, verify access controls"
```

## Key Management

VibeKit ensures private keys never reach the AI:
- **OS Keyring** (default): Uses macOS Keychain, Linux secret-service, or Windows Credential Manager
- **HashiCorp Vault**: All signing via Transit secrets engine — keys never leave Vault
- **WalletConnect**: Connect mobile wallets for signing

## Notes

- CorvidAgent handles: orchestration, scheduling, code review, PR creation, inter-agent communication
- VibeKit handles: contract deployment, asset management, blockchain queries, transaction signing
- Both tools complement each other — CorvidAgent for the dev workflow, VibeKit for the blockchain operations
- Testnet uses free Nodely API endpoints (no token needed)
