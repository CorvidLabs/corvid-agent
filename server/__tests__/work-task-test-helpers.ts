import { mock } from 'bun:test';
import type { AstParserService } from '../ast/service';
import type { AstSymbol, FileSymbolIndex, ProjectSymbolIndex } from '../ast/types';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';

/**
 * Create a mock AstParserService with configurable symbol data.
 */
export function createMockAstParserService(opts?: { files?: Map<string, FileSymbolIndex> }): AstParserService {
  const files = opts?.files ?? new Map<string, FileSymbolIndex>();
  const projectIndexes = new Map<string, ProjectSymbolIndex>();

  return {
    init: mock(async () => {}),
    parseFile: mock(async () => null),
    parseSource: mock(async () => []),
    indexProject: mock(async (projectDir: string) => {
      const index: ProjectSymbolIndex = {
        projectDir,
        files,
        lastFullIndexAt: Date.now(),
      };
      projectIndexes.set(projectDir, index);
      return index;
    }),
    getProjectIndex: mock((projectDir: string) => {
      return projectIndexes.get(projectDir) ?? null;
    }),
    searchSymbols: mock((projectDir: string, query: string, options?: { kinds?: string[]; limit?: number }) => {
      const index = projectIndexes.get(projectDir);
      if (!index) return [];
      const lowerQuery = query.toLowerCase();
      const results: AstSymbol[] = [];
      const limit = options?.limit ?? 100;

      for (const fileIndex of index.files.values()) {
        for (const symbol of fileIndex.symbols) {
          if (results.length >= limit) return results;
          if (symbol.name.toLowerCase().includes(lowerQuery)) {
            results.push(symbol);
          }
          if (symbol.children) {
            for (const child of symbol.children) {
              if (results.length >= limit) return results;
              if (child.name.toLowerCase().includes(lowerQuery)) {
                results.push(child);
              }
            }
          }
        }
      }
      return results;
    }),
    invalidateFile: mock(() => {}),
    clearProjectIndex: mock(() => {}),
  } as unknown as AstParserService;
}

/**
 * Build sample file symbol indexes for testing.
 */
export function buildSampleSymbolIndex(projectDir: string): Map<string, FileSymbolIndex> {
  const files = new Map<string, FileSymbolIndex>();

  files.set(`${projectDir}/server/work/service.ts`, {
    filePath: `${projectDir}/server/work/service.ts`,
    mtimeMs: 1000,
    symbols: [
      {
        name: 'WorkTaskService',
        kind: 'class',
        startLine: 30,
        endLine: 200,
        isExported: true,
        children: [
          { name: 'create', kind: 'method', startLine: 68, endLine: 150, isExported: false },
          { name: 'cancelTask', kind: 'method', startLine: 155, endLine: 175, isExported: false },
          { name: 'buildWorkPrompt', kind: 'method', startLine: 180, endLine: 200, isExported: false },
        ],
      },
    ],
  });

  files.set(`${projectDir}/server/ast/service.ts`, {
    filePath: `${projectDir}/server/ast/service.ts`,
    mtimeMs: 1000,
    symbols: [
      {
        name: 'AstParserService',
        kind: 'class',
        startLine: 25,
        endLine: 250,
        isExported: true,
        children: [
          { name: 'indexProject', kind: 'method', startLine: 103, endLine: 163, isExported: false },
          { name: 'searchSymbols', kind: 'method', startLine: 175, endLine: 204, isExported: false },
        ],
      },
    ],
  });

  files.set(`${projectDir}/server/ast/types.ts`, {
    filePath: `${projectDir}/server/ast/types.ts`,
    mtimeMs: 1000,
    symbols: [
      { name: 'AstSymbolKind', kind: 'type_alias', startLine: 1, endLine: 10, isExported: true },
      { name: 'AstSymbol', kind: 'interface', startLine: 12, endLine: 23, isExported: true },
      { name: 'FileSymbolIndex', kind: 'interface', startLine: 25, endLine: 29, isExported: true },
    ],
  });

  files.set(`${projectDir}/src/utils/helpers.ts`, {
    filePath: `${projectDir}/src/utils/helpers.ts`,
    mtimeMs: 1000,
    symbols: [
      { name: 'formatOutput', kind: 'function', startLine: 5, endLine: 15, isExported: true },
      { name: 'parseInput', kind: 'function', startLine: 17, endLine: 30, isExported: true },
    ],
  });

  files.set(`${projectDir}/server/__tests__/work-task-service.test.ts`, {
    filePath: `${projectDir}/server/__tests__/work-task-service.test.ts`,
    mtimeMs: 1000,
    symbols: [{ name: 'createMockProcessManager', kind: 'function', startLine: 60, endLine: 85, isExported: false }],
  });

  return files;
}

