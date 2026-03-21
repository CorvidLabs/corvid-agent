import { relative } from 'node:path';
import type { AstParserService } from '../ast/service';
import type { AstSymbol, FileSymbolIndex } from '../ast/types';
import { createLogger } from '../lib/logger';

const log = createLogger('repo-map');

/** Max lines in the repo map to keep it lightweight. */
export const REPO_MAP_MAX_LINES = 200;

/** Directories prioritized in repo map ordering (appear first). */
export const PRIORITY_DIRS = ['src/', 'server/', 'lib/'];

/** Stop words excluded from keyword extraction for symbol search. */
export const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'it', 'be', 'as', 'was', 'were',
    'are', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'not',
    'this', 'that', 'these', 'those', 'if', 'then', 'else', 'when',
    'up', 'out', 'so', 'no', 'we', 'us', 'our', 'my', 'me', 'i',
    'add', 'fix', 'update', 'change', 'make', 'use', 'create', 'new',
    'need', 'want', 'get', 'set', 'all', 'each', 'any', 'into',
    'also', 'about', 'more', 'some', 'only', 'just', 'than', 'such',
]);

/**
 * Priority score for file path ordering in the repo map.
 * Lower score = higher priority. Source dirs come first, test files last.
 */
export function filePathPriority(relPath: string): number {
    if (relPath.includes('__tests__') || relPath.includes('.test.') || relPath.includes('.spec.')) {
        return 3;
    }
    for (const dir of PRIORITY_DIRS) {
        if (relPath.startsWith(dir)) return 1;
    }
    return 2;
}

/**
 * Generate a lightweight repo map showing exported symbols per file,
 * grouped by directory, with line ranges for each symbol.
 * Prioritizes source directories over test files and truncates at REPO_MAP_MAX_LINES.
 * Returns null if AST service is unavailable or indexing fails.
 */
