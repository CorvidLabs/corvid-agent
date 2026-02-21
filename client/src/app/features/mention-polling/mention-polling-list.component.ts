import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MentionPollingService } from '../../core/services/mention-polling.service';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { MentionPollingConfig, MentionPollingStatus, PollingActivity } from '../../core/models/mention-polling.model';

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
                    <h3>Watch a repo for &#64;mentions</h3>
                    <p class="form-intro">When someone &#64;mentions the username in an issue or PR, the agent starts a conversation automatically.</p>
                    <div class="form-grid">
                        <div class="form-field">
                            <label>Agent</label>
                            <select class="form-select" [ngModel]="formAgentId()" (ngModelChange)="formAgentId.set($event)">
                                <option value="">Choose an agent...</option>
                                @for (agent of agentService.agents(); track agent.id) {
                                    <option [value]="agent.id">{{ agent.name }}</option>
                                }
                            </select>
                        </div>
                        <div class="form-field">
                            <label>Repository</label>
                            <input [value]="formRepo()" (input)="formRepo.set(inputValue($event))" class="form-input mono" placeholder="owner/repo" />
                        </div>
                        <div class="form-field span-2">
                            <label>Watch for &#64;mentions of</label>
                            <input [value]="formMentionUsername()" (input)="formMentionUsername.set(inputValue($event))" class="form-input mono" placeholder="github-username" />
                            <span class="form-hint">The GitHub username to watch for. When someone writes &#64;this-name, the agent responds.</span>
                        </div>
                    </div>

                    <!-- Advanced toggle -->
                    <button class="advanced-toggle" (click)="showAdvanced.set(!showAdvanced())">
                        {{ showAdvanced() ? '\u25B2 Hide advanced' : '\u25BC Advanced options' }}
                    </button>
                    @if (showAdvanced()) {
                        <div class="form-grid advanced-section">
                            <div class="form-field">
                                <label>Poll Interval (seconds)</label>
                                <input type="number" [value]="formInterval()" (input)="formInterval.set(+inputValue($event) || 60)" class="form-input" min="30" max="3600" />
                                <span class="form-hint">How often to check (default: 60s)</span>
                            </div>
                            <div class="form-field">
                                <label>Project (optional)</label>
                                <select class="form-select" [ngModel]="formProjectId()" (ngModelChange)="formProjectId.set($event)">
                                    <option value="">None</option>
                                    @for (project of projectService.projects(); track project.id) {
                                        <option [value]="project.id">{{ project.name }}</option>
                                    }
                                </select>
                                <span class="form-hint">Scope to a project workspace</span>
                            </div>
                            <div class="form-field">
                                <label>Listen for</label>
                                <div class="checkbox-group">
                                    <label class="checkbox-label">
                                        <input type="checkbox" [checked]="formFilterIssueComment()" (change)="formFilterIssueComment.set(!formFilterIssueComment())" />
                                        Issue comments
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" [checked]="formFilterIssues()" (change)="formFilterIssues.set(!formFilterIssues())" />
                                        New issues
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" [checked]="formFilterPrComment()" (change)="formFilterPrComment.set(!formFilterPrComment())" />
                                        PR review comments
                                    </label>
                                </div>
                            </div>
                            <div class="form-field">
                                <label>Only from these users (optional)</label>
                                <input [value]="formAllowedUsers()" (input)="formAllowedUsers.set(inputValue($event))" class="form-input" placeholder="user1, user2" />
                                <span class="form-hint">Leave empty to respond to everyone</span>
                            </div>
                        </div>
                    }

                    <div class="form-buttons">
                        <button class="save-btn" [disabled]="creating()" (click)="create()">
                            {{ creating() ? 'Creating...' : 'Start Watching' }}
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
                                    <button class="action-btn action-btn--edit" (click)="startEdit(config); $event.stopPropagation()">Edit</button>
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
                                    <span class="meta-label">Agent</span>
                                    <span class="meta-value">{{ getAgentName(config.agentId) }}</span>
                                </div>
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
                                    @if (editingId() === config.id) {
                                        <!-- Edit Form -->
                                        <div class="edit-form">
                                            <div class="form-grid">
                                                <div class="form-field">
                                                    <label>Agent</label>
                                                    <select class="form-select" [ngModel]="editAgentId()" (ngModelChange)="editAgentId.set($event)">
                                                        @for (agent of agentService.agents(); track agent.id) {
                                                            <option [value]="agent.id">{{ agent.name }}</option>
                                                        }
                                                    </select>
                                                </div>
                                                <div class="form-field">
                                                    <label>Mention Username</label>
                                                    <input [value]="editMentionUsername()" (input)="editMentionUsername.set(inputValue($event))" class="form-input mono" />
                                                </div>
                                                <div class="form-field">
                                                    <label>Poll Interval (seconds)</label>
                                                    <input type="number" [value]="editInterval()" (input)="editInterval.set(+inputValue($event) || 60)" class="form-input" min="30" max="3600" />
                                                </div>
                                                <div class="form-field">
                                                    <label>Project</label>
                                                    <select class="form-select" [ngModel]="editProjectId()" (ngModelChange)="editProjectId.set($event)">
                                                        <option value="">None</option>
                                                        @for (project of projectService.projects(); track project.id) {
                                                            <option [value]="project.id">{{ project.name }}</option>
                                                        }
                                                    </select>
                                                </div>
                                                <div class="form-field">
                                                    <label>Listen for</label>
                                                    <div class="checkbox-group">
                                                        <label class="checkbox-label">
                                                            <input type="checkbox" [checked]="editFilterIssueComment()" (change)="editFilterIssueComment.set(!editFilterIssueComment())" />
                                                            Issue comments
                                                        </label>
                                                        <label class="checkbox-label">
                                                            <input type="checkbox" [checked]="editFilterIssues()" (change)="editFilterIssues.set(!editFilterIssues())" />
                                                            New issues
                                                        </label>
                                                        <label class="checkbox-label">
                                                            <input type="checkbox" [checked]="editFilterPrComment()" (change)="editFilterPrComment.set(!editFilterPrComment())" />
                                                            PR review comments
                                                        </label>
                                                    </div>
                                                </div>
                                                <div class="form-field">
                                                    <label>Only from these users (optional)</label>
                                                    <input [value]="editAllowedUsers()" (input)="editAllowedUsers.set(inputValue($event))" class="form-input" placeholder="user1, user2" />
                                                </div>
                                            </div>
                                            <div class="form-buttons edit-buttons">
                                                <button class="save-btn" [disabled]="saving()" (click)="saveEdit(config)">
                                                    {{ saving() ? 'Saving...' : 'Save Changes' }}
                                                </button>
                                                <button class="action-btn" (click)="cancelEdit()">Cancel</button>
                                            </div>
                                        </div>
                                    } @else {
                                        <!-- Activity Feed -->
                                        @if (getActivity(config.id).length > 0) {
                                            <div class="activity-summary-bar">
                                                <span class="activity-summary">{{ activitySummary(getActivity(config.id)) }}</span>
                                                @if (config.allowedUsers.length > 0) {
                                                    <span class="activity-filter-note">only from {{ config.allowedUsers.join(', ') }}</span>
                                                }
                                            </div>
                                            <div class="activity-list">
                                                @for (item of sortedActivity(getActivity(config.id)); track item.id) {
                                                    <div class="activity-item activity-item--clickable" (click)="openSession(item.id)">
                                                        <span class="activity-status-dot" [attr.data-status]="item.status"></span>
                                                        <span class="activity-type-label" [attr.data-type]="item.isPR ? 'pr' : 'issue'">{{ item.isPR ? 'PR' : 'Issue' }}</span>
                                                        <span class="activity-number">{{ item.number ? '#' + item.number : '' }}</span>
                                                        <span class="activity-title">{{ item.title || parseTitle(item.name) }}</span>
                                                        @if (item.sender) {
                                                            <span class="activity-sender">&#64;{{ item.sender }}</span>
                                                        }
                                                        @if (item.triggerType) {
                                                            <span class="activity-trigger" [attr.data-trigger]="item.triggerType">{{ item.triggerType }}</span>
                                                        }
                                                        @if (showRepoColumn(config)) {
                                                            <span class="activity-repo">{{ shortRepo(item.repo) }}</span>
                                                        }
                                                        <span class="activity-time">{{ item.createdAt | relativeTime }}</span>
                                                    </div>
                                                }
                                            </div>
                                        } @else {
                                            <p class="activity-empty">No triggered sessions yet. Waiting for &#64;{{ config.mentionUsername }} mentions...</p>
                                        }
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
        .create-form h3{margin:0 0 .25rem;color:var(--text-primary);font-size:.85rem}
        .form-intro{margin:0 0 1rem;font-size:.75rem;color:var(--text-tertiary)}
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
        .advanced-toggle{display:block;margin-top:.75rem;padding:.35rem 0;background:none;border:none;color:var(--text-tertiary);font-size:.7rem;cursor:pointer;font-family:inherit}
        .advanced-toggle:hover{color:var(--accent-cyan)}
        .advanced-section{margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border)}

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

        .action-btn--edit{border-color:var(--accent-cyan);color:var(--accent-cyan)}
        .edit-form{display:flex;flex-direction:column;gap:.75rem}
        .edit-buttons{display:flex;gap:.5rem;align-items:center}

        .activity-summary-bar{display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem}
        .activity-summary{font-size:.7rem;color:var(--text-secondary);font-weight:600}
        .activity-filter-note{font-size:.6rem;color:var(--text-tertiary)}
        .activity-list{display:flex;flex-direction:column;gap:.35rem;max-height:300px;overflow-y:auto}
        .activity-item{display:flex;align-items:center;gap:.5rem;padding:.3rem .4rem;border-radius:var(--radius-sm);background:var(--bg-raised)}
        .activity-item--clickable{cursor:pointer;transition:background .15s,border-color .15s}
        .activity-item--clickable:hover{background:var(--bg-hover);outline:1px solid var(--accent-cyan)}
        .activity-status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .activity-status-dot[data-status="running"],.activity-status-dot[data-status="idle"]{background:var(--accent-green);box-shadow:0 0 4px var(--accent-green)}
        .activity-status-dot[data-status="completed"]{background:var(--text-tertiary)}
        .activity-status-dot[data-status="stopped"]{background:var(--accent-amber)}
        .activity-status-dot[data-status="error"]{background:var(--accent-red)}
        .activity-type-label{font-size:.55rem;font-weight:700;text-transform:uppercase;padding:1px 5px;border-radius:var(--radius-sm);border:1px solid;flex-shrink:0}
        .activity-type-label[data-type="pr"]{color:var(--accent-cyan);border-color:var(--accent-cyan);background:var(--accent-cyan-dim)}
        .activity-type-label[data-type="issue"]{color:var(--accent-amber);border-color:var(--accent-amber);background:var(--accent-amber-dim)}
        .activity-number{font-size:.7rem;font-weight:700;color:var(--text-primary);font-family:monospace;min-width:2rem;flex-shrink:0}
        .activity-title{font-size:.7rem;color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .activity-sender{font-size:.6rem;color:var(--accent-cyan);font-family:monospace;flex-shrink:0}
        .activity-trigger{font-size:.5rem;text-transform:uppercase;padding:1px 4px;border-radius:var(--radius-sm);background:var(--bg-surface);color:var(--text-tertiary);border:1px solid var(--border);flex-shrink:0}
        .activity-trigger[data-trigger="review"]{color:var(--accent-purple, var(--text-secondary));border-color:var(--accent-purple, var(--border))}
        .activity-trigger[data-trigger="assignment"]{color:var(--accent-green);border-color:var(--accent-green)}
        .activity-repo{font-size:.6rem;color:var(--text-tertiary);font-family:monospace;flex-shrink:0}
        .activity-time{font-size:.6rem;color:var(--text-tertiary);white-space:nowrap;flex-shrink:0}
        .activity-empty{font-size:.7rem;color:var(--text-tertiary);margin:0}

        @media(max-width:768px){.form-grid{grid-template-columns:1fr}.span-2{grid-column:span 1}.config-meta{flex-direction:column;gap:.5rem}.detail-grid{grid-template-columns:1fr}.stats-banner{flex-wrap:wrap;gap:.75rem}}
    `,
})
export class MentionPollingListComponent implements OnInit, OnDestroy {
    protected readonly pollingService = inject(MentionPollingService);
    protected readonly agentService = inject(AgentService);
    protected readonly projectService = inject(ProjectService);
    private readonly notifications = inject(NotificationService);
    private readonly router = inject(Router);

    readonly activeFilter = signal<'all' | 'active' | 'paused'>('all');
    readonly showCreateForm = signal(false);
    readonly showAdvanced = signal(false);
    readonly creating = signal(false);
    readonly expandedId = signal<string | null>(null);
    readonly editingId = signal<string | null>(null);
    readonly saving = signal(false);

    // Edit form signals
    readonly editAgentId = signal('');
    readonly editMentionUsername = signal('');
    readonly editInterval = signal(60);
    readonly editProjectId = signal('');
    readonly editFilterIssueComment = signal(true);
    readonly editFilterIssues = signal(false);
    readonly editFilterPrComment = signal(true);
    readonly editAllowedUsers = signal('');

    // Form fields — all signals for reliable OnPush rendering
    readonly formAgentId = signal('');
    readonly formRepo = signal('');
    readonly formMentionUsername = signal('');
    readonly formProjectId = signal('');
    readonly formInterval = signal(60);
    readonly formFilterIssueComment = signal(true);
    readonly formFilterIssues = signal(false);
    readonly formFilterPrComment = signal(true);
    readonly formAllowedUsers = signal('');

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

    inputValue(event: Event): string {
        return (event.target as HTMLInputElement).value;
    }

    getAgentName(agentId: string): string {
        const agent = this.agentService.agents().find((a) => a.id === agentId);
        return agent ? agent.name : agentId.substring(0, 8) + '...';
    }

    getProjectName(projectId: string): string {
        const project = this.projectService.projects().find((p) => p.id === projectId);
        return project ? project.name : projectId.substring(0, 8) + '...';
    }

    toggleExpand(id: string): void {
        const isExpanding = this.expandedId() !== id;
        this.expandedId.set(isExpanding ? id : null);
        if (isExpanding) {
            this.pollingService.loadActivity(id);
        }
    }

    getActivity(configId: string): PollingActivity[] {
        return this.pollingService.activity().get(configId) ?? [];
    }

    activitySummary(activities: PollingActivity[]): string {
        const total = activities.length;
        const prs = activities.filter(a => a.isPR).length;
        const issues = total - prs;
        const inProgress = activities.filter(a => a.status === 'running' || a.status === 'idle').length;
        const parts: string[] = [`${total} trigger${total !== 1 ? 's' : ''}`];
        const typeParts: string[] = [];
        if (prs > 0) typeParts.push(`${prs} PR${prs !== 1 ? 's' : ''}`);
        if (issues > 0) typeParts.push(`${issues} issue${issues !== 1 ? 's' : ''}`);
        if (typeParts.length > 0) parts.push(typeParts.join(', '));
        if (inProgress > 0) parts.push(`${inProgress} in progress`);
        return parts.join(' \u2014 ');
    }

    sortedActivity(activities: PollingActivity[]): PollingActivity[] {
        return [...activities].sort((a, b) => {
            const aRunning = a.status === 'running' || a.status === 'idle' ? 0 : 1;
            const bRunning = b.status === 'running' || b.status === 'idle' ? 0 : 1;
            if (aRunning !== bRunning) return aRunning - bRunning;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }

    openSession(sessionId: string): void {
        this.router.navigate(['/sessions', sessionId]);
    }

    parseTitle(name: string): string {
        const match = name.match(/#\d+:\s*(.*)/);
        return match ? match[1] : name;
    }

    /** Show repo column when config watches an org (no slash = org-level). */
    showRepoColumn(config: MentionPollingConfig): boolean {
        return !config.repo.includes('/');
    }

    /** Extract short repo name from full owner/repo. */
    shortRepo(repo: string | null): string {
        if (!repo) return '';
        const idx = repo.indexOf('/');
        return idx >= 0 ? repo.substring(idx + 1) : repo;
    }

    async create(): Promise<void> {
        if (!this.formAgentId() || !this.formRepo() || !this.formMentionUsername()) {
            this.notifications.error('Please fill in agent, repository, and mention username');
            return;
        }

        this.creating.set(true);
        try {
            const eventFilter: MentionPollingConfig['eventFilter'] = [];
            if (this.formFilterIssueComment()) eventFilter.push('issue_comment');
            if (this.formFilterIssues()) eventFilter.push('issues');
            if (this.formFilterPrComment()) eventFilter.push('pull_request_review_comment');

            const allowedUsers = this.formAllowedUsers()
                .split(',')
                .map((u) => u.trim())
                .filter(Boolean);

            await this.pollingService.createConfig({
                agentId: this.formAgentId(),
                repo: this.formRepo(),
                mentionUsername: this.formMentionUsername(),
                projectId: this.formProjectId() || undefined,
                intervalSeconds: this.formInterval(),
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

    startEdit(config: MentionPollingConfig): void {
        this.expandedId.set(config.id);
        this.editingId.set(config.id);
        this.editAgentId.set(config.agentId);
        this.editMentionUsername.set(config.mentionUsername);
        this.editInterval.set(config.intervalSeconds);
        this.editProjectId.set(config.projectId || '');
        this.editFilterIssueComment.set(config.eventFilter.length === 0 || config.eventFilter.includes('issue_comment'));
        this.editFilterIssues.set(config.eventFilter.includes('issues'));
        this.editFilterPrComment.set(config.eventFilter.length === 0 || config.eventFilter.includes('pull_request_review_comment'));
        this.editAllowedUsers.set(config.allowedUsers.join(', '));
    }

    cancelEdit(): void {
        this.editingId.set(null);
    }

    async saveEdit(config: MentionPollingConfig): Promise<void> {
        this.saving.set(true);
        try {
            const eventFilter: MentionPollingConfig['eventFilter'] = [];
            if (this.editFilterIssueComment()) eventFilter.push('issue_comment');
            if (this.editFilterIssues()) eventFilter.push('issues');
            if (this.editFilterPrComment()) eventFilter.push('pull_request_review_comment');

            const allowedUsers = this.editAllowedUsers()
                .split(',')
                .map((u) => u.trim())
                .filter(Boolean);

            await this.pollingService.updateConfig(config.id, {
                agentId: this.editAgentId(),
                mentionUsername: this.editMentionUsername(),
                intervalSeconds: this.editInterval(),
                projectId: this.editProjectId() || undefined,
                eventFilter,
                allowedUsers,
            });

            this.notifications.success('Config updated');
            this.editingId.set(null);
            this.pollingService.loadStats();
        } catch {
            this.notifications.error('Failed to update config');
        } finally {
            this.saving.set(false);
        }
    }

    private resetForm(): void {
        this.formAgentId.set('');
        this.formRepo.set('');
        this.formMentionUsername.set('');
        this.formProjectId.set('');
        this.formInterval.set(60);
        this.formFilterIssueComment.set(true);
        this.formFilterIssues.set(false);
        this.formFilterPrComment.set(true);
        this.formAllowedUsers.set('');
    }
}
