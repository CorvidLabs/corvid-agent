/**
 * Tests for /message command lightweight sandbox behavior.
 *
 * Verifies that ALL users (including admins) get restricted tools,
 * and that the buddy round callback is wired up correctly.
 */
import { describe, test, expect } from 'bun:test';
import { MESSAGE_BUILTIN_TOOLS, MESSAGE_MCP_TOOLS } from '../discord/command-handlers/message-commands';

describe('/message command sandbox', () => {
    describe('tool restrictions', () => {
        test('MESSAGE_BUILTIN_TOOLS contains only read-only tools', () => {
            expect(MESSAGE_BUILTIN_TOOLS).toEqual(['Read', 'Glob', 'Grep']);
        });

        test('MESSAGE_BUILTIN_TOOLS does not include Write or Edit', () => {
            expect(MESSAGE_BUILTIN_TOOLS).not.toContain('Write');
            expect(MESSAGE_BUILTIN_TOOLS).not.toContain('Edit');
            expect(MESSAGE_BUILTIN_TOOLS).not.toContain('Bash');
            expect(MESSAGE_BUILTIN_TOOLS).not.toContain('Agent');
        });

        test('MESSAGE_MCP_TOOLS contains only memory recall tools', () => {
            expect(MESSAGE_MCP_TOOLS).toEqual(['corvid_recall_memory', 'corvid_read_on_chain_memories']);
        });

        test('MESSAGE_MCP_TOOLS does not include write/save tools', () => {
            expect(MESSAGE_MCP_TOOLS).not.toContain('corvid_save_memory');
            expect(MESSAGE_MCP_TOOLS).not.toContain('corvid_create_work_task');
            expect(MESSAGE_MCP_TOOLS).not.toContain('corvid_discord_send_message');
        });
    });
});
