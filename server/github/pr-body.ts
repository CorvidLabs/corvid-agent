export interface PrBodyOptions {
  /** 1-3 bullet points describing what changed and why */
  summary: string[];
  /** Bulleted list of specific changes */
  changes?: string[];
  /** Verification checklist items */
  testPlan?: string[];
}

/**
 * Format a standardized PR body with Summary, Changes, and Test Plan sections.
 * The agent signature footer (🤖 / 👤 lines) is appended separately by the MCP handler
 * via formatAgentSignature().
 *
 * Template (#2272):
 *   ## Summary
 *   - bullet...
 *
 *   ## Changes
 *   - change...
 *
 *   ## Test Plan
 *   - [ ] step...
 */
export function formatPrBody(opts: PrBodyOptions): string {
  const sections: string[] = [];

  if (opts.summary.length > 0) {
    sections.push(`## Summary\n${opts.summary.map((s) => `- ${s}`).join('\n')}`);
  }

  if (opts.changes && opts.changes.length > 0) {
    sections.push(`## Changes\n${opts.changes.map((c) => `- ${c}`).join('\n')}`);
  }

  if (opts.testPlan && opts.testPlan.length > 0) {
    sections.push(`## Test Plan\n${opts.testPlan.map((t) => `- [ ] ${t}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
