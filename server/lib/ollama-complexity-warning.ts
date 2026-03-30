/**
 * Ollama Complexity Warning
 *
 * Emits an advisory warning when a user selects an Ollama model for a task
 * that is detected as complex. The warning is non-blocking — callers must
 * NOT prevent task execution based on this result.
 *
 * Security note: this module is stateless, deterministic, and reads only the
 * prompt string and model name. No credentials, mnemonics, or API keys are
 * inspected or stored.
 */
import { type ComplexityLevel, estimateComplexity } from '../providers/router';

/** Complexity levels that trigger an advisory warning for Ollama models. */
const COMPLEX_LEVELS: ReadonlySet<ComplexityLevel> = new Set(['complex', 'expert']);

/**
 * Returns true when the provider string identifies an Ollama model.
 * Accepts the `provider` field from an Agent record.
 */
export function isOllamaProvider(provider: string | undefined): boolean {
  return provider === 'ollama';
}

/**
 * Builds an advisory warning message when an Ollama model is selected for a
 * complex task. Returns `null` when no warning is needed (simple/moderate task,
 * or non-Ollama provider).
 *
 * @param prompt  - The initial prompt / task description.
 * @param model   - The Ollama model name (e.g. "llama3.3", "qwen3:8b").
 * @param provider - The provider string from the agent config.
 */
export function buildOllamaComplexityWarning(
  prompt: string,
  model: string,
  provider: string | undefined,
): string | null {
  if (!isOllamaProvider(provider)) return null;
  if (!prompt.trim()) return null;

  const { level, signals } = estimateComplexity(prompt);

  if (!COMPLEX_LEVELS.has(level)) return null;

  const reasons: string[] = [];
  if (signals.multiStep) reasons.push('multi-step reasoning');
  if (signals.requiresThinking) reasons.push('extended thinking');
  if (signals.complexityKeywords > 0) reasons.push('high-complexity keywords');
  if (signals.suggestsSubagents) reasons.push('parallel sub-tasks');
  if (signals.inputTokenEstimate > 1000) reasons.push('large context');

  const reasonStr = reasons.length > 0 ? ` (detected: ${reasons.join(', ')})` : '';

  return (
    `Advisory: task complexity is "${level}"${reasonStr} but model "${model}" is a local ` +
    `Ollama model. Local models may produce lower-quality results for complex tasks. ` +
    `Consider upgrading to a Claude tier (claude-sonnet-4-6 or claude-opus-4-6) for ` +
    `best results. Task will proceed with the selected model.`
  );
}
