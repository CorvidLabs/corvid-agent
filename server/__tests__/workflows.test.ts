import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    createWorkflow,
    getWorkflow,
    listWorkflows,
    updateWorkflow,
    deleteWorkflow,
    createWorkflowRun,
    getWorkflowRun,
    listWorkflowRuns,
    listActiveRuns,
    updateWorkflowRunStatus,
    createNodeRun,
    getNodeRun,
    listNodeRuns,
    updateNodeRunStatus,
    getNodeRunByNodeId,
} from '../db/workflows';
import type { WorkflowNode, WorkflowEdge } from '../../shared/types';

let db: Database;
let agentId: string;

// ─── Test fixtures ──────────────────────────────────────────────────────────

const sampleNodes: WorkflowNode[] = [
    { id: 'start-1', type: 'start', label: 'Start', config: {} },
    { id: 'task-1', type: 'agent_session', label: 'Run Agent', config: { prompt: 'Hello' } },
    { id: 'end-1', type: 'end', label: 'End', config: {} },
];

const sampleEdges: WorkflowEdge[] = [
    { id: 'e1', sourceNodeId: 'start-1', targetNodeId: 'task-1' },
    { id: 'e2', sourceNodeId: 'task-1', targetNodeId: 'end-1' },
];

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    agentId = agent.id;
});

afterEach(() => {
    db.close();
});

// ─── Workflow CRUD ──────────────────────────────────────────────────────────

describe('Workflow CRUD', () => {
    test('create workflow with required fields', () => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'My Workflow',
            nodes: sampleNodes,
            edges: sampleEdges,
        });

        expect(workflow.id).toBeTruthy();
        expect(workflow.agentId).toBe(agentId);
        expect(workflow.name).toBe('My Workflow');
        expect(workflow.description).toBe('');
        expect(workflow.nodes).toHaveLength(3);
        expect(workflow.nodes[0].type).toBe('start');
        expect(workflow.edges).toHaveLength(2);
        expect(workflow.edges[0].sourceNodeId).toBe('start-1');
        expect(workflow.status).toBe('draft');
        expect(workflow.defaultProjectId).toBeNull();
        expect(workflow.maxConcurrency).toBe(2);
        expect(workflow.createdAt).toBeTruthy();
        expect(workflow.updatedAt).toBeTruthy();
    });

    test('create workflow with all optional fields', () => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Full Workflow',
            description: 'A fully configured workflow',
            nodes: sampleNodes,
            edges: sampleEdges,
            defaultProjectId: 'proj-123',
            maxConcurrency: 5,
        });

        expect(workflow.description).toBe('A fully configured workflow');
        expect(workflow.defaultProjectId).toBe('proj-123');
        expect(workflow.maxConcurrency).toBe(5);
    });

    test('create workflow serializes nodes and edges as JSON', () => {
        const nodes: WorkflowNode[] = [
            { id: 'n1', type: 'start', label: 'Begin', config: {} },
            {
                id: 'n2',
                type: 'condition',
                label: 'Check',
                config: { expression: "prev.output.includes('ok')" },
                position: { x: 100, y: 200 },
            },
        ];
        const edges: WorkflowEdge[] = [
            { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', condition: 'true', label: 'Yes' },
        ];

        const workflow = createWorkflow(db, { agentId, name: 'JSON Test', nodes, edges });

        expect(workflow.nodes[1].config.expression).toBe("prev.output.includes('ok')");
        expect(workflow.nodes[1].position).toEqual({ x: 100, y: 200 });
        expect(workflow.edges[0].condition).toBe('true');
        expect(workflow.edges[0].label).toBe('Yes');
    });

    test('get workflow by id', () => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Get Test',
            nodes: sampleNodes,
            edges: sampleEdges,
        });

        const found = getWorkflow(db, workflow.id);
        expect(found).not.toBeNull();
        expect(found!.name).toBe('Get Test');
        expect(found!.nodes).toHaveLength(3);
    });

    test('get nonexistent workflow returns null', () => {
        expect(getWorkflow(db, 'nonexistent')).toBeNull();
    });

    test('list workflows all', () => {
        createWorkflow(db, { agentId, name: 'W1', nodes: [], edges: [] });
        createWorkflow(db, { agentId, name: 'W2', nodes: [], edges: [] });

        const all = listWorkflows(db);
        expect(all).toHaveLength(2);
    });

    test('list workflows by agent', () => {
        const agent2 = createAgent(db, { name: 'Agent 2' });
        createWorkflow(db, { agentId, name: 'W1', nodes: [], edges: [] });
        createWorkflow(db, { agentId: agent2.id, name: 'W2', nodes: [], edges: [] });

        expect(listWorkflows(db, agentId)).toHaveLength(1);
        expect(listWorkflows(db, agent2.id)).toHaveLength(1);
    });

    test('list workflows returns results (ordered by updated_at DESC)', () => {
        createWorkflow(db, { agentId, name: 'W1', nodes: [], edges: [] });
        createWorkflow(db, { agentId, name: 'W2', nodes: [], edges: [] });

        const all = listWorkflows(db);
        expect(all).toHaveLength(2);
        // Both should be returned; exact order depends on timing
        const names = all.map((w) => w.name);
        expect(names).toContain('W1');
        expect(names).toContain('W2');
    });

    test('delete workflow', () => {
        const workflow = createWorkflow(db, { agentId, name: 'Delete Me', nodes: [], edges: [] });
        expect(deleteWorkflow(db, workflow.id)).toBe(true);
        expect(getWorkflow(db, workflow.id)).toBeNull();
    });

    test('delete nonexistent workflow returns false', () => {
        expect(deleteWorkflow(db, 'nonexistent')).toBe(false);
    });

    test('list workflows returns empty array when none exist', () => {
        expect(listWorkflows(db)).toHaveLength(0);
    });
});

