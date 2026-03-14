# Flock Directory Smart Contract

TEALScript source for the FlockDirectory Algorand smart contract. This contract manages an on-chain registry of agents with staking, reputation tiers, and challenge-based testing.

## Prerequisites

- [TEALScript](https://github.com/algorandfoundation/TEALScript) v0.107.2+
- Node.js 18+ or Bun

Install TEALScript:

```bash
npm install -g @algorandfoundation/tealscript
```

## Compile

```bash
tealscript contracts/flock-directory.algo.ts contracts/artifacts
```

This produces:
- `FlockDirectory.approval.teal` — approval program
- `FlockDirectory.clear.teal` — clear-state program
- `FlockDirectory.arc56.json` — ARC-56 application specification (methods, state, structs)
- `FlockDirectory.arc32.json` — ARC-32 application specification

## Regenerate the ARC-56 spec

After modifying the source, recompile and copy the updated spec into the server:

```bash
tealscript contracts/flock-directory.algo.ts contracts/artifacts
cp contracts/artifacts/FlockDirectory.arc56.json server/flock-directory/contract/FlockDirectory.arc56.json
```

## Generate typed client

Use [algokit-client-generator](https://github.com/algorandfoundation/algokit-client-generator-ts) to produce a typed TypeScript client from the ARC-56 spec:

```bash
npx @algorandfoundation/algokit-client-generator generate \
  -a server/flock-directory/contract/FlockDirectory.arc56.json \
  -o server/flock-directory/contract/FlockDirectoryClient.ts
```

## Contract overview

| Item | Details |
|------|---------|
| Global state | `admin` (address), `min_stake` (uint64), `reg_open` (uint64), `agent_count` (uint64), `chal_count` (uint64) |
| Box maps | `agents` (prefix `a`), `testResults` (prefix `t`), `challenges` (prefix `c`) |
| Methods | 17 (1 create + 16 call) |
| Tier system | REGISTERED (1), TESTED (2, 1+ tests), ESTABLISHED (3, 5+ tests), TRUSTED (4, 10+ tests) |
| Min stake default | 1,000,000 microALGO (1 ALGO) |
