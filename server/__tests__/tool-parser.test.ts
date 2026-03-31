import { describe, it, expect } from 'bun:test';
import {
    extractToolCallsFromContent,
    parsePythonArgs,
    fuzzyMatchToolName,
    normalizeToolArgs,
    stripJsonToolCallArrays,
} from '../providers/ollama/tool-parser';
import type { LlmToolDefinition, JsonSchemaProperty } from '../providers/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTools(...names: string[]): LlmToolDefinition[] {
    return names.map((name) => ({
        name,
        description: `Tool: ${name}`,
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path' },
                content: { type: 'string', description: 'File content' },
            },
            required: ['path'],
        },
    }));
}

function makeToolWithParams(name: string, props: Record<string, JsonSchemaProperty>, required: string[] = []): LlmToolDefinition {
    return {
        name,
        description: `Tool: ${name}`,
        parameters: {
            type: 'object',
            properties: props,
            required,
        },
    };
}

// ── extractToolCallsFromContent ────────────────────────────────────────────

describe('extractToolCallsFromContent', () => {
    it('returns empty array when no tools provided', () => {
        expect(extractToolCallsFromContent('hello', [])).toEqual([]);
        expect(extractToolCallsFromContent('hello', undefined)).toEqual([]);
    });

    describe('Pattern 1: python_tag format', () => {
        it('extracts tool call with python keyword args', () => {
            const content = '<|python_tag|>read_file(path="/src/index.ts")';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('read_file');
            expect(calls[0].arguments).toEqual({ path: '/src/index.ts' });
        });

        it('extracts multiple tool calls from python_tag', () => {
            const content = '<|python_tag|>read_file(path="a.ts")\nread_file(path="b.ts")';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(2);
        });

        it('ignores unknown tool names in python_tag', () => {
            const content = '<|python_tag|>unknown_tool(arg="val")';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(0);
        });
    });

    describe('Pattern 2: JSON-style function({})', () => {
        it('extracts tool call with JSON args', () => {
            const content = 'Let me check. read_file({"path": "/src/index.ts"})';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('read_file');
            expect(calls[0].arguments).toEqual({ path: '/src/index.ts' });
        });

        it('extracts empty args', () => {
            const content = 'corvid_list_agents({})';
            const tools = makeTools('corvid_list_agents');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].arguments).toEqual({});
        });
    });

    describe('Pattern 3: JSON array', () => {
        it('extracts from plain JSON array', () => {
            const content = '[{"name": "read_file", "arguments": {"path": "/src/index.ts"}}]';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('read_file');
        });

        it('extracts from code-fenced JSON', () => {
            const content = '```json\n[{"name": "read_file", "arguments": {"path": "test.ts"}}]\n```';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
        });

        it('extracts from JSON with preamble text', () => {
            const content = 'I will read the file now.\n[{"name": "read_file", "arguments": {"path": "test.ts"}}]';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
        });

        it('handles single object (not array)', () => {
            const content = '{"name": "read_file", "arguments": {"path": "test.ts"}}';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
        });

        it('resolves corvid_ prefix removal', () => {
            const content = '[{"name": "corvid_list_files", "arguments": {}}]';
            const tools = makeTools('list_files');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('list_files');
        });

        it('resolves corvid_ prefix addition', () => {
            const content = '[{"name": "send_message", "arguments": {"text": "hi"}}]';
            const tools = makeTools('corvid_send_message');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('corvid_send_message');
        });

        it('rescues command-as-name to run_command', () => {
            const content = '[{"name": "git status", "arguments": {}}]';
            const tools = makeTools('run_command', 'read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('run_command');
            expect(calls[0].arguments).toEqual({ command: 'git status' });
        });

        it('accepts "parameters" as alias for "arguments"', () => {
            const content = '[{"name": "read_file", "parameters": {"path": "test.ts"}}]';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].arguments).toEqual({ path: 'test.ts' });
        });
    });

    describe('Pattern 4: Python-style kwargs without python_tag', () => {
        it('extracts python-style kwargs', () => {
            const content = 'corvid_save_memory(key="test", content="hello world")';
            const tools = makeTools('corvid_save_memory');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('corvid_save_memory');
            expect(calls[0].arguments).toEqual({ key: 'test', content: 'hello world' });
        });

        it('skips JSON args (handled by Pattern 2)', () => {
            const content = 'read_file({"path": "test.ts"})';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            // Should be caught by Pattern 2, not Pattern 4
            expect(calls.length).toBe(1);
        });
    });

    describe('Pattern 4b: Split name + JSON on separate lines', () => {
        it('extracts tool call with name on one line and JSON on next', () => {
            const content = 'I\'ll recall the memory.\n\ncorvid_recall_memory\n{\n  "key": "project-corvid-agent"\n}';
            const tools = makeTools('corvid_recall_memory');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('corvid_recall_memory');
            expect(calls[0].arguments).toEqual({ key: 'project-corvid-agent' });
        });

        it('extracts tool call with name and JSON on adjacent lines', () => {
            const content = 'corvid_save_memory\n{"key": "test", "content": "hello"}';
            const tools = makeTools('corvid_save_memory');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('corvid_save_memory');
            expect(calls[0].arguments).toEqual({ key: 'test', content: 'hello' });
        });

        it('does not match name followed by non-JSON', () => {
            const content = 'corvid_recall_memory\nsome random text';
            const tools = makeTools('corvid_recall_memory');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(0);
        });
    });

    describe('Pattern 6: XML <tool_call> tags', () => {
        it('extracts tool call from <tool_call> tags', () => {
            const content = '<tool_call>{"name": "read_file", "arguments": {"path": "/src/index.ts"}}</tool_call>';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('read_file');
            expect(calls[0].arguments).toEqual({ path: '/src/index.ts' });
        });

        it('extracts from <tool_call> with surrounding text', () => {
            const content = 'Let me check that file.\n<tool_call>{"name": "read_file", "arguments": {"path": "test.ts"}}</tool_call>\nDone.';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('read_file');
        });

        it('extracts multiple <tool_call> tags', () => {
            const content = '<tool_call>{"name": "read_file", "arguments": {"path": "a.ts"}}</tool_call>\n<tool_call>{"name": "read_file", "arguments": {"path": "b.ts"}}</tool_call>';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(2);
        });

        it('resolves corvid_ prefix in <tool_call> tags', () => {
            const content = '<tool_call>{"name": "corvid_list_files", "arguments": {}}</tool_call>';
            const tools = makeTools('list_files');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('list_files');
        });

        it('accepts "parameters" as alias in <tool_call> tags', () => {
            const content = '<tool_call>{"name": "read_file", "parameters": {"path": "test.ts"}}</tool_call>';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].arguments).toEqual({ path: 'test.ts' });
        });

        it('skips invalid JSON inside <tool_call> tags', () => {
            const content = '<tool_call>{not valid json}</tool_call>';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(0);
        });

        it('skips <tool_call> with unknown tool name and no fuzzy match', () => {
            const content = '<tool_call>{"name": "teleport_to_moon", "arguments": {}}</tool_call>';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(0);
        });

        it('adds corvid_ prefix when needed in <tool_call> tags', () => {
            const content = '<tool_call>{"name": "save_memory", "arguments": {"key": "test"}}</tool_call>';
            const tools = makeTools('corvid_save_memory');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('corvid_save_memory');
        });

        it('handles array of calls inside single <tool_call> tag', () => {
            const content = '<tool_call>[{"name": "read_file", "arguments": {"path": "a.ts"}}, {"name": "read_file", "arguments": {"path": "b.ts"}}]</tool_call>';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(2);
        });

        it('handles <tool_call> with whitespace/newlines inside', () => {
            const content = '<tool_call>\n  {"name": "read_file", "arguments": {"path": "test.ts"}}\n</tool_call>';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].arguments).toEqual({ path: 'test.ts' });
        });

        it('fuzzy-matches hallucinated tool name inside <tool_call> tags', () => {
            const content = '<tool_call>{"name": "bash", "arguments": {"command": "ls -la"}}</tool_call>';
            const tools = makeTools('run_command');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('run_command');
        });
    });

    describe('Pattern 7: ReAct Action/Action Input format', () => {
        it('extracts from basic ReAct format', () => {
            const content = 'Action: read_file\nAction Input: {"path": "/src/index.ts"}';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('read_file');
            expect(calls[0].arguments).toEqual({ path: '/src/index.ts' });
        });

        it('extracts from ReAct with Thought prefix', () => {
            const content = 'Thought: I need to read the file.\nAction: read_file\nAction Input: {"path": "test.ts"}';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('read_file');
        });

        it('resolves corvid_ prefix in ReAct format', () => {
            const content = 'Action: corvid_save_memory\nAction Input: {"key": "test", "content": "hello"}';
            const tools = makeTools('save_memory');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('save_memory');
        });

        it('handles non-JSON Action Input as string arg', () => {
            const content = 'Action: run_command\nAction Input: git status';
            const tools = makeTools('run_command');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('run_command');
            expect(calls[0].arguments).toEqual({ input: 'git status' });
        });

        it('adds corvid_ prefix in ReAct format', () => {
            const content = 'Action: recall_memory\nAction Input: {"key": "my-role"}';
            const tools = makeTools('corvid_recall_memory');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('corvid_recall_memory');
        });

        it('ignores unknown tool in ReAct format', () => {
            const content = 'Action: teleport\nAction Input: {"dest": "moon"}';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(0);
        });

        it('handles ReAct with empty Action Input', () => {
            const content = 'Action: list_files\nAction Input: {}';
            const tools = makeTools('list_files');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].arguments).toEqual({});
        });

        it('handles multiple ReAct Action/Action Input pairs', () => {
            const content = 'Thought: I need to read two files.\nAction: read_file\nAction Input: {"path": "a.ts"}\nObservation: done\nAction: read_file\nAction Input: {"path": "b.ts"}';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(2);
            expect(calls[0].arguments).toEqual({ path: 'a.ts' });
            expect(calls[1].arguments).toEqual({ path: 'b.ts' });
        });

        it('fuzzy-matches hallucinated tool name in ReAct format', () => {
            const content = 'Action: bash\nAction Input: {"command": "pwd"}';
            const tools = makeTools('run_command');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('run_command');
        });
    });

    describe('Pattern priority and interaction', () => {
        it('XML tags take priority over JSON array pattern', () => {
            // Content has both <tool_call> and a JSON array — XML should win (Pattern 2b before Pattern 3)
            const content = '<tool_call>{"name": "read_file", "arguments": {"path": "from-xml.ts"}}</tool_call>\n[{"name": "read_file", "arguments": {"path": "from-json.ts"}}]';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].arguments).toEqual({ path: 'from-xml.ts' });
        });

        it('JSON-style func({}) takes priority over XML tags', () => {
            // Pattern 2 runs before Pattern 2b
            const content = 'read_file({"path": "from-func.ts"})\n<tool_call>{"name": "read_file", "arguments": {"path": "from-xml.ts"}}</tool_call>';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].arguments).toEqual({ path: 'from-func.ts' });
        });

        it('ReAct takes priority over split name+JSON pattern', () => {
            // Pattern 2c (ReAct) runs before Pattern 4b (split name+JSON)
            const content = 'Action: read_file\nAction Input: {"path": "from-react.ts"}';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].arguments).toEqual({ path: 'from-react.ts' });
        });

        it('python_tag takes priority over all other patterns', () => {
            const content = '<|python_tag|>read_file(path="/from-python.ts")\n<tool_call>{"name": "read_file", "arguments": {"path": "from-xml.ts"}}</tool_call>';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].arguments).toEqual({ path: '/from-python.ts' });
        });
    });

    describe('Edge cases', () => {
        it('does not extract from content with no matching patterns', () => {
            const content = 'This is just a regular text response with no tool calls.';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(0);
        });

        it('handles embedded JSON in code fences that is not a tool call', () => {
            const content = '```json\n{"key": "value"}\n```';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(0);
        });

        it('does not false-positive on tool name mentioned in prose', () => {
            const content = 'You can use the read_file tool to read files from the disk.';
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(0);
        });

        it('handles empty content', () => {
            const tools = makeTools('read_file');
            expect(extractToolCallsFromContent('', tools)).toEqual([]);
        });

        it('handles content with only whitespace', () => {
            const tools = makeTools('read_file');
            expect(extractToolCallsFromContent('   \n\n  ', tools)).toEqual([]);
        });

        it('handles malformed XML tags gracefully', () => {
            const content = '<tool_call>{"name": "read_file", "arguments": {"path": "test.ts"}';  // missing closing tag
            const tools = makeTools('read_file');
            const calls = extractToolCallsFromContent(content, tools);
            // Should not crash — may or may not extract depending on fallback patterns
            expect(Array.isArray(calls)).toBe(true);
        });

        it('handles deeply nested JSON in arguments', () => {
            const content = '[{"name": "run_command", "arguments": {"command": "echo {\\"a\\": {\\"b\\": 1}}"}}]';
            const tools = makeTools('run_command');
            const calls = extractToolCallsFromContent(content, tools);
            expect(calls.length).toBe(1);
            expect(calls[0].name).toBe('run_command');
        });

        it('normalizeToolArgs maps content_text to content', () => {
            const tool = makeToolWithParams(
                'corvid_save_memory',
                {
                    key: { type: 'string', description: 'Memory key' },
                    content: { type: 'string', description: 'Memory content' },
                },
                ['key', 'content'],
            );
            const result = normalizeToolArgs({ key: 'test', content_text: 'hello' }, tool);
            expect(result.content).toBe('hello');
        });
    });
});

