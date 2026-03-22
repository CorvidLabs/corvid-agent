export type PersonaArchetype = 'custom' | 'professional' | 'friendly' | 'technical' | 'creative' | 'formal';

export interface Persona {
    id: string;
    name: string;
    archetype: PersonaArchetype;
    traits: string[];
    voiceGuidelines: string;
    background: string;
    exampleMessages: string[];
    createdAt: string;
    updatedAt: string;
}

export interface CreatePersonaInput {
    name: string;
    archetype?: PersonaArchetype;
    traits?: string[];
    voiceGuidelines?: string;
    background?: string;
    exampleMessages?: string[];
}

export interface UpdatePersonaInput {
    name?: string;
    archetype?: PersonaArchetype;
    traits?: string[];
    voiceGuidelines?: string;
    background?: string;
    exampleMessages?: string[];
}

export interface AssignPersonaInput {
    personaId: string;
    sortOrder?: number;
}

/** @deprecated Use Persona instead — kept for backward compat */
export interface AgentPersona {
    agentId: string;
    archetype: PersonaArchetype;
    traits: string[];
    voiceGuidelines: string;
    background: string;
    exampleMessages: string[];
    createdAt: string;
    updatedAt: string;
}

/** @deprecated Use CreatePersonaInput instead */
export interface UpsertPersonaInput {
    archetype?: PersonaArchetype;
    traits?: string[];
    voiceGuidelines?: string;
    background?: string;
    exampleMessages?: string[];
}
