/**
 * MCP tool handler for cross-platform contact identity lookup.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import {
    findContactByName,
    findContactByPlatformId,
    type ContactPlatform,
    type Contact,
} from '../../db/contacts';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

const VALID_PLATFORMS = new Set(['discord', 'algochat', 'github']);

export async function handleLookupContact(
    ctx: McpToolContext,
    args: { name?: string; platform?: string; platform_id?: string },
): Promise<CallToolResult> {
    try {
        let contact: Contact | null = null;

        if (args.name) {
            contact = findContactByName(ctx.db, '', args.name);
        } else if (args.platform && args.platform_id) {
            if (!VALID_PLATFORMS.has(args.platform)) {
                return errorResult(`Invalid platform "${args.platform}". Must be discord, algochat, or github.`);
            }
            contact = findContactByPlatformId(ctx.db, '', args.platform as ContactPlatform, args.platform_id);
        } else {
            return errorResult('Provide either name or platform+platform_id.');
        }

        if (!contact) {
            return textResult('No contact found matching the query.');
        }

        return textResult(formatContact(contact));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP lookup_contact failed', { error: message });
        return errorResult(`Failed to lookup contact: ${message}`);
    }
}

function formatContact(contact: Contact): string {
    const lines = [
        `Contact: ${contact.displayName} (${contact.id})`,
    ];
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
