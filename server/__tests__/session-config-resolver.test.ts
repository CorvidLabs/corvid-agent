import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import type { Agent } from '../../shared/types';

// ── Mock DB functions ──────────────────────────────────────────────────
// Must be declared before importing the module under test.

const mockGetPersona = mock(() => null as { name: string; systemPrompt: string } | null);
const mockComposePersonaPrompt = mock((_persona: unknown): string | null => null);
const mockResolveAgentPromptAdditions = mock((_db: unknown, _agentId: string) => null as string | null);
const mockResolveProjectPromptAdditions = mock((_db: unknown, _projectId: string) => null as string | null);
const mockResolveAgentTools = mock((_db: unknown, _agentId: string, base: string[] | null) => base);
const mockResolveProjectTools = mock((_db: unknown, _projectId: string, merged: string[] | null) => merged);
const mockGetAgent = mock((_db: unknown, _agentId: string) => null as Agent | null);

mock.module('../db/personas', () => ({
    getPersona: mockGetPersona,
    composePersonaPrompt: mockComposePersonaPrompt,
}));

mock.module('../db/skill-bundles', () => ({
    resolveAgentPromptAdditions: mockResolveAgentPromptAdditions,
    resolveProjectPromptAdditions: mockResolveProjectPromptAdditions,
    resolveAgentTools: mockResolveAgentTools,
    resolveProjectTools: mockResolveProjectTools,
}));

mock.module('../db/agents', () => ({
    getAgent: mockGetAgent,
}));

// Import after mocks are set up
import { resolveSessionPrompts, resolveToolPermissions, resolveSessionConfig } from '../process/session-config-resolver';

const fakeDb = {} as Database;
const fakeAgent = { id: 'agent-1', mcpToolPermissions: null } as unknown as Agent;

