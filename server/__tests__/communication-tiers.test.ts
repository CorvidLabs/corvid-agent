/**
 * Tests for communication tier system.
 *
 * Hierarchy: top → mid → bottom (messages flow downward).
 * - top (CorvidAgent): can message anyone
 * - mid (Rook, Jackdaw, Kite, Condor): can message mid + bottom
 * - bottom (Magpie, Starling, Merlin): can message bottom only
 */
import { describe, expect, it } from 'bun:test';
import { checkCommunicationTier, getCommunicationTier, getTierMessageLimits } from '../lib/communication-tiers';

// ── getCommunicationTier ─────────────────────────────────────────────────

describe('getCommunicationTier', () => {
  it('returns "top" for CorvidAgent', () => {
    expect(getCommunicationTier('CorvidAgent')).toBe('top');
  });

  it('is case-insensitive', () => {
    expect(getCommunicationTier('corvidagent')).toBe('top');
    expect(getCommunicationTier('CORVIDAGENT')).toBe('top');
    expect(getCommunicationTier('Rook')).toBe('mid');
    expect(getCommunicationTier('ROOK')).toBe('mid');
  });

  it('returns "mid" for mid-tier agents', () => {
    expect(getCommunicationTier('Rook')).toBe('mid');
    expect(getCommunicationTier('Jackdaw')).toBe('mid');
    expect(getCommunicationTier('Kite')).toBe('mid');
    expect(getCommunicationTier('Condor')).toBe('mid');
  });

  it('returns "bottom" for bottom-tier agents', () => {
    expect(getCommunicationTier('Magpie')).toBe('bottom');
    expect(getCommunicationTier('Starling')).toBe('bottom');
    expect(getCommunicationTier('Merlin')).toBe('bottom');
  });

  it('defaults to "bottom" for unknown agents', () => {
    expect(getCommunicationTier('UnknownAgent')).toBe('bottom');
    expect(getCommunicationTier('NewAgent')).toBe('bottom');
  });
});

// ── checkCommunicationTier ───────────────────────────────────────────────

describe('checkCommunicationTier', () => {
  // Top tier can message anyone
  it('allows top → top', () => {
    expect(checkCommunicationTier('CorvidAgent', 'CorvidAgent')).toBeNull();
  });

  it('allows top → mid', () => {
    expect(checkCommunicationTier('CorvidAgent', 'Rook')).toBeNull();
    expect(checkCommunicationTier('CorvidAgent', 'Jackdaw')).toBeNull();
  });

  it('allows top → bottom', () => {
    expect(checkCommunicationTier('CorvidAgent', 'Magpie')).toBeNull();
    expect(checkCommunicationTier('CorvidAgent', 'Starling')).toBeNull();
  });

  // Mid tier can message mid + bottom
  it('allows mid → mid', () => {
    expect(checkCommunicationTier('Rook', 'Jackdaw')).toBeNull();
    expect(checkCommunicationTier('Jackdaw', 'Kite')).toBeNull();
    expect(checkCommunicationTier('Condor', 'Rook')).toBeNull();
  });

  it('allows mid → bottom', () => {
    expect(checkCommunicationTier('Rook', 'Magpie')).toBeNull();
    expect(checkCommunicationTier('Jackdaw', 'Starling')).toBeNull();
  });

  it('blocks mid → top', () => {
    const err = checkCommunicationTier('Rook', 'CorvidAgent');
    expect(err).not.toBeNull();
    expect(err).toContain('Communication tier violation');
    expect(err).toContain('mid');
    expect(err).toContain('top');
  });

  // Bottom tier can only message bottom
  it('allows bottom → bottom', () => {
    expect(checkCommunicationTier('Magpie', 'Starling')).toBeNull();
    expect(checkCommunicationTier('Starling', 'Merlin')).toBeNull();
  });

  it('blocks bottom → mid', () => {
    const err = checkCommunicationTier('Magpie', 'Rook');
    expect(err).not.toBeNull();
    expect(err).toContain('Communication tier violation');
  });

  it('blocks bottom → top', () => {
    const err = checkCommunicationTier('Magpie', 'CorvidAgent');
    expect(err).not.toBeNull();
    expect(err).toContain('Communication tier violation');
  });

  // Unknown agents default to bottom
  it('treats unknown agents as bottom tier', () => {
    // Unknown → mid should be blocked
    const err = checkCommunicationTier('RandomAgent', 'Rook');
    expect(err).not.toBeNull();

    // Unknown → unknown (both bottom) should be allowed
    expect(checkCommunicationTier('AgentA', 'AgentB')).toBeNull();
  });
});

// ── getTierMessageLimits ─────────────────────────────────────────────────

describe('getTierMessageLimits', () => {
  it('returns highest limits for top tier', () => {
    const limits = getTierMessageLimits('top');
    expect(limits.maxMessagesPerSession).toBeGreaterThanOrEqual(20);
    expect(limits.maxUniqueTargetsPerSession).toBeGreaterThanOrEqual(10);
  });

  it('returns moderate limits for mid tier', () => {
    const limits = getTierMessageLimits('mid');
    expect(limits.maxMessagesPerSession).toBeGreaterThanOrEqual(10);
    expect(limits.maxUniqueTargetsPerSession).toBeGreaterThanOrEqual(5);
  });

  it('returns restrictive limits for bottom tier', () => {
    const limits = getTierMessageLimits('bottom');
    expect(limits.maxMessagesPerSession).toBeLessThanOrEqual(5);
    expect(limits.maxUniqueTargetsPerSession).toBeLessThanOrEqual(2);
  });

  it('top limits are >= mid limits', () => {
    const top = getTierMessageLimits('top');
    const mid = getTierMessageLimits('mid');
    expect(top.maxMessagesPerSession).toBeGreaterThanOrEqual(mid.maxMessagesPerSession);
    expect(top.maxUniqueTargetsPerSession).toBeGreaterThanOrEqual(mid.maxUniqueTargetsPerSession);
  });

  it('mid limits are >= bottom limits', () => {
    const mid = getTierMessageLimits('mid');
    const bottom = getTierMessageLimits('bottom');
    expect(mid.maxMessagesPerSession).toBeGreaterThanOrEqual(bottom.maxMessagesPerSession);
    expect(mid.maxUniqueTargetsPerSession).toBeGreaterThanOrEqual(bottom.maxUniqueTargetsPerSession);
  });
});
