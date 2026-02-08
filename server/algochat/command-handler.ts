/**
 * CommandHandler — Processes slash commands from AlgoChat messages.
 *
 * Owns the mapping from incoming `/command` strings to handler functions,
 * parameter validation, authorization checks, and response formatting.
 *
 * Extracted from bridge.ts to isolate command dispatch concerns from
 * message routing and subscription management.
 */
import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { ProcessManager } from '../process/manager';
import type { AgentMessenger } from './agent-messenger';
import type { WorkTaskService } from '../work/service';
import type { ResponseFormatter } from './response-formatter';
import {
    listConversations,
} from '../db/sessions';
import { getAlgochatEnabledAgents } from '../db/agents';
import {
    getBalance,
    getCreditConfig,
    getTransactionHistory,
} from '../db/credits';
import { listCouncils, createCouncil, getCouncilLaunch } from '../db/councils';
import { launchCouncil, onCouncilStageChange } from '../routes/councils';
import { createLogger } from '../lib/logger';

const log = createLogger('CommandHandler');

/** Commands that require owner authorization. */
const PRIVILEGED_COMMANDS = new Set(['/stop', '/approve', '/deny', '/mode', '/work', '/agent', '/council']);

/**
 * Context required by the CommandHandler for resolving agents and projects.
 * Keeps the handler decoupled from bridge internals.
 */
export interface CommandHandlerContext {
    /** Find the default agent for new conversations. */
    findAgentForNewConversation(): string | null;
    /** Get or create the default project ID. */
    getDefaultProjectId(): string;
}

/**
 * Handles slash-command parsing, authorization, and dispatch for AlgoChat.
 *
 * All commands return a response via the injected ResponseFormatter.
 * The handler is stateless aside from its injected dependencies.
 */
export class CommandHandler {
    private db: Database;
    private config: AlgoChatConfig;
    private processManager: ProcessManager;
    private responseFormatter: ResponseFormatter;
    private context: CommandHandlerContext;
    private workTaskService: WorkTaskService | null = null;
    private agentMessengerRef: AgentMessenger | null = null;

    constructor(
        db: Database,
        config: AlgoChatConfig,
        processManager: ProcessManager,
        responseFormatter: ResponseFormatter,
        context: CommandHandlerContext,
    ) {
        this.db = db;
        this.config = config;
        this.processManager = processManager;
        this.responseFormatter = responseFormatter;
        this.context = context;
    }

    /** Inject the optional work task service. */
    setWorkTaskService(service: WorkTaskService): void {
        this.workTaskService = service;
    }

    /** Inject the optional agent messenger reference (for councils). */
    setAgentMessenger(messenger: AgentMessenger): void {
        this.agentMessengerRef = messenger;
    }

    /**
     * Check if a participant is authorized to run privileged commands.
     * Fail-closed: returns false when no owners configured.
     */
    isOwner(participant: string): boolean {
        if (this.config.ownerAddresses.size === 0) {
            log.warn('Owner check failed — no owner addresses configured', { participant: participant.slice(0, 8) });
            return false;
        }
        if (!this.config.ownerAddresses.has(participant)) {
            log.debug('Non-owner address', { participant: participant.slice(0, 8) });
            return false;
        }
        return true;
    }

