#!/usr/bin/env bun
/**
 * OpenAPI spec validation script.
 *
 * Generates the OpenAPI spec from route definitions and validates:
 * 1. Structural correctness (operationIds, summaries, tags, responses, params)
 * 2. Cross-reference with route registry (duplicate detection, consistency)
 * 3. Route registry completeness (every registry entry has required fields)
 *
 * Run via: bun scripts/openapi-validate.ts
 *         bun scripts/openapi-validate.ts --export    # dump spec as JSON
 *         bun scripts/openapi-validate.ts --verbose   # show warnings too
 *
 * Exits 0 on success, 1 on validation errors.
 */

import { generateOpenApiSpec } from '../server/openapi/generator';
import { routes } from '../server/openapi/route-registry';

const verbose = process.argv.includes('--verbose');
let warnings = 0;

function warn(msg: string): void {
    warnings++;
    if (verbose) console.warn(`[WARN] ${msg}`);
}

function validate(): boolean {
    const spec = generateOpenApiSpec({ serverUrl: 'http://localhost:3000' });
    let errors = 0;

    // ── 1. Basic structure ──────────────────────────────────────────────
    if (spec.openapi !== '3.0.3') {
        console.error(`[ERROR] Expected openapi: 3.0.3, got: ${spec.openapi}`);
        errors++;
    }
    if (!spec.info?.title || !spec.info?.version) {
        console.error('[ERROR] Missing info.title or info.version');
        errors++;
    }
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
        console.error('[ERROR] No paths defined');
        errors++;
    }

    // ── 2. Validate each path/operation ─────────────────────────────────
    const operationIds = new Set<string>();
    let routeCount = 0;

    for (const [path, methods] of Object.entries(spec.paths)) {
        // Validate path format
        if (!path.startsWith('/')) {
            console.error(`[ERROR] Path must start with /: ${path}`);
            errors++;
        }

        for (const [method, operation] of Object.entries(methods)) {
            routeCount++;
            const op = operation as {
                operationId?: string;
                summary?: string;
                tags?: string[];
                responses?: Record<string, unknown>;
                parameters?: Array<{ name: string; in: string; required?: boolean }>;
                requestBody?: { content?: Record<string, { schema?: unknown }> };
                security?: Array<Record<string, string[]>>;
            };

            // operationId must be unique
            if (!op.operationId) {
                console.error(`[ERROR] Missing operationId: ${method.toUpperCase()} ${path}`);
                errors++;
            } else if (operationIds.has(op.operationId)) {
                console.error(`[ERROR] Duplicate operationId: ${op.operationId} (${method.toUpperCase()} ${path})`);
                errors++;
            } else {
                operationIds.add(op.operationId);
            }

            // Must have summary
            if (!op.summary) {
                console.error(`[ERROR] Missing summary: ${method.toUpperCase()} ${path}`);
                errors++;
            }

            // Must have at least one tag
            if (!op.tags || op.tags.length === 0) {
                console.error(`[ERROR] Missing tags: ${method.toUpperCase()} ${path}`);
                errors++;
            }

            // Must have responses
            if (!op.responses || Object.keys(op.responses).length === 0) {
                console.error(`[ERROR] Missing responses: ${method.toUpperCase()} ${path}`);
                errors++;
            }

            // Path params must have corresponding parameter definitions
            const paramNames = Array.from(path.matchAll(/\{([^}]+)\}/g), (m) => m[1]);
            if (paramNames.length > 0) {
                if (!op.parameters) {
                    console.error(`[ERROR] Path has {params} but no parameter definitions: ${method.toUpperCase()} ${path}`);
                    errors++;
                } else {
                    for (const paramName of paramNames) {
                        const paramDef = op.parameters.find(
                            (p) => p.name === paramName && p.in === 'path',
                        );
                        if (!paramDef) {
                            console.error(`[ERROR] Path param {${paramName}} not defined: ${method.toUpperCase()} ${path}`);
                            errors++;
                        }
                    }
                }
            }

            // Request body schema validation
            if (op.requestBody?.content) {
                const jsonContent = op.requestBody.content['application/json'];
                if (!jsonContent?.schema) {
                    console.error(`[ERROR] Request body missing schema: ${method.toUpperCase()} ${path}`);
                    errors++;
                }
            }

            // POST/PUT/PATCH should typically have request body
            if (['post', 'put', 'patch'].includes(method) && !op.requestBody) {
                warn(`${method.toUpperCase()} ${path} has no request body`);
            }
        }
    }

    // ── 3. Check security schemes ───────────────────────────────────────
    const securitySchemes = spec.components?.securitySchemes ?? {};
    if (!securitySchemes.BearerAuth) {
        console.error('[ERROR] Missing BearerAuth security scheme');
        errors++;
    }

    // ── 4. Route registry integrity checks ──────────────────────────────
    const registryKeys = new Set<string>();
    for (const route of routes) {
        const key = `${route.method} ${route.path}`;

        // Check for duplicate registry entries
        if (registryKeys.has(key)) {
            console.error(`[ERROR] Duplicate registry entry: ${key}`);
            errors++;
        }
        registryKeys.add(key);

        // Validate method is a known HTTP method
        if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(route.method)) {
            console.error(`[ERROR] Invalid HTTP method in registry: ${route.method} (${key})`);
            errors++;
        }

        // Path must use {param} syntax (not :param)
        if (route.path.includes('/:')) {
            console.error(`[ERROR] Path uses :param syntax instead of {param}: ${key}`);
            errors++;
        }

        // Auth must be a known value
        if (!['required', 'admin', 'none'].includes(route.auth)) {
            console.error(`[ERROR] Invalid auth level "${route.auth}": ${key}`);
            errors++;
        }

        // Tags must not be empty
        if (!route.tags || route.tags.length === 0) {
            console.error(`[ERROR] Route has no tags in registry: ${key}`);
            errors++;
        }

        // Summary must not be empty
        if (!route.summary || route.summary.trim() === '') {
            console.error(`[ERROR] Route has no summary in registry: ${key}`);
            errors++;
        }
    }

    // ── 5. Cross-reference: spec paths vs registry ──────────────────────
    // Build set from generated spec
    const specKeys = new Set<string>();
    for (const [path, methods] of Object.entries(spec.paths)) {
        for (const method of Object.keys(methods)) {
            specKeys.add(`${method.toUpperCase()} ${path}`);
        }
    }

    // Registry entries not in spec (should never happen if generator works)
    for (const key of registryKeys) {
        if (!specKeys.has(key)) {
            console.error(`[ERROR] Registry entry not in generated spec: ${key}`);
            errors++;
        }
    }

    // Spec entries not in registry (should never happen — spec is built from registry)
    for (const key of specKeys) {
        if (!registryKeys.has(key)) {
            console.error(`[ERROR] Spec entry not in registry: ${key}`);
            errors++;
        }
    }

    // ── 6. Tag consistency ──────────────────────────────────────────────
    const usedTags = new Set<string>();
    for (const route of routes) {
        for (const tag of route.tags) {
            usedTags.add(tag);
        }
    }

    // Check that all used tags appear in the spec's tag list
    const specTagNames = new Set((spec.tags ?? []).map((t) => t.name));
    for (const tag of usedTags) {
        if (!specTagNames.has(tag)) {
            console.error(`[ERROR] Tag "${tag}" used in routes but not in spec tag list`);
            errors++;
        }
    }

    // ── Summary ─────────────────────────────────────────────────────────
    const tagCount = spec.tags?.length ?? 0;
    console.log(`\nOpenAPI Spec Validation Summary:`);
    console.log(`  Routes: ${routeCount}`);
    console.log(`  Registry entries: ${registryKeys.size}`);
    console.log(`  Tags: ${tagCount}`);
    console.log(`  Operations: ${operationIds.size}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Warnings: ${warnings}`);

    if (errors > 0) {
        console.error(`\n${errors} validation error(s) found.`);
        return false;
    }

    console.log('\nAll checks passed.');
    return true;
}

// Also export the spec as JSON for CI pipelines
if (process.argv.includes('--export')) {
    const spec = generateOpenApiSpec({ serverUrl: 'http://localhost:3000' });
    console.log(JSON.stringify(spec, null, 2));
    process.exit(0);
}

const ok = validate();
process.exit(ok ? 0 : 1);
