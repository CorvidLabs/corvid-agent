import { CorvidClient } from '../client';
import type { CliConfig } from '../config';
import { updateConfig } from '../config';
import type { Agent } from '../../shared/types';
import { c, printError, Spinner } from '../render';
import { createInterface } from 'readline';

/**
 * Interactive agent picker — fetches available agents, shows a numbered menu,
 * reads the user's selection from stdin, saves the choice to config, and
 * returns the selected agent ID.
 */
export async function pickAgent(client: CorvidClient, config: CliConfig): Promise<string> {
    // If a default is already set, return it
    if (config.defaultAgent) {
        return config.defaultAgent;
    }

    const spinner = new Spinner('Fetching agents...');
    spinner.start();

    let agents: Agent[];
    try {
        agents = await client.get<Agent[]>('/api/agents');
    } catch (err) {
        spinner.stop();
        const message = err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : String(err);
        printError(`Failed to fetch agents: ${message}`);
        process.exit(1);
    }

    spinner.stop();

    if (agents.length === 0) {
        printError('No agents found. Create one first: corvid-agent agent create --name <name>');
        process.exit(1);
    }

    // If there's only one agent, auto-select it
    if (agents.length === 1) {
        const agent = agents[0];
        console.log(`${c.green('✓')} Auto-selected agent: ${c.bold}${agent.name}${c.reset} ${c.gray(`(${agent.model})`)}`);
        updateConfig({ defaultAgent: agent.id });
        return agent.id;
    }

    // Show numbered menu
    console.log(`\n${c.bold}Select an agent:${c.reset}\n`);
    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        const provider = a.provider ? `, ${a.provider}` : '';
        const desc = a.description ? `  ${c.gray(truncate(a.description, 50))}` : '';
        console.log(`  ${c.cyan(`[${i + 1}]`)} ${c.bold}${a.name}${c.reset}  ${c.gray(`(${a.model}${provider})`)}  ${a.permissionMode}${desc}`);
    }
    console.log();

    // Read selection from stdin
    const choice = await readLine(`Pick ${c.cyan('[1-' + agents.length + ']')}: `);
    const index = parseInt(choice, 10) - 1;

    if (isNaN(index) || index < 0 || index >= agents.length) {
        printError('Invalid selection');
        process.exit(1);
    }

    const selected = agents[index];
    updateConfig({ defaultAgent: selected.id });
    console.log(`${c.green('✓')} Saved default agent: ${selected.name}`);
    return selected.id;
}

/**
 * Fetch and return the Agent object for a given ID, or null on failure.
 */
export async function fetchAgent(client: CorvidClient, agentId: string): Promise<Agent | null> {
    try {
        return await client.get<Agent>(`/api/agents/${agentId}`);
    } catch {
        return null;
    }
}

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function readLine(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