/**
 * Build a mock Bun.spawn result that mimics the real API.
 * The service reads .stderr, .stdout via `new Response(proc.stderr).text()`,
 * and .exited as a Promise<number>.
 */
export function makeMockProc(result: { exitCode: number; stdout: string; stderr: string }) {
  // Use ReadableStream directly instead of Blob.stream() for cross-version Bun compat.
  // Blob.stream() can fail when multiple streams are consumed concurrently via
  // new Response(stream).text() in some Bun versions (e.g. 1.3.8 in CI).
  const makeStream = (text: string) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
  return {
    stdout: makeStream(result.stdout),
    stderr: makeStream(result.stderr),
    exited: Promise.resolve(result.exitCode),
    pid: 12345,
    kill: () => {},
  };
}

/**
 * Create a mock ProcessManager that records calls and allows
 * us to simulate session completion via subscribe callbacks.
 *
 * Accepts a subscribeCallbacks map that is populated as subscriptions are added.
 */
export function createMockProcessManager(
  subscribeCallbacks: Map<string, Set<(sid: string, event: ClaudeStreamEvent) => void>>,
): ProcessManager {
  return {
    startProcess: mock(() => {}),
    stopProcess: mock(() => {}),
    isRunning: mock(() => false),
    subscribe: mock((sessionId: string, cb: (sid: string, event: ClaudeStreamEvent) => void) => {
      let cbs = subscribeCallbacks.get(sessionId);
      if (!cbs) {
        cbs = new Set();
        subscribeCallbacks.set(sessionId, cbs);
      }
      cbs.add(cb);
    }),
    unsubscribe: mock((sessionId: string, cb: (sid: string, event: ClaudeStreamEvent) => void) => {
      subscribeCallbacks.get(sessionId)?.delete(cb);
    }),
    // Stubs for other ProcessManager methods that aren't used by WorkTaskService
    subscribeAll: mock(() => {}),
    unsubscribeAll: mock(() => {}),
    getMemoryStats: mock(() => ({
      processes: 0,
      warmProcesses: 0,
      subscribers: 0,
      sessionMeta: 0,
      pausedSessions: 0,
      sessionTimeouts: 0,
      stableTimers: 0,
      keepAliveTimers: 0,
      globalSubscribers: 0,
    })),
    cleanupSessionState: mock(() => {}),
    shutdown: mock(() => {}),
  } as unknown as ProcessManager;
}

/**
 * Factory that returns a simulateSessionEnd function bound to the given subscribeCallbacks.
 * Simulate a session completing by firing events to all subscribers.
 * This mimics what ProcessManager does when a Claude session ends.
 */
export function makeSimulateSessionEnd(
  subscribeCallbacks: Map<string, Set<(sid: string, event: ClaudeStreamEvent) => void>>,
): (sessionId: string, output: string) => void {
  return (sessionId: string, output: string) => {
    const cbs = subscribeCallbacks.get(sessionId);
    if (!cbs) return;

    // First send assistant content
    if (output) {
      for (const cb of cbs) {
        cb(sessionId, {
          type: 'assistant',
          message: { role: 'assistant', content: output },
        });
      }
    }

    // Then send result event
    // Copy the set since callbacks may unsubscribe themselves
    const cbsCopy = new Set(cbs);
    for (const cb of cbsCopy) {
      cb(sessionId, { type: 'result', total_cost_usd: 0 });
    }
  };
}
