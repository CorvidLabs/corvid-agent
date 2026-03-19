import { describe, test, expect } from 'bun:test';
import {
    filePathPriority,
    tokenizeDescription,
    STOP_WORDS,
    PRIORITY_DIRS,
    REPO_MAP_MAX_LINES,
    generateRepoMap,
    extractRelevantSymbols,
} from '../work/repo-map';
import type { AstParserService } from '../ast/service';
import type { AstSymbol, FileSymbolIndex, ProjectSymbolIndex } from '../ast/types';

// ── filePathPriority ────────────────────────────────────────────────────

describe('filePathPriority', () => {
    test('returns 1 for src/ prefixed files', () => {
        expect(filePathPriority('src/index.ts')).toBe(1);
        expect(filePathPriority('src/utils/helper.ts')).toBe(1);
    });

    test('returns 1 for server/ prefixed files', () => {
        expect(filePathPriority('server/routes/api.ts')).toBe(1);
    });

    test('returns 1 for lib/ prefixed files', () => {
        expect(filePathPriority('lib/utils.ts')).toBe(1);
    });

    test('returns 1 for packages/ prefixed files', () => {
        expect(filePathPriority('packages/core/index.ts')).toBe(1);
    });

    test('returns 3 for __tests__ files', () => {
        expect(filePathPriority('src/__tests__/foo.test.ts')).toBe(3);
        expect(filePathPriority('__tests__/bar.ts')).toBe(3);
    });

    test('returns 3 for .test. files', () => {
        expect(filePathPriority('utils.test.ts')).toBe(3);
        expect(filePathPriority('foo/bar.test.js')).toBe(3);
    });

    test('returns 3 for .spec. files', () => {
        expect(filePathPriority('utils.spec.ts')).toBe(3);
        expect(filePathPriority('foo/bar.spec.js')).toBe(3);
    });

    test('returns 2 for other files', () => {
        expect(filePathPriority('config/settings.ts')).toBe(2);
        expect(filePathPriority('README.md')).toBe(2);
        expect(filePathPriority('scripts/build.sh')).toBe(2);
    });

    test('test files take priority over source dirs', () => {
        // A test file inside src/ should be 3 (test), not 1 (source)
        expect(filePathPriority('src/__tests__/foo.ts')).toBe(3);
        expect(filePathPriority('src/utils.test.ts')).toBe(3);
    });
});

// ── tokenizeDescription ─────────────────────────────────────────────────

describe('tokenizeDescription', () => {
    test('extracts words longer than 2 chars', () => {
        const tokens = tokenizeDescription('a big function here');
        expect(tokens).toContain('big');
        expect(tokens).toContain('function');
        expect(tokens).toContain('here');
        expect(tokens).not.toContain('a');
    });

    test('filters stop words', () => {
        const tokens = tokenizeDescription('the quick update from database');
        // 'the', 'update', 'from' are stop words
        expect(tokens).not.toContain('the');
        expect(tokens).not.toContain('update');
        expect(tokens).not.toContain('from');
        expect(tokens).toContain('quick');
        expect(tokens).toContain('database');
    });

    test('splits camelCase into parts', () => {
        const tokens = tokenizeDescription('buildWorkPrompt');
        expect(tokens).toContain('buildworkprompt');
        expect(tokens).toContain('build');
        expect(tokens).toContain('work');
        expect(tokens).toContain('prompt');
    });

    test('handles empty string', () => {
        expect(tokenizeDescription('')).toEqual([]);
    });

    test('handles string with only stop words', () => {
        expect(tokenizeDescription('the and for with')).toEqual([]);
    });

    test('deduplicates tokens', () => {
        const tokens = tokenizeDescription('error error error');
        const errorCount = tokens.filter(t => t === 'error').length;
        expect(errorCount).toBe(1);
    });

    test('splits on non-alphanumeric boundaries', () => {
        const tokens = tokenizeDescription('repo-map: generate symbols');
        expect(tokens).toContain('repo');
        expect(tokens).toContain('map');
        expect(tokens).toContain('generate');
        expect(tokens).toContain('symbols');
    });
});

// ── Constants ───────────────────────────────────────────────────────────

describe('STOP_WORDS', () => {
    test('contains common words', () => {
        expect(STOP_WORDS.has('the')).toBe(true);
        expect(STOP_WORDS.has('and')).toBe(true);
        expect(STOP_WORDS.has('for')).toBe(true);
        expect(STOP_WORDS.has('with')).toBe(true);
        expect(STOP_WORDS.has('update')).toBe(true);
        expect(STOP_WORDS.has('create')).toBe(true);
    });

    test('is a Set', () => {
        expect(STOP_WORDS).toBeInstanceOf(Set);
    });
});

describe('PRIORITY_DIRS', () => {
    test('includes expected directories', () => {
        expect(PRIORITY_DIRS).toContain('src/');
        expect(PRIORITY_DIRS).toContain('server/');
        expect(PRIORITY_DIRS).toContain('lib/');
        expect(PRIORITY_DIRS).toContain('packages/');
    });
});

