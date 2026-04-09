/**
 * Tests for /message command tool access policy behavior.
 *
 * Verifies restricted tools for non-admin callers and full access
 * policy for admin callers.
 */
import { describe, expect, test } from 'bun:test';
import {
  ADMIN_MESSAGE_SESSION_PREFIX,
  MESSAGE_BUILTIN_TOOLS,
  MESSAGE_MCP_TOOLS,
  RESTRICTED_MESSAGE_SESSION_PREFIX,
  resolveMessageToolPolicy,
  STAFF_MESSAGE_SESSION_PREFIX,
} from '../discord/command-handlers/message-commands';
import { PermissionLevel } from '../discord/types';

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

  describe('policy resolver', () => {
    test('uses restricted policy for BASIC callers', () => {
      const policy = resolveMessageToolPolicy(
        {
          botToken: 'x',
          channelId: '123',
          allowedUserIds: [],
        },
        PermissionLevel.BASIC,
        '123',
      );
      expect(policy.sessionName).toBe(`${RESTRICTED_MESSAGE_SESSION_PREFIX}123`);
      expect(policy.toolAllowList).toEqual(MESSAGE_BUILTIN_TOOLS);
      expect(policy.mcpToolAllowList).toEqual(MESSAGE_MCP_TOOLS);
      expect(policy.accessLabel).toBe('restricted');
    });

    test('uses full-access policy for ADMIN callers', () => {
      const policy = resolveMessageToolPolicy(
        {
          botToken: 'x',
          channelId: '123',
          allowedUserIds: [],
        },
        PermissionLevel.ADMIN,
        '123',
      );
      expect(policy.sessionName).toBe(`${ADMIN_MESSAGE_SESSION_PREFIX}123`);
      expect(policy.toolAllowList).toBeUndefined();
      expect(policy.mcpToolAllowList).toBeUndefined();
      expect(policy.accessLabel).toBe('full');
    });

    test('uses staff full-access policy for STANDARD callers in trusted channels', () => {
      const policy = resolveMessageToolPolicy(
        {
          botToken: 'x',
          channelId: '123',
          allowedUserIds: [],
          messageFullToolChannelIds: ['123'],
          channelPermissions: { '123': PermissionLevel.STANDARD },
        },
        PermissionLevel.STANDARD,
        '123',
      );
      expect(policy.sessionName).toBe(`${STAFF_MESSAGE_SESSION_PREFIX}123`);
      expect(policy.toolAllowList).toBeUndefined();
      expect(policy.mcpToolAllowList).toBeUndefined();
      expect(policy.accessLabel).toBe('full');
    });

    test('stays restricted when trusted list has no STANDARD+ floor', () => {
      const policy = resolveMessageToolPolicy(
        {
          botToken: 'x',
          channelId: '123',
          allowedUserIds: [],
          messageFullToolChannelIds: ['123'],
          channelPermissions: { '123': PermissionLevel.BASIC },
        },
        PermissionLevel.STANDARD,
        '123',
      );
      expect(policy.sessionName).toBe(`${RESTRICTED_MESSAGE_SESSION_PREFIX}123`);
      expect(policy.toolAllowList).toEqual(MESSAGE_BUILTIN_TOOLS);
      expect(policy.mcpToolAllowList).toEqual(MESSAGE_MCP_TOOLS);
      expect(policy.accessLabel).toBe('restricted');
    });
  });
});
