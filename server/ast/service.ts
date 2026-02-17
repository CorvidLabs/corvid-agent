import { readdir, stat, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createLogger } from '../lib/logger';
import { initParser, createParserForLanguage, languageFromExtension } from './parser';
import { extractSymbols } from './queries';
import type { AstLanguage, AstSymbol, AstSymbolKind, FileSymbolIndex, ProjectSymbolIndex } from './types';

const log = createLogger('AstParser');

const MAX_FILE_SIZE = 512 * 1024; // 512KB

const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
    'coverage', '.turbo', '.cache', '.output', 'out',
    '__pycache__', '.venv', 'vendor',
]);

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.mts', '.mjs', '.cts', '.cjs']);

export interface SearchOptions {
    kinds?: AstSymbolKind[];
    limit?: number;
}

export class AstParserService {
    private initialized = false;
    private projectIndexes = new Map<string, ProjectSymbolIndex>();

    /**
     * Initialize the WASM runtime. Must be called before any parsing.
     */
    async init(): Promise<void> {
        if (this.initialized) return;
        await initParser();
        this.initialized = true;
        log.info('AST parser service initialized');
    }

    /**
     * Parse a single file and return its symbol index, or null if unsupported/unreadable.
     */
    async parseFile(filePath: string): Promise<FileSymbolIndex | null> {
        if (!this.initialized) {
            throw new Error('AstParserService not initialized — call init() first');
        }

        const ext = extname(filePath);
        const lang = languageFromExtension(ext);
        if (!lang) return null;

        try {
            // Read first, then stat — avoids TOCTOU race where file changes between
            // stat (size check) and read (CodeQL js/file-system-race).
            const source = await readFile(filePath, 'utf-8');
            if (Buffer.byteLength(source, 'utf-8') > MAX_FILE_SIZE) {
                log.debug('Skipping large file', { filePath });
                return null;
            }

            const fileStat = await stat(filePath);
            const symbols = await this.parseSource(source, lang);

            return {
                filePath,
                mtimeMs: fileStat.mtimeMs,
                symbols,
            };
        } catch (err) {
            log.debug('Failed to parse file', {
                filePath,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    /**
     * Parse source code and extract symbols.
     */
    async parseSource(source: string, lang: AstLanguage): Promise<AstSymbol[]> {
        if (!this.initialized) {
            throw new Error('AstParserService not initialized — call init() first');
        }

        const parser = await createParserForLanguage(lang);
        try {
            const tree = parser.parse(source);
            if (!tree) return [];

            try {
                return extractSymbols(tree, lang);
            } finally {
                tree.delete();
            }
        } finally {
            parser.delete();
        }
    }

    /**
     * Walk a project directory and build a symbol index for all TS/JS files.
     */
    async indexProject(projectDir: string): Promise<ProjectSymbolIndex> {
        if (!this.initialized) {
            throw new Error('AstParserService not initialized — call init() first');
        }

        const existing = this.projectIndexes.get(projectDir);
        const files = existing?.files ?? new Map<string, FileSymbolIndex>();

        const filePaths = await this.walkDirectory(projectDir);
        let parsed = 0;
        let skipped = 0;

        for (const filePath of filePaths) {
            // Check cache: skip if mtime hasn't changed
            const cached = files.get(filePath);
            if (cached) {
                try {
                    const fileStat = await stat(filePath);
                    if (fileStat.mtimeMs === cached.mtimeMs) {
                        skipped++;
                        continue;
                    }
                } catch {
                    // File may have been deleted — remove from cache
                    files.delete(filePath);
                    continue;
                }
            }

            const index = await this.parseFile(filePath);
            if (index) {
                files.set(filePath, index);
                parsed++;
            }
        }

        // Remove entries for files that no longer exist
        const fileSet = new Set(filePaths);
        for (const key of files.keys()) {
            if (!fileSet.has(key)) {
                files.delete(key);
            }
        }

        const projectIndex: ProjectSymbolIndex = {
            projectDir,
            files,
            lastFullIndexAt: Date.now(),
        };

        this.projectIndexes.set(projectDir, projectIndex);

        log.info('Project indexed', {
            projectDir,
            totalFiles: files.size,
            parsed,
            cached: skipped,
        });

        return projectIndex;
    }

    /**
     * Get a previously cached project index, or null.
     */
    getProjectIndex(projectDir: string): ProjectSymbolIndex | null {
        return this.projectIndexes.get(projectDir) ?? null;
    }

    /**
     * Search symbols across a project by name, with optional kind filter.
     */
    searchSymbols(projectDir: string, query: string, options?: SearchOptions): AstSymbol[] {
        const index = this.projectIndexes.get(projectDir);
        if (!index) return [];

        const lowerQuery = query.toLowerCase();
        const results: AstSymbol[] = [];
        const limit = options?.limit ?? 100;

        for (const fileIndex of index.files.values()) {
            for (const symbol of fileIndex.symbols) {
                if (results.length >= limit) return results;

                if (matchesSearch(symbol, lowerQuery, options?.kinds)) {
                    results.push(symbol);
                }

                // Also search children (e.g. class methods)
                if (symbol.children) {
                    for (const child of symbol.children) {
                        if (results.length >= limit) return results;
                        if (matchesSearch(child, lowerQuery, options?.kinds)) {
                            results.push(child);
                        }
                    }
                }
            }
        }

        return results;
    }

    /**
     * Invalidate a single file in the cache.
     */
    invalidateFile(projectDir: string, filePath: string): void {
        const index = this.projectIndexes.get(projectDir);
        if (index) {
            index.files.delete(filePath);
        }
    }

    /**
     * Clear the entire project index cache.
     */
    clearProjectIndex(projectDir: string): void {
        this.projectIndexes.delete(projectDir);
    }

    private async walkDirectory(dir: string): Promise<string[]> {
        const result: string[] = [];
        await this.walkRecursive(dir, result);
        return result;
    }

    private async walkRecursive(dir: string, result: string[]): Promise<void> {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (entry.name.startsWith('.') && entry.name !== '.') continue;

            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) continue;
                await this.walkRecursive(join(dir, entry.name), result);
            } else if (entry.isFile()) {
                const ext = extname(entry.name);
                if (SUPPORTED_EXTENSIONS.has(ext)) {
                    result.push(join(dir, entry.name));
                }
            }
        }
    }
}

function matchesSearch(symbol: AstSymbol, lowerQuery: string, kinds?: AstSymbolKind[]): boolean {
    if (kinds && kinds.length > 0 && !kinds.includes(symbol.kind)) return false;
    return symbol.name.toLowerCase().includes(lowerQuery);
}
