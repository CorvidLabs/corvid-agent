import { createLogger } from '../lib/logger';

const log = createLogger('Condenser');

export interface CondensationResult {
    content: string;
    wasCondensed: boolean;
    originalBytes: number;
    condensedBytes: number;
}

/**
 * Condense a message to fit within a byte limit for on-chain transmission.
 * Uses Claude to intelligently summarize content that exceeds the limit.
 * When a messageId is provided, a DB reference suffix is appended so the
 * full message can be looked up from the on-chain audit trail.
 * On failure or if already within limits, returns the original content.
 */
export async function condenseMessage(
    content: string,
    maxBytes: number = 800,
    messageId?: string,
): Promise<CondensationResult> {
    const encoder = new TextEncoder();
    const originalBytes = encoder.encode(content).byteLength;

    if (originalBytes <= maxBytes) {
        return { content, wasCondensed: false, originalBytes, condensedBytes: originalBytes };
    }

    // Build a reference suffix when we have a message ID so on-chain records
    // can point back to the full content in the database.
    const refSuffix = messageId
        ? ` [full: ${originalBytes}B, id:${messageId.slice(0, 8)}]`
        : '';
    const refSuffixBytes = encoder.encode(refSuffix).byteLength;
    // Reserve space for the reference suffix in the condensation target
    const condenseTarget = maxBytes - refSuffixBytes;

    try {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic();

        const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: `You are a message condenser. Your job is to condense the user's message to fit within ${condenseTarget} bytes when UTF-8 encoded. Preserve the key information and intent. Output ONLY the condensed message, nothing else. Do not add any preamble or explanation.`,
            messages: [
                { role: 'user', content },
            ],
        });

        const condensed = response.content
            .filter((block) => block.type === 'text')
            .map((block) => 'text' in block ? block.text : '')
            .join('');

        const condensedBytes = encoder.encode(condensed).byteLength;

        // If Claude's output still exceeds limit, truncate as last resort
        if (condensedBytes > condenseTarget) {
            const truncated = truncateToBytes(condensed, condenseTarget - 14) + '...';
            const finalContent = `[condensed] ${truncated}${refSuffix}`;
            const finalBytes = encoder.encode(finalContent).byteLength;
            log.warn('Condensed output still too large, truncating', { condensedBytes, maxBytes });
            return {
                content: finalContent,
                wasCondensed: true,
                originalBytes,
                condensedBytes: finalBytes,
            };
        }

        const finalContent = `[condensed] ${condensed}${refSuffix}`;
        const finalBytes = encoder.encode(finalContent).byteLength;
        log.info('Message condensed', { originalBytes, condensedBytes: finalBytes });
        return {
            content: finalContent,
            wasCondensed: true,
            originalBytes,
            condensedBytes: finalBytes,
        };
    } catch (err) {
        log.error('Condensation failed, truncating as fallback', {
            error: err instanceof Error ? err.message : String(err),
        });

        // Fallback: simple truncation
        const truncated = truncateToBytes(content, condenseTarget - 3) + '...';
        const finalContent = truncated + refSuffix;
        return {
            content: finalContent,
            wasCondensed: true,
            originalBytes,
            condensedBytes: encoder.encode(finalContent).byteLength,
        };
    }
}

function truncateToBytes(str: string, maxBytes: number): string {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const encoded = encoder.encode(str);
    if (encoded.byteLength <= maxBytes) return str;
    // Slice and decode, handling potential mid-codepoint truncation
    return decoder.decode(encoded.slice(0, maxBytes));
}
