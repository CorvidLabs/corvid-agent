---
spec: bridge.spec.md
---

## Active Tasks

- [ ] On-chain transparency: surface AlgoChat message flow and transaction history in the dashboard (#1458)
- [ ] Grow the flock: enable external agents on different machines to join via testnet/mainnet AlgoChat (#1459)
- [ ] Improve PSK discovery UX — expose discovery status and unmatched contact count to operators
- [ ] Add `/history` pagination support (currently hard-capped at 20 transactions)

## Completed Tasks

- [x] Encrypted on-chain messaging via ARC-69 PSK (self-to-self encryption)
- [x] Per-agent conversation access control (private / allowlist / public modes)
- [x] Group message reassembly for multi-part `[GRP:N/M]` transactions
- [x] Slash commands: `/status`, `/stop`, `/work`, `/council`, `/credits`, `/schedule`, `/extend`
- [x] PSK discovery poller with trial-decryption for mobile wallet onboarding
- [x] On-chain deduplication via `processedTxids` with 500-entry pruning
