import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AstSymbolKind } from '../../ast/types';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { getAgent } from '../../db/agents';
import { getProject } from '../../db/projects';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

/** Resolve the project directory for AST tools: explicit arg → agent's default project. */
function resolveProjectDir(ctx: McpToolContext, explicitDir?: string): string | null {
    if (explicitDir?.trim()) return explicitDir;
    const agent = getAgent(ctx.db, ctx.agentId);
    const projectId = agent?.defaultProjectId;
    if (!projectId) return null;
    const project = getProject(ctx.db, projectId);
    return project?.workingDir ?? null;
}

export async function handleCodeSymbols(
    ctx: McpToolContext,
    args: { project_dir?: string; query: string; kinds?: string[]; limit?: number },
): Promise<CallToolResult> {
    if (!ctx.astParserService) {
        return errorResult('AST parser service is not available.');
    }

    if (!args.query?.trim()) {
        return errorResult('A search query is required.');
    }

    const projectDir = resolveProjectDir(ctx, args.project_dir);
    if (!projectDir) {
        return errorResult('Could not resolve project directory. Provide project_dir or ensure the agent has a default project.');
    }

    try {
        // Ensure the project is indexed (uses cache if already indexed)
        if (!ctx.astParserService.getProjectIndex(projectDir)) {
            ctx.emitStatus?.('Indexing project symbols...');
            await ctx.astParserService.indexProject(projectDir);
        }

        const validKinds = args.kinds?.filter(
            (k): k is AstSymbolKind => ['function', 'class', 'interface', 'type_alias', 'enum', 'import', 'export', 'variable', 'method'].includes(k),
        );

        const results = ctx.astParserService.searchSymbols(projectDir, args.query, {
            kinds: validKinds?.length ? validKinds : undefined,
            limit: args.limit ?? 50,
        });

        if (results.length === 0) {
            return textResult(`No symbols matching "${args.query}" found in ${projectDir}.`);
        }

        const lines = results.map((s) => {
            const exported = s.isExported ? 'export ' : '';
            const children = s.children?.length ? ` (${s.children.length} members)` : '';
            return `${exported}${s.kind} ${s.name} [lines ${s.startLine}-${s.endLine}]${children}`;
        });

        return textResult(`Found ${results.length} symbol(s) matching "${args.query}":\n\n${lines.join('\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP code_symbols failed', { error: message });
        return errorResult(`Failed to search code symbols: ${message}`);
    }
}

export async function handleFindReferences(
    ctx: McpToolContext,
    args: { project_dir?: string; symbol_name: string; limit?: number },
): Promise<CallToolResult> {
    if (!ctx.astParserService) {
        return errorResult('AST parser service is not available.');
    }

    if (!args.symbol_name?.trim()) {
        return errorResult('A symbol_name is required.');
    }

    const projectDir = resolveProjectDir(ctx, args.project_dir);
    if (!projectDir) {
        return errorResult('Could not resolve project directory. Provide project_dir or ensure the agent has a default project.');
    }

    try {
        // Index project for definition lookup
        if (!ctx.astParserService.getProjectIndex(projectDir)) {
            ctx.emitStatus?.('Indexing project symbols...');
            await ctx.astParserService.indexProject(projectDir);
        }

        // Find definitions via AST
        const definitions = ctx.astParserService.searchSymbols(projectDir, args.symbol_name, { limit: 10 });
        const exactDefs = definitions.filter((s) => s.name === args.symbol_name);

        // Find references via grep (text search across all TS/JS files)
        ctx.emitStatus?.(`Searching for references to "${args.symbol_name}"...`);
        const maxResults = args.limit ?? 50;

        const grepProc = Bun.spawn([
            'grep', '-rn', '--include=*.ts', '--include=*.tsx', '--include=*.js', '--include=*.jsx',
            '--exclude-dir=node_modules', '--exclude-dir=dist', '--exclude-dir=.git',
            '-w', args.symbol_name, projectDir,
        ], { stdout: 'pipe', stderr: 'pipe' });

        const grepStdout = await new Response(grepProc.stdout).text();
        await grepProc.exited;

        const referenceLines = grepStdout.trim().split('\n').filter(Boolean);
        const truncated = referenceLines.length > maxResults;
        const displayLines = referenceLines.slice(0, maxResults);

        // Format output
        const sections: string[] = [];

        if (exactDefs.length > 0) {
            const defLines = exactDefs.map((s) => {
                const exported = s.isExported ? 'export ' : '';
                return `  ${exported}${s.kind} ${s.name} [lines ${s.startLine}-${s.endLine}]`;
            });
            sections.push(`Definitions (${exactDefs.length}):\n${defLines.join('\n')}`);
        } else {
            sections.push(`No AST definition found for "${args.symbol_name}" (may be an external import).`);
        }

        if (displayLines.length > 0) {
            // Strip project dir prefix for readability
            const shortLines = displayLines.map((line) =>
                line.startsWith(projectDir) ? line.slice(projectDir.length + 1) : line,
            );
            sections.push(
                `References (${referenceLines.length}${truncated ? `, showing first ${maxResults}` : ''}):\n${shortLines.join('\n')}`,
            );
        } else {
            sections.push(`No text references found for "${args.symbol_name}".`);
        }

        return textResult(sections.join('\n\n'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP find_references failed', { error: message });
        return errorResult(`Failed to find references: ${message}`);
    }
}
