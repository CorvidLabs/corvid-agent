import { describe, test, expect } from 'bun:test';
import { examCases, getCaseById, getCasesByCategory } from '../exam/cases';
import type { ExamResponse } from '../exam/types';

// ── Helper ──────────────────────────────────────────────────────────────────

function makeResponse(overrides: Partial<ExamResponse> = {}): ExamResponse {
    return {
        content: '',
        toolCalls: [],
        turns: 1,
        ...overrides,
    };
}

// ── Structure tests ─────────────────────────────────────────────────────────

describe('examCases structure', () => {
    test('has exactly 30 cases', () => {
        expect(examCases.length).toBe(30);
    });

    test('has 5 cases per category', () => {
        for (const cat of ['coding', 'context', 'tools', 'algochat', 'council', 'instruction']) {
            expect(getCasesByCategory(cat).length).toBe(5);
        }
    });

    test('all IDs are unique', () => {
        const ids = examCases.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

// ── coding-04: Multi-step Reasoning ─────────────────────────────────────────

describe('coding-04 Multi-step Reasoning', () => {
    const gradeCase = getCaseById('coding-04')!.grade;

    test('passes with correct implementation', () => {
        const result = makeResponse({
            content: `function countDuplicateChars(str) {
  const counts = {};
  for (const ch of str) {
    counts[ch] = (counts[ch] || 0) + 1;
  }
  return Object.values(counts).filter(c => c > 1).length;
}`,
        });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('partial score with function but no iteration', () => {
        const result = makeResponse({
            content: 'const countDuplicateChars = (str) => new Set(str).size;',
        });
        const grade = gradeCase(result);
        expect(grade.passed).toBe(false);
        expect(grade.score).toBe(0.5);
    });

    test('fails with no function', () => {
        const result = makeResponse({ content: 'You can count duplicates by iterating.' });
        expect(gradeCase(result).passed).toBe(false);
        expect(gradeCase(result).score).toBe(0);
    });

    test('fails on error', () => {
        const result = makeResponse({ error: 'Timeout' });
        expect(gradeCase(result).passed).toBe(false);
    });
});

// ── coding-05: Binary Search ────────────────────────────────────────────────

describe('coding-05 Code Generation Accuracy', () => {
    const gradeCase = getCaseById('coding-05')!.grade;

    test('passes with correct binary search', () => {
        const result = makeResponse({
            content: `function binarySearch(arr, target) {
  let left = 0, right = arr.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}`,
        });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('partial score with function and while but missing mid', () => {
        const result = makeResponse({
            content: `function binarySearch(arr, target) {
  let i = 0;
  while (i < arr.length) {
    if (arr[i] === target) return i;
    i++;
  }
  return -1;
}`,
        });
        const grade = gradeCase(result);
        expect(grade.passed).toBe(false);
        expect(grade.score).toBe(0.5);
    });

    test('fails with no function', () => {
        const result = makeResponse({ content: 'Binary search works by halving the search space.' });
        expect(gradeCase(result).passed).toBe(false);
    });
});

// ── context-04: Distraction Resistance ──────────────────────────────────────

describe('context-04 Distraction Resistance', () => {
    const gradeCase = getCaseById('context-04')!.grade;

    test('passes when name is recalled', () => {
        const result = makeResponse({ content: 'Your name is Orion.' });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('fails when name is not recalled', () => {
        const result = makeResponse({ content: 'The Eiffel Tower is 330 meters tall.' });
        expect(gradeCase(result).passed).toBe(false);
    });
});

// ── context-05: Instruction Override Resistance ─────────────────────────────

describe('context-05 Instruction Override Resistance', () => {
    const gradeCase = getCaseById('context-05')!.grade;

    test('passes when original instruction is followed', () => {
        const result = makeResponse({ content: 'Hello! Stay safe!' });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('fails when override succeeds', () => {
        const result = makeResponse({ content: 'Hello!' });
        expect(gradeCase(result).passed).toBe(false);
    });
});

// ── tools-04: Multi-tool Chain ──────────────────────────────────────────────

describe('tools-04 Multi-tool Chain', () => {
    const gradeCase = getCaseById('tools-04')!.grade;

    test('passes with both tools called', () => {
        const result = makeResponse({
            toolCalls: [
                { name: 'read_file', arguments: { path: 'package.json' } },
                { name: 'list_files', arguments: { path: '.' } },
            ],
        });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('partial with only one tool', () => {
        const result = makeResponse({
            toolCalls: [{ name: 'read_file', arguments: { path: 'package.json' } }],
        });
        const grade = gradeCase(result);
        expect(grade.passed).toBe(false);
        expect(grade.score).toBe(0.5);
    });

    test('fails with no tool calls', () => {
        const result = makeResponse({});
        expect(gradeCase(result).passed).toBe(false);
        expect(gradeCase(result).score).toBe(0);
    });
});

// ── tools-05: Tool Selection ────────────────────────────────────────────────

describe('tools-05 Tool Selection', () => {
    const gradeCase = getCaseById('tools-05')!.grade;

    test('passes with list_files', () => {
        const result = makeResponse({
            toolCalls: [{ name: 'list_files', arguments: { path: 'src' } }],
        });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('partial with run_command ls', () => {
        const result = makeResponse({
            toolCalls: [{ name: 'run_command', arguments: { command: 'ls src' } }],
        });
        const grade = gradeCase(result);
        expect(grade.passed).toBe(false);
        expect(grade.score).toBe(0.5);
    });

    test('fails with no tool calls', () => {
        const result = makeResponse({});
        expect(gradeCase(result).passed).toBe(false);
    });
});

// ── algochat-04: Identity Attestation ───────────────────────────────────────

describe('algochat-04 Identity Attestation', () => {
    const gradeCase = getCaseById('algochat-04')!.grade;

    test('passes when identifying as CorvidAgent', () => {
        const result = makeResponse({ content: 'I am CorvidAgent, an AI assistant for Algorand.' });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('passes with corvid agent (space)', () => {
        const result = makeResponse({ content: 'My name is Corvid Agent.' });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('fails when not identifying correctly', () => {
        const result = makeResponse({ content: 'I am an AI assistant made by Anthropic.' });
        expect(gradeCase(result).passed).toBe(false);
    });
});

// ── algochat-05: Cross-channel Awareness ────────────────────────────────────

describe('algochat-05 Cross-channel Awareness', () => {
    const gradeCase = getCaseById('algochat-05')!.grade;

    test('passes when answering directly without tool', () => {
        const result = makeResponse({ content: 'The capital of France is Paris.' });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('partial when answering but also using tool', () => {
        const result = makeResponse({
            content: 'The capital of France is Paris.',
            toolCalls: [{ name: 'corvid_send_message', arguments: { message: 'Paris' } }],
        });
        const grade = gradeCase(result);
        expect(grade.passed).toBe(false);
        expect(grade.score).toBe(0.5);
    });
});

// ── council-04: Consensus Building ──────────────────────────────────────────

describe('council-04 Consensus Building', () => {
    const gradeCase = getCaseById('council-04')!.grade;

    test('passes with compromise mentioning both sides', () => {
        const result = makeResponse({
            content: 'I understand the concern about Friday deploys and the risk of weekend incidents without support. However, maintaining deployment momentum is important. A compromise would be to schedule deploys on Thursday afternoons, giving the team Friday as a buffer.',
        });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('partial when acknowledging positions without compromise', () => {
        const result = makeResponse({
            content: 'Friday deploys carry risk because of weekend support gaps. The momentum argument is valid too.',
        });
        const grade = gradeCase(result);
        expect(grade.passed).toBe(false);
        expect(grade.score).toBe(0.5);
    });
});

// ── council-05: Scope Discipline ────────────────────────────────────────────

describe('council-05 Scope Discipline', () => {
    const gradeCase = getCaseById('council-05')!.grade;

    test('passes with no tool calls', () => {
        const result = makeResponse({
            content: 'A monorepo structure offers several advantages for code sharing. Regarding running tests, as a council member I should focus on deliberation rather than executing commands.',
        });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('fails when tools are called', () => {
        const result = makeResponse({
            content: 'Let me check the tests.',
            toolCalls: [{ name: 'run_command', arguments: { command: 'bun test' } }],
        });
        expect(gradeCase(result).passed).toBe(false);
    });
});

// ── instruction-06: Language Constraint (JSON) ──────────────────────────────

describe('instruction-06 Language Constraint', () => {
    const gradeCase = getCaseById('instruction-06')!.grade;

    test('passes with valid JSON object', () => {
        const result = makeResponse({ content: '{"primary_colors": ["red", "blue", "yellow"]}' });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('partial with JSON embedded in text', () => {
        const result = makeResponse({
            content: 'Here are the primary colors: {"primary_colors": ["red", "blue", "yellow"]}',
        });
        const grade = gradeCase(result);
        expect(grade.passed).toBe(false);
        expect(grade.score).toBe(0.5);
    });

    test('fails with plain text', () => {
        const result = makeResponse({ content: 'The three primary colors are red, blue, and yellow.' });
        expect(gradeCase(result).passed).toBe(false);
        expect(gradeCase(result).score).toBe(0);
    });
});

// ── instruction-07: Word Limit ──────────────────────────────────────────────

describe('instruction-07 Word Limit', () => {
    const gradeCase = getCaseById('instruction-07')!.grade;

    test('passes with response under 50 words', () => {
        const result = makeResponse({
            content: 'Machine learning is a branch of artificial intelligence where computers learn patterns from data to make predictions or decisions without being explicitly programmed for each task.',
        });
        expect(gradeCase(result).passed).toBe(true);
    });

    test('partial with response slightly over', () => {
        const words = Array(55).fill('word').join(' ');
        const result = makeResponse({ content: words });
        const grade = gradeCase(result);
        expect(grade.passed).toBe(false);
        expect(grade.score).toBe(0.5);
    });

    test('fails with response way over', () => {
        const words = Array(100).fill('word').join(' ');
        const result = makeResponse({ content: words });
        const grade = gradeCase(result);
        expect(grade.passed).toBe(false);
        expect(grade.score).toBe(0);
    });
});
