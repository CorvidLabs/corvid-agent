/** Issue type inferred from title/body keyword scanning. */
export type IssueType = 'bug' | 'feature' | 'unknown';

export interface FormatIssueBodyOptions {
  /** Override auto-detected type. Pass 'unknown' to skip template wrapping. */
  issueType?: IssueType;
}

// Bug signals: error/failure/regression keywords
const BUG_RE =
  /\b(bug|error|broken|crash(?:ing|es)?|fail(?:ing|ed|ure|s)?|fix(?:ing|ed)?|defect|regression|unexpected|wrong|incorrect|cannot|can't|doesn't work|not working|exception|traceback|stack trace|panic|nil pointer)\b/i;

// Feature signals: addition/improvement request keywords
const FEATURE_RE =
  /\b(feature|enhancement|request|add(?:ing)?|implement(?:ing|ation)?|support|introduce|new|improve(?:ment)?|need|want|allow|enable|proposal|suggest(?:ion)?|would be great|should be able)\b/i;

/**
 * Infer whether an issue is a bug report or feature request by scanning the
 * title (higher signal) then the first 500 chars of the body.
 */
export function detectIssueType(title: string, body: string): IssueType {
  const titleBug = BUG_RE.test(title);
  const titleFeat = FEATURE_RE.test(title);
  if (titleBug && !titleFeat) return 'bug';
  if (titleFeat && !titleBug) return 'feature';

  const snippet = body.slice(0, 500);
  const bodyBug = BUG_RE.test(snippet);
  const bodyFeat = FEATURE_RE.test(snippet);
  if (bodyBug && !bodyFeat) return 'bug';
  if (bodyFeat && !bodyBug) return 'feature';

  return 'unknown';
}

/** Returns true if body already contains markdown section headers (## …). */
function hasStructuredContent(body: string): boolean {
  return /^#{2,3}\s/m.test(body);
}

function applyBugTemplate(rawBody: string): string {
  if (hasStructuredContent(rawBody)) return rawBody;
  return (
    `## Description\n\n${rawBody}\n\n` +
    `## Steps to Reproduce\n\n<!-- Describe the steps to reproduce this issue -->\n\n` +
    `## Expected Behavior\n\n<!-- What should happen? -->\n\n` +
    `## Actual Behavior\n\n<!-- What actually happens? -->`
  );
}

function applyFeatureTemplate(rawBody: string): string {
  if (hasStructuredContent(rawBody)) return rawBody;
  return (
    `## Description\n\n${rawBody}\n\n` +
    `## Motivation\n\n<!-- Why is this needed? -->\n\n` +
    `## Proposed Solution\n\n<!-- How should this be implemented? -->`
  );
}

/**
 * Apply a structured template to a raw issue body based on detected or
 * explicit issue type (#2273).
 *
 * - Bug issues get Description / Steps to Reproduce / Expected / Actual sections.
 * - Feature requests get Description / Motivation / Proposed Solution sections.
 * - If the body already contains markdown headers it is returned unchanged
 *   (backward compatibility for callers that pre-format the body).
 * - 'unknown' type passes the body through untouched.
 */
export function formatIssueBody(title: string, rawBody: string, options?: FormatIssueBodyOptions): string {
  const type = options?.issueType ?? detectIssueType(title, rawBody);
  switch (type) {
    case 'bug':
      return applyBugTemplate(rawBody);
    case 'feature':
      return applyFeatureTemplate(rawBody);
    default:
      return rawBody;
  }
}
