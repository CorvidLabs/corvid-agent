/**
 * Shared command definitions used by both client autocomplete and server validation.
 *
 * Each command definition describes the syntax, purpose, and argument structure
 * so the dashboard can provide intelligent autocomplete and inline help.
 */

export interface CommandParam {
    name: string;
    description: string;
    required: boolean;
    /** If true, the rest of the input is consumed as this param (e.g., prompt text). */
    rest?: boolean;
    /** If true, show agent mention autocomplete (@AgentName). */
    agentMention?: boolean;
}

export interface CommandDef {
    name: string;
    description: string;
    usage: string;
    params: CommandParam[];
    /** Commands requiring owner authorization. */
    privileged: boolean;
    /** Short example(s) shown in the autocomplete dropdown. */
    examples: string[];
}

export const COMMAND_DEFS: CommandDef[] = [
    {
        name: '/status',
        description: 'Show active sessions and conversation count',
        usage: '/status',
        params: [],
        privileged: false,
        examples: ['/status'],
    },
    {
        name: '/credits',
        description: 'Show your credit balance and rates',
        usage: '/credits',
        params: [],
        privileged: false,
        examples: ['/credits'],
    },
    {
        name: '/history',
        description: 'Show recent credit transactions',
        usage: '/history [limit]',
        params: [
            { name: 'limit', description: 'Number of transactions (default 10, max 20)', required: false },
        ],
        privileged: false,
        examples: ['/history', '/history 20'],
    },
    {
        name: '/queue',
        description: 'Show pending escalation/approval requests',
        usage: '/queue',
        params: [],
        privileged: false,
        examples: ['/queue'],
    },
    {
        name: '/agent',
        description: 'List available agents or switch default agent',
        usage: '/agent [name]',
        params: [
            { name: 'name', description: 'Agent name to switch to', required: false, rest: true },
        ],
        privileged: true,
        examples: ['/agent', '/agent CorvidAgent'],
    },
    {
        name: '/stop',
        description: 'Stop a running session',
        usage: '/stop <session-id>',
        params: [
            { name: 'session-id', description: 'Session ID to stop', required: true },
        ],
        privileged: true,
        examples: ['/stop abc123'],
    },
    {
        name: '/approve',
        description: 'Approve a pending escalation request',
        usage: '/approve <queue-id>',
        params: [
            { name: 'queue-id', description: 'Escalation queue ID', required: true },
        ],
        privileged: true,
        examples: ['/approve 1'],
    },
    {
        name: '/deny',
        description: 'Deny a pending escalation request',
        usage: '/deny <queue-id>',
        params: [
            { name: 'queue-id', description: 'Escalation queue ID', required: true },
        ],
        privileged: true,
        examples: ['/deny 1'],
    },
    {
        name: '/mode',
        description: 'View or set operational mode (normal, queued, paused)',
        usage: '/mode [normal|queued|paused]',
        params: [
            { name: 'mode', description: 'New operational mode', required: false },
        ],
        privileged: true,
        examples: ['/mode', '/mode queued'],
    },
    {
        name: '/work',
        description: 'Create a work task (branch + PR)',
        usage: '/work <description>',
        params: [
            { name: 'description', description: 'Task description', required: true, rest: true },
        ],
        privileged: true,
        examples: ['/work fix the login bug', '/work add unit tests for auth module'],
    },
    {
        name: '/council',
        description: 'Launch a multi-agent council discussion',
        usage: '/council <prompt> | /council @Agent1 @Agent2 -- <prompt> | /council CouncilName -- <prompt>',
        params: [
            { name: 'agents-or-name', description: '@mentions or council name (optional)', required: false, agentMention: true },
            { name: 'prompt', description: 'The prompt/question for the council', required: true, rest: true },
        ],
        privileged: true,
        examples: [
            '/council review the auth system',
            '/council @CorvidAgent @ReviewBot -- review the auth system',
            '/council SecurityCouncil -- audit the API endpoints',
        ],
    },
    {
        name: '/extend',
        description: 'Extend a running session timeout',
        usage: '/extend [minutes] [session-id]',
        params: [
            { name: 'minutes', description: 'Minutes to extend (default 30, max 120)', required: false },
            { name: 'session-id', description: 'Session ID (default: current session)', required: false },
        ],
        privileged: true,
        examples: ['/extend', '/extend 60'],
    },
    {
        name: '/schedule',
        description: 'Manage automated schedules',
        usage: '/schedule [list|pause|resume|history|run] [schedule-id]',
        params: [
            { name: 'subcommand', description: 'list, pause, resume, history, or run', required: false },
            { name: 'schedule-id', description: 'Schedule ID (for pause/resume/history/run)', required: false },
        ],
        privileged: true,
        examples: ['/schedule', '/schedule pause abc123', '/schedule history abc123', '/schedule run abc123'],
    },
    {
        name: '/help',
        description: 'Show available commands and usage',
        usage: '/help [command]',
        params: [
            { name: 'command', description: 'Specific command to get help for', required: false },
        ],
        privileged: false,
        examples: ['/help', '/help council'],
    },
];

/** Get a command definition by name (with or without leading /). */
export function getCommandDef(name: string): CommandDef | undefined {
    const normalized = name.startsWith('/') ? name : `/${name}`;
    return COMMAND_DEFS.find((c) => c.name === normalized.toLowerCase());
}

/** Get all command names for autocomplete matching. */
export function getCommandNames(): string[] {
    return COMMAND_DEFS.map((c) => c.name);
}
