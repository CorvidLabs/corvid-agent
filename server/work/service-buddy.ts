import type { WorkTask, CreateWorkTaskInput } from '../../shared/types';
import type { BuddyService } from '../buddy/service';
import { createLogger } from '../lib/logger';

const log = createLogger('WorkTaskService');

export interface BuddyConfig {
    buddyAgentId: string;
    maxRounds?: number;
}

/**
 * Store buddy config for a task if provided in the input.
 * Returns the config if stored, null otherwise.
 */
export function extractBuddyConfig(input: CreateWorkTaskInput): BuddyConfig | null {
    if (!input.buddyConfig?.buddyAgentId) return null;
    return {
        buddyAgentId: input.buddyConfig.buddyAgentId,
        maxRounds: input.buddyConfig.maxRounds,
    };
}

/**
 * Trigger buddy review after a work task completes.
 * Cleans up the buddy config from the map after running.
 */
export async function triggerBuddyReview(
    task: WorkTask,
    buddyConfig: BuddyConfig,
    buddyService: BuddyService,
): Promise<void> {
    // Only review successful completions
    if (task.status !== 'completed') return;

    log.info('Triggering buddy review', {
        taskId: task.id,
        buddyAgentId: buddyConfig.buddyAgentId,
    });

    const reviewPrompt = [
        `Review this completed work task:`,
        ``,
        `**Task:** ${task.description}`,
        task.branchName ? `**Branch:** ${task.branchName}` : '',
        task.prUrl ? `**PR:** ${task.prUrl}` : '',
        task.summary ? `\n**Summary:**\n${task.summary.slice(0, 4000)}` : '',
        ``,
        `Please review the work and provide feedback. If the PR URL is available, review the changes.`,
    ].filter(Boolean).join('\n');

    await buddyService.startSession({
        leadAgentId: task.agentId,
        buddyAgentId: buddyConfig.buddyAgentId,
        prompt: reviewPrompt,
        source: (task.source as 'web' | 'discord' | 'algochat' | 'cli' | 'agent') || 'web',
        workTaskId: task.id,
        maxRounds: buddyConfig.maxRounds,
    });
}
