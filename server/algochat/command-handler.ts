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
    getConversationByParticipant,
} from '../db/sessions';
import { getAlgochatEnabledAgents } from '../db/agents';
import {
    getBalance,
    getCreditConfig,
    getTransactionHistory,
} from '../db/credits';
import { listCouncils, createCouncil, getCouncilLaunch } from '../db/councils';
import { listSchedules, getSchedule, updateSchedule, updateScheduleNextRun, listExecutions } from '../db/schedules';
import type { SchedulerService } from '../scheduler/service';
import { launchCouncil, onCouncilStageChange } from '../routes/councils';
import { COMMAND_DEFS, getCommandDef } from '../../shared/command-defs';
import { createLogger } from '../lib/logger';

const log = createLogger('CommandHandler');

/** Commands that require owner authorization. */
const PRIVILEGED_COMMANDS = new Set(['/stop', '/approve', '/deny', '/mode', '/work', '/agent', '/council', '/extend', '/schedule']);

/**
 * Context required by the CommandHandler for resolving agents and projects.
 * Keeps the handler decoupled from bridge internals.
 */
export interface CommandHandlerContext {
    /** Find the default agent for new conversations. */
    findAgentForNewConversation(): string | null;
    /** Get or create the default project ID. */
    getDefaultProjectId(): string;
    /** Extend a running session's timeout. Returns true if the session was found and extended. */
    extendSession(sessionId: string, minutes: number): boolean;
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
    private schedulerServiceRef: SchedulerService | null = null;

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