describe('session-config-resolver', () => {
    beforeEach(() => {
        mockGetPersona.mockReset();
        mockComposePersonaPrompt.mockReset();
        mockResolveAgentPromptAdditions.mockReset();
        mockResolveProjectPromptAdditions.mockReset();
        mockResolveAgentTools.mockReset();
        mockResolveProjectTools.mockReset();
        mockGetAgent.mockReset();

        // Default return values
        mockGetPersona.mockReturnValue(null);
        mockComposePersonaPrompt.mockReturnValue(null);
        mockResolveAgentPromptAdditions.mockReturnValue(null);
        mockResolveProjectPromptAdditions.mockReturnValue(null);
        mockResolveAgentTools.mockImplementation((_db, _agentId, base) => base);
        mockResolveProjectTools.mockImplementation((_db, _projectId, merged) => merged);
        mockGetAgent.mockReturnValue(null);
    });

    // ── resolveSessionPrompts ──────────────────────────────────────────

    describe('resolveSessionPrompts', () => {
        it('returns undefined prompts when no agent is provided', () => {
            const result = resolveSessionPrompts(fakeDb, null, null);
            expect(result.personaPrompt).toBeUndefined();
            expect(result.skillPrompt).toBeUndefined();
        });

        it('returns persona prompt when agent has a persona', () => {
            const persona = { name: 'CorvidAgent', systemPrompt: 'You are helpful' };
            mockGetPersona.mockReturnValue(persona);
            mockComposePersonaPrompt.mockReturnValue('You are CorvidAgent. You are helpful.');

            const result = resolveSessionPrompts(fakeDb, fakeAgent, null);
            expect(result.personaPrompt).toBe('You are CorvidAgent. You are helpful.');
            expect(mockGetPersona).toHaveBeenCalledWith(fakeDb, 'agent-1');
        });

        it('returns skill prompt from agent-level bundles', () => {
            mockResolveAgentPromptAdditions.mockReturnValue('skill prompt A');

            const result = resolveSessionPrompts(fakeDb, fakeAgent, null);
            expect(result.skillPrompt).toBe('skill prompt A');
        });

        it('returns project-level skill prompt when no agent', () => {
            mockResolveProjectPromptAdditions.mockReturnValue('project skill B');

            const result = resolveSessionPrompts(fakeDb, null, 'proj-1');
            expect(result.skillPrompt).toBe('project skill B');
        });

        it('merges agent and project skill prompts', () => {
            mockResolveAgentPromptAdditions.mockReturnValue('agent skill');
            mockResolveProjectPromptAdditions.mockReturnValue('project skill');

            const result = resolveSessionPrompts(fakeDb, fakeAgent, 'proj-1');
            expect(result.skillPrompt).toBe('agent skill\n\nproject skill');
        });

        it('uses only agent skill when project has none', () => {
            mockResolveAgentPromptAdditions.mockReturnValue('agent skill');
            mockResolveProjectPromptAdditions.mockReturnValue(null);

            const result = resolveSessionPrompts(fakeDb, fakeAgent, 'proj-1');
            expect(result.skillPrompt).toBe('agent skill');
        });
    });

    // ── resolveToolPermissions ─────────────────────────────────────────

    describe('resolveToolPermissions', () => {
        it('returns null when agent has no explicit permissions', () => {
            mockGetAgent.mockReturnValue({ ...fakeAgent, mcpToolPermissions: null } as Agent);
            mockResolveAgentTools.mockReturnValue(null);
            mockResolveProjectTools.mockReturnValue(null);

            const result = resolveToolPermissions(fakeDb, 'agent-1', 'proj-1');
            expect(result).toBeNull();
        });

        it('returns agent-level tools when agent has explicit permissions', () => {
            const perms = ['corvid_send_message'];
            mockGetAgent.mockReturnValue({ ...fakeAgent, mcpToolPermissions: perms } as unknown as Agent);
            mockResolveAgentTools.mockReturnValue(perms);

            const result = resolveToolPermissions(fakeDb, 'agent-1', 'proj-1');
            expect(result).toEqual(perms);
            // Should NOT call resolveProjectTools when agent has explicit perms
            expect(mockResolveProjectTools).not.toHaveBeenCalled();
        });

        it('merges project tools when agent has no explicit permissions', () => {
            mockGetAgent.mockReturnValue({ ...fakeAgent, mcpToolPermissions: null } as Agent);
            mockResolveAgentTools.mockReturnValue(null);
            mockResolveProjectTools.mockReturnValue(['corvid_create_work_task']);

            const result = resolveToolPermissions(fakeDb, 'agent-1', 'proj-1');
            expect(result).toEqual(['corvid_create_work_task']);
        });

        it('skips project tools when no projectId', () => {
            mockGetAgent.mockReturnValue({ ...fakeAgent, mcpToolPermissions: null } as Agent);
            mockResolveAgentTools.mockReturnValue(null);

            resolveToolPermissions(fakeDb, 'agent-1', null);
            expect(mockResolveProjectTools).not.toHaveBeenCalled();
        });
    });

    // ── resolveSessionConfig (combined) ────────────────────────────────

    describe('resolveSessionConfig', () => {
        it('returns all three config values', () => {
            mockComposePersonaPrompt.mockReturnValue('persona');
            mockGetPersona.mockReturnValue({ name: 'Test', systemPrompt: '' });
            mockResolveAgentPromptAdditions.mockReturnValue('skill');
            mockGetAgent.mockReturnValue({ ...fakeAgent, mcpToolPermissions: null } as Agent);
            mockResolveAgentTools.mockReturnValue(['tool-a']);

            const result = resolveSessionConfig(fakeDb, fakeAgent, 'agent-1', null);
            expect(result.personaPrompt).toBe('persona');
            expect(result.skillPrompt).toBe('skill');
            expect(result.resolvedToolPermissions).toEqual(['tool-a']);
        });

        it('returns null permissions when no agentId', () => {
            const result = resolveSessionConfig(fakeDb, null, null, null);
            expect(result.resolvedToolPermissions).toBeNull();
        });
    });
});
