import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import { getWorkTask, updateWorkTaskStatus, clearWorktreeDir } from '../db/work-tasks';
import { getProject } from '../db/projects';
import { getAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import { recordAudit } from '../db/audit';
import { runValidation } from './validation';
import { removeWorktree } from '../lib/worktree';
import { createLogger } from '../lib/logger';
import { checkInternPrGuard } from './intern-guard';
import { formatAgentSignature, formatCoAuthoredBy } from '../mcp/tool-handlers/github';

const log = createLogger('WorkTaskService');

const PR_URL_REGEX = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

const WORK_MAX_ITERATIONS = parseInt(process.env.WORK_MAX_ITERATIONS ?? '3', 10);

export interface SessionLifecycleContext {
    db: Database;
    processManager: ProcessManager;
    notifyCallbacks: (taskId: string) => void;
    notifyStatusChange: (taskId: string) => void;
    subscribeForCompletion: (taskId: string, sessionId: string) => void;
}

export async function handleSessionEnd(
    ctx: SessionLifecycleContext,
    taskId: string,
    sessionOutput: string,
): Promise<void> {
    const task = getWorkTask(ctx.db, taskId);
    if (!task || !task.projectId) return;

    // Use the worktree directory for validation (or fall back to project dir)
    const validationDir = task.worktreeDir ?? getProject(ctx.db, task.projectId)?.workingDir;
    if (!validationDir) {
        await finalizeTask(ctx, taskId, sessionOutput);
        return;
    }

    // Set status to validating
    updateWorkTaskStatus(ctx.db, taskId, 'validating');
    ctx.notifyStatusChange(taskId);
    log.info('Running post-session validation', { taskId });

    const validation = await runValidation(validationDir);
    const iteration = task.iterationCount || 1;

    if (validation.passed) {
        log.info('Validation passed', { taskId, iteration });
        await finalizeTask(ctx, taskId, sessionOutput);
        return;
    }

    log.warn('Validation failed', { taskId, iteration, maxIterations: WORK_MAX_ITERATIONS });

    if (iteration >= WORK_MAX_ITERATIONS) {
        // Max iterations reached — fail the task
        updateWorkTaskStatus(ctx.db, taskId, 'failed', {
            error: `Validation failed after ${iteration} iteration(s):\n${validation.output.slice(0, 2000)}`,
            summary: sessionOutput.slice(-500).trim(),
        });
        await cleanupWorktree(ctx.db, taskId);
        ctx.notifyCallbacks(taskId);
        return;
    }

    // Spawn a follow-up iteration — increment iteration count in DB
    updateWorkTaskStatus(ctx.db, taskId, 'running', { iterationCount: iteration + 1 });
    ctx.notifyStatusChange(taskId);

    const branchName = task.branchName ?? 'unknown';
    const iterationPrompt = buildIterationPrompt(branchName, validation.output);

    const session = createSession(ctx.db, {
        projectId: task.projectId,
        agentId: task.agentId,
        name: `Work iteration ${iteration + 1}: ${task.description.slice(0, 40)}`,
        initialPrompt: iterationPrompt,
        source: task.source,
        workDir: task.worktreeDir ?? undefined,
    });

    updateWorkTaskStatus(ctx.db, taskId, 'running', { sessionId: session.id });

    // Subscribe and start the new session
    ctx.subscribeForCompletion(taskId, session.id);
    ctx.processManager.startProcess(session, iterationPrompt);

    log.info('Spawned iteration session', {
        taskId,
        sessionId: session.id,
        iteration: iteration + 1,
    });
}

export async function finalizeTask(
    ctx: SessionLifecycleContext,
    taskId: string,
    sessionOutput: string,
): Promise<void> {
    let prUrl = sessionOutput.match(PR_URL_REGEX)?.[0] ?? null;

    // Service-level fallback: if the agent didn't produce a PR URL (common with
    // Ollama models), push the branch and create the PR ourselves.
    if (!prUrl) {
        prUrl = await createPrFallback(ctx.db, taskId, sessionOutput);
    }

    if (prUrl) {
        const summary = sessionOutput.slice(-500).trim();
        updateWorkTaskStatus(ctx.db, taskId, 'completed', { prUrl, summary });
        log.info('Work task completed with PR', { taskId, prUrl });

        recordAudit(ctx.db, 'work_task_complete', 'system', 'work_task', taskId, `Completed with PR: ${prUrl}`);
    } else {
        updateWorkTaskStatus(ctx.db, taskId, 'failed', {
            error: 'Session completed but no PR URL was found in output and service-level PR creation failed',
            summary: sessionOutput.slice(-500).trim(),
        });
        log.warn('Work task completed without PR URL', { taskId });
    }

    // Clean up the worktree (the branch persists for PR purposes)
    await cleanupWorktree(ctx.db, taskId);

    // Notify callbacks
    ctx.notifyCallbacks(taskId);
}

/**
 * Fallback PR creation: push the branch and run `gh pr create` at the service level.
 * Called when the agent session completed successfully (validation passed) but
 * did not output a PR URL — common with Ollama models that struggle with gh CLI.
 */
export async function createPrFallback(db: Database, taskId: string, sessionOutput: string): Promise<string | null> {
    const task = getWorkTask(db, taskId);
    if (!task?.branchName || !task.worktreeDir) return null;

    // Intern model guard — block push/PR for low-capability models (#1542)
    if (task.agentId) {
        const agent = getAgent(db, task.agentId);
        if (agent) {
            const guard = checkInternPrGuard(agent.model, taskId);
            if (guard.blocked) {
                log.warn('createPrFallback blocked by intern guard', { taskId, model: agent.model });
                return null;
            }
        }
    }

    const cwd = task.worktreeDir;

    // Resolve agent info for commit trailer and PR signature (#1576)
    const agent = task.agentId ? getAgent(db, task.agentId) : null;
    const coAuthor = formatCoAuthoredBy(agent);

    try {
        // Ensure origin remote exists — projects with persistent strategy may lack it (#1829)
        const hasOrigin = await ensureOriginRemote(db, task.projectId, cwd);
        if (!hasOrigin) {
            log.warn('Fallback: no origin remote and no gitUrl configured', { taskId, projectId: task.projectId });
            return null;
        }

        // Ensure all changes are committed (agent may have left unstaged changes)
        const statusProc = Bun.spawn(['git', 'diff', '--quiet'], { cwd, stdout: 'pipe', stderr: 'pipe' });
        await statusProc.exited;
        if (await statusProc.exited !== 0) {
            // There are uncommitted changes — commit them
            const addProc = Bun.spawn(['git', 'add', '-A'], { cwd, stdout: 'pipe', stderr: 'pipe' });
            await addProc.exited;
            const commitMsg = coAuthor
                ? `Work task: ${task.description.slice(0, 60)}\n\n${coAuthor}`
                : `Work task: ${task.description.slice(0, 60)}`;
            const commitProc = Bun.spawn(
                ['git', 'commit', '-m', commitMsg],
                { cwd, stdout: 'pipe', stderr: 'pipe' },
            );
            await commitProc.exited;
        }

        // Push the branch
        log.info('Fallback: pushing branch', { taskId, branch: task.branchName });
        const pushProc = Bun.spawn(
            ['git', 'push', '-u', 'origin', task.branchName],
            { cwd, stdout: 'pipe', stderr: 'pipe' },
        );
        const pushStderr = await new Response(pushProc.stderr).text();
        const pushExit = await pushProc.exited;

        if (pushExit !== 0) {
            log.warn('Fallback: git push failed', { taskId, stderr: pushStderr.trim() });
            return null;
        }

        // Create PR via gh CLI
        const title = `[Agent] ${task.description.slice(0, 60)}`;
        const baseBody = `Automated work task.\n\n**Description:** ${task.description}\n\n**Summary:** ${sessionOutput.slice(-300).trim()}`;
        const body = baseBody + formatAgentSignature(agent, taskId);
        log.info('Fallback: creating PR', { taskId, branch: task.branchName });

        const prProc = Bun.spawn(
            ['gh', 'pr', 'create', '--title', title, '--body', body, '--head', task.branchName],
            { cwd, stdout: 'pipe', stderr: 'pipe' },
        );
        const prStdout = await new Response(prProc.stdout).text();
        const prStderr = await new Response(prProc.stderr).text();
        const prExit = await prProc.exited;

        if (prExit !== 0) {
            log.warn('Fallback: gh pr create failed', { taskId, stderr: prStderr.trim() });
            return null;
        }

        const prUrl = prStdout.match(PR_URL_REGEX)?.[0] ?? null;
        if (prUrl) {
            log.info('Fallback: PR created successfully', { taskId, prUrl });
        }
        return prUrl;
    } catch (err) {
        log.warn('Fallback PR creation error', {
            taskId,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

export function buildIterationPrompt(branchName: string, validationOutput: string): string {
    return `You are on branch "${branchName}". A previous session made changes but validation failed.

## Validation Errors
\`\`\`
${validationOutput}
\`\`\`

## Instructions
1. Read the errors above carefully.
2. Fix the TypeScript and/or test failures on this branch.
3. Commit your fixes with clear messages.
4. Verify your changes work:
   bun x tsc --noEmit --skipLibCheck
   bun test
   Fix any remaining issues.
5. If a PR already exists, push your fixes. If not, create one:
   gh pr create --title "<concise title>" --body "<summary of changes>"
6. Output the PR URL as the final line of your response.

Important: You MUST ensure all validation passes and output the PR URL.`;
}

/**
 * Remove the git worktree for a task. The branch itself is kept
 * (it's needed for PRs and review).
 */
export async function cleanupWorktree(db: Database, taskId: string): Promise<void> {
    const task = getWorkTask(db, taskId);
    if (!task?.worktreeDir) return;

    const project = getProject(db, task.projectId);
    if (!project?.workingDir) return;

    await removeWorktree(project.workingDir, task.worktreeDir);
    clearWorktreeDir(db, taskId);
}

/**
 * Ensure the git repo at `cwd` has an `origin` remote.
 * If missing, look up the project's gitUrl and add it.
 * Returns true if origin exists (or was successfully added), false otherwise.
 */
export async function ensureOriginRemote(db: Database, projectId: string, cwd: string): Promise<boolean> {
    // Check if origin already exists
    const checkProc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], { cwd, stdout: 'pipe', stderr: 'pipe' });
    const checkExit = await checkProc.exited;
    if (checkExit === 0) return true;

    // Origin missing — try to add from project's gitUrl
    const project = getProject(db, projectId);
    if (!project?.gitUrl) return false;

    log.info('Adding missing origin remote from project gitUrl', { projectId, gitUrl: project.gitUrl });
    const addProc = Bun.spawn(
        ['git', 'remote', 'add', 'origin', project.gitUrl],
        { cwd, stdout: 'pipe', stderr: 'pipe' },
    );
    const addExit = await addProc.exited;
    return addExit === 0;
}
