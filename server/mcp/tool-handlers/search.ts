import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { braveWebSearch, braveMultiSearch } from '../../lib/web-search';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleWebSearch(
    ctx: McpToolContext,
    args: { query: string; count?: number; freshness?: string },
): Promise<CallToolResult> {
    if (!args.query?.trim()) {
        return errorResult('A search query is required.');
    }

    try {
        ctx.emitStatus?.(`Searching the web for "${args.query}"...`);

        const results = await braveWebSearch(args.query, {
            count: args.count,
            freshness: args.freshness as 'pd' | 'pw' | 'pm' | 'py' | undefined,
        });

        if (results.length === 0) {
            return textResult(
                'No results found. This may mean BRAVE_SEARCH_API_KEY is not configured, or the query returned no matches.',
            );
        }

        const lines = results.map(
            (r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}${r.age ? ` (${r.age})` : ''}`,
        );

        ctx.emitStatus?.(`Found ${results.length} results`);
        return textResult(`Web search results for "${args.query}":\n\n${lines.join('\n\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP web_search failed', { error: message });
        return errorResult(`Web search failed: ${message}`);
    }
}

/** Default sub-query suffixes appended to the topic for deep research. */
const DEEP_RESEARCH_ANGLES = ['benefits', 'challenges', 'examples', 'latest news'];

export async function handleDeepResearch(
    ctx: McpToolContext,
    args: { topic: string; sub_questions?: string[] },
): Promise<CallToolResult> {
    if (!args.topic?.trim()) {
        return errorResult('A research topic is required.');
    }

    try {
        // Build query list: main topic + sub-questions (up to 5 total)
        const subQuestions = args.sub_questions?.length
            ? args.sub_questions
            : DEEP_RESEARCH_ANGLES.map((angle) => `${args.topic} ${angle}`);

        const queries = [args.topic, ...subQuestions].slice(0, 5);

        ctx.emitStatus?.(`Researching "${args.topic}" with ${queries.length} queries...`);

        const grouped = await braveMultiSearch(queries, { count: 5 });

        if (grouped.length === 0 || grouped.every((g) => g.results.length === 0)) {
            return textResult(
                'No results found. This may mean BRAVE_SEARCH_API_KEY is not configured, or the queries returned no matches.',
            );
        }

        const sections: string[] = [];
        let totalResults = 0;

        for (const group of grouped) {
            if (group.results.length === 0) continue;
            totalResults += group.results.length;
            const items = group.results.map(
                (r, i) => `  ${i + 1}. **${r.title}**\n     ${r.url}\n     ${r.description}${r.age ? ` (${r.age})` : ''}`,
            );
            sections.push(`### ${group.query}\n\n${items.join('\n\n')}`);
        }

        ctx.emitStatus?.(`Research complete — ${totalResults} results across ${grouped.length} queries`);
        return textResult(
            `# Deep Research: ${args.topic}\n\n` +
            `*${totalResults} results from ${queries.length} queries (deduplicated)*\n\n` +
            sections.join('\n\n---\n\n'),
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP deep_research failed', { error: message });
        return errorResult(`Deep research failed: ${message}`);
    }
}
