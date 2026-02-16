import type { Tree, Node } from 'web-tree-sitter';
import type { AstSymbol, AstSymbolKind, AstLanguage } from './types';

/**
 * Extract navigational symbols from a tree-sitter syntax tree.
 * Uses cursor-based tree walking for robustness across grammar versions.
 */
export function extractSymbols(tree: Tree, lang: AstLanguage): AstSymbol[] {
    const root = tree.rootNode;
    const symbols: AstSymbol[] = [];
    const isTS = lang === 'typescript' || lang === 'tsx';

    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (!node) continue;

        const extracted = extractTopLevelNode(node, isTS);
        if (extracted) {
            symbols.push(...(Array.isArray(extracted) ? extracted : [extracted]));
        }
    }

    return symbols;
}

function extractTopLevelNode(node: Node, isTS: boolean): AstSymbol | AstSymbol[] | null {
    const type = node.type;

    switch (type) {
        case 'function_declaration':
            return extractFunction(node);

        case 'class_declaration':
            return extractClass(node, isTS);

        case 'interface_declaration':
            if (!isTS) return null;
            return extractInterface(node);

        case 'type_alias_declaration':
            if (!isTS) return null;
            return extractTypeAlias(node);

        case 'enum_declaration':
            if (!isTS) return null;
            return extractEnum(node);

        case 'import_statement':
            return extractImport(node);

        case 'export_statement':
            return extractExport(node, isTS);

        case 'lexical_declaration':
            return extractLexicalDeclaration(node, false);

        case 'variable_declaration':
            return extractVariableDeclaration(node, false);

        // Ambient declarations (declare function, declare class, etc.)
        case 'ambient_declaration':
            return extractAmbientDeclaration(node, isTS);

        default:
            return null;
    }
}

function extractFunction(node: Node): AstSymbol {
    const nameNode = node.childForFieldName('name');
    const isExported = hasExportParent(node);
    return {
        name: nameNode?.text ?? '<anonymous>',
        kind: 'function',
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported,
    };
}

function extractClass(node: Node, isTS: boolean): AstSymbol {
    const nameNode = node.childForFieldName('name');
    const isExported = hasExportParent(node);
    const children: AstSymbol[] = [];

    const body = node.childForFieldName('body');
    if (body) {
        for (let i = 0; i < body.namedChildCount; i++) {
            const member = body.namedChild(i);
            if (!member) continue;

            if (member.type === 'method_definition' || member.type === 'method_signature') {
                const mName = member.childForFieldName('name');
                children.push({
                    name: mName?.text ?? '<anonymous>',
                    kind: 'method',
                    startLine: member.startPosition.row + 1,
                    endLine: member.endPosition.row + 1,
                    isExported: false,
                });
            } else if (isTS && (member.type === 'public_field_definition' || member.type === 'property_definition')) {
                const pName = member.childForFieldName('name');
                children.push({
                    name: pName?.text ?? '<anonymous>',
                    kind: 'variable',
                    startLine: member.startPosition.row + 1,
                    endLine: member.endPosition.row + 1,
                    isExported: false,
                });
            }
        }
    }

    return {
        name: nameNode?.text ?? '<anonymous>',
        kind: 'class',
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported,
        children: children.length > 0 ? children : undefined,
    };
}

function extractInterface(node: Node): AstSymbol {
    const nameNode = node.childForFieldName('name');
    const isExported = hasExportParent(node);
    return {
        name: nameNode?.text ?? '<anonymous>',
        kind: 'interface',
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported,
    };
}

function extractTypeAlias(node: Node): AstSymbol {
    const nameNode = node.childForFieldName('name');
    const isExported = hasExportParent(node);
    return {
        name: nameNode?.text ?? '<anonymous>',
        kind: 'type_alias',
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported,
    };
}

function extractEnum(node: Node): AstSymbol {
    const nameNode = node.childForFieldName('name');
    const isExported = hasExportParent(node);
    return {
        name: nameNode?.text ?? '<anonymous>',
        kind: 'enum',
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported,
    };
}

function extractImport(node: Node): AstSymbol {
    // Extract module specifier (the 'from' path)
    const sourceNode = node.childForFieldName('source');
    const moduleSpecifier = sourceNode ? stripQuotes(sourceNode.text) : undefined;

    // Extract imported names
    const importedNames: string[] = [];
    // Walk children looking for import_clause / named_imports
    for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (!child) continue;

        if (child.type === 'import_clause') {
            collectImportedNames(child, importedNames);
        }
    }

    return {
        name: moduleSpecifier ?? '<unknown>',
        kind: 'import',
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported: false,
        moduleSpecifier,
        importedNames: importedNames.length > 0 ? importedNames : undefined,
    };
}

