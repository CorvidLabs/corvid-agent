import { describe, expect, test } from 'bun:test';
import {
  CHEERLEADING_WARNING_THRESHOLD,
  isCheerleadingResponse,
  isRepetitiveResponse,
  REPETITION_SIMILARITY_THRESHOLD,
} from '../lib/session-analysis';
import type { ClaudeStreamEvent } from '../process/types';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeAssistantEvent(text: string): ClaudeStreamEvent {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: text },
  } as ClaudeStreamEvent;
}

function makeToolUseContentBlockStart(): ClaudeStreamEvent {
  return {
    type: 'content_block_start',
    content_block: { type: 'tool_use', name: 'read_file' },
  } as ClaudeStreamEvent;
}

function makeResultEvent(): ClaudeStreamEvent {
  return {
    type: 'result',
    total_cost_usd: 0.001,
  } as ClaudeStreamEvent;
}

// ── True positives: pure acknowledgment without tool calls ───────────────

describe('isCheerleadingResponse — true positives', () => {
  test('classic cheerleading: "Great idea! I\'ll look into that."', () => {
    const events = [makeAssistantEvent("Great idea! I'll look into that."), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });

  test('forward commit without enthusiasm: "I\'ll investigate the issue."', () => {
    const events = [makeAssistantEvent("I'll investigate the issue."), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });

  test('"On it!" — pure filler', () => {
    const events = [makeAssistantEvent('On it!'), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });

  test('"Right away!" — pure filler', () => {
    const events = [makeAssistantEvent('Right away!'), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });

  test('"Absolutely! Let me get started on that."', () => {
    const events = [makeAssistantEvent('Absolutely! Let me get started on that.'), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });

  test('"No problem, I\'ll take care of it."', () => {
    const events = [makeAssistantEvent("No problem, I'll take care of it."), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });

  test('"Sure! I\'ll work on that right away."', () => {
    const events = [makeAssistantEvent("Sure! I'll work on that right away."), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });

  test('"Sounds good! I\'ll explore the options."', () => {
    const events = [makeAssistantEvent("Sounds good! I'll explore the options."), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });

  test('"Of course! Let me look into this for you."', () => {
    const events = [makeAssistantEvent('Of course! Let me look into this for you.'), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });

  test('"I\'m going to investigate that bug."', () => {
    const events = [makeAssistantEvent("I'm going to investigate that bug."), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(true);
  });
});

// ── False positives: responses with tool use should NOT be flagged ────────

describe('isCheerleadingResponse — false positives (tool use present)', () => {
  test('content_block_start tool_use prevents cheerleading flag', () => {
    const events: ClaudeStreamEvent[] = [
      makeToolUseContentBlockStart(),
      makeAssistantEvent("I'll read the file now."),
      makeResultEvent(),
    ];
    expect(isCheerleadingResponse(events)).toBe(false);
  });

  test('tool_use in assistant content blocks prevents cheerleading flag', () => {
    const events: ClaudeStreamEvent[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: "I'll check the file." },
            { type: 'tool_use', text: undefined },
          ],
        },
      } as ClaudeStreamEvent,
      makeResultEvent(),
    ];
    expect(isCheerleadingResponse(events)).toBe(false);
  });
});

// ── False positives: substantive text responses ───────────────────────────

describe('isCheerleadingResponse — false positives (substantive content)', () => {
  test('long explanation is not cheerleading', () => {
    const longText =
      "I'll explain the architecture. The system uses a layered approach where " +
      'each service is responsible for a single concern. The database layer handles ' +
      'persistence, the service layer handles business logic, and the API layer handles ' +
      'HTTP routing and authentication. This separation ensures testability and maintainability.';
    expect(longText.length).toBeGreaterThan(200);
    const events = [makeAssistantEvent(longText), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(false);
  });

  test('response with code block is not cheerleading', () => {
    const events = [makeAssistantEvent("Here's how to fix it:\n```typescript\nconst x = 1;\n```"), makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(false);
  });

  test('response with numbered list is not cheerleading', () => {
    const events = [
      makeAssistantEvent('Steps to resolve:\n1. First check the config\n2. Then restart the service'),
      makeResultEvent(),
    ];
    expect(isCheerleadingResponse(events)).toBe(false);
  });

  test('response with bullet list is not cheerleading', () => {
    const events = [
      makeAssistantEvent('Options:\n- Option A: use caching\n- Option B: add an index'),
      makeResultEvent(),
    ];
    expect(isCheerleadingResponse(events)).toBe(false);
  });

  test('direct factual answer without tool calls is not cheerleading', () => {
    const events = [
      makeAssistantEvent('The migration runs automatically on server startup via runPendingMigrations().'),
      makeResultEvent(),
    ];
    expect(isCheerleadingResponse(events)).toBe(false);
  });

  test('empty events returns false', () => {
    expect(isCheerleadingResponse([])).toBe(false);
  });

  test('events with no assistant event returns false', () => {
    const events = [makeResultEvent()];
    expect(isCheerleadingResponse(events)).toBe(false);
  });
});

// ── Mixed turns: tool calls present alongside text ────────────────────────

describe('isCheerleadingResponse — mixed turns', () => {
  test('tool use early in turn negates cheerleading even with ack text at end', () => {
    const events: ClaudeStreamEvent[] = [
      makeToolUseContentBlockStart(),
      {
        type: 'content_block_start',
        content_block: { type: 'text' },
      } as ClaudeStreamEvent,
      makeAssistantEvent("Great! I'll look into that. Done — see above results."),
      makeResultEvent(),
    ];
    expect(isCheerleadingResponse(events)).toBe(false);
  });

  test('thinking event followed by cheerleading text is still cheerleading', () => {
    const events: ClaudeStreamEvent[] = [
      { type: 'thinking', thinking: true } as ClaudeStreamEvent,
      makeAssistantEvent("I'll investigate that."),
      { type: 'thinking', thinking: false } as ClaudeStreamEvent,
      makeResultEvent(),
    ];
    expect(isCheerleadingResponse(events)).toBe(true);
  });
});

// ── CHEERLEADING_WARNING_THRESHOLD ───────────────────────────────────────

describe('CHEERLEADING_WARNING_THRESHOLD', () => {
  test('threshold is 2', () => {
    expect(CHEERLEADING_WARNING_THRESHOLD).toBe(2);
  });
});

// ── isRepetitiveResponse ──────────────────────────────────────────────────

describe('isRepetitiveResponse', () => {
  test('returns false with no prior responses', () => {
    expect(isRepetitiveResponse('Hello, I will investigate the bug.', [])).toBe(false);
  });

  test('returns false for distinct responses', () => {
    const recent = ['The issue is in server/lib/crypto.ts — the hash function uses MD5.'];
    expect(
      isRepetitiveResponse('I fixed the auth module by adding proper input validation to the login handler.', recent),
    ).toBe(false);
  });

  test('detects near-identical rephrasing as repetitive', () => {
    const recent = ['I will investigate the login bug and find the root cause in the authentication system.'];
    expect(
      isRepetitiveResponse(
        'Let me investigate the login bug and find the root cause in the authentication system.',
        recent,
      ),
    ).toBe(true);
  });

  test('detects shuffled sentence order as repetitive', () => {
    const recent = [
      'The authentication system has a bug in the login handler. I need to investigate the root cause and fix it.',
    ];
    expect(
      isRepetitiveResponse(
        'I need to investigate the root cause and fix the bug in the login handler of the authentication system.',
        recent,
      ),
    ).toBe(true);
  });

  test('ignores very short texts (below 20 chars)', () => {
    expect(isRepetitiveResponse('ok sure', ['ok sure'])).toBe(false);
  });

  test('compares against multiple recent responses', () => {
    const recent = [
      'Something completely different about database migrations.',
      'I will investigate the login bug and find the root cause in the authentication system.',
    ];
    // Should match the second recent response
    expect(
      isRepetitiveResponse(
        'Let me investigate the login bug and find the root cause in the authentication system.',
        recent,
      ),
    ).toBe(true);
  });

  test('exports REPETITION_SIMILARITY_THRESHOLD as a number', () => {
    expect(typeof REPETITION_SIMILARITY_THRESHOLD).toBe('number');
    expect(REPETITION_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
    expect(REPETITION_SIMILARITY_THRESHOLD).toBeLessThan(1);
  });
});