// ── parsePythonArgs ────────────────────────────────────────────────────────

describe('parsePythonArgs', () => {
    it('returns empty object for empty string', () => {
        expect(parsePythonArgs('')).toEqual({});
        expect(parsePythonArgs('   ')).toEqual({});
    });

    it('parses string values', () => {
        expect(parsePythonArgs('key="value"')).toEqual({ key: 'value' });
    });

    it('parses multiple key=value pairs', () => {
        expect(parsePythonArgs('path="/src/index.ts", content="hello"')).toEqual({
            path: '/src/index.ts',
            content: 'hello',
        });
    });

    it('parses number values', () => {
        expect(parsePythonArgs('count=42')).toEqual({ count: 42 });
        expect(parsePythonArgs('ratio=3.14')).toEqual({ ratio: 3.14 });
    });

    it('parses boolean values', () => {
        expect(parsePythonArgs('flag=true')).toEqual({ flag: true });
        expect(parsePythonArgs('flag=false')).toEqual({ flag: false });
    });

    it('parses None as null', () => {
        expect(parsePythonArgs('value=None')).toEqual({ value: null });
        expect(parsePythonArgs('value=null')).toEqual({ value: null });
    });

    it('falls back to JSON parsing', () => {
        expect(parsePythonArgs('{"key": "value"}')).toEqual({ key: 'value' });
    });

    it('handles escaped quotes in strings', () => {
        const result = parsePythonArgs('msg="he said \\"hello\\""');
        expect(result.msg).toBe('he said "hello"');
    });

    it('handles single-quoted strings', () => {
        const result = parsePythonArgs("key='value'");
        expect(result.key).toBe('value');
    });
});

