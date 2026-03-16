import { describe, test, expect } from 'bun:test';
import { parseModelSizeB, isCloudModel, stripThinkBlocks, isApiError, buildConversationPrompt, extractSdkToolCalls, detectProvider } from '../exam/runner';

describe('parseModelSizeB', () => {
    test('parses colon-prefixed sizes like ":8b"', () => {
        expect(parseModelSizeB('qwen3:8b')).toBe(8);
    });

    test('parses large models like ":671b"', () => {
        expect(parseModelSizeB('deepseek-r1:671b')).toBe(671);
    });

    test('parses decimal sizes like ":14.8B"', () => {
        expect(parseModelSizeB('model:14.8B')).toBe(14.8);
    });

    test('parses space-separated sizes', () => {
        expect(parseModelSizeB('model 4.0B params')).toBe(4.0);
    });

    test('parses hyphen-separated sizes', () => {
        expect(parseModelSizeB('llama-3-8b-instruct')).toBe(8);
    });

    test('returns null for models without size info', () => {
        expect(parseModelSizeB('claude-3-opus')).toBeNull();
    });

    test('returns null for empty string', () => {
        expect(parseModelSizeB('')).toBeNull();
    });

    test('returns null when B is followed by letters (not a size)', () => {
        expect(parseModelSizeB('roberta-base')).toBeNull();
    });
});

describe('isCloudModel', () => {
    test('returns true for cloud models', () => {
        expect(isCloudModel('qwen3-cloud')).toBe(true);
        expect(isCloudModel('deepseek-r1-cloud')).toBe(true);
    });

    test('returns false for non-cloud models', () => {
        expect(isCloudModel('qwen3:8b')).toBe(false);
        expect(isCloudModel('claude-3-opus')).toBe(false);
        expect(isCloudModel('llama3.1:70b')).toBe(false);
    });
});

describe('stripThinkBlocks', () => {
    test('removes think blocks', () => {
        expect(stripThinkBlocks('<think>reasoning here</think>Hello')).toBe('Hello');
    });

    test('removes multiple think blocks', () => {
        expect(stripThinkBlocks('<think>first</think>A<think>second</think>B')).toBe('AB');
    });

    test('removes multiline think blocks', () => {
        expect(stripThinkBlocks('<think>\nline1\nline2\n</think>Result')).toBe('Result');
    });

    test('returns text unchanged when no think blocks', () => {
        expect(stripThinkBlocks('Hello world')).toBe('Hello world');
    });

    test('trims whitespace', () => {
        expect(stripThinkBlocks('  <think>x</think>  Hello  ')).toBe('Hello');
    });

    test('returns empty string when only think blocks', () => {
        expect(stripThinkBlocks('<think>only thinking</think>')).toBe('');
    });
});

describe('isApiError', () => {
    test('detects API error messages', () => {
        expect(isApiError('API Error: 429 Rate limit exceeded')).toBe('API 429: Rate limit exceeded');
    });

    test('detects 500 errors', () => {
        expect(isApiError('API Error: 500 Internal Server Error')).toBe('API 500: Internal Server Error');
    });

    test('truncates long error messages to 100 chars', () => {
        const longMsg = 'A'.repeat(200);
        const result = isApiError(`API Error: 500 ${longMsg}`);
        expect(result).toBeDefined();
        expect(result!.length).toBeLessThanOrEqual(110); // "API 500: " + 100 chars
    });

    test('returns undefined for non-error text', () => {
        expect(isApiError('Hello world')).toBeUndefined();
    });

    test('returns undefined for empty string', () => {
        expect(isApiError('')).toBeUndefined();
    });

    test('returns undefined for partial match', () => {
        expect(isApiError('Some API Error nearby')).toBeUndefined();
    });
});

