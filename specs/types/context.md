# Types — Context

## Why This Module Exists

The corvid-agent server has an optional dependency on `@corvidlabs/ts-algochat` for Algorand blockchain integration. This module provides TypeScript declaration stubs that satisfy the compiler when the actual package is not installed, enabling the codebase to compile in environments where the AlgoChat library is unavailable.

## Architectural Role

Types is a **shim module** — it provides minimal type declarations for external dependencies. These stubs allow the TypeScript compiler to resolve imports from `@corvidlabs/ts-algochat` without requiring the actual implementation.

## Key Design Decisions

- **Optional dependency support**: The actual `@corvidlabs/ts-algochat` package is optional; these stubs ensure the codebase compiles regardless.
- **Minimal surface area**: Only types and functions actually used by the codebase are declared.
- **Module augmentation**: Uses `declare module` to extend the module namespace.

## Relationship to Other Modules

- **AlgoChat**: Provides type definitions for the AlgoChat service classes and encryption utilities.
- **Lib**: Uses these types for wallet and encryption operations.

## Current State

- Single declaration file: `ts-algochat.d.ts`
- Declares types for encryption, accounts, PSK (Pre-Shared Key) messaging, and service classes
- No runtime code — purely compile-time type declarations
