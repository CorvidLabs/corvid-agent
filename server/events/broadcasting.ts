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
import { onCouncilStageChange, onCouncilLog, onCouncilDiscussionMessage } from '../routes/councils';
import { tenantTopic } from '../ws/handler';
import { DEFAULT_TENANT_ID } from '../tenant/types';

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
 * Resolve the tenant for an agent (used by event broadcasts).
 * Returns undefined in single-tenant mode (flat topics).
 */
function resolveAgentTenant(db: Database, multiTenant: boolean, agentId: string): string | undefined {
    if (!multiTenant) return undefined;
    const row = db.query('SELECT tenant_id FROM agents WHERE id = ?').get(agentId) as { tenant_id: string } | null;
    const tid = row?.tenant_id;
    return tid && tid !== DEFAULT_TENANT_ID ? tid : undefined;
}

/**
 * Resolve the tenant for a council launch (used by council event broadcasts).
 */
function resolveCouncilTenant(db: Database, multiTenant: boolean, launchId: string): string | undefined {
    if (!multiTenant) return undefined;
    const row = db.query(
        `SELECT a.tenant_id FROM sessions s
         JOIN agents a ON s.agent_id = a.id
         WHERE s.council_launch_id = ? LIMIT 1`,
    ).get(launchId) as { tenant_id: string } | null;
    const tid = row?.tenant_id;
    return tid && tid !== DEFAULT_TENANT_ID ? tid : undefined;
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

    const resolveAgent = (agentId: string) => resolveAgentTenant(db, multiTenant, agentId);
    const resolveCouncil = (launchId: string) => resolveCouncilTenant(db, multiTenant, launchId);
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