    /**
     * Handle commands from AlgoChat messages.
     * Returns true if the message was handled as a command.
     */
    handleCommand(participant: string, content: string): boolean {
        const trimmed = content.trim();
        if (!trimmed.startsWith('/')) return false;

        const parts = trimmed.split(/\s+/);
        const command = parts[0].toLowerCase();

        // Privileged commands require owner authorization
        if (PRIVILEGED_COMMANDS.has(command) && !this.isOwner(participant)) {
            log.warn('Unauthorized command attempt', { participant: participant.slice(0, 8), command });
            this.responseFormatter.sendResponse(participant, `Unauthorized: ${command} requires owner access`);
            return true;
        }

        switch (command) {
            case '/status': {
                const activeCount = this.processManager.getActiveSessionIds().length;
                const conversations = listConversations(this.db);
                this.responseFormatter.sendResponse(participant, `Active sessions: ${activeCount}, conversations: ${conversations.length}`);
                return true;
            }

            case '/stop': {
                const sessionId = parts[1];
                if (!sessionId) {
                    this.responseFormatter.sendResponse(participant, 'Usage: /stop <session-id>');
                    return true;
                }
                if (this.processManager.isRunning(sessionId)) {
                    this.processManager.stopProcess(sessionId);
                    this.responseFormatter.sendResponse(participant, `Stopped session ${sessionId}`);
                } else {
                    this.responseFormatter.sendResponse(participant, `Session ${sessionId} is not running`);
                }
                return true;
            }

            case '/agent': {
                const agentName = parts.slice(1).join(' ');
                if (!agentName) {
                    const agents = getAlgochatEnabledAgents(this.db);
                    const names = agents.map((a) => a.name).join(', ');
                    this.responseFormatter.sendResponse(participant, `Available agents: ${names || 'none'}`);
                    return true;
                }
                // Route subsequent messages to the specified agent
                const agents = getAlgochatEnabledAgents(this.db);
                const matched = agents.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
                if (matched) {
                    this.config.defaultAgentId = matched.id;
                    this.responseFormatter.sendResponse(participant, `Routing to agent: ${matched.name}`);
                } else {
                    this.responseFormatter.sendResponse(participant, `Agent "${agentName}" not found`);
                }
                return true;
            }

            case '/queue': {
                const queued = this.processManager.approvalManager.getQueuedRequests();
                if (queued.length === 0) {
                    this.responseFormatter.sendResponse(participant, 'No pending escalation requests');
                } else {
                    const lines = queued.map((q) => `#${q.id}: [${q.toolName}] session=${q.sessionId.slice(0, 8)} (${q.createdAt})`);
                    this.responseFormatter.sendResponse(participant, `Pending escalations:\n${lines.join('\n')}`);
                }
                return true;
            }

            case '/approve': {
                const queueId = parseInt(parts[1], 10);
                if (isNaN(queueId)) {
                    this.responseFormatter.sendResponse(participant, 'Usage: /approve <queue-id>');
                    return true;
                }
                const resolved = this.processManager.approvalManager.resolveQueuedRequest(queueId, true);
                this.responseFormatter.sendResponse(participant, resolved
                    ? `Escalation #${queueId} approved`
                    : `Escalation #${queueId} not found or already resolved`);
                return true;
            }

            case '/deny': {
                const queueId = parseInt(parts[1], 10);
                if (isNaN(queueId)) {
                    this.responseFormatter.sendResponse(participant, 'Usage: /deny <queue-id>');
                    return true;
                }
                const resolved = this.processManager.approvalManager.resolveQueuedRequest(queueId, false);
                this.responseFormatter.sendResponse(participant, resolved
                    ? `Escalation #${queueId} denied`
                    : `Escalation #${queueId} not found or already resolved`);
                return true;
            }

            case '/mode': {
                const newMode = parts[1]?.toLowerCase();
                if (!newMode) {
                    this.responseFormatter.sendResponse(participant, `Current mode: ${this.processManager.approvalManager.operationalMode}`);
                    return true;
                }
                const validModes = ['normal', 'queued', 'paused'];
                if (!validModes.includes(newMode)) {
                    this.responseFormatter.sendResponse(participant, `Invalid mode. Use: ${validModes.join(', ')}`);
                    return true;
                }
                this.processManager.approvalManager.operationalMode = newMode as 'normal' | 'queued' | 'paused';
                this.responseFormatter.sendResponse(participant, `Mode set to: ${newMode}`);
                return true;
            }

            case '/credits': {
                const balance = getBalance(this.db, participant);
                const config = getCreditConfig(this.db);
                const lines = [
                    `💰 Credit Balance:`,
                    `  Available: ${balance.available} credits`,
                    `  Reserved: ${balance.reserved} credits`,
                    `  Total: ${balance.credits} credits`,
                    `  Purchased: ${balance.totalPurchased} | Used: ${balance.totalConsumed}`,
                    ``,
                    `📊 Rates:`,
                    `  1 ALGO = ${config.creditsPerAlgo} credits`,
                    `  1 turn = ${config.creditsPerTurn} credit(s)`,
                    `  1 agent message = ${config.creditsPerAgentMessage} credit(s)`,
                    ``,
                    `Send ALGO to this address to purchase credits.`,
                ];
                this.responseFormatter.sendResponse(participant, lines.join('\n'));
                return true;
            }

            case '/history': {
                const limit = parseInt(parts[1], 10) || 10;
                const transactions = getTransactionHistory(this.db, participant, Math.min(limit, 20));
                if (transactions.length === 0) {
                    this.responseFormatter.sendResponse(participant, 'No credit transactions yet.');
                    return true;
                }
                const lines = transactions.map((t) =>
                    `${t.type === 'purchase' || t.type === 'grant' ? '+' : '-'}${t.amount} [${t.type}] → bal:${t.balanceAfter} (${t.createdAt})`
                );
                this.responseFormatter.sendResponse(participant, `📜 Recent Transactions:\n${lines.join('\n')}`);
                return true;
            }

            case '/work': {
                const description = parts.slice(1).join(' ');
                if (!description) {
                    this.responseFormatter.sendResponse(participant, 'Usage: /work <task description>');
                    return true;
                }

                if (!this.workTaskService) {
                    this.responseFormatter.sendResponse(participant, 'Work task service not available');
                    return true;
                }

                const agentId = this.context.findAgentForNewConversation();
                if (!agentId) {
                    this.responseFormatter.sendResponse(participant, 'No agent available for work tasks');
                    return true;
                }

                this.workTaskService.create({
                    agentId,
                    description,
                    source: 'algochat',
                    requesterInfo: { participant },
                }).then((task) => {
                    this.responseFormatter.sendResponse(participant, `Work task started: ${task.id}\nBranch: ${task.branchName ?? 'creating...'}\nStatus: ${task.status}`);

                    this.workTaskService?.onComplete(task.id, (completed) => {
                        if (completed.status === 'completed' && completed.prUrl) {
                            this.responseFormatter.sendResponse(participant, `Work task completed!\nPR: ${completed.prUrl}`);
                        } else {
                            this.responseFormatter.sendResponse(participant, `Work task failed: ${completed.error ?? 'Unknown error'}`);
                        }
                    });
                }).catch((err) => {
                    this.responseFormatter.sendResponse(participant, `Work task error: ${err instanceof Error ? err.message : String(err)}`);
                });
                return true;
            }

            case '/council': {
                this.handleCouncilCommand(participant, parts).catch((err) => {
                    this.responseFormatter.sendResponse(participant, `Council error: ${err instanceof Error ? err.message : String(err)}`);
                });
                return true;
            }

            default:
                return false;
        }
    }