// ── fuzzyMatchToolName ─────────────────────────────────────────────────────

describe('fuzzyMatchToolName', () => {
    const tools: LlmToolDefinition[] = [
        { name: 'run_command', description: 'Execute a shell command', parameters: {} },
        { name: 'read_file', description: 'Read a file from disk', parameters: {} },
        { name: 'corvid_save_memory', description: 'Save a memory entry', parameters: {} },
        { name: 'list_files', description: 'List files in a directory', parameters: {} },
    ];

    it('rejects very short names (<3 chars)', () => {
        expect(fuzzyMatchToolName('gh', {}, tools)).toBeUndefined();
        expect(fuzzyMatchToolName('ls', {}, tools)).toBeUndefined();
    });

    it('matches by command arg presence', () => {
        expect(fuzzyMatchToolName('bash', { command: 'ls -la' }, tools)).toBe('run_command');
        expect(fuzzyMatchToolName('shell', { command: 'pwd' }, tools)).toBe('run_command');
    });

    it('matches by substring of tool name', () => {
        expect(fuzzyMatchToolName('read_file_content', {}, tools)).toBe('read_file');
    });

    it('matches when tool name is substring of hallucinated name', () => {
        expect(fuzzyMatchToolName('list_files_recursive', {}, tools)).toBe('list_files');
    });

    it('matches by description content', () => {
        // "memory" appears in corvid_save_memory's description
        expect(fuzzyMatchToolName('memory', {}, tools)).toBe('corvid_save_memory');
    });

    it('returns undefined for completely unknown names', () => {
        expect(fuzzyMatchToolName('teleport', {}, tools)).toBeUndefined();
    });

    it('requires minimum length 4 for substring matching', () => {
        // "run" is only 3 chars — should not match
        expect(fuzzyMatchToolName('run', {}, tools)).toBeUndefined();
    });
});

