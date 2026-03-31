# Lib Schemas — Context

## Why This Module Exists

REST API routes need consistent request/response validation. The schemas module provides Zod schemas for API payloads — marketplace listings, agent configurations, and other structured inputs. Centralizing schemas here keeps validation consistent and enables automatic OpenAPI type generation.

## Architectural Role

Schemas is a **validation layer** — it defines the shape of data at API boundaries. Route handlers use these schemas to validate incoming requests before processing.

## Key Design Decisions

- **Zod-based**: Uses Zod for runtime validation with TypeScript type inference. This avoids maintaining separate type definitions and validation logic.
- **Co-located with lib**: Schemas live under `lib/` because they're shared infrastructure used by multiple route handlers, not specific to any one feature.
- **OpenAPI integration**: Zod schemas can be converted to JSON Schema for OpenAPI documentation, bridging validation and documentation.

## Relationship to Other Modules

- **Routes**: Route handlers import schemas for request validation.
- **OpenAPI**: Schemas contribute to the generated API specification.
- **Marketplace**: Marketplace-specific schemas define listing and transaction payloads.
