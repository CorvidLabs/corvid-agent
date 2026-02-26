#!/usr/bin/env bun
/**
 * OpenAPI spec validation script.
 *
 * Generates the OpenAPI spec from route definitions and validates its structure.
 * Run via: bun scripts/openapi-validate.ts
 *
 * Exits 0 on success, 1 on validation errors.
 */

import { generateOpenApiSpec } from '../server/openapi/generator';

function validate(): boolean {
    const spec = generateOpenApiSpec({ serverUrl: 'http://localhost:3000' });
    let errors = 0;

    // 1. Basic structure
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

    // 2. Validate each path/operation
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
            if (paramNames.length > 0 && op.parameters) {
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

            // Request body schema validation
            if (op.requestBody?.content) {
                const jsonContent = op.requestBody.content['application/json'];
                if (!jsonContent?.schema) {
                    console.error(`[ERROR] Request body missing schema: ${method.toUpperCase()} ${path}`);
                    errors++;
                }
            }
        }
    }

    // 3. Check security schemes referenced
    const securitySchemes = spec.components?.securitySchemes ?? {};
    if (!securitySchemes.BearerAuth) {
        console.error('[ERROR] Missing BearerAuth security scheme');
        errors++;
    }

    // 4. Summary
    const tagCount = spec.tags?.length ?? 0;
    console.log(`\nOpenAPI Spec Validation Summary:`);
    console.log(`  Routes: ${routeCount}`);
    console.log(`  Tags: ${tagCount}`);
    console.log(`  Operations: ${operationIds.size}`);
    console.log(`  Errors: ${errors}`);

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