    /** Inject the optional scheduler service reference. */
    setSchedulerService(service: SchedulerService): void {
        this.schedulerServiceRef = service;
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
     *
     * @param participant - The sender's address (or 'local' for dashboard chat)
     * @param content - The raw message content
     * @param responseFn - Optional callback for routing responses (used by local chat).
     *                     When provided, responses are sent via this function instead of on-chain.
     */
    handleCommand(participant: string, content: string, responseFn?: (text: string) => void): boolean {
        const trimmed = content.trim();
        if (!trimmed.startsWith('/')) return false;

        const parts = trimmed.split(/\s+/);
        const command = parts[0].toLowerCase();

        // Helper: send response either via callback or on-chain
        const respond = (text: string) => {
            if (responseFn) {
                responseFn(text);
            } else {
                this.responseFormatter.sendResponse(participant, text);
            }
        };

        // Privileged commands require owner authorization (local chat is always authorized)
        if (PRIVILEGED_COMMANDS.has(command) && !responseFn && !this.isOwner(participant)) {
            log.warn('Unauthorized command attempt', { participant: participant.slice(0, 8), command });
            respond(`Unauthorized: ${command} requires owner access`);
            return true;
        }

        switch (command) {
            case '/help': {
                const target = parts[1]?.toLowerCase();
                if (target) {
                    const def = getCommandDef(target);
                    if (def) {
                        const lines = [
                            `**${def.name}** — ${def.description}`,
                            `Usage: \`${def.usage}\``,
                            def.privileged ? '(Requires owner access)' : '',
                            '',
                            ...def.examples.map((e) => `  ${e}`),
                        ].filter(Boolean);
                        respond(lines.join('\n'));
                    } else {
                        respond(`Unknown command: ${target}. Type /help to see all commands.`);
                    }
                } else {
                    const lines = ['**Available Commands:**', ''];
                    for (const def of COMMAND_DEFS) {
                        if (def.name === '/help') continue;
                        lines.push(`  **${def.name}** — ${def.description}`);
                    }
                    lines.push('', 'Type `/help <command>` for detailed usage.');
                    respond(lines.join('\n'));
                }
                return true;
            }

            case '/status': {
                const activeCount = this.processManager.getActiveSessionIds().length;
                const conversations = listConversations(this.db);
                respond(`Active sessions: ${activeCount}, conversations: ${conversations.length}`);
                return true;
            }

            case '/stop': {
                const sessionId = parts[1];
                if (!sessionId) {
                    respond('Usage: /stop <session-id>');
                    return true;
                }
                if (this.processManager.isRunning(sessionId)) {
                    this.processManager.stopProcess(sessionId);
                    respond(`Stopped session ${sessionId}`);
                } else {
                    respond(`Session ${sessionId} is not running`);
                }
                return true;
            }

            case '/agent': {
                const agentName = parts.slice(1).join(' ');
                if (!agentName) {
                    const agents = getAlgochatEnabledAgents(this.db);
                    const names = agents.map((a) => a.name).join(', ');
                    respond(`Available agents: ${names || 'none'}`);
                    return true;
                }
                // Route subsequent messages to the specified agent
                const agents = getAlgochatEnabledAgents(this.db);
                const matched = agents.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
                if (matched) {
                    this.config.defaultAgentId = matched.id;
                    respond(`Routing to agent: ${matched.name}`);
                } else {
                    respond(`Agent "${agentName}" not found`);
                }
                return true;
            }

            case '/queue': {
                const queued = this.processManager.approvalManager.getQueuedRequests();
                if (queued.length === 0) {
                    respond('No pending escalation requests');
                } else {
                    const lines = queued.map((q) => `#${q.id}: [${q.toolName}] session=${q.sessionId.slice(0, 8)} (${q.createdAt})`);
                    respond(`Pending escalations:\n${lines.join('\n')}`);
                }
                return true;
            }

            case '/approve': {
                const queueId = parseInt(parts[1], 10);
                if (isNaN(queueId)) {
                    respond('Usage: /approve <queue-id>');
                    return true;
                }
                const resolved = this.processManager.approvalManager.resolveQueuedRequest(queueId, true);
                respond(resolved
                    ? `Escalation #${queueId} approved`
                    : `Escalation #${queueId} not found or already resolved`);
                return true;
            }

            case '/deny': {
                const queueId = parseInt(parts[1], 10);
                if (isNaN(queueId)) {
                    respond('Usage: /deny <queue-id>');
                    return true;
                }
                const resolved = this.processManager.approvalManager.resolveQueuedRequest(queueId, false);
                respond(resolved
                    ? `Escalation #${queueId} denied`
                    : `Escalation #${queueId} not found or already resolved`);
                return true;
            }

            case '/mode': {
                const newMode = parts[1]?.toLowerCase();
                if (!newMode) {
                    respond(`Current mode: ${this.processManager.approvalManager.operationalMode}`);
                    return true;
                }
                const validModes = ['normal', 'queued', 'paused'];
                if (!validModes.includes(newMode)) {
                    respond(`Invalid mode. Use: ${validModes.join(', ')}`);
                    return true;
                }
                this.processManager.approvalManager.operationalMode = newMode as 'normal' | 'queued' | 'paused';
                respond(`Mode set to: ${newMode}`);
                return true;
            }

            case '/credits': {
                const balance = getBalance(this.db, participant);
                const config = getCreditConfig(this.db);
                const lines = [
                    `Credit Balance:`,
                    `  Available: ${balance.available} credits`,
                    `  Reserved: ${balance.reserved} credits`,
                    `  Total: ${balance.credits} credits`,
                    `  Purchased: ${balance.totalPurchased} | Used: ${balance.totalConsumed}`,
                    ``,
                    `Rates:`,
                    `  1 ALGO = ${config.creditsPerAlgo} credits`,
                    `  1 turn = ${config.creditsPerTurn} credit(s)`,
                    `  1 agent message = ${config.creditsPerAgentMessage} credit(s)`,
                    ``,
                    `Send ALGO to this address to purchase credits.`,
                ];
                respond(lines.join('\n'));
                return true;
            }

            case '/history': {
                const limit = parseInt(parts[1], 10) || 10;
                const transactions = getTransactionHistory(this.db, participant, Math.min(limit, 20));
                if (transactions.length === 0) {
                    respond('No credit transactions yet.');
                    return true;
                }
                const lines = transactions.map((t) =>
                    `${t.type === 'purchase' || t.type === 'grant' ? '+' : '-'}${t.amount} [${t.type}] → bal:${t.balanceAfter} (${t.createdAt})`
                );
                respond(`Recent Transactions:\n${lines.join('\n')}`);
                return true;
            }

            case '/work': {
                const description = parts.slice(1).join(' ');
                if (!description) {
                    respond('Usage: /work <task description>');
                    return true;
                }

                if (!this.workTaskService) {
                    respond('Work task service not available');
                    return true;
                }

                const agentId = this.context.findAgentForNewConversation();
                if (!agentId) {
                    respond('No agent available for work tasks');
                    return true;
                }

                this.workTaskService.create({
                    agentId,
                    description,
                    source: 'algochat',
                    requesterInfo: { participant },
                }).then((task) => {
                    respond(`Work task started: ${task.id}\nBranch: ${task.branchName ?? 'creating...'}\nStatus: ${task.status}`);

                    this.workTaskService?.onComplete(task.id, (completed) => {
                        if (completed.status === 'completed' && completed.prUrl) {
                            respond(`Work task completed!\nPR: ${completed.prUrl}`);
                        } else {
                            respond(`Work task failed: ${completed.error ?? 'Unknown error'}`);
                        }
                    });
                }).catch((err) => {
                    respond(`Work task error: ${err instanceof Error ? err.message : String(err)}`);
                });
                return true;
            }

            case '/council': {
                this.handleCouncilCommand(participant, parts, respond).catch((err) => {
                    respond(`Council error: ${err instanceof Error ? err.message : String(err)}`);
                });
                return true;
            }

            case '/extend': {
                const minutes = Math.max(1, Math.min(120, parseInt(parts[1], 10) || 30));
                let sessionId = parts[2];
                if (!sessionId) {
                    const conversation = getConversationByParticipant(this.db, participant);
                    sessionId = conversation?.sessionId ?? '';
                }
                if (!sessionId) {
                    respond('No active session found. Usage: /extend [minutes] [session-id]');
                    return true;
                }
                const extended = this.context.extendSession(sessionId, minutes);
                if (extended) {
                    respond(`Extended session ${sessionId.slice(0, 8)}... by ${minutes} minutes`);
                } else {
                    respond(`Session ${sessionId.slice(0, 8)}... not found or not running`);
                }
                return true;
            }

            case '/schedule': {
                this.handleScheduleCommand(parts, respond);
                return true;
            }

            default:
                return false;
        }
    }

    /**
     * Handle the `/schedule` command from AlgoChat.
     */
    private handleScheduleCommand(parts: string[], respond: (text: string) => void): void {
        const sub = parts[1]?.toLowerCase() ?? 'list';
        const scheduleId = parts[2];

        switch (sub) {
            case 'list': {
                const schedules = listSchedules(this.db);
                if (schedules.length === 0) {
                    respond('No schedules found.');
                    return;
                }
                const lines = schedules.map((s) =>
                    `- **${s.name}** [${s.id.slice(0, 8)}] status=${s.status} runs=${s.executionCount}${s.nextRunAt ? ` next=${s.nextRunAt}` : ''}`
                );
                respond(`**Schedules:**\n${lines.join('\n')}`);
                return;
            }

            case 'pause': {
                if (!scheduleId) { respond('Usage: /schedule pause <schedule-id>'); return; }
                const updated = updateSchedule(this.db, scheduleId, { status: 'paused' });
                if (!updated) { respond(`Schedule ${scheduleId} not found`); return; }
                respond(`Schedule "${updated.name}" paused.`);
                return;
            }

            case 'resume': {
                if (!scheduleId) { respond('Usage: /schedule resume <schedule-id>'); return; }
                const updated = updateSchedule(this.db, scheduleId, { status: 'active' });
                if (!updated) { respond(`Schedule ${scheduleId} not found`); return; }
                respond(`Schedule "${updated.name}" resumed.`);
                return;
            }

            case 'history': {
                if (!scheduleId) { respond('Usage: /schedule history <schedule-id>'); return; }
                const executions = listExecutions(this.db, scheduleId, 10);
                if (executions.length === 0) {
                    respond('No executions found for this schedule.');
                    return;
                }
                const lines = executions.map((e) =>
                    `- [${e.id.slice(0, 8)}] ${e.actionType} status=${e.status} ${e.startedAt}${e.result ? ` — ${e.result.slice(0, 80)}` : ''}`
                );
                respond(`**Recent Executions:**\n${lines.join('\n')}`);
                return;
            }

            case 'run': {
                if (!scheduleId) { respond('Usage: /schedule run <schedule-id>'); return; }
                const schedule = getSchedule(this.db, scheduleId);
                if (!schedule) { respond(`Schedule ${scheduleId} not found`); return; }
                if (!this.schedulerServiceRef) { respond('Scheduler service not available'); return; }
                // Trigger immediate execution by setting next_run_at to now
                updateScheduleNextRun(this.db, scheduleId, new Date().toISOString());
                respond(`Schedule "${schedule.name}" queued for immediate execution.`);
                return;
            }

            default:
                respond('Usage: /schedule [list|pause|resume|history|run] [schedule-id]');
        }
    }

    /**
     * Handle the `/council` command from AlgoChat.
     *
     * Usage:
     *   /council <prompt>                            — auto-create council with all enabled agents
     *   /council @Agent1 @Agent2 -- <prompt>         — auto-create council with specific agents
     *   /council MyCouncilName -- <prompt>            — use existing council by name
     */
    private async handleCouncilCommand(participant: string, parts: string[], respond?: (text: string) => void): Promise<void> {
        const send = respond ?? ((text: string) => this.responseFormatter.sendResponse(participant, text));
        const rest = parts.slice(1).join(' ').trim();
        if (!rest) {
            send('Usage:\n  /council <prompt>\n  /council @Agent1 @Agent2 -- <prompt>\n  /council <CouncilName> -- <prompt>');
            return;
        }

        // Parse: "/council @A @B -- prompt" or "/council CouncilName -- prompt" or "/council prompt"
        const doubleDashIdx = rest.indexOf('--');
        let councilName: string | null = null;
        let agentMentions: string[] | null = null;
        let prompt: string;

        if (doubleDashIdx >= 0) {
            const beforeDash = rest.slice(0, doubleDashIdx).trim();
            prompt = rest.slice(doubleDashIdx + 2).trim();

            if (beforeDash.includes('@')) {
                // Agent selection mode: extract @mentions
                const mentions = beforeDash.match(/@([^@]+)/g);
                agentMentions = mentions ? mentions.map((m) => m.slice(1).trim()).filter(Boolean) : [];
            } else if (beforeDash) {
                // Existing council name mode
                councilName = beforeDash;
            }
        } else {
            prompt = rest;
        }

        if (!prompt) {
            send('Please provide a prompt for the council.');
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
                send(`Council "${councilName}" not found.\nAvailable: ${available || 'none'}`);
                return;
            }
            councilId = match.id;
            councilLabel = match.name;
        } else if (agentMentions && agentMentions.length > 0) {
            // Auto-create council with specific mentioned agents
            const allAgents = getAlgochatEnabledAgents(this.db);
            const matched: typeof allAgents = [];
            const notFound: string[] = [];

            for (const name of agentMentions) {
                const agent = allAgents.find((a) => a.name.toLowerCase() === name.toLowerCase());
                if (agent) {
                    matched.push(agent);
                } else {
                    notFound.push(name);
                }
            }

            if (notFound.length > 0) {
                const available = allAgents.map((a) => a.name).join(', ');
                send(`Agent(s) not found: ${notFound.join(', ')}\nAvailable: ${available || 'none'}`);
                return;
            }
            if (matched.length < 2) {
                send('Council requires at least 2 agents. Mention multiple agents: /council @Agent1 @Agent2 -- <prompt>');
                return;
            }

            const agentIds = matched.map((a) => a.id);
            const council = createCouncil(this.db, {
                name: `AlgoChat Council ${new Date().toISOString().slice(0, 16)}`,
                description: `Auto-created with agents: ${matched.map((a) => a.name).join(', ')}`,
                agentIds,
                chairmanAgentId: agentIds[0],
                discussionRounds: 2,
            });
            councilId = council.id;
            councilLabel = council.name;
        } else {
            // Auto-create council with all algochat-enabled agents
            const agents = getAlgochatEnabledAgents(this.db);
            if (agents.length === 0) {
                send('No AlgoChat-enabled agents available for council.');
                return;
            }
            if (agents.length < 2) {
                send(`Only 1 agent available (${agents[0].name}). Council requires at least 2 agents.\nEnable more agents for AlgoChat, or create a council in the dashboard.`);
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
        send(`Launching council "${councilLabel}"...\nPrompt: ${prompt.slice(0, 200)}`);

        try {
            const result = launchCouncil(
                this.db,
                this.processManager,
                councilId,
                projectId,
                prompt,
                this.agentMessengerRef,
            );

            send(`Council launched! (${result.sessionIds.length} agents responding)\nLaunch ID: ${result.launchId.slice(0, 8)}...`);

            // Monitor stage changes and relay progress + final synthesis.
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
                    send(`[Council] Agents are now discussing...`);
                } else if (stage === 'reviewing') {
                    send(`[Council] Peer review stage started.`);
                } else if (stage === 'synthesizing') {
                    send(`[Council] Chairman is synthesizing final answer...`);
                } else if (stage === 'complete') {
                    cleanup();
                    // Fetch the synthesis and send it back
                    const launch = getCouncilLaunch(this.db, result.launchId);
                    if (launch?.synthesis) {
                        const MAX_SYNTHESIS_LENGTH = 3000;
                        const synthesis = launch.synthesis.length > MAX_SYNTHESIS_LENGTH
                            ? launch.synthesis.slice(0, MAX_SYNTHESIS_LENGTH) + '\n\n[Truncated — view full synthesis on dashboard]'
                            : launch.synthesis;
                        send(`[Council Complete]\n\n${synthesis}`);
                    } else {
                        send(`[Council Complete] No synthesis produced.`);
                    }
                }
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send(`Council launch failed: ${msg}`);
        }
    }
}
