import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  detectModelFamily,
  getCodebaseContextPrompt,
  getCodingToolPrompt,
  getCompactCodingToolPrompt,
  getCompactResponseRoutingPrompt,
  getCompactToolInstructionPrompt,
  getProjectContextPrompt,
  getToolInstructionPrompt,
} from '../providers/ollama/tool-prompt-templates';

let savedGithubOwner: string | undefined;

beforeAll(() => {
  savedGithubOwner = process.env.GITHUB_OWNER;
  process.env.GITHUB_OWNER = 'CorvidLabs';
});

afterAll(() => {
  if (savedGithubOwner !== undefined) {
    process.env.GITHUB_OWNER = savedGithubOwner;
  } else {
    delete process.env.GITHUB_OWNER;
  }
});

describe('getCodebaseContextPrompt', () => {
  test('returns codebase context with project structure', () => {
    const result = getCodebaseContextPrompt();
    expect(result).toContain('## Codebase Context');
    expect(result).toContain('server/');
    expect(result).toContain('client/');
    expect(result).toContain('Bun');
    expect(result).toContain('fledge run typecheck');
  });
});

describe('getCodingToolPrompt', () => {
  test('returns coding guidelines with tool references', () => {
    const result = getCodingToolPrompt();
    expect(result).toContain('## Coding Tool Guidelines');
    expect(result).toContain('read_file');
    expect(result).toContain('list_files');
    expect(result).toContain('edit_file');
  });
});

describe('getToolInstructionPrompt', () => {
  test('includes worked example with list_files and read_file', () => {
    const result = getToolInstructionPrompt('llama', ['list_files', 'read_file']);
    expect(result).toContain('Worked Example');
    expect(result).toContain('list_files');
    expect(result).toContain('read_file');
    expect(result).toContain('server/index.ts');
  });

  test('includes run_command worked example when only run_command available', () => {
    const result = getToolInstructionPrompt('llama', ['run_command']);
    expect(result).toContain('Worked Example');
    expect(result).toContain('run_command');
    expect(result).toContain('fledge run typecheck');
  });

  test('includes fallback worked example when no coding tools', () => {
    const result = getToolInstructionPrompt('llama', ['corvid_send_message']);
    expect(result).toContain('Worked Example');
    expect(result).toContain('What tools do I have');
  });

  test('includes family-specific guidance for each model family', () => {
    const toolNames = ['list_files', 'read_file'];

    const qwen3 = getToolInstructionPrompt('qwen3', toolNames);
    expect(qwen3).toContain('Qwen3');
    expect(qwen3).toContain('JSON array');

    const deepseek = getToolInstructionPrompt('deepseek', toolNames);
    expect(deepseek).toContain('DeepSeek');

    const phi = getToolInstructionPrompt('phi', toolNames);
    expect(phi).toContain('Phi');

    const gemma = getToolInstructionPrompt('gemma', toolNames);
    expect(gemma).toContain('Gemma');

    const minimax = getToolInstructionPrompt('minimax', toolNames);
    expect(minimax).toContain('MiniMax');

    const mistral = getToolInstructionPrompt('mistral', toolNames);
    expect(mistral).toContain('Mistral');

    const commandr = getToolInstructionPrompt('command-r', toolNames);
    expect(commandr).toContain('Command-R');

    const hermes = getToolInstructionPrompt('hermes', toolNames);
    expect(hermes).toContain('Hermes');

    const nemotron = getToolInstructionPrompt('nemotron', toolNames);
    expect(nemotron).toContain('Nemotron');

    const llama = getToolInstructionPrompt('llama', toolNames);
    expect(llama).toContain('Llama');
  });

  test('includes multi-step example for text-based families with list_files+read_file', () => {
    const toolNames = ['list_files', 'read_file'];

    const qwen3 = getToolInstructionPrompt('qwen3', toolNames);
    expect(qwen3).toContain('multi-step interaction');

    const deepseek = getToolInstructionPrompt('deepseek', toolNames);
    expect(deepseek).toContain('multi-step interaction');

    const nemotron = getToolInstructionPrompt('nemotron', toolNames);
    expect(nemotron).toContain('multi-step interaction');
  });

  test('includes tool schemas for text-based families when toolDefs provided', () => {
    const toolDefs = [
      {
        name: 'list_files',
        description: 'List files in dir',
        parameters: {
          type: 'object' as const,
          properties: { path: { type: 'string', description: 'Directory path' } },
          required: ['path'],
        },
      },
    ];
    const result = getToolInstructionPrompt('qwen3', ['list_files'], toolDefs);
    expect(result).toContain('Tool Schemas');
    expect(result).toContain('list_files');
  });
});

