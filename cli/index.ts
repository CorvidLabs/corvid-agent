#!/usr/bin/env bun

import { statusCommand } from './commands/status';
import { chatCommand } from './commands/chat';
import { sessionCommand } from './commands/session';
import { agentCommand } from './commands/agent';
import { configCommand } from './commands/config';
import { loginCommand, logoutCommand } from './commands/login';
import { interactiveCommand } from './commands/interactive';
import { initCommand } from './commands/init';
import { demoCommand } from './commands/demo';
import { provisionCommand, listRoles } from './commands/provision';
import { c, printError } from './render';

// ─── Argument Parsing ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

/** Check whether --help or -h appears anywhere in the argument list. */
function hasHelpFlag(): boolean {
    return args.includes('--help') || args.includes('-h');
}

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

// Read version from package.json so it stays in sync automatically
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
const pkgPath = join(dirname(new URL(import.meta.url).pathname), '..', 'package.json');
const VERSION = JSON.parse(readFileSync(pkgPath, 'utf-8')).version as string;

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
  ${c.cyan('init')}                             Quick setup (auto-detects your system)
  ${c.cyan('init --mcp')}                       MCP-only setup (for Claude Code / Cursor)
  ${c.cyan('init --advanced')}                  Full setup wizard with all options
  ${c.cyan('init --full')}                      Advanced + dashboard build
  ${c.cyan('demo')}                             Run a self-contained demo
  ${c.cyan('status')}                           Check server health
  ${c.cyan('chat')} <prompt>                     Send a message to an agent
  ${c.cyan('session')} list|get|stop|resume      Manage sessions
  ${c.cyan('agent')} list|get|create             Manage agents
  ${c.cyan('provision')}                         Generate identity bundle for a new instance
  ${c.cyan('login')}                             Log in to CorvidAgent Cloud
  ${c.cyan('logout')}                            Log out (remove saved token)
  ${c.cyan('config')} show|get|set               Manage CLI configuration

${c.bold}Global Options:${c.reset}
  --agent <id>       Agent ID (or set default via config)
  --project <id>     Project ID (or set default via config)
  --model <model>    Model override
  --tools <spec>     Opt-in to specific tools (none, github, code, etc.)
  --help, -h         Show this help
  --version, -v      Show version

${c.bold}Examples:${c.reset}
  ${c.gray('# First time? Start here:')}
  corvid-agent init                               ${c.gray('# guided setup')}
  corvid-agent init --mcp                         ${c.gray('# just add MCP tools to your editor')}
  corvid-agent init --full --yes                  ${c.gray('# full unattended setup')}
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

// ─── Per-Command Help ────────────────────────────────────────────────────────

function printInitHelp(): void {
    console.log(`
${c.bold}corvid-agent init${c.reset} — Set up your AI developer

${c.bold}Usage:${c.reset}
  corvid-agent init [options]

${c.bold}Options:${c.reset}
  --mcp          MCP-only setup (add tools to Claude Code, Cursor, etc.)
  --advanced     Full interactive wizard with all options
  --full         Advanced + build dashboard
  --yes, -y      Non-interactive with sensible defaults
  --help, -h     Show this help

  By default, init auto-detects your AI provider (Claude CLI, Ollama, or
  API key in env) and only asks questions when it can't figure things out.

${c.bold}Examples:${c.reset}
  corvid-agent init                  ${c.gray('# quick setup (auto-detects everything)')}
  corvid-agent init --mcp            ${c.gray('# just add MCP tools to your editor')}
  corvid-agent init --advanced       ${c.gray('# full wizard: ports, GitHub, network, etc.')}
  corvid-agent init --full --yes     ${c.gray('# full unattended setup')}
`);
}

function printDemoHelp(): void {
    console.log(`
${c.bold}corvid-agent demo${c.reset} — Run a self-contained demo session

${c.bold}Usage:${c.reset}
  corvid-agent demo

Starts a temporary server (or uses a running one), creates a demo agent,
and streams a sample conversation. Everything is cleaned up on exit.

${c.bold}Examples:${c.reset}
  corvid-agent demo                  ${c.gray('# see corvid-agent in action')}
`);
}

