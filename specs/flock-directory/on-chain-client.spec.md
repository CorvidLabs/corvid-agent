---
module: flock-directory-on-chain
version: 1
status: active
files:
  - server/flock-directory/on-chain-client.ts
  - server/flock-directory/deploy.ts
  - server/flock-directory/contract/FlockDirectoryClient.generated.ts
db_tables:
  - flock_directory_config
depends_on:
  - server/lib/logger.ts
  - server/lib/secure-wipe.ts
  - server/algochat/service.ts
  - server/flock-directory/contract/FlockDirectoryClient.generated.ts
---

# Flock Directory On-Chain Client

## Purpose

Typed client facade for the FlockDirectory smart contract on Algorand. Wraps the AlgoKit-generated FlockDirectoryClient with a purpose-built API for agent registration, heartbeat, reputation queries, challenge protocol, and admin operations. Includes deployment helpers for auto-deploying on localnet/testnet and persisting the app ID.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getPersistedAppId` | `(db: Database)` | `number` | Reads the persisted FlockDirectory app ID from `flock_directory_config` (0 if not set) |
| `setPersistedAppId` | `(db: Database, appId: number)` | `void` | Writes/updates the FlockDirectory app ID in `flock_directory_config` |
| `createFlockClient` | `(db: Database, algoChatService: AlgoChatService \| null, network: string)` | `Promise<OnChainFlockClient \| null>` | Creates a client, auto-deploying on localnet/testnet if needed. Returns null on mainnet without config or if AlgoChat unavailable |

### Exported Types

| Type | Description |
|------|-------------|
| `OnChainAgentRecord` | On-chain agent data: name, endpoint, metadata, tier, scores, heartbeat/registration rounds, stake |
| `OnChainChallenge` | Challenge data: category, description, maxScore, active flag |
| `OnChainFlockConfig` | Client config: appId, algodClient, optional waitRounds |

### Exported Classes

| Class | Description |
|-------|-------------|
| `OnChainFlockClient` | Typed facade for the FlockDirectory smart contract |

#### OnChainFlockClient Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getAppId` | `()` | `number` | Returns the current application ID |
| `deploy` | `(senderAddress: string, sk: Uint8Array)` | `Promise<number>` | Deploys the contract via AppFactory, returns new app ID |
| `fundContract` | `(senderAddress: string, sk: Uint8Array, microAlgos: number)` | `Promise<string>` | Funds the contract account for box storage and stake returns |
| `registerAgent` | `(senderAddress: string, sk: Uint8Array, name: string, endpoint: string, metadata: string, stakeMicroAlgos: number)` | `Promise<string>` | Registers an agent with a stake payment, returns txID |
| `updateAgent` | `(senderAddress: string, sk: Uint8Array, name: string, endpoint: string, metadata: string)` | `Promise<string>` | Updates agent metadata on-chain |
| `heartbeat` | `(senderAddress: string, sk: Uint8Array)` | `Promise<string>` | Sends a heartbeat to keep agent status active |
| `deregister` | `(senderAddress: string, sk: Uint8Array)` | `Promise<string>` | Deregisters and returns stake |
| `createChallenge` | `(adminAddress: string, sk: Uint8Array, challengeId: string, category: string, description: string, maxScore: number)` | `Promise<string>` | Creates a verification challenge (admin only) |
| `deactivateChallenge` | `(adminAddress: string, sk: Uint8Array, challengeId: string)` | `Promise<string>` | Deactivates a challenge (admin only) |
| `recordTestResult` | `(adminAddress: string, sk: Uint8Array, agentAddress: string, challengeId: string, score: number)` | `Promise<string>` | Records a test result for an agent (admin only) |
| `getAgentInfo` | `(agentAddress: string, readerAddress: string, sk: Uint8Array)` | `Promise<OnChainAgentRecord>` | Reads full agent record from chain |
| `getAgentTier` | `(agentAddress: string, readerAddress: string, sk: Uint8Array)` | `Promise<number>` | Reads agent reputation tier |
| `getAgentScore` | `(agentAddress: string, readerAddress: string, sk: Uint8Array)` | `Promise<number>` | Reads agent reputation score (0-100) |
| `getAgentTestCount` | `(agentAddress: string, readerAddress: string, sk: Uint8Array)` | `Promise<number>` | Reads agent test count |
| `getChallengeInfo` | `(challengeId: string, readerAddress: string, sk: Uint8Array)` | `Promise<OnChainChallenge>` | Reads challenge details |
| `updateMinStake` | `(adminAddress: string, sk: Uint8Array, newMinStakeMicroAlgos: number)` | `Promise<string>` | Updates minimum stake (admin only) |
| `transferAdmin` | `(adminAddress: string, sk: Uint8Array, newAdminAddress: string)` | `Promise<string>` | Transfers admin role (admin only) |
| `setRegistrationOpen` | `(adminAddress: string, sk: Uint8Array, open: boolean)` | `Promise<string>` | Opens/closes registration (admin only) |
| `adminRemoveAgent` | `(adminAddress: string, sk: Uint8Array, agentAddress: string)` | `Promise<string>` | Removes an agent and returns stake (admin only) |

### Exported Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TIER_REGISTERED` | `1` | Newly registered agent |
| `TIER_TESTED` | `2` | Agent has passed at least one challenge |
| `TIER_ESTABLISHED` | `3` | Agent has significant test history |
| `TIER_TRUSTED` | `4` | Highest reputation tier |
| `TIER_NAMES` | `Record<number, string>` | Maps tier numbers to human-readable names |

### Exported Constants (server/flock-directory/contract/FlockDirectoryClient.generated.ts)

| Constant | Type | Description |
|----------|------|-------------|
| `APP_SPEC` | `Arc56Contract` | ARC-56 application specification for the FlockDirectory smart contract (methods, state schema, byte code) |

