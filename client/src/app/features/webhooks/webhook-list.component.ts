import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { WebhookService } from '../../core/services/webhook.service';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { WebhookRegistration, WebhookDelivery, WebhookEventType, WebhookRegistrationStatus } from '../../core/models/webhook.model';

@Component({
    selector: 'app-webhook-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, SlicePipe, RelativeTimePipe],
    template: `
        <div class="webhooks">
            <div class="webhooks__header">
                <div>
                    <h2>GitHub Webhooks</h2>
                    <p class="webhooks__subtitle">Real-time GitHub event triggers via webhook</p>
                </div>
                <button class="create-btn" (click)="showCreateForm.set(!showCreateForm())">
                    {{ showCreateForm() ? 'Cancel' : '+ New Webhook' }}
                </button>
            </div>

            <!-- Create Form -->
            @if (showCreateForm()) {
                <div class="create-form">
                    <h3>Register a webhook</h3>
                    <p class="form-intro">When GitHub sends a webhook for &#64;mentions in issues or PRs, the agent responds automatically.</p>
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
                                <label>Project (optional)</label>
                                <select class="form-select" [ngModel]="formProjectId()" (ngModelChange)="formProjectId.set($event)">
                                    <option value="">None</option>
                                    @for (project of projectService.projects(); track project.id) {
                                        <option [value]="project.id">{{ project.name }}</option>
                                    }
                                </select>
                                <span class="form-hint">Scope to a project workspace</span>
                            </div>
                            <div class="form-field span-2">
                                <label>Events</label>
                                <div class="checkbox-group">
                                    <label class="checkbox-label">
                                        <input type="checkbox" [checked]="formEvtIssueComment()" (change)="formEvtIssueComment.set(!formEvtIssueComment())" />
                                        Issue comments
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" [checked]="formEvtIssues()" (change)="formEvtIssues.set(!formEvtIssues())" />
                                        Issues (opened/edited)
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" [checked]="formEvtPrReviewComment()" (change)="formEvtPrReviewComment.set(!formEvtPrReviewComment())" />
                                        PR review comments
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" [checked]="formEvtIssueCommentPr()" (change)="formEvtIssueCommentPr.set(!formEvtIssueCommentPr())" />
                                        PR conversation comments
                                    </label>
                                </div>
                            </div>
                        </div>
                    }

                    <div class="form-buttons">
                        <button class="save-btn" [disabled]="creating()" (click)="create()">
                            {{ creating() ? 'Creating...' : 'Register Webhook' }}
                        </button>
                    </div>
                </div>
            }

            <!-- Filters -->
            <div class="webhooks__filters">
                <button
                    class="filter-btn"
                    [class.filter-btn--active]="activeFilter() === 'all'"
                    (click)="activeFilter.set('all')"
                >All ({{ webhookService.registrations().length }})</button>
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

            @if (webhookService.loading()) {
                <p class="loading">Loading webhooks...</p>
            } @else if (filteredRegistrations().length === 0) {
                <div class="empty">
                    <p>No {{ activeFilter() === 'all' ? '' : activeFilter() + ' ' }}webhook registrations found.</p>
                    <p class="empty-hint">Register a webhook to trigger agent sessions from GitHub events.</p>
                </div>
            } @else {
                <div class="reg-list">
                    @for (reg of filteredRegistrations(); track reg.id) {
                        <div class="reg-card" [attr.data-status]="reg.status"
                            [class.reg-card--expanded]="expandedRegId() === reg.id"
                            (click)="toggleRegistration(reg.id)">
                            <div class="reg-card__header">
                                <div class="reg-card__title">
                                    <span class="reg-status" [attr.data-status]="reg.status">{{ reg.status }}</span>
                                    <h3>{{ reg.repo }}</h3>
                                    <span class="expand-indicator">{{ expandedRegId() === reg.id ? '\u25B2' : '\u25BC' }}</span>
                                </div>
                                <div class="reg-card__actions">
                                    @if (reg.status === 'active') {
                                        <button class="action-btn" (click)="toggleStatus(reg, 'paused'); $event.stopPropagation()">Pause</button>
                                    } @else {
                                        <button class="action-btn action-btn--resume" (click)="toggleStatus(reg, 'active'); $event.stopPropagation()">Resume</button>
                                    }
                                    <button class="action-btn action-btn--danger" (click)="deleteRegistration(reg); $event.stopPropagation()">Delete</button>
                                </div>
                            </div>
                            <div class="reg-meta">
                                <div class="meta-item">
                                    <span class="meta-label">Agent</span>
                                    <span class="meta-value">{{ getAgentName(reg.agentId) }}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Username</span>
                                    <span class="meta-value mono">&#64;{{ reg.mentionUsername }}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Triggers</span>
                                    <span class="meta-value">{{ reg.triggerCount }}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Created</span>
                                    <span class="meta-value">{{ reg.createdAt | relativeTime }}</span>
                                </div>
                            </div>
                            <div class="reg-events">
                                @for (evt of reg.events; track evt) {
                                    <span class="event-tag" [attr.data-event]="evt">{{ evt }}</span>
                                }
                            </div>

                            @if (expandedRegId() === reg.id) {
                                <div class="reg-deliveries" (click)="$event.stopPropagation()">
                                    @if (loadingDeliveries()) {
                                        <p class="loading-deliveries">Loading deliveries...</p>
                                    } @else if (regDeliveries().length === 0) {
                                        <p class="no-deliveries">No deliveries yet.</p>
                                    } @else {
                                        <h4 class="deliveries-heading">Delivery History</h4>
                                        @for (delivery of regDeliveries(); track delivery.id) {
                                            <div class="delivery-row delivery-row--clickable"
                                                [attr.data-status]="delivery.status"
                                                (click)="toggleDelivery(delivery.id)">
                                                <span class="delivery-event">{{ delivery.event }}/{{ delivery.action }}</span>
                                                <span class="delivery-sender">{{ delivery.sender }}</span>
                                                <span class="delivery-status" [attr.data-status]="delivery.status">{{ delivery.status }}</span>
                                                <span class="delivery-time">{{ delivery.createdAt | relativeTime }}</span>
                                                @if (delivery.sessionId) {
                                                    <a class="delivery-link" [routerLink]="['/sessions', delivery.sessionId]" (click)="$event.stopPropagation()">Session</a>
                                                }
                                            </div>
                                            @if (expandedDeliveryId() === delivery.id) {
                                                <div class="delivery-detail">
                                                    @if (delivery.body) {
                                                        <div class="delivery-body">
                                                            <span class="detail-label">Body</span>
                                                            <pre class="delivery-body__content">{{ delivery.body | slice:0:500 }}</pre>
                                                        </div>
                                                    }
                                                    @if (delivery.htmlUrl) {
                                                        <a class="delivery-github-link" [href]="delivery.htmlUrl" target="_blank" rel="noopener">View on GitHub</a>
                                                    }
                                                    @if (delivery.result) {
                                                        <div class="delivery-result">
                                                            <span class="detail-label">Result</span>
                                                            <pre class="delivery-result__content">{{ delivery.result }}</pre>
                                                        </div>
                                                    }
                                                </div>
                                            }
                                        }
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            }

            <!-- All Recent Deliveries -->
            @if (webhookService.deliveries().length > 0) {
                <div class="all-deliveries">
                    <h3>Recent Deliveries</h3>
                    <div class="delivery-list">
                        @for (delivery of webhookService.deliveries().slice(0, 20); track delivery.id) {
                            <div class="delivery-row delivery-row--clickable" [attr.data-status]="delivery.status" (click)="toggleDelivery(delivery.id)">
                                <span class="delivery-repo">{{ delivery.repo }}</span>
                                <span class="delivery-event">{{ delivery.event }}/{{ delivery.action }}</span>
                                <span class="delivery-sender">{{ delivery.sender }}</span>
                                <span class="delivery-status" [attr.data-status]="delivery.status">{{ delivery.status }}</span>
                                <span class="delivery-time">{{ delivery.createdAt | relativeTime }}</span>
                                @if (delivery.sessionId) {
                                    <a class="delivery-link" [routerLink]="['/sessions', delivery.sessionId]" (click)="$event.stopPropagation()">Session</a>
                                }
                            </div>
                            @if (expandedDeliveryId() === delivery.id) {
                                <div class="delivery-detail">
                                    @if (delivery.body) {
                                        <div class="delivery-body">
                                            <span class="detail-label">Body</span>
                                            <pre class="delivery-body__content">{{ delivery.body | slice:0:500 }}</pre>
                                        </div>
                                    }
                                    @if (delivery.htmlUrl) {
                                        <a class="delivery-github-link" [href]="delivery.htmlUrl" target="_blank" rel="noopener">View on GitHub</a>
                                    }
                                    @if (delivery.result) {
                                        <div class="delivery-result">
                                            <span class="detail-label">Result</span>
                                            <pre class="delivery-result__content">{{ delivery.result }}</pre>
                                        </div>
                                    }
                                </div>
                            }
                        }
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        .webhooks{padding:1.5rem;max-width:1100px}
        .webhooks__header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1.5rem}
        .webhooks__header h2{margin:0;color:var(--text-primary)}
        .webhooks__subtitle{margin:.25rem 0 0;font-size:.75rem;color:var(--text-tertiary)}
        .loading{color:var(--text-secondary)}
        .create-btn,.save-btn{padding:.5rem 1rem;background:var(--accent-cyan-dim);color:var(--accent-cyan);border:1px solid var(--accent-cyan);border-radius:var(--radius);font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit}
        .create-btn:hover,.save-btn:hover:not(:disabled){background:rgba(0,229,255,.2)}

        .create-form{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1.25rem}
        .create-form h3{margin:0 0 .25rem;color:var(--text-primary);font-size:.85rem}
        .form-intro{margin:0 0 1rem;font-size:.75rem;color:var(--text-tertiary);line-height:1.4}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
        .span-2{grid-column:span 2}
        .form-field{display:flex;flex-direction:column;gap:.25rem}
        .form-field label{font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}
        .form-input,.form-select{padding:.45rem;background:var(--bg-input);border:1px solid var(--border-bright);border-radius:var(--radius);color:var(--text-primary);font-size:.8rem;font-family:inherit}
        .form-select{appearance:auto}
        .form-input:focus,.form-select:focus{border-color:var(--accent-cyan);outline:none}
        .form-hint{font-size:.6rem;color:var(--text-tertiary)}
        .mono{font-family:monospace}
        .checkbox-group{display:flex;flex-direction:column;gap:.35rem}
        .checkbox-label{display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:var(--text-secondary);cursor:pointer}
        .checkbox-label input{accent-color:var(--accent-cyan)}
        .advanced-toggle{background:none;border:none;color:var(--text-tertiary);font-size:.7rem;cursor:pointer;padding:.5rem 0;font-family:inherit}
        .advanced-toggle:hover{color:var(--text-secondary)}
        .advanced-section{margin-top:.5rem}
        .form-buttons{margin-top:1rem}
        .save-btn{text-transform:uppercase}
        .save-btn:disabled{opacity:.5;cursor:not-allowed}

        .webhooks__filters{display:flex;gap:.35rem;margin-bottom:1rem}
        .filter-btn{padding:.35rem .65rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.7rem;cursor:pointer;font-family:inherit}
        .filter-btn--active{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}

        .empty{text-align:center;padding:3rem;color:var(--text-tertiary)}
        .empty-hint{font-size:.75rem;margin-top:.5rem}

        .reg-list{display:flex;flex-direction:column;gap:.75rem}
        .reg-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;cursor:pointer;transition:border-color .15s}
        .reg-card[data-status="active"]{border-left:3px solid var(--accent-green)}
        .reg-card[data-status="paused"]{border-left:3px solid var(--accent-amber)}
        .reg-card--expanded{border-color:var(--accent-cyan)}
        .reg-card__header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem}
        .reg-card__title{display:flex;align-items:center;gap:.5rem}
        .reg-card__title h3{margin:0;font-size:.9rem;color:var(--text-primary)}
        .reg-card__actions{display:flex;gap:.35rem}
        .reg-status{font-size:.6rem;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:var(--radius-sm);border:1px solid}
        .reg-status[data-status="active"]{color:var(--accent-green);background:var(--accent-green-dim);border-color:var(--accent-green)}
        .reg-status[data-status="paused"]{color:var(--accent-amber);background:var(--accent-amber-dim);border-color:var(--accent-amber)}
        .action-btn{padding:.3rem .6rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.65rem;cursor:pointer;font-family:inherit}
        .action-btn--resume{border-color:var(--accent-green);color:var(--accent-green)}
        .action-btn--danger{border-color:var(--accent-red);color:var(--accent-red)}
        .expand-indicator{font-size:.55rem;color:var(--text-tertiary);margin-left:.25rem}

        .reg-meta{display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:.5rem}
        .meta-item{display:flex;flex-direction:column;gap:.1rem}
        .meta-label{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase}
        .meta-value{font-size:.75rem;color:var(--text-primary);font-weight:600}

        .reg-events{display:flex;gap:.35rem;flex-wrap:wrap}
        .event-tag{font-size:.6rem;padding:2px 6px;border-radius:var(--radius-sm);background:var(--bg-raised);color:var(--text-secondary);border:1px solid var(--border)}
        .event-tag[data-event="issue_comment"]{color:var(--accent-cyan);border-color:var(--accent-cyan)}
        .event-tag[data-event="issues"]{color:var(--accent-green);border-color:var(--accent-green)}
        .event-tag[data-event="pull_request_review_comment"]{color:var(--accent-magenta);border-color:var(--accent-magenta)}
        .event-tag[data-event="issue_comment_pr"]{color:var(--accent-amber);border-color:var(--accent-amber)}

        .reg-deliveries{margin-top:.75rem;border-top:1px solid var(--border);padding-top:.75rem}
        .deliveries-heading{margin:0 0 .5rem;color:var(--text-secondary);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}
        .loading-deliveries,.no-deliveries{font-size:.7rem;color:var(--text-tertiary);margin:0}

        .all-deliveries{margin-top:2rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem}
        .all-deliveries h3{margin:0 0 .75rem;color:var(--text-primary);font-size:.85rem}
        .delivery-list{display:flex;flex-direction:column;gap:.35rem}

        .delivery-row{display:flex;align-items:center;gap:.5rem;padding:.5rem;background:var(--bg-raised);border-radius:var(--radius);font-size:.7rem}
        .delivery-row--clickable{cursor:pointer;transition:background .15s}
        .delivery-row--clickable:hover{background:var(--bg-hover)}
        .delivery-repo{font-weight:600;color:var(--text-secondary);min-width:120px}
        .delivery-event{font-weight:600;color:var(--text-secondary);min-width:140px}
        .delivery-sender{color:var(--accent-cyan);min-width:80px}
        .delivery-status{font-size:.6rem;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:var(--radius-sm)}
        .delivery-status[data-status="processing"]{color:var(--accent-cyan);background:var(--accent-cyan-dim)}
        .delivery-status[data-status="completed"]{color:var(--accent-green);background:var(--accent-green-dim)}
        .delivery-status[data-status="failed"]{color:var(--accent-red);background:var(--accent-red-dim)}
        .delivery-status[data-status="ignored"]{color:var(--text-tertiary);background:var(--bg-raised)}
        .delivery-time{color:var(--text-tertiary);font-size:.65rem}
        .delivery-link{font-size:.65rem;color:var(--accent-cyan);text-decoration:none;border:1px solid var(--accent-cyan);padding:1px 6px;border-radius:var(--radius-sm)}

        .delivery-detail{padding:.5rem;background:var(--bg-base);border-radius:var(--radius);margin-top:.25rem;margin-bottom:.35rem}
        .detail-label{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase;display:block;margin-bottom:.25rem}
        .delivery-body__content,.delivery-result__content{margin:0;font-size:.7rem;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto}
        .delivery-body{margin-bottom:.5rem}
        .delivery-github-link{font-size:.7rem;color:var(--accent-cyan);text-decoration:none;display:inline-block;margin-bottom:.5rem}
        .delivery-github-link:hover{text-decoration:underline}

        @media(max-width:768px){.form-grid{grid-template-columns:1fr}.span-2{grid-column:span 1}.reg-meta{flex-direction:column;gap:.5rem}.delivery-row{flex-wrap:wrap}}
    `,
})
export class WebhookListComponent implements OnInit, OnDestroy {
    protected readonly webhookService = inject(WebhookService);
    protected readonly agentService = inject(AgentService);
    protected readonly projectService = inject(ProjectService);
    private readonly notifications = inject(NotificationService);

