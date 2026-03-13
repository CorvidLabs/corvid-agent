import { describe, it, expect } from 'bun:test';
import { AgentSessionLimiter, isSessionRateLimited } from '../lib/agent-session-limits';

describe('AgentSessionLimiter', () => {
    describe('checkAndIncrement', () => {
        it('allows first call within limit', () => {
            const limiter = new AgentSessionLimiter('sess-1', 'llama3.1:70b');
            expect(limiter.checkAndIncrement('corvid_github_create_pr')).toBeNull();
        });

        it('blocks calls exceeding tier limit', () => {
            // limited tier: maxPrsPerSession = 1
            const limiter = new AgentSessionLimiter('sess-2', 'phi3:3.8b');
            expect(limiter.checkAndIncrement('corvid_github_create_pr')).toBeNull();
            const error = limiter.checkAndIncrement('corvid_github_create_pr');
            expect(error).not.toBeNull();
            expect(error).toContain('rate limit');
            expect(error).toContain('limited');
        });

        it('allows standard tier more PRs than limited', () => {
            const limiter = new AgentSessionLimiter('sess-3', 'llama3.1:70b');
            // standard tier: maxPrsPerSession = 2
            expect(limiter.checkAndIncrement('corvid_github_create_pr')).toBeNull();
            expect(limiter.checkAndIncrement('corvid_github_create_pr')).toBeNull();
            expect(limiter.checkAndIncrement('corvid_github_create_pr')).not.toBeNull();
        });

        it('allows high tier the most PRs', () => {
            const limiter = new AgentSessionLimiter('sess-4', 'claude-3-opus');
            // high tier: maxPrsPerSession = 5
            for (let i = 0; i < 5; i++) {
                expect(limiter.checkAndIncrement('corvid_github_create_pr')).toBeNull();
            }
            expect(limiter.checkAndIncrement('corvid_github_create_pr')).not.toBeNull();
        });

        it('does not rate-limit non-listed tools', () => {
            const limiter = new AgentSessionLimiter('sess-5', 'phi3:3.8b');
            for (let i = 0; i < 100; i++) {
                expect(limiter.checkAndIncrement('read_file')).toBeNull();
            }
        });

        it('tracks message sending limits', () => {
            const limiter = new AgentSessionLimiter('sess-6', 'phi3:3.8b');
            // limited tier: maxMessagesPerSession = 5
            for (let i = 0; i < 5; i++) {
                expect(limiter.checkAndIncrement('corvid_send_message')).toBeNull();
            }
            expect(limiter.checkAndIncrement('corvid_send_message')).not.toBeNull();
        });

        it('tracks issue creation limits', () => {
            const limiter = new AgentSessionLimiter('sess-7', 'phi3:3.8b');
            // limited tier: maxIssuesPerSession = 2
            expect(limiter.checkAndIncrement('corvid_github_create_issue')).toBeNull();
            expect(limiter.checkAndIncrement('corvid_github_create_issue')).toBeNull();
            expect(limiter.checkAndIncrement('corvid_github_create_issue')).not.toBeNull();
        });
    });

    describe('canVoteInCouncil', () => {
        it('allows standard tier council voting', () => {
            const limiter = new AgentSessionLimiter('sess-8', 'llama3.1:70b');
            expect(limiter.canVoteInCouncil).toBe(true);
        });

        it('blocks limited tier council voting', () => {
            const limiter = new AgentSessionLimiter('sess-9', 'phi3:3.8b');
            expect(limiter.canVoteInCouncil).toBe(false);
        });

        it('allows high tier council voting', () => {
            const limiter = new AgentSessionLimiter('sess-10', 'claude-3-opus');
            expect(limiter.canVoteInCouncil).toBe(true);
        });
    });

    describe('getUsage', () => {
        it('returns 0 for unused tools', () => {
            const limiter = new AgentSessionLimiter('sess-11', 'llama3.1:70b');
            expect(limiter.getUsage('corvid_github_create_pr')).toBe(0);
        });

        it('tracks usage correctly', () => {
            const limiter = new AgentSessionLimiter('sess-12', 'llama3.1:70b');
            limiter.checkAndIncrement('corvid_github_create_pr');
            expect(limiter.getUsage('corvid_github_create_pr')).toBe(1);
            limiter.checkAndIncrement('corvid_github_create_pr');
            expect(limiter.getUsage('corvid_github_create_pr')).toBe(2);
        });
    });
});

describe('isSessionRateLimited', () => {
    it('returns true for rate-limited tools', () => {
        expect(isSessionRateLimited('corvid_github_create_pr')).toBe(true);
        expect(isSessionRateLimited('corvid_github_create_issue')).toBe(true);
        expect(isSessionRateLimited('corvid_send_message')).toBe(true);
        expect(isSessionRateLimited('corvid_ask_owner')).toBe(true);
    });

    it('returns false for non-rate-limited tools', () => {
        expect(isSessionRateLimited('read_file')).toBe(false);
        expect(isSessionRateLimited('write_file')).toBe(false);
        expect(isSessionRateLimited('run_command')).toBe(false);
        expect(isSessionRateLimited('corvid_save_memory')).toBe(false);
    });
});
