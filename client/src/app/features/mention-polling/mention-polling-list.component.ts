import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MentionPollingService } from '../../core/services/mention-polling.service';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { MentionPollingConfig, MentionPollingStatus } from '../../core/models/mention-polling.model';

@Component({
    selector: 'app-mention-polling-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, RelativeTimePipe],
    template: `
        <div class="polling">
            <div class="polling__header">
                <div>
                    <h2>GitHub Mention Polling</h2>
                    <p class="polling__subtitle">Monitor GitHub repos for &#64;mentions without webhooks</p>
                </div>
                <button class="create-btn" (click)="showCreateForm.set(!showCreateForm())">
                    {{ showCreateForm() ? 'Cancel' : '+ New Config' }}
                </button>
            </div>

            <!-- Stats Banner -->
            @if (pollingService.stats(); as stats) {
                <div class="stats-banner">
                    <div class="stat-item">
                        <span class="stat-value" [class.stat-running]="stats.isRunning">{{ stats.isRunning ? 'Running' : 'Stopped' }}</span>
                        <span class="stat-label">Service</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">{{ stats.activeConfigs }}</span>
                        <span class="stat-label">Active</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">{{ stats.totalConfigs }}</span>
                        <span class="stat-label">Total</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">{{ stats.totalTriggers }}</span>
                        <span class="stat-label">Triggers</span>
                    </div>
                </div>
            }

            <!-- Create Form -->
            @if (showCreateForm()) {
                <div class="create-form">
                    <h3>New Polling Configuration</h3>
                    <div class="form-grid">
                        <div class="form-field">
                            <label>Agent</label>
                            <select [(ngModel)]="formAgentId" class="form-select">
                                <option value="">Select agent...</option>
                                @for (agent of agentService.agents(); track agent.id) {
                                    <option [value]="agent.id">{{ agent.name }}</option>
                                }
                            </select>
                        </div>
                        <div class="form-field">
                            <label>Repository</label>
                            <input [(ngModel)]="formRepo" class="form-input mono" placeholder="owner/repo" />
                        </div>
                        <div class="form-field">
                            <label>Mention Username</label>
                            <input [(ngModel)]="formMentionUsername" class="form-input mono" placeholder="e.g. corvid-agent" />
                            <span class="form-hint">GitHub username to watch for &#64;mentions</span>
                        </div>
                        <div class="form-field">
                            <label>Project</label>
                            <select [(ngModel)]="formProjectId" class="form-select">
                                <option value="">Select project...</option>
                                @for (project of projectService.projects(); track project.id) {
                                    <option [value]="project.id">{{ project.name }}</option>
                                }
                            </select>
                        </div>
                        <div class="form-field">
                            <label>Poll Interval (seconds)</label>
                            <input type="number" [(ngModel)]="formInterval" class="form-input" min="30" max="3600" />
                            <span class="form-hint">30s – 3600s (default: 60s)</span>
                        </div>
                        <div class="form-field">
                            <label>Event Filter</label>
                            <div class="checkbox-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" [(ngModel)]="formFilterIssueComment" />
                                    Issue Comments
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" [(ngModel)]="formFilterIssues" />
                                    Issues
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" [(ngModel)]="formFilterPrComment" />
                                    PR Review Comments
                                </label>
                            </div>
                        </div>
                        <div class="form-field span-2">
                            <label>Allowed Users (optional)</label>
                            <input [(ngModel)]="formAllowedUsers" class="form-input" placeholder="user1, user2 (empty = all users)" />
                            <span class="form-hint">Comma-separated GitHub usernames. Leave empty for all users.</span>
                        </div>
                    </div>
                    <div class="form-buttons">
                        <button class="save-btn" [disabled]="creating()" (click)="create()">
                            {{ creating() ? 'Creating...' : 'Create Config' }}
                        </button>
                    </div>
                </div>
            }

            <!-- Filters -->
            <div class="polling__filters">
                <button
                    class="filter-btn"
                    [class.filter-btn--active]="activeFilter() === 'all'"
                    (click)="activeFilter.set('all')"
                >All ({{ pollingService.configs().length }})</button>
                <button
                    class="filter-btn"
                    [class.filter-btn--active]="activeFilter() === 'active'"
                    (click)="activeFilter.set('active')"
                >Active ({{ activeCount() }})</button>
                <button
                    class="filter-btn"
                    [class.filter-btn--active]="activeFilter() === 'paused'"
                    (click)="activeFilter.set('paused')"
                >Paused ({{ pausedCount() }})</button>
            </div>

            @if (pollingService.loading()) {
                <p class="loading">Loading polling configs...</p>
            } @else if (filteredConfigs().length === 0) {
                <div class="empty">
                    <p>No {{ activeFilter() === 'all' ? '' : activeFilter() + ' ' }}polling configurations found.</p>
                    <p class="empty-hint">Create a polling config to monitor a GitHub repo for &#64;mentions without needing webhooks.</p>
                </div>
            } @else {
                <div class="config-list">
                    @for (config of filteredConfigs(); track config.id) {
                        <div class="config-card" [attr.data-status]="config.status"
                            [class.config-card--expanded]="expandedId() === config.id"
                            (click)="toggleExpand(config.id)">
                            <div class="config-card__header">
                                <div class="config-card__title">
                                    <span class="config-status" [attr.data-status]="config.status">{{ config.status }}</span>
                                    <h3>{{ config.repo }}</h3>
                                    <span class="expand-indicator">{{ expandedId() === config.id ? '\u25B2' : '\u25BC' }}</span>
                                </div>
                                <div class="config-card__actions">
                                    @if (config.status === 'active') {
                                        <button class="action-btn" (click)="toggleStatus(config, 'paused'); $event.stopPropagation()">Pause</button>
                                    } @else {
                                        <button class="action-btn action-btn--resume" (click)="toggleStatus(config, 'active'); $event.stopPropagation()">Resume</button>
                                    }
                                    <button class="action-btn action-btn--danger" (click)="deleteConfig(config); $event.stopPropagation()">Delete</button>
                                </div>
                            </div>
                            <div class="config-meta">
                                <div class="meta-item">
                                    <span class="meta-label">Username</span>
                                    <span class="meta-value mono">&#64;{{ config.mentionUsername }}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Interval</span>
                                    <span class="meta-value">{{ config.intervalSeconds }}s</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Triggers</span>
                                    <span class="meta-value">{{ config.triggerCount }}</span>
                                </div>
                                @if (config.lastPollAt) {
                                    <div class="meta-item">
                                        <span class="meta-label">Last Poll</span>
                                        <span class="meta-value">{{ config.lastPollAt | relativeTime }}</span>
                                    </div>
                                }
                            </div>
                            <div class="config-tags">
                                @for (evt of config.eventFilter; track evt) {
                                    <span class="event-tag">{{ evt }}</span>
                                }
                                @if (config.eventFilter.length === 0) {
                                    <span class="event-tag event-tag--all">all events</span>
                                }
                            </div>

                            @if (expandedId() === config.id) {
                                <div class="config-detail" (click)="$event.stopPropagation()">
                                    <div class="detail-grid">
                                        <div class="detail-item">
                                            <span class="detail-label">Config ID</span>
                                            <span class="detail-value mono">{{ config.id }}</span>
                                        </div>
                                        <div class="detail-item">
                                            <span class="detail-label">Agent ID</span>
                                            <span class="detail-value mono">{{ config.agentId }}</span>
                                        </div>
                                        <div class="detail-item">
                                            <span class="detail-label">Project ID</span>
                                            <span class="detail-value mono">{{ config.projectId }}</span>
                                        </div>
                                        <div class="detail-item">
                                            <span class="detail-label">Last Seen ID</span>
                                            <span class="detail-value mono">{{ config.lastSeenId ?? 'None' }}</span>
                                        </div>
                                        @if (config.allowedUsers.length > 0) {
                                            <div class="detail-item span-2">
                                                <span class="detail-label">Allowed Users</span>
                                                <span class="detail-value">{{ config.allowedUsers.join(', ') }}</span>
                                            </div>
                                        }
                                        <div class="detail-item">
                                            <span class="detail-label">Created</span>
                                            <span class="detail-value">{{ config.createdAt | relativeTime }}</span>
                                        </div>
                                        <div class="detail-item">
                                            <span class="detail-label">Updated</span>
                                            <span class="detail-value">{{ config.updatedAt | relativeTime }}</span>
                                        </div>
                                    </div>
                                </div>
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .polling{padding:1.5rem;max-width:1100px}
        .polling__header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1.5rem}
        .polling__header h2{margin:0;color:var(--text-primary)}
        .polling__subtitle{margin:.25rem 0 0;font-size:.75rem;color:var(--text-tertiary)}
        .loading{color:var(--text-secondary)}
        .create-btn,.save-btn{padding:.5rem 1rem;background:var(--accent-cyan-dim);color:var(--accent-cyan);border:1px solid var(--accent-cyan);border-radius:var(--radius);font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit}
        .create-btn:hover,.save-btn:hover:not(:disabled){background:rgba(0,229,255,.2)}
        .save-btn:disabled{opacity:.5;cursor:not-allowed}

        .stats-banner{display:flex;gap:1.5rem;padding:.75rem 1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:1.25rem}
        .stat-item{display:flex;flex-direction:column;align-items:center;gap:.15rem}
        .stat-value{font-size:.85rem;font-weight:700;color:var(--text-primary)}
        .stat-running{color:var(--accent-green)}
        .stat-label{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}

        .create-form{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1.25rem}
        .create-form h3{margin:0 0 1rem;color:var(--text-primary);font-size:.85rem}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
        .span-2{grid-column:span 2}
        .form-field{display:flex;flex-direction:column;gap:.25rem}
        .form-field label{font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}
        .form-input,.form-select{padding:.45rem;background:var(--bg-input);border:1px solid var(--border-bright);border-radius:var(--radius);color:var(--text-primary);font-size:.8rem;font-family:inherit}
        .form-input:focus,.form-select:focus{border-color:var(--accent-cyan);outline:none}
        .form-hint{font-size:.6rem;color:var(--text-tertiary)}
        .mono{font-family:monospace}
        .checkbox-group{display:flex;flex-direction:column;gap:.35rem}
        .checkbox-label{display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:var(--text-secondary);cursor:pointer}
        .checkbox-label input{accent-color:var(--accent-cyan)}
        .form-buttons{margin-top:1rem}
        .save-btn{text-transform:uppercase}

        .polling__filters{display:flex;gap:.35rem;margin-bottom:1rem}
        .filter-btn{padding:.35rem .65rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.7rem;cursor:pointer;font-family:inherit}
        .filter-btn--active{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}

        .empty{text-align:center;padding:3rem;color:var(--text-tertiary)}
        .empty-hint{font-size:.75rem;margin-top:.5rem}

        .config-list{display:flex;flex-direction:column;gap:.75rem}
        .config-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;cursor:pointer;transition:border-color .15s}
        .config-card[data-status="active"]{border-left:3px solid var(--accent-green)}
        .config-card[data-status="paused"]{border-left:3px solid var(--accent-amber)}
        .config-card--expanded{border-color:var(--accent-cyan)}
        .config-card__header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem}
        .config-card__title{display:flex;align-items:center;gap:.5rem}
        .config-card__title h3{margin:0;font-size:.9rem;color:var(--text-primary)}
        .config-card__actions{display:flex;gap:.35rem}
        .config-status{font-size:.6rem;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:var(--radius-sm);border:1px solid}
        .config-status[data-status="active"]{color:var(--accent-green);background:var(--accent-green-dim);border-color:var(--accent-green)}
        .config-status[data-status="paused"]{color:var(--accent-amber);background:var(--accent-amber-dim);border-color:var(--accent-amber)}
        .action-btn{padding:.3rem .6rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.65rem;cursor:pointer;font-family:inherit}
        .action-btn--resume{border-color:var(--accent-green);color:var(--accent-green)}
        .action-btn--danger{border-color:var(--accent-red);color:var(--accent-red)}
        .expand-indicator{font-size:.55rem;color:var(--text-tertiary);margin-left:.25rem}

        .config-meta{display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:.5rem}
        .meta-item{display:flex;flex-direction:column;gap:.1rem}
        .meta-label{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase}
        .meta-value{font-size:.75rem;color:var(--text-primary);font-weight:600}

        .config-tags{display:flex;gap:.35rem;flex-wrap:wrap}
        .event-tag{font-size:.6rem;padding:2px 6px;border-radius:var(--radius-sm);background:var(--bg-raised);color:var(--text-secondary);border:1px solid var(--border)}
        .event-tag--all{color:var(--accent-cyan);border-color:var(--accent-cyan)}

        .config-detail{margin-top:.75rem;border-top:1px solid var(--border);padding-top:.75rem}
        .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
        .detail-item{display:flex;flex-direction:column;gap:.1rem}
        .detail-label{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase}
        .detail-value{font-size:.7rem;color:var(--text-secondary);word-break:break-all}

        @media(max-width:768px){.form-grid{grid-template-columns:1fr}.span-2{grid-column:span 1}.config-meta{flex-direction:column;gap:.5rem}.detail-grid{grid-template-columns:1fr}.stats-banner{flex-wrap:wrap;gap:.75rem}}
    `,
})
export class MentionPollingListComponent implements OnInit, OnDestroy {
    protected readonly pollingService = inject(MentionPollingService);
    protected readonly agentService = inject(AgentService);
    protected readonly projectService = inject(ProjectService);
    private readonly notifications = inject(NotificationService);

