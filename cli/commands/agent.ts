import { CorvidClient } from '../client';
import { loadConfig } from '../config';
import type { Agent } from '../../shared/types';
import { c, printError, printTable, Spinner } from '../render';

type AgentAction = 'list' | 'get' | 'create';

interface CreateOptions {
    name: string;
    description?: string;
    model?: string;
    systemPrompt?: string;
}

export async function agentCommand(action: AgentAction, idOrOptions?: string | CreateOptions): Promise<void> {
    const config = loadConfig();
    const client = new CorvidClient(config);

    switch (action) {
        case 'list':
            return listAgents(client);
        case 'get':
            if (typeof idOrOptions !== 'string' || !idOrOptions) {
                printError('Agent ID required: corvid-agent agent get <id>');
                process.exit(1);
            }
            return getAgent(client, idOrOptions);
        case 'create':
            if (typeof idOrOptions !== 'object' || !idOrOptions) {
                printError('Name required: corvid-agent agent create --name <name>');
                process.exit(1);
            }
            return createAgent(client, idOrOptions);
        default:
            printError(`Unknown action: ${action}. Use: list, get, create`);
            process.exit(1);
    }
}

async function listAgents(client: CorvidClient): Promise<void> {
    const config = loadConfig();
    const spinner = new Spinner('Fetching agents...');
    spinner.start();
    try {
        const agents = await client.get<Agent[]>('/api/agents');
        spinner.stop();

        if (agents.length === 0) {
            console.log(c.gray('No agents found'));
            return;
        }

        printTable(
            ['ID', 'Name', 'Model', 'Provider', 'Mode', 'AlgoChat', ''],
            agents.map(a => {
                const isDefault = config.defaultAgent === a.id;
                const desc = a.description ? truncate(a.description, 40) : '';
                return [
                    a.id.slice(0, 8),
                    isDefault ? c.green(a.name) : a.name,
                    a.model,
                    a.provider ?? c.gray('-'),
                    a.permissionMode,
                    a.algochatEnabled ? c.green('on') : c.gray('off'),
                    isDefault ? c.green('★ default') : desc ? c.gray(desc) : '',
                ];
            }),
        );
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

async function getAgent(client: CorvidClient, id: string): Promise<void> {
    const spinner = new Spinner('Fetching agent...');
    spinner.start();
    try {
        const agent = await client.get<Agent>(`/api/agents/${id}`);
        spinner.stop();

        console.log(`${c.bold}Agent${c.reset} ${agent.id}`);
        console.log(`  Name:        ${agent.name}`);
        console.log(`  Model:       ${agent.model}`);
        console.log(`  Mode:        ${agent.permissionMode}`);
        console.log(`  Description: ${agent.description || c.gray('(none)')}`);
        console.log(`  AlgoChat:    ${agent.algochatEnabled ? c.green('enabled') : c.gray('disabled')}`);
        if (agent.walletAddress) {
            console.log(`  Wallet:      ${agent.walletAddress.slice(0, 12)}...`);
        }
        console.log(`  Created:     ${new Date(agent.createdAt).toLocaleString()}`);
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

async function createAgent(client: CorvidClient, options: CreateOptions): Promise<void> {
    const spinner = new Spinner('Creating agent...');
    spinner.start();
    try {
        const agent = await client.post<Agent>('/api/agents', {
            name: options.name,
            description: options.description,
            model: options.model,
            systemPrompt: options.systemPrompt,
        });
        spinner.stop();
        console.log(`${c.green('✓')} Agent created: ${agent.id} (${agent.name})`);
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

function handleError(err: unknown): void {
    const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : String(err);
    printError(message);
    process.exit(1);
}
