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

export function handleAgentRoutes(
    req: Request,
    url: URL,
    db: Database,
    agentWalletService?: AgentWalletService | null,
    agentMessenger?: AgentMessenger | null,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/agents' && method === 'GET') {
        return json(listAgents(db));
    }

    if (path === '/api/agents' && method === 'POST') {
        return handleCreate(req, db, agentWalletService);
    }

    // Agent balance endpoint
    const balanceMatch = path.match(/^\/api\/agents\/([^/]+)\/balance$/);
    if (balanceMatch && method === 'GET') {
        return handleBalance(balanceMatch[1], db, agentWalletService);
    }

    // Agent fund endpoint
    const fundMatch = path.match(/^\/api\/agents\/([^/]+)\/fund$/);
    if (fundMatch && method === 'POST') {
        return handleFund(req, fundMatch[1], db, agentWalletService);
    }

    // Agent invoke endpoint
    const invokeMatch = path.match(/^\/api\/agents\/([^/]+)\/invoke$/);
    if (invokeMatch && method === 'POST') {
        return handleInvoke(req, invokeMatch[1], db, agentMessenger);
    }

    // Agent messages endpoint
    const messagesMatch = path.match(/^\/api\/agents\/([^/]+)\/messages$/);
    if (messagesMatch && method === 'GET') {
        return handleMessages(messagesMatch[1], db);
    }

    // Agent spending endpoints
    const spendingMatch = path.match(/^\/api\/agents\/([^/]+)\/spending$/);
    if (spendingMatch && method === 'GET') {
        return handleGetSpending(spendingMatch[1], db);
    }

    const spendingCapMatch = path.match(/^\/api\/agents\/([^/]+)\/spending-cap$/);
    if (spendingCapMatch && method === 'PUT') {
        return handleSetSpendingCap(req, spendingCapMatch[1], db);
    }
    if (spendingCapMatch && method === 'DELETE') {
        return handleDeleteSpendingCap(spendingCapMatch[1], db);
    }

    // A2A Agent Card for a specific agent
    const agentCardMatch = path.match(/^\/api\/agents\/([^/]+)\/agent-card$/);
    if (agentCardMatch && method === 'GET') {
        const agent = getAgent(db, agentCardMatch[1]);
        if (!agent) return json({ error: 'Not found' }, 404);
        const baseUrl = `${new URL(req.url).protocol}//${new URL(req.url).host}`;
        const card = buildAgentCardForAgent(agent, baseUrl);
        return json(card);
    }

    const match = path.match(/^\/api\/agents\/([^/]+)$/);
    if (!match) return null;

    const id = match[1];

    if (method === 'GET') {
        const agent = getAgent(db, id);
        return agent ? json(agent) : json({ error: 'Not found' }, 404);
    }

    if (method === 'PUT') {
        return handleUpdate(req, db, id);
    }

    if (method === 'DELETE') {
        const deleted = deleteAgent(db, id);
        return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }

    return null;
}

async function handleCreate(
    req: Request,
    db: Database,
    agentWalletService?: AgentWalletService | null,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateAgentSchema);
        const agent = createAgent(db, data);

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
    agentWalletService?: AgentWalletService | null,
): Promise<Response> {
    const agent = getAgent(db, agentId);
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
    agentWalletService?: AgentWalletService | null,
): Promise<Response> {
    if (!agentWalletService) {
        return json({ error: 'Wallet service not available' }, 503);
    }

    const agent = getAgent(db, agentId);
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

async function handleUpdate(req: Request, db: Database, id: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateAgentSchema);
        const agent = updateAgent(db, id, data);
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
    agentMessenger?: AgentMessenger | null,
): Promise<Response> {
    if (!agentMessenger) {
        return json({ error: 'Agent messaging not available' }, 503);
    }

    const fromAgent = getAgent(db, fromAgentId);
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

function handleMessages(agentId: string, db: Database): Response {
    const agent = getAgent(db, agentId);
    if (!agent) return json({ error: 'Not found' }, 404);
    return json(listAgentMessages(db, agentId));
}

// ─── Spending cap handlers ───────────────────────────────────────────────

function handleGetSpending(agentId: string, db: Database): Response {
    const agent = getAgent(db, agentId);
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

async function handleSetSpendingCap(req: Request, agentId: string, db: Database): Promise<Response> {
    const agent = getAgent(db, agentId);
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

function handleDeleteSpendingCap(agentId: string, db: Database): Response {
    const agent = getAgent(db, agentId);
    if (!agent) return json({ error: 'Not found' }, 404);

    const deleted = removeAgentSpendingCap(db, agentId);
    return deleted
        ? json({ ok: true, message: 'Spending cap removed, agent will use global default' })
        : json({ error: 'No spending cap found for agent' }, 404);
}
