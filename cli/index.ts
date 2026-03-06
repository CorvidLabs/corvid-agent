#!/usr/bin/env bun

import { statusCommand } from './commands/status';
import { chatCommand } from './commands/chat';
import { sessionCommand } from './commands/session';
import { agentCommand } from './commands/agent';
import { configCommand } from './commands/config';
import { interactiveCommand } from './commands/interactive';
import { initCommand } from './commands/init';
import { demoCommand } from './commands/demo';
import { c, printError } from './render';

// ─── Argument Parsing ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx + 1 >= args.length) return undefined;
    return args[idx + 1];
}

function getPositional(index: number): string | undefined {
    // Skip flags and their values, return positional args after command
    const positionals: string[] = [];
    let i = 1; // skip command
    while (i < args.length) {
        if (args[i].startsWith('--')) {
            i += 2; // skip flag + value
        } else {
            positionals.push(args[i]);
            i++;
        }
    }
    return positionals[index];
}

// ─── Version ────────────────────────────────────────────────────────────────

const VERSION = '0.9.0';

// ─── Help ───────────────────────────────────────────────────────────────────

function printHelp(): void {
    console.log(`
${c.bold}corvid-agent${c.reset} v${VERSION} — AI agent orchestration platform

${c.bold}Getting Started:${c.reset}
  ${c.cyan('corvid-agent init')}                Set up .env, install deps, create first agent
  ${c.cyan('corvid-agent demo')}                Run a self-contained demo session
  ${c.cyan('bun run try')}                      Open the dashboard in zero-config sandbox mode

${c.bold}Commands:${c.reset}
  ${c.cyan('(no args)')}                         Interactive chat REPL
  ${c.cyan('init')}                             Interactive project setup
  ${c.cyan('demo')}                             Run a self-contained demo
  ${c.cyan('status')}                           Check server health
  ${c.cyan('chat')} <prompt>                     Send a message to an agent
  ${c.cyan('session')} list|get|stop|resume      Manage sessions
  ${c.cyan('agent')} list|get|create             Manage agents
  ${c.cyan('config')} show|get|set               Manage CLI configuration

${c.bold}Global Options:${c.reset}
  --agent <id>       Agent ID (or set default via config)
  --project <id>     Project ID (or set default via config)
  --model <model>    Model override
  --help, -h         Show this help
  --version, -v      Show version

${c.bold}Examples:${c.reset}
  ${c.gray('# First time? Start here:')}
  corvid-agent init                               ${c.gray('# guided setup')}
  corvid-agent demo                               ${c.gray('# see it in action')}

  ${c.gray('# Daily usage:')}
  corvid-agent                                    ${c.gray('# interactive REPL')}
  corvid-agent chat "What files are in this project?"
  corvid-agent chat "Fix the bug in auth.ts" --agent def456

  ${c.gray('# Managing resources:')}
  corvid-agent agent list
  corvid-agent agent create --name "Reviewer" --model claude-sonnet-4-20250514
  corvid-agent session list
  corvid-agent status

  ${c.gray('# Configuration:')}
  corvid-agent config set serverUrl http://localhost:3578
  corvid-agent config set authToken my-api-key
  corvid-agent config set defaultAgent abc123

${c.bold}Documentation:${c.reset}
  Quickstart:  docs/quickstart.md
  Self-host:   docs/self-hosting.md
  Dashboard:   http://127.0.0.1:3000
`);
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    if (command === '--help' || command === '-h') {
        printHelp();
        return;
    }

    // No command → interactive REPL
    if (!command || (command.startsWith('--') && command !== '--version' && command !== '-v')) {
        await interactiveCommand({ agent: getFlag('agent') });
        return;
    }

    if (command === '--version' || command === '-v') {
        console.log(VERSION);
        return;
    }

    switch (command) {
        case 'init':
            await initCommand();
            break;

        case 'demo':
            await demoCommand();
            break;

        case 'status':
            await statusCommand();
            break;

        case 'chat': {
            const prompt = getPositional(0);
            if (!prompt) {
                printError('Prompt required: corvid-agent chat "your prompt here"');
                process.exit(1);
            }
            await chatCommand(prompt, {
                agent: getFlag('agent'),
                project: getFlag('project'),
                model: getFlag('model'),
            });
            break;
        }

        case 'session': {
            const action = getPositional(0) as 'list' | 'get' | 'stop' | 'resume' | undefined;
            if (!action) {
                printError('Action required: corvid-agent session list|get|stop|resume');
                process.exit(1);
            }
            const sessionId = getPositional(1);
            await sessionCommand(action, sessionId);
            break;
        }

        case 'agent': {
            const action = getPositional(0) as 'list' | 'get' | 'create' | undefined;
            if (!action) {
                printError('Action required: corvid-agent agent list|get|create');
                process.exit(1);
            }
            if (action === 'create') {
                const name = getFlag('name');
                if (!name) {
                    printError('Name required: corvid-agent agent create --name <name>');
                    process.exit(1);
                }
                await agentCommand('create', {
                    name,
                    description: getFlag('description'),
                    model: getFlag('model'),
                    systemPrompt: getFlag('system-prompt'),
                });
            } else {
                const id = getPositional(1);
                await agentCommand(action, id);
            }
            break;
        }

        case 'config': {
            const action = (getPositional(0) ?? 'show') as 'show' | 'get' | 'set';
            configCommand(action, getPositional(1), getPositional(2));
            break;
        }

        default:
            printError(`Unknown command: ${command}`);
            printHelp();
            process.exit(1);
    }
}

main().catch((err) => {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
