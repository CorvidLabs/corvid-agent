import { join } from 'node:path';
import { Parser, Language } from 'web-tree-sitter';
import type { AstLanguage } from './types';

let initialized = false;
const languageCache = new Map<AstLanguage, Language>();

const WASM_DIR = join(import.meta.dir, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out');

const LANGUAGE_WASM_FILES: Record<AstLanguage, string> = {
    typescript: 'tree-sitter-typescript.wasm',
    javascript: 'tree-sitter-javascript.wasm',
    tsx: 'tree-sitter-tsx.wasm',
    jsx: 'tree-sitter-javascript.wasm', // JSX uses the JS grammar
};

/**
 * One-time WASM runtime initialization.
 * Must be called before any parsing.
 */
export async function initParser(): Promise<void> {
    if (initialized) return;
    const wasmPath = join(
        import.meta.dir, '..', '..', 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm',
    );
    await Parser.init({
        locateFile: () => wasmPath,
    } as object);
    initialized = true;
}

/**
 * Load and cache a language grammar WASM file.
 */
export async function loadLanguage(lang: AstLanguage): Promise<Language> {
    const cached = languageCache.get(lang);
    if (cached) return cached;

    const wasmFile = LANGUAGE_WASM_FILES[lang];
    const wasmPath = join(WASM_DIR, wasmFile);
    const language = await Language.load(wasmPath);
    languageCache.set(lang, language);
    return language;
}

/**
 * Create a parser configured for the given language.
 */
export async function createParserForLanguage(lang: AstLanguage): Promise<Parser> {
    if (!initialized) {
        throw new Error('Parser not initialized — call initParser() first');
    }
    const language = await loadLanguage(lang);
    const parser = new Parser();
    parser.setLanguage(language);
    return parser;
}

const EXTENSION_MAP: Record<string, AstLanguage> = {
    '.ts': 'typescript',
    '.js': 'javascript',
    '.tsx': 'tsx',
    '.jsx': 'jsx',
    '.mts': 'typescript',
    '.mjs': 'javascript',
    '.cts': 'typescript',
    '.cjs': 'javascript',
};

/**
 * Map a file extension to its AST language, or null if unsupported.
 */
export function languageFromExtension(ext: string): AstLanguage | null {
    return EXTENSION_MAP[ext] ?? null;
}
