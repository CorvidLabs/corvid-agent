/**
 * Tests for buddy Discord status label and role icon helpers.
 */
import { describe, expect, test } from 'bun:test';
import { getBuddyRoleIcon, getBuddyStatusLabel } from '../discord/command-handlers/message-commands';

describe('getBuddyStatusLabel', () => {
  test('lead round 1 is Initial Response', () => {
    expect(getBuddyStatusLabel('lead', 1, false)).toBe('Initial Response');
  });

  test('lead round 2+ is Revised Response', () => {
    expect(getBuddyStatusLabel('lead', 2, false)).toBe('Revised Response (Round 2)');
    expect(getBuddyStatusLabel('lead', 3, false)).toBe('Revised Response (Round 3)');
  });

  test('buddy approved is Approved', () => {
    expect(getBuddyStatusLabel('buddy', 1, true)).toBe('Approved');
  });

  test('buddy not approved is Review & Feedback', () => {
    expect(getBuddyStatusLabel('buddy', 1, false)).toBe('Review & Feedback');
  });

  test('lead round 1 with approved flag still shows Initial Response', () => {
    // Lead role takes precedence over approved flag
    expect(getBuddyStatusLabel('lead', 1, true)).toBe('Initial Response');
  });
});

describe('getBuddyRoleIcon', () => {
  test('lead gets speech bubble', () => {
    expect(getBuddyRoleIcon('lead', false)).toBe('💬');
  });

  test('buddy approved gets checkmark', () => {
    expect(getBuddyRoleIcon('buddy', true)).toBe('✅');
  });

  test('buddy not approved gets magnifier', () => {
    expect(getBuddyRoleIcon('buddy', false)).toBe('🔍');
  });

  test('lead with approved flag still gets speech bubble', () => {
    expect(getBuddyRoleIcon('lead', true)).toBe('💬');
  });
});
