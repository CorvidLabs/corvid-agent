import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import {
    getBalance,
    getCreditConfig,
    grantCredits,
    updateCreditConfig,
} from '../../db/credits';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleCheckCredits(
    ctx: McpToolContext,
    args: { wallet_address?: string },
): Promise<CallToolResult> {
    try {
        const walletAddress = args.wallet_address;
        if (!walletAddress) {
            return errorResult('No wallet address provided. Use this tool with a wallet address to check credits.');
        }

        const balance = getBalance(ctx.db, walletAddress);
        const config = getCreditConfig(ctx.db);

        const lines = [
            `Credit Balance for ${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}:`,
            `  Available: ${balance.available} credits`,
            `  Reserved: ${balance.reserved} credits`,
            `  Total: ${balance.credits} credits`,
            `  Lifetime purchased: ${balance.totalPurchased}`,
            `  Lifetime consumed: ${balance.totalConsumed}`,
            ``,
            `Rates: 1 ALGO = ${config.creditsPerAlgo} credits, 1 turn = ${config.creditsPerTurn} credit(s)`,
            `Low credit threshold: ${config.lowCreditThreshold}`,
        ];

        return textResult(lines.join('\n'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP check_credits failed', { error: message });
        return errorResult(`Failed to check credits: ${message}`);
    }
}

export async function handleGrantCredits(
    ctx: McpToolContext,
    args: { wallet_address: string; amount: number; reason?: string },
): Promise<CallToolResult> {
    try {
        if (args.amount <= 0 || args.amount > 1_000_000) {
            return errorResult('Amount must be between 1 and 1,000,000');
        }

        grantCredits(ctx.db, args.wallet_address, args.amount, args.reason ?? 'agent_grant');
        const balance = getBalance(ctx.db, args.wallet_address);

        return textResult(
            `Granted ${args.amount} credits to ${args.wallet_address.slice(0, 8)}...\n` +
            `New balance: ${balance.available} available (${balance.credits} total)`
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP grant_credits failed', { error: message });
        return errorResult(`Failed to grant credits: ${message}`);
    }
}

export async function handleCreditConfig(
    ctx: McpToolContext,
    args: { key?: string; value?: string },
): Promise<CallToolResult> {
    try {
        if (args.key && args.value) {
            updateCreditConfig(ctx.db, args.key, args.value);
            return textResult(`Credit config updated: ${args.key} = ${args.value}`);
        }

        const config = getCreditConfig(ctx.db);
        const lines = Object.entries(config).map(([k, v]) => `  ${k}: ${v}`);
        return textResult(`Credit Configuration:\n${lines.join('\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP credit_config failed', { error: message });
        return errorResult(`Failed to manage credit config: ${message}`);
    }
}