describe('REPO_MAP_MAX_LINES', () => {
    test('is 200', () => {
        expect(REPO_MAP_MAX_LINES).toBe(200);
    });
});

// ── generateRepoMap (with mocked AST service) ──────────────────────────

describe('generateRepoMap', () => {
    function createMockAstService(files: Map<string, FileSymbolIndex>): AstParserService {
        return {
            indexProject: async () => ({ files } as unknown as ProjectSymbolIndex),
            searchSymbols: () => [],
            getProjectIndex: () => null,
        } as unknown as AstParserService;
    }

    test('returns null when no exported symbols', async () => {
        const files = new Map<string, FileSymbolIndex>();
        files.set('/project/src/empty.ts', {
            filePath: '/project/src/empty.ts',
            symbols: [{ name: 'internal', kind: 'function', isExported: false, startLine: 1, endLine: 5 }],
        } as unknown as FileSymbolIndex);

        const result = await generateRepoMap(createMockAstService(files), '/project');
        expect(result).toBeNull();
    });

    test('returns formatted map with exported symbols', async () => {
        const files = new Map<string, FileSymbolIndex>();
        files.set('/project/src/utils.ts', {
            filePath: '/project/src/utils.ts',
            symbols: [
                { name: 'helper', kind: 'function', isExported: true, startLine: 1, endLine: 10 } as AstSymbol,
            ],
        } as unknown as FileSymbolIndex);

        const result = await generateRepoMap(createMockAstService(files), '/project');
        expect(result).not.toBeNull();
        expect(result).toContain('utils.ts');
        expect(result).toContain('function helper');
        expect(result).toContain('[1-10]');
    });

    test('returns null when indexProject throws', async () => {
        const service = {
            indexProject: async () => { throw new Error('fail'); },
        } as unknown as AstParserService;

        const result = await generateRepoMap(service, '/project');
        expect(result).toBeNull();
    });

    test('sorts source dirs before test files', async () => {
        const files = new Map<string, FileSymbolIndex>();
        const sym: AstSymbol = { name: 'fn', kind: 'function', isExported: true, startLine: 1, endLine: 2 } as AstSymbol;
        files.set('/project/test/foo.test.ts', { filePath: '/project/test/foo.test.ts', symbols: [sym] } as unknown as FileSymbolIndex);
        files.set('/project/src/bar.ts', { filePath: '/project/src/bar.ts', symbols: [sym] } as unknown as FileSymbolIndex);

        const result = await generateRepoMap(createMockAstService(files), '/project');
        expect(result).not.toBeNull();
        const srcIdx = result!.indexOf('src');
        const testIdx = result!.indexOf('test');
        expect(srcIdx).toBeLessThan(testIdx);
    });

    test('includes class methods as children', async () => {
        const files = new Map<string, FileSymbolIndex>();
        files.set('/project/src/service.ts', {
            filePath: '/project/src/service.ts',
            symbols: [{
                name: 'MyService',
                kind: 'class',
                isExported: true,
                startLine: 1,
                endLine: 50,
                children: [
                    { name: 'doWork', kind: 'function', isExported: false, startLine: 5, endLine: 20 } as AstSymbol,
                ],
            } as AstSymbol],
        } as unknown as FileSymbolIndex);

        const result = await generateRepoMap(createMockAstService(files), '/project');
        expect(result).toContain('class MyService');
        expect(result).toContain('doWork');
    });
});

// ── extractRelevantSymbols (with mocked AST service) ────────────────────

describe('extractRelevantSymbols', () => {
    test('returns null for empty description', () => {
        const service = {
            searchSymbols: () => [],
            getProjectIndex: () => null,
        } as unknown as AstParserService;

        const result = extractRelevantSymbols(service, '/project', '');
        expect(result).toBeNull();
    });

    test('returns null when no matches found', () => {
        const service = {
            searchSymbols: () => [],
            getProjectIndex: () => ({ files: new Map() }),
        } as unknown as AstParserService;

        const result = extractRelevantSymbols(service, '/project', 'database connection pooling');
        expect(result).toBeNull();
    });

    test('returns formatted symbols when matches found', () => {
        const sym: AstSymbol = { name: 'processTask', kind: 'function', isExported: true, startLine: 10, endLine: 30 } as AstSymbol;
        const files = new Map<string, FileSymbolIndex>();
        files.set('/project/src/tasks.ts', {
            filePath: '/project/src/tasks.ts',
            symbols: [sym],
        } as unknown as FileSymbolIndex);

        const service = {
            searchSymbols: () => [sym],
            getProjectIndex: () => ({ files }),
        } as unknown as AstParserService;

        const result = extractRelevantSymbols(service, '/project', 'process task queue');
        expect(result).not.toBeNull();
        expect(result).toContain('function processTask');
        expect(result).toContain('[10-30]');
    });
});