// ─── Update Workflow ────────────────────────────────────────────────────────

describe('Update Workflow', () => {
    test('partial update only changes specified fields', () => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Original',
            description: 'Original desc',
            nodes: sampleNodes,
            edges: sampleEdges,
        });

        const updated = updateWorkflow(db, workflow.id, { name: 'Updated' });
        expect(updated!.name).toBe('Updated');
        expect(updated!.description).toBe('Original desc'); // unchanged
        expect(updated!.nodes).toHaveLength(3); // unchanged
    });

    test('update with no fields returns existing', () => {
        const workflow = createWorkflow(db, { agentId, name: 'NoOp', nodes: [], edges: [] });
        const updated = updateWorkflow(db, workflow.id, {});
        expect(updated!.name).toBe('NoOp');
    });

    test('update nonexistent workflow returns null', () => {
        expect(updateWorkflow(db, 'nonexistent', { name: 'X' })).toBeNull();
    });

    test('update status', () => {
        const workflow = createWorkflow(db, { agentId, name: 'Status', nodes: [], edges: [] });
        const updated = updateWorkflow(db, workflow.id, { status: 'active' });
        expect(updated!.status).toBe('active');
    });

    test('update description', () => {
        const workflow = createWorkflow(db, { agentId, name: 'Desc', nodes: [], edges: [] });
        const updated = updateWorkflow(db, workflow.id, { description: 'New description' });
        expect(updated!.description).toBe('New description');
    });

    test('update nodes replaces JSON', () => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Nodes Test',
            nodes: sampleNodes,
            edges: [],
        });

        const newNodes: WorkflowNode[] = [
            { id: 'new-start', type: 'start', label: 'New Start', config: {} },
        ];
        const updated = updateWorkflow(db, workflow.id, { nodes: newNodes });
        expect(updated!.nodes).toHaveLength(1);
        expect(updated!.nodes[0].id).toBe('new-start');
    });

    test('update edges replaces JSON', () => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Edges Test',
            nodes: [],
            edges: sampleEdges,
        });

        const newEdges: WorkflowEdge[] = [
            { id: 'new-e1', sourceNodeId: 'a', targetNodeId: 'b' },
        ];
        const updated = updateWorkflow(db, workflow.id, { edges: newEdges });
        expect(updated!.edges).toHaveLength(1);
        expect(updated!.edges[0].id).toBe('new-e1');
    });

    test('update defaultProjectId', () => {
        const workflow = createWorkflow(db, { agentId, name: 'Proj', nodes: [], edges: [] });
        const updated = updateWorkflow(db, workflow.id, { defaultProjectId: 'proj-456' });
        expect(updated!.defaultProjectId).toBe('proj-456');
    });

    test('update maxConcurrency', () => {
        const workflow = createWorkflow(db, { agentId, name: 'Conc', nodes: [], edges: [] });
        const updated = updateWorkflow(db, workflow.id, { maxConcurrency: 10 });
        expect(updated!.maxConcurrency).toBe(10);
    });

    test('update multiple fields at once', () => {
        const workflow = createWorkflow(db, { agentId, name: 'Multi', nodes: [], edges: [] });
        const updated = updateWorkflow(db, workflow.id, {
            name: 'Updated Multi',
            description: 'New desc',
            status: 'active',
            maxConcurrency: 8,
        });
        expect(updated!.name).toBe('Updated Multi');
        expect(updated!.description).toBe('New desc');
        expect(updated!.status).toBe('active');
        expect(updated!.maxConcurrency).toBe(8);
    });
});

// ─── Workflow Runs ──────────────────────────────────────────────────────────

