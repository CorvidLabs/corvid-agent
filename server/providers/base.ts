import type { LlmProviderType, ExecutionMode, LlmCompletionParams, LlmCompletionResult, LlmProviderInfo, LlmProvider } from './types';
import { ValidationError } from '../lib/errors';

export abstract class BaseLlmProvider implements LlmProvider {
    abstract readonly type: LlmProviderType;
    abstract readonly executionMode: ExecutionMode;

    abstract getInfo(): LlmProviderInfo;

    async complete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        if (!params.model) {
            throw new ValidationError(`[${this.type}] model is required`);
        }
        if (!params.messages || params.messages.length === 0) {
            throw new ValidationError(`[${this.type}] at least one message is required`);
        }
        return this.doComplete(params);
    }

    protected abstract doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult>;

    async isAvailable(): Promise<boolean> {
        return true;
    }
}
