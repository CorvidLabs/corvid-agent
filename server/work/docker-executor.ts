import { resolve } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { WorkTask } from '../../shared/types';
import { getProject } from '../db/projects';
import { createLogger } from '../lib/logger';

const log = createLogger('DockerExecutor');

export interface DockerExecutionConfig {
    /** Maximum CPU cores (e.g., "1.0") */
    cpuLimit: string;
    /** Maximum memory (e.g., "512m") */
    memoryLimit: string;
    /** Execution timeout in minutes */
    timeoutMinutes: number;
    /** Whether to allow network access (default: false) */
    networkAccess: boolean;
}

const DEFAULT_CONFIG: DockerExecutionConfig = {
    cpuLimit: "1.0",
    memoryLimit: "512m",
    timeoutMinutes: 30,
    networkAccess: false
};

export interface DockerExecutionResult {
    success: boolean;
    exitCode: number;
    output: string;
    error: string;
    timeoutReached: boolean;
}

/**
 * Secure Docker-based execution service for work tasks.
 * Provides sandboxed environment with resource limits and network isolation.
 */
export class DockerExecutor {
    private db: Database;
    private config: DockerExecutionConfig;
    private containerPrefix = 'corvid-work-task';

    constructor(db: Database, config: Partial<DockerExecutionConfig> = {}) {
        this.db = db;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Execute a work task in a secure Docker container
     */
    async executeWorkTask(
        task: WorkTask,
        prompt: string,
        projectWorkingDir: string
    ): Promise<DockerExecutionResult> {
        const containerId = `${this.containerPrefix}-${task.id}`;

        try {
            log.info('Starting Docker execution for work task', {
                taskId: task.id,
                containerId,
                config: this.config
            });

            // Build the sandbox container if it doesn't exist
            await this.ensureSandboxImage();

            // Create container with security restrictions
            const createResult = await this.createSecureContainer(
                containerId,
                task,
                projectWorkingDir,
                prompt
            );

            if (!createResult.success) {
                return createResult;
            }

            // Execute the work task in the container
            const execResult = await this.executeInContainer(containerId);

            // Clean up container
            await this.cleanupContainer(containerId);

            return execResult;

        } catch (error) {
            log.error('Docker execution failed', {
                taskId: task.id,
                containerId,
                error: error instanceof Error ? error.message : String(error)
            });

            // Ensure cleanup on error
            await this.cleanupContainer(containerId);

            return {
                success: false,
                exitCode: -1,
                output: '',
                error: error instanceof Error ? error.message : String(error),
                timeoutReached: false
            };
        }
    }

    private async ensureSandboxImage(): Promise<void> {
        const imageName = 'corvid-work-sandbox';

        // Check if image exists
        const checkResult = Bun.spawn([
            'docker', 'image', 'inspect', imageName
        ], {
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const exitCode = await checkResult.exited;

        if (exitCode !== 0) {
            log.info('Building sandbox Docker image');

            const buildResult = Bun.spawn([
                'docker', 'build',
                '-t', imageName,
                '-f', 'docker/work-task-sandbox/Dockerfile',
                '.'
            ], {
                stdout: 'pipe',
                stderr: 'pipe',
                cwd: this.getProjectRoot()
            });

            const buildOutput = await new Response(buildResult.stdout).text();
            const buildError = await new Response(buildResult.stderr).text();
            const buildExitCode = await buildResult.exited;

            if (buildExitCode !== 0) {
                throw new Error(`Failed to build sandbox image: ${buildError}`);
            }

            log.info('Sandbox Docker image built successfully');
        }
    }

    private async createSecureContainer(
        containerId: string,
        task: WorkTask,
        projectWorkingDir: string,
        prompt: string
    ): Promise<DockerExecutionResult> {
        const project = getProject(this.db, task.projectId);
        if (!project) {
            throw new Error(`Project ${task.projectId} not found`);
        }

        // Create network policy (none = no network access)
        const networkArgs = this.config.networkAccess ? [] : ['--network', 'none'];

        // Resource limits
        const resourceArgs = [
            '--cpus', this.config.cpuLimit,
            '--memory', this.config.memoryLimit,
            '--memory-swap', this.config.memoryLimit, // Disable swap
        ];

        // Security options
        const securityArgs = [
            '--user', 'corvidworker', // Non-root user
            '--read-only',            // Read-only filesystem
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=100m', // Writable tmp with restrictions
            '--tmpfs', '/workspace/.git:rw,nosuid,size=50m', // Git operations
            '--security-opt', 'no-new-privileges:true', // Prevent privilege escalation
            '--cap-drop', 'ALL',      // Drop all capabilities
            '--cap-add', 'DAC_OVERRIDE', // Allow file ownership changes in workspace
        ];

        // Mount the project directory as read-only, with writable overlay for changes
        const mountArgs = [
            '-v', `${projectWorkingDir}:/workspace/original:ro`,
            '--tmpfs', '/workspace/work:rw,size=200m', // Writable workspace
        ];

        // Environment variables (only safe ones)
        const envArgs = [
            '-e', 'HOME=/tmp',
            '-e', 'TMPDIR=/tmp',
            '-e', 'USER=corvidworker',
            '-e', `WORK_TASK_ID=${task.id}`,
            '-e', `WORK_DESCRIPTION=${task.description}`,
        ];

        // Add GitHub token if available (for PR creation)
        if (process.env.GITHUB_TOKEN) {
            envArgs.push('-e', `GITHUB_TOKEN=${process.env.GITHUB_TOKEN}`);
        }
        if (process.env.GH_TOKEN) {
            envArgs.push('-e', `GH_TOKEN=${process.env.GH_TOKEN}`);
        }

        const createArgs = [
            'docker', 'create',
            '--name', containerId,
            '--rm', // Auto-remove when stopped
            ...networkArgs,
            ...resourceArgs,
            ...securityArgs,
            ...mountArgs,
            ...envArgs,
            'corvid-work-sandbox',
            'sh', '-c', this.buildContainerScript(prompt)
        ];

        log.debug('Creating Docker container', {
            taskId: task.id,
            containerId,
            command: createArgs.join(' ')
        });

        const createResult = Bun.spawn(createArgs, {
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const createStderr = await new Response(createResult.stderr).text();
        const createExitCode = await createResult.exited;

        if (createExitCode !== 0) {
            return {
                success: false,
                exitCode: createExitCode,
                output: '',
                error: `Failed to create container: ${createStderr}`,
                timeoutReached: false
            };
        }

        return { success: true, exitCode: 0, output: '', error: '', timeoutReached: false };
    }

    private buildContainerScript(prompt: string): string {
        // Script that runs inside the container to execute the work task
        return `
set -e

# Copy original files to writable workspace
echo "Setting up workspace..."
cp -r /workspace/original/* /workspace/work/ 2>/dev/null || true
cd /workspace/work

# Initialize git config for the sandbox user
git config --global user.name "CorvidAgent Worker"
git config --global user.email "worker@corvidagent.local"
git config --global init.defaultBranch main

# Ensure we're in a git repository
if [ ! -d .git ]; then
    echo "Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit from work task setup" || true
fi

# Create a new branch for this work task
BRANCH_NAME="work-task-\${WORK_TASK_ID}"
git checkout -b "\${BRANCH_NAME}" 2>/dev/null || git checkout "\${BRANCH_NAME}"

echo "=== WORK TASK EXECUTION ==="
echo "Task ID: \${WORK_TASK_ID}"
echo "Description: \${WORK_DESCRIPTION}"
echo "Branch: \${BRANCH_NAME}"
echo "Working Directory: \$(pwd)"
echo "=========================="

# TODO: Integrate with Claude Agent SDK to execute the prompt
# For now, this is a placeholder that would be replaced with actual agent execution
echo "PROMPT: ${prompt.replace(/"/g, '\\"')}"
echo "NOTE: This is a sandboxed execution environment"
echo "Files are isolated and network access is restricted"

# Exit with success for now
exit 0
`;
    }

    private async executeInContainer(containerId: string): Promise<DockerExecutionResult> {
        log.info('Starting container execution', { containerId });

        // Start the container
        const startResult = Bun.spawn(['docker', 'start', containerId], {
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const startExitCode = await startResult.exited;
        if (startExitCode !== 0) {
            const startError = await new Response(startResult.stderr).text();
            return {
                success: false,
                exitCode: startExitCode,
                output: '',
                error: `Failed to start container: ${startError}`,
                timeoutReached: false
            };
        }

        // Wait for container execution with timeout
        const timeoutMs = this.config.timeoutMinutes * 60 * 1000;
        const waitResult = await this.waitForContainerWithTimeout(containerId, timeoutMs);

        if (waitResult.timeoutReached) {
            // Kill the container if timeout reached
            await this.killContainer(containerId);
        }

        // Get container logs (output)
        const logsResult = Bun.spawn(['docker', 'logs', containerId], {
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const output = await new Response(logsResult.stdout).text();
        const error = await new Response(logsResult.stderr).text();

        return {
            success: waitResult.exitCode === 0 && !waitResult.timeoutReached,
            exitCode: waitResult.exitCode,
            output: output.trim(),
            error: error.trim(),
            timeoutReached: waitResult.timeoutReached
        };
    }

    private async waitForContainerWithTimeout(
        containerId: string,
        timeoutMs: number
    ): Promise<{ exitCode: number; timeoutReached: boolean }> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const inspectResult = Bun.spawn([
                'docker', 'inspect',
                '--format', '{{.State.Status}}:{{.State.ExitCode}}',
                containerId
            ], {
                stdout: 'pipe',
                stderr: 'pipe'
            });

            const inspectOutput = await new Response(inspectResult.stdout).text();
            const inspectExitCode = await inspectResult.exited;

            if (inspectExitCode === 0) {
                const [status, exitCode] = inspectOutput.trim().split(':');
                if (status === 'exited') {
                    return {
                        exitCode: parseInt(exitCode, 10) || 0,
                        timeoutReached: false
                    };
                }
            }

            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Timeout reached
        return { exitCode: -1, timeoutReached: true };
    }

    private async killContainer(containerId: string): Promise<void> {
        try {
            const killResult = Bun.spawn(['docker', 'kill', containerId], {
                stdout: 'pipe',
                stderr: 'pipe'
            });
            await killResult.exited;
            log.warn('Container killed due to timeout', { containerId });
        } catch (error) {
            log.warn('Failed to kill container', {
                containerId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async cleanupContainer(containerId: string): Promise<void> {
        try {
            // Remove container (should auto-remove due to --rm flag, but ensure cleanup)
            const removeResult = Bun.spawn(['docker', 'rm', '-f', containerId], {
                stdout: 'pipe',
                stderr: 'pipe'
            });
            await removeResult.exited;
            log.debug('Container cleaned up', { containerId });
        } catch (error) {
            log.warn('Failed to clean up container', {
                containerId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private getProjectRoot(): string {
        // Assume we're running from server/ and need to get to the project root
        return resolve(__dirname, '../..');
    }

    /**
     * Test if Docker is available and working
     */
    async healthCheck(): Promise<{ available: boolean; error?: string }> {
        try {
            const result = Bun.spawn(['docker', '--version'], {
                stdout: 'pipe',
                stderr: 'pipe'
            });

            const exitCode = await result.exited;
            if (exitCode === 0) {
                const version = await new Response(result.stdout).text();
                log.info('Docker health check passed', { version: version.trim() });
                return { available: true };
            } else {
                const error = await new Response(result.stderr).text();
                return { available: false, error: `Docker check failed: ${error}` };
            }
        } catch (error) {
            return {
                available: false,
                error: `Docker not available: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}