describe('Workflow Runs', () => {
    let workflowId: string;

    beforeEach(() => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Run Test Workflow',
            nodes: sampleNodes,
            edges: sampleEdges,
        });
        workflowId = workflow.id;
    });

    test('create workflow run', () => {
        const run = createWorkflowRun(db, workflowId, agentId, { key: 'value' }, {
            nodes: sampleNodes,
            edges: sampleEdges,
        });

        expect(run.id).toBeTruthy();
        expect(run.workflowId).toBe(workflowId);
        expect(run.agentId).toBe(agentId);
        expect(run.status).toBe('running');
        expect(run.input).toEqual({ key: 'value' });
        expect(run.output).toBeNull();
        expect(run.workflowSnapshot.nodes).toHaveLength(3);
        expect(run.workflowSnapshot.edges).toHaveLength(2);
        expect(run.currentNodeIds).toEqual([]);
        expect(run.error).toBeNull();
        expect(run.startedAt).toBeTruthy();
        expect(run.completedAt).toBeNull();
        expect(run.nodeRuns).toEqual([]);
    });

    test('get workflow run by id', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, {
            nodes: sampleNodes,
            edges: sampleEdges,
        });

        const found = getWorkflowRun(db, run.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(run.id);
        expect(found!.workflowId).toBe(workflowId);
    });

    test('get nonexistent workflow run returns null', () => {
        expect(getWorkflowRun(db, 'nonexistent')).toBeNull();
    });

    test('get workflow run includes node runs', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, {
            nodes: sampleNodes,
            edges: sampleEdges,
        });
        createNodeRun(db, run.id, 'start-1', 'start', {});
        createNodeRun(db, run.id, 'task-1', 'agent_session', { prompt: 'Hello' });

        const found = getWorkflowRun(db, run.id);
        expect(found!.nodeRuns).toHaveLength(2);
    });

    test('list workflow runs all', () => {
        createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });

        const all = listWorkflowRuns(db);
        expect(all).toHaveLength(2);
    });

    test('list workflow runs by workflowId', () => {
        const workflow2 = createWorkflow(db, { agentId, name: 'Other', nodes: [], edges: [] });
        createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        createWorkflowRun(db, workflow2.id, agentId, {}, { nodes: [], edges: [] });

        expect(listWorkflowRuns(db, workflowId)).toHaveLength(1);
        expect(listWorkflowRuns(db, workflow2.id)).toHaveLength(1);
    });

    test('list workflow runs respects limit', () => {
        for (let i = 0; i < 5; i++) {
            createWorkflowRun(db, workflowId, agentId, { i }, { nodes: [], edges: [] });
        }
        expect(listWorkflowRuns(db, workflowId, 3)).toHaveLength(3);
    });

    test('list workflow runs does not include node runs (performance)', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        createNodeRun(db, run.id, 'start-1', 'start', {});

        const runs = listWorkflowRuns(db, workflowId);
        expect(runs[0].nodeRuns).toEqual([]);
    });

    test('list active runs returns running and paused', () => {
        const run1 = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        const run2 = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        const run3 = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });

        // run1 stays 'running', run2 paused, run3 completed
        updateWorkflowRunStatus(db, run2.id, 'paused');
        updateWorkflowRunStatus(db, run3.id, 'completed');

        const active = listActiveRuns(db);
        expect(active).toHaveLength(2);
        const ids = active.map((r) => r.id);
        expect(ids).toContain(run1.id);
        expect(ids).toContain(run2.id);
    });

    test('list active runs includes node runs', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        createNodeRun(db, run.id, 'start-1', 'start', {});

        const active = listActiveRuns(db);
        expect(active[0].nodeRuns).toHaveLength(1);
    });

    test('list active runs returns empty when none active', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        updateWorkflowRunStatus(db, run.id, 'completed');

        expect(listActiveRuns(db)).toHaveLength(0);
    });
});

// ─── Update Workflow Run Status ─────────────────────────────────────────────