function printStatusHelp(): void {
    console.log(`
${c.bold}corvid-agent status${c.reset} — Check server health

${c.bold}Usage:${c.reset}
  corvid-agent status

Shows server status, uptime, active sessions, AlgoChat, scheduler,
and workflow state.

${c.bold}Examples:${c.reset}
  corvid-agent status                ${c.gray('# check if the server is running')}
`);
}

function printChatHelp(): void {
    console.log(`
${c.bold}corvid-agent chat${c.reset} — Send a one-shot message to an agent

${c.bold}Usage:${c.reset}
  corvid-agent chat <prompt> [options]

${c.bold}Options:${c.reset}
  --agent <id>       Agent ID (or picks interactively / uses default)
  --project <id>     Project ID (or auto-detects from cwd)
  --model <model>    Model override for this message
  --tools <spec>     Opt-in to specific tools (default: all)
  --help, -h         Show this help

${c.bold}Tool Specifiers (--tools):${c.reset}
  all                All tools (default)
  none               No tools (conversation only)
  github             GitHub tools (star, PR, issues, etc.)
  code               File I/O + code analysis (read, write, edit, run)
  memory             Memory tools (save, recall, delete)
  messaging          Messaging tools (send_message, list_agents)
  work               Work tasks, schedules, workflows
  web                Web search + deep research
  <tool_name>        Individual tool name
  Combine with commas: --tools github,code,web

${c.bold}Examples:${c.reset}
  corvid-agent chat "What files are in this project?"
  corvid-agent chat "Fix the bug in auth.ts" --agent abc123
  corvid-agent chat "Summarize recent changes" --model claude-sonnet-4-20250514
  corvid-agent chat "What is Algorand?" --tools none
  corvid-agent chat "Review my PRs" --tools github
`);
}

function printSessionHelp(): void {
    console.log(`
${c.bold}corvid-agent session${c.reset} — Manage sessions

${c.bold}Usage:${c.reset}
  corvid-agent session <action> [id]

${c.bold}Actions:${c.reset}
  list             List all sessions
  get <id>         Show session details
  stop <id>        Stop a running session
  resume <id>      Resume a stopped session

${c.bold}Options:${c.reset}
  --help, -h       Show this help

${c.bold}Examples:${c.reset}
  corvid-agent session list
  corvid-agent session get abc12345
  corvid-agent session stop abc12345
`);
}

function printAgentHelp(): void {
    console.log(`
${c.bold}corvid-agent agent${c.reset} — Manage agents

${c.bold}Usage:${c.reset}
  corvid-agent agent <action> [id] [options]

${c.bold}Actions:${c.reset}
  list                  List all agents
  get <id>              Show agent details
  create                Create a new agent

${c.bold}Create Options:${c.reset}
  --name <name>         Agent name (required)
  --description <text>  Agent description
  --model <model>       Model to use (e.g. claude-sonnet-4-20250514)
  --system-prompt <text> System prompt for the agent

${c.bold}Options:${c.reset}
  --help, -h            Show this help

${c.bold}Examples:${c.reset}
  corvid-agent agent list
  corvid-agent agent get abc12345
  corvid-agent agent create --name "Reviewer" --model claude-sonnet-4-20250514
  corvid-agent agent create --name "Writer" --description "Writes docs"
`);
}

function printLoginHelp(): void {
    console.log(`
${c.bold}corvid-agent login${c.reset} — Log in to CorvidAgent Cloud

${c.bold}Usage:${c.reset}
  corvid-agent login [options]

Opens a browser for device authorization and saves the token.

${c.bold}Options:${c.reset}
  --server <url>   Server URL (default: from config or http://127.0.0.1:3000)
  --help, -h       Show this help

${c.bold}Examples:${c.reset}
  corvid-agent login
  corvid-agent login --server https://your-server.example.com
`);
}

function printLogoutHelp(): void {
    console.log(`
${c.bold}corvid-agent logout${c.reset} — Log out and remove saved token

${c.bold}Usage:${c.reset}
  corvid-agent logout

Removes the saved authentication token from ~/.corvid/config.json.
`);
}

