/**
 * Tests that external MCP server configs (Figma, GitHub, etc.) are loaded
 * in BOTH the initial startProcess AND the resumeProcess code paths.
 *
 * Bug context: Previously, resumeProcess did not call getActiveServersForAgent,
 * so resumed sessions lost access to external MCP tools (Figma, GitHub).
 * The initial query had the tools, but when the SDK process exited and the
 * session was resumed for a follow-up message, external MCP configs were missing.
 *
 * Spec invariant: process-manager.spec.md #15 — External MCP parity
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const MANAGER_SOURCE = readFileSync(
    join(import.meta.dir, '..', 'process', 'manager.ts'),
    'utf-8',
);

describe('External MCP config loading parity (spec invariant #15)', () => {
    test('manager.ts imports getActiveServersForAgent', () => {
        expect(MANAGER_SOURCE).toContain("import { getActiveServersForAgent } from '../db/mcp-servers'");
    });

    test('startSdkProcessWrapped loads external MCP configs', () => {
        // Extract the startSdkProcessWrapped method body
        const startIdx = MANAGER_SOURCE.indexOf('private startSdkProcessWrapped(');
        expect(startIdx).toBeGreaterThan(-1);

        // Find the next method boundary (next "private " or "public " at same indentation)
        const methodBody = MANAGER_SOURCE.slice(startIdx, startIdx + 3000);

        expect(methodBody).toContain('getActiveServersForAgent(this.db, session.agentId)');
        expect(methodBody).toContain('externalMcpConfigs');
    });

    test('resumeProcess loads external MCP configs for SDK path', () => {
        // Extract the resumeProcess method body (large method, need 8000 chars)
        const startIdx = MANAGER_SOURCE.indexOf('resumeProcess(session: Session');
        expect(startIdx).toBeGreaterThan(-1);

        const methodBody = MANAGER_SOURCE.slice(startIdx, startIdx + 8000);

        // Must call getActiveServersForAgent for resumed SDK sessions
        expect(methodBody).toContain('getActiveServersForAgent(this.db, session.agentId)');
        // Must pass externalMcpConfigs to startSdkProcess
        expect(methodBody).toContain('externalMcpConfigs');
    });

    test('startDirectProcessWrapped loads external MCP configs', () => {
        const startIdx = MANAGER_SOURCE.indexOf('private startDirectProcessWrapped(');
        expect(startIdx).toBeGreaterThan(-1);

        const methodBody = MANAGER_SOURCE.slice(startIdx, startIdx + 3000);

        expect(methodBody).toContain('getActiveServersForAgent(this.db, session.agentId)');
        expect(methodBody).toContain('externalMcpConfigs');
    });

    test('resumeProcess loads external MCP configs for direct path', () => {
        const startIdx = MANAGER_SOURCE.indexOf('resumeProcess(session: Session');
        expect(startIdx).toBeGreaterThan(-1);

        const methodBody = MANAGER_SOURCE.slice(startIdx, startIdx + 8000);

        // Must pass externalMcpConfigs to startDirectProcess in resume path
        expect(methodBody).toContain('externalMcpConfigs: resumeExternalMcpConfigs');
    });

    test('all four code paths (start SDK, start direct, resume SDK, resume direct) load external MCP', () => {
        // Count how many times getActiveServersForAgent appears in the file.
        // It should appear at least 3 times: start SDK, start direct, resume (shared).
        // The resume path uses a single call before the SDK/direct branch, covering both.
        const callPattern = /getActiveServersForAgent\(this\.db/g;
        const matches = MANAGER_SOURCE.match(callPattern);
        expect(matches).not.toBeNull();
        expect(matches!.length).toBeGreaterThanOrEqual(3);
    });
});