    /**
     * Handle the `/council` command from AlgoChat.
     *
     * Usage:
     *   /council <prompt>                       — auto-create council with all enabled agents
     *   /council MyCouncilName -- <prompt>      — use existing council by name
     */
    private async handleCouncilCommand(participant: string, parts: string[]): Promise<void> {
        const rest = parts.slice(1).join(' ').trim();
        if (!rest) {
            this.responseFormatter.sendResponse(participant, 'Usage:\n  /council <prompt>\n  /council <CouncilName> -- <prompt>');
            return;
        }

        // Parse: "/council CouncilName -- prompt" or "/council prompt"
        const doubleDashIdx = rest.indexOf('--');
        let councilName: string | null = null;
        let prompt: string;

        if (doubleDashIdx >= 0) {
            councilName = rest.slice(0, doubleDashIdx).trim();
            prompt = rest.slice(doubleDashIdx + 2).trim();
        } else {
            prompt = rest;
        }

        if (!prompt) {
            this.responseFormatter.sendResponse(participant, 'Please provide a prompt for the council.');
            return;
        }

        // Resolve or auto-create the council
        let councilId: string;
        let councilLabel: string;

        if (councilName) {
            // Find existing council by name
            const councils = listCouncils(this.db);
            const match = councils.find((c) => c.name.toLowerCase() === councilName!.toLowerCase());
            if (!match) {
                const available = councils.map((c) => c.name).join(', ');
                this.responseFormatter.sendResponse(participant, `Council "${councilName}" not found.\nAvailable: ${available || 'none'}`);
                return;
            }
            councilId = match.id;
            councilLabel = match.name;
        } else {
            // Auto-create council with all algochat-enabled agents
            const agents = getAlgochatEnabledAgents(this.db);
            if (agents.length === 0) {
                this.responseFormatter.sendResponse(participant, 'No AlgoChat-enabled agents available for council.');
                return;
            }
            const agentIds = agents.map((a) => a.id);
            const chairmanId = agents[0].id; // First agent becomes chairman
            const council = createCouncil(this.db, {
                name: `AlgoChat Council ${new Date().toISOString().slice(0, 16)}`,
                description: 'Auto-created from AlgoChat /council command',
                agentIds,
                chairmanAgentId: chairmanId,
                discussionRounds: 2,
            });
            councilId = council.id;
            councilLabel = council.name;
        }

        // Resolve project ID (reuse existing helper)
        const projectId = this.context.getDefaultProjectId();

        // Launch the council
        this.responseFormatter.sendResponse(participant, `Launching council "${councilLabel}"...\nPrompt: ${prompt.slice(0, 200)}`);

        try {
            const result = launchCouncil(
                this.db,
                this.processManager,
                councilId,
                projectId,
                prompt,
                this.agentMessengerRef,
            );

            this.responseFormatter.sendResponse(participant, `Council launched! (${result.sessionIds.length} agents responding)\nLaunch ID: ${result.launchId.slice(0, 8)}...`);

            // Monitor stage changes and relay progress + final synthesis on-chain.
            // Safety timeout prevents the listener from leaking if the council
            // pipeline crashes before reaching the 'complete' stage.
            const COUNCIL_LISTENER_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes

            const cleanup = () => {
                clearTimeout(safetyTimer);
                unsubscribe();
            };

            const safetyTimer = setTimeout(() => {
                log.warn('Council stage listener timed out, cleaning up', { launchId: result.launchId });
                unsubscribe();
            }, COUNCIL_LISTENER_TIMEOUT_MS);

            const unsubscribe = onCouncilStageChange((launchId, stage) => {
                if (launchId !== result.launchId) return;

                if (stage === 'discussing') {
                    this.responseFormatter.sendResponse(participant, `[Council] Agents are now discussing...`);
                } else if (stage === 'reviewing') {
                    this.responseFormatter.sendResponse(participant, `[Council] Peer review stage started.`);
                } else if (stage === 'synthesizing') {
                    this.responseFormatter.sendResponse(participant, `[Council] Chairman is synthesizing final answer...`);
                } else if (stage === 'complete') {
                    cleanup();
                    // Fetch the synthesis and send it back
                    const launch = getCouncilLaunch(this.db, result.launchId);
                    if (launch?.synthesis) {
                        const MAX_SYNTHESIS_LENGTH = 3000;
                        const synthesis = launch.synthesis.length > MAX_SYNTHESIS_LENGTH
                            ? launch.synthesis.slice(0, MAX_SYNTHESIS_LENGTH) + '\n\n[Truncated — view full synthesis on dashboard]'
                            : launch.synthesis;
                        this.responseFormatter.sendResponse(participant, `[Council Complete]\n\n${synthesis}`);
                    } else {
                        this.responseFormatter.sendResponse(participant, `[Council Complete] No synthesis produced.`);
                    }
                }
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.responseFormatter.sendResponse(participant, `Council launch failed: ${msg}`);
        }
    }
}
