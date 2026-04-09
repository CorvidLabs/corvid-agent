import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { buildAgentCard, buildAgentCardForAgent } from '../a2a/agent-card';

describe('buildAgentCard', () => {
  let savedPort: string | undefined;
  let savedHost: string | undefined;

  beforeEach(() => {
    savedPort = process.env.PORT;
    savedHost = process.env.BIND_HOST;
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.PORT;
    else process.env.PORT = savedPort;
    if (savedHost === undefined) delete process.env.BIND_HOST;
    else process.env.BIND_HOST = savedHost;
  });

  it('returns a valid card with all required fields', () => {
    const card = buildAgentCard('https://example.com');
    expect(card.name).toBe('CorvidAgent');
    expect(card.description).toBeString();
    expect(card.url).toBe('https://example.com');
    expect(card.provider).toBeDefined();
    expect(card.provider!.organization).toBeString();
    expect(card.version).toBeString();
    expect(card.capabilities).toBeDefined();
    expect(card.skills).toBeArray();
    expect(card.skills.length).toBeGreaterThan(0);
  });

  it('uses provided baseUrl when given', () => {
    const card = buildAgentCard('https://my-agent.io');
    expect(card.url).toBe('https://my-agent.io');
  });

  it('falls back to env PORT and BIND_HOST when no baseUrl', () => {
    process.env.PORT = '4567';
    process.env.BIND_HOST = '0.0.0.0';
    const card = buildAgentCard();
    expect(card.url).toBe('http://0.0.0.0:4567');
  });

  it('defaults to 127.0.0.1:3000 when no env vars and no baseUrl', () => {
    delete process.env.PORT;
    delete process.env.BIND_HOST;
    const card = buildAgentCard();
    expect(card.url).toBe('http://127.0.0.1:3000');
  });

  it('has non-empty skills with required properties', () => {
    const card = buildAgentCard('https://example.com');
    expect(card.skills.length).toBeGreaterThan(0);
    for (const skill of card.skills) {
      expect(skill.id).toBeString();
      expect(skill.name).toBeString();
      expect(skill.description).toBeString();
      expect(skill.tags).toBeArray();
      expect(skill.inputModes).toContain('application/json');
      expect(skill.outputModes).toContain('application/json');
    }
  });

  it('supportedProtocols includes A2A, AlgoChat, MCP, and HTTP', () => {
    const card = buildAgentCard('https://example.com');
    const protocols = card.supportedProtocols!.map((p) => p.protocol);
    expect(protocols).toContain('A2A');
    expect(protocols).toContain('AlgoChat');
    expect(protocols).toContain('MCP');
    expect(protocols).toContain('HTTP');
  });

  it('A2A protocol endpoint uses the baseUrl', () => {
    const card = buildAgentCard('https://example.com');
    const a2a = card.supportedProtocols!.find((p) => p.protocol === 'A2A');
    expect(a2a!.endpoint).toBe('https://example.com/a2a/tasks/send');
  });

  it('includes authentication schemes', () => {
    const card = buildAgentCard('https://example.com');
    expect(card.authentication!.schemes).toContain('Bearer');
  });
});

describe('buildAgentCardForAgent', () => {
  const mockAgent = {
    id: 'agent-1',
    name: 'TestBot',
    description: 'A test bot',
    walletAddress: 'ALGO123',
    mcpToolPermissions: null as string[] | null,
  };

  it('returns card with agent name and description', () => {
    const card = buildAgentCardForAgent(mockAgent as any, 'https://example.com');
    expect(card.name).toBe('TestBot');
    expect(card.description).toContain('A test bot');
  });

  it('includes agent id in the url path', () => {
    const card = buildAgentCardForAgent(mockAgent as any, 'https://example.com');
    expect(card.url).toBe('https://example.com/api/agents/agent-1');
  });

  it('includes walletAddress in AlgoChat protocol endpoint', () => {
    const card = buildAgentCardForAgent(mockAgent as any, 'https://example.com');
    const algochat = card.supportedProtocols!.find((p) => p.protocol === 'AlgoChat');
    expect(algochat).toBeDefined();
    expect(algochat!.endpoint).toBe('algo://ALGO123');
  });

  it('omits AlgoChat endpoint when walletAddress is absent', () => {
    const agentNoWallet = { ...mockAgent, walletAddress: undefined };
    const card = buildAgentCardForAgent(agentNoWallet as any, 'https://example.com');
    const algochat = card.supportedProtocols!.find((p) => p.protocol === 'AlgoChat');
    expect(algochat).toBeDefined();
    expect(algochat!.endpoint).toBeUndefined();
  });

  it('uses agent mcpToolPermissions when set', () => {
    const agentWithPerms = {
      ...mockAgent,
      mcpToolPermissions: ['corvid_send_message', 'corvid_save_memory'],
    };
    const card = buildAgentCardForAgent(agentWithPerms as any, 'https://example.com');
    expect(card.skills.length).toBe(2);
    expect(card.skills[0].id).toBe('corvid_send_message');
    expect(card.skills[1].id).toBe('corvid_save_memory');
  });

  it('falls back to DEFAULT_TOOL_NAMES when mcpToolPermissions is null', () => {
    const card = buildAgentCardForAgent(mockAgent as any, 'https://example.com');
    // Should have many skills from the default set
    expect(card.skills.length).toBeGreaterThan(10);
  });

  it('includes HTTP protocol with invoke endpoint', () => {
    const card = buildAgentCardForAgent(mockAgent as any, 'https://example.com');
    const http = card.supportedProtocols!.find((p) => p.protocol === 'HTTP');
    expect(http).toBeDefined();
    expect(http!.endpoint).toBe('https://example.com/api/agents/agent-1/invoke');
  });

  it('uses fallback description when agent description is empty', () => {
    const agentNoDesc = { ...mockAgent, description: '' };
    const card = buildAgentCardForAgent(agentNoDesc as any, 'https://example.com');
    expect(card.description).toBe('CorvidAgent instance');
  });
});

describe('humanReadableName (via skill names)', () => {
  it('converts tool names to human-readable skill names', () => {
    const card = buildAgentCard('https://example.com');
    const starSkill = card.skills.find((s) => s.id === 'corvid_github_star_repo');
    expect(starSkill).toBeDefined();
    expect(starSkill!.name).toBe('GitHub Star Repo');
  });

  it('handles PR acronym correctly', () => {
    const card = buildAgentCard('https://example.com');
    const prSkill = card.skills.find((s) => s.id === 'corvid_github_list_prs');
    expect(prSkill).toBeDefined();
    expect(prSkill!.name).toBe('GitHub List PRs');
  });

  it('capitalizes normal words', () => {
    const card = buildAgentCard('https://example.com');
    const memSkill = card.skills.find((s) => s.id === 'corvid_save_memory');
    expect(memSkill).toBeDefined();
    expect(memSkill!.name).toBe('Save Memory');
  });
});
