/** Strip previously injected `<conversation_history>` blocks to prevent recursive nesting (#2122). */
export function stripConversationHistory(content: string): string {
  return content.replace(/<conversation_history>[\s\S]*?<\/conversation_history>\s*/g, '').trim();
}
