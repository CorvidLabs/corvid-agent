/**
 * Custom error types for CorvidAgent.
 *
 * NotImplementedError replaces stubs that silently return fake data.
 * When a code path hits one of these, it fails loudly instead of
 * corrupting state with placeholder values.
 */

export class NotImplementedError extends Error {
    constructor(feature: string, context?: string) {
        const message = context
            ? `Not implemented: ${feature} — ${context}`
            : `Not implemented: ${feature}`;
        super(message);
        this.name = 'NotImplementedError';
    }
}
