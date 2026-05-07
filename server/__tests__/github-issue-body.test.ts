import { describe, expect, test } from 'bun:test';
import { detectIssueType, formatIssueBody } from '../mcp/tool-handlers/github-issue-body';

// ── detectIssueType ───────────────────────────────────────────────────────

describe('detectIssueType', () => {
  test('detects bug from title keyword "bug"', () => {
    expect(detectIssueType('Bug in login page', '')).toBe('bug');
  });

  test('detects bug from title keyword "fix"', () => {
    expect(detectIssueType('Fix crash on startup', '')).toBe('bug');
  });

  test('detects bug from title keyword "error"', () => {
    expect(detectIssueType('Error when saving file', 'More info here')).toBe('bug');
  });

  test('detects bug from title keyword "broken"', () => {
    expect(detectIssueType('Broken pagination', '')).toBe('bug');
  });

  test('detects bug from title keyword "crash"', () => {
    expect(detectIssueType('App crashes on large uploads', '')).toBe('bug');
  });

  test('detects feature from title keyword "feature"', () => {
    expect(detectIssueType('Feature: dark mode', '')).toBe('feature');
  });

  test('detects feature from title keyword "add"', () => {
    expect(detectIssueType('Add export to CSV', '')).toBe('feature');
  });

  test('detects feature from title keyword "implement"', () => {
    expect(detectIssueType('Implement pagination', '')).toBe('feature');
  });

  test('detects feature from title keyword "support"', () => {
    expect(detectIssueType('Support webhooks for external events', '')).toBe('feature');
  });

  test('detects feature from title keyword "enhancement"', () => {
    expect(detectIssueType('Enhancement: faster search', '')).toBe('feature');
  });

  test('falls back to body when title is ambiguous', () => {
    expect(detectIssueType('Parser problem', 'The parser crashes when input is null')).toBe('bug');
  });

  test('falls back to body for feature when title is ambiguous', () => {
    expect(detectIssueType('Suggestion', 'Would be great to add a dark mode option')).toBe('feature');
  });

  test('returns unknown for generic maintenance titles', () => {
    expect(detectIssueType('Update configuration', 'Bump version settings')).toBe('unknown');
  });

  test('returns unknown for empty title and body', () => {
    expect(detectIssueType('', '')).toBe('unknown');
  });

  test('title takes precedence over body — bug title beats feature body', () => {
    // Title says bug, body says feature — title wins
    expect(detectIssueType('Fix broken parser', 'Add support for new syntax feature')).toBe('bug');
  });

  test('title takes precedence over body — feature title beats bug body', () => {
    // Title has clear feature signal ("Add", "support") — body has clear bug signal ("crashes")
    expect(detectIssueType('Add support for webhook notifications', 'The app crashes on startup')).toBe('feature');
  });

  test('scans only first 500 chars of body', () => {
    const longPreamble = 'x'.repeat(600);
    const body = `${longPreamble} this is a bug report`;
    // Bug keyword is beyond 500-char window — should not be detected
    expect(detectIssueType('', body)).toBe('unknown');
  });
});

// ── formatIssueBody ───────────────────────────────────────────────────────

describe('formatIssueBody', () => {
  describe('bug template', () => {
    test('wraps raw body in bug template sections', () => {
      const result = formatIssueBody('Fix NPE in parser', 'Parser crashes on null input');
      expect(result).toContain('## Description');
      expect(result).toContain('Parser crashes on null input');
      expect(result).toContain('## Steps to Reproduce');
      expect(result).toContain('## Expected Behavior');
      expect(result).toContain('## Actual Behavior');
    });

    test('preserves original description text in bug template', () => {
      const desc = 'The login button fails when the session has expired.';
      const result = formatIssueBody('Login button error', desc);
      expect(result).toContain(desc);
    });

    test('description section comes first in bug template', () => {
      const result = formatIssueBody('Fix crash', 'Details here');
      const descIdx = result.indexOf('## Description');
      const stepsIdx = result.indexOf('## Steps to Reproduce');
      expect(descIdx).toBeLessThan(stepsIdx);
    });
  });

  describe('feature template', () => {
    test('wraps raw body in feature template sections', () => {
      const result = formatIssueBody('Add dark mode support', 'Users want a dark theme');
      expect(result).toContain('## Description');
      expect(result).toContain('Users want a dark theme');
      expect(result).toContain('## Motivation');
      expect(result).toContain('## Proposed Solution');
    });

    test('preserves original description text in feature template', () => {
      const desc = 'Exportable reports would save users significant manual effort.';
      const result = formatIssueBody('Add CSV export feature', desc);
      expect(result).toContain(desc);
    });

    test('description section comes first in feature template', () => {
      const result = formatIssueBody('Implement pagination', 'Details here');
      const descIdx = result.indexOf('## Description');
      const motivIdx = result.indexOf('## Motivation');
      expect(descIdx).toBeLessThan(motivIdx);
    });
  });

  describe('backward compatibility', () => {
    test('passes body through unchanged for unknown issue type', () => {
      const raw = 'Some ambiguous content about configuration settings.';
      expect(formatIssueBody('Update configuration', raw)).toBe(raw);
    });

    test('preserves already-structured body with ## headers for bug issue', () => {
      const structured = '## Summary\n\nBug is here.\n\n## Steps\n\n1. Do this\n2. See error';
      const result = formatIssueBody('Fix crash', structured);
      expect(result).toBe(structured);
    });

    test('preserves already-structured body with ## headers for feature issue', () => {
      const structured = '## Overview\n\nNeed this feature.\n\n## Details\n\nMore info.';
      const result = formatIssueBody('Add new feature', structured);
      expect(result).toBe(structured);
    });

    test('preserves body with ### headers', () => {
      const structured = '### Background\n\nSome context.\n\n### Proposal\n\nDo X.';
      const result = formatIssueBody('Add dark mode', structured);
      expect(result).toBe(structured);
    });

    test('empty body returns empty string for unknown type', () => {
      expect(formatIssueBody('Update docs', '')).toBe('');
    });
  });

  describe('explicit issueType override', () => {
    test('applies bug template when issueType="bug" even for non-bug title', () => {
      const result = formatIssueBody('Add dark mode', 'Users want dark mode', { issueType: 'bug' });
      expect(result).toContain('## Steps to Reproduce');
      expect(result).toContain('## Actual Behavior');
    });

    test('applies feature template when issueType="feature" even for bug-sounding title', () => {
      const result = formatIssueBody('Fix this thing', 'Some bug description', {
        issueType: 'feature',
      });
      expect(result).toContain('## Motivation');
      expect(result).toContain('## Proposed Solution');
      expect(result).not.toContain('## Steps to Reproduce');
    });

    test('passes body through when issueType="unknown" even for bug-sounding title', () => {
      const raw = 'App crashes hard on startup.';
      const result = formatIssueBody('Fix crash', raw, { issueType: 'unknown' });
      expect(result).toBe(raw);
    });
  });
});
