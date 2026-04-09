/**
 * Tests for Flock Directory testing challenges — challenge definitions and utilities.
 */
import { describe, expect, test } from 'bun:test';
import {
  ACCURACY_CHALLENGES,
  ALL_CHALLENGES,
  BOT_VERIFICATION_CHALLENGES,
  CHALLENGE_CATEGORIES,
  CONTEXT_CHALLENGES,
  getChallengesByCategory,
  getRandomChallenges,
  RESPONSIVENESS_CHALLENGES,
  SAFETY_CHALLENGES,
} from '../flock-directory/testing/challenges';

describe('challenge definitions', () => {
  test('has 6 challenge categories', () => {
    expect(CHALLENGE_CATEGORIES.length).toBe(6);
  });

  test('all challenges have required fields', () => {
    for (const c of ALL_CHALLENGES) {
      expect(c.id).toBeTruthy();
      expect(c.category).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(c.messages.length).toBeGreaterThan(0);
      expect(c.expected).toBeTruthy();
      expect(c.timeoutMs).toBeGreaterThan(0);
      expect(c.weight).toBeGreaterThan(0);
    }
  });

  test('challenge IDs are unique', () => {
    const ids = ALL_CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('each category has at least 2 challenges', () => {
    for (const cat of CHALLENGE_CATEGORIES) {
      const challenges = getChallengesByCategory(cat);
      expect(challenges.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('responsiveness challenges exist', () => {
    expect(RESPONSIVENESS_CHALLENGES.length).toBeGreaterThanOrEqual(3);
  });

  test('accuracy challenges exist', () => {
    expect(ACCURACY_CHALLENGES.length).toBeGreaterThanOrEqual(3);
  });

  test('context challenges have multi-turn messages', () => {
    for (const c of CONTEXT_CHALLENGES) {
      expect(c.messages.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('safety challenges expect rejection', () => {
    for (const c of SAFETY_CHALLENGES) {
      expect(c.expected.type).toBe('rejection');
    }
  });

  test('bot verification challenges exist', () => {
    expect(BOT_VERIFICATION_CHALLENGES.length).toBeGreaterThanOrEqual(3);
  });

  test('bot verification challenges test AI-specific abilities', () => {
    for (const c of BOT_VERIFICATION_CHALLENGES) {
      expect(c.category).toBe('bot_verification');
      expect(c.id).toMatch(/^bot-/);
    }
  });
});

describe('getChallengesByCategory', () => {
  test('filters by category', () => {
    const accuracy = getChallengesByCategory('accuracy');
    expect(accuracy.every((c) => c.category === 'accuracy')).toBe(true);
  });

  test('returns empty for nonexistent category', () => {
    const result = getChallengesByCategory('nonexistent' as any);
    expect(result.length).toBe(0);
  });
});

describe('getRandomChallenges', () => {
  test('returns requested count', () => {
    const result = getRandomChallenges(3);
    expect(result.length).toBe(3);
  });

  test('does not exceed pool size', () => {
    const result = getRandomChallenges(1000);
    expect(result.length).toBe(ALL_CHALLENGES.length);
  });

  test('filters by category', () => {
    const result = getRandomChallenges(2, 'safety');
    expect(result.every((c) => c.category === 'safety')).toBe(true);
  });
});
