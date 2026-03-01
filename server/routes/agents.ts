import type { Database } from 'bun:sqlite';
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent } from '../db/agents';
import { listAgentMessages } from '../db/agent-messages';
import {
    getAgentSpendingCap, setAgentSpendingCap, removeAgentSpendingCap,
    getAgentDailySpending, getDefaultAgentDailyCap,
} from '../db/spending';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AgentMessenger } from '../algochat/agent-messenger';
import { parseBodyOrThrow, ValidationError, CreateAgentSchema, UpdateAgentSchema, FundAgentSchema, InvokeAgentSchema, SetSpendingCapSchema } from '../lib/validation';
import { json, handleRouteError } from '../lib/response';
import { buildAgentCardForAgent } from '../a2a/agent-card';
import { recordAudit } from '../db/audit';
import { getClientIp } from '../middleware/rate-limit';
import type { RequestContext } from '../middleware/guards';

export function handleAgentRoutes(
    req: Request,
    url: URL,
    db: Database,
    context: RequestContext,
    agentWalletService?: AgentWalletService | null,
    agentMessenger?: AgentMessenger | null,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/agents' && method === 'GET') {
        return json(listAgents(db, context.tenantId));
    }

    if (path === '/api/agents' && method === 'POST') {
        return handleCreate(req, db, context, agentWalletService);
    }

    // Agent balance endpoint
    const balanceMatch = path.match(/^\/api\/agents\/([^/]+)\/balance$/);
    if (balanceMatch && method === 'GET') {
        return handleBalance(balanceMatch[1], db, context, agentWalletService);
    }

    // Agent fund endpoint
    const fundMatch = path.match(/^\/api\/agents\/([^/]+)\/fund$/);
    if (fundMatch && method === 'POST') {
        return handleFund(req, fundMatch[1], db, context, agentWalletService);
    }

    // Agent invoke endpoint
    const invokeMatch = path.match(/^\/api\/agents\/([^/]+)\/invoke$/);
    if (invokeMatch && method === 'POST') {
        return handleInvoke(req, invokeMatch[1], db, context, agentMessenger);
    }

    // Agent messages endpoint
    const messagesMatch = path.match(/^\/api\/agents\/([^/]+)\/messages$/);
    if (messagesMatch && method === 'GET') {
        return handleMessages(messagesMatch[1], db, context);
    }

    // Agent spending endpoints
    const spendingMatch = path.match(/^\/api\/agents\/([^/]+)\/spending$/);
    if (spendingMatch && method === 'GET') {
        return handleGetSpending(spendingMatch[1], db, context);
    }

    const spendingCapMatch = path.match(/^\/api\/agents\/([^/]+)\/spending-cap$/);
    if (spendingCapMatch && method === 'PUT') {
        return handleSetSpendingCap(req, spendingCapMatch[1], db, context);
    }
    if (spendingCapMatch && method === 'DELETE') {
        return handleDeleteSpendingCap(spendingCapMatch[1], db, context);
    }

    // A2A Agent Card for a specific agent
    const agentCardMatch = path.match(/^\/api\/agents\/([^/]+)\/agent-card$/);
    if (agentCardMatch && method === 'GET') {
        const agent = getAgent(db, agentCardMatch[1], context.tenantId);
        if (!agent) return json({ error: 'Not found' }, 404);
        const baseUrl = `${new URL(req.url).protocol}//${new URL(req.url).host}`;
        const card = buildAgentCardForAgent(agent, baseUrl);
        return json(card);
    }

    const match = path.match(/^\/api\/agents\/([^/]+)$/);
    if (!match) return null;

    const id = match[1];

    if (method === 'GET') {
        const agent = getAgent(db, id, context.tenantId);
        return agent ? json(agent) : json({ error: 'Not found' }, 404);
    }

    if (method === 'PUT') {
        return handleUpdate(req, db, id, context);
    }

    if (method === 'DELETE') {
        const deleted = deleteAgent(db, id, context.tenantId);
        if (deleted) {
            const actor = context.walletAddress ?? getClientIp(req);
            recordAudit(db, 'agent_delete', actor, 'agent', id, null, null, getClientIp(req));
            return json({ ok: true });
        }
        return json({ error: 'Not found' }, 404);
    }

    return null;
}

