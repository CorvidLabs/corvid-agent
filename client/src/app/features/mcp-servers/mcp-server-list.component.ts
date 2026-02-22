import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { McpServerService } from '../../core/services/mcp-server.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import type { McpServerConfig, CreateMcpServerConfigInput } from '../../core/models/mcp-server.model';

interface OfficialMcpServer {
    name: string;
    description: string;
    command: string;
    args: string[];
    envVars: Record<string, string>;
    envHints: string[];
}

const OFFICIAL_SERVERS: OfficialMcpServer[] = [
    {
        name: 'GitHub',
        description: 'GitHub API — repos, issues, PRs, search',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        envVars: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
        envHints: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    },
    {
        name: 'Filesystem',
        description: 'Local filesystem — read, write, search files',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        envVars: {},
        envHints: [],
    },
    {
        name: 'Brave Search',
        description: 'Web search via Brave Search API',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        envVars: { BRAVE_API_KEY: '' },
        envHints: ['BRAVE_API_KEY'],
    },
    {
        name: 'Fetch',
        description: 'Fetch web pages and extract content',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-fetch'],
        envVars: {},
        envHints: [],
    },
    {
        name: 'Memory',
        description: 'Knowledge graph-based persistent memory',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        envVars: {},
        envHints: [],
    },
    {
        name: 'PostgreSQL',
        description: 'Query PostgreSQL databases',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        envVars: { POSTGRES_CONNECTION_STRING: '' },
        envHints: ['POSTGRES_CONNECTION_STRING'],
    },
];

