/**
 * MCP tool handler for managing the repo blocklist.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  addToRepoBlocklist,
  type BlocklistSource,
  isRepoBlocked,
  listRepoBlocklist,
  removeFromRepoBlocklist,
} from '../../db/repo-blocklist';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

export async function handleManageRepoBlocklist(
  ctx: McpToolContext,
  args: {
    action: string;
    repo?: string;
    reason?: string;
    source?: string;
  },
): Promise<CallToolResult> {
  const { db } = ctx;

  switch (args.action) {
    case 'list': {
      const entries = listRepoBlocklist(db);
      if (entries.length === 0) {
        return textResult('Repo blocklist is empty — no repos are blocked.');
      }
      const lines = entries.map(
        (e) => `- ${e.repo} (source: ${e.source})${e.reason ? ` — ${e.reason}` : ''}${e.prUrl ? ` [${e.prUrl}]` : ''}`,
      );
      return textResult(`Blocked repos (${entries.length}):\n${lines.join('\n')}`);
    }

    case 'add': {
      if (!args.repo) return errorResult('repo is required for action="add"');
      const entry = addToRepoBlocklist(db, args.repo, {
        reason: args.reason,
        source: (args.source as BlocklistSource) || 'manual',
      });
      return textResult(`Added ${entry.repo} to blocklist (source: ${entry.source}).`);
    }

    case 'remove': {
      if (!args.repo) return errorResult('repo is required for action="remove"');
      const removed = removeFromRepoBlocklist(db, args.repo);
      return removed
        ? textResult(`Removed ${args.repo.toLowerCase()} from blocklist.`)
        : errorResult(`${args.repo} is not in the blocklist.`);
    }

    case 'check': {
      if (!args.repo) return errorResult('repo is required for action="check"');
      const blocked = isRepoBlocked(db, args.repo);
      return textResult(blocked ? `${args.repo} IS blocked.` : `${args.repo} is NOT blocked.`);
    }

    default:
      return errorResult(`Unknown action "${args.action}". Use list, add, remove, or check.`);
  }
}
