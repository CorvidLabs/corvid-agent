/**
 * WebSocket event broadcasting — wires service events to tenant-scoped WS topics.
 *
 * Extracted from server/index.ts as part of god-module decomposition (#442).
 */

import type { Database } from 'bun:sqlite';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BunServer = import('bun').Server<any>;
import type { SchedulerService } from '../scheduler/service';
import type { WebhookService } from '../webhooks/service';
import type { MentionPollingService } from '../polling/service';
import type { WorkflowService } from '../workflow/service';
import type { NotificationService } from '../notifications/service';
import type { ProcessManager } from '../process/manager';
import { onCouncilStageChange, onCouncilLog, onCouncilDiscussionMessage, onCouncilAgentError } from '../routes/councils';
import { onGovernanceVoteCast, onGovernanceVoteResolved, onGovernanceQuorumReached } from '../councils/discussion';
import { tenantTopic } from '../ws/handler';
import { resolveAgentTenant, resolveCouncilTenant } from '../tenant/resolve';

export interface BroadcastDeps {
    server: BunServer;
    db: Database;
    processManager: ProcessManager;
    schedulerService: SchedulerService;
    webhookService: WebhookService;
    mentionPollingService: MentionPollingService;
    workflowService: WorkflowService;
    notificationService: NotificationService;
    multiTenant: boolean;
}

function spreadScheduleEvent(event: { type: string; data: unknown }): Record<string, unknown> {
    switch (event.type) {
        case 'schedule_update':
            return { schedule: event.data };
        case 'schedule_execution_update':
            return { execution: event.data };
        case 'schedule_approval_request':
            return event.data as Record<string, unknown>;
        default:
            return {};
    }
}

function spreadWorkflowEvent(event: { type: string; data: unknown }): Record<string, unknown> {
    switch (event.type) {
        case 'workflow_update':
            return { workflow: event.data };
        case 'workflow_run_update':
            return { run: event.data };
        case 'workflow_node_update':
            return { nodeRun: event.data };
        default:
            return {};
    }
}

/**
 * Publish a message to a tenant-scoped topic.
 * In single-tenant mode, publishes to the flat topic.
 */
export function publishToTenant(server: BunServer, baseTopic: string, data: string, tid?: string): void {
    server.publish(tenantTopic(baseTopic, tid), data);
}

/**
 * Wire all service event callbacks to broadcast via WebSocket.
 * Call once after the server and all services are initialized.
 */
export function wireEventBroadcasting(deps: BroadcastDeps): void {
    const { server, db, processManager, schedulerService, webhookService, mentionPollingService, workflowService, notificationService, multiTenant } = deps;

    const resolveAgent = (agentId: string) => resolveAgentTenant(db, agentId, multiTenant);
    const resolveCouncil = (launchId: string) => resolveCouncilTenant(db, launchId, multiTenant);
    const publish = (baseTopic: string, data: string, tid?: string) => publishToTenant(server, baseTopic, data, tid);

    // Wire broadcast function so MCP tools can publish to WS clients
    processManager.setBroadcast((topic, data) => server.publish(topic, data));

    // Wire notification service broadcast (publishes to 'owner' topic)
    notificationService.setBroadcast((msg) => server.publish(tenantTopic('owner'), JSON.stringify(msg)));

    // Broadcast council events to tenant-scoped WS topics
    onCouncilStageChange((launchId, stage, sessionIds) => {
        const msg = JSON.stringify({ type: 'council_stage_change', launchId, stage, sessionIds });
        publish('council', msg, resolveCouncil(launchId));
    });

    onCouncilLog((logEntry) => {
        const msg = JSON.stringify({ type: 'council_log', log: logEntry });
        publish('council', msg, resolveCouncil(logEntry.launchId));
    });

    onCouncilDiscussionMessage((message) => {
        const msg = JSON.stringify({ type: 'council_discussion_message', message });
        publish('council', msg, resolveAgent(message.agentId));
    });

    onCouncilAgentError((error) => {
        const msg = JSON.stringify({
            type: 'council_agent_error',
            launchId: error.launchId,
            agentId: error.agentId,
            agentName: error.agentName,
            error: {
                message: error.message,
                errorType: error.errorType,
                severity: error.severity,
                stage: error.stage,
                sessionId: error.sessionId,
                round: error.round,
            },
        });
        publish('council', msg, resolveCouncil(error.launchId));
    });

    // Broadcast governance vote events
    onGovernanceVoteCast((event) => {
        const msg = JSON.stringify({ type: 'governance_vote_cast', ...event });
        publish('council', msg, resolveCouncil(event.launchId));
    });

    onGovernanceVoteResolved((event) => {
        const msg = JSON.stringify({ type: 'governance_vote_resolved', ...event });
        publish('council', msg, resolveCouncil(event.launchId));
    });

    onGovernanceQuorumReached((event) => {
        const msg = JSON.stringify({ type: 'governance_quorum_reached', ...event });
        publish('council', msg, resolveCouncil(event.launchId));
    });

    // Broadcast schedule events
    schedulerService.onEvent((event) => {
        const msg = JSON.stringify({ type: event.type, ...spreadScheduleEvent(event) });
        const eventData = event.data as Record<string, unknown> | undefined;
        const agentId = (eventData as { agentId?: string } | undefined)?.agentId;
        publish('council', msg, agentId ? resolveAgent(agentId) : undefined);
    });

    // Broadcast webhook events
    webhookService.onEvent((event) => {
        const msg = JSON.stringify({ type: event.type, delivery: event.data });
        const delivery = event.data as Record<string, unknown> | undefined;
        const agentId = (delivery as { agentId?: string } | undefined)?.agentId;
        publish('council', msg, agentId ? resolveAgent(agentId) : undefined);
    });

    // Broadcast mention polling events
    mentionPollingService.onEvent((event) => {
        const eventData = event.data as Record<string, unknown>;
        const msg = JSON.stringify({ type: event.type, ...eventData });
        const agentId = (eventData as { agentId?: string }).agentId;
        publish('council', msg, agentId ? resolveAgent(agentId) : undefined);
    });

    // Broadcast workflow events
    workflowService.onEvent((event) => {
        const msg = JSON.stringify({ type: event.type, ...spreadWorkflowEvent(event) });
        publish('council', msg); // Workflows don't carry agentId in events yet
    });
}