    readonly activeFilter = signal<'all' | 'active' | 'paused'>('all');
    readonly showCreateForm = signal(false);
    readonly showAdvanced = signal(false);
    readonly creating = signal(false);
    readonly expandedRegId = signal<string | null>(null);
    readonly expandedDeliveryId = signal<string | null>(null);
    readonly regDeliveries = signal<WebhookDelivery[]>([]);
    readonly loadingDeliveries = signal(false);

    // Form fields
    readonly formAgentId = signal('');
    readonly formRepo = signal('');
    readonly formMentionUsername = signal('');
    readonly formProjectId = signal('');
    readonly formEvtIssueComment = signal(true);
    readonly formEvtIssues = signal(false);
    readonly formEvtPrReviewComment = signal(true);
    readonly formEvtIssueCommentPr = signal(false);

    readonly activeCount = computed(() =>
        this.webhookService.registrations().filter((r) => r.status === 'active').length,
    );
    readonly pausedCount = computed(() =>
        this.webhookService.registrations().filter((r) => r.status === 'paused').length,
    );

    readonly filteredRegistrations = computed(() => {
        const filter = this.activeFilter();
        const all = this.webhookService.registrations();
        if (filter === 'all') return all;
        return all.filter((r) => r.status === filter);
    });

    ngOnInit(): void {
        this.webhookService.loadRegistrations();
        this.webhookService.loadDeliveries();
        this.webhookService.startListening();
        this.agentService.loadAgents();
        this.projectService.loadProjects();
    }

