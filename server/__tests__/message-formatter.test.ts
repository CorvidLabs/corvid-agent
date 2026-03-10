import { test, expect, describe } from 'bun:test';
import { splitMessage, splitEmbedDescription } from '../discord/message-formatter';

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