describe('buildConversationPrompt', () => {
    test('returns message as-is when no history', () => {
        expect(buildConversationPrompt('Hello', [])).toBe('Hello');
    });

    test('prepends conversation history for follow-up turns', () => {
        const history = [
            { role: 'user' as const, content: 'My name is Zephyr.' },
            { role: 'assistant' as const, content: 'Hello Zephyr!' },
        ];
        const result = buildConversationPrompt('What is my name?', history);
        expect(result).toContain('[Previous conversation]');
        expect(result).toContain('User: My name is Zephyr.');
        expect(result).toContain('Assistant: Hello Zephyr!');
        expect(result).toContain('[Current message — respond to this]');
        expect(result).toContain('What is my name?');
    });

    test('handles multiple history entries', () => {
        const history = [
            { role: 'user' as const, content: 'First' },
            { role: 'assistant' as const, content: 'Reply 1' },
            { role: 'user' as const, content: 'Second' },
            { role: 'assistant' as const, content: 'Reply 2' },
        ];
        const result = buildConversationPrompt('Third', history);
        expect(result).toContain('User: First');
        expect(result).toContain('Assistant: Reply 1');
        expect(result).toContain('User: Second');
        expect(result).toContain('Assistant: Reply 2');
        expect(result).toContain('Third');
    });
});

describe('extractSdkToolCalls', () => {
    test('extracts tool_use blocks from content array', () => {
        const content = [
            { type: 'text', text: 'Hello' },
            { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/foo.ts' } },
            { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
        ];
        const result = extractSdkToolCalls(content);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ name: 'Read', arguments: { file_path: '/tmp/foo.ts' } });
        expect(result[1]).toEqual({ name: 'Bash', arguments: { command: 'ls' } });
    });

    test('returns empty array when no tool_use blocks', () => {
        const content = [
            { type: 'text', text: 'Just text' },
        ];
        expect(extractSdkToolCalls(content)).toEqual([]);
    });

    test('returns empty array for empty content', () => {
        expect(extractSdkToolCalls([])).toEqual([]);
    });

    test('handles tool_use blocks without input', () => {
        const content = [
            { type: 'tool_use', name: 'corvid_list_agents' },
        ];
        const result = extractSdkToolCalls(content);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ name: 'corvid_list_agents', arguments: {} });
    });

    test('skips blocks with type tool_use but no name', () => {
        const content = [
            { type: 'tool_use' },
            { type: 'tool_use', name: 'Glob', input: { pattern: '*' } },
        ];
        const result = extractSdkToolCalls(content);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Glob');
    });

    test('skips non-tool_use blocks', () => {
        const content = [
            { type: 'text', text: 'hello' },
            { type: 'tool_result', tool_use_id: '123', content: 'result' },
            { type: 'tool_use', name: 'Edit', input: { file_path: 'x', old_string: 'a', new_string: 'b' } },
        ];
        const result = extractSdkToolCalls(content);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Edit');
    });
});

describe('detectProvider', () => {
    test('returns anthropic for claude models', () => {
        expect(detectProvider('claude-3-opus')).toBe('anthropic');
        expect(detectProvider('claude-sonnet-4-6')).toBe('anthropic');
        expect(detectProvider('claude-haiku-4-5-20251001')).toBe('anthropic');
    });

    test('returns ollama for cloud models', () => {
        expect(detectProvider('qwen3-cloud')).toBe('ollama');
        expect(detectProvider('deepseek-r1-cloud')).toBe('ollama');
    });

    test('returns ollama for colon-tagged models', () => {
        expect(detectProvider('qwen3:8b')).toBe('ollama');
        expect(detectProvider('llama3.1:70b')).toBe('ollama');
    });

    test('returns ollama for known open-source families', () => {
        expect(detectProvider('qwen3')).toBe('ollama');
        expect(detectProvider('llama3')).toBe('ollama');
        expect(detectProvider('mistral-7b')).toBe('ollama');
        expect(detectProvider('gemma2')).toBe('ollama');
        expect(detectProvider('phi-3')).toBe('ollama');
        expect(detectProvider('deepseek-v2')).toBe('ollama');
    });

    test('defaults to ollama for unknown models', () => {
        expect(detectProvider('some-random-model')).toBe('ollama');
    });
});
