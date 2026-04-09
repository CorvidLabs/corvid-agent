/**
 * MCP tool handler for cross-platform contact identity lookup.
 *
 * Lookup order:
 *   1. Exact name match (case-insensitive) or platform ID match in contacts DB
 *   2. Partial (LIKE) name match in contacts DB
 *   3. Memory search (local SQLite + on-chain fallback) for `user-*` keys
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { searchMemories } from '../../db/agent-memories';
import {
  type Contact,
  type ContactPlatform,
  findContactByName,
  findContactByPlatformId,
  listContacts,
} from '../../db/contacts';
import { createLogger } from '../../lib/logger';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

const log = createLogger('McpToolHandlers');

const VALID_PLATFORMS = new Set(['discord', 'algochat', 'github']);

/**
 * Search agent memories for contact-like info matching a name.
 * Returns formatted memory results or null if nothing found.
 */
async function searchMemoryForContact(ctx: McpToolContext, name: string): Promise<string | null> {
  // Search local SQLite memories
  const memories = searchMemories(ctx.db, ctx.agentId, name);
  const contactMemories = memories.filter((m) => m.key.startsWith('user-'));

  if (contactMemories.length > 0) {
    const lines = contactMemories.map((m) => `[memory: ${m.key}] ${m.content}`);
    return lines.join('\n\n');
  }

  // Fallback: search on-chain memories
  try {
    const onChainResults = await ctx.agentMessenger.readOnChainMemories(ctx.agentId, ctx.serverMnemonic, ctx.network, {
      limit: 10,
      search: name,
    });
    const contactResults = onChainResults.filter((m) => m.key.startsWith('user-'));
    if (contactResults.length > 0) {
      const lines = contactResults.map((m) => `[on-chain memory: ${m.key}] ${m.content}`);
      return lines.join('\n\n');
    }
  } catch (err) {
    log.debug('Memory fallback search failed during contact lookup', {
      name,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

export async function handleLookupContact(
  ctx: McpToolContext,
  args: { name?: string; platform?: string; platform_id?: string },
): Promise<CallToolResult> {
  try {
    let contact: Contact | null = null;

    if (args.name) {
      // Step 1: Exact name match
      contact = findContactByName(ctx.db, '', args.name);

      // Step 2: Partial (LIKE) match
      if (!contact) {
        const { contacts } = listContacts(ctx.db, '', { search: args.name, limit: 5 });
        if (contacts.length === 1) {
          // Unique partial match — treat as found
          contact = findContactByName(ctx.db, '', contacts[0].displayName);
        } else if (contacts.length > 1) {
          const names = contacts.map((c) => c.displayName).join(', ');
          return textResult(`Multiple contacts match "${args.name}": ${names}. Please be more specific.`);
        }
      }
    } else if (args.platform && args.platform_id) {
      if (!VALID_PLATFORMS.has(args.platform)) {
        return errorResult(`Invalid platform "${args.platform}". Must be discord, algochat, or github.`);
      }
      contact = findContactByPlatformId(ctx.db, '', args.platform as ContactPlatform, args.platform_id);
    } else {
      return errorResult('Provide either name or platform+platform_id.');
    }

    if (contact) {
      return textResult(formatContact(contact));
    }

    // Step 3: Memory fallback — search for contact info in agent memories
    if (args.name) {
      const memoryResult = await searchMemoryForContact(ctx, args.name);
      if (memoryResult) {
        return textResult(
          `No contact in database, but found info in memory:\n\n${memoryResult}\n\n` +
            '(Tip: use corvid_save_contact to add this person to the contacts database for faster lookup next time.)',
        );
      }
    }

    return textResult('No contact found matching the query.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP lookup_contact failed', { error: message });
    return errorResult(`Failed to lookup contact: ${message}`);
  }
}

function formatContact(contact: Contact): string {
  const lines = [`Contact: ${contact.displayName} (${contact.id})`];
  if (contact.notes) {
    lines.push(`  Notes: ${contact.notes}`);
  }
  if (contact.links && contact.links.length > 0) {
    lines.push('  Platform Links:');
    for (const link of contact.links) {
      const verified = link.verified ? ' [verified]' : '';
      lines.push(`    - ${link.platform}: ${link.platformId}${verified}`);
    }
  } else {
    lines.push('  No platform links.');
  }
  lines.push(`  Created: ${contact.createdAt}`);
  return lines.join('\n');
}
