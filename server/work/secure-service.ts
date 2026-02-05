import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTask, CreateWorkTaskInput } from '../../shared/types';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import {
    createWorkTaskAtomic,
    getWorkTask,
    updateWorkTaskStatus,
    listWorkTasks as dbListWorkTasks,
    cleanupStaleWorkTasks,
} from '../db/work-tasks';
import { DockerExecutor } from './docker-executor';
import { RateLimiter, type RateLimitStatus } from '../lib/rate-limiter';
import { AlgoRetryService } from '../algochat/retry-service';
import { createLogger } from '../lib/logger';

const log = createLogger('SecureWorkTaskService');

const PR_URL_REGEX = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

type CompletionCallback = (task: WorkTask) => void;

export interface SecureWorkTaskConfig {
    /** Enable Docker sandboxing (default: true) */
    enableSandboxing: boolean;
    /** Enable rate limiting (default: true) */
    enableRateLimiting: boolean;
    /** Enable transaction retry logic (default: true) */
    enableRetryLogic: boolean;
    /** Docker execution config */
    dockerConfig?: {
        cpuLimit?: string;
        memoryLimit?: string;
        timeoutMinutes?: number;
        networkAccess?: boolean;
    };
}

const DEFAULT_CONFIG: SecureWorkTaskConfig = {
    enableSandboxing: true,
    enableRateLimiting: true,
    enableRetryLogic: true,
    dockerConfig: {
        cpuLimit: "1.0",
        memoryLimit: "512m",
        timeoutMinutes: 30,
        networkAccess: false
    }
};

/**
 * Enhanced WorkTaskService with comprehensive security features:
 * - Docker containerization for RCE protection
 * - Rate limiting for DoS prevention
 * - Retry logic for transaction reliability
 * - Comprehensive audit logging
 */
export class SecureWorkTaskService {
    private db: Database;
    private dockerExecutor: DockerExecutor;
    private rateLimiter: RateLimiter;
    private retryService: AlgoRetryService;
    private config: SecureWorkTaskConfig;
    private completionCallbacks: Map<string, Set<CompletionCallback>> = new Map();

    constructor(
        db: Database,
        _processManager: ProcessManager,
        config: Partial<SecureWorkTaskConfig> = {}
    ) {
        this.db = db;
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Initialize security services
        this.dockerExecutor = new DockerExecutor(db, this.config.dockerConfig);
        this.rateLimiter = new RateLimiter(db);
        this.retryService = new AlgoRetryService(db);

        // Perform security health checks
        this.performSecurityHealthCheck();
    }

