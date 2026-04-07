import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { CouncilService } from '../../core/services/council.service';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { SessionOutputComponent } from '../sessions/session-output.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { GovernanceVotePanelComponent } from './governance-vote-panel.component';
import type { CouncilLaunch, CouncilLaunchLog, CouncilDiscussionMessage } from '../../core/models/council.model';
import type { Session } from '../../core/models/session.model';
import type { ServerWsMessage, StreamEvent } from '@shared/ws-protocol';

@Component({
    selector: 'app-council-launch-view',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, DatePipe, SessionOutputComponent, StatusBadgeComponent, GovernanceVotePanelComponent],
    template: `
        @if (launch(); as l) {
            <div class="page">
                <div class="page__header">
                    <div>
                        <h2>Council Launch</h2>
                        <p class="page__prompt">{{ l.prompt }}</p>
                    </div>
                    <a class="btn btn--secondary" [routerLink]="['/sessions/councils', l.councilId]">Back to Council</a>
                </div>

                <div class="stage-bar">
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'responding'" [class.stage-step--done]="stageIndex() > 0" [attr.data-stage]="'responding'">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Responding</span>
                    </div>
                    <div class="stage-connector" [class.stage-connector--done]="stageIndex() > 0"></div>
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'discussing'" [class.stage-step--done]="stageIndex() > 1" [attr.data-stage]="'discussing'">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Discussing</span>
                    </div>
                    <div class="stage-connector" [class.stage-connector--done]="stageIndex() > 1"></div>
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'reviewing'" [class.stage-step--done]="stageIndex() > 2" [attr.data-stage]="'reviewing'">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Reviewing</span>
                    </div>
                    <div class="stage-connector" [class.stage-connector--done]="stageIndex() > 2"></div>
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'synthesizing'" [class.stage-step--done]="stageIndex() > 3" [attr.data-stage]="'synthesizing'">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Synthesizing</span>
                    </div>
                    <div class="stage-connector" [class.stage-connector--done]="stageIndex() > 3"></div>
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'complete'" [class.stage-step--done]="l.stage === 'complete'" [attr.data-stage]="'complete'">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Complete</span>
                    </div>
                </div>

                <div class="actions">
                    @if (l.stage === 'responding') {
                        @if (allMembersDone()) {
                            <span class="auto-label">Auto-advancing to discussion...</span>
                        }
                        <button
                            class="btn btn--secondary btn--sm"
                            [disabled]="!allMembersDone() || triggeringReview()"
                            (click)="onStartReview()"
                        >{{ triggeringReview() ? 'Starting...' : 'Skip Discussion & Start Review' }}</button>
                    }
                    @if (l.stage === 'discussing') {
                        <span class="auto-label">
                            Agents are discussing... (Round {{ l.currentDiscussionRound }}/{{ l.totalDiscussionRounds }})
                        </span>
                    }
                    @if (l.stage === 'reviewing' && hasChairman()) {
                        @if (allReviewsDone()) {
                            <span class="auto-label">Auto-advancing to synthesis...</span>
                        }
                        <button
                            class="btn btn--secondary btn--sm"
                            [disabled]="!allReviewsDone() || triggeringSynthesis()"
                            (click)="onSynthesize()"
                        >{{ triggeringSynthesis() ? 'Starting...' : 'Synthesize Now' }}</button>
                    }
                    @if (l.stage !== 'complete') {
                        <button
                            class="btn btn--danger btn--sm"
                            [disabled]="aborting()"
                            (click)="onAbort()"
                        >{{ aborting() ? 'Ending...' : 'End Council' }}</button>
                    }
                    <button class="btn btn--secondary btn--sm" (click)="logsOpen.set(!logsOpen())">
                        {{ logsOpen() ? 'Hide' : 'Show' }} Logs ({{ logs().length }})
                    </button>
                </div>

                @if (logsOpen()) {
                    <div class="log-panel" role="log" aria-label="Council activity log">
                        @for (entry of logs(); track entry.id) {
                            <div class="log-entry" [class]="'log-entry--' + entry.level">
                                <span class="log-ts">{{ entry.createdAt | date:'HH:mm:ss' }}</span>
                                <span class="log-level">{{ entry.level }}</span>
                                <span class="log-msg">{{ entry.message }}</span>
                                @if (entry.detail) {
                                    <span class="log-detail">{{ entry.detail }}</span>
                                }
                            </div>
                        } @empty {
                            <div class="log-empty">No log entries yet</div>
                        }
                    </div>
                }

                <h3 class="section-title">Member Responses</h3>
                <div class="feed-list">
                    @for (session of memberSessions(); track session.id) {
                        <div class="feed-entry"
                             [class.feed-entry--expanded]="expandedSessions().has(session.id)"
                             [style.border-left-color]="agentColor(session.agentId)"
                             tabindex="0"
                             role="button"
                             [attr.aria-expanded]="expandedSessions().has(session.id)"
                             (click)="toggleSession(session.id)"
                             (keydown.enter)="toggleSession(session.id)"
                             (keydown.space)="$event.preventDefault(); toggleSession(session.id)">
                            <div class="feed-meta">
                                @if (session.status === 'running' && getDisplayStatus(session) !== 'queued') {
                                    <span class="processing-dot"></span>
                                }
                                @if (getDisplayStatus(session) === 'queued') {
                                    <span class="queued-dot"></span>
                                }
                                <span class="feed-name" [style.color]="agentColor(session.agentId)">{{ getAgentName(session.agentId) }}</span>
                                <app-status-badge [status]="getDisplayStatus(session)" />
                                @if (!expandedSessions().has(session.id)) {
                                    <span class="feed-preview">{{ session.status === 'running' ? (getActivity(session.agentId) || 'Waiting...') : getPreviewText(session.id) }}</span>
                                }
                                <span class="feed-toggle">{{ expandedSessions().has(session.id) ? '&#9662;' : '&#9656;' }}</span>
                            </div>
                            @if (expandedSessions().has(session.id)) {
                                <div class="feed-content" (click)="$event.stopPropagation()">
                                    @if (session.status === 'running') {
                                        <div class="feed-event-log">
                                            @for (entry of getEventLog(session.id); track entry.ts) {
                                                <div class="feed-event-entry">
                                                    <span class="log-ts">{{ entry.time }}</span>
                                                    <span>{{ entry.text }}</span>
                                                </div>
                                            } @empty {
                                                <div class="feed-event-entry">
                                                    @if (getDisplayStatus(session) === 'queued') {
                                                        <span class="queued-dot"></span>
                                                        <span>{{ getActivity(session.agentId) || 'Queued — waiting for model slot...' }}</span>
                                                    } @else {
                                                        <span class="processing-dot"></span>
                                                        <span>{{ getActivity(session.agentId) || 'Waiting for model...' }}</span>
                                                    }
                                                </div>
                                            }
                                        </div>
                                    } @else {
                                        <app-session-output
                                            [messages]="getMessages(session.id)"
                                            [events]="getEvents(session.id)"
                                            [isRunning]="false"
                                        />
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>

                @if (discussionMessages().length > 0 || l.stage === 'discussing') {
                    <h3 class="section-title">Discussion</h3>
                    @if (l.stage === 'discussing') {
                        <div class="discussion-loading">
                            <span class="processing-dot"></span>
                            <span>Agents are discussing... (Round {{ l.currentDiscussionRound }}/{{ l.totalDiscussionRounds }})</span>
                        </div>
                    }
                    <div class="feed-list" role="log" aria-label="Council discussion">
                        @for (msg of discussionMessages(); track msg.id) {
                            <div class="feed-entry"
                                 [class.feed-entry--expanded]="expandedDiscussion().has(msg.id)"
                                 [style.border-left-color]="agentColor(msg.agentName)"
                                 tabindex="0"
                                 role="button"
                                 [attr.aria-expanded]="expandedDiscussion().has(msg.id)"
                                 (click)="toggleDiscussion(msg.id)"
                                 (keydown.enter)="toggleDiscussion(msg.id)"
                                 (keydown.space)="$event.preventDefault(); toggleDiscussion(msg.id)">
                                <div class="feed-meta">
                                    <span class="feed-name" [style.color]="agentColor(msg.agentName)">{{ msg.agentName }}</span>
                                    <span class="feed-badge">R{{ msg.round }}</span>
                                    <span class="feed-time">{{ msg.createdAt | date:'HH:mm:ss' }}</span>
                                    @if (msg.txid) {
                                        <a class="feed-tx"
                                           href="https://lora.algokit.io/{{ explorerNetwork() }}/transaction/{{ msg.txid }}"
                                           target="_blank"
                                           rel="noopener noreferrer"
                                           aria-label="View transaction on chain"
                                           (click)="$event.stopPropagation()"
                                        >tx</a>
                                    }
                                    @if (!expandedDiscussion().has(msg.id)) {
                                        <span class="feed-preview">{{ previewText(msg.content) }}</span>
                                    }
                                    <span class="feed-toggle">{{ expandedDiscussion().has(msg.id) ? '&#9662;' : '&#9656;' }}</span>
                                </div>
                                @if (expandedDiscussion().has(msg.id)) {
                                    <pre class="feed-content feed-content--text" (click)="$event.stopPropagation()">{{ msg.content }}</pre>
                                }
                            </div>
                        } @empty {
                            @if (l.stage !== 'discussing') {
                                <div class="feed-empty">No discussion messages yet.</div>
                            }
                        }
                    </div>
                }

                @if (reviewSessions().length > 0) {
                    <h3 class="section-title">Peer Reviews</h3>
                    <div class="feed-list">
                        @for (session of reviewSessions(); track session.id) {
                            <div class="feed-entry"
                                 [class.feed-entry--expanded]="expandedSessions().has(session.id)"
                                 [style.border-left-color]="agentColor(session.agentId)"
                                 tabindex="0"
                                 role="button"
                                 [attr.aria-expanded]="expandedSessions().has(session.id)"
                                 (click)="toggleSession(session.id)"
                                 (keydown.enter)="toggleSession(session.id)"
                                 (keydown.space)="$event.preventDefault(); toggleSession(session.id)">
                                <div class="feed-meta">
                                    @if (session.status === 'running' && getDisplayStatus(session) !== 'queued') {
                                        <span class="processing-dot"></span>
                                    }
                                    @if (getDisplayStatus(session) === 'queued') {
                                        <span class="queued-dot"></span>
                                    }
                                    <span class="feed-name" [style.color]="agentColor(session.agentId)">{{ getAgentName(session.agentId) }}</span>
                                    <app-status-badge [status]="getDisplayStatus(session)" />
                                    @if (!expandedSessions().has(session.id)) {
                                        <span class="feed-preview">{{ session.status === 'running' ? (getActivity(session.agentId) || 'Waiting...') : getPreviewText(session.id) }}</span>
                                    }
                                    <span class="feed-toggle">{{ expandedSessions().has(session.id) ? '&#9662;' : '&#9656;' }}</span>
                                </div>
                                @if (expandedSessions().has(session.id)) {
                                    <div class="feed-content" (click)="$event.stopPropagation()">
                                        @if (session.status === 'running') {
                                            <div class="feed-event-log">
                                                @for (entry of getEventLog(session.id); track entry.ts) {
                                                    <div class="feed-event-entry">
                                                        <span class="log-ts">{{ entry.time }}</span>
                                                        <span>{{ entry.text }}</span>
                                                    </div>
                                                } @empty {
                                                    <div class="feed-event-entry">
                                                        @if (getDisplayStatus(session) === 'queued') {
                                                            <span class="queued-dot"></span>
                                                            <span>{{ getActivity(session.agentId) || 'Queued — waiting for model slot...' }}</span>
                                                        } @else {
                                                            <span class="processing-dot"></span>
                                                            <span>{{ getActivity(session.agentId) || 'Waiting for model...' }}</span>
                                                        }
                                                    </div>
                                                }
                                            </div>
                                        } @else {
                                            <app-session-output
                                                [messages]="getMessages(session.id)"
                                                [events]="getEvents(session.id)"
                                                [isRunning]="false"
                                            />
                                        }
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }

                @if (l.voteType === 'governance') {
                    <app-governance-vote-panel
                        [launchId]="l.id"
                        [agentNames]="agentNameMap"
                        [agentColors]="agentColorRecord()"
                        [councilAgentIds]="councilAgentIds()"
                    />
                }

                @if (l.stage === 'complete') {
                    <div class="synthesis" [class.synthesis--empty]="!l.synthesis">
                        <div class="synthesis__header">
                            <span class="synthesis__icon" aria-hidden="true">&#10003;</span>
                            <h3 class="synthesis__title">Council Decision</h3>
                        </div>
                        @if (l.synthesis) {
                            <pre class="synthesis__content">{{ l.synthesis }}</pre>
                        } @else {
                            <p class="synthesis__warning">No synthesis was produced for this council launch.</p>
                        }
                    </div>

                    @if (l.synthesis) {
                        <div class="council-chat">
                            <h3 class="section-title">Chat with Council</h3>
                            @if (chatSessionId()) {
                                <div class="council-chat__output">
                                    <app-session-output
                                        [messages]="getChatMessages()"
                                        [events]="getChatEvents()"
                                        [isRunning]="chatRunning()"
                                    />
                                </div>
                            }
                            <div class="council-chat__input">
                                <input
                                    class="council-chat__field"
                                    type="text"
                                    placeholder="Ask a follow-up question about the council's decision..."
                                    [value]="chatInput()"
                                    (input)="chatInput.set($any($event.target).value)"
                                    (keydown.enter)="onSendChat()"
                                    [disabled]="chatSending()"
                                />
                                <button
                                    class="btn btn--primary btn--sm"
                                    (click)="onSendChat()"
                                    [disabled]="chatSending() || !chatInput().trim()"
                                >{{ chatSending() ? 'Sending...' : 'Send' }}</button>
                            </div>
                        </div>
                    }
                }
            </div>
        } @else {
            <div class="page"><p>Loading...</p></div>
        }
    `,
    styles: `
        .page { padding: var(--space-6); }
        .page__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__prompt { margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.9rem; max-width: 600px; }
        .btn {
            padding: var(--space-2) var(--space-4); border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: var(--accent-cyan-dim); }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover:not(:disabled) { background: var(--bg-hover); }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn--sm { font-size: 0.7rem; padding: 0.35rem var(--space-3); }

        .auto-label {
            font-size: 0.8rem; color: var(--accent-cyan); font-weight: 600;
            animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* Stage bar with per-stage colors */
        .stage-bar {
            display: flex; align-items: center; gap: 0; margin-bottom: 1.5rem;
            padding: var(--space-4); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
        }
        .stage-step { display: flex; align-items: center; gap: 0.5rem; }
        .stage-dot {
            width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border-bright);
            background: transparent;
        }
        .stage-step--done .stage-dot { border-color: var(--accent-green); background: var(--accent-green); }
        .stage-label { font-size: 0.75rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
        .stage-step--done .stage-label { color: var(--accent-green); }
        .stage-connector { flex: 1; height: 2px; background: var(--border); margin: 0 0.5rem; min-width: 20px; }
        .stage-connector--done { background: var(--accent-green); }

        .stage-step--active[data-stage="responding"] .stage-dot { border-color: var(--accent-cyan); background: var(--accent-cyan); }
        .stage-step--active[data-stage="responding"] .stage-label { color: var(--accent-cyan); }
        .stage-step--active[data-stage="discussing"] .stage-dot { border-color: var(--accent-yellow); background: var(--accent-yellow); }
        .stage-step--active[data-stage="discussing"] .stage-label { color: var(--accent-yellow); }
        .stage-step--active[data-stage="reviewing"] .stage-dot { border-color: var(--accent-purple); background: var(--accent-purple); }
        .stage-step--active[data-stage="reviewing"] .stage-label { color: var(--accent-purple); }
        .stage-step--active[data-stage="synthesizing"] .stage-dot { border-color: #f472b6; background: #f472b6; }
        .stage-step--active[data-stage="synthesizing"] .stage-label { color: #f472b6; }
        .stage-step--active[data-stage="complete"] .stage-dot { border-color: var(--accent-green); background: var(--accent-green); }
        .stage-step--active[data-stage="complete"] .stage-label { color: var(--accent-green); }

        .actions { margin-bottom: 1.5rem; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
        .section-title { margin: 1.5rem 0 0.75rem; color: var(--text-primary); }

        .log-panel {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
            padding: var(--space-2); margin-bottom: 1.5rem; max-height: 250px; overflow-y: auto;
            font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.6;
        }
        .log-entry { display: flex; gap: 0.5rem; padding: 0.15rem var(--space-2); }
        .log-entry:hover { background: var(--bg-hover); }
        .log-ts { color: var(--text-tertiary); flex-shrink: 0; }
        .log-level {
            flex-shrink: 0; width: 3.5em; text-transform: uppercase; font-weight: 700;
        }
        .log-entry--info .log-level { color: var(--accent-cyan); }
        .log-entry--stage .log-level { color: var(--accent-green); }
        .log-entry--warn .log-level { color: var(--accent-yellow); }
        .log-entry--error .log-level { color: var(--accent-red); }
        .log-msg { color: var(--text-primary); }
        .log-detail { color: var(--text-tertiary); }
        .log-empty { color: var(--text-tertiary); padding: var(--space-2); text-align: center; }

        /* Feed-style compact layout */
        .feed-list {
            display: flex; flex-direction: column; gap: 2px;
        }
        .feed-entry {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.35rem var(--space-3); font-size: 0.8rem;
            border-left: 3px solid var(--border);
            cursor: pointer; transition: background 0.1s;
        }
        .feed-entry:hover { background: var(--bg-hover); }
        .feed-entry--expanded, .feed-entry--expanded:hover { background: var(--bg-raised); }
        .feed-meta {
            display: flex; align-items: center; gap: 0.4rem; flex-wrap: nowrap; overflow: hidden;
        }
        .feed-name { font-weight: 700; font-size: 0.8rem; flex-shrink: 0; }
        .feed-preview {
            flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            color: var(--text-tertiary); font-size: 0.75rem; margin-left: 0.25rem;
        }
        .feed-event-log {
            background: var(--bg-deep); border-radius: var(--radius-sm);
            padding: 0.3rem; margin-bottom: 0.3rem; max-height: 120px;
            overflow-y: auto; font-size: 0.7rem;
        }
        .feed-event-entry { display: flex; gap: 0.3rem; padding: 1px 0.3rem; color: var(--accent); }
        .feed-toggle {
            flex-shrink: 0; color: var(--text-tertiary); font-size: 0.7rem; margin-left: auto;
            user-select: none;
        }
        .feed-content {
            max-height: 600px; overflow-y: auto;
            margin: 0.4rem 0 0 0;
        }
        .feed-content--text {
            white-space: pre-wrap; word-break: break-word; color: var(--text-primary);
            font-size: 0.78rem; line-height: 1.5;
            padding: var(--space-2); background: var(--bg-deep); border-radius: var(--radius-sm);
            border: 1px solid var(--border);
        }
        .feed-badge {
            font-size: 0.65rem; padding: 1px 6px; border-radius: var(--radius-full);
            background: var(--accent-cyan-dim); color: var(--accent-cyan);
            font-weight: 700; text-transform: uppercase; flex-shrink: 0;
        }
        .feed-time { font-size: 0.7rem; color: var(--text-tertiary); flex-shrink: 0; }
        .feed-tx {
            font-size: 0.65rem; padding: 1px 5px; border-radius: var(--radius-sm);
            background: var(--bg-raised); border: 1px solid var(--border-bright);
            color: var(--accent-magenta); text-decoration: none; font-weight: 600; flex-shrink: 0;
        }
        .feed-tx:hover { background: var(--bg-hover); }
        .feed-empty { color: var(--text-tertiary); font-size: 0.8rem; padding: var(--space-2); }

        .processing-dot {
            width: 6px; height: 6px; border-radius: 50%; background: var(--accent-cyan); flex-shrink: 0;
            animation: processing-pulse 1.5s ease-in-out infinite;
        }
        @keyframes processing-pulse {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
        }

        .queued-dot {
            width: 6px; height: 6px; border-radius: 50%; background: var(--accent-yellow); flex-shrink: 0;
            opacity: 0.6;
        }

        .discussion-loading {
            display: flex; align-items: center; gap: 0.5rem;
            padding: var(--space-3); font-size: 0.8rem; color: var(--accent-cyan);
            animation: pulse 1.5s ease-in-out infinite;
        }

        .synthesis {
            margin-top: 1.5rem; border: 1px solid var(--accent-green); border-radius: var(--radius-lg);
            background: var(--bg-surface); box-shadow: 0 0 16px var(--accent-green-wash);
        }
        .synthesis--empty { border-color: var(--accent-yellow); box-shadow: 0 0 12px var(--accent-amber-subtle); }
        .synthesis__header {
            display: flex; align-items: center; gap: 0.5rem; padding: var(--space-3) var(--space-5);
            border-bottom: 1px solid var(--border); background: var(--bg-raised); border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        }
        .synthesis__icon {
            display: inline-flex; align-items: center; justify-content: center;
            width: 22px; height: 22px; border-radius: 50%;
            background: var(--accent-green); color: var(--bg-base);
            font-size: 0.75rem; font-weight: 700; flex-shrink: 0;
        }
        .synthesis--empty .synthesis__icon { background: var(--accent-yellow); }
        .synthesis__title { margin: 0; font-size: 0.95rem; color: var(--accent-green); font-weight: 700; }
        .synthesis--empty .synthesis__title { color: var(--accent-yellow); }
        .synthesis__content {
            padding: var(--space-5); font-size: 0.85rem; margin: 0;
            white-space: pre-wrap; word-break: break-word; color: var(--text-primary);
            line-height: 1.6;
        }
        .synthesis__warning {
            padding: var(--space-4) var(--space-5); margin: 0; font-size: 0.85rem;
            color: var(--accent-yellow); font-style: italic;
        }

        .council-chat { margin-top: 1.5rem; }
        .council-chat__output { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-3); margin-bottom: 0.75rem; max-height: 500px; overflow-y: auto; }
        .council-chat__input { display: flex; gap: 0.5rem; align-items: center; }
        .council-chat__field { flex: 1; padding: var(--space-2) var(--space-3); border-radius: var(--radius); border: 1px solid var(--border-bright); background: var(--bg-surface); color: var(--text-primary); font-family: inherit; font-size: 0.85rem; outline: none; }
        .council-chat__field:focus { border-color: var(--accent-cyan); }
        .council-chat__field:disabled { opacity: 0.5; }
    `,
})
export class CouncilLaunchViewComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly councilService = inject(CouncilService);
    private readonly agentService = inject(AgentService);
    private readonly sessionService = inject(SessionService);
    private readonly wsService = inject(WebSocketService);

    private static readonly AGENT_COLORS = [
        '#ff6b9d', '#00e5ff', '#ffa040', '#a78bfa',
        '#34d399', '#f472b6', '#60a5fa', '#fbbf24',
    ];

    protected readonly launch = signal<CouncilLaunch | null>(null);
    protected readonly hasChairman = signal(false);
    protected readonly allSessions = signal<Session[]>([]);
    protected readonly logs = signal<CouncilLaunchLog[]>([]);
    protected readonly discussionMessages = signal<CouncilDiscussionMessage[]>([]);
    protected readonly logsOpen = signal(true);
    protected readonly triggeringReview = signal(false);
    protected readonly triggeringSynthesis = signal(false);
    protected readonly aborting = signal(false);
    protected readonly expandedSessions = signal<Set<string>>(new Set());
    protected readonly expandedDiscussion = signal<Set<number>>(new Set());
    protected readonly chatSessionId = signal<string | null>(null);
    protected readonly chatInput = signal('');
    protected readonly chatSending = signal(false);
    protected readonly chatRunning = signal(false);

    protected agentNameMap: Record<string, string> = {};
    private agentIdBySession: Record<string, string> = {};
    private agentColorMap: Record<string, number> = {};
    private nextColorIndex = 0;
    private sessionMessages = signal<Map<string, import('../../core/models/session.model').SessionMessage[]>>(new Map());
    private sessionEvents = signal<Map<string, StreamEvent[]>>(new Map());
    protected readonly agentActivity = signal<Map<string, string>>(new Map());
    protected readonly queuedAgents = signal<Set<string>>(new Set());
    private unsubscribeWs: (() => void) | null = null;
    private refreshInterval: ReturnType<typeof setInterval> | null = null;
    private activityTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    protected readonly memberSessions = computed(() =>
        this.allSessions().filter((s) => s.councilRole === 'member')
    );

    protected readonly reviewSessions = computed(() =>
        this.allSessions().filter((s) => s.councilRole === 'reviewer')
    );

    // Note: Discusser sessions (councilRole === 'discusser') are intentionally not displayed
    // as separate session cards. Their output is captured as CouncilDiscussionMessages and
    // shown in the discussion timeline instead.

    protected readonly stageIndex = computed(() => {
        const l = this.launch();
        if (!l) return 0;
        const stages = ['responding', 'discussing', 'reviewing', 'synthesizing', 'complete'];
        return stages.indexOf(l.stage);
    });

    protected readonly allMembersDone = computed(() => {
        const members = this.memberSessions();
        return members.length > 0 && members.every((s) => s.status !== 'running');
    });

    protected readonly allReviewsDone = computed(() => {
        const reviews = this.reviewSessions();
        return reviews.length > 0 && reviews.every((s) => s.status !== 'running');
    });

    protected readonly explorerNetwork = computed(() => {
        const status = this.sessionService.algochatStatus();
        return status?.network ?? 'testnet';
    });

    protected readonly agentColorRecord = computed(() => {
        const record: Record<string, string> = {};
        for (const [key, idx] of Object.entries(this.agentColorMap)) {
            record[key] = CouncilLaunchViewComponent.AGENT_COLORS[idx % CouncilLaunchViewComponent.AGENT_COLORS.length];
        }
        return record;
    });

    protected readonly councilAgentIds = computed(() => {
        const sessions = this.allSessions();
        const ids = new Set<string>();
        for (const s of sessions) {
            if (s.agentId) ids.add(s.agentId);
        }
        return Array.from(ids);
    });

    async ngOnInit(): Promise<void> {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) return;

        await this.agentService.loadAgents();
        for (const a of this.agentService.agents()) {
            this.agentNameMap[a.id] = a.name;
        }

        // Load AlgoChat status for explorer network URL
        this.sessionService.loadAlgoChatStatus().catch(() => { /* ignore */ });

        await this.loadLaunchData(id);

        // Load existing logs and discussion messages
        try {
            const existingLogs = await this.councilService.getLaunchLogs(id);
            this.logs.set(existingLogs);
        } catch { /* ignore */ }

        try {
            const existingMessages = await this.councilService.getDiscussionMessages(id);
            this.discussionMessages.set(existingMessages);
        } catch { /* ignore */ }

        // Subscribe to session events for live updates
        for (const session of this.allSessions()) {
            this.sessionService.subscribeToSession(session.id);
        }

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'session_event') {
                const events = new Map(this.sessionEvents());
                const existing = events.get(msg.sessionId) ?? [];
                events.set(msg.sessionId, [...existing, msg.event]);
                this.sessionEvents.set(events);

                // Surface thinking/tool activity for Ollama (direct-process) sessions
                const agentId = this.agentIdBySession[msg.sessionId];
                const eventData = msg.event?.data as unknown as Record<string, unknown> | undefined;
                if (agentId && msg.event?.eventType === 'thinking') {
                    const active = !!(eventData?.['thinking']);
                    this.setActivity(agentId, active ? 'Thinking...' : '');
                    if (active) {
                        this.queuedAgents.update((s) => { const n = new Set(s); n.delete(agentId); return n; });
                    }
                }
                if (agentId && msg.event?.eventType === 'queue_status') {
                    const statusMsg = eventData?.['statusMessage'] as string | undefined;
                    if (statusMsg) {
                        this.setActivity(agentId, statusMsg); // No auto-clear — persists until dequeued
                        this.queuedAgents.update((s) => { const n = new Set(s); n.add(agentId); return n; });
                    } else {
                        this.queuedAgents.update((s) => { const n = new Set(s); n.delete(agentId); return n; });
                    }
                }
                if (agentId && msg.event?.eventType === 'tool_status') {
                    const statusMsg = eventData?.['statusMessage'] as string | undefined;
                    if (statusMsg) {
                        this.setActivity(agentId, statusMsg, 5000);
                    }
                }
            }
            if (msg.type === 'session_status') {
                this.refreshSessions();
                // Track chat session status
                const chatId = this.chatSessionId();
                if (chatId && msg.sessionId === chatId) {
                    this.chatRunning.set(msg.status === 'running');
                    // Refresh chat messages when session completes
                    if (msg.status !== 'running') {
                        this.sessionService.getMessages(chatId).then((msgs) => {
                            const map = new Map(this.sessionMessages());
                            map.set(chatId, msgs);
                            this.sessionMessages.set(map);
                        }).catch(() => {});
                    }
                }
            }
            if (msg.type === 'council_stage_change' && msg.launchId === id) {
                this.loadLaunchData(id);
            }
            if (msg.type === 'council_log' && msg.log.launchId === id) {
                this.logs.update((prev) => [...prev, msg.log]);
            }
            if (msg.type === 'council_discussion_message' && msg.message.launchId === id) {
                this.discussionMessages.update((prev) => [...prev, msg.message]);
            }
            if (msg.type === 'chat_thinking') {
                this.setActivity(msg.agentId, msg.active ? 'Thinking...' : '');
            }
            if (msg.type === 'chat_tool_use') {
                this.setActivity(msg.agentId, `Using ${msg.toolName}`, 3000);
            }
            if (msg.type === 'algochat_message') {
                const label = msg.direction === 'outbound' ? `Sending message to ${msg.participant}` : `Message from ${msg.participant}`;
                this.setActivity(msg.participant, label, 4000);
            }
        });

        // Periodically refresh to pick up stage changes (fallback for missed WS messages)
        this.refreshInterval = setInterval(() => this.refreshLaunch(id), 5000);
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        for (const timer of this.activityTimers.values()) {
            clearTimeout(timer);
        }
        for (const session of this.allSessions()) {
            this.sessionService.unsubscribeFromSession(session.id);
        }
        const chatId = this.chatSessionId();
        if (chatId) {
            this.sessionService.unsubscribeFromSession(chatId);
        }
    }

    protected getAgentName(agentId: string | null): string {
        if (!agentId) return 'Unknown';
        return this.agentNameMap[agentId] ?? agentId.slice(0, 8);
    }

    /** Override session status to show "queued" when the model is waiting for a slot. */
    protected getDisplayStatus(session: Session): string {
        if (session.status === 'running' && session.agentId && this.queuedAgents().has(session.agentId)) {
            return 'queued';
        }
        return session.status;
    }

    protected agentColor(agentKey: string | null): string {
        if (!agentKey) return '#666';
        const name = this.agentNameMap[agentKey] ?? agentKey;
        if (!(name in this.agentColorMap)) {
            this.agentColorMap[name] = this.nextColorIndex++;
        }
        const idx = this.agentColorMap[name];
        return CouncilLaunchViewComponent.AGENT_COLORS[idx % CouncilLaunchViewComponent.AGENT_COLORS.length];
    }

    protected previewText(content: string): string {
        const oneLine = content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        return oneLine.length > 120 ? oneLine.slice(0, 120) + '...' : oneLine;
    }

    protected getPreviewText(sessionId: string): string {
        const messages = this.sessionMessages().get(sessionId) ?? [];
        const assistantMsgs = messages.filter((m) => m.role === 'assistant');
        const lastMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
        if (!lastMsg?.content) return '';
        return this.previewText(lastMsg.content);
    }

    protected toggleSession(sessionId: string): void {
        this.expandedSessions.update((set) => {
            const next = new Set(set);
            if (next.has(sessionId)) {
                next.delete(sessionId);
            } else {
                next.add(sessionId);
            }
            return next;
        });
    }

    protected toggleDiscussion(id: number): void {
        this.expandedDiscussion.update((set) => {
            const next = new Set(set);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    protected getActivity(agentId: string | null): string {
        if (!agentId) return '';
        return this.agentActivity().get(agentId) ?? '';
    }

    protected getEventLog(sessionId: string): { ts: number; time: string; text: string }[] {
        const events = this.sessionEvents().get(sessionId) ?? [];
        const log: { ts: number; time: string; text: string }[] = [];
        let lastText = '';
        for (const evt of events) {
            const data = evt.data as unknown as Record<string, unknown> | undefined;
            let text = '';
            if (evt.eventType === 'tool_status' && data?.['statusMessage']) {
                text = data['statusMessage'] as string;
            } else if (evt.eventType === 'queue_status' && data?.['statusMessage']) {
                text = data['statusMessage'] as string;
            } else if (evt.eventType === 'thinking' && data?.['thinking']) {
                text = 'Thinking...';
            } else if (evt.eventType === 'assistant') {
                text = 'Generating response...';
            } else if (evt.eventType === 'performance') {
                const tps = data?.['tokensPerSecond'] as number | undefined;
                const tokens = data?.['outputTokens'] as number | undefined;
                const model = data?.['model'] as string | undefined;
                if (tps) {
                    text = `${model ?? 'Model'}: ${tokens ?? '?'} tokens @ ${tps} tok/s`;
                }
            }
            if (text && text !== lastText) {
                const d = new Date(evt.timestamp);
                log.push({ ts: d.getTime(), time: d.toLocaleTimeString(), text });
                lastText = text;
            }
        }
        return log;
    }

    private setActivity(agentId: string, text: string, autoClearMs?: number): void {
        const map = new Map(this.agentActivity());
        if (text) {
            map.set(agentId, text);
        } else {
            map.delete(agentId);
        }
        this.agentActivity.set(map);

        // Clear previous timer for this agent
        const existing = this.activityTimers.get(agentId);
        if (existing) clearTimeout(existing);

        if (text && autoClearMs) {
            this.activityTimers.set(agentId, setTimeout(() => {
                const m = new Map(this.agentActivity());
                m.delete(agentId);
                this.agentActivity.set(m);
            }, autoClearMs));
        }
    }

    protected getMessages(sessionId: string): import('../../core/models/session.model').SessionMessage[] {
        return this.sessionMessages().get(sessionId) ?? [];
    }

    protected getEvents(sessionId: string): StreamEvent[] {
        return this.sessionEvents().get(sessionId) ?? [];
    }

    protected async onStartReview(): Promise<void> {
        const l = this.launch();
        if (!l) return;
        this.triggeringReview.set(true);
        try {
            await this.councilService.triggerReview(l.id);
            await this.loadLaunchData(l.id);
        } finally {
            this.triggeringReview.set(false);
        }
    }

    protected async onSynthesize(): Promise<void> {
        const l = this.launch();
        if (!l) return;
        this.triggeringSynthesis.set(true);
        try {
            await this.councilService.triggerSynthesis(l.id);
            await this.loadLaunchData(l.id);
        } finally {
            this.triggeringSynthesis.set(false);
        }
    }

    protected async onAbort(): Promise<void> {
        const l = this.launch();
        if (!l) return;
        if (!confirm('End this council? Running sessions will be stopped and existing responses will be aggregated.')) return;
        this.aborting.set(true);
        try {
            await this.councilService.abortLaunch(l.id);
            await this.loadLaunchData(l.id);
        } finally {
            this.aborting.set(false);
        }
    }

    protected getChatMessages(): import('../../core/models/session.model').SessionMessage[] {
        const id = this.chatSessionId();
        return id ? (this.sessionMessages().get(id) ?? []) : [];
    }

    protected getChatEvents(): StreamEvent[] {
        const id = this.chatSessionId();
        return id ? (this.sessionEvents().get(id) ?? []) : [];
    }

    protected async onSendChat(): Promise<void> {
        const l = this.launch();
        const message = this.chatInput().trim();
        if (!l || !message) return;

        this.chatSending.set(true);
        try {
            const result = await this.councilService.chatWithCouncil(l.id, message);
            this.chatInput.set('');
            this.chatSessionId.set(result.sessionId);
            this.chatRunning.set(true);

            // Subscribe to session events for live streaming
            this.sessionService.subscribeToSession(result.sessionId);

            // Refresh launch data to get the chat_session_id persisted
            if (result.created) {
                await this.loadLaunchData(l.id);
            }
        } finally {
            this.chatSending.set(false);
        }
    }

    private async loadLaunchData(launchId: string): Promise<void> {
        const launch = await this.councilService.getCouncilLaunch(launchId);
        this.launch.set(launch);

        try {
            const council = await this.councilService.getCouncil(launch.councilId);
            this.hasChairman.set(!!council.chairmanAgentId);
        } catch { /* ignore */ }

        const sessions: Session[] = [];
        const messagesMap = new Map<string, import('../../core/models/session.model').SessionMessage[]>();

        for (const sessionId of launch.sessionIds) {
            try {
                const session = await this.sessionService.getSession(sessionId);
                sessions.push(session);
                const messages = await this.sessionService.getMessages(sessionId);
                messagesMap.set(sessionId, messages);
            } catch { /* ignore */ }
        }

        this.allSessions.set(sessions);
        this.sessionMessages.set(messagesMap);

        for (const session of sessions) {
            if (session.agentId) {
                this.agentIdBySession[session.id] = session.agentId;
            }
            this.sessionService.subscribeToSession(session.id);
        }

        // Initialize chat session if one exists
        if (launch.chatSessionId) {
            this.chatSessionId.set(launch.chatSessionId);
            this.sessionService.subscribeToSession(launch.chatSessionId);
            try {
                const chatSession = await this.sessionService.getSession(launch.chatSessionId);
                this.chatRunning.set(chatSession.status === 'running');
                const chatMsgs = await this.sessionService.getMessages(launch.chatSessionId);
                messagesMap.set(launch.chatSessionId, chatMsgs);
                this.sessionMessages.set(new Map(messagesMap));
            } catch { /* ignore */ }
        }
    }

    private async refreshSessions(): Promise<void> {
        const l = this.launch();
        if (!l) return;
        const sessions: Session[] = [];
        for (const sessionId of l.sessionIds) {
            try {
                sessions.push(await this.sessionService.getSession(sessionId));
            } catch { /* ignore */ }
        }
        this.allSessions.set(sessions);
    }

    private async refreshLaunch(launchId: string): Promise<void> {
        try {
            const launch = await this.councilService.getCouncilLaunch(launchId);
            const current = this.launch();
            if (current && (launch.stage !== current.stage || launch.sessionIds.length !== current.sessionIds.length)) {
                this.launch.set(launch);
                if (launch.sessionIds.length !== current.sessionIds.length) {
                    await this.loadLaunchData(launchId);
                }
            }
        } catch { /* ignore */ }
    }
}
