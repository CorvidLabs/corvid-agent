/**
 * Context management helpers for direct-process sessions.
 *
 * Handles token estimation, context budget tracking, message trimming, and
 * progressive compression tiers to keep conversations within the context window.
 */

import { createLogger } from '../lib/logger';
import { getModelPricing } from '../providers/cost-table';

const log = createLogger('DirectProcess');

const MAX_MESSAGES = 40;
const KEEP_RECENT = 30;
const DEFAULT_CONTEXT_WINDOW = 128_000;

// Chars-per-token ratios calibrated against Claude tokenizer on representative samples
const CHARS_PER_TOKEN_STRUCTURED = 2.5; // JSON/YAML: repeated keys, brackets, short values
const CHARS_PER_TOKEN_CODE = 3; // Source code: operators, short identifiers
const CHARS_PER_TOKEN_PROSE = 4; // Natural language prose

/**
 * Content-aware token estimation with three content classes.
 *
 * Detects structured data (JSON/YAML), source code, and prose, then applies a
 * weighted blend when content is mixed. Structured data tokenizes more densely
 * than code due to repeated delimiters and short values.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const len = text.length;
  const codeIndicators = (text.match(/[{}();=<>[\]|&!+\-*/\\^~`]/g) || []).length;
  const codeRatio = codeIndicators / len;

  const structuredRatio = detectStructuredDataRatio(text, len);

  let charsPerToken: number;
  if (structuredRatio > 0.5) {
    // Predominantly structured data — blend structured + code/prose remainder
    const remainderRatio = codeRatio > 0.08 ? CHARS_PER_TOKEN_CODE : CHARS_PER_TOKEN_PROSE;
    charsPerToken = structuredRatio * CHARS_PER_TOKEN_STRUCTURED + (1 - structuredRatio) * remainderRatio;
  } else if (codeRatio > 0.12) {
    charsPerToken = CHARS_PER_TOKEN_CODE;
  } else if (codeRatio > 0.05) {
    // Mixed content — blend code and prose proportionally
    const blend = (codeRatio - 0.05) / 0.07; // 0..1 across the 0.05-0.12 range
    charsPerToken = blend * CHARS_PER_TOKEN_CODE + (1 - blend) * CHARS_PER_TOKEN_PROSE;
  } else {
    charsPerToken = CHARS_PER_TOKEN_PROSE;
  }

  return Math.ceil(len / charsPerToken);
}

/**
 * Detect what fraction of the text is structured data (JSON, YAML, TOML).
 * Uses lightweight heuristics rather than parsing.
 */
function detectStructuredDataRatio(text: string, len: number): number {
  if (len < 20) return 0;

  let score = 0;

  // JSON indicators: starts with { or [, has "key": patterns
  const jsonKeyMatches = text.match(/"[\w$-]+"\s*:/g);
  if (jsonKeyMatches) {
    score += Math.min(jsonKeyMatches.length * 15, len) / len;
  }

  // YAML indicators: key: value at line starts, --- document markers
  const yamlKeyMatches = text.match(/^[\w][\w.-]*:\s/gm);
  if (yamlKeyMatches) {
    score += Math.min(yamlKeyMatches.length * 12, len) / len;
  }

  return Math.min(score, 1);
}

/**
 * Get the configured context window size in tokens, model-aware.
 * Uses the cost table to look up the correct context window for the model.
 * Falls back to OLLAMA_NUM_CTX env var, then to DEFAULT_CONTEXT_WINDOW.
 */
export function getContextBudget(model?: string): number {
  if (model) {
    const pricing = getModelPricing(model);
    if (pricing) return pricing.maxContextTokens;
  }
  if (process.env.OLLAMA_NUM_CTX) return parseInt(process.env.OLLAMA_NUM_CTX, 10);
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Detect whether an error message indicates a context overflow from any provider.
 * Covers Anthropic, OpenAI, Ollama, and OpenRouter error patterns.
 */
export function isContextOverflowError(errorMsg: string): boolean {
  const lower = errorMsg.toLowerCase();
  return (
    lower.includes('prompt is too long') ||
    lower.includes('context_length_exceeded') ||
    lower.includes('context length exceeded') ||
    lower.includes('request too large') ||
    lower.includes('maximum context length') ||
    lower.includes('token limit') ||
    lower.includes('input is too long') ||
    lower.includes('too many tokens') ||
    (lower.includes('exceed') && lower.includes('context'))
  );
}

/**
 * Calculate the maximum tool result size based on remaining context budget.
 * Ensures a single tool result never consumes more than 30% of the total
 * context window, and scales down further when context is already full.
 *
 * Returns max chars (not tokens).
 */
export function calculateMaxToolResultChars(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  model?: string,
): number {
  const ctxSize = getContextBudget(model);
  // Absolute max: 30% of context window for a single result
  const absoluteMax = Math.floor(ctxSize * 0.3) * 4; // tokens → chars
  // Absolute min: always allow at least 1K chars for errors etc.
  const absoluteMin = 1_000;

  const usedTokens = estimateTokens(systemPrompt) + messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const remainingTokens = ctxSize - usedTokens;

  // Reserve 40% of remaining for the model's response
  const availableForResult = Math.floor(remainingTokens * 0.6) * 4; // tokens → chars

  return Math.max(absoluteMin, Math.min(absoluteMax, availableForResult));
}

/**
 * Truncate council synthesis messages if they exceed 70% of the context window.
 * Keeps the system prompt contribution (already separate), first user message,
 * and the most recent N messages. Logs a warning when truncation occurs.
 */
export function truncateCouncilContext(
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }>,
  systemPrompt: string,
  model?: string,
): void {
  const ctxSize = getContextBudget(model);
  const threshold = Math.floor(ctxSize * 0.7);

  const systemTokens = estimateTokens(systemPrompt);
  let messageTokens = 0;
  for (const m of messages) {
    messageTokens += estimateTokens(m.content);
  }

  const totalTokens = systemTokens + messageTokens;
  if (totalTokens <= threshold) return;

  // Keep first user message + last 4 messages
  const keepTail = 4;
  if (messages.length <= keepTail + 1) return; // Nothing to trim

  const first = messages[0];
  const tail = messages.slice(-keepTail);

  if (tail.includes(first)) {
    messages.length = 0;
    messages.push(...tail);
  } else {
    messages.length = 0;
    messages.push(first, ...tail);
  }

  const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
  log.warn(`Council context truncated: ${totalTokens} → ${newTokens} estimated tokens (threshold: ${threshold})`);
}

/**
 * Progressive compression tiers based on context usage percentage.
 * Each tier applies increasingly aggressive compression to keep the
 * conversation within the context window.
 *
 * Tier 0 (proactive) runs before the numbered tiers — it ages out large
 * tool results that have already been consumed by the assistant, providing
 * a smoother degradation curve instead of cliff-edge compression at 70%.
 */
const PROACTIVE_THRESHOLD = 0.6;

const COMPRESSION_TIERS = [
  { name: 'tier1', threshold: 0.7, description: 'light tool result summarization' },
  { name: 'tier2', threshold: 0.8, description: 'reduce recent window + summarize discarded' },
  { name: 'tier3', threshold: 0.88, description: 'aggressive compression to 4 exchanges' },
  { name: 'tier4', threshold: 0.93, description: 'full context summary + last 2 exchanges' },
] as const;

export type ConversationMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: import('../providers/types').LlmToolCall[];
};

/**
 * Compress tool result messages in-place by truncating content older than
 * `maxAge` positions from the end of the array to at most `maxChars`.
 */
export function compressToolResults(messages: ConversationMessage[], maxAge: number, maxChars: number): number {
  let compressed = 0;
  const cutoff = messages.length - maxAge;
  for (let i = 0; i < cutoff; i++) {
    const msg = messages[i];
    if (msg.role === 'tool' && msg.content.length > maxChars) {
      const original = msg.content.length;
      msg.content = `${msg.content.slice(0, maxChars).replace(/\n/g, ' ').trim()}... [compressed, was ${original} chars]`;
      compressed++;
    }
  }
  return compressed;
}

/**
 * Generate a brief plain-text summary of the key points in a conversation.
 * Used for Tier 4 compression and context reset in ProcessManager.
 */
export function summarizeConversation(
  messages: Array<{ role: string; content: string }>,
  projectContext?: { name: string; workingDir: string },
): string {
  const points: string[] = [];

  if (projectContext) {
    points.push(`Active project: ${projectContext.name} (${projectContext.workingDir})`);
  }

  // Extract key user requests
  const userMessages = messages.filter((m) => m.role === 'user');
  if (userMessages.length > 0) {
    const firstRequest = userMessages[0].content.slice(0, 500).replace(/\n/g, ' ').trim();
    points.push(`Original request: ${firstRequest}${userMessages[0].content.length > 500 ? '...' : ''}`);
  }

  // Extract file paths from tool results and assistant messages
  const filePaths = extractMentionedFilePaths(messages);
  if (filePaths.length > 0) {
    const listed = filePaths.slice(0, 20).join(', ');
    const extra = filePaths.length > 20 ? ` ... and ${filePaths.length - 20} more` : '';
    points.push(`Files touched: ${listed}${extra}`);
  }

  // Extract key decisions and outcomes from assistant messages
  const assistantMessages = messages.filter((m) => m.role === 'assistant');
  const decisions = extractKeyDecisions(assistantMessages);
  if (decisions.length > 0) {
    points.push(`Key decisions/findings:\n${decisions.map((d) => `  - ${d}`).join('\n')}`);
  }

  // Extract errors encountered and their resolutions
  const errors = extractErrorsAndResolutions(messages);
  if (errors.length > 0) {
    points.push(`Errors/resolutions:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  // Extract configuration values discovered
  const configs = extractConfigValues(messages);
  if (configs.length > 0) {
    points.push(`Config values: ${configs.join(', ')}`);
  }

  // Extract in-progress work status from the last few assistant messages
  if (assistantMessages.length > 0) {
    const recentAssistant = assistantMessages.slice(-3);
    for (const msg of recentAssistant) {
      const conclusion = msg.content.slice(0, 600).replace(/\n/g, ' ').trim();
      points.push(`Last assistant response: ${conclusion}${msg.content.length > 600 ? '...' : ''}`);
    }
  }

  // Extract tool usage summary with specifics
  const toolMessages = messages.filter((m) => m.role === 'tool');
  if (toolMessages.length > 0) {
    points.push(`Tools used: ${toolMessages.length} tool calls executed.`);
  }

  // Summarize intermediate user follow-ups
  if (userMessages.length > 1) {
    const followUps = userMessages.slice(1).map((m) => {
      const text = m.content.slice(0, 200).replace(/\n/g, ' ').trim();
      return text + (m.content.length > 200 ? '...' : '');
    });
    if (followUps.length <= 8) {
      points.push(`Follow-up messages: ${followUps.join('; ')}`);
    } else {
      points.push(
        `Follow-up messages (${followUps.length} total): ${followUps.slice(0, 6).join('; ')}; ... and ${followUps.length - 6} more`,
      );
    }
  }

  return `[Context Summary]\n${points.join('\n')}`;
}

