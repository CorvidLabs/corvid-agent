import type { Database } from 'bun:sqlite';
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent } from '../db/agents';
import { listAgentMessages } from '../db/agent-messages';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AgentMessenger } from '../algochat/agent-messenger';

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

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
    const body = await req.json();
    if (!body.name) {
        return json({ error: 'name is required' }, 400);
    }
    const agent = createAgent(db, body);

    // Auto-create wallet on localnet if AlgoChat is available
    if (agentWalletService) {
        agentWalletService.ensureWallet(agent.id).catch(() => {
            // Fire and forget — wallet creation failure is non-blocking
        });
    }

    return json(agent, 201);
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

    const body = await req.json();
    const microAlgos = Number(body.microAlgos);
    if (!microAlgos || microAlgos < 1000 || microAlgos > 100_000_000) {
        return json({ error: 'microAlgos must be between 1000 and 100000000' }, 400);
    }

    await agentWalletService.fundAgent(agentId, microAlgos);
    const balance = await agentWalletService.getBalance(agent.walletAddress);

    return json({ balance, address: agent.walletAddress, funded: microAlgos / 1_000_000 });
}

async function handleUpdate(req: Request, db: Database, id: string): Promise<Response> {
    const body = await req.json();
    const agent = updateAgent(db, id, body);
    return agent ? json(agent) : json({ error: 'Not found' }, 404);
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

    const body = await req.json();
    const { toAgentId, content, paymentMicro, projectId } = body;
    if (!toAgentId || !content) {
        return json({ error: 'toAgentId and content are required' }, 400);
    }

    try {
        const result = await agentMessenger.invoke({
            fromAgentId,
            toAgentId,
            content,
            paymentMicro,
            projectId,
        });

        return json({
            messageId: result.message.id,
            txid: result.message.txid,
            sessionId: result.sessionId,
        }, 201);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 400);
    }
}

function handleMessages(agentId: string, db: Database): Response {
    const agent = getAgent(db, agentId);
    if (!agent) return json({ error: 'Not found' }, 404);
    return json(listAgentMessages(db, agentId));
}
