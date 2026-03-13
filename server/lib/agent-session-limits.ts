/**
 * Per-session rate limiting for agent tool actions.
 *
 * Tracks how many PRs, issues, messages, and escalations an agent has
 * created within a single session, and enforces tier-based caps.
 *
 * @module
 */

import { type AgentTierConfig, getAgentTierConfig } from './agent-tiers';
import { createLogger } from './logger';

const log = createLogger('AgentSessionLimits');

/** Tool names that are rate-limited per session. */
export type RateLimitedAction =
    | 'corvid_github_create_pr'
    | 'corvid_github_create_issue'
    | 'corvid_send_message'
    | 'corvid_ask_owner';

/** Map of action → tier config field that provides the limit. */
const ACTION_LIMIT_KEYS: Record<RateLimitedAction, keyof AgentTierConfig> = {
    corvid_github_create_pr: 'maxPrsPerSession',
    corvid_github_create_issue: 'maxIssuesPerSession',
    corvid_send_message: 'maxMessagesPerSession',
    corvid_ask_owner: 'maxMessagesPerSession',
};

/** Set of tool names that are rate-limited. */
const RATE_LIMITED_TOOLS = new Set<string>(Object.keys(ACTION_LIMIT_KEYS));

/**
 * Per-session usage tracker. Created once per session and passed
 * into the tool execution path.
 */
export class AgentSessionLimiter {
    private usage = new Map<string, number>();
    private tierConfig: AgentTierConfig;
    private sessionId: string;

    constructor(sessionId: string, model: string) {
        this.sessionId = sessionId;
        this.tierConfig = getAgentTierConfig(model);
    }

    /**
     * Check if a tool action is allowed and increment usage if so.
     *
     * @returns null if allowed, or an error message string if rate-limited.
     */
    checkAndIncrement(toolName: string): string | null {
        if (!RATE_LIMITED_TOOLS.has(toolName)) return null;

        const limitKey = ACTION_LIMIT_KEYS[toolName as RateLimitedAction];
        const limit = this.tierConfig[limitKey] as number;
        const current = this.usage.get(toolName) ?? 0;

        if (current >= limit) {
            const msg = `Session rate limit reached for ${toolName}: max ${limit} per session (tier: ${this.tierConfig.tier}, used: ${current})`;
            log.warn(msg, { sessionId: this.sessionId, tool: toolName, tier: this.tierConfig.tier });
            return msg;
        }

        this.usage.set(toolName, current + 1);
        return null;
    }

    /**
     * Check whether the agent can participate in council votes
     * based on their tier.
     */
    get canVoteInCouncil(): boolean {
        return this.tierConfig.canVoteInCouncil;
    }

    /** Get current usage for a tool. */
    getUsage(toolName: string): number {
        return this.usage.get(toolName) ?? 0;
    }

    /** Get the tier config. */
    get tier(): AgentTierConfig {
        return this.tierConfig;
    }
}

/**
 * Check if a tool name is subject to session rate limiting.
 */
export function isSessionRateLimited(toolName: string): boolean {
    return RATE_LIMITED_TOOLS.has(toolName);
}