describe('Update Workflow Run Status', () => {
    let workflowId: string;

    beforeEach(() => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Status Test Workflow',
            nodes: sampleNodes,
            edges: sampleEdges,
        });
        workflowId = workflow.id;
    });

    test('update status to completed sets completed_at', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        updateWorkflowRunStatus(db, run.id, 'completed');

        const found = getWorkflowRun(db, run.id);
        expect(found!.status).toBe('completed');
        expect(found!.completedAt).not.toBeNull();
    });

    test('update status to failed sets completed_at', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        updateWorkflowRunStatus(db, run.id, 'failed', { error: 'Something went wrong' });

        const found = getWorkflowRun(db, run.id);
        expect(found!.status).toBe('failed');
        expect(found!.completedAt).not.toBeNull();
        expect(found!.error).toBe('Something went wrong');
    });

    test('update status to cancelled sets completed_at', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        updateWorkflowRunStatus(db, run.id, 'cancelled');

        const found = getWorkflowRun(db, run.id);
        expect(found!.status).toBe('cancelled');
        expect(found!.completedAt).not.toBeNull();
    });

    test('update status to paused does not set completed_at', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        updateWorkflowRunStatus(db, run.id, 'paused');

        const found = getWorkflowRun(db, run.id);
        expect(found!.status).toBe('paused');
        expect(found!.completedAt).toBeNull();
    });

    test('update with output', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        updateWorkflowRunStatus(db, run.id, 'completed', {
            output: { result: 'success', count: 42 },
        });

        const found = getWorkflowRun(db, run.id);
        expect(found!.output).toEqual({ result: 'success', count: 42 });
    });

    test('update currentNodeIds', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        updateWorkflowRunStatus(db, run.id, 'running', {
            currentNodeIds: ['task-1', 'task-2'],
        });

        const found = getWorkflowRun(db, run.id);
        expect(found!.currentNodeIds).toEqual(['task-1', 'task-2']);
    });

    test('update with error', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        updateWorkflowRunStatus(db, run.id, 'failed', { error: 'Timeout exceeded' });

        const found = getWorkflowRun(db, run.id);
        expect(found!.error).toBe('Timeout exceeded');
    });

    test('update with all optional fields', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        updateWorkflowRunStatus(db, run.id, 'completed', {
            output: { done: true },
            currentNodeIds: ['end-1'],
            error: undefined, // should not set error
        });

        const found = getWorkflowRun(db, run.id);
        expect(found!.status).toBe('completed');
        expect(found!.output).toEqual({ done: true });
        expect(found!.currentNodeIds).toEqual(['end-1']);
    });
});

// ─── Workflow Node Runs ─────────────────────────────────────────────────────

describe('Workflow Node Runs', () => {
    let workflowId: string;
    let runId: string;

    beforeEach(() => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Node Run Workflow',
            nodes: sampleNodes,
            edges: sampleEdges,
        });
        workflowId = workflow.id;
        const run = createWorkflowRun(db, workflowId, agentId, {}, {
            nodes: sampleNodes,
            edges: sampleEdges,
        });
        runId = run.id;
    });

    test('create node run', () => {
        const nodeRun = createNodeRun(db, runId, 'start-1', 'start', { trigger: 'manual' });

        expect(nodeRun.id).toBeTruthy();
        expect(nodeRun.runId).toBe(runId);
        expect(nodeRun.nodeId).toBe('start-1');
        expect(nodeRun.nodeType).toBe('start');
        expect(nodeRun.status).toBe('pending');
        expect(nodeRun.input).toEqual({ trigger: 'manual' });
        expect(nodeRun.output).toBeNull();
        expect(nodeRun.sessionId).toBeNull();
        expect(nodeRun.workTaskId).toBeNull();
        expect(nodeRun.error).toBeNull();
        expect(nodeRun.startedAt).toBeNull();
        expect(nodeRun.completedAt).toBeNull();
    });

    test('get node run by id', () => {
        const nodeRun = createNodeRun(db, runId, 'start-1', 'start', {});
        const found = getNodeRun(db, nodeRun.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(nodeRun.id);
    });

    test('get nonexistent node run returns null', () => {
        expect(getNodeRun(db, 'nonexistent')).toBeNull();
    });

    test('list node runs for a run', () => {
        createNodeRun(db, runId, 'start-1', 'start', {});
        createNodeRun(db, runId, 'task-1', 'agent_session', { prompt: 'test' });
        createNodeRun(db, runId, 'end-1', 'end', {});

        const nodeRuns = listNodeRuns(db, runId);
        expect(nodeRuns).toHaveLength(3);
    });

    test('list node runs returns empty for run with no node runs', () => {
        expect(listNodeRuns(db, runId)).toHaveLength(0);
    });

    test('get node run by node id', () => {
        createNodeRun(db, runId, 'start-1', 'start', {});
        createNodeRun(db, runId, 'task-1', 'agent_session', {});

        const found = getNodeRunByNodeId(db, runId, 'task-1');
        expect(found).not.toBeNull();
        expect(found!.nodeId).toBe('task-1');
        expect(found!.nodeType).toBe('agent_session');
    });

    test('get node run by node id returns null when not found', () => {
        expect(getNodeRunByNodeId(db, runId, 'nonexistent')).toBeNull();
    });

    test('get node run by node id scoped to run', () => {
        const run2 = createWorkflowRun(db, workflowId, agentId, {}, { nodes: [], edges: [] });
        createNodeRun(db, runId, 'start-1', 'start', {});
        createNodeRun(db, run2.id, 'start-1', 'start', {});

        // Should find the one for the correct run
        const found = getNodeRunByNodeId(db, runId, 'start-1');
        expect(found).not.toBeNull();
        expect(found!.runId).toBe(runId);
    });
});

// ─── Update Node Run Status ─────────────────────────────────────────────────

