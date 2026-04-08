import { assessImpact, GOVERNANCE_TIERS, type GovernanceImpact } from '../councils/governance';

/**
 * Extract file paths referenced in a task description.
 * Matches patterns like `server/foo/bar.ts`, `src/component.tsx`, etc.
 */
export function extractReferencedPaths(description: string): string[] {
    const pathPattern = /(?:^|\s|`|"|'|\()((?:server|src|shared|cli|specs|scripts)\/[\w./-]+\.(?:ts|tsx|js|json|md|sql)|(?:CLAUDE\.md|package\.json|tsconfig\.json|\.env\b[\w.]*))/g;
    const paths = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = pathPattern.exec(description)) !== null) {
        paths.add(match[1]);
    }
    return [...paths];
}

/**
 * Assess governance impact of a work task based on file paths in its description.
 */
export function assessGovernanceImpact(description: string): GovernanceImpact | null {
    const referencedPaths = extractReferencedPaths(description);
    if (referencedPaths.length === 0) return null;
    return assessImpact(referencedPaths);
}

export function buildWorkPrompt(
    branchName: string,
    description: string,
    repoMap?: string,
    relevantSymbols?: string,
    governanceImpact?: GovernanceImpact | null,
): string {
    const repoMapSection = repoMap
        ? `\n## Repository Map\nTop-level exported symbols per file (with line ranges):\n\`\`\`\n${repoMap}\`\`\`\n`
        : '';

    const relevantSymbolsSection = relevantSymbols
        ? `\n## Relevant Symbols\nSymbols matching keywords from the task description — likely starting points:\n\`\`\`\n${relevantSymbols}\n\`\`\`\nUse \`corvid_code_symbols\` and \`corvid_find_references\` tools for deeper exploration of these symbols.\n`
        : '';

    // Build governance warning section if there are restricted paths
    let governanceSection = '';
    if (governanceImpact && governanceImpact.tier < 2) {
        const restrictedPaths = governanceImpact.affectedPaths
            .filter((p) => p.tier < 2)
            .map((p) => `- \`${p.path}\` — Layer ${p.tier} (${GOVERNANCE_TIERS[p.tier].label})`)
            .join('\n');
        governanceSection = `\n## Governance Restrictions\nThe following files are protected by governance tiers and MUST NOT be modified by automated workflows:\n${restrictedPaths}\nLayer 0 (Constitutional) files require human-only commits. Layer 1 (Structural) files require supermajority council vote + human approval.\nIf your task requires changes to these files, document the needed changes in the PR description but do NOT modify them directly.\n`;
    }

    return `You are working on a task. A git branch "${branchName}" has been created and checked out.

## Task
${description}
${repoMapSection}${relevantSymbolsSection}${governanceSection}
## Instructions
1. Explore the codebase as needed to understand the context.
2. Implement the changes on this branch.
3. Commit with clear, descriptive messages as you go.
4. Verify your changes work:
   bun x tsc --noEmit --skipLibCheck
   bun test
   Fix any issues before creating the PR.
5. When done, create a PR:
   gh pr create --title "<concise title>" --body "<summary of changes>"
6. Output the PR URL as the final line of your response.

Important: You MUST create a PR when finished. The PR URL will be captured to report back to the requester.`;
}