const FILE_PATH_PATTERN = /(?:^|\s|['"`])(\/?(?:[\w.-]+\/){1,10}[\w.-]+\.[\w]+)/g;
const GIT_FILE_PATTERN = /(?:modified|created|deleted|renamed):\s+([\w./-]+)/g;
const TOOL_FILE_PATTERN =
  /(?:Reading|Read|Wrote|Writing|Editing|Created|Deleted|file_path|path)[:\s]+['"`]?((?:\/|\.\.?\/)[\w./-]+)['"`]?/g;
const IMPORT_PATTERN = /(?:from|require\()\s*['"]([^'"]+)['"]/g;

function extractMentionedFilePaths(messages: Array<{ role: string; content: string }>): string[] {
  const paths = new Set<string>();
  const filePatterns = [FILE_PATH_PATTERN, GIT_FILE_PATTERN, TOOL_FILE_PATTERN, IMPORT_PATTERN];

  for (const msg of messages) {
    if (msg.role !== 'assistant' && msg.role !== 'tool') continue;
    for (const pattern of filePatterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(msg.content)) !== null) {
        const p = match[1];
        if (p.includes('/') && !p.startsWith('http') && !p.startsWith('//')) {
          paths.add(p);
        }
      }
    }
  }
  return [...paths];
}

function extractKeyDecisions(assistantMessages: Array<{ content: string }>): string[] {
  const decisions: string[] = [];
  const decisionPatterns = [
    /(?:root cause|the issue|the problem|the bug)[:\s]+(.{20,200}?)(?:\.|$)/gi,
    /(?:fixed|resolved|implemented|added|removed|changed|updated)[:\s]+(.{20,200}?)(?:\.|$)/gi,
    /(?:decided to|going to|plan is to|approach is to)[:\s]+(.{20,200}?)(?:\.|$)/gi,
    /(?:approved|allowed|denied|rejected|confirmed)[:\s]+(.{10,200}?)(?:\.|$)/gi,
    /(?:chose|selected|picked|using|switched to|migrated to)[:\s]+(.{10,200}?)(?:(?:\s+instead|\s+over|\s+rather).*?)?(?:\.|$)/gi,
    /(?:the solution|the fix|the workaround|the approach)[:\s]+(.{20,200}?)(?:\.|$)/gi,
    /(?:discovered|found|noticed|identified|determined)[:\s]+that\s+(.{20,200}?)(?:\.|$)/gi,
    /(?:must|need to|should|cannot|can't|won't)[:\s]+(.{15,200}?)(?:\s+because\s+.{10,100}?)?(?:\.|$)/gi,
  ];
  const maxDecisions = 12;
  for (const msg of assistantMessages.slice(-10)) {
    for (const pattern of decisionPatterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(msg.content)) !== null) {
        const decision = match[0].slice(0, 200).replace(/\n/g, ' ').trim();
        if (decision.length >= 15 && !decisions.includes(decision)) {
          decisions.push(decision);
        }
        if (decisions.length >= maxDecisions) return decisions;
      }
    }
  }
  return decisions;
}

