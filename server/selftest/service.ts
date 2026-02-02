import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import { listProjects, createProject } from '../db/projects';
import { listAgents, createAgent, updateAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import { SELF_TEST_PROJECT, SELF_TEST_AGENT } from './config';
import { createLogger } from '../lib/logger';

const log = createLogger('SelfTest');

export class SelfTestService {
    private db: Database;
    private processManager: ProcessManager;

    constructor(db: Database, processManager: ProcessManager) {
        this.db = db;
        this.processManager = processManager;
    }

    ensureSetup(): { projectId: string; agentId: string } {
        // Find or create the self-test project
        const projects = listProjects(this.db);
        let project = projects.find((p) => p.name === SELF_TEST_PROJECT.name);
        if (!project) {
            project = createProject(this.db, {
                name: SELF_TEST_PROJECT.name,
                workingDir: SELF_TEST_PROJECT.workingDir,
                claudeMd: SELF_TEST_PROJECT.claudeMd,
            });
            log.info('Created self-test project', { id: project.id });
        }

        // Find or create the self-test agent
        const agents = listAgents(this.db);
        let agent = agents.find((a) => a.name === SELF_TEST_AGENT.name);
        if (!agent) {
            agent = createAgent(this.db, {
                name: SELF_TEST_AGENT.name,
                systemPrompt: SELF_TEST_AGENT.systemPrompt,
                model: SELF_TEST_AGENT.model,
                permissionMode: SELF_TEST_AGENT.permissionMode,
                allowedTools: SELF_TEST_AGENT.allowedTools,
                maxBudgetUsd: SELF_TEST_AGENT.maxBudgetUsd,
                algochatEnabled: SELF_TEST_AGENT.algochatEnabled,
            });
            log.info('Created self-test agent', { id: agent.id });
        } else {
            // Sync existing agent with current config
            updateAgent(this.db, agent.id, {
                systemPrompt: SELF_TEST_AGENT.systemPrompt,
                model: SELF_TEST_AGENT.model,
                permissionMode: SELF_TEST_AGENT.permissionMode,
                allowedTools: SELF_TEST_AGENT.allowedTools,
                maxBudgetUsd: SELF_TEST_AGENT.maxBudgetUsd,
            });
        }

        return { projectId: project.id, agentId: agent.id };
    }

    run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } {
        const { projectId, agentId } = this.ensureSetup();

        let prompt: string;
        switch (testType) {
            case 'unit':
                prompt = 'Run the unit tests with `bun test`. If any tests fail, analyze the failures, fix the source code, and re-run to verify the fix.';
                break;
            case 'e2e':
                prompt = 'Run the end-to-end tests with `npx playwright test --config=playwright.config.js`. If any tests fail, analyze the failures, fix the source code, and re-run to verify the fix.';
                break;
            case 'all':
                prompt = 'Run all tests. Start with unit tests (`bun test`), then run e2e tests (`npx playwright test --config=playwright.config.js`). If any tests fail, analyze the failures, fix the source code, and re-run to verify all fixes.';
                break;
        }

        const session = createSession(this.db, {
            projectId,
            agentId,
            name: `Self-Test: ${testType}`,
            initialPrompt: prompt,
            source: 'web',
        });

        log.info('Starting self-test session', { sessionId: session.id, testType });
        this.processManager.startProcess(session, prompt);

        return { sessionId: session.id };
    }
}
