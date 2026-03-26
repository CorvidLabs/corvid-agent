import { describe, test, expect } from 'bun:test';
import { getCodebaseContextPrompt, getCodingToolPrompt, getToolInstructionPrompt } from '../providers/ollama/tool-prompt-templates';

describe('getCodebaseContextPrompt', () => {
    test('returns a non-empty string', () => {
        const result = getCodebaseContextPrompt();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    test('includes codebase context header', () => {
        const result = getCodebaseContextPrompt();
        expect(result).toContain('## Codebase Context');
    });

    test('includes project structure section', () => {
        const result = getCodebaseContextPrompt();
        expect(result).toContain('### Project Structure');
        expect(result).toContain('server/');
        expect(result).toContain('dashboard/');
    });

    test('includes key technologies', () => {
        const result = getCodebaseContextPrompt();
        expect(result).toContain('Bun');
        expect(result).toContain('TypeScript');
        expect(result).toContain('SQLite');
    });

    test('includes common tasks', () => {
        const result = getCodebaseContextPrompt();
        expect(result).toContain('bun x tsc');
        expect(result).toContain('bun test');
        expect(result).toContain('bun run spec:check');
    });

    test('specifies correct GitHub owner', () => {
        const result = getCodebaseContextPrompt();
        expect(result).toContain('CorvidLabs');
    });
});

describe('getCodingToolPrompt updated guidance', () => {
    test('mentions read_file explicitly', () => {
        const result = getCodingToolPrompt();
        expect(result).toContain('read_file');
    });

    test('includes orientation guidance', () => {
        const result = getCodingToolPrompt();
        expect(result).toContain('list_files to orient');
    });
});

describe('getToolInstructionPrompt worked examples', () => {
    test('includes worked example section with list_files and read_file', () => {
        const result = getToolInstructionPrompt('llama', ['list_files', 'read_file', 'run_command']);
        expect(result).toContain('Worked Example');
        expect(result).toContain('list_files');
        expect(result).toContain('read_file');
    });

    test('includes run_command worked example when no list_files/read_file', () => {
        const result = getToolInstructionPrompt('llama', ['run_command']);
        expect(result).toContain('Worked Example');
        expect(result).toContain('run_command');
        expect(result).toContain('bun x tsc');
    });

    test('includes fallback worked example with no tools', () => {
        const result = getToolInstructionPrompt('llama', []);
        expect(result).toContain('Worked Example');
        expect(result).toContain('What tools do I have');
    });

    test('qwen3 includes multi-step example with list_files and read_file', () => {
        const result = getToolInstructionPrompt('qwen3', ['list_files', 'read_file']);
        expect(result).toContain('multi-step interaction');
        expect(result).toContain('list_files');
    });

    test('nemotron includes multi-step example with list_files and read_file', () => {
        const result = getToolInstructionPrompt('nemotron', ['list_files', 'read_file']);
        expect(result).toContain('multi-step interaction');
    });

    test('family-specific prompts include common mistake warnings', () => {
        const llama = getToolInstructionPrompt('llama', ['list_files']);
        expect(llama).toContain('Common mistake');

        const qwen2 = getToolInstructionPrompt('qwen2', ['list_files']);
        expect(qwen2).toContain('Common mistake');

        const hermes = getToolInstructionPrompt('hermes', ['list_files']);
        expect(hermes).toContain('Common mistake');
    });
});