### Exported Types (server/flock-directory/contract/FlockDirectoryClient.generated.ts)

| Type | Description |
|------|-------------|
| `BinaryState` | Interface for state records containing binary data with `asByteArray()` and `asString()` methods |
| `Expand` | Utility type that expands types for IntelliSense readability |
| `AgentRecord` | ARC-56 struct: name, endpoint, metadata, tier, totalScore, totalMaxScore, testCount, lastHeartbeatRound, registrationRound, stake (all bigint) |
| `TestResult` | ARC-56 struct: score, maxScore (bigint), category (string), round (bigint) |
| `Challenge` | ARC-56 struct: category, description (string), maxScore, active (bigint) |
| `FlockDirectoryArgs` | Method argument mappings in both object and tuple form for all contract methods |
| `FlockDirectoryReturns` | Return type mapping for each contract method |
| `FlockDirectoryTypes` | Complete type definition: methods (args/returns) and state (global keys, box maps) |
| `FlockDirectorySignatures` | Union of all valid ABI method signatures |
| `FlockDirectoryNonVoidMethodSignatures` | Union of method signatures that return non-void values |
| `CallParams` | Generic call parameter type for ABI method calls |
| `MethodArgs` | Maps a method signature to its argument types |
| `MethodReturn` | Maps a method signature to its return type |
| `GlobalKeysState` | Shape of global state keys: agentCount, minStake, admin, challengeCount, registrationOpen |
| `BoxKeysState` | Shape of box state keys |
| `FlockDirectoryCreateCallParams` | Create method parameter types |
| `FlockDirectoryDeployParams` | Deploy method parameter types |
| `FlockDirectoryComposer` | Transaction composer type for batching multiple contract calls |
| `FlockDirectoryComposerResults` | Results type from composed transaction execution |

### Exported Functions (server/flock-directory/contract/FlockDirectoryClient.generated.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `AgentRecordFromTuple` | `(abiTuple: [string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint])` | `AgentRecord` | Converts ABI tuple representation to AgentRecord struct |
| `TestResultFromTuple` | `(abiTuple: [bigint, bigint, string, bigint])` | `TestResult` | Converts ABI tuple representation to TestResult struct |
| `ChallengeFromTuple` | `(abiTuple: [string, string, bigint, bigint])` | `Challenge` | Converts ABI tuple representation to Challenge struct |

### Exported Classes (server/flock-directory/contract/FlockDirectoryClient.generated.ts)

| Class | Description |
|-------|-------------|
| `FlockDirectoryParamsFactory` | Abstract factory for constructing `AppClient` params objects for all ABI calls |
| `FlockDirectoryFactory` | Factory for deploying and creating FlockDirectory app clients via AlgoKit AppFactory |
| `FlockDirectoryClient` | Full typed client for the FlockDirectory smart contract — send calls, compose transactions, read state |

## Invariants

1. Secret keys are never cached in the client — a fresh signer is built per call via `buildTypedClient`.
2. `deploy()` updates the internal `appId` on success so subsequent calls use the new ID.
3. `fundContract` wipes the signed transaction buffer after submission via `wipeBuffer`.
4. `createFlockClient` never auto-deploys on mainnet — returns null if no app ID is persisted.
5. All BigInt conversions (tier, score, stake) are cast to `number` before returning.

## Behavioral Examples

### Scenario: Auto-deploy on localnet

- **Given** no persisted app ID and network is `localnet`
- **When** `createFlockClient(db, algoChatService, 'localnet')` is called
- **Then** the contract is deployed, funded with 10 ALGO, app ID is persisted, and a client is returned

### Scenario: Skip deploy on mainnet

- **Given** no persisted app ID and network is `mainnet`
- **When** `createFlockClient(db, algoChatService, 'mainnet')` is called
- **Then** returns `null` without attempting deployment

### Scenario: Persisted app ID no longer exists

- **Given** a persisted app ID that no longer exists on-chain
- **When** `createFlockClient` verifies the app
- **Then** the app ID is reset to 0 and a fresh deployment is attempted (localnet/testnet)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| AlgoChat service is null | `createFlockClient` returns null |
| Deploy fails | Logs error, returns null |
| App ID 0 returned from deploy | Throws `Error('Deploy failed: no application ID returned')` |
| Persisted app no longer on-chain | Resets to 0, re-deploys on non-mainnet |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/flock-directory/contract/FlockDirectoryClient.generated.ts` | `FlockDirectoryClient`, `FlockDirectoryFactory`, `APP_SPEC` |
| `server/lib/logger.ts` | `createLogger` |
| `server/lib/secure-wipe.ts` | `wipeBuffer` |
| `server/algochat/service.ts` | `AlgoChatService` (algodClient, chatAccount) |
| `algosdk` | Transaction construction, signing, key conversion |
| `@algorandfoundation/algokit-utils` | `AlgorandClient`, `AlgoAmount` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/flock-directory/service.ts` | `OnChainFlockClient`, `OnChainAgentRecord`, `TIER_NAMES` |
| `server/__tests__/flock-directory-on-chain.test.ts` | All exports |

## Database Tables

### flock_directory_config

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| key | TEXT | PRIMARY KEY | Config key (e.g. `app_id`) |
| value | TEXT | NOT NULL | Config value |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | Last update timestamp |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| _None_ | — | App ID is persisted in DB, not env vars. Network is passed via `createFlockClient` parameter. |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-11 | corvid-agent | Initial spec |
| 2026-03-13 | corvid-agent | Added FlockDirectoryClient.generated.ts: APP_SPEC, ARC-56 struct types/converters, FlockDirectoryParamsFactory, FlockDirectoryFactory, FlockDirectoryClient, composer types |
