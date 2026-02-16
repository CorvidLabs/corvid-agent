import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { languageFromExtension } from '../ast/parser';
import { AstParserService } from '../ast/service';
import type { AstSymbolKind } from '../ast/types';

// ─── languageFromExtension ──────────────────────────────────────────────────

describe('languageFromExtension', () => {
    it('maps .ts to typescript', () => {
        expect(languageFromExtension('.ts')).toBe('typescript');
    });

    it('maps .js to javascript', () => {
        expect(languageFromExtension('.js')).toBe('javascript');
    });

    it('maps .tsx to tsx', () => {
        expect(languageFromExtension('.tsx')).toBe('tsx');
    });

    it('maps .jsx to jsx', () => {
        expect(languageFromExtension('.jsx')).toBe('jsx');
    });

    it('maps .mts to typescript', () => {
        expect(languageFromExtension('.mts')).toBe('typescript');
    });

    it('maps .mjs to javascript', () => {
        expect(languageFromExtension('.mjs')).toBe('javascript');
    });

    it('returns null for unsupported extensions', () => {
        expect(languageFromExtension('.py')).toBeNull();
        expect(languageFromExtension('.rs')).toBeNull();
        expect(languageFromExtension('.css')).toBeNull();
        expect(languageFromExtension('')).toBeNull();
    });
});

// ─── AstParserService ───────────────────────────────────────────────────────

