/**
 * Prompt builder for the autonomous improvement loop.
 *
 * Builds a rich prompt that includes codebase health metrics, past attempt
 * memories, reputation context, and prioritized instructions.
 */

import type { HealthMetrics, TscError, LargeFile, OutdatedDep } from './health-collector';
import type { ScoredMemory } from '../memory/semantic-search';
import type { ReputationScore, TrustLevel } from '../reputation/types';

export interface PromptOptions {
    maxTasks: number;
    focusArea?: string;
}

function formatTscErrors(errors: TscError[], limit: number = 15): string {
    if (errors.length === 0) return 'None — TypeScript compilation is clean.';
    const shown = errors.slice(0, limit);
    const lines = shown.map((e) => `  - ${e.file}(${e.line},${e.col}): ${e.code} — ${e.message}`);
    if (errors.length > limit) {
        lines.push(`  ... and ${errors.length - limit} more errors`);
    }
    return lines.join('\n');
}

function formatLargeFiles(files: LargeFile[], limit: number = 10): string {
    if (files.length === 0) return 'None over threshold.';
    return files.slice(0, limit).map((f) => `  - ${f.file}: ${f.lines} lines`).join('\n');
}

function formatOutdatedDeps(deps: OutdatedDep[], limit: number = 10): string {
    if (deps.length === 0) return 'All dependencies are up to date.';
    return deps.slice(0, limit).map((d) => `  - ${d.name}: ${d.current} → ${d.latest}`).join('\n');
}

function formatPastAttempts(memories: ScoredMemory[]): string {
    if (memories.length === 0) return 'No previous improvement attempts found.';
    return memories.map((m, i) => {
        const key = m.memory.key;
        const content = m.memory.content.slice(0, 300);
        return `  ${i + 1}. [${key}] ${content}${m.memory.content.length > 300 ? '...' : ''}`;
    }).join('\n');
}

function trustLevelDescription(level: TrustLevel): string {
    switch (level) {
        case 'untrusted': return 'UNTRUSTED — actions severely restricted';
        case 'low': return 'LOW — limited to simple, safe fixes only';
        case 'medium': return 'MEDIUM — moderate complexity tasks allowed';
        case 'high': return 'HIGH — complex improvements allowed';
        case 'verified': return 'VERIFIED — full autonomy granted';
    }
}

export function buildImprovementPrompt(
    health: HealthMetrics,
    pastAttempts: ScoredMemory[],
    reputation: ReputationScore,
    options: PromptOptions,
    trendSummary?: string,
    outcomeContext?: string,
): string {
    const sections: string[] = [];

    // Header
    sections.push(
        `# Autonomous Improvement Loop\n` +
        `You are performing an automated codebase improvement cycle. ` +
        `Analyze the health metrics below, consider past attempts, and create targeted work tasks.`,
    );

    // Reputation context
    sections.push(
        `## Your Reputation\n` +
        `- Overall score: ${reputation.overallScore}/100\n` +
        `- Trust level: ${trustLevelDescription(reputation.trustLevel)}\n` +
        `- Maximum work tasks this run: **${options.maxTasks}**`,
    );

    // Focus area
    if (options.focusArea) {
        sections.push(
            `## Focus Area\n` +
            `The owner has requested focus on: **${options.focusArea}**\n` +
            `Prioritize improvements in this area when possible.`,
        );
    }

    // Health metrics
    sections.push(
        `## Codebase Health Metrics\n` +
        `Collected at: ${health.collectedAt} (took ${health.collectionTimeMs}ms)\n\n` +
        `### TypeScript Compilation (${health.tscPassed ? 'PASSING' : 'FAILING'} — ${health.tscErrorCount} errors)\n` +
        formatTscErrors(health.tscErrors) + '\n\n' +
        `### Tests (${health.testsPassed ? 'PASSING' : 'FAILING'} — ${health.testFailureCount} failures)\n` +
        `${health.testSummary}\n\n` +
        `### Code Markers\n` +
        `- TODOs: ${health.todoCount}\n` +
        `- FIXMEs: ${health.fixmeCount}\n` +
        `- HACKs: ${health.hackCount}\n` +
        (health.todoSamples.length > 0 ? `\nSamples:\n${health.todoSamples.map((s) => `  - ${s}`).join('\n')}` : '') + '\n\n' +
        `### Large Files (>500 lines)\n` +
        formatLargeFiles(health.largeFiles) + '\n\n' +
        `### Outdated Dependencies\n` +
        formatOutdatedDeps(health.outdatedDeps),
    );

    // Health trends
    if (trendSummary) {
        sections.push(
            `## Health Trends\n` +
            `Direction of each metric over recent improvement cycles:\n\n` +
            trendSummary,
        );
    }

    // Past attempts
    sections.push(
        `## Past Improvement Attempts\n` +
        `Review these to avoid repeating failed approaches:\n\n` +
        formatPastAttempts(pastAttempts),
    );

    // PR outcome feedback
    if (outcomeContext) {
        sections.push(outcomeContext);
    }

    // Instructions
    sections.push(
        `## Instructions\n\n` +
        `1. **Prioritize by severity**: type errors > test failures > FIXMEs > large files > outdated deps > TODOs\n` +
        `2. **Don't repeat failed approaches** — check past attempts above\n` +
        `3. **Create up to ${options.maxTasks} work tasks** via \`corvid_create_work_task\` for the most impactful fixes\n` +
        `4. **Save your analysis** to memory via \`corvid_save_memory\` with key \`improvement_loop:outcome:{ISO timestamp}\`\n` +
        `5. **Notify the owner** via \`corvid_notify_owner\` with a summary of findings and created tasks\n` +
        `6. Each work task description should be specific and actionable — include file paths, error codes, and expected outcomes\n` +
        `7. Focus on changes that will pass validation (\`bunx tsc --noEmit --skipLibCheck\` and \`bun test\`)\n` +
        `8. Do NOT modify protected files (spending.ts, sdk-process.ts, manager.ts, sdk-tools.ts, tool-handlers.ts, schema.ts, package.json, CLAUDE.md, .env, server/index.ts, etc.)`,
    );

    return sections.join('\n\n');
}
