import { splitEmbedDescription } from '../embeds';

/** Drop whitespace-only chunks so Discord never receives empty-looking embed bodies. */
export function visibleEmbedParts(text: string): string[] {
  return splitEmbedDescription(text.trim())
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Exported for testing. Maps an error type to a user-facing embed title, description, and color. */
export function sessionErrorEmbed(
  errorType: string,
  fallbackMessage?: string,
): { title: string; description: string; color: number } {
  switch (errorType) {
    case 'context_exhausted':
      return {
        title: 'Context Limit Reached',
        description:
          'The conversation ran out of context space. Send a message to continue with fresh context — the agent will pick up where it left off.',
        color: 0xf0b232,
      };
    case 'credits_exhausted':
      return {
        title: 'Credits Exhausted',
        description:
          'Session paused — credits have been used up. Top up credits in Settings > Spending, then send a message to resume.',
        color: 0xf0b232,
      };
    case 'timeout':
      return {
        title: 'Session Timed Out',
        description:
          'The session exceeded its time limit. Send a message to restart — try breaking your request into smaller steps.',
        color: 0xf0b232,
      };
    case 'crash':
      return {
        title: 'Session Crashed',
        description:
          'The agent session crashed unexpectedly. Press Resume to restart, or send a new message. If this keeps happening, check the dashboard for details.',
        color: 0xff3355,
      };
    case 'spawn_error':
      return {
        title: 'Failed to Start',
        description:
          "The agent session could not be started. Check that the agent's provider (API key, model) is configured correctly in the dashboard.",
        color: 0xff3355,
      };
    default:
      return {
        title: 'Session Error',
        description: (fallbackMessage || 'An unexpected error occurred.').slice(0, 4096),
        color: 0xff3355,
      };
  }
}
