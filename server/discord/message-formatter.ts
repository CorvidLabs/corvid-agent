/**
 * Smart message splitting and formatting for Discord.
 *
 * Splits messages at natural boundaries (paragraphs, sentences) and
 * preserves code blocks — never splitting mid-block.
 */

const MAX_EMBED_DESCRIPTION = 4096;
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Split text into chunks that fit within a character limit,
 * respecting natural boundaries and code block integrity.
 */
export function splitMessage(text: string, maxLen: number = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) return [text];

  const segments = extractSegments(text);
  const chunks: string[] = [];
  let current = '';

  for (const segment of segments) {
    // If a single segment exceeds maxLen, we need to sub-split it
    if (segment.length > maxLen) {
      // Flush current buffer
      if (current) {
        chunks.push(current.trimEnd());
        current = '';
      }

      if (segment.startsWith('```')) {
        // Code block too long — split within block, preserving fences
        chunks.push(...splitCodeBlock(segment, maxLen));
      } else {
        // Regular text too long — split at sentence boundaries
        chunks.push(...splitAtSentences(segment, maxLen));
      }
      continue;
    }

    // Would adding this segment exceed the limit?
    if (current.length + segment.length > maxLen) {
      if (current) {
        chunks.push(current.trimEnd());
      }
      current = segment;
    } else {
      current += segment;
    }
  }

  if (current.trimEnd()) {
    chunks.push(current.trimEnd());
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Split text for Discord embed descriptions (4096 char limit).
 */
export function splitEmbedDescription(text: string): string[] {
  return splitMessage(text, MAX_EMBED_DESCRIPTION);
}

/**
 * Extract segments from text, keeping code blocks as atomic units
 * and splitting regular text at paragraph boundaries.
 */
function extractSegments(text: string): string[] {
  const segments: string[] = [];
  const codeBlockRe = /```[\s\S]*?```/g;
  let lastIndex = 0;

  let match = codeBlockRe.exec(text);
  while (match !== null) {
    // Text before this code block — split into paragraphs
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      segments.push(...splitIntoParagraphs(before));
    }
    // The code block itself — keep atomic
    segments.push(match[0]);
    lastIndex = match.index + match[0].length;
    match = codeBlockRe.exec(text);
  }

  // Remaining text after last code block
  if (lastIndex < text.length) {
    segments.push(...splitIntoParagraphs(text.slice(lastIndex)));
  }

  return segments;
}

/**
 * Split text at double-newline (paragraph) boundaries.
 * Preserves the newlines so chunks can be reassembled cleanly.
 */
function splitIntoParagraphs(text: string): string[] {
  if (!text) return [];
  // Split on double newlines but keep the delimiter
  const parts = text.split(/(\n\n+)/);
  const result: string[] = [];
  let current = '';

  for (const part of parts) {
    current += part;
    // If this part is a paragraph separator, flush
    if (/^\n\n+$/.test(part)) {
      result.push(current);
      current = '';
    }
  }

  if (current) result.push(current);
  return result;
}

/**
 * Split a code block that exceeds maxLen, preserving fences.
 * Each chunk gets its own opening/closing ```.
 */
function splitCodeBlock(block: string, maxLen: number): string[] {
  // Extract language identifier and content
  const openMatch = block.match(/^```(\w*)\n?/);
  const lang = openMatch?.[1] ?? '';
  const openFence = `\`\`\`${lang}\n`;
  const closeFence = '\n```';
  const overhead = openFence.length + closeFence.length;

  // Strip fences to get inner content
  const inner = block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');

  const contentMax = maxLen - overhead;
  if (contentMax <= 0) {
    // Edge case: maxLen too small for fences — just hard-split
    return hardSplit(block, maxLen);
  }

  const lines = inner.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const lineWithNewline = current ? `\n${line}` : line;

    if (current.length + lineWithNewline.length > contentMax) {
      if (current) {
        chunks.push(openFence + current + closeFence);
      }
      current = line;
    } else {
      current += lineWithNewline;
    }
  }

  if (current) {
    chunks.push(openFence + current + closeFence);
  }

  return chunks;
}

/**
 * Split text at sentence boundaries (. ! ? followed by space or newline).
 */
function splitAtSentences(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Look for the last sentence boundary within maxLen
    const window = remaining.slice(0, maxLen);
    const sentenceEnd = findLastSentenceBoundary(window);

    if (sentenceEnd > 0) {
      chunks.push(remaining.slice(0, sentenceEnd).trimEnd());
      remaining = remaining.slice(sentenceEnd).trimStart();
    } else {
      // No sentence boundary found — fall back to word boundary
      const wordEnd = window.lastIndexOf(' ');
      if (wordEnd > maxLen * 0.3) {
        chunks.push(remaining.slice(0, wordEnd).trimEnd());
        remaining = remaining.slice(wordEnd).trimStart();
      } else {
        // No good break point — hard split
        chunks.push(remaining.slice(0, maxLen));
        remaining = remaining.slice(maxLen);
      }
    }
  }

  if (remaining.trimEnd()) {
    chunks.push(remaining.trimEnd());
  }

  return chunks;
}

/**
 * Find the last sentence-ending position in text.
 * Returns the index after the sentence-ending punctuation + space.
 */
function findLastSentenceBoundary(text: string): number {
  // Match sentence endings: period, exclamation, question mark
  // followed by a space or newline (to avoid splitting on abbreviations like "e.g.")
  let lastPos = -1;
  const re = /[.!?]\s/g;
  let m = re.exec(text);
  while (m !== null) {
    lastPos = m.index + m[0].length;
    m = re.exec(text);
  }
  return lastPos;
}

/**
 * Collapse large fenced code blocks into a brief summary.
 * Prevents tool output (e.g. Write tool file contents) from flooding
 * Discord channels. Small code blocks are preserved as-is.
 */
export function collapseCodeBlocks(text: string, lineThreshold: number = 12): string {
  return text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, content: string) => {
    const lines = content.split('\n');
    if (lines.length <= lineThreshold) return _match;
    const langLabel = lang || 'code';
    return `*\`[${langLabel} — ${lines.length} lines]\`*`;
  });
}

/**
 * Hard-split text at maxLen boundaries. Last resort.
 */
function hardSplit(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}
