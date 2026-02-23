export type PersonaArchetype = 'custom' | 'professional' | 'friendly' | 'technical' | 'creative' | 'formal';

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

export interface UpsertPersonaInput {
    archetype?: PersonaArchetype;
    traits?: string[];
    voiceGuidelines?: string;
    background?: string;
    exampleMessages?: string[];
}