describe('AstParserService', () => {
    let service: AstParserService;
    let tempDir: string;

    beforeAll(async () => {
        service = new AstParserService();
        await service.init();
        tempDir = await mkdtemp(join(tmpdir(), 'ast-test-'));
    });

    afterAll(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    // ─── TypeScript parsing ─────────────────────────────────────────────

    describe('parseFile — TypeScript', () => {
        it('extracts functions, classes, interfaces, types, enums, imports', async () => {
            const filePath = join(tempDir, 'sample.ts');
            await writeFile(filePath, `
import { Foo, Bar } from './foo';
import * as utils from 'node:path';

export function greet(name: string): string {
    return 'Hello ' + name;
}

function privateHelper(): void {}

export class UserService {
    name: string = '';

    async getUser(id: number): Promise<void> {}

    delete(id: number): void {}
}

export interface Config {
    host: string;
    port: number;
}

export type UserId = string | number;

export enum Status {
    Active = 'active',
    Inactive = 'inactive',
}

const PI = 3.14;

export const add = (a: number, b: number) => a + b;
`);

            const result = await service.parseFile(filePath);
            expect(result).not.toBeNull();
            const symbols = result!.symbols;

            // Imports
            const imports = symbols.filter((s) => s.kind === 'import');
            expect(imports.length).toBe(2);
            expect(imports[0].moduleSpecifier).toBe('./foo');
            expect(imports[0].importedNames).toContain('Foo');
            expect(imports[0].importedNames).toContain('Bar');
            expect(imports[1].moduleSpecifier).toBe('node:path');

            // Functions
            const functions = symbols.filter((s) => s.kind === 'function');
            expect(functions.length).toBeGreaterThanOrEqual(3);
            const greet = functions.find((s) => s.name === 'greet');
            expect(greet).toBeDefined();
            expect(greet!.isExported).toBe(true);

            const helper = functions.find((s) => s.name === 'privateHelper');
            expect(helper).toBeDefined();
            expect(helper!.isExported).toBe(false);

            const addFn = functions.find((s) => s.name === 'add');
            expect(addFn).toBeDefined();
            expect(addFn!.isExported).toBe(true);

            // Classes
            const classes = symbols.filter((s) => s.kind === 'class');
            expect(classes.length).toBe(1);
            expect(classes[0].name).toBe('UserService');
            expect(classes[0].isExported).toBe(true);
            expect(classes[0].children).toBeDefined();
            const methods = classes[0].children!.filter((c) => c.kind === 'method');
            expect(methods.length).toBeGreaterThanOrEqual(2);
            expect(methods.map((m) => m.name)).toContain('getUser');

            // Interfaces
            const interfaces = symbols.filter((s) => s.kind === 'interface');
            expect(interfaces.length).toBe(1);
            expect(interfaces[0].name).toBe('Config');
            expect(interfaces[0].isExported).toBe(true);

            // Type aliases
            const types = symbols.filter((s) => s.kind === 'type_alias');
            expect(types.length).toBe(1);
            expect(types[0].name).toBe('UserId');

            // Enums
            const enums = symbols.filter((s) => s.kind === 'enum');
            expect(enums.length).toBe(1);
            expect(enums[0].name).toBe('Status');

            // Variables
            const variables = symbols.filter((s) => s.kind === 'variable');
            expect(variables.some((v) => v.name === 'PI')).toBe(true);
        });

        it('handles export default function', async () => {
            const filePath = join(tempDir, 'default-fn.ts');
            await writeFile(filePath, `
export default function main(): void {
    console.log('main');
}
`);
            const result = await service.parseFile(filePath);
            expect(result).not.toBeNull();
            const fns = result!.symbols.filter((s) => s.kind === 'function');
            expect(fns.length).toBe(1);
            expect(fns[0].name).toBe('main');
            expect(fns[0].isExported).toBe(true);
        });

        it('handles re-exports', async () => {
            const filePath = join(tempDir, 'reexport.ts');
            await writeFile(filePath, `
export { Foo, Bar } from './foo';
export { default as Baz } from './baz';
`);
            const result = await service.parseFile(filePath);
            expect(result).not.toBeNull();
            const exports = result!.symbols.filter((s) => s.kind === 'export');
            expect(exports.length).toBe(2);
            expect(exports[0].moduleSpecifier).toBe('./foo');
        });
    });

    // ─── JavaScript parsing ─────────────────────────────────────────────

    describe('parseFile — JavaScript', () => {
        it('extracts JS functions and classes, no TS-specific symbols', async () => {
            const filePath = join(tempDir, 'sample.js');
            await writeFile(filePath, `
import { readFile } from 'node:fs/promises';

function add(a, b) {
    return a + b;
}

class Calculator {
    add(a, b) { return a + b; }
}

const multiply = (a, b) => a * b;
`);
            const result = await service.parseFile(filePath);
            expect(result).not.toBeNull();
            const symbols = result!.symbols;

            // Should have functions
            const functions = symbols.filter((s) => s.kind === 'function');
            expect(functions.length).toBeGreaterThanOrEqual(2);
            expect(functions.some((f) => f.name === 'add')).toBe(true);
            expect(functions.some((f) => f.name === 'multiply')).toBe(true);

            // Should have class
            const classes = symbols.filter((s) => s.kind === 'class');
            expect(classes.length).toBe(1);
            expect(classes[0].name).toBe('Calculator');

            // Should NOT have TS-specific symbols
            const tsSymbols = symbols.filter((s) =>
                s.kind === 'interface' || s.kind === 'type_alias' || s.kind === 'enum',
            );
            expect(tsSymbols.length).toBe(0);
        });
    });

    // ─── Edge cases ─────────────────────────────────────────────────────

    describe('edge cases', () => {
        it('returns null for unsupported extensions', async () => {
            const filePath = join(tempDir, 'style.css');
            await writeFile(filePath, 'body { color: red; }');
            const result = await service.parseFile(filePath);
            expect(result).toBeNull();
        });

        it('returns empty symbols for empty file', async () => {
            const filePath = join(tempDir, 'empty.ts');
            await writeFile(filePath, '');
            const result = await service.parseFile(filePath);
            expect(result).not.toBeNull();
            expect(result!.symbols).toEqual([]);
        });

        it('returns null for nonexistent file', async () => {
            const result = await service.parseFile(join(tempDir, 'nonexistent.ts'));
            expect(result).toBeNull();
        });

        it('line numbers are 1-based', async () => {
            const filePath = join(tempDir, 'lines.ts');
            await writeFile(filePath, `function first(): void {}
function second(): void {}
function third(): void {}
`);
            const result = await service.parseFile(filePath);
            expect(result).not.toBeNull();
            const fns = result!.symbols.filter((s) => s.kind === 'function');
            expect(fns[0].startLine).toBe(1);
            expect(fns[1].startLine).toBe(2);
            expect(fns[2].startLine).toBe(3);
        });
    });

    // ─── indexProject ───────────────────────────────────────────────────

    describe('indexProject', () => {
        let projectDir: string;

        beforeAll(async () => {
            projectDir = join(tempDir, 'project');
            await mkdir(projectDir, { recursive: true });
            await mkdir(join(projectDir, 'src'), { recursive: true });
            await mkdir(join(projectDir, 'node_modules', 'lib'), { recursive: true });

            await writeFile(join(projectDir, 'src', 'index.ts'), `
export function main(): void {}
export class App {}
`);
            await writeFile(join(projectDir, 'src', 'utils.ts'), `
export function helper(): string { return ''; }
`);
            // This should be skipped (node_modules)
            await writeFile(join(projectDir, 'node_modules', 'lib', 'index.js'), `
function internal() {}
`);
            // Non-supported file
            await writeFile(join(projectDir, 'README.md'), '# Hello');
        });

        it('indexes all supported files, skips node_modules', async () => {
            const index = await service.indexProject(projectDir);
            expect(index.projectDir).toBe(projectDir);
            // Should have 2 files (src/index.ts, src/utils.ts) — not node_modules
            expect(index.files.size).toBe(2);
            expect(index.lastFullIndexAt).toBeGreaterThan(0);
        });

        it('caches project index', async () => {
            const cached = service.getProjectIndex(projectDir);
            expect(cached).not.toBeNull();
            expect(cached!.files.size).toBe(2);
        });

        it('uses mtime cache on re-index', async () => {
            // Re-indexing should be fast since files haven't changed
            const index = await service.indexProject(projectDir);
            expect(index.files.size).toBe(2);
        });

        it('invalidates file cache', async () => {
            const filePath = join(projectDir, 'src', 'index.ts');
            service.invalidateFile(projectDir, filePath);
            const cached = service.getProjectIndex(projectDir);
            expect(cached).not.toBeNull();
            expect(cached!.files.has(filePath)).toBe(false);
        });

        it('clears project index', () => {
            service.clearProjectIndex(projectDir);
            expect(service.getProjectIndex(projectDir)).toBeNull();
        });
    });

    // ─── searchSymbols ──────────────────────────────────────────────────

    describe('searchSymbols', () => {
        let searchDir: string;

        beforeAll(async () => {
            searchDir = join(tempDir, 'search-project');
            await mkdir(searchDir, { recursive: true });

            await writeFile(join(searchDir, 'api.ts'), `
export function getUser(): void {}
export function getUsers(): void {}
export function deleteUser(): void {}
export class UserController {}
export interface UserConfig {}
export type UserId = string;
`);
            await service.indexProject(searchDir);
        });

        it('searches by name substring', () => {
            const results = service.searchSymbols(searchDir, 'user');
            expect(results.length).toBeGreaterThanOrEqual(5);
        });

        it('searches case-insensitively', () => {
            const results = service.searchSymbols(searchDir, 'USER');
            expect(results.length).toBeGreaterThanOrEqual(5);
        });

        it('filters by kind', () => {
            const results = service.searchSymbols(searchDir, 'user', {
                kinds: ['function'],
            });
            expect(results.every((s) => s.kind === 'function')).toBe(true);
            expect(results.length).toBeGreaterThanOrEqual(3);
        });

        it('respects limit', () => {
            const results = service.searchSymbols(searchDir, 'user', { limit: 2 });
            expect(results.length).toBe(2);
        });

        it('returns empty for unknown project', () => {
            const results = service.searchSymbols('/nonexistent', 'test');
            expect(results).toEqual([]);
        });

        it('filters by multiple kinds', () => {
            const results = service.searchSymbols(searchDir, 'user', {
                kinds: ['class', 'interface'] as AstSymbolKind[],
            });
            expect(results.every((s) => s.kind === 'class' || s.kind === 'interface')).toBe(true);
            expect(results.length).toBeGreaterThanOrEqual(2);
        });
    });
});
