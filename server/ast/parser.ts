import { join } from 'node:path';
import { Language, Parser } from 'web-tree-sitter';
import { ValidationError } from '../lib/errors';
import type { AstLanguage } from './types';

let initialized = false;
const languageCache = new Map<AstLanguage, Language>();

const LANGUAGE_WASM_PATHS: Record<AstLanguage, string> = {
  typescript: join(
    import.meta.dir,
    '..',
    '..',
    'node_modules',
    'tree-sitter-typescript',
    'tree-sitter-typescript.wasm',
  ),
  javascript: join(
    import.meta.dir,
    '..',
    '..',
    'node_modules',
    'tree-sitter-javascript',
    'tree-sitter-javascript.wasm',
  ),
  tsx: join(import.meta.dir, '..', '..', 'node_modules', 'tree-sitter-typescript', 'tree-sitter-tsx.wasm'),
  jsx: join(import.meta.dir, '..', '..', 'node_modules', 'tree-sitter-javascript', 'tree-sitter-javascript.wasm'),
};

/**
 * One-time WASM runtime initialization.
 * Must be called before any parsing.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;
  const wasmPath = join(import.meta.dir, '..', '..', 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm');
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

  const wasmPath = LANGUAGE_WASM_PATHS[lang];
  const language = await Language.load(wasmPath);
  languageCache.set(lang, language);
  return language;
}

/**
 * Create a parser configured for the given language.
 */
export async function createParserForLanguage(lang: AstLanguage): Promise<Parser> {
  if (!initialized) {
    throw new ValidationError('Parser not initialized — call initParser() first');
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