function printProvisionHelp(): void {
    console.log(`
${c.bold}corvid-agent provision${c.reset} — Generate identity bundle for a new agent instance

${c.bold}Usage:${c.reset}
  corvid-agent provision --name <name> [options]

${c.bold}Options:${c.reset}
  --name <name>        Agent name (required, alphanumeric/hyphens/underscores)
  --role <role>        Role template (developer, reviewer, assistant, security)
  --network <net>      Algorand network: localnet, testnet, mainnet (default: testnet)
  --out-dir <path>     Output directory (default: ./corvid-agent-<name>)
  --list-roles         Show available role templates
  --help, -h           Show this help

${c.bold}Description:${c.reset}
  Generates a standalone configuration bundle for deploying a new corvid-agent
  instance on another machine. Creates a wallet, encryption key, API key, and
  .env file ready for deployment.

${c.bold}Examples:${c.reset}
  corvid-agent provision --name my-reviewer --role reviewer
  corvid-agent provision --name prod-agent --network mainnet --out-dir ~/agents/prod
  corvid-agent provision --list-roles
`);
}

function printConfigHelp(): void {
    console.log(`
${c.bold}corvid-agent config${c.reset} — Manage CLI configuration

${c.bold}Usage:${c.reset}
  corvid-agent config [action] [key] [value]

${c.bold}Actions:${c.reset}
  show             Show all config values (default)
  get <key>        Get a specific config value
  set <key> <val>  Set a config value (use "null" to clear)

${c.bold}Valid Keys:${c.reset}
  serverUrl        Server URL (default: http://127.0.0.1:3000)
  authToken        Authentication token
  defaultAgent     Default agent ID
  defaultProject   Default project ID
  defaultModel     Default model override

${c.bold}Options:${c.reset}
  --help, -h       Show this help

${c.bold}Examples:${c.reset}
  corvid-agent config                            ${c.gray('# show all')}
  corvid-agent config show                       ${c.gray('# same as above')}
  corvid-agent config get serverUrl
  corvid-agent config set serverUrl http://localhost:3578
  corvid-agent config set defaultAgent abc123
  corvid-agent config set authToken null         ${c.gray('# clear the token')}
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
        await interactiveCommand({ agent: getFlag('agent'), tools: getFlag('tools') });
        return;
    }

    if (command === '--version' || command === '-v') {
        console.log(VERSION);
        return;
    }

    switch (command) {
        case 'init':
            if (hasHelpFlag() && !args.includes('--mcp') && !args.includes('--full')) {
                printInitHelp();
                return;
            }
            await initCommand({
                mcp: args.includes('--mcp'),
                full: args.includes('--full'),
                yes: args.includes('--yes') || args.includes('-y'),
                simple: args.includes('--advanced') ? false : undefined,
            });
            break;

        case 'demo':
            if (hasHelpFlag()) { printDemoHelp(); return; }
            await demoCommand();
            break;

        case 'status':
            if (hasHelpFlag()) { printStatusHelp(); return; }
            await statusCommand();
            break;

        case 'chat': {
            if (hasHelpFlag()) { printChatHelp(); return; }
            const prompt = getPositional(0);
            if (!prompt) {
                printError('Prompt required: corvid-agent chat "your prompt here"');
                process.exit(1);
            }
            await chatCommand(prompt, {
                agent: getFlag('agent'),
                project: getFlag('project'),
                model: getFlag('model'),
                tools: getFlag('tools'),
            });
            break;
        }

        case 'session': {
            if (hasHelpFlag()) { printSessionHelp(); return; }
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
            if (hasHelpFlag()) { printAgentHelp(); return; }
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

        case 'provision': {
            if (hasHelpFlag()) { printProvisionHelp(); return; }
            if (args.includes('--list-roles')) {
                listRoles();
                return;
            }
            const provisionName = getFlag('name');
            if (!provisionName) {
                printError('Name required: corvid-agent provision --name <name>');
                process.exit(1);
            }
            await provisionCommand({
                name: provisionName,
                role: getFlag('role'),
                network: getFlag('network'),
                outDir: getFlag('out-dir'),
            });
            break;
        }

        case 'login':
            if (hasHelpFlag()) { printLoginHelp(); return; }
            await loginCommand(getFlag('server'));
            break;

        case 'logout':
            if (hasHelpFlag()) { printLogoutHelp(); return; }
            await logoutCommand();
            break;

        case 'config': {
            if (hasHelpFlag()) { printConfigHelp(); return; }
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
