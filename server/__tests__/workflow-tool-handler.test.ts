import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { WorkflowEdge, WorkflowNode } from '../../shared/types';
import { createAgent } from '../db/agents';
import { runMigrations } from '../db/schema';
import { createWorkflow, createWorkflowRun, updateWorkflow } from '../db/workflows';
import type { McpToolContext } from '../mcp/tool-handlers/types';
import { handleManageWorkflow } from '../mcp/tool-handlers/workflow';

// ── Helpers ────────────────────────────────────────────────────────────

function extractText(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  return first && 'text' in first ? (first.text ?? '') : '';
}

function isError(result: { isError?: boolean }): boolean {
  return result.isError === true;
}

const startNode: WorkflowNode = { id: 'start-1', type: 'start', label: 'Start', config: {} };
const endNode: WorkflowNode = { id: 'end-1', type: 'end', label: 'End', config: {} };
const sampleEdges: WorkflowEdge[] = [{ id: 'e1', sourceNodeId: 'start-1', targetNodeId: 'end-1' }];

// ── Setup ──────────────────────────────────────────────────────────────

let db: Database;
let agentAId: string;
let agentBId: string;

function makeCtx(agentId: string): McpToolContext {
  return {
    agentId,
    db,
    agentMessenger: {} as McpToolContext['agentMessenger'],
    agentDirectory: {} as McpToolContext['agentDirectory'],
    agentWalletService: {} as McpToolContext['agentWalletService'],
    workflowService: {
      triggerWorkflow: mock(() => Promise.resolve({ id: 'run-1', status: 'running', currentNodeIds: ['start-1'] })),
    } as unknown as McpToolContext['workflowService'],
  } as McpToolContext;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  agentAId = createAgent(db, { name: 'Agent A', model: 'sonnet' }).id;
  agentBId = createAgent(db, { name: 'Agent B', model: 'sonnet' }).id;
});

afterEach(() => {
  db.close();
});

// ── Cross-agent isolation tests ────────────────────────────────────────

describe('handleManageWorkflow — cross-agent isolation', () => {
  test("get: agent cannot read another agent's workflow", async () => {
    const wf = createWorkflow(db, { agentId: agentAId, name: 'Wf A', nodes: [startNode, endNode], edges: sampleEdges });
    const result = await handleManageWorkflow(makeCtx(agentBId), { action: 'get', workflow_id: wf.id });
    expect(isError(result)).toBe(true);
    expect(extractText(result)).toContain('not found');
  });

  test('get: agent can read its own workflow', async () => {
    const wf = createWorkflow(db, { agentId: agentAId, name: 'Wf A', nodes: [startNode, endNode], edges: sampleEdges });
    const result = await handleManageWorkflow(makeCtx(agentAId), { action: 'get', workflow_id: wf.id });
    expect(isError(result)).toBe(false);
    expect(extractText(result)).toContain('Wf A');
  });

  test("activate: agent cannot activate another agent's workflow", async () => {
    const wf = createWorkflow(db, { agentId: agentAId, name: 'Wf A', nodes: [startNode, endNode], edges: sampleEdges });
    const result = await handleManageWorkflow(makeCtx(agentBId), { action: 'activate', workflow_id: wf.id });
    expect(isError(result)).toBe(true);
    expect(extractText(result)).toContain('not found');
  });

  test("pause: agent cannot pause another agent's workflow", async () => {
    const wf = createWorkflow(db, { agentId: agentAId, name: 'Wf A', nodes: [startNode, endNode], edges: sampleEdges });
    updateWorkflow(db, wf.id, { status: 'active' });
    const result = await handleManageWorkflow(makeCtx(agentBId), { action: 'pause', workflow_id: wf.id });
    expect(isError(result)).toBe(true);
    expect(extractText(result)).toContain('not found');
  });

  test("trigger: agent cannot trigger another agent's workflow", async () => {
    const wf = createWorkflow(db, { agentId: agentAId, name: 'Wf A', nodes: [startNode, endNode], edges: sampleEdges });
    updateWorkflow(db, wf.id, { status: 'active' });
    const result = await handleManageWorkflow(makeCtx(agentBId), { action: 'trigger', workflow_id: wf.id });
    expect(isError(result)).toBe(true);
    expect(extractText(result)).toContain('not found');
  });

  test("runs: with workflow_id, agent cannot list runs for another agent's workflow", async () => {
    const wf = createWorkflow(db, { agentId: agentAId, name: 'Wf A', nodes: [startNode, endNode], edges: sampleEdges });
    const result = await handleManageWorkflow(makeCtx(agentBId), { action: 'runs', workflow_id: wf.id });
    expect(isError(result)).toBe(true);
    expect(extractText(result)).toContain('not found');
  });

  test('runs: without workflow_id, agent only sees its own runs', async () => {
    const wfA = createWorkflow(db, {
      agentId: agentAId,
      name: 'Wf A',
      nodes: [startNode, endNode],
      edges: sampleEdges,
    });
    const wfB = createWorkflow(db, {
      agentId: agentBId,
      name: 'Wf B',
      nodes: [startNode, endNode],
      edges: sampleEdges,
    });

    createWorkflowRun(db, wfA.id, agentAId, {}, { nodes: [startNode, endNode], edges: sampleEdges });
    createWorkflowRun(db, wfB.id, agentBId, {}, { nodes: [startNode, endNode], edges: sampleEdges });

    const resultA = await handleManageWorkflow(makeCtx(agentAId), { action: 'runs' });
    const textA = extractText(resultA);
    expect(isError(resultA)).toBe(false);
    expect(textA).toContain(wfA.id.slice(0, 8));
    expect(textA).not.toContain(wfB.id.slice(0, 8));
  });

  test("run_status: agent cannot view another agent's run", async () => {
    const wf = createWorkflow(db, { agentId: agentAId, name: 'Wf A', nodes: [startNode, endNode], edges: sampleEdges });
    const run = createWorkflowRun(db, wf.id, agentAId, {}, { nodes: [startNode, endNode], edges: sampleEdges });
    const result = await handleManageWorkflow(makeCtx(agentBId), { action: 'run_status', run_id: run.id });
    expect(isError(result)).toBe(true);
    expect(extractText(result)).toContain('not found');
  });

  test('run_status: agent can view its own run', async () => {
    const wf = createWorkflow(db, { agentId: agentAId, name: 'Wf A', nodes: [startNode, endNode], edges: sampleEdges });
    const run = createWorkflowRun(db, wf.id, agentAId, {}, { nodes: [startNode, endNode], edges: sampleEdges });
    const result = await handleManageWorkflow(makeCtx(agentAId), { action: 'run_status', run_id: run.id });
    expect(isError(result)).toBe(false);
    expect(extractText(result)).toContain('Workflow Run:');
  });

  test('list: agent only sees its own workflows', async () => {
    createWorkflow(db, { agentId: agentAId, name: 'Wf A', nodes: [startNode, endNode], edges: sampleEdges });
    createWorkflow(db, { agentId: agentBId, name: 'Wf B', nodes: [startNode, endNode], edges: sampleEdges });

    const result = await handleManageWorkflow(makeCtx(agentAId), { action: 'list' });
    const text = extractText(result);
    expect(isError(result)).toBe(false);
    expect(text).toContain('Wf A');
    expect(text).not.toContain('Wf B');
  });
});