function collectImportedNames(node: Node, names: string[]): void {
    for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (!child) continue;

        if (child.type === 'identifier' || child.type === 'type_identifier') {
            names.push(child.text);
        } else if (child.type === 'named_imports') {
            for (let j = 0; j < child.namedChildCount; j++) {
                const specifier = child.namedChild(j);
                if (!specifier) continue;
                if (specifier.type === 'import_specifier') {
                    const nameNode = specifier.childForFieldName('name');
                    const aliasNode = specifier.childForFieldName('alias');
                    names.push(aliasNode?.text ?? nameNode?.text ?? specifier.text);
                }
            }
        } else if (child.type === 'namespace_import') {
            const nameNode = child.namedChild(0);
            if (nameNode) names.push(`* as ${nameNode.text}`);
        } else {
            // Recurse for other node types
            collectImportedNames(child, names);
        }
    }
}

function extractExport(node: Node, isTS: boolean): AstSymbol | AstSymbol[] | null {
    // export_statement wraps the actual declaration
    // Check for `export { ... }` (re-exports or named exports without declaration)
    const exportClause = findChildByType(node, 'export_clause');
    if (exportClause) {
        const sourceNode = node.childForFieldName('source');
        const moduleSpecifier = sourceNode ? stripQuotes(sourceNode.text) : undefined;
        const exportedNames: string[] = [];

        for (let i = 0; i < exportClause.namedChildCount; i++) {
            const spec = exportClause.namedChild(i);
            if (!spec) continue;
            if (spec.type === 'export_specifier') {
                const nameNode = spec.childForFieldName('name');
                exportedNames.push(nameNode?.text ?? spec.text);
            }
        }

        return {
            name: moduleSpecifier ?? (exportedNames.join(', ') || '<export>'),
            kind: 'export',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            isExported: true,
            moduleSpecifier,
        };
    }

    // Look for a declaration inside the export
    const declaration = node.childForFieldName('declaration');
    if (declaration) {
        return extractDeclarationFromExport(declaration, isTS);
    }

    // export default ...
    const defaultDecl = findChildByType(node, 'function_declaration')
        ?? findChildByType(node, 'class_declaration');
    if (defaultDecl) {
        const extracted = extractTopLevelNode(defaultDecl, isTS);
        if (extracted && !Array.isArray(extracted)) {
            extracted.isExported = true;
            return extracted;
        }
        return extracted;
    }

    // Fallback: export default expression
    return {
        name: 'default',
        kind: 'export',
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported: true,
    };
}

function extractDeclarationFromExport(node: Node, isTS: boolean): AstSymbol | AstSymbol[] | null {
    const type = node.type;

    switch (type) {
        case 'function_declaration': {
            const sym = extractFunction(node);
            sym.isExported = true;
            return sym;
        }
        case 'class_declaration': {
            const sym = extractClass(node, isTS);
            sym.isExported = true;
            return sym;
        }
        case 'interface_declaration': {
            if (!isTS) return null;
            const sym = extractInterface(node);
            sym.isExported = true;
            return sym;
        }
        case 'type_alias_declaration': {
            if (!isTS) return null;
            const sym = extractTypeAlias(node);
            sym.isExported = true;
            return sym;
        }
        case 'enum_declaration': {
            if (!isTS) return null;
            const sym = extractEnum(node);
            sym.isExported = true;
            return sym;
        }
        case 'lexical_declaration':
            return extractLexicalDeclaration(node, true);
        case 'variable_declaration':
            return extractVariableDeclaration(node, true);
        default:
            return null;
    }
}

function extractLexicalDeclaration(node: Node, isExported: boolean): AstSymbol[] {
    const symbols: AstSymbol[] = [];

    for (let i = 0; i < node.namedChildCount; i++) {
        const declarator = node.namedChild(i);
        if (!declarator || declarator.type !== 'variable_declarator') continue;

        const nameNode = declarator.childForFieldName('name');
        const valueNode = declarator.childForFieldName('value');

        // Check if value is an arrow function or function expression
        const isArrowOrFunc = valueNode && (
            valueNode.type === 'arrow_function' ||
            valueNode.type === 'function_expression' ||
            valueNode.type === 'function'
        );

        const kind: AstSymbolKind = isArrowOrFunc ? 'function' : 'variable';

        symbols.push({
            name: nameNode?.text ?? '<anonymous>',
            kind,
            startLine: node.startPosition.row + 1,
            endLine: (valueNode ?? node).endPosition.row + 1,
            isExported,
        });
    }

    return symbols;
}

function extractVariableDeclaration(node: Node, isExported: boolean): AstSymbol[] {
    // var declarations — same structure as lexical
    return extractLexicalDeclaration(node, isExported);
}

function extractAmbientDeclaration(node: Node, isTS: boolean): AstSymbol | AstSymbol[] | null {
    // `declare function ...`, `declare class ...`, etc.
    for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (!child) continue;
        const extracted = extractTopLevelNode(child, isTS);
        if (extracted) return extracted;
    }
    return null;
}

function hasExportParent(node: Node): boolean {
    const parent = node.parent;
    return parent?.type === 'export_statement';
}

function findChildByType(node: Node, type: string): Node | null {
    for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child?.type === type) return child;
    }
    return null;
}

function stripQuotes(text: string): string {
    if ((text.startsWith("'") && text.endsWith("'")) ||
        (text.startsWith('"') && text.endsWith('"'))) {
        return text.slice(1, -1);
    }
    return text;
}