// ── normalizeToolArgs ──────────────────────────────────────────────────────

describe('normalizeToolArgs', () => {
    const readFileTool = makeToolWithParams(
        'read_file',
        {
            path: { type: 'string', description: 'File path' },
            encoding: { type: 'string', description: 'File encoding' },
        },
        ['path'],
    );

    it('passes through correct args unchanged', () => {
        const args = { path: '/test.ts', encoding: 'utf-8' };
        expect(normalizeToolArgs(args, readFileTool)).toEqual(args);
    });

    it('maps file_path to path', () => {
        const result = normalizeToolArgs({ file_path: '/test.ts' }, readFileTool);
        expect(result).toEqual({ path: '/test.ts' });
    });

    it('does not overwrite existing correct keys', () => {
        const result = normalizeToolArgs({ path: '/correct.ts', file_path: '/wrong.ts' }, readFileTool);
        expect(result.path).toBe('/correct.ts');
    });

    it('preserves unknown keys as fallback', () => {
        const result = normalizeToolArgs({ path: '/test.ts', unknown_key: 'value' }, readFileTool);
        expect(result.path).toBe('/test.ts');
        expect(result.unknown_key).toBe('value');
    });

    it('handles tool with no schema properties', () => {
        const tool: LlmToolDefinition = { name: 'no_params', description: 'No params', parameters: {} };
        const args = { whatever: 'value' };
        expect(normalizeToolArgs(args, tool)).toEqual(args);
    });
});

