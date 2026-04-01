---
spec: types.spec.md
---

## User Stories

- As a developer, I want the codebase to compile even when `@corvidlabs/ts-algochat` is not installed, so that I can work in environments without access to the private package
- As a type checker, I want accurate TypeScript declarations for AlgoChat types, so that I can catch type errors at compile time

## Acceptance Criteria

- `ts-algochat.d.ts` declares all types from `@corvidlabs/ts-algochat` that are imported by the codebase
- All exported interfaces have appropriate type annotations (`EncryptionKeys`, `ChatAccount`, `PSKState`, etc.)
- Service classes (`AlgorandService`, `SyncManager`, `SendQueue`) are declared with their public methods
- Encryption/decryption functions are declared with correct parameter and return types
- Network preset functions (`localnet()`, `testnet()`, `mainnet()`) return `NetworkPreset` type
- `PROTOCOL` constants object is declared with `MAX_PAYLOAD_SIZE`, `TAG_SIZE`, and `MIN_PAYMENT`
- The `declare module` block properly scopes all declarations under `@corvidlabs/ts-algochat`
- No runtime code is generated from this file — it is purely for type checking

## Constraints

- Must remain compatible with the actual `@corvidlabs/ts-algochat` package types
- Cannot use `import` statements — must use ambient module declarations
- All function parameters and return types must match the actual implementation
- Index signatures (`[key: string]: unknown`) allow for future compatibility

## Out of Scope

- Runtime implementation of these types (provided by the actual package)
- Documentation of internal implementation details
- Additional utility types not used by the codebase
