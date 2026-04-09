/**
 * MCP tool handlers for memory observations — short-term insights
 * that accumulate relevance and may graduate to long-term ARC-69 memories.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ObservationSource } from '../../../shared/types';
import {
  boostObservation,
  countObservations,
  dismissObservation,
  getGraduationCandidates,
  listObservations,
  recordObservation,
  searchObservations,
} from '../../db/observations';
import { createLogger } from '../../lib/logger';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

const log = createLogger('McpObservations');

const VALID_SOURCES: ObservationSource[] = ['session', 'feedback', 'daily-review', 'health', 'pr-outcome', 'manual'];

export async function handleRecordObservation(
  ctx: McpToolContext,
  args: {
    content: string;
    source?: string;
    source_id?: string;
    suggested_key?: string;
    relevance_score?: number;
  },
): Promise<CallToolResult> {
  try {
    const source =
      args.source && VALID_SOURCES.includes(args.source as ObservationSource)
        ? (args.source as ObservationSource)
        : 'manual';

    const obs = recordObservation(ctx.db, {
      agentId: ctx.agentId,
      source,
      sourceId: args.source_id,
      content: args.content,
      suggestedKey: args.suggested_key,
      relevanceScore: args.relevance_score ?? 1.0,
    });

    return textResult(
      `Observation recorded (id: ${obs.id.slice(0, 8)}..., source: ${obs.source}). ` +
        `Relevance: ${obs.relevanceScore}. ` +
        `Will graduate to long-term memory when score >= 3.0 and accessed >= 2 times. ` +
        (obs.expiresAt ? `Expires: ${obs.expiresAt}` : ''),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to record observation', { error: message });
    return errorResult(`Failed to record observation: ${message}`);
  }
}

export async function handleListObservations(
  ctx: McpToolContext,
  args: {
    status?: string;
    source?: string;
    query?: string;
    limit?: number;
  },
): Promise<CallToolResult> {
  try {
    let observations;

    if (args.query) {
      observations = searchObservations(ctx.db, ctx.agentId, args.query);
    } else {
      observations = listObservations(ctx.db, ctx.agentId, {
        status: args.status as 'active' | 'graduated' | 'expired' | 'dismissed' | undefined,
        source: args.source as ObservationSource | undefined,
        limit: args.limit,
      });
    }

    if (observations.length === 0) {
      return textResult(args.query ? `No observations found matching "${args.query}".` : 'No observations found.');
    }

    const lines = observations.map((o) => {
      const statusTag = o.status === 'graduated' ? `[graduated → ${o.graduatedKey}]` : `[${o.status}]`;
      return (
        `${statusTag} [${o.source}] (score: ${o.relevanceScore}, access: ${o.accessCount}) ${o.content}` +
        (o.suggestedKey ? `\n  suggested key: ${o.suggestedKey}` : '')
      );
    });

    return textResult(
      `Found ${observations.length} observation${observations.length === 1 ? '' : 's'}:\n\n${lines.join('\n\n')}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Failed to list observations', { error: message });
    return errorResult(`Failed to list observations: ${message}`);
  }
}

export async function handleBoostObservation(
  ctx: McpToolContext,
  args: { id: string; score_boost?: number },
): Promise<CallToolResult> {
  try {
    boostObservation(ctx.db, args.id, args.score_boost ?? 1.0);
    return textResult(`Observation ${args.id.slice(0, 8)}... boosted by ${args.score_boost ?? 1.0}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Failed to boost observation: ${message}`);
  }
}

export async function handleDismissObservation(ctx: McpToolContext, args: { id: string }): Promise<CallToolResult> {
  try {
    dismissObservation(ctx.db, args.id);
    return textResult(`Observation ${args.id.slice(0, 8)}... dismissed.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Failed to dismiss observation: ${message}`);
  }
}

export async function handleObservationStats(ctx: McpToolContext): Promise<CallToolResult> {
  try {
    const stats = countObservations(ctx.db, ctx.agentId);
    const candidates = getGraduationCandidates(ctx.db, ctx.agentId);

    const lines = [
      `Observation stats:`,
      `  Active: ${stats.active}`,
      `  Graduated: ${stats.graduated}`,
      `  Expired: ${stats.expired}`,
      `  Dismissed: ${stats.dismissed}`,
      `  Ready to graduate: ${candidates.length}`,
    ];

    if (candidates.length > 0) {
      lines.push('', 'Top graduation candidates:');
      for (const c of candidates.slice(0, 5)) {
        lines.push(`  - [score: ${c.relevanceScore}, access: ${c.accessCount}] ${c.content.slice(0, 80)}...`);
      }
    }

    return textResult(lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Failed to get observation stats: ${message}`);
  }
}
