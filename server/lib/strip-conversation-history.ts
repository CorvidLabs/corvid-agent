/** Strip previously injected `<conversation_history>` blocks to prevent recursive nesting (#2122, #2136). */
export function stripConversationHistory(content: string): string {
  // Match innermost blocks first (no nested opening tag inside), then loop to collapse nesting.
  const innermost = /<conversation_history>(?:(?!<conversation_history>)[\s\S])*?<\/conversation_history>\s*/g;
  let result = content;
  let prev: string;
  do {
    prev = result;
    result = result.replace(innermost, '');
  } while (result !== prev);
  // Strip any orphaned open/close tags left over
  return result.replace(/<\/?conversation_history>\s*/g, '').trim();
}

/** Extract main topics from a conversation by looking at user messages. */
export function extractConversationTopics(messages: Array<{ role: string; content: string }>): string[] {
  const userMessages = messages.filter((m) => m.role === 'user').map((m) => stripConversationHistory(m.content));

  const topics = new Set<string>();
  for (const msg of userMessages.slice(0, 3)) {
    const words = msg.split(/\s+/).slice(0, 2).join(' ');
    if (words.length > 3) topics.add(words);
  }
  return Array.from(topics).slice(0, 3);
}