export async function generateRepoMap(
    astParserService: AstParserService,
    projectDir: string,
): Promise<string | null> {
    try {
        const index = await astParserService.indexProject(projectDir);
        const RELEVANT_KINDS = new Set(['function', 'class', 'interface', 'type_alias', 'enum', 'variable']);

        // Collect file entries with relative paths
        const fileEntries: Array<{ relPath: string; fileIndex: FileSymbolIndex }> = [];
        for (const [filePath, fileIndex] of index.files.entries()) {
            const relPath = relative(projectDir, filePath).replaceAll('\\', '/');
            const exported = fileIndex.symbols.filter(
                (s: AstSymbol) => s.isExported && RELEVANT_KINDS.has(s.kind),
            );
            if (exported.length === 0) continue;
            fileEntries.push({ relPath, fileIndex });
        }

        if (fileEntries.length === 0) return null;

        // Sort: prioritize source directories, deprioritize test files
        fileEntries.sort((a, b) => {
            const aScore = filePathPriority(a.relPath);
            const bScore = filePathPriority(b.relPath);
            if (aScore !== bScore) return aScore - bScore;
            return a.relPath.localeCompare(b.relPath);
        });

        // Group files by directory
        const dirGroups = new Map<string, typeof fileEntries>();
        for (const entry of fileEntries) {
            const dir = entry.relPath.includes('/')
                ? entry.relPath.slice(0, entry.relPath.lastIndexOf('/'))
                : '.';
            let group = dirGroups.get(dir);
            if (!group) {
                group = [];
                dirGroups.set(dir, group);
            }
            group.push(entry);
        }

        const lines: string[] = [];
        let lineCount = 0;

        for (const [dir, entries] of dirGroups) {
            if (lineCount >= REPO_MAP_MAX_LINES) break;

            // Add directory header
            lines.push(`\n${dir}/`);
            lineCount++;

            for (const { relPath, fileIndex } of entries) {
                if (lineCount >= REPO_MAP_MAX_LINES) break;

                const exported = fileIndex.symbols.filter(
                    (s: AstSymbol) => s.isExported && RELEVANT_KINDS.has(s.kind),
                );

                const symbolList = exported.map((s: AstSymbol) => {
                    const kindLabel = s.kind === 'type_alias' ? 'type' : s.kind;
                    const lineRange = `[${s.startLine}-${s.endLine}]`;
                    const children = s.children?.filter((c: AstSymbol) => RELEVANT_KINDS.has(c.kind));
                    if (children && children.length > 0) {
                        const methods = children.map((c: AstSymbol) =>
                            `${c.name} [${c.startLine}-${c.endLine}]`,
                        ).join(', ');
                        return `${kindLabel} ${s.name} ${lineRange} { ${methods} }`;
                    }
                    return `${kindLabel} ${s.name} ${lineRange}`;
                });

                const fileName = relPath.includes('/')
                    ? relPath.slice(relPath.lastIndexOf('/') + 1)
                    : relPath;
                lines.push(`  ${fileName}: ${symbolList.join(', ')}`);
                lineCount++;
            }
        }

        if (lines.length === 0) return null;

        let result = lines.join('\n') + '\n';
        if (lineCount >= REPO_MAP_MAX_LINES) {
            result += `\n  ... truncated (${fileEntries.length} files total)\n`;
        }
        return result;
    } catch (err) {
        log.warn('Failed to generate repo map', {
            projectDir,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/**
 * Extract symbols from the project index that are relevant to the task description.
 * Tokenizes the description into keywords and searches for matching symbols.
 * Returns a formatted section showing relevant files/symbols, or null if none found.
 */
export function extractRelevantSymbols(
    astParserService: AstParserService,
    projectDir: string,
    description: string,
): string | null {
    const keywords = tokenizeDescription(description);
    if (keywords.length === 0) return null;

    const seen = new Set<string>();
    const results: AstSymbol[] = [];

    for (const keyword of keywords) {
        if (results.length >= 20) break;
        const matches = astParserService.searchSymbols(projectDir, keyword, { limit: 10 });
        for (const match of matches) {
            const key = `${match.name}:${match.startLine}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push(match);
            }
            if (results.length >= 20) break;
        }
    }

    if (results.length === 0) return null;

    // Group results by file for readability
    const index = astParserService.getProjectIndex(projectDir);
    if (!index) return null;

    // Build a reverse lookup: symbol → file path
    const symbolToFile = new Map<string, string>();
    for (const [filePath, fileIndex] of index.files.entries()) {
        for (const sym of fileIndex.symbols) {
            const relFile = relative(projectDir, filePath).replaceAll('\\', '/');
            symbolToFile.set(`${sym.name}:${sym.startLine}`, relFile);
            if (sym.children) {
                for (const child of sym.children) {
                    symbolToFile.set(`${child.name}:${child.startLine}`, relFile);
                }
            }
        }
    }

    const fileGroups = new Map<string, AstSymbol[]>();
    for (const sym of results) {
        const file = symbolToFile.get(`${sym.name}:${sym.startLine}`) ?? 'unknown';
        let group = fileGroups.get(file);
        if (!group) {
            group = [];
            fileGroups.set(file, group);
        }
        group.push(sym);
    }

    const lines: string[] = [];
    for (const [file, symbols] of fileGroups) {
        const symDescs = symbols.map((s) => {
            const kindLabel = s.kind === 'type_alias' ? 'type' : s.kind;
            return `${kindLabel} ${s.name} [${s.startLine}-${s.endLine}]`;
        });
        lines.push(`${file}: ${symDescs.join(', ')}`);
    }

    return lines.join('\n');
}

/**
 * Tokenize a task description into meaningful keywords for symbol search.
 * Splits on word boundaries, filters stop words, and extracts camelCase/PascalCase parts.
 */
export function tokenizeDescription(description: string): string[] {
    const tokens = new Set<string>();

    // Split on non-alphanumeric boundaries
    const rawTokens = description.split(/[^a-zA-Z0-9]+/).filter(t => t.length > 0);

    for (const token of rawTokens) {
        const lower = token.toLowerCase();
        if (lower.length < 3 || STOP_WORDS.has(lower)) continue;

        tokens.add(lower);

        // Split camelCase: 'buildWorkPrompt' → ['build', 'Work', 'Prompt']
        const camelParts = token.split(/(?=[A-Z])/).filter(p => p.length >= 3);
        for (const part of camelParts) {
            const partLower = part.toLowerCase();
            if (!STOP_WORDS.has(partLower)) {
                tokens.add(partLower);
            }
        }
    }

    return [...tokens];
}
