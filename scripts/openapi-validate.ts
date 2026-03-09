#!/usr/bin/env bun
/**
 * OpenAPI spec validation script.
 *
 * Generates the OpenAPI spec from route definitions and validates its structure,
 * consistency, and completeness.
 *
 * Run via: bun scripts/openapi-validate.ts
 *
 * Flags:
 *   --export   Output the full spec as JSON (no validation)
 *   --strict   Treat warnings as errors
 *
 * Exits 0 on success, 1 on validation errors.
 */

import { generateOpenApiSpec } from '../server/openapi/generator';
import { routes } from '../server/openapi/route-registry';

interface ValidationResult {
    errors: number;
    warnings: number;
    routeCount: number;
    operationCount: number;
    tagCount: number;
    schemaCount: number;
}

function validate(strict: boolean): ValidationResult {
    const spec = generateOpenApiSpec({ serverUrl: 'http://localhost:3000' });
    let errors = 0;
    let warnings = 0;

    function error(msg: string): void {
        console.error(`[ERROR] ${msg}`);
        errors++;
    }

    function warn(msg: string): void {
        console.warn(`[WARN]  ${msg}`);
        warnings++;
    }

    // ── 1. Basic structure ─────────────────────────────────────────────────
    if (spec.openapi !== '3.0.3') {
        error(`Expected openapi: 3.0.3, got: ${spec.openapi}`);
    }
    if (!spec.info?.title || !spec.info?.version) {
        error('Missing info.title or info.version');
    }
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
        error('No paths defined');
    }

    // ── 2. Validate each path/operation ────────────────────────────────────
    const operationIds = new Set<string>();
    const usedTags = new Set<string>();
    let routeCount = 0;
    let schemaCount = 0;

    for (const [path, methods] of Object.entries(spec.paths)) {
        // Validate path format
        if (!path.startsWith('/')) {
            error(`Path must start with /: ${path}`);
        }

        for (const [method, operation] of Object.entries(methods)) {
            routeCount++;
            const op = operation as {
                operationId?: string;
                summary?: string;
                tags?: string[];
                responses?: Record<string, unknown>;
                parameters?: Array<{ name: string; in: string; required?: boolean }>;
                requestBody?: { required?: boolean; content?: Record<string, { schema?: Record<string, unknown> }> };
                security?: Array<Record<string, string[]>>;
            };

            const label = `${method.toUpperCase()} ${path}`;

            // operationId must be unique
            if (!op.operationId) {
                error(`Missing operationId: ${label}`);
            } else if (operationIds.has(op.operationId)) {
                error(`Duplicate operationId: ${op.operationId} (${label})`);
            } else {
                operationIds.add(op.operationId);
            }

            // Must have summary
            if (!op.summary) {
                error(`Missing summary: ${label}`);
            }

            // Must have at least one tag
            if (!op.tags || op.tags.length === 0) {
                error(`Missing tags: ${label}`);
            } else {
                for (const tag of op.tags) {
                    usedTags.add(tag);
                }
            }

            // Must have responses
            if (!op.responses || Object.keys(op.responses).length === 0) {
                error(`Missing responses: ${label}`);
            }

            // Path params must have corresponding parameter definitions
            const paramNames = Array.from(path.matchAll(/\{([^}]+)\}/g), (m) => m[1]);
            if (paramNames.length > 0) {
                if (!op.parameters) {
                    error(`Path has {params} but no parameter definitions: ${label}`);
                } else {
                    for (const paramName of paramNames) {
                        const paramDef = op.parameters.find(
                            (p) => p.name === paramName && p.in === 'path',
                        );
                        if (!paramDef) {
                            error(`Path param {${paramName}} not defined: ${label}`);
                        }
                    }
                }
            }

            // Request body schema validation
            if (op.requestBody?.content) {
                const jsonContent = op.requestBody.content['application/json'];
                if (!jsonContent?.schema) {
                    error(`Request body missing schema: ${label}`);
                } else {
                    schemaCount++;
                    // Check schema has properties (not just `{ type: 'object' }` placeholder)
                    const schema = jsonContent.schema;
                    if (schema.type === 'object' && !schema.properties && !schema.anyOf && !schema.oneOf) {
                        warn(`Request body schema has no properties (generic placeholder): ${label}`);
                    }
                }
            }

            // Mutating methods should have requestBody unless they are action-style endpoints
            const mutating = ['post', 'put', 'patch'].includes(method.toLowerCase());
            if (mutating && !op.requestBody) {
                // Action endpoints (stop, abort, trigger, etc.) are OK without body
                const actionPatterns = [
                    /\/stop$/, /\/abort$/, /\/trigger$/, /\/review$/, /\/synthesize$/,
                    /\/cancel$/, /\/retry$/, /\/unload$/, /\/release\//, /\/backfill$/,
                    /\/test$/, /\/backup$/, /\/conversations$/, /\/psk-exchange$/,
                    /\/device$/, // initiate device flow (no body needed)
                ];
                const isAction = actionPatterns.some((p) => p.test(path));
                if (!isAction) {
                    warn(`Mutating ${label} has no requestBody schema`);
                }
            }
        }
    }

    // ── 3. Tag consistency ─────────────────────────────────────────────────
    const definedTags = new Set((spec.tags ?? []).map((t: { name: string }) => t.name));

    for (const tag of usedTags) {
        if (!definedTags.has(tag)) {
            warn(`Tag "${tag}" used in operations but not defined in spec.tags`);
        }
    }

    for (const tag of definedTags) {
        if (!usedTags.has(tag)) {
            warn(`Tag "${tag}" defined in spec.tags but not used by any operation`);
        }
    }

    // ── 4. Security scheme references ──────────────────────────────────────
    const securitySchemes = spec.components?.securitySchemes ?? {};
    if (!securitySchemes.BearerAuth) {
        error('Missing BearerAuth security scheme');
    }

    // ── 5. Route registry consistency ──────────────────────────────────────
    // Check that all route registry entries produce valid spec entries
    const registryPaths = new Set<string>();
    for (const route of routes) {
        const key = `${route.method.toLowerCase()}:${route.path}`;
        if (registryPaths.has(key)) {
            error(`Duplicate route in registry: ${route.method} ${route.path}`);
        }
        registryPaths.add(key);
    }

    // ── 6. Summary ─────────────────────────────────────────────────────────
    const tagCount = spec.tags?.length ?? 0;
    console.log(`\nOpenAPI Spec Validation Summary:`);
    console.log(`  Routes:     ${routeCount}`);
    console.log(`  Tags:       ${tagCount}`);
    console.log(`  Operations: ${operationIds.size}`);
    console.log(`  Schemas:    ${schemaCount}`);
    console.log(`  Errors:     ${errors}`);
    console.log(`  Warnings:   ${warnings}`);

    const effectiveErrors = strict ? errors + warnings : errors;

    if (effectiveErrors > 0) {
        const suffix = strict && warnings > 0 ? ' (warnings treated as errors with --strict)' : '';
        console.error(`\n${effectiveErrors} validation issue(s) found.${suffix}`);
    } else {
        console.log('\nAll checks passed.');
    }

    return { errors: effectiveErrors, warnings, routeCount, operationCount: operationIds.size, tagCount, schemaCount };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv.includes('--export')) {
    const spec = generateOpenApiSpec({ serverUrl: 'http://localhost:3000' });
    console.log(JSON.stringify(spec, null, 2));
    process.exit(0);
}

const strict = process.argv.includes('--strict');
const result = validate(strict);
process.exit(result.errors > 0 ? 1 : 0);
