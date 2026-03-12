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
import type { ServerMessage } from '../../shared/ws-protocol';
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

/**
 * Publish a message to a tenant-scoped topic.
 * In single-tenant mode, publishes to the flat topic.
 */
export function publishToTenant(server: BunServer, baseTopic: string, data: string, tid?: string): void {
    server.publish(tenantTopic(baseTopic, tid), data);
}

/** Serialize and publish a typed ServerMessage to a tenant-scoped topic. */
function publishMessage(
    publish: (baseTopic: string, data: string, tid?: string) => void,
    baseTopic: string,
    msg: ServerMessage,
    tid?: string,
): void {
    publish(baseTopic, JSON.stringify(msg), tid);
}

/** Build a typed ServerMessage from a scheduler service event. */
function toScheduleMessage(event: { type: string; data: unknown }): ServerMessage | null {
    switch (event.type) {
        case 'schedule_update':
            return { type: 'schedule_update', schedule: event.data } as ServerMessage;
        case 'schedule_execution_update':
            return { type: 'schedule_execution_update', execution: event.data } as ServerMessage;
        case 'schedule_approval_request': {
            const d = event.data as Record<string, unknown>;
            return { type: 'schedule_approval_request', executionId: d['executionId'], scheduleId: d['scheduleId'], agentId: d['agentId'], actionType: d['actionType'], description: d['description'] } as ServerMessage;
        }
        default:
            return null;
    }
}

/** Build a typed ServerMessage from a workflow service event. */
function toWorkflowMessage(event: { type: string; data: unknown }): ServerMessage | null {
    switch (event.type) {
        case 'workflow_run_update':
            return { type: 'workflow_run_update', run: event.data } as ServerMessage;
        case 'workflow_node_update':
            return { type: 'workflow_node_update', nodeExecution: event.data } as ServerMessage;
        default:
            return null;
    }
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
        const msg: ServerMessage = { type: 'council_stage_change', launchId, stage, sessionIds };
        publishMessage(publish, 'council', msg, resolveCouncil(launchId));
    });

    onCouncilLog((logEntry) => {
        const msg: ServerMessage = { type: 'council_log', log: logEntry };
        publishMessage(publish, 'council', msg, resolveCouncil(logEntry.launchId));
    });

    onCouncilDiscussionMessage((message) => {
        const msg: ServerMessage = { type: 'council_discussion_message', message };
        publishMessage(publish, 'council', msg, resolveAgent(message.agentId));
    });

    onCouncilAgentError((error) => {
        const msg: ServerMessage = {
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
        };
        publishMessage(publish, 'council', msg, resolveCouncil(error.launchId));
    });

    // Broadcast governance vote events
    onGovernanceVoteCast((event) => {
        const msg: ServerMessage = { type: 'governance_vote_cast', ...event };
        publishMessage(publish, 'council', msg, resolveCouncil(event.launchId));
    });

    onGovernanceVoteResolved((event) => {
        const msg: ServerMessage = { type: 'governance_vote_resolved', ...event };
        publishMessage(publish, 'council', msg, resolveCouncil(event.launchId));
    });

    onGovernanceQuorumReached((event) => {
        const msg: ServerMessage = { type: 'governance_quorum_reached', ...event };
        publishMessage(publish, 'council', msg, resolveCouncil(event.launchId));
    });

    // Broadcast schedule events
    schedulerService.onEvent((event) => {
        const msg = toScheduleMessage(event);
        if (!msg) return;
        const eventData = event.data as Record<string, unknown> | undefined;
        const agentId = (eventData as { agentId?: string } | undefined)?.agentId;
        publishMessage(publish, 'council', msg, agentId ? resolveAgent(agentId) : undefined);
    });

    // Broadcast webhook events
    webhookService.onEvent((event) => {
        const delivery = event.data as Record<string, unknown> | undefined;
        const msg: ServerMessage = { type: 'webhook_delivery', delivery: event.data } as ServerMessage;
        const agentId = (delivery as { agentId?: string } | undefined)?.agentId;
        publishMessage(publish, 'council', msg, agentId ? resolveAgent(agentId) : undefined);
    });

    // Broadcast mention polling events
    mentionPollingService.onEvent((event) => {
        const eventData = event.data as Record<string, unknown>;
        const msg = { type: 'mention_polling_update' as const, config: eventData } as unknown as ServerMessage;
        const agentId = (eventData as { agentId?: string }).agentId;
        publishMessage(publish, 'council', msg, agentId ? resolveAgent(agentId) : undefined);
    });

    // Broadcast workflow events
    workflowService.onEvent((event) => {
        const msg = toWorkflowMessage(event);
        if (!msg) return;
        publishMessage(publish, 'council', msg);
    });
}
