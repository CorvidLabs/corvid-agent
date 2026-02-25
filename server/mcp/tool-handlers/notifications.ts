import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import {
    listChannelsForAgent,
    upsertChannel,
    updateChannelEnabled,
    deleteChannel,
    getChannelByAgentAndType,
} from '../../db/notifications';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

const VALID_CHANNEL_TYPES = ['discord', 'telegram', 'github', 'algochat', 'slack'];

export async function handleConfigureNotifications(
    ctx: McpToolContext,
    args: {
        action: 'list' | 'set' | 'enable' | 'disable' | 'remove';
        channel_type?: string;
        config?: Record<string, unknown>;
    },
): Promise<CallToolResult> {
    try {
        switch (args.action) {
            case 'list': {
                const channels = listChannelsForAgent(ctx.db, ctx.agentId);
                if (channels.length === 0) {
                    return textResult(
                        'No notification channels configured.\n\n' +
                        'Available channel types: discord, telegram, github, algochat, slack\n' +
                        'Use action="set" with channel_type and config to add one.',
                    );
                }
                const lines = channels.map((ch) => {
                    const status = ch.enabled ? 'enabled' : 'disabled';
                    const configKeys = Object.keys(ch.config).join(', ') || '(empty)';
                    return `- ${ch.channelType} [${ch.id.slice(0, 8)}] ${status} config: {${configKeys}}`;
                });
                return textResult(`Notification channels:\n\n${lines.join('\n')}`);
            }

            case 'set': {
                if (!args.channel_type) {
                    return errorResult('channel_type is required for action "set"');
                }
                if (!VALID_CHANNEL_TYPES.includes(args.channel_type)) {
                    return errorResult(`Invalid channel_type "${args.channel_type}". Use: ${VALID_CHANNEL_TYPES.join(', ')}`);
                }
                if (!args.config || Object.keys(args.config).length === 0) {
                    return errorResult('config is required for action "set"');
                }
                const channel = upsertChannel(ctx.db, ctx.agentId, args.channel_type, args.config);
                return textResult(
                    `Channel "${args.channel_type}" configured.\n` +
                    `  ID: ${channel.id}\n` +
                    `  Enabled: ${channel.enabled}\n` +
                    `  Config keys: ${Object.keys(channel.config).join(', ')}`,
                );
            }

            case 'enable': {
                if (!args.channel_type) {
                    return errorResult('channel_type is required for action "enable"');
                }
                const ch = getChannelByAgentAndType(ctx.db, ctx.agentId, args.channel_type);
                if (!ch) return errorResult(`No "${args.channel_type}" channel configured. Use action="set" first.`);
                updateChannelEnabled(ctx.db, ch.id, true);
                return textResult(`Channel "${args.channel_type}" enabled.`);
            }

            case 'disable': {
                if (!args.channel_type) {
                    return errorResult('channel_type is required for action "disable"');
                }
                const ch = getChannelByAgentAndType(ctx.db, ctx.agentId, args.channel_type);
                if (!ch) return errorResult(`No "${args.channel_type}" channel configured.`);
                updateChannelEnabled(ctx.db, ch.id, false);
                return textResult(`Channel "${args.channel_type}" disabled.`);
            }

            case 'remove': {
                if (!args.channel_type) {
                    return errorResult('channel_type is required for action "remove"');
                }
                const ch = getChannelByAgentAndType(ctx.db, ctx.agentId, args.channel_type);
                if (!ch) return errorResult(`No "${args.channel_type}" channel configured.`);
                deleteChannel(ctx.db, ch.id);
                return textResult(`Channel "${args.channel_type}" removed.`);
            }

            default:
                return errorResult(`Unknown action: ${args.action}. Use list, set, enable, disable, or remove.`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP configure_notifications failed', { error: message });
        return errorResult(`Failed to configure notifications: ${message}`);
    }
}