    readonly activeFilter = signal<'all' | 'active' | 'paused'>('all');
    readonly showCreateForm = signal(false);
    readonly creating = signal(false);
    readonly expandedId = signal<string | null>(null);

    // Form fields
    formAgentId = '';
    formRepo = '';
    formMentionUsername = '';
    formProjectId = '';
    formInterval = 60;
    formFilterIssueComment = true;
    formFilterIssues = false;
    formFilterPrComment = true;
    formAllowedUsers = '';

    readonly activeCount = computed(() =>
        this.pollingService.configs().filter((c) => c.status === 'active').length,
    );
    readonly pausedCount = computed(() =>
        this.pollingService.configs().filter((c) => c.status === 'paused').length,
    );

    readonly filteredConfigs = computed(() => {
        const filter = this.activeFilter();
        const all = this.pollingService.configs();
        if (filter === 'all') return all;
        return all.filter((c) => c.status === filter);
    });

    ngOnInit(): void {
        this.pollingService.loadConfigs();
        this.pollingService.loadStats();
        this.pollingService.startListening();
        this.agentService.loadAgents();
        this.projectService.loadProjects();
    }

    ngOnDestroy(): void {
        this.pollingService.stopListening();
    }

    toggleExpand(id: string): void {
        this.expandedId.set(this.expandedId() === id ? null : id);
    }

