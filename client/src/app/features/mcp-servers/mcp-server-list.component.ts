import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { McpServerService } from '../../core/services/mcp-server.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import type { McpServerConfig } from '../../core/models/mcp-server.model';

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

            @if (mcpService.loading()) {
                <p class="loading">Loading servers...</p>
            } @else if (mcpService.servers().length === 0) {
                <p class="empty">No MCP servers configured.</p>
            } @else {
                <div class="server-list">
                    @for (server of mcpService.servers(); track server.id) {
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

    protected readonly Object = Object;

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
}