function extractErrorsAndResolutions(messages: Array<{ role: string; content: string }>): string[] {
  const results: string[] = [];
  const errorPattern = /(?:Error|error|ERROR|Exception|FAIL|failed|failure)[:\s]+(.{10,300}?)(?:\n|$)/g;
  const resolutionPattern = /(?:fixed by|resolved by|solution was|fix was|worked around)[:\s]+(.{10,200}?)(?:\.|$)/gi;

  for (const msg of messages) {
    if (msg.role !== 'assistant' && msg.role !== 'tool') continue;

    errorPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = errorPattern.exec(msg.content)) !== null) {
      const err = match[0].slice(0, 200).replace(/\n/g, ' ').trim();
      if (err.length >= 15 && !results.includes(err)) {
        results.push(err);
      }
      if (results.length >= 8) break;
    }

    resolutionPattern.lastIndex = 0;
    while ((match = resolutionPattern.exec(msg.content)) !== null) {
      const res = match[0].slice(0, 200).replace(/\n/g, ' ').trim();
      if (!results.includes(res)) {
        results.push(res);
      }
      if (results.length >= 10) break;
    }
  }
  return results;
}

function extractConfigValues(messages: Array<{ role: string; content: string }>): string[] {
  const configs: string[] = [];
  const envPattern = /([A-Z][A-Z0-9_]{2,})=(['"]?)([^\s'"]{1,100})\2/g;
  const configPattern =
    /(?:set|configured|config|setting|port|host|version|using)\s+[`"']?(\w[\w.-]*)[`"']?\s*(?:to|=|:)\s*[`"']?([^\s`"']{1,80})[`"']?/gi;

  for (const msg of messages) {
    if (msg.role !== 'assistant' && msg.role !== 'tool') continue;

    envPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = envPattern.exec(msg.content)) !== null) {
      const entry = `${match[1]}=${match[3]}`;
      if (!configs.includes(entry)) configs.push(entry);
      if (configs.length >= 10) break;
    }

    configPattern.lastIndex = 0;
    while ((match = configPattern.exec(msg.content)) !== null) {
      const entry = `${match[1]}=${match[2]}`;
      if (!configs.includes(entry)) configs.push(entry);
      if (configs.length >= 10) break;
    }
  }
  return configs;
}

/**
 * Proactively summarize large tool results that have already been consumed
 * by an assistant response. A tool result is "consumed" if it appears before
 * a subsequent assistant message that references file paths or content from it.
 *
 * Replaces consumed tool results with a compact summary preserving key info
 * (file paths, line counts, error indicators) while dramatically reducing size.
 */
export function summarizeConsumedToolResults(
  messages: ConversationMessage[],
  minSizeChars: number = 500,
  recentWindow: number = 6,
): number {
  let summarized = 0;
  const cutoff = messages.length - recentWindow;

  for (let i = 0; i < cutoff; i++) {
    const msg = messages[i];
    if (msg.role !== 'tool' || msg.content.length <= minSizeChars) continue;

    // Check if an assistant message follows that "consumes" this result
    const hasFollowingAssistant = messages.slice(i + 1, cutoff + 2).some((m) => m.role === 'assistant');
    if (!hasFollowingAssistant) continue;

    const original = msg.content;
    const lineCount = (original.match(/\n/g) || []).length + 1;
    const paths = [...new Set((original.match(/(?:\/[\w.-]+){2,}/g) || []).slice(0, 5))];
    const hasError = /(?:error|Error|ERROR|fail|FAIL)/i.test(original);

    const parts: string[] = [];
    parts.push(`[Summarized tool result, was ${original.length} chars, ${lineCount} lines]`);
    if (paths.length > 0) parts.push(`Files: ${paths.join(', ')}`);
    if (hasError) parts.push('(contained errors)');
    // Keep a small preview of the beginning for orientation
    parts.push(original.slice(0, 150).replace(/\n/g, ' ').trim());

    msg.content = parts.join('\n');
    summarized++;
  }

  return summarized;
}

/**
 * Truncate tool result messages older than `ageThreshold` positions from the
 * end to at most `maxChars`, appending a truncation notice.
 * This is a post-trim pass for additional size reduction.
 */
export function truncateOldToolResults(
  messages: ConversationMessage[],
  ageThreshold: number,
  maxChars: number,
): number {
  let truncated = 0;
  const cutoff = messages.length - ageThreshold;
  for (let i = 0; i < cutoff; i++) {
    const msg = messages[i];
    if (msg.role === 'tool' && msg.content.length > maxChars) {
      const original = msg.content.length;
      msg.content = `${msg.content.slice(0, maxChars)}... [truncated, was ${original} chars]`;
      truncated++;
    }
  }
  return truncated;
}

/**
 * Internal: Original trim logic (Tier 2 behavior).
 * Reduces the message window and summarizes discarded tool results.
 */
function trimMessagesTier2(messages: ConversationMessage[], _systemPrompt?: string): void {
  const keepCount = Math.max(6, Math.min(KEEP_RECENT, Math.floor(messages.length * 0.4)));

  const first = messages[0];
  const discarded = messages.slice(1, -keepCount);
  const recent = messages.slice(-keepCount);

  const summaries: string[] = [];

  const discardedPaths = extractMentionedFilePaths(discarded);
  if (discardedPaths.length > 0) {
    summaries.push(`[Files from earlier context: ${discardedPaths.slice(0, 20).join(', ')}]`);
  }

  const discardedDecisions = extractKeyDecisions(discarded.filter((m) => m.role === 'assistant'));
  if (discardedDecisions.length > 0) {
    summaries.push(`[Earlier decisions: ${discardedDecisions.map((d) => d.slice(0, 150)).join('; ')}]`);
  }

  const discardedErrors = extractErrorsAndResolutions(discarded);
  if (discardedErrors.length > 0) {
    summaries.push(`[Earlier errors/resolutions: ${discardedErrors.map((e) => e.slice(0, 150)).join('; ')}]`);
  }

  for (const msg of discarded) {
    if (msg.role === 'tool' && msg.content.length > 0) {
      const preview = msg.content.slice(0, 200).replace(/\n/g, ' ').trim();
      const lineCount = (msg.content.match(/\n/g) || []).length + 1;
      summaries.push(`[Previous tool result: ${preview}${msg.content.length > 200 ? '...' : ''} (${lineCount} lines)]`);
    }
  }

  if (recent[0] === first) {
    messages.length = 0;
    if (summaries.length > 0) {
      messages.push({ role: 'user', content: summaries.join('\n') });
    }
    messages.push(...recent);
  } else {
    messages.length = 0;
    messages.push(first);
    if (summaries.length > 0) {
      messages.push({ role: 'user', content: summaries.join('\n') });
    }
    messages.push(...recent);
  }
}

/**
 * Trim conversation history using progressive compression tiers.
 *
 * Tier 1 (70%): Summarize tool results older than 5 messages (200 char max).
 * Tier 2 (80%): Reduce recent window dynamically, summarize discarded results.
 * Tier 3 (88%): Keep only last 4 exchanges (8 messages), one-line tool summaries.
 * Tier 4 (93%): Replace all with context summary + last 2 exchanges (4 messages).
 *
 * Also triggers on message count exceeding MAX_MESSAGES.
 */
export function trimMessages(messages: ConversationMessage[], systemPrompt?: string, model?: string): void {
  const ctxSize = getContextBudget(model);
  const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
  const messageTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const totalTokens = systemTokens + messageTokens;
  const usageRatio = totalTokens / ctxSize;

  const overCount = messages.length > MAX_MESSAGES;

  // Determine which tier applies
  if (usageRatio >= COMPRESSION_TIERS[3].threshold) {
    // Tier 4: Full context summary + last 2 exchanges
    const summary = summarizeConversation(messages);
    const keepLast = Math.min(4, messages.length);
    const recent = messages.slice(-keepLast);
    messages.length = 0;
    messages.push({ role: 'user', content: summary });
    messages.push(...recent);
    const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
    log.info(
      `Trimmed conversation (tier4: full summary) to ${messages.length} messages — token budget (${totalTokens}→${newTokens} of ${ctxSize})`,
    );
    return;
  }

  if (usageRatio >= COMPRESSION_TIERS[2].threshold) {
    // Tier 3: Aggressive — keep last 4 exchanges (8 messages)
    const keepLast = Math.min(8, messages.length);
    const first = messages[0];
    const recent = messages.slice(-keepLast);
    // One-line summaries for all tool results older than 2 turns (4 messages)
    const discarded = messages.slice(0, -keepLast);
    const summaries: string[] = [];

    const discardedPaths = extractMentionedFilePaths(discarded);
    if (discardedPaths.length > 0) {
      summaries.push(`[Files from earlier context: ${discardedPaths.slice(0, 15).join(', ')}]`);
    }

    const discardedDecisions = extractKeyDecisions(discarded.filter((m) => m.role === 'assistant'));
    if (discardedDecisions.length > 0) {
      summaries.push(`[Earlier decisions: ${discardedDecisions.map((d) => d.slice(0, 100)).join('; ')}]`);
    }

    const discardedErrors = extractErrorsAndResolutions(discarded);
    if (discardedErrors.length > 0) {
      summaries.push(`[Earlier errors/resolutions: ${discardedErrors.map((e) => e.slice(0, 100)).join('; ')}]`);
    }

    for (const msg of discarded) {
      if (msg.role === 'tool' && msg.content.length > 0) {
        const preview = msg.content.slice(0, 80).replace(/\n/g, ' ').trim();
        summaries.push(`[Tool: ${preview}${msg.content.length > 80 ? '...' : ''}]`);
      }
    }

    if (recent[0] === first || !discarded.includes(first)) {
      messages.length = 0;
      if (summaries.length > 0) {
        messages.push({ role: 'user', content: summaries.join('\n') });
      }
      messages.push(...recent);
    } else {
      messages.length = 0;
      messages.push(first);
      if (summaries.length > 0) {
        messages.push({ role: 'user', content: summaries.join('\n') });
      }
      messages.push(...recent);
    }

    // Additionally compress any remaining old tool results
    compressToolResults(messages, 4, 80);

    const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
    log.info(
      `Trimmed conversation (tier3: aggressive) to ${messages.length} messages — token budget (${totalTokens}→${newTokens} of ${ctxSize})`,
    );
    return;
  }

  if (usageRatio >= COMPRESSION_TIERS[1].threshold || overCount) {
    // Tier 2: Original behavior with dynamic keep count
    trimMessagesTier2(messages, systemPrompt);
    const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
    const reason =
      overCount && usageRatio < COMPRESSION_TIERS[1].threshold
        ? `message count (>${MAX_MESSAGES})`
        : `token budget (${totalTokens}→${newTokens} of ${ctxSize})`;
    log.info(`Trimmed conversation (tier2: reduce window) to ${messages.length} messages — ${reason}`);
    return;
  }

  if (usageRatio >= COMPRESSION_TIERS[0].threshold) {
    // Tier 1: Light touch — just compress old tool results
    const compressed = compressToolResults(messages, 5, 200);
    if (compressed > 0) {
      const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
      log.info(
        `Compressed ${compressed} old tool results (tier1: light) — token budget (${totalTokens}→${newTokens} of ${ctxSize})`,
      );
    }
    return;
  }

  if (usageRatio >= PROACTIVE_THRESHOLD) {
    // Pre-tier: proactively summarize consumed tool results before compression kicks in
    const summarized = summarizeConsumedToolResults(messages, 500, 8);
    if (summarized > 0) {
      const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
      log.info(
        `Proactively summarized ${summarized} consumed tool results — token budget (${totalTokens}→${newTokens} of ${ctxSize})`,
      );
    }
    return;
  }

  // Below all thresholds — no action needed
}

/** Compute context usage metrics for the current message state. */
export function computeContextUsage(
  msgs: Array<{ role: string; content: string }>,
  sysPrompt: string,
  trimmed: boolean,
  model?: string,
): { estimatedTokens: number; contextWindow: number; usagePercent: number; messagesCount: number; trimmed: boolean } {
  const contextWindow = getContextBudget(model);
  const estimatedTokens = estimateTokens(sysPrompt) + msgs.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const usagePercent = Math.round((estimatedTokens / contextWindow) * 100);

  if (process.env.DEBUG_TOKEN_ESTIMATION) {
    const totalChars = (sysPrompt?.length ?? 0) + msgs.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
    const avgCharsPerToken = totalChars / Math.max(estimatedTokens, 1);
    log.debug(
      `Token estimation: ${estimatedTokens} tokens from ${totalChars} chars (avg ${avgCharsPerToken.toFixed(2)} ch/tok), ${usagePercent}% of ${contextWindow} budget`,
    );
  }

  return { estimatedTokens, contextWindow, usagePercent, messagesCount: msgs.length, trimmed };
}

/** Determine warning level and message for a given usage percent. */
export function determineWarningLevel(
  usagePercent: number,
): { level: 'info' | 'warning' | 'critical'; message: string } | null {
  if (usagePercent >= 85) {
    return {
      level: 'critical',
      message: `Context usage at ${usagePercent}% — session at risk of exhaustion. Consider starting a new session.`,
    };
  } else if (usagePercent >= 70) {
    return { level: 'warning', message: `Context usage at ${usagePercent}% — message trimming will start soon.` };
  } else if (usagePercent >= 50) {
    return { level: 'info', message: `Context usage at ${usagePercent}%.` };
  }
  return null;
}