    async create(): Promise<void> {
        if (!this.formAgentId || !this.formRepo || !this.formMentionUsername || !this.formProjectId) {
            this.notifications.error('Please fill in agent, repo, mention username, and project');
            return;
        }

        this.creating.set(true);
        try {
            const eventFilter: MentionPollingConfig['eventFilter'] = [];
            if (this.formFilterIssueComment) eventFilter.push('issue_comment');
            if (this.formFilterIssues) eventFilter.push('issues');
            if (this.formFilterPrComment) eventFilter.push('pull_request_review_comment');

            const allowedUsers = this.formAllowedUsers
                .split(',')
                .map((u) => u.trim())
                .filter(Boolean);

            await this.pollingService.createConfig({
                agentId: this.formAgentId,
                repo: this.formRepo,
                mentionUsername: this.formMentionUsername,
                projectId: this.formProjectId,
                intervalSeconds: this.formInterval,
                eventFilter: eventFilter.length > 0 ? eventFilter : undefined,
                allowedUsers: allowedUsers.length > 0 ? allowedUsers : undefined,
            });

            this.notifications.success('Polling config created');
            this.showCreateForm.set(false);
            this.resetForm();
            this.pollingService.loadStats();
        } catch (err) {
            this.notifications.error('Failed to create polling config');
        } finally {
            this.creating.set(false);
        }
    }

    async toggleStatus(config: MentionPollingConfig, status: MentionPollingStatus): Promise<void> {
        try {
            await this.pollingService.updateConfig(config.id, { status });
            this.notifications.success(`Config ${status === 'active' ? 'resumed' : 'paused'}`);
            this.pollingService.loadStats();
        } catch {
            this.notifications.error('Failed to update config');
        }
    }

    async deleteConfig(config: MentionPollingConfig): Promise<void> {
        if (!confirm(`Delete polling config for "${config.repo}"?`)) return;
        try {
            await this.pollingService.deleteConfig(config.id);
            this.notifications.success('Config deleted');
            this.pollingService.loadStats();
        } catch {
            this.notifications.error('Failed to delete config');
        }
    }

    private resetForm(): void {
        this.formAgentId = '';
        this.formRepo = '';
        this.formMentionUsername = '';
        this.formProjectId = '';
        this.formInterval = 60;
        this.formFilterIssueComment = true;
        this.formFilterIssues = false;
        this.formFilterPrComment = true;
        this.formAllowedUsers = '';
    }
}