async function handleCreate(
    req: Request,
    db: Database,
    context: RequestContext,
    agentWalletService?: AgentWalletService | null,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateAgentSchema);
        const agent = createAgent(db, data, context.tenantId);

        const actor = context.walletAddress ?? getClientIp(req);
        recordAudit(db, 'agent_create', actor, 'agent', agent.id, null, null, getClientIp(req));

        // Auto-create wallet on localnet if AlgoChat is available
        if (agentWalletService) {
            agentWalletService.ensureWallet(agent.id).catch(() => {
                // Fire and forget — wallet creation failure is non-blocking
            });
        }

        return json(agent, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleBalance(
    agentId: string,
    db: Database,
    context: RequestContext,
    agentWalletService?: AgentWalletService | null,
): Promise<Response> {
    const agent = getAgent(db, agentId, context.tenantId);
    if (!agent) return json({ error: 'Not found' }, 404);

    let balance = 0;
    if (agent.walletAddress && agentWalletService) {
        balance = await agentWalletService.getBalance(agent.walletAddress);
    }

    return json({ balance, address: agent.walletAddress });
}

async function handleFund(
    req: Request,
    agentId: string,
    db: Database,
    context: RequestContext,
    agentWalletService?: AgentWalletService | null,
): Promise<Response> {
    if (!agentWalletService) {
        return json({ error: 'Wallet service not available' }, 503);
    }

    const agent = getAgent(db, agentId, context.tenantId);
    if (!agent) return json({ error: 'Not found' }, 404);
    if (!agent.walletAddress) return json({ error: 'Agent has no wallet' }, 400);

    try {
        const data = await parseBodyOrThrow(req, FundAgentSchema);

        await agentWalletService.fundAgent(agentId, data.microAlgos);
        const balance = await agentWalletService.getBalance(agent.walletAddress);

        return json({ balance, address: agent.walletAddress, funded: data.microAlgos / 1_000_000 });
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleUpdate(req: Request, db: Database, id: string, context: RequestContext): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateAgentSchema);
        const agent = updateAgent(db, id, data, context.tenantId);
        if (agent) {
            const actor = context.walletAddress ?? getClientIp(req);
            recordAudit(db, 'agent_update', actor, 'agent', id, null, null, getClientIp(req));
        }
        return agent ? json(agent) : json({ error: 'Not found' }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleInvoke(
    req: Request,
    fromAgentId: string,
    db: Database,
    context: RequestContext,
    agentMessenger?: AgentMessenger | null,
): Promise<Response> {
    if (!agentMessenger) {
        return json({ error: 'Agent messaging not available' }, 503);
    }

    const fromAgent = getAgent(db, fromAgentId, context.tenantId);
    if (!fromAgent) return json({ error: 'Source agent not found' }, 404);

    try {
        const data = await parseBodyOrThrow(req, InvokeAgentSchema);

        const result = await agentMessenger.invoke({
            fromAgentId,
            toAgentId: data.toAgentId,
            content: data.content,
            paymentMicro: data.paymentMicro,
            projectId: data.projectId,
        });

        return json({
            messageId: result.message.id,
            txid: result.message.txid,
            sessionId: result.sessionId,
        }, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

function handleMessages(agentId: string, db: Database, context: RequestContext): Response {
    const agent = getAgent(db, agentId, context.tenantId);
    if (!agent) return json({ error: 'Not found' }, 404);
    return json(listAgentMessages(db, agentId));
}

// ─── Spending cap handlers ───────────────────────────────────────────────

function handleGetSpending(agentId: string, db: Database, context: RequestContext): Response {
    const agent = getAgent(db, agentId, context.tenantId);
    if (!agent) return json({ error: 'Not found' }, 404);

    const cap = getAgentSpendingCap(db, agentId);
    const today = getAgentDailySpending(db, agentId);
    const defaults = getDefaultAgentDailyCap();

    return json({
        agentId,
        cap: cap ?? { dailyLimitMicroalgos: defaults.microalgos, dailyLimitUsdc: 0, isDefault: true },
        today: {
            algoMicro: today.algoMicro,
            usdcMicro: today.usdcMicro,
        },
    });
}

async function handleSetSpendingCap(req: Request, agentId: string, db: Database, context: RequestContext): Promise<Response> {
    const agent = getAgent(db, agentId, context.tenantId);
    if (!agent) return json({ error: 'Not found' }, 404);

    try {
        const data = await parseBodyOrThrow(req, SetSpendingCapSchema);
        const cap = setAgentSpendingCap(db, agentId, data.dailyLimitMicroalgos, data.dailyLimitUsdc);
        return json(cap);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

function handleDeleteSpendingCap(agentId: string, db: Database, context: RequestContext): Response {
    const agent = getAgent(db, agentId, context.tenantId);
    if (!agent) return json({ error: 'Not found' }, 404);

    const deleted = removeAgentSpendingCap(db, agentId);
    return deleted
        ? json({ ok: true, message: 'Spending cap removed, agent will use global default' })
        : json({ error: 'No spending cap found for agent' }, 404);
}
