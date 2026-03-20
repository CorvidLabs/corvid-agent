---
name: credits
description: Use this skill when the user wants to check credit balances, grant credits to a wallet, or configure the credit system. Triggers include "check credits", "credit balance", "grant credits", "free credits", "credit config", "billing", or any reference to the CorvidAgent credit system.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Credits — Credit Management

Check balances, grant credits, and configure the credit system for CorvidAgent usage.

## MCP Tools

- `corvid_check_credits` — Check credit balance for a wallet address
  - Parameters: `address` (wallet address to check)
- `corvid_grant_credits` — Grant free credits to a wallet
  - Parameters: `address` (recipient wallet), `amount` (credits to grant, max 1M per grant)
- `corvid_credit_config` — View or update credit system configuration
  - Parameters: `action` ("view" or "update"), `config` (optional, new config values)

## Examples

### Check balance

```
Use corvid_check_credits:
  address: "ALGO_WALLET_ADDRESS_HERE"
```

### Grant credits

```
Use corvid_grant_credits:
  address: "ALGO_WALLET_ADDRESS_HERE"
  amount: 10000
```

### View credit config

```
Use corvid_credit_config:
  action: "view"
```

## Rules

- Maximum 1,000,000 credits per grant
- Only authorized agents can grant credits
- Credit config changes require owner-level permissions