describe('Update Node Run Status', () => {
    let runId: string;

    beforeEach(() => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Node Status Workflow',
            nodes: sampleNodes,
            edges: sampleEdges,
        });
        const run = createWorkflowRun(db, workflow.id, agentId, {}, {
            nodes: sampleNodes,
            edges: sampleEdges,
        });
        runId = run.id;
    });

    test('update to running sets started_at', () => {
        const nodeRun = createNodeRun(db, runId, 'start-1', 'start', {});
        expect(nodeRun.startedAt).toBeNull();

        updateNodeRunStatus(db, nodeRun.id, 'running');
        const found = getNodeRun(db, nodeRun.id);
        expect(found!.status).toBe('running');
        expect(found!.startedAt).not.toBeNull();
    });

    test('update to waiting sets started_at', () => {
        const nodeRun = createNodeRun(db, runId, 'task-1', 'webhook_wait', {});
        updateNodeRunStatus(db, nodeRun.id, 'waiting');

        const found = getNodeRun(db, nodeRun.id);
        expect(found!.status).toBe('waiting');
        expect(found!.startedAt).not.toBeNull();
    });

    test('update to running does not overwrite started_at (COALESCE)', () => {
        const nodeRun = createNodeRun(db, runId, 'start-1', 'start', {});
        updateNodeRunStatus(db, nodeRun.id, 'running');
        const firstStartedAt = getNodeRun(db, nodeRun.id)!.startedAt;

        // Update again to waiting - started_at should remain unchanged
        updateNodeRunStatus(db, nodeRun.id, 'waiting');
        const found = getNodeRun(db, nodeRun.id);
        expect(found!.startedAt).toBe(firstStartedAt);
    });

    test('update to completed sets completed_at', () => {
        const nodeRun = createNodeRun(db, runId, 'task-1', 'agent_session', {});
        updateNodeRunStatus(db, nodeRun.id, 'running');
        updateNodeRunStatus(db, nodeRun.id, 'completed', {
            output: { result: 'done' },
        });

        const found = getNodeRun(db, nodeRun.id);
        expect(found!.status).toBe('completed');
        expect(found!.completedAt).not.toBeNull();
        expect(found!.output).toEqual({ result: 'done' });
    });

    test('update to failed sets completed_at and error', () => {
        const nodeRun = createNodeRun(db, runId, 'task-1', 'agent_session', {});
        updateNodeRunStatus(db, nodeRun.id, 'failed', { error: 'Agent crashed' });

        const found = getNodeRun(db, nodeRun.id);
        expect(found!.status).toBe('failed');
        expect(found!.completedAt).not.toBeNull();
        expect(found!.error).toBe('Agent crashed');
    });

    test('update to skipped sets completed_at', () => {
        const nodeRun = createNodeRun(db, runId, 'task-1', 'agent_session', {});
        updateNodeRunStatus(db, nodeRun.id, 'skipped');

        const found = getNodeRun(db, nodeRun.id);
        expect(found!.status).toBe('skipped');
        expect(found!.completedAt).not.toBeNull();
    });

    test('update to pending does not set started_at or completed_at', () => {
        const nodeRun = createNodeRun(db, runId, 'task-1', 'agent_session', {});
        updateNodeRunStatus(db, nodeRun.id, 'pending');

        const found = getNodeRun(db, nodeRun.id);
        expect(found!.startedAt).toBeNull();
        expect(found!.completedAt).toBeNull();
    });

    test('update with sessionId', () => {
        const nodeRun = createNodeRun(db, runId, 'task-1', 'agent_session', {});
        updateNodeRunStatus(db, nodeRun.id, 'running', { sessionId: 'session-abc' });

        const found = getNodeRun(db, nodeRun.id);
        expect(found!.sessionId).toBe('session-abc');
    });

    test('update with workTaskId', () => {
        const nodeRun = createNodeRun(db, runId, 'task-1', 'work_task', {});
        updateNodeRunStatus(db, nodeRun.id, 'running', { workTaskId: 'wt-123' });

        const found = getNodeRun(db, nodeRun.id);
        expect(found!.workTaskId).toBe('wt-123');
    });

    test('update with output JSON', () => {
        const nodeRun = createNodeRun(db, runId, 'task-1', 'agent_session', {});
        const output = { response: 'All tests passed', metrics: { passed: 10, failed: 0 } };
        updateNodeRunStatus(db, nodeRun.id, 'completed', { output });

        const found = getNodeRun(db, nodeRun.id);
        expect(found!.output).toEqual(output);
    });

    test('update with all optional fields', () => {
        const nodeRun = createNodeRun(db, runId, 'task-1', 'work_task', {});
        updateNodeRunStatus(db, nodeRun.id, 'completed', {
            output: { pr: 'https://github.com/test/pr/1' },
            sessionId: 'session-xyz',
            workTaskId: 'wt-456',
            error: undefined, // should not set error
        });

        const found = getNodeRun(db, nodeRun.id);
        expect(found!.status).toBe('completed');
        expect(found!.output).toEqual({ pr: 'https://github.com/test/pr/1' });
        expect(found!.sessionId).toBe('session-xyz');
        expect(found!.workTaskId).toBe('wt-456');
        expect(found!.error).toBeNull(); // wasn't set
    });
});

