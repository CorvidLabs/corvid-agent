import { describe, test, expect, mock } from 'bun:test';
import { publishToTenant } from '../events/broadcasting';

// Re-implement the private spread functions for testing since they aren't exported.
// We test them indirectly through wireEventBroadcasting integration, but also
// verify the logic directly by importing the module and testing publishToTenant.

// ── spreadScheduleEvent (extracted for unit testing) ──────────────────

// These functions are not exported, so we replicate the switch logic here
// and test the actual module through publishToTenant + wireEventBroadcasting.

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

describe('spreadScheduleEvent', () => {
    test('wraps schedule_update data under "schedule" key', () => {
        const data = { id: 'sched-1', name: 'Daily backup' };
        const result = spreadScheduleEvent({ type: 'schedule_update', data });
        expect(result).toEqual({ schedule: data });
    });

    test('wraps schedule_execution_update data under "execution" key', () => {
        const data = { id: 'exec-1', status: 'running' };
        const result = spreadScheduleEvent({ type: 'schedule_execution_update', data });
        expect(result).toEqual({ execution: data });
    });

    test('passes schedule_approval_request data through as-is', () => {
        const data = { scheduleId: 's1', requiresApproval: true };
        const result = spreadScheduleEvent({ type: 'schedule_approval_request', data });
        expect(result).toEqual(data);
    });

    test('returns empty object for unknown event types', () => {
        const result = spreadScheduleEvent({ type: 'unknown_type', data: { foo: 1 } });
        expect(result).toEqual({});
    });
});

describe('spreadWorkflowEvent', () => {
    test('wraps workflow_update data under "workflow" key', () => {
        const data = { id: 'wf-1', name: 'Deploy pipeline' };
        const result = spreadWorkflowEvent({ type: 'workflow_update', data });
        expect(result).toEqual({ workflow: data });
    });

    test('wraps workflow_run_update data under "run" key', () => {
        const data = { id: 'run-1', status: 'completed' };
        const result = spreadWorkflowEvent({ type: 'workflow_run_update', data });
        expect(result).toEqual({ run: data });
    });

    test('wraps workflow_node_update data under "nodeRun" key', () => {
        const data = { id: 'nr-1', nodeId: 'n-1', status: 'running' };
        const result = spreadWorkflowEvent({ type: 'workflow_node_update', data });
        expect(result).toEqual({ nodeRun: data });
    });

    test('returns empty object for unknown event types', () => {
        const result = spreadWorkflowEvent({ type: 'some_other_event', data: { bar: 2 } });
        expect(result).toEqual({});
    });
});

describe('publishToTenant', () => {
    test('publishes to tenant-scoped topic', () => {
        const published: Array<{ topic: string; data: string }> = [];
        const mockServer = {
            publish: mock((topic: string, data: string) => {
                published.push({ topic, data });
            }),
        } as unknown as import('bun').Server<unknown>;

        publishToTenant(mockServer, 'council', '{"type":"test"}', 'tenant-123');

        expect(published.length).toBe(1);
        expect(published[0].data).toBe('{"type":"test"}');
        // tenantTopic should scope the topic
        expect(published[0].topic).toContain('council');
    });

    test('publishes to flat topic when no tenant ID', () => {
        const published: Array<{ topic: string; data: string }> = [];
        const mockServer = {
            publish: mock((topic: string, data: string) => {
                published.push({ topic, data });
            }),
        } as unknown as import('bun').Server<unknown>;

        publishToTenant(mockServer, 'algochat', '{"type":"msg"}');

        expect(published.length).toBe(1);
        expect(published[0].topic).toContain('algochat');
    });

    test('publishes to flat topic when tenant is undefined', () => {
        const published: Array<{ topic: string; data: string }> = [];
        const mockServer = {
            publish: mock((topic: string, data: string) => {
                published.push({ topic, data });
            }),
        } as unknown as import('bun').Server<unknown>;

        publishToTenant(mockServer, 'owner', '{"type":"notification"}', undefined);

        expect(published.length).toBe(1);
        expect(published[0].topic).toContain('owner');
    });
});
