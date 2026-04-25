/** Strip previously injected `<conversation_history>` blocks to prevent recursive nesting (#2122). */
export function stripConversationHistory(content: string): string {
  return content.replace(/<conversation_history>[\s\S]*?<\/conversation_history>\s*/g, '').trim();
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