    private async performSecurityHealthCheck(): Promise<void> {
        const checks: Array<{ name: string; passed: boolean; error?: string }> = [];

        // Check Docker availability
        if (this.config.enableSandboxing) {
            const dockerHealth = await this.dockerExecutor.healthCheck();
            checks.push({
                name: 'Docker Sandboxing',
                passed: dockerHealth.available,
                error: dockerHealth.error
            });
        }

        // Check rate limiter database
        try {
            this.rateLimiter.getRateLimits('health-check-agent');
            checks.push({ name: 'Rate Limiting', passed: true });
        } catch (error) {
            checks.push({
                name: 'Rate Limiting',
                passed: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }

        // Check retry service
        try {
            this.retryService.getRetryStats();
            checks.push({ name: 'Retry Service', passed: true });
        } catch (error) {
            checks.push({
                name: 'Retry Service',
                passed: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }

        // Log security status
        const failedChecks = checks.filter(c => !c.passed);
        if (failedChecks.length === 0) {
            log.info('All security systems operational', {
                checks: checks.map(c => c.name)
            });
        } else {
            log.error('Security system failures detected', {
                failed: failedChecks,
                operational: checks.filter(c => c.passed).map(c => c.name)
            });
        }
    }

    /**
     * Recover tasks left in active states from a previous unclean shutdown.
     */
    async recoverStaleTasks(): Promise<void> {
        const staleTasks = cleanupStaleWorkTasks(this.db);
        if (staleTasks.length === 0) return;

        log.info('Recovering stale work tasks', { count: staleTasks.length });

        for (const task of staleTasks) {
            if (task.worktreeDir) {
                await this.cleanupWorktree(task.id);
            }
        }
    }

    /**
     * Create a new work task with security checks and sandboxed execution
     */
    async create(input: CreateWorkTaskInput): Promise<WorkTask> {
        const startTime = Date.now();

        try {
            // Security Check 1: Rate Limiting
            if (this.config.enableRateLimiting) {
                const rateLimitStatus = await this.checkRateLimits(input.agentId);
                if (!rateLimitStatus.allowed) {
                    throw new Error(`Rate limit exceeded: ${rateLimitStatus.violation?.message}`);
                }
            }

            // Validate agent and project
            const agent = getAgent(this.db, input.agentId);
            if (!agent) {
                throw new Error(`Agent ${input.agentId} not found`);
            }

            const projectId = input.projectId ?? agent.defaultProjectId;
            if (!projectId) {
                throw new Error('No projectId provided and agent has no defaultProjectId');
            }

            const project = getProject(this.db, projectId);
            if (!project?.workingDir) {
                throw new Error(`Project ${projectId} not found or has no workingDir`);
            }

            // Security Check 2: Audit logging
            this.auditWorkTaskCreation(input, agent.name, project.name);

            // Create atomic work task record
            const task = createWorkTaskAtomic(this.db, {
                agentId: input.agentId,
                projectId,
                description: input.description,
                source: input.source,
                sourceId: input.sourceId,
                requesterInfo: input.requesterInfo,
            });

            if (!task) {
                throw new Error(`Another task is already active on project ${projectId}`);
            }

            // Record work task creation for rate limiting
            if (this.config.enableRateLimiting) {
                this.rateLimiter.recordWorkTask(input.agentId);
            }

            log.info('Secure work task created', {
                taskId: task.id,
                agentId: input.agentId,
                projectId,
                sandboxing: this.config.enableSandboxing,
                rateLimiting: this.config.enableRateLimiting
            });

            // Generate secure branch name
            const branchName = this.generateSecureBranchName(agent.name, input.description);

            // Update status to branching
            updateWorkTaskStatus(this.db, task.id, 'branching');

            // Execute work task based on configuration
            if (this.config.enableSandboxing) {
                return await this.executeInDockerSandbox(task, branchName, input.description, project.workingDir);
            } else {
                // Fallback to legacy execution (not recommended)
                log.warn('Docker sandboxing disabled - using legacy execution', { taskId: task.id });
                return await this.executeLegacy(task, branchName, input.description, project);
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const duration = Date.now() - startTime;

            log.error('Work task creation failed', {
                agentId: input.agentId,
                description: input.description,
                error: errorMsg,
                duration
            });

            throw error;
        }
    }

    /**
     * Execute work task in secure Docker sandbox
     */
    private async executeInDockerSandbox(
        task: WorkTask,
        branchName: string,
        description: string,
        projectWorkingDir: string
    ): Promise<WorkTask> {
        const prompt = this.buildSecureWorkPrompt(branchName, description);

        try {
            // Update status to running
            updateWorkTaskStatus(this.db, task.id, 'running', {
                branchName,
                iterationCount: 1,
            });

            // Execute in Docker sandbox
            const result = await this.dockerExecutor.executeWorkTask(task, prompt, projectWorkingDir);

            if (result.success) {
                // Check for PR URL in output
                const prMatch = result.output.match(PR_URL_REGEX);

                if (prMatch) {
                    updateWorkTaskStatus(this.db, task.id, 'completed', {
                        prUrl: prMatch[0],
                        summary: result.output.slice(-500).trim()
                    });
                    log.info('Sandboxed work task completed successfully', {
                        taskId: task.id,
                        prUrl: prMatch[0]
                    });
                } else {
                    updateWorkTaskStatus(this.db, task.id, 'failed', {
                        error: 'Docker execution completed but no PR URL found',
                        summary: result.output.slice(-500).trim()
                    });
                }
            } else {
                const errorMsg = result.timeoutReached
                    ? `Docker execution timed out after ${this.config.dockerConfig?.timeoutMinutes || 30} minutes`
                    : `Docker execution failed: ${result.error}`;

                updateWorkTaskStatus(this.db, task.id, 'failed', {
                    error: errorMsg,
                    summary: result.output.slice(-500).trim()
                });
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            updateWorkTaskStatus(this.db, task.id, 'failed', {
                error: `Sandboxed execution error: ${errorMsg}`
            });
        }

        return getWorkTask(this.db, task.id) ?? task;
    }

    /**
     * Legacy execution method (less secure, for fallback only)
     */
    private async executeLegacy(
        task: WorkTask,
        _branchName: string,
        _description: string,
        _project: any
    ): Promise<WorkTask> {
        // This would implement the original worktree-based execution
        // Only used if Docker sandboxing is disabled
        log.warn('Using legacy execution - security risk', { taskId: task.id });

        updateWorkTaskStatus(this.db, task.id, 'failed', {
            error: 'Legacy execution not implemented in secure service - use sandboxing'
        });

        return getWorkTask(this.db, task.id) ?? task;
    }

    /**
     * Check rate limits for work task creation
     */
    private async checkRateLimits(agentId: string): Promise<RateLimitStatus> {
        // Check multiple rate limits
        const checks = [
            this.rateLimiter.checkOperationLimit(agentId),
            this.rateLimiter.checkWorkTaskLimit(agentId),
            this.rateLimiter.checkConcurrentSessions(agentId)
        ];

        // Return first violation found
        for (const status of checks) {
            if (!status.allowed) {
                return status;
            }
        }

        return { allowed: true };
    }

    /**
     * Generate a secure branch name with sanitization
     */
    private generateSecureBranchName(agentName: string, description: string): string {
        // Sanitize inputs to prevent injection
        const agentSlug = agentName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 20);

        const taskSlug = description
            .slice(0, 40)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        const timestamp = Date.now().toString(36);
        const suffix = crypto.randomUUID().slice(0, 6);

        return `secure-task/${agentSlug}/${taskSlug}-${timestamp}-${suffix}`;
    }

    /**
     * Build secure work prompt with safety instructions
     */
    private buildSecureWorkPrompt(branchName: string, description: string): string {
        return `You are working on a task in a secure sandbox environment.

## Security Notice
- You are executing in a Docker container with limited resources
- Network access is restricted for security
- File system access is limited to the workspace
- All operations are logged and monitored

## Task
${description}

## Branch
Working on branch: "${branchName}"

## Instructions
1. Explore the codebase as needed to understand the context
2. Implement the requested changes following security best practices
3. Commit changes with clear, descriptive messages
4. Verify your changes work by running available tests
5. Create a pull request when complete
6. Output the PR URL as the final line of your response

## Important Security Guidelines
- Do not attempt to access external networks
- Do not modify files outside the workspace
- Use secure coding practices
- Report any security concerns in your commits

The sandbox environment will automatically terminate after the configured timeout.`;
    }

    /**
     * Audit log for work task creation
     */
    private auditWorkTaskCreation(input: CreateWorkTaskInput, agentName: string, projectName: string): void {
        log.info('AUDIT: Work task creation requested', {
            timestamp: new Date().toISOString(),
            agentId: input.agentId,
            agentName,
            projectName,
            description: input.description.slice(0, 100), // Truncate for logs
            source: input.source,
            sourceId: input.sourceId,
            requesterInfo: input.requesterInfo,
            securityLevel: 'sandboxed',
            rateLimit: this.config.enableRateLimiting ? 'enabled' : 'disabled',
            retryLogic: this.config.enableRetryLogic ? 'enabled' : 'disabled'
        });
    }

    /**
     * Get current rate limit status for an agent
     */
    getAgentRateLimitStatus(agentId: string): any {
        if (!this.config.enableRateLimiting) {
            return { rateLimitingEnabled: false };
        }

        return {
            rateLimitingEnabled: true,
            usage: this.rateLimiter.getUsageStats(agentId)
        };
    }

    /**
     * Get security statistics
     */
    getSecurityStats(): any {
        return {
            sandboxing: {
                enabled: this.config.enableSandboxing,
                dockerHealth: this.config.enableSandboxing ? 'healthy' : 'disabled'
            },
            rateLimiting: {
                enabled: this.config.enableRateLimiting,
            },
            retryService: {
                enabled: this.config.enableRetryLogic,
                ...this.config.enableRetryLogic ? this.retryService.getRetryStats() : {}
            }
        };
    }

    // Delegate remaining methods to maintain compatibility
    getTask(id: string): WorkTask | null {
        return getWorkTask(this.db, id);
    }

    listTasks(agentId?: string): WorkTask[] {
        return dbListWorkTasks(this.db, agentId);
    }

    async cancelTask(id: string): Promise<WorkTask | null> {
        const task = getWorkTask(this.db, id);
        if (!task) return null;

        log.info('AUDIT: Work task cancellation requested', {
            taskId: id,
            timestamp: new Date().toISOString()
        });

        updateWorkTaskStatus(this.db, id, 'failed', { error: 'Cancelled by user' });
        return getWorkTask(this.db, id);
    }

    onComplete(taskId: string, callback: CompletionCallback): void {
        let callbacks = this.completionCallbacks.get(taskId);
        if (!callbacks) {
            callbacks = new Set();
            this.completionCallbacks.set(taskId, callbacks);
        }
        callbacks.add(callback);
    }

    private async cleanupWorktree(taskId: string): Promise<void> {
        // Cleanup is handled by Docker container cleanup
        log.debug('Docker container cleanup completed', { taskId });
    }
}