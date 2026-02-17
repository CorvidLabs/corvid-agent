export type AstSymbolKind =
    | 'function'
    | 'class'
    | 'interface'
    | 'type_alias'
    | 'enum'
    | 'import'
    | 'export'
    | 'variable'
    | 'method';

export interface AstSymbol {
    name: string;
    kind: AstSymbolKind;
    startLine: number;
    endLine: number;
    isExported: boolean;
    children?: AstSymbol[];
    /** For imports: the module specifier (e.g. './foo') */
    moduleSpecifier?: string;
    /** For imports: the imported names (e.g. ['Foo', 'Bar']) */
    importedNames?: string[];
}

export interface FileSymbolIndex {
    filePath: string;
    mtimeMs: number;
    symbols: AstSymbol[];
}

export interface ProjectSymbolIndex {
    projectDir: string;
    files: Map<string, FileSymbolIndex>;
    lastFullIndexAt: number;
}

export type AstLanguage = 'typescript' | 'javascript' | 'tsx' | 'jsx';
