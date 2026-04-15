import { describe, expect, it } from 'bun:test';
import { checkCrossChannelSend, isChannelBoundSource } from '../mcp/tool-handlers/cross-channel-guard';

describe('cross-channel-guard', () => {
  describe('checkCrossChannelSend', () => {
    it('returns no concern for web sessions', () => {
      const result = checkCrossChannelSend('web', 's1', 'agent-a', 'agent-b');
      expect(result.isCrossChannel).toBe(false);
      expect(result.advisory).toBeUndefined();
    });

    it('returns no concern for algochat sessions', () => {
      const result = checkCrossChannelSend('algochat', 's1', 'agent-a', 'agent-b');
      expect(result.isCrossChannel).toBe(false);
      expect(result.advisory).toBeUndefined();
    });

    it('returns no concern for agent sessions', () => {
      const result = checkCrossChannelSend('agent', 's1', 'agent-a', 'agent-b');
      expect(result.isCrossChannel).toBe(false);
      expect(result.advisory).toBeUndefined();
    });

    it('returns no concern for undefined session source', () => {
      const result = checkCrossChannelSend(undefined, 's1', 'agent-a', 'agent-b');
      expect(result.isCrossChannel).toBe(false);
      expect(result.advisory).toBeUndefined();
    });

    it('detects cross-channel concern for discord sessions', () => {
      const result = checkCrossChannelSend('discord', 's1', 'agent-a', 'agent-b');
      expect(result.isCrossChannel).toBe(true);
      expect(result.advisory).toBeDefined();
    });

    it('detects cross-channel concern for telegram sessions', () => {
      const result = checkCrossChannelSend('telegram', 's1', 'agent-a', 'agent-b');
      expect(result.isCrossChannel).toBe(true);
      expect(result.advisory).toBeDefined();
    });

    it('advisory mentions the originating channel source', () => {
      const result = checkCrossChannelSend('discord', 's1', 'agent-a', 'agent-b');
      expect(result.advisory).toContain('discord');
    });

    it('advisory mentions the target agent', () => {
      const result = checkCrossChannelSend('discord', 's1', 'agent-a', 'agent-b');
      expect(result.advisory).toContain('agent-b');
    });

    it('advisory instructs agent to reply directly', () => {
      const result = checkCrossChannelSend('discord', 's1', 'agent-a', 'agent-b');
      expect(result.advisory).toContain('reply directly');
    });

    it('handles undefined sessionId without throwing', () => {
      const result = checkCrossChannelSend('discord', undefined, 'agent-a', 'agent-b');
      expect(result.isCrossChannel).toBe(true);
    });
  });

  describe('isChannelBoundSource', () => {
    it('returns true for discord', () => {
      expect(isChannelBoundSource('discord')).toBe(true);
    });

    it('returns true for telegram', () => {
      expect(isChannelBoundSource('telegram')).toBe(true);
    });

    it('returns false for web', () => {
      expect(isChannelBoundSource('web')).toBe(false);
    });

    it('returns false for algochat', () => {
      expect(isChannelBoundSource('algochat')).toBe(false);
    });

    it('returns false for agent', () => {
      expect(isChannelBoundSource('agent')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isChannelBoundSource(undefined)).toBe(false);
    });

    it('returns false for unknown source', () => {
      expect(isChannelBoundSource('slack')).toBe(false);
    });
  });
});