// ─── Parallel Execution & Conditional Branching ─────────────────────────────

describe('Workflow Parallel Execution', () => {
    let workflowId: string;

    beforeEach(() => {
        const workflow = createWorkflow(db, {
            agentId,
            name: 'Parallel Test Workflow',
            nodes: sampleNodes,
            edges: sampleEdges,
        });
        workflowId = workflow.id;
    });

    test('parallel node runs respect MAX_CONCURRENT_NODES (4)', () => {
        // Create a workflow run with many nodes
        const parallelNodes: WorkflowNode[] = [
            { id: 'start', type: 'start', label: 'Start', config: {} },
            { id: 'parallel-split', type: 'parallel', label: 'Split', config: {} },
            { id: 'task-a', type: 'agent_session', label: 'Task A', config: { prompt: 'A' } },
            { id: 'task-b', type: 'agent_session', label: 'Task B', config: { prompt: 'B' } },
            { id: 'task-c', type: 'agent_session', label: 'Task C', config: { prompt: 'C' } },
            { id: 'task-d', type: 'agent_session', label: 'Task D', config: { prompt: 'D' } },
            { id: 'task-e', type: 'agent_session', label: 'Task E', config: { prompt: 'E' } },
            { id: 'join', type: 'join', label: 'Join', config: {} },
            { id: 'end', type: 'end', label: 'End', config: {} },
        ];
        const parallelEdges: WorkflowEdge[] = [
            { id: 'e1', sourceNodeId: 'start', targetNodeId: 'parallel-split' },
            { id: 'e2', sourceNodeId: 'parallel-split', targetNodeId: 'task-a' },
            { id: 'e3', sourceNodeId: 'parallel-split', targetNodeId: 'task-b' },
            { id: 'e4', sourceNodeId: 'parallel-split', targetNodeId: 'task-c' },
            { id: 'e5', sourceNodeId: 'parallel-split', targetNodeId: 'task-d' },
            { id: 'e6', sourceNodeId: 'parallel-split', targetNodeId: 'task-e' },
            { id: 'e7', sourceNodeId: 'task-a', targetNodeId: 'join' },
            { id: 'e8', sourceNodeId: 'task-b', targetNodeId: 'join' },
            { id: 'e9', sourceNodeId: 'task-c', targetNodeId: 'join' },
            { id: 'e10', sourceNodeId: 'task-d', targetNodeId: 'join' },
            { id: 'e11', sourceNodeId: 'task-e', targetNodeId: 'join' },
            { id: 'e12', sourceNodeId: 'join', targetNodeId: 'end' },
        ];

        const workflow = createWorkflow(db, {
            agentId,
            name: 'Parallel Workflow',
            nodes: parallelNodes,
            edges: parallelEdges,
        });

        const run = createWorkflowRun(db, workflow.id, agentId, {}, {
            nodes: parallelNodes,
            edges: parallelEdges,
        });

        // Verify the snapshot captures the parallel graph structure
        expect(run.workflowSnapshot.nodes).toHaveLength(9);
        expect(run.workflowSnapshot.edges).toHaveLength(12);

        // Verify the parallel split node has 5 outgoing edges
        const splitEdges = run.workflowSnapshot.edges.filter(
            (e) => e.sourceNodeId === 'parallel-split'
        );
        expect(splitEdges).toHaveLength(5);

        // Verify the join node has 5 incoming edges
        const joinEdges = run.workflowSnapshot.edges.filter(
            (e) => e.targetNodeId === 'join'
        );
        expect(joinEdges).toHaveLength(5);
    });

    test('conditional branching with true/false edges', () => {
        const condNodes: WorkflowNode[] = [
            { id: 'start', type: 'start', label: 'Start', config: {} },
            { id: 'cond', type: 'condition', label: 'Check', config: { expression: "prev.status === 'ok'" } },
            { id: 'true-path', type: 'agent_session', label: 'Success', config: { prompt: 'handle success' } },
            { id: 'false-path', type: 'agent_session', label: 'Failure', config: { prompt: 'handle failure' } },
            { id: 'end', type: 'end', label: 'End', config: {} },
        ];
        const condEdges: WorkflowEdge[] = [
            { id: 'e1', sourceNodeId: 'start', targetNodeId: 'cond' },
            { id: 'e2', sourceNodeId: 'cond', targetNodeId: 'true-path', condition: 'true' },
            { id: 'e3', sourceNodeId: 'cond', targetNodeId: 'false-path', condition: 'false' },
            { id: 'e4', sourceNodeId: 'true-path', targetNodeId: 'end' },
            { id: 'e5', sourceNodeId: 'false-path', targetNodeId: 'end' },
        ];

        const workflow = createWorkflow(db, {
            agentId,
            name: 'Conditional Workflow',
            nodes: condNodes,
            edges: condEdges,
        });

        const run = createWorkflowRun(db, workflow.id, agentId, {}, {
            nodes: condNodes,
            edges: condEdges,
        });

        // Create node runs to simulate execution
        const startRun = createNodeRun(db, run.id, 'start', 'start', {});
        updateNodeRunStatus(db, startRun.id, 'completed', { output: { status: 'ok' } });

        // Condition node evaluates to true
        const condRun = createNodeRun(db, run.id, 'cond', 'condition', { status: 'ok' });
        updateNodeRunStatus(db, condRun.id, 'completed', { output: { conditionResult: true } });

        // The true-path edge should match the condition result
        const trueEdge = condEdges.find(e => e.sourceNodeId === 'cond' && e.condition === 'true');
        expect(trueEdge).toBeDefined();
        expect(trueEdge!.targetNodeId).toBe('true-path');

        // And the false path should not match
        const falseEdge = condEdges.find(e => e.sourceNodeId === 'cond' && e.condition === 'false');
        expect(falseEdge).toBeDefined();
        expect(falseEdge!.targetNodeId).toBe('false-path');

        // Verify conditionResult is stored correctly
        const condRunFound = getNodeRunByNodeId(db, run.id, 'cond');
        expect(condRunFound!.output).toEqual({ conditionResult: true });
    });

    test('data passing between nodes via prev.output', () => {
        const run = createWorkflowRun(db, workflowId, agentId, { initial: 'data' }, {
            nodes: sampleNodes,
            edges: sampleEdges,
        });

        // Start node produces output
        const startRun = createNodeRun(db, run.id, 'start-1', 'start', { initial: 'data' });
        updateNodeRunStatus(db, startRun.id, 'completed', {
            output: { computed: 'result-from-start' },
        });

        // Task node can access the predecessor's output
        const taskRun = createNodeRun(db, run.id, 'task-1', 'agent_session', {
            initial: 'data',
            prev: { computed: 'result-from-start' },
        });
        updateNodeRunStatus(db, taskRun.id, 'completed', {
            output: { response: 'processed' },
        });

        // Verify the chain of outputs
        const startFound = getNodeRunByNodeId(db, run.id, 'start-1');
        expect(startFound!.output).toEqual({ computed: 'result-from-start' });

        const taskFound = getNodeRunByNodeId(db, run.id, 'task-1');
        expect(taskFound!.input).toEqual({
            initial: 'data',
            prev: { computed: 'result-from-start' },
        });
        expect(taskFound!.output).toEqual({ response: 'processed' });
    });

    test('delay node run records delay metadata', () => {
        const delayNodes: WorkflowNode[] = [
            { id: 'start', type: 'start', label: 'Start', config: {} },
            { id: 'delay', type: 'delay', label: 'Wait 5s', config: { delayMs: 5000 } },
            { id: 'end', type: 'end', label: 'End', config: {} },
        ];
        const delayEdges: WorkflowEdge[] = [
            { id: 'e1', sourceNodeId: 'start', targetNodeId: 'delay' },
            { id: 'e2', sourceNodeId: 'delay', targetNodeId: 'end' },
        ];

        const workflow = createWorkflow(db, {
            agentId,
            name: 'Delay Workflow',
            nodes: delayNodes,
            edges: delayEdges,
        });

        const run = createWorkflowRun(db, workflow.id, agentId, {}, {
            nodes: delayNodes,
            edges: delayEdges,
        });

        // Simulate delay node completion
        const delayRun = createNodeRun(db, run.id, 'delay', 'delay', {});
        updateNodeRunStatus(db, delayRun.id, 'completed', {
            output: { delayed: true, delayMs: 5000 },
        });

        const found = getNodeRunByNodeId(db, run.id, 'delay');
        expect(found!.output).toEqual({ delayed: true, delayMs: 5000 });
        expect(found!.status).toBe('completed');
    });

    test('failure in one parallel branch fails the entire run', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, {
            nodes: sampleNodes,
            edges: sampleEdges,
        });

        // Start node succeeds
        const startRun = createNodeRun(db, run.id, 'start-1', 'start', {});
        updateNodeRunStatus(db, startRun.id, 'completed', { output: {} });

        // Task node fails
        const taskRun = createNodeRun(db, run.id, 'task-1', 'agent_session', {});
        updateNodeRunStatus(db, taskRun.id, 'failed', { error: 'Agent crashed unexpectedly' });

        // The run should be marked as failed
        updateWorkflowRunStatus(db, run.id, 'failed', {
            error: 'Node "Run Agent" failed: Agent crashed unexpectedly',
        });

        const found = getWorkflowRun(db, run.id);
        expect(found!.status).toBe('failed');
        expect(found!.error).toBe('Node "Run Agent" failed: Agent crashed unexpectedly');
        expect(found!.completedAt).not.toBeNull();
    });

    test('join node requires ALL predecessors complete', () => {
        const joinNodes: WorkflowNode[] = [
            { id: 'start', type: 'start', label: 'Start', config: {} },
            { id: 'task-a', type: 'agent_session', label: 'A', config: {} },
            { id: 'task-b', type: 'agent_session', label: 'B', config: {} },
            { id: 'join', type: 'join', label: 'Join', config: {} },
            { id: 'end', type: 'end', label: 'End', config: {} },
        ];
        const joinEdges: WorkflowEdge[] = [
            { id: 'e1', sourceNodeId: 'start', targetNodeId: 'task-a' },
            { id: 'e2', sourceNodeId: 'start', targetNodeId: 'task-b' },
            { id: 'e3', sourceNodeId: 'task-a', targetNodeId: 'join' },
            { id: 'e4', sourceNodeId: 'task-b', targetNodeId: 'join' },
            { id: 'e5', sourceNodeId: 'join', targetNodeId: 'end' },
        ];

        const workflow = createWorkflow(db, {
            agentId,
            name: 'Join Workflow',
            nodes: joinNodes,
            edges: joinEdges,
        });

        const run = createWorkflowRun(db, workflow.id, agentId, {}, {
            nodes: joinNodes,
            edges: joinEdges,
        });

        // Start completes
        const startRun = createNodeRun(db, run.id, 'start', 'start', {});
        updateNodeRunStatus(db, startRun.id, 'completed');

        // Only task-a completes; task-b still pending
        const taskARun = createNodeRun(db, run.id, 'task-a', 'agent_session', {});
        updateNodeRunStatus(db, taskARun.id, 'completed', { output: { result: 'A done' } });

        const taskBRun = createNodeRun(db, run.id, 'task-b', 'agent_session', {});
        // task-b still running
        updateNodeRunStatus(db, taskBRun.id, 'running');

        // Verify node runs state
        const nodeRuns = listNodeRuns(db, run.id);
        const joinRun = nodeRuns.find(nr => nr.nodeId === 'join');
        // Join should NOT exist yet (not ready)
        expect(joinRun).toBeUndefined();

        // Now complete task-b
        updateNodeRunStatus(db, taskBRun.id, 'completed', { output: { result: 'B done' } });

        // Both predecessors are complete — join node can now be created
        const taskAFound = getNodeRunByNodeId(db, run.id, 'task-a');
        const taskBFound = getNodeRunByNodeId(db, run.id, 'task-b');
        expect(taskAFound!.status).toBe('completed');
        expect(taskBFound!.status).toBe('completed');
    });

    test('workflow run tracks currentNodeIds for parallel execution', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, {
            nodes: sampleNodes,
            edges: sampleEdges,
        });

        // Set multiple concurrent node IDs
        updateWorkflowRunStatus(db, run.id, 'running', {
            currentNodeIds: ['task-a', 'task-b', 'task-c'],
        });

        const found = getWorkflowRun(db, run.id);
        expect(found!.currentNodeIds).toEqual(['task-a', 'task-b', 'task-c']);
    });

    test('transform node stores transformed output', () => {
        const run = createWorkflowRun(db, workflowId, agentId, {}, {
            nodes: sampleNodes,
            edges: sampleEdges,
        });

        const transformRun = createNodeRun(db, run.id, 'task-1', 'transform', {
            prev: { output: 'raw data' },
        });
        updateNodeRunStatus(db, transformRun.id, 'completed', {
            output: { transformed: 'processed: raw data', prev: { output: 'raw data' } },
        });

        const found = getNodeRun(db, transformRun.id);
        expect(found!.output).toEqual({
            transformed: 'processed: raw data',
            prev: { output: 'raw data' },
        });
    });

    test('workflow snapshot preserves node positions', () => {
        const nodesWithPositions: WorkflowNode[] = [
            { id: 's', type: 'start', label: 'Start', config: {}, position: { x: 0, y: 0 } },
            { id: 't', type: 'agent_session', label: 'Task', config: {}, position: { x: 200, y: 100 } },
            { id: 'e', type: 'end', label: 'End', config: {}, position: { x: 400, y: 0 } },
        ];

        const workflow = createWorkflow(db, {
            agentId,
            name: 'Position Test',
            nodes: nodesWithPositions,
            edges: sampleEdges,
        });

        const run = createWorkflowRun(db, workflow.id, agentId, {}, {
            nodes: nodesWithPositions,
            edges: sampleEdges,
        });

        expect(run.workflowSnapshot.nodes[1].position).toEqual({ x: 200, y: 100 });
    });
});