describe('getCompactToolInstructionPrompt', () => {
  test('includes tool list and rules', () => {
    const result = getCompactToolInstructionPrompt('llama', ['list_files', 'read_file']);
    expect(result).toContain('## Tool Usage');
    expect(result).toContain('list_files, read_file');
    expect(result).toContain('Rules:');
    expect(result).toContain('NEVER write scripts to send messages');
  });

  test('includes JSON format guidance for text-based families', () => {
    const result = getCompactToolInstructionPrompt('qwen3', ['list_files']);
    expect(result).toContain('JSON array');
    expect(result).toContain('list_files');
    expect(result).toContain('No code blocks');
  });

  test('includes tool schemas for text-based families when toolDefs provided', () => {
    const toolDefs = [
      {
        name: 'list_files',
        description: 'List files',
        parameters: {
          type: 'object' as const,
          properties: { path: { type: 'string', description: 'Dir' } },
          required: ['path'],
        },
      },
    ];
    const result = getCompactToolInstructionPrompt('nemotron', ['list_files'], toolDefs);
    expect(result).toContain('list_files');
  });

  test('does not include JSON format guidance for non-text-based families', () => {
    const result = getCompactToolInstructionPrompt('llama', ['list_files']);
    expect(result).not.toContain('JSON array');
  });

  test('handles empty tool names', () => {
    const result = getCompactToolInstructionPrompt('llama', []);
    expect(result).toContain('## Tool Usage');
    expect(result).not.toContain('Available tools:');
  });

  test('is shorter than full getToolInstructionPrompt', () => {
    const tools = ['list_files', 'read_file', 'corvid_send_message'];
    const compact = getCompactToolInstructionPrompt('llama', tools);
    const full = getToolInstructionPrompt('llama', tools);
    expect(compact.length).toBeLessThan(full.length);
  });
});

describe('getCompactResponseRoutingPrompt', () => {
  test('includes routing header', () => {
    const result = getCompactResponseRoutingPrompt();
    expect(result).toContain('## Response Routing');
  });

  test('instructs direct text reply', () => {
    const result = getCompactResponseRoutingPrompt();
    expect(result).toContain('Reply with text directly');
    expect(result).toContain('corvid_send_message');
  });

  test('includes channel affinity rule', () => {
    const result = getCompactResponseRoutingPrompt();
    expect(result).toContain('same channel');
  });

  test('returns identical result on repeated calls (pure function)', () => {
    expect(getCompactResponseRoutingPrompt()).toBe(getCompactResponseRoutingPrompt());
  });
});

describe('getCompactCodingToolPrompt', () => {
  test('includes coding tools header', () => {
    const result = getCompactCodingToolPrompt();
    expect(result).toContain('## Coding Tools');
  });

  test('includes key instructions', () => {
    const result = getCompactCodingToolPrompt();
    expect(result).toContain('edit_file');
    expect(result).toContain('write_file');
    expect(result).toContain('Read files before editing');
  });

  test('is shorter than full getCodingToolPrompt', () => {
    const compact = getCompactCodingToolPrompt();
    const full = getCodingToolPrompt();
    expect(compact.length).toBeLessThan(full.length);
  });

  test('returns identical result on repeated calls (pure function)', () => {
    expect(getCompactCodingToolPrompt()).toBe(getCompactCodingToolPrompt());
  });
});

describe('detectModelFamily', () => {
  test('detects qwen3 before qwen2', () => {
    expect(detectModelFamily('qwen3:32b')).toBe('qwen3');
    expect(detectModelFamily('qwen-3-coder:latest')).toBe('qwen3');
  });

  test('detects qwen2', () => {
    expect(detectModelFamily('qwen2.5:72b')).toBe('qwen2');
  });

  test('detects devstral', () => {
    expect(detectModelFamily('devstral:latest')).toBe('devstral');
  });

  test('detects gemini', () => {
    expect(detectModelFamily('gemini-2.5-pro')).toBe('gemini');
  });

  test('returns unknown for unrecognized model', () => {
    expect(detectModelFamily('some-random-model')).toBe('unknown');
  });
});

describe('getProjectContextPrompt', () => {
  const baseProject = {
    id: 'proj-1',
    name: 'rs-algochat',
    description: 'Rust AlgoChat',
    workingDir: '/home/user/rs-algochat',
    claudeMd: '',
    envVars: {},
    gitUrl: null,
    dirStrategy: 'persistent' as const,
    baseClonePath: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  test('includes project name and working directory', () => {
    const result = getProjectContextPrompt(baseProject);
    expect(result).toContain('## Active Project Context');
    expect(result).toContain('rs-algochat');
    expect(result).toContain('/home/user/rs-algochat');
  });

  test('includes GitHub repo slug when gitUrl is a GitHub HTTPS URL', () => {
    const project = { ...baseProject, gitUrl: 'https://github.com/CorvidLabs/rs-algochat.git' };
    const result = getProjectContextPrompt(project);
    expect(result).toContain('CorvidLabs/rs-algochat');
    expect(result).toContain('GitHub repo:');
  });

  test('includes GitHub repo slug when gitUrl is a GitHub SSH URL', () => {
    const project = { ...baseProject, gitUrl: 'git@github.com:CorvidLabs/rs-algochat.git' };
    const result = getProjectContextPrompt(project);
    expect(result).toContain('CorvidLabs/rs-algochat');
  });

  test('includes git remote but no GitHub slug for non-GitHub URLs', () => {
    const project = { ...baseProject, gitUrl: 'https://gitlab.com/example/repo.git' };
    const result = getProjectContextPrompt(project);
    expect(result).toContain('https://gitlab.com/example/repo.git');
    expect(result).not.toContain('GitHub repo:');
  });

  test('omits git remote section when gitUrl is null', () => {
    const result = getProjectContextPrompt(baseProject);
    expect(result).not.toContain('Git remote:');
    expect(result).not.toContain('GitHub repo:');
  });

  test('includes warning against defaulting to wrong repo', () => {
    const result = getProjectContextPrompt(baseProject);
    expect(result).toContain('not corvid-agent or any other repository');
  });
});
