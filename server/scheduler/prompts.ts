/**
 * Prompt builders for scheduled actions.
 *
 * Each action type has a builder that converts its ActionConfig into a
 * concrete prompt string and a session timeout (in ms).
 */

import type { ActionConfig, PromptBuildResult } from './types';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/**
 * Build a prompt for the `star_repos` action type.
 *
 * Instructs the agent to discover and star repositories by topic using the gh CLI.
 */
function buildStarReposPrompt(config: ActionConfig & { type: 'star_repos' }): PromptBuildResult {
    const topics = config.topics.join(', ');
    const langClause = config.language ? ` written in ${config.language}` : '';
    const starsClause = config.minStars ? ` with at least ${config.minStars} stars` : '';
    const maxPerRun = config.maxPerRun ?? 5;

    const prompt = [
        `You are running an automated scheduled task: discover and star interesting GitHub repositories.`,
        ``,
        `## Instructions`,
        `1. Use the \`gh\` CLI to search for repositories matching these topics: ${topics}${langClause}${starsClause}.`,
        `2. For each topic, run a search like: \`gh search repos "<topic>" --sort stars --order desc --limit 20\``,
        config.language ? `3. Filter results to only ${config.language} repositories.` : null,
        config.minStars ? `3. Only consider repos with >= ${config.minStars} stars.` : null,
        `4. Star up to ${maxPerRun} repositories total using: \`gh repo star <owner>/<repo>\``,
        `5. Skip repositories you've already starred (gh will report this).`,
        `6. Report which repositories you starred and why they looked interesting.`,
        ``,
        `## Constraints`,
        `- Maximum ${maxPerRun} repos per run.`,
        `- Only star repos that look genuinely useful or interesting based on description, stars, and recent activity.`,
        `- Do NOT fork or clone any repository.`,
        `- Do NOT create any issues or pull requests.`,
    ].filter(Boolean).join('\n');

    return { prompt, sessionTimeout: TEN_MINUTES_MS };
}

/**
 * Build a prompt for the `custom` action type.
 *
 * Passes through the user-provided prompt directly.
 */
function buildCustomPrompt(config: ActionConfig & { type: 'custom' }): PromptBuildResult {
    const prompt = [
        `You are running an automated scheduled task with a custom prompt.`,
        ``,
        `## Task`,
        config.prompt,
        ``,
        `## Constraints`,
        `- Complete the task and report your results.`,
        `- If the task is unclear, do your best interpretation and explain your reasoning.`,
    ].join('\n');

    return { prompt, sessionTimeout: THIRTY_MINUTES_MS };
}

/**
 * Build a prompt + timeout for a given action config.
 *
 * Only star_repos and custom are implemented in Phase 1.
 * Other action types throw an error — they will be added in later phases.
 */
export function buildPrompt(config: ActionConfig): PromptBuildResult {
    switch (config.type) {
        case 'star_repos':
            return buildStarReposPrompt(config);
        case 'custom':
            return buildCustomPrompt(config);
        default:
            throw new Error(`Unsupported action type: ${(config as ActionConfig).type}. Only star_repos and custom are implemented.`);
    }
}