    ngOnDestroy(): void {
        this.webhookService.stopListening();
    }

    inputValue(event: Event): string {
        return (event.target as HTMLInputElement).value;
    }

    getAgentName(agentId: string): string {
        const agent = this.agentService.agents().find((a) => a.id === agentId);
        return agent ? agent.name : agentId.substring(0, 8) + '...';
    }

    async toggleRegistration(regId: string): Promise<void> {
        if (this.expandedRegId() === regId) {
            this.expandedRegId.set(null);
            return;
        }
        this.expandedRegId.set(regId);
        this.expandedDeliveryId.set(null);
        this.loadingDeliveries.set(true);
        try {
            await this.webhookService.loadDeliveries(regId, 20);
            this.regDeliveries.set(this.webhookService.deliveries());
        } catch {
            this.regDeliveries.set([]);
        } finally {
            this.loadingDeliveries.set(false);
        }
    }

    toggleDelivery(deliveryId: string): void {
        this.expandedDeliveryId.set(this.expandedDeliveryId() === deliveryId ? null : deliveryId);
    }

    async create(): Promise<void> {
        if (!this.formAgentId() || !this.formRepo() || !this.formMentionUsername()) {
            this.notifications.error('Please select an agent, repo, and mention username');
            return;
        }

        const events: WebhookEventType[] = [];
        if (this.formEvtIssueComment()) events.push('issue_comment');
        if (this.formEvtIssues()) events.push('issues');
        if (this.formEvtPrReviewComment()) events.push('pull_request_review_comment');
        if (this.formEvtIssueCommentPr()) events.push('issue_comment_pr');

        if (events.length === 0) {
            this.notifications.error('Please select at least one event type');
            return;
        }

        this.creating.set(true);
        try {
            await this.webhookService.createRegistration({
                agentId: this.formAgentId(),
                repo: this.formRepo(),
                events,
                mentionUsername: this.formMentionUsername(),
                ...(this.formProjectId() ? { projectId: this.formProjectId() } : {}),
            });

            this.notifications.success('Webhook registered');
            this.showCreateForm.set(false);
            this.resetForm();
        } catch (err) {
            this.notifications.error('Failed to register webhook');
        } finally {
            this.creating.set(false);
        }
    }

    async toggleStatus(reg: WebhookRegistration, status: WebhookRegistrationStatus): Promise<void> {
        try {
            await this.webhookService.updateRegistration(reg.id, { status });
            this.notifications.success(`Webhook ${status === 'active' ? 'resumed' : 'paused'}`);
        } catch {
            this.notifications.error('Failed to update webhook');
        }
    }

    async deleteRegistration(reg: WebhookRegistration): Promise<void> {
        if (!confirm(`Delete webhook for "${reg.repo}"?`)) return;
        try {
            await this.webhookService.deleteRegistration(reg.id);
            this.notifications.success('Webhook deleted');
        } catch {
            this.notifications.error('Failed to delete webhook');
        }
    }

    private resetForm(): void {
        this.formAgentId.set('');
        this.formRepo.set('');
        this.formMentionUsername.set('');
        this.formProjectId.set('');
        this.formEvtIssueComment.set(true);
        this.formEvtIssues.set(false);
        this.formEvtPrReviewComment.set(true);
        this.formEvtIssueCommentPr.set(false);
    }
}