// ── stripJsonToolCallArrays ────────────────────────────────────────────────

describe('stripJsonToolCallArrays', () => {
    it('strips a valid tool call array', () => {
        const content = 'Some text [{"name": "read_file", "arguments": {"path": "test.ts"}}] more text';
        const result = stripJsonToolCallArrays(content);
        expect(result).toBe('Some textmore text');
    });

    it('handles nested braces in arguments', () => {
        const content = '[{"name": "run_command", "arguments": {"command": "echo {hello}"}}]';
        const result = stripJsonToolCallArrays(content);
        expect(result).toBe('');
    });

    it('handles multiple arrays', () => {
        const content = 'a [{"name": "t1", "arguments": {}}] b [{"name": "t2", "arguments": {}}] c';
        const result = stripJsonToolCallArrays(content);
        expect(result).toBe('abc');
    });

    it('skips non-tool-call arrays', () => {
        const content = 'Here is [1, 2, 3] an array';
        const result = stripJsonToolCallArrays(content);
        expect(result).toBe('Here is [1, 2, 3] an array');
    });

    it('skips invalid JSON arrays', () => {
        const content = '[{"name": "bad", "arguments": {oops}]';
        const result = stripJsonToolCallArrays(content);
        expect(result).toBe(content);
    });

    it('returns empty string when content is just a tool call array', () => {
        const content = '[{"name": "read_file", "arguments": {"path": "x"}}]';
        expect(stripJsonToolCallArrays(content)).toBe('');
    });
});