@Component({
    selector: 'app-mcp-server-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>MCP Servers</h2>
                <button class="create-btn" (click)="showCreateForm.set(!showCreateForm())">
                    {{ showCreateForm() ? 'Cancel' : '+ New Server' }}
                </button>
            </div>

            @if (showCreateForm()) {
                <div class="create-form">
                    <h3>Add MCP Server</h3>
                    <div class="form-grid">
                        <div class="form-field">
                            <label>Name</label>
                            <input [(ngModel)]="formName" class="form-input" placeholder="e.g. GitHub MCP" />
                        </div>
                        <div class="form-field">
                            <label>Command</label>
                            <input [(ngModel)]="formCommand" class="form-input mono" placeholder="npx @github/mcp-server" />
                        </div>
                        <div class="form-field span-2">
                            <label>Arguments (one per line)</label>
                            <textarea
                                [(ngModel)]="formArgs"
                                class="form-textarea mono"
                                rows="3"
                                placeholder="--port\n3001"></textarea>
                        </div>
                        <div class="form-field span-2">
                            <label>Environment Variables (KEY=VALUE, one per line)</label>
                            <textarea
                                [(ngModel)]="formEnvVars"
                                class="form-textarea mono"
                                rows="3"
                                placeholder="GITHUB_TOKEN=xxx\nNODE_ENV=production"></textarea>
                        </div>
                        <div class="form-field">
                            <label>Working Directory</label>
                            <input [(ngModel)]="formCwd" class="form-input mono" placeholder="/path/to/project" />
                        </div>
                        <div class="form-field">
                            <label>Agent (optional, empty = global)</label>
                            <select [(ngModel)]="formAgentId" class="form-select">
                                <option value="">Global (all agents)</option>
                                @for (agent of agentService.agents(); track agent.id) {
                                    <option [value]="agent.id">{{ agent.name }}</option>
                                }
                            </select>
                        </div>
                        <div class="form-field">
                            <label>Enabled</label>
                            <label class="toggle">
                                <input type="checkbox" [(ngModel)]="formEnabled" />
                                <span>{{ formEnabled ? 'Yes' : 'No' }}</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button
                            class="btn btn--primary"
                            [disabled]="creating() || !formName || !formCommand"
                            (click)="onCreate()">
                            {{ creating() ? 'Creating...' : 'Create Server' }}
                        </button>
                    </div>
                </div>
            }

            <!-- Official Defaults -->
            @if (!showCreateForm()) {
                <div class="section">
                    <div class="section__header" (click)="showOfficialDefaults.set(!showOfficialDefaults())">
                        <h3>Official MCP Servers</h3>
                        <span class="section__toggle">{{ showOfficialDefaults() ? 'Hide' : 'Show' }}</span>
                    </div>
                    @if (showOfficialDefaults()) {
                        <div class="official-grid">
                            @for (official of officialServers; track official.name) {
                                <div class="official-card" [class.official-card--installed]="isInstalled(official.name)">
                                    <div class="official-card__top">
                                        <span class="official-card__name">{{ official.name }}</span>
                                        @if (isInstalled(official.name)) {
                                            <span class="installed-badge">Installed</span>
                                        }
                                    </div>
                                    <p class="official-card__desc">{{ official.description }}</p>
                                    <code class="official-card__cmd">{{ official.command }} {{ official.args.join(' ') }}</code>
                                    @if (!isInstalled(official.name)) {
                                        @if (official.envHints.length > 0) {
                                            <div class="official-card__env">
                                                @for (hint of official.envHints; track hint) {
                                                    <input
                                                        class="env-input"
                                                        [placeholder]="hint"
                                                        (input)="setOfficialEnv(official.name, hint, $any($event.target).value)" />
                                                }
                                            </div>
                                        }
                                        <button
                                            class="btn btn--primary btn--sm"
                                            [disabled]="installingOfficial() === official.name"
                                            (click)="onInstallOfficial(official)">
                                            {{ installingOfficial() === official.name ? 'Installing...' : 'Install' }}
                                        </button>
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            }

            <!-- Configured Servers -->
            @if (mcpService.loading()) {
                <p class="loading">Loading servers...</p>
            } @else if (mcpService.servers().length === 0) {
                <p class="empty">No custom MCP servers configured.</p>
            } @else {
                @if (globalServers().length > 0) {
                    <div class="section">
                        <h3 class="section__title">Global Servers</h3>
                        <div class="server-list">
                            @for (server of globalServers(); track server.id) {
                        <div
                            class="server-card"
                            [class.server-card--expanded]="expandedId() === server.id">
                            <div class="server-card__header" (click)="toggleExpand(server.id)">
                                <div class="server-card__title">
                                    <span class="server-card__name">{{ server.name }}</span>
                                    <span
                                        class="server-card__status"
                                        [attr.data-enabled]="server.enabled">
                                        {{ server.enabled ? 'Enabled' : 'Disabled' }}
                                    </span>
                                </div>
                                <span class="server-card__command">{{ server.command }}</span>
                            </div>

                            @if (expandedId() === server.id) {
                                <div class="server-card__details">
                                    @if (editingId() === server.id) {
                                        <div class="form-grid">
                                            <div class="form-field">
                                                <label>Name</label>
                                                <input [(ngModel)]="editName" class="form-input" />
                                            </div>
                                            <div class="form-field">
                                                <label>Command</label>
                                                <input [(ngModel)]="editCommand" class="form-input mono" />
                                            </div>
                                            <div class="form-field span-2">
                                                <label>Arguments (one per line)</label>
                                                <textarea [(ngModel)]="editArgs" class="form-textarea mono" rows="3"></textarea>
                                            </div>
                                            <div class="form-field span-2">
                                                <label>Env Vars (KEY=VALUE per line)</label>
                                                <textarea [(ngModel)]="editEnvVars" class="form-textarea mono" rows="3"></textarea>
                                            </div>
                                            <div class="form-field">
                                                <label>Working Directory</label>
                                                <input [(ngModel)]="editCwd" class="form-input mono" />
                                            </div>
                                            <div class="form-field">
                                                <label>Enabled</label>
                                                <label class="toggle">
                                                    <input type="checkbox" [(ngModel)]="editEnabled" />
                                                    <span>{{ editEnabled ? 'Yes' : 'No' }}</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div class="form-actions">
                                            <button class="btn btn--primary" (click)="onSaveEdit(server.id)">Save</button>
                                            <button class="btn btn--secondary" (click)="editingId.set(null)">Cancel</button>
                                        </div>
                                    } @else {
                                        <dl class="server-detail-list">
                                            <dt>Command</dt>
                                            <dd><code>{{ server.command }} {{ server.args.join(' ') }}</code></dd>
                                            @if (server.cwd) {
                                                <dt>CWD</dt>
                                                <dd><code>{{ server.cwd }}</code></dd>
                                            }
                                            <dt>Agent</dt>
                                            <dd>{{ server.agentId ? getAgentName(server.agentId) : 'Global' }}</dd>
                                            @if (Object.keys(server.envVars).length > 0) {
                                                <dt>Env Vars</dt>
                                                <dd>{{ Object.keys(server.envVars).length }} configured</dd>
                                            }
                                        </dl>

                                        @if (testResult()) {
                                            <div class="test-result" [attr.data-success]="testResult()!.success">
                                                {{ testResult()!.message }}
                                            </div>
                                        }

                                        <div class="form-actions">
                                            <button class="btn btn--secondary" (click)="startEdit(server)">Edit</button>
                                            <button
                                                class="btn btn--secondary"
                                                [disabled]="testing()"
                                                (click)="onTest(server.id)">
                                                {{ testing() ? 'Testing...' : 'Test Connection' }}
                                            </button>
                                            <button class="btn btn--danger" (click)="onDelete(server.id)">Delete</button>
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    }
                        </div>
                    </div>
                }
                @if (agentServers().length > 0) {
                    <div class="section">
                        <h3 class="section__title">Agent-Specific Servers</h3>
                        <div class="server-list">
                            @for (server of agentServers(); track server.id) {
                                <div
                                    class="server-card"
                                    [class.server-card--expanded]="expandedId() === server.id">
                                    <div class="server-card__header" (click)="toggleExpand(server.id)">
                                        <div class="server-card__title">
                                            <span class="server-card__name">{{ server.name }}</span>
                                            <span class="server-card__agent-tag">{{ getAgentName(server.agentId!) }}</span>
                                            <span
                                                class="server-card__status"
                                                [attr.data-enabled]="server.enabled">
                                                {{ server.enabled ? 'Enabled' : 'Disabled' }}
                                            </span>
                                        </div>
                                        <span class="server-card__command">{{ server.command }}</span>
                                    </div>

                                    @if (expandedId() === server.id) {
                                        <div class="server-card__details">
                                            @if (editingId() === server.id) {
                                                <div class="form-grid">
                                                    <div class="form-field">
                                                        <label>Name</label>
                                                        <input [(ngModel)]="editName" class="form-input" />
                                                    </div>
                                                    <div class="form-field">
                                                        <label>Command</label>
                                                        <input [(ngModel)]="editCommand" class="form-input mono" />
                                                    </div>
                                                    <div class="form-field span-2">
                                                        <label>Arguments (one per line)</label>
                                                        <textarea [(ngModel)]="editArgs" class="form-textarea mono" rows="3"></textarea>
                                                    </div>
                                                    <div class="form-field span-2">
                                                        <label>Env Vars (KEY=VALUE per line)</label>
                                                        <textarea [(ngModel)]="editEnvVars" class="form-textarea mono" rows="3"></textarea>
                                                    </div>
                                                    <div class="form-field">
                                                        <label>Working Directory</label>
                                                        <input [(ngModel)]="editCwd" class="form-input mono" />
                                                    </div>
                                                    <div class="form-field">
                                                        <label>Enabled</label>
                                                        <label class="toggle">
                                                            <input type="checkbox" [(ngModel)]="editEnabled" />
                                                            <span>{{ editEnabled ? 'Yes' : 'No' }}</span>
                                                        </label>
                                                    </div>
                                                </div>
                                                <div class="form-actions">
                                                    <button class="btn btn--primary" (click)="onSaveEdit(server.id)">Save</button>
                                                    <button class="btn btn--secondary" (click)="editingId.set(null)">Cancel</button>
                                                </div>
                                            } @else {
                                                <dl class="server-detail-list">
                                                    <dt>Command</dt>
                                                    <dd><code>{{ server.command }} {{ server.args.join(' ') }}</code></dd>
                                                    @if (server.cwd) {
                                                        <dt>CWD</dt>
                                                        <dd><code>{{ server.cwd }}</code></dd>
                                                    }
                                                    <dt>Agent</dt>
                                                    <dd>{{ getAgentName(server.agentId!) }}</dd>
                                                    @if (Object.keys(server.envVars).length > 0) {
                                                        <dt>Env Vars</dt>
                                                        <dd>{{ Object.keys(server.envVars).length }} configured</dd>
                                                    }
                                                </dl>

                                                @if (testResult()) {
                                                    <div class="test-result" [attr.data-success]="testResult()!.success">
                                                        {{ testResult()!.message }}
                                                    </div>
                                                }

                                                <div class="form-actions">
                                                    <button class="btn btn--secondary" (click)="startEdit(server)">Edit</button>
                                                    <button
                                                        class="btn btn--secondary"
                                                        [disabled]="testing()"
                                                        (click)="onTest(server.id)">
                                                        {{ testing() ? 'Testing...' : 'Test Connection' }}
                                                    </button>
                                                    <button class="btn btn--danger" (click)="onDelete(server.id)">Delete</button>
                                                </div>
                                            }
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    </div>
                }
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .create-btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid var(--accent-cyan); background: var(--accent-cyan-dim);
            color: var(--accent-cyan); font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .loading, .empty { color: var(--text-secondary); font-size: 0.85rem; }
        .section { margin-bottom: 1.5rem; }
        .section__header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; margin-bottom: 0.75rem; }
        .section__header h3 { margin: 0; color: var(--text-primary); }
        .section__toggle { font-size: 0.7rem; color: var(--accent-cyan); text-transform: uppercase; }
        .section__title { margin: 0 0 0.75rem; color: var(--text-primary); font-size: 0.9rem; }

        .official-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; }
        .official-card {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
            padding: 0.75rem; transition: border-color 0.15s;
        }
        .official-card:hover { border-color: var(--border-bright); }
        .official-card--installed { opacity: 0.6; }
        .official-card__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem; }
        .official-card__name { font-weight: 700; color: var(--text-primary); font-size: 0.85rem; }
        .installed-badge { font-size: 0.6rem; padding: 1px 6px; border-radius: var(--radius-sm); color: var(--accent-green); border: 1px solid var(--accent-green); font-weight: 600; text-transform: uppercase; }
        .official-card__desc { margin: 0 0 0.35rem; font-size: 0.7rem; color: var(--text-secondary); }
        .official-card__cmd { display: block; font-size: 0.65rem; color: var(--text-tertiary); margin-bottom: 0.5rem; word-break: break-all; }
        .official-card__env { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem; }
        .env-input { padding: 0.35rem 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius); font-size: 0.75rem; font-family: monospace; background: var(--bg-input); color: var(--text-primary); box-sizing: border-box; }
        .env-input:focus { border-color: var(--accent-cyan); outline: none; }
        .btn--sm { padding: 0.3rem 0.6rem; font-size: 0.7rem; }

        .server-card__agent-tag { font-size: 0.6rem; padding: 1px 6px; border-radius: var(--radius-sm); color: var(--accent-cyan); border: 1px solid var(--accent-cyan); font-weight: 600; }
        .create-form {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1.5rem; margin-bottom: 1.5rem;
        }
        .create-form h3 { margin: 0 0 1rem; color: var(--text-primary); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .form-field label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
        .form-input, .form-select, .form-textarea {
            width: 100%; padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
            box-sizing: border-box;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .form-textarea { resize: vertical; min-height: 3em; line-height: 1.5; }
        .mono { font-family: monospace; }
        .span-2 { grid-column: span 2; }
        .form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .toggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.85rem; color: var(--text-primary); }
        .toggle input { accent-color: var(--accent-cyan); }
        .server-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .server-card {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem 1rem; transition: border-color 0.15s;
        }
        .server-card--expanded { border-color: var(--accent-cyan); }
        .server-card__header { cursor: pointer; }
        .server-card__title { display: flex; align-items: center; gap: 0.5rem; }
        .server-card__name { font-weight: 600; color: var(--text-primary); }
        .server-card__status {
            font-size: 0.65rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; background: var(--bg-raised); border: 1px solid var(--border);
        }
        .server-card__status[data-enabled="true"] { color: var(--accent-green); border-color: var(--accent-green); }
        .server-card__status[data-enabled="false"] { color: var(--text-secondary); }
        .server-card__command { font-size: 0.75rem; color: var(--text-secondary); font-family: monospace; }
        .server-card__details { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
        .server-detail-list { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; margin-bottom: 1rem; }
        .server-detail-list dt { font-weight: 600; color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; }
        .server-detail-list dd { margin: 0; color: var(--text-primary); font-size: 0.85rem; }
        .server-detail-list code { color: var(--accent-cyan); font-size: 0.8rem; }
        .test-result {
            padding: 0.5rem 0.75rem; border-radius: var(--radius); font-size: 0.8rem; margin-bottom: 1rem;
            border: 1px solid var(--border);
        }
        .test-result[data-success="true"] { color: var(--accent-green); border-color: var(--accent-green); background: rgba(0, 255, 0, 0.05); }
        .test-result[data-success="false"] { color: var(--accent-red); border-color: var(--accent-red); background: var(--accent-red-dim); }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: rgba(0, 229, 255, 0.15); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); }
        @media (max-width: 768px) {
            .form-grid { grid-template-columns: 1fr; }
            .span-2 { grid-column: span 1; }
        }
    `,
})
export class McpServerListComponent implements OnInit {
    protected readonly mcpService = inject(McpServerService);
    protected readonly agentService = inject(AgentService);
    private readonly notify = inject(NotificationService);

    protected readonly showCreateForm = signal(false);
    protected readonly creating = signal(false);
    protected readonly expandedId = signal<string | null>(null);
    protected readonly editingId = signal<string | null>(null);
    protected readonly testResult = signal<{ success: boolean; message: string } | null>(null);
    protected readonly testing = signal(false);
    protected readonly showOfficialDefaults = signal(true);
    protected readonly installingOfficial = signal<string | null>(null);

    protected readonly officialServers = OFFICIAL_SERVERS;
    protected readonly Object = Object;

    protected readonly globalServers = computed(() =>
        this.mcpService.servers().filter((s) => !s.agentId),
    );
    protected readonly agentServers = computed(() =>
        this.mcpService.servers().filter((s) => !!s.agentId),
    );

    private officialEnvValues: Record<string, Record<string, string>> = {};

    protected formName = '';
    protected formCommand = '';
    protected formArgs = '';
    protected formEnvVars = '';
    protected formCwd = '';
    protected formAgentId = '';
    protected formEnabled = true;

    protected editName = '';
    protected editCommand = '';
    protected editArgs = '';
    protected editEnvVars = '';
    protected editCwd = '';
    protected editEnabled = true;

    private agentNameCache: Record<string, string> = {};

    async ngOnInit(): Promise<void> {
        await this.agentService.loadAgents();
        for (const a of this.agentService.agents()) {
            this.agentNameCache[a.id] = a.name;
        }
        await this.mcpService.loadServers();
    }

    protected getAgentName(agentId: string): string {
        return this.agentNameCache[agentId] ?? agentId.slice(0, 8);
    }

    toggleExpand(id: string): void {
        this.expandedId.set(this.expandedId() === id ? null : id);
        this.editingId.set(null);
        this.testResult.set(null);
    }

    private parseEnvVars(input: string): Record<string, string> {
        const vars: Record<string, string> = {};
        for (const line of input.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
            }
        }
        return vars;
    }

    private envVarsToString(vars: Record<string, string>): string {
        return Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n');
    }

    startEdit(server: McpServerConfig): void {
        this.editingId.set(server.id);
        this.editName = server.name;
        this.editCommand = server.command;
        this.editArgs = server.args.join('\n');
        this.editEnvVars = this.envVarsToString(server.envVars);
        this.editCwd = server.cwd ?? '';
        this.editEnabled = server.enabled;
    }

    async onCreate(): Promise<void> {
        if (!this.formName || !this.formCommand) return;
        this.creating.set(true);
        try {
            await this.mcpService.createServer({
                name: this.formName,
                command: this.formCommand,
                args: this.formArgs.split('\n').map((a) => a.trim()).filter(Boolean),
                envVars: this.parseEnvVars(this.formEnvVars),
                cwd: this.formCwd || null,
                agentId: this.formAgentId || null,
                enabled: this.formEnabled,
            });
            this.formName = '';
            this.formCommand = '';
            this.formArgs = '';
            this.formEnvVars = '';
            this.formCwd = '';
            this.formAgentId = '';
            this.formEnabled = true;
            this.showCreateForm.set(false);
            this.notify.success('MCP server created');
        } catch {
            this.notify.error('Failed to create server');
        } finally {
            this.creating.set(false);
        }
    }

    async onSaveEdit(id: string): Promise<void> {
        try {
            await this.mcpService.updateServer(id, {
                name: this.editName,
                command: this.editCommand,
                args: this.editArgs.split('\n').map((a) => a.trim()).filter(Boolean),
                envVars: this.parseEnvVars(this.editEnvVars),
                cwd: this.editCwd || null,
                enabled: this.editEnabled,
            });
            this.editingId.set(null);
            this.notify.success('Server updated');
        } catch {
            this.notify.error('Failed to update server');
        }
    }

    async onTest(id: string): Promise<void> {
        this.testing.set(true);
        this.testResult.set(null);
        try {
            const result = await this.mcpService.testConnection(id);
            this.testResult.set(result);
        } catch {
            this.testResult.set({ success: false, message: 'Connection test failed' });
        } finally {
            this.testing.set(false);
        }
    }

    async onDelete(id: string): Promise<void> {
        try {
            await this.mcpService.deleteServer(id);
            this.expandedId.set(null);
            this.notify.success('Server deleted');
        } catch {
            this.notify.error('Failed to delete server');
        }
    }

    protected isInstalled(officialName: string): boolean {
        return this.mcpService.servers().some(
            (s) => s.name.toLowerCase() === officialName.toLowerCase(),
        );
    }

    protected setOfficialEnv(serverName: string, key: string, value: string): void {
        if (!this.officialEnvValues[serverName]) {
            this.officialEnvValues[serverName] = {};
        }
        this.officialEnvValues[serverName][key] = value;
    }

    protected async onInstallOfficial(official: OfficialMcpServer): Promise<void> {
        this.installingOfficial.set(official.name);
        try {
            const envVars: Record<string, string> = { ...official.envVars };
            const overrides = this.officialEnvValues[official.name];
            if (overrides) {
                for (const [k, v] of Object.entries(overrides)) {
                    if (v) envVars[k] = v;
                }
            }
            await this.mcpService.createServer({
                name: official.name,
                command: official.command,
                args: official.args,
                envVars,
                enabled: true,
            });
            this.notify.success(`${official.name} MCP server installed`);
        } catch {
            this.notify.error(`Failed to install ${official.name}`);
        } finally {
            this.installingOfficial.set(null);
        }
    }
}
