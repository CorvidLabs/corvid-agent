import { test, expect, describe } from 'bun:test';
import { splitMessage, splitEmbedDescription, collapseCodeBlocks } from '../discord/message-formatter';

describe('splitMessage', () => {
    test('returns single chunk for short messages', () => {
        const result = splitMessage('Hello world', 2000);
        expect(result).toEqual(['Hello world']);
    });

    test('returns empty array for empty string', () => {
        const result = splitMessage('', 2000);
        expect(result).toEqual(['']);
    });

    test('splits at paragraph boundaries', () => {
        const text = 'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.';
        const result = splitMessage(text, 40);
        expect(result.length).toBeGreaterThan(1);
        // Each chunk should be within limit
        for (const chunk of result) {
            expect(chunk.length).toBeLessThanOrEqual(40);
        }
        // Reconstruct should preserve all content
        const joined = result.join('');
        expect(joined.replace(/\n+/g, ' ').trim()).toContain('First paragraph');
        expect(joined.replace(/\n+/g, ' ').trim()).toContain('Third paragraph');
    });

    test('preserves code blocks — never splits mid-block', () => {
        const codeBlock = '```typescript\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```';
        const text = `Some text before.\n\n${codeBlock}\n\nSome text after.`;
        // Use a limit that would force a split in the middle of the code block
        // if we weren't preserving it
        const result = splitMessage(text, 60);
        // Verify no chunk has an unclosed code fence
        for (const chunk of result) {
            const openCount = (chunk.match(/```/g) || []).length;
            // Either 0 fences or even number (properly paired)
            expect(openCount % 2).toBe(0);
        }
    });

    test('splits oversized code blocks with preserved fences', () => {
        const lines = Array.from({ length: 50 }, (_, i) => `const var${i} = ${i};`);
        const codeBlock = '```typescript\n' + lines.join('\n') + '\n```';
        const result = splitMessage(codeBlock, 200);
        expect(result.length).toBeGreaterThan(1);
        // Each chunk should have opening and closing fences
        for (const chunk of result) {
            expect(chunk.startsWith('```')).toBe(true);
            expect(chunk.endsWith('```')).toBe(true);
        }
    });

    test('splits at sentence boundaries when paragraphs are too long', () => {
        const text = 'This is sentence one. This is sentence two. This is sentence three. This is the fourth and final sentence.';
        const result = splitMessage(text, 50);
        expect(result.length).toBeGreaterThan(1);
        for (const chunk of result) {
            expect(chunk.length).toBeLessThanOrEqual(50);
        }
    });

    test('falls back to word boundaries when no sentence breaks', () => {
        const text = 'word '.repeat(100).trim();
        const result = splitMessage(text, 30);
        expect(result.length).toBeGreaterThan(1);
        for (const chunk of result) {
            expect(chunk.length).toBeLessThanOrEqual(30);
        }
    });

    test('hard-splits when no breakpoints exist', () => {
        const text = 'a'.repeat(100);
        const result = splitMessage(text, 30);
        expect(result.length).toBe(4); // 100 / 30 = 3.33 → 4 chunks
        expect(result[0].length).toBe(30);
        expect(result[3].length).toBe(10);
    });

    test('mixed content: text, code block, text', () => {
        const text = [
            'Here is an explanation of the code:',
            '',
            '```javascript',
            'function hello() {',
            '    console.log("hi");',
            '}',
            '```',
            '',
            'And here is what it does.',
        ].join('\n');
        const result = splitMessage(text, 2000);
        expect(result).toEqual([text]);
    });

    test('multiple code blocks preserved', () => {
        const text = [
            '```js\nconst a = 1;\n```',
            '',
            'Some text between.',
            '',
            '```py\nx = 2\n```',
        ].join('\n');
        const result = splitMessage(text, 2000);
        expect(result).toEqual([text]);
    });

    test('respects default 2000 char limit', () => {
        const text = 'x'.repeat(3000);
        const result = splitMessage(text);
        for (const chunk of result) {
            expect(chunk.length).toBeLessThanOrEqual(2000);
        }
    });
});

describe('splitEmbedDescription', () => {
    test('uses 4096 char limit', () => {
        const text = 'x'.repeat(5000);
        const result = splitEmbedDescription(text);
        for (const chunk of result) {
            expect(chunk.length).toBeLessThanOrEqual(4096);
        }
    });

    test('short text returns single chunk', () => {
        const result = splitEmbedDescription('Short text');
        expect(result).toEqual(['Short text']);
    });
});

describe('collapseCodeBlocks', () => {
    test('preserves small code blocks under threshold', () => {
        const text = 'Here is some code:\n```ts\nconst x = 1;\nconst y = 2;\n```\nDone.';
        expect(collapseCodeBlocks(text)).toBe(text);
    });

    test('collapses large code blocks exceeding threshold', () => {
        const lines = Array.from({ length: 20 }, (_, i) => `const var${i} = ${i};`);
        const text = `I created the file:\n\`\`\`typescript\n${lines.join('\n')}\n\`\`\`\nFile written.`;
        const result = collapseCodeBlocks(text);
        expect(result).not.toContain('const var0');
        expect(result).toContain('typescript');
        expect(result).toMatch(/\d+ lines/);
        expect(result).toContain('I created the file:');
        expect(result).toContain('File written.');
    });

    test('collapses multiple large code blocks independently', () => {
        const lines1 = Array.from({ length: 15 }, (_, i) => `line${i}`);
        const lines2 = Array.from({ length: 25 }, (_, i) => `row${i}`);
        const text = `\`\`\`js\n${lines1.join('\n')}\n\`\`\`\nMiddle text.\n\`\`\`python\n${lines2.join('\n')}\n\`\`\``;
        const result = collapseCodeBlocks(text);
        expect(result).toContain('js');
        expect(result).toContain('python');
        expect(result).toContain('Middle text.');
        // Both blocks should be collapsed (line counts include trailing newline)
        expect(result).not.toContain('line0');
        expect(result).not.toContain('row0');
    });

    test('uses "code" label when no language specified', () => {
        const lines = Array.from({ length: 15 }, (_, i) => `line ${i}`);
        const text = `\`\`\`\n${lines.join('\n')}\n\`\`\``;
        const result = collapseCodeBlocks(text);
        expect(result).toContain('code');
        expect(result).toMatch(/\d+ lines/);
        expect(result).not.toContain('line 0');
    });

    test('respects custom threshold', () => {
        const lines = Array.from({ length: 5 }, (_, i) => `line ${i}`);
        const text = `\`\`\`ts\n${lines.join('\n')}\n\`\`\``;
        // With threshold of 3, should collapse
        expect(collapseCodeBlocks(text, 3)).toMatch(/\d+ lines/);
        // With threshold of 10, should preserve
        expect(collapseCodeBlocks(text, 10)).toBe(text);
    });

    test('returns text unchanged when no code blocks present', () => {
        const text = 'Just a regular message with no code.';
        expect(collapseCodeBlocks(text)).toBe(text);
    });

    test('returns empty string for empty input', () => {
        expect(collapseCodeBlocks('')).toBe('');
    });
});
