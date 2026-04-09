import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { discoverAgent, invokeRemoteAgent } from '../../a2a/client';
import { getBalance } from '../../db/credits';
import { createLogger } from '../../lib/logger';
import { InsufficientCreditsError, MarketplaceService } from '../../marketplace/service';
import type { TrustLevel } from '../../reputation/types';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

const log = createLogger('McpToolHandlers');

const TRUST_ORDER: TrustLevel[] = ['untrusted', 'low', 'medium', 'high', 'verified'];

export async function handleDiscoverAgent(ctx: McpToolContext, args: { url: string }): Promise<CallToolResult> {
  if (!args.url?.trim()) {
    return errorResult('A URL is required (e.g. "https://agent.example.com").');
  }

  try {
    ctx.emitStatus?.(`Discovering agent at ${args.url}...`);

    const card = await discoverAgent(args.url);

    if (!card) {
      return textResult(
        `No A2A Agent Card found at ${args.url}.\n` +
          `The remote server may not support the A2A protocol, or the URL may be incorrect.`,
      );
    }

    const skillLines = (card.skills ?? []).map((s) => `  - ${s.name}: ${s.description} [${s.tags?.join(', ') ?? ''}]`);

    const protocolLines =
      (card as { supportedProtocols?: Array<{ protocol: string; description: string }> }).supportedProtocols?.map(
        (p) => `  - ${p.protocol}: ${p.description}`,
      ) ?? [];

    const lines = [
      `Agent: ${card.name} v${card.version}`,
      `Description: ${card.description}`,
      `URL: ${card.url}`,
      card.provider ? `Provider: ${card.provider.organization} (${card.provider.url})` : null,
      card.documentationUrl ? `Docs: ${card.documentationUrl}` : null,
      ``,
      `Capabilities:`,
      `  Streaming: ${card.capabilities?.streaming ?? false}`,
      `  Push Notifications: ${card.capabilities?.pushNotifications ?? false}`,
      ``,
      `Authentication: ${card.authentication?.schemes?.join(', ') ?? 'none'}`,
      `Input Modes: ${card.defaultInputModes?.join(', ') ?? 'unknown'}`,
      `Output Modes: ${card.defaultOutputModes?.join(', ') ?? 'unknown'}`,
      ``,
      skillLines.length > 0 ? `Skills (${skillLines.length}):` : 'Skills: none',
      ...skillLines,
      protocolLines.length > 0 ? `\nSupported Protocols:` : null,
      ...protocolLines,
    ].filter(Boolean);

    ctx.emitStatus?.(`Discovered ${card.name} with ${card.skills?.length ?? 0} skills`);
    return textResult(lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP discover_agent failed', { error: message });
    return errorResult(`Failed to discover agent: ${message}`);
  }
}

export async function handleInvokeRemoteAgent(
  ctx: McpToolContext,
  args: {
    agent_url: string;
    message: string;
    skill?: string;
    timeout_minutes?: number;
    min_trust?: string;
    listing_id?: string;
  },
): Promise<CallToolResult> {
  if (!args.agent_url?.trim() || !args.message?.trim()) {
    return errorResult('agent_url and message are required.');
  }

  // ── Session invocation budget check ──────────────────────────────────
  if (ctx.invocationBudget) {
    const budgetCheck = ctx.invocationBudget.check(args.agent_url);
    if (!budgetCheck.allowed) {
      log.warn('Remote invocation blocked by session budget', {
        sessionId: ctx.sessionId,
        agentId: ctx.agentId,
        targetUrl: args.agent_url,
        reason: budgetCheck.reason,
      });
      return errorResult('Remote agent invocation is temporarily unavailable. Try again later.');
    }
  }

  // ── Min trust verification ───────────────────────────────────────────
  const minTrust = (args.min_trust as TrustLevel) ?? 'low';
  if (ctx.reputationScorer && TRUST_ORDER.includes(minTrust)) {
    try {
      // Look up by agent URL as a best-effort identifier
      const score = ctx.reputationScorer.computeScore(args.agent_url);
      const targetTrustIdx = TRUST_ORDER.indexOf(score.trustLevel);
      const requiredTrustIdx = TRUST_ORDER.indexOf(minTrust);

      if (targetTrustIdx < requiredTrustIdx) {
        log.warn('Remote invocation blocked by trust check', {
          sessionId: ctx.sessionId,
          agentId: ctx.agentId,
          targetUrl: args.agent_url,
          targetTrust: score.trustLevel,
          requiredTrust: minTrust,
        });
        return errorResult(`Target agent does not meet the required trust level.`);
      }
    } catch (err) {
      // If reputation lookup fails, log but allow (trust system is advisory)
      log.warn('Trust check failed, proceeding with invocation', {
        targetUrl: args.agent_url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    // Pre-invocation credit check for marketplace listings
    if (args.listing_id) {
      const marketplace = new MarketplaceService(ctx.db);
      const listing = marketplace.getListing(args.listing_id);

      if (listing && listing.pricingModel === 'per_use' && listing.priceCredits > 0) {
        const balance = getBalance(ctx.db, ctx.agentId);
        if (balance.available < listing.priceCredits) {
          return errorResult(
            `Insufficient credits to invoke this listing. ` +
              `Required: ${listing.priceCredits}, available: ${balance.available}`,
          );
        }

        ctx.emitStatus?.(`Billing ${listing.priceCredits} credits for listing "${listing.name}"...`);

        try {
          marketplace.recordUse(args.listing_id, ctx.agentId);
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            return errorResult(
              `Insufficient credits to invoke listing "${listing.name}". ` +
                `Required: ${listing.priceCredits} credits.`,
            );
          }
          throw err;
        }
      }
    }

    // Record invocation in budget tracker
    if (ctx.invocationBudget) {
      ctx.invocationBudget.record(args.agent_url);
    }

    ctx.emitStatus?.(`Invoking remote agent at ${args.agent_url}...`);

    const timeoutMs = (args.timeout_minutes ?? 5) * 60 * 1000;

    const result = await invokeRemoteAgent(args.agent_url, args.message, {
      skill: args.skill,
      timeoutMs,
    });

    log.info('Remote agent invocation completed', {
      sessionId: ctx.sessionId,
      agentId: ctx.agentId,
      targetUrl: args.agent_url,
      depth: ctx.depth ?? 1,
      success: result.success,
      taskId: result.taskId,
    });

    if (!result.success) {
      return errorResult(`Remote agent invocation failed: ${result.error ?? 'unknown error'}`);
    }

    ctx.emitStatus?.('Received response from remote agent');
    return textResult(
      `Remote Agent Response (task ${result.taskId}):\n\n${result.responseText ?? '(no response text)'}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP invoke_remote_agent failed', {
      error: message,
      sessionId: ctx.sessionId,
      agentId: ctx.agentId,
      targetUrl: args.agent_url,
    });
    return errorResult(`Failed to invoke remote agent: ${message}`);
  }
}
