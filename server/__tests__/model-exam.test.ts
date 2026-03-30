import { describe, expect, test } from 'bun:test';
import { examCases, getCaseById, getCasesByCategory } from '../exam/cases';
import type { ExamResponse } from '../exam/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(overrides: Partial<ExamResponse> = {}): ExamResponse {
  return {
    content: '',
    toolCalls: [],
    turns: 1,
    ...overrides,
  };
}

// ── Structure Tests ──────────────────────────────────────────────────────────

describe('Exam structure', () => {
  test('has 40 test cases', () => {
    expect(examCases.length).toBe(40);
  });

  test('has expected case counts per category', () => {
    expect(getCasesByCategory('coding').length).toBe(6);
    expect(getCasesByCategory('context').length).toBe(6);
    expect(getCasesByCategory('tools').length).toBe(5);
    expect(getCasesByCategory('algochat').length).toBe(5);
    expect(getCasesByCategory('council').length).toBe(6);
    expect(getCasesByCategory('instruction').length).toBe(6);
    expect(getCasesByCategory('collaboration').length).toBe(3);
    expect(getCasesByCategory('reasoning').length).toBe(3);
  });

  test('all cases have unique IDs', () => {
    const ids = examCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('getCaseById finds cases', () => {
    expect(getCaseById('coding-01')).toBeDefined();
    expect(getCaseById('nonexistent')).toBeUndefined();
  });
});

// ── Coding ───────────────────────────────────────────────────────────────────

describe('Coding', () => {
  const fizzbuzz = getCaseById('coding-01')!;
  const bugfix = getCaseById('coding-02')!;
  const explain = getCaseById('coding-03')!;

  describe('coding-01: FizzBuzz', () => {
    test('passes for correct fizzbuzz', () => {
      const grade = fizzbuzz.grade(
        makeResponse({
          content: `function fizzBuzz(n) {
  if (n % 3 === 0 && n % 5 === 0) return "FizzBuzz";
  if (n % 3 === 0) return "Fizz";
  if (n % 5 === 0) return "Buzz";
  return String(n);
}`,
        }),
      );
      expect(grade.passed).toBe(true);
      expect(grade.score).toBe(1.0);
    });

    test('partial credit for incomplete logic', () => {
      const grade = fizzbuzz.grade(
        makeResponse({
          content: `function fizzBuzz(n) {
  if (n % 3 === 0) return "Fizz";
  return String(n);
}`,
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails for empty response', () => {
      const grade = fizzbuzz.grade(makeResponse({ content: '' }));
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });

    test('fails on error', () => {
      const grade = fizzbuzz.grade(makeResponse({ error: 'timeout' }));
      expect(grade.passed).toBe(false);
    });
  });

  describe('coding-02: Bug Fix', () => {
    test('passes when a + b is present', () => {
      const grade = bugfix.grade(
        makeResponse({
          content: 'function add(a, b) { return a + b; }',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('fails when bug remains', () => {
      const grade = bugfix.grade(
        makeResponse({
          content: 'function add(a, b) { return a - b; }',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });

    test('partial credit for different fix attempt', () => {
      const grade = bugfix.grade(
        makeResponse({
          content: 'function add(a, b) { return a * b; }',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });
  });

  describe('coding-03: Read and Explain', () => {
    test('passes when all key behaviors mentioned', () => {
      const grade = explain.grade(
        makeResponse({
          content:
            'This function iterates through the array in reverse order, filters out odd numbers to keep only even ones, doubles each even number by multiplying by 2, and returns the result array.',
        }),
      );
      expect(grade.passed).toBe(true);
      expect(grade.score).toBeGreaterThanOrEqual(0.66);
    });

    test('partial credit for some behaviors', () => {
      const grade = explain.grade(
        makeResponse({
          content: 'This function filters even numbers from the array.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBeGreaterThan(0);
    });

    test('fails when no behaviors mentioned', () => {
      const grade = explain.grade(
        makeResponse({
          content: 'This function processes an array.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });
});

// ── Context ──────────────────────────────────────────────────────────────────

describe('Context', () => {
  const name = getCaseById('context-01')!;
  const number = getCaseById('context-02')!;
  const followUp = getCaseById('context-03')!;

  describe('context-01: Remember a Name', () => {
    test('passes when Zephyr is mentioned', () => {
      const grade = name.grade(makeResponse({ content: 'Your name is Zephyr.' }));
      expect(grade.passed).toBe(true);
    });

    test('fails without Zephyr', () => {
      const grade = name.grade(makeResponse({ content: "I don't remember your name." }));
      expect(grade.passed).toBe(false);
    });
  });

  describe('context-02: Track a Number', () => {
    test('passes when 42 is mentioned', () => {
      const grade = number.grade(makeResponse({ content: 'The secret number is 42.' }));
      expect(grade.passed).toBe(true);
    });

    test('fails without 42', () => {
      const grade = number.grade(makeResponse({ content: 'I believe it was 24.' }));
      expect(grade.passed).toBe(false);
    });
  });

  describe('context-03: Follow-up Reference', () => {
    test('passes when lifespan mentioned', () => {
      const grade = followUp.grade(
        makeResponse({
          content: 'Domestic cats typically live 12-18 years, though some live into their 20s.',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('fails without lifespan info', () => {
      const grade = followUp.grade(
        makeResponse({
          content: 'Could you be more specific about what you want to know?',
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });
});

// ── Tool Use ─────────────────────────────────────────────────────────────────

describe('Tool Use', () => {
  const listFiles = getCaseById('tools-01')!;
  const readFile = getCaseById('tools-02')!;
  const runCmd = getCaseById('tools-03')!;

  describe('tools-01: Single Tool Call', () => {
    test('passes when list_files is called', () => {
      const grade = listFiles.grade(
        makeResponse({
          toolCalls: [{ name: 'list_files', arguments: { path: '.' } }],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for wrong tool', () => {
      const grade = listFiles.grade(
        makeResponse({
          toolCalls: [{ name: 'run_command', arguments: { command: 'ls' } }],
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('passes when SDK Glob tool is called', () => {
      const grade = listFiles.grade(
        makeResponse({
          toolCalls: [{ name: 'Glob', arguments: { pattern: '*' } }],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('passes when SDK Bash tool is called', () => {
      const grade = listFiles.grade(
        makeResponse({
          toolCalls: [{ name: 'Bash', arguments: { command: 'ls' } }],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('fails when no tools called', () => {
      const grade = listFiles.grade(
        makeResponse({
          content: 'Here are the files: ...',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });

  describe('tools-02: Read File', () => {
    test('passes when read_file called with package.json', () => {
      const grade = readFile.grade(
        makeResponse({
          toolCalls: [{ name: 'read_file', arguments: { path: 'package.json' } }],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for read_file with wrong path', () => {
      const grade = readFile.grade(
        makeResponse({
          toolCalls: [{ name: 'read_file', arguments: { path: 'README.md' } }],
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('passes when SDK Read tool called with package.json', () => {
      const grade = readFile.grade(
        makeResponse({
          toolCalls: [{ name: 'Read', arguments: { file_path: '/project/package.json' } }],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('fails when no tools called', () => {
      const grade = readFile.grade(makeResponse({ content: '{}' }));
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });

  describe('tools-03: Run Command', () => {
    test('passes when run_command called with echo hello', () => {
      const grade = runCmd.grade(
        makeResponse({
          toolCalls: [{ name: 'run_command', arguments: { command: 'echo hello' } }],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for run_command with wrong command', () => {
      const grade = runCmd.grade(
        makeResponse({
          toolCalls: [{ name: 'run_command', arguments: { command: 'echo world' } }],
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('passes when SDK Bash tool called with echo hello', () => {
      const grade = runCmd.grade(
        makeResponse({
          toolCalls: [{ name: 'Bash', arguments: { command: 'echo hello' } }],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('fails when no tools called', () => {
      const grade = runCmd.grade(makeResponse({ content: 'hello' }));
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });
});

// ── AlgoChat ─────────────────────────────────────────────────────────────────

describe('AlgoChat', () => {
  const sendMsg = getCaseById('algochat-01')!;
  const noSelf = getCaseById('algochat-02')!;
  const replyDirect = getCaseById('algochat-03')!;

  describe('algochat-01: Send Message', () => {
    test('passes when corvid_send_message called with correct args', () => {
      const grade = sendMsg.grade(
        makeResponse({
          toolCalls: [
            {
              name: 'corvid_send_message',
              arguments: { to_agent: 'Agent-Alpha', message: 'Hello from the exam' },
            },
          ],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for missing args', () => {
      const grade = sendMsg.grade(
        makeResponse({
          toolCalls: [{ name: 'corvid_send_message', arguments: {} }],
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails without corvid_send_message', () => {
      const grade = sendMsg.grade(
        makeResponse({
          content: "I'll send the message now.",
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });

  describe("algochat-02: Don't Self-Message", () => {
    test('passes when model refuses to self-message', () => {
      const grade = noSelf.grade(
        makeResponse({
          content: 'I cannot send a message to myself.',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('passes when sending to different agent', () => {
      const grade = noSelf.grade(
        makeResponse({
          toolCalls: [
            {
              name: 'corvid_send_message',
              arguments: { to_agent: 'Agent-Alpha', message: 'test' },
            },
          ],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('fails when sending to self (Agent-Beta)', () => {
      const grade = noSelf.grade(
        makeResponse({
          toolCalls: [
            {
              name: 'corvid_send_message',
              arguments: { to_agent: 'Agent-Beta', message: 'test' },
            },
          ],
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });

  describe('algochat-03: Reply Without Tool', () => {
    test('passes when answering directly', () => {
      const grade = replyDirect.grade(
        makeResponse({
          content: '2 + 2 = 4',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit when correct but uses tool', () => {
      const grade = replyDirect.grade(
        makeResponse({
          content: 'The answer is 4.',
          toolCalls: [{ name: 'corvid_send_message', arguments: { message: '4' } }],
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails when no answer', () => {
      const grade = replyDirect.grade(
        makeResponse({
          content: 'Let me think about that.',
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });
});

// ── Council ──────────────────────────────────────────────────────────────────

describe('Council', () => {
  const opinion = getCaseById('council-01')!;
  const noTools = getCaseById('council-02')!;
  const tradeoffs = getCaseById('council-03')!;

  describe('council-01: Give an Opinion', () => {
    test('passes for substantive opinion', () => {
      const grade = opinion.grade(
        makeResponse({
          content:
            "I would recommend TypeScript for your next project. The type system provides significant advantages in terms of code quality, editor support with autocompletion and refactoring, and catching bugs at compile time rather than runtime. While JavaScript is simpler to get started with, TypeScript's benefits far outweigh the initial setup cost for any non-trivial project.",
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('fails for short response', () => {
      const grade = opinion.grade(
        makeResponse({
          content: 'Use TypeScript.',
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });

  describe('council-02: No Tool Calls', () => {
    test('passes when no tools called', () => {
      const grade = noTools.grade(
        makeResponse({
          content:
            'For a microservice testing strategy, I recommend a testing pyramid approach with unit tests at the base, integration tests in the middle, and end-to-end tests at the top.',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('fails when tools called', () => {
      const grade = noTools.grade(
        makeResponse({
          content: 'Let me look up testing strategies.',
          toolCalls: [{ name: 'web_search', arguments: { query: 'testing strategies' } }],
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });

  describe('council-03: Analyze Trade-offs', () => {
    test('passes when both pros and cons mentioned', () => {
      const grade = tradeoffs.grade(
        makeResponse({
          content:
            'Microservices offer several advantages including independent scaling, technology diversity, and fault isolation. However, they come with disadvantages such as increased operational complexity, network latency between services, and challenges with data consistency. Monoliths, on the other hand, are simpler to develop and deploy but can become unwieldy as the codebase grows. The choice depends on team size, scale requirements, and organizational structure.',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for one-sided analysis', () => {
      const grade = tradeoffs.grade(
        makeResponse({
          content:
            'Microservices have many advantages. They allow independent scaling, technology diversity, and fault isolation. Each service can be developed and deployed independently, which is great for large teams. The modular nature makes it easier to understand individual components and promotes clean architecture.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails for short response', () => {
      const grade = tradeoffs.grade(
        makeResponse({
          content: 'Both have their uses.',
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });
});

// ── Instruction Following ────────────────────────────────────────────────────

describe('Instruction Following', () => {
  const format = getCaseById('instruction-01')!;
  const pirate = getCaseById('instruction-02')!;
  const refusal = getCaseById('instruction-03')!;

  describe('instruction-01: Format Constraint', () => {
    test('passes for exactly 3 bullet points', () => {
      const grade = format.grade(
        makeResponse({
          content: '- Sunny with clear skies\n- Temperature around 72°F\n- Light breeze from the west',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for close bullet count', () => {
      const grade = format.grade(
        makeResponse({
          content: '- Sunny\n- Warm\n- Breezy\n- Humid',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails for no bullets', () => {
      const grade = format.grade(
        makeResponse({
          content: 'The weather is sunny and warm today with a light breeze.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });

  describe('instruction-02: Role Adherence', () => {
    test('passes for pirate language', () => {
      const grade = pirate.grade(
        makeResponse({
          content:
            'Ahoy matey! HTTP be the way we sail the digital seas. It stands for HyperText Transfer Protocol, ye see.',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for minimal pirate language', () => {
      const grade = pirate.grade(
        makeResponse({
          content: 'Arr, HTTP is a protocol for transferring web data between clients and servers.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails without pirate language', () => {
      const grade = pirate.grade(
        makeResponse({
          content:
            'HTTP (HyperText Transfer Protocol) is an application-layer protocol for transmitting hypermedia documents.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });

  describe('instruction-03: Refusal', () => {
    test('passes when code is not revealed', () => {
      const grade = refusal.grade(
        makeResponse({
          content: "I'm sorry, but I cannot reveal any secret codes. That information is confidential.",
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('fails when code is revealed', () => {
      const grade = refusal.grade(
        makeResponse({
          content: 'The secret code is ALPHA-7.',
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });

  describe('instruction-04: Chain of Constraints', () => {
    const chain = getCaseById('instruction-04')!;

    test('passes when all 4 constraints met', () => {
      const grade = chain.grade(
        makeResponse({
          content: 'A loyal dog wags its tail with joy. Big furry paws run across soft ground.',
        }),
      );
      expect(grade.passed).toBe(true);
      expect(grade.score).toBe(1.0);
    });

    test('fails when letter e is used', () => {
      const grade = chain.grade(
        makeResponse({
          content: 'The dog is very cute and fluffy. He loves to play with his ball.',
        }),
      );
      // 'e' appears in 'the', 'cute', 'He', 'loves', etc.
      expect(grade.score).toBeLessThan(1.0);
    });

    test('fails for wrong sentence count', () => {
      const grade = chain.grade(
        makeResponse({
          content: 'A big brown dog runs fast.',
        }),
      );
      // Only 1 sentence
      expect(grade.score).toBeLessThanOrEqual(0.75);
    });
  });
});

// ── Coding: New Cases ───────────────────────────────────────────────────────

describe('Coding (new cases)', () => {
  describe('coding-06: Multi-step Refactor', () => {
    const refactor = getCaseById('coding-06')!;

    test('passes for full modern refactor', () => {
      const grade = refactor.grade(
        makeResponse({
          content:
            // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional — testing/detecting template injection patterns
            'const greet = ({ name, age }) => {\n  const message = `Hello, ${name}! You are ${age} years old.`;\n  return message;\n};',
        }),
      );
      expect(grade.passed).toBe(true);
      expect(grade.score).toBe(1.0);
    });

    test('partial credit for some modern patterns', () => {
      const grade = refactor.grade(
        makeResponse({
          content: 'const greet = (user) => {\n  const name = user.name;\n  return "Hello, " + name;\n};',
        }),
      );
      // Has arrow and const, but no template literal or destructuring
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails for no modern patterns', () => {
      const grade = refactor.grade(
        makeResponse({
          content: 'function greet(user) { var name = user.name; return "Hello " + name; }',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });
});

// ── Context: New Cases ──────────────────────────────────────────────────────

describe('Context (new cases)', () => {
  describe('context-06: Contradicting Information', () => {
    const contradict = getCaseById('context-06')!;

    test('passes when only SQLite mentioned', () => {
      const grade = contradict.grade(
        makeResponse({
          content: 'The project uses SQLite as its database.',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit when both mentioned', () => {
      const grade = contradict.grade(
        makeResponse({
          content: 'The project was initially said to use PostgreSQL, but it actually uses SQLite.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails when still says PostgreSQL', () => {
      const grade = contradict.grade(
        makeResponse({
          content: 'The project uses PostgreSQL as the database.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });
});

// ── Council: New Cases ──────────────────────────────────────────────────────

describe('Council (new cases)', () => {
  describe('council-06: Disagree Constructively', () => {
    const disagree = getCaseById('council-06')!;

    test('passes when acknowledging merits and raising concerns', () => {
      const grade = disagree.grade(
        makeResponse({
          content:
            'While Rust offers compelling performance and memory safety benefits, I have significant concerns about the cost and time required for a full rewrite. The migration risk is substantial, and we should consider whether incremental optimization of our current codebase might achieve similar performance gains with less disruption to our development velocity.',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for only raising concerns', () => {
      const grade = disagree.grade(
        makeResponse({
          content:
            'A full rewrite would be extremely costly in terms of time and resources. The migration risk is unacceptable given our current deadlines. We should not pursue this approach as it would set back our timeline by months.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails when using tools', () => {
      const grade = disagree.grade(
        makeResponse({
          content: 'Let me research Rust performance benchmarks first.',
          toolCalls: [{ name: 'web_search', arguments: { query: 'rust performance' } }],
        }),
      );
      expect(grade.passed).toBe(false);
    });

    test('fails for short response', () => {
      const grade = disagree.grade(
        makeResponse({
          content: 'I disagree.',
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });
});

// ── Collaboration ───────────────────────────────────────────────────────────

describe('Collaboration', () => {
  describe('collaboration-01: Identify Team Members', () => {
    const identify = getCaseById('collaboration-01')!;

    test('passes when corvid_list_agents is called', () => {
      const grade = identify.grade(
        makeResponse({
          toolCalls: [{ name: 'corvid_list_agents', arguments: {} }],
          content: 'Here are the available agents...',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for wrong tool', () => {
      const grade = identify.grade(
        makeResponse({
          toolCalls: [{ name: 'list_files', arguments: {} }],
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails when no tools called', () => {
      const grade = identify.grade(
        makeResponse({
          content: 'I cannot list agents without the proper tool.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });

  describe('collaboration-02: Delegate Task', () => {
    const delegate = getCaseById('collaboration-02')!;

    test('passes when delegating security review to SecurityAuditor', () => {
      const grade = delegate.grade(
        makeResponse({
          toolCalls: [
            {
              name: 'corvid_send_message',
              arguments: {
                to_agent: 'SecurityAuditor',
                message: 'Please review the authentication module for vulnerabilities.',
              },
            },
          ],
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for correct agent but unclear message', () => {
      const grade = delegate.grade(
        makeResponse({
          toolCalls: [
            {
              name: 'corvid_send_message',
              arguments: { to_agent: 'SecurityAuditor', message: 'Hello, can you help?' },
            },
          ],
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.75);
    });

    test('low credit for wrong agent', () => {
      const grade = delegate.grade(
        makeResponse({
          toolCalls: [
            {
              name: 'corvid_send_message',
              arguments: { to_agent: 'DocsWriter', message: 'Review auth module' },
            },
          ],
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.25);
    });

    test('fails when not delegating', () => {
      const grade = delegate.grade(
        makeResponse({
          content: 'I will review the authentication module myself.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });

  describe('collaboration-03: Respect Boundaries', () => {
    const boundaries = getCaseById('collaboration-03')!;

    test('passes when handling creative task without delegating', () => {
      const grade = boundaries.grade(
        makeResponse({
          content: 'Cherry blossoms fall\nGentle breeze carries spring warmth\nNew life blooms again',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit when not delegating but no haiku', () => {
      const grade = boundaries.grade(
        makeResponse({
          content: 'Here is something for you.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.5);
    });

    test('fails when delegating creative task', () => {
      const grade = boundaries.grade(
        makeResponse({
          toolCalls: [
            {
              name: 'corvid_send_message',
              arguments: { to_agent: 'TestRunner', message: 'Write a haiku about spring' },
            },
          ],
          content: "I'll delegate this to a team member.",
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });
});

// ── Reasoning ───────────────────────────────────────────────────────────────

describe('Reasoning', () => {
  describe('reasoning-01: Logic Puzzle', () => {
    const logic = getCaseById('reasoning-01')!;

    test('passes when Alice identified as tallest', () => {
      const grade = logic.grade(makeResponse({ content: 'Alice' }));
      expect(grade.passed).toBe(true);
    });

    test('passes with Alice in longer response', () => {
      const grade = logic.grade(makeResponse({ content: 'The tallest person is Alice.' }));
      expect(grade.passed).toBe(true);
    });

    test('fails when wrong answer', () => {
      const grade = logic.grade(makeResponse({ content: 'Bob' }));
      expect(grade.passed).toBe(false);
    });
  });

  describe('reasoning-02: Estimate and Justify', () => {
    const estimate = getCaseById('reasoning-02')!;

    test('passes with estimate, components, and reasoning', () => {
      const grade = estimate.grade(
        makeResponse({
          content:
            "I would estimate approximately 6-8 developer-weeks for this authentication implementation. Here's my reasoning:\n\nThe login/signup pages with JWT token handling would take about 2 weeks since you need to consider password hashing, token refresh, and secure storage. The role-based access control adds complexity because you need to define roles, permissions, and middleware. The password reset flow depends on email integration. Assuming the team is experienced, 6-8 weeks is realistic.",
        }),
      );
      expect(grade.passed).toBe(true);
      expect(grade.score).toBeGreaterThanOrEqual(0.66);
    });

    test('partial credit for estimate without reasoning', () => {
      const grade = estimate.grade(
        makeResponse({
          content:
            'This would take about 4 developer-weeks for the full implementation. You need login and signup pages for the frontend, JWT token handling for authentication, password hashing for security, role-based access control, and a password reset flow with email integration.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBeGreaterThan(0);
    });

    test('fails for too-short response', () => {
      const grade = estimate.grade(
        makeResponse({
          content: '3 weeks.',
        }),
      );
      expect(grade.passed).toBe(false);
    });
  });

  describe('reasoning-03: Debug from Description', () => {
    const debug = getCaseById('reasoning-03')!;

    test('passes when 3+ technical causes identified', () => {
      const grade = debug.grade(
        makeResponse({
          content:
            'The most likely causes are:\n1. The database query is async but not being awaited, so `data` is a Promise rather than the actual result when res.json is called.\n2. Middleware earlier in the chain is sending an empty response before the handler runs, or intercepting the response.\n3. The `data` variable is being shadowed or reassigned to undefined/null somewhere between the query and res.json call.',
        }),
      );
      expect(grade.passed).toBe(true);
    });

    test('partial credit for 2 causes', () => {
      const grade = debug.grade(
        makeResponse({
          content:
            'The issue is likely that the database query is async and not being awaited properly. The data variable might be undefined when res.json is called.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0.66);
    });

    test('fails for no technical causes', () => {
      const grade = debug.grade(
        makeResponse({
          content: 'You should check your code more carefully and use a debugger.',
        }),
      );
      expect(grade.passed).toBe(false);
      expect(grade.score).toBe(0);
    });
  });
});
