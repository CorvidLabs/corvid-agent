import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../core/services/project.service';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import type { ServerWsMessage } from '../../core/models/ws-message.model';

interface ChatMessage {
    content: string;
    direction: 'inbound' | 'outbound';
    timestamp: Date;
}

@Component({
    selector: 'app-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, StatusBadgeComponent],
    template: `
        <div class="dashboard">
            <h2>Dashboard</h2>

            <div class="dashboard__cards">
                <div class="card">
                    <h3 class="card__title">Projects</h3>
                    <p class="card__count">{{ projectService.projects().length }}</p>
                    <a class="card__link" routerLink="/projects">View all</a>
                </div>
                <div class="card">
                    <h3 class="card__title">Agents</h3>
                    <p class="card__count">{{ agentService.agents().length }}</p>
                    <a class="card__link" routerLink="/agents">View all</a>
                </div>
                <div class="card">
                    <h3 class="card__title">Sessions</h3>
                    <p class="card__count">{{ sessionService.sessions().length }}</p>
                    <a class="card__link" routerLink="/sessions">View all</a>
                </div>
                <div class="card">
                    <h3 class="card__title">Running</h3>
                    <p class="card__count">{{ runningSessions().length }}</p>
                </div>
            </div>

            @if (algochatStatus(); as status) {
                <div class="dashboard__algochat">
                    <h3>AlgoChat</h3>
                    <div class="algochat-info">
                        <app-status-badge [status]="status.enabled ? 'connected' : 'disconnected'" />
                        @if (status.address === 'local') {
                            <p><span class="local-badge">Local Mode</span></p>
                            <p>Active Conversations: {{ status.activeConversations }}</p>
                        } @else if (status.enabled) {
                            <p>Address: <code>{{ status.address }}</code></p>
                            <p>Network: {{ status.network }}</p>
                            <p>Active Conversations: {{ status.activeConversations }}</p>
                        } @else {
                            <p>Not configured. Set ALGOCHAT_MNEMONIC in .env to enable.</p>
                        }
                    </div>
                </div>
            }

            @if (isLocalChat()) {
                <div class="dashboard__local-chat">
                    <h3>Local Chat</h3>
                    @if (agentService.agents().length === 0) {
                        <p>Create an agent to start chatting.</p>
                    } @else {
                        <div class="chat-controls">
                            <select
                                class="chat-agent-select"
                                [value]="selectedAgentId()"
                                (change)="onAgentSelect($event)"
                                aria-label="Select an agent"
                            >
                                <option value="" disabled>Select agent...</option>
                                @for (agent of agentService.agents(); track agent.id) {
                                    <option [value]="agent.id">{{ agent.name }}</option>
                                }
                            </select>
                        </div>
                        <div class="chat-messages" role="log" aria-label="Chat messages">
                            @for (msg of chatMessages(); track msg.timestamp) {
                                <div class="chat-msg" [class.chat-msg--inbound]="msg.direction === 'inbound'"
                                     [class.chat-msg--outbound]="msg.direction === 'outbound'">
                                    <span class="chat-msg__label">{{ msg.direction === 'inbound' ? 'You' : 'Agent' }}</span>
                                    <p class="chat-msg__content">{{ msg.content }}</p>
                                </div>
                            }
                            @if (chatMessages().length === 0) {
                                <p class="chat-empty">No messages yet. Select an agent and send a message.</p>
                            }
                        </div>
                        <form class="chat-input" (submit)="sendChat($event)">
                            <input
                                type="text"
                                class="chat-input__field"
                                placeholder="Type a message..."
                                [(ngModel)]="chatInput"
                                name="chatInput"
                                [disabled]="!selectedAgentId()"
                                aria-label="Chat message input"
                            />
                            <button
                                type="submit"
                                class="chat-input__btn"
                                [disabled]="!selectedAgentId() || !chatInput"
                                aria-label="Send message"
                            >Send</button>
                        </form>
                    }
                </div>
            }

            @if (runningSessions().length > 0) {
                <div class="dashboard__running">
                    <h3>Active Sessions</h3>
                    @for (session of runningSessions(); track session.id) {
                        <div class="running-session">
                            <a [routerLink]="['/sessions', session.id]">{{ session.name || session.id }}</a>
                            <app-status-badge [status]="session.status" />
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .dashboard { padding: 1.5rem; }
        .dashboard h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        .dashboard h3 { color: var(--text-primary); }
        .dashboard__cards {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1.25rem;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .card:hover { border-color: var(--border-bright); }
        .card__title { margin: 0 0 0.5rem; font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; }
        .card__count { margin: 0 0 0.5rem; font-size: 2rem; font-weight: 700; color: var(--accent-cyan); text-shadow: 0 0 12px rgba(0, 229, 255, 0.2); }
        .card__link { font-size: 0.8rem; color: var(--accent-cyan); text-decoration: none; opacity: 0.8; }
        .card__link:hover { opacity: 1; text-decoration: underline; }
        .dashboard__algochat, .dashboard__running { margin-top: 1.5rem; }
        .dashboard__algochat h3, .dashboard__running h3 { margin: 0 0 0.75rem; }
        .algochat-info { display: flex; flex-direction: column; gap: 0.25rem; color: var(--text-secondary); }
        .algochat-info p { margin: 0.25rem 0; }
        code { background: var(--bg-raised); color: var(--accent-magenta); padding: 2px 6px; border-radius: var(--radius-sm); font-size: 0.8rem; border: 1px solid var(--border); }
        .running-session {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 0;
            border-bottom: 1px solid var(--border);
        }
        .running-session a { color: var(--accent-cyan); text-decoration: none; }
        .running-session a:hover { text-shadow: 0 0 8px rgba(0, 229, 255, 0.3); }
        .local-badge {
            display: inline-block;
            background: var(--accent-cyan-dim);
            color: var(--accent-cyan);
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            font-size: 0.75rem;
            font-weight: 600;
            border: 1px solid rgba(0, 229, 255, 0.3);
            letter-spacing: 0.05em;
        }
        .dashboard__local-chat { margin-top: 1.5rem; }
        .dashboard__local-chat h3 { margin: 0 0 0.75rem; }
        .chat-controls { margin-bottom: 0.75rem; }
        .chat-agent-select {
            padding: 0.5rem;
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            font-size: 0.85rem;
            font-family: inherit;
            min-width: 200px;
            background: var(--bg-input);
            color: var(--text-primary);
        }
        .chat-agent-select:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .chat-messages {
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1rem;
            max-height: 400px;
            overflow-y: auto;
            margin-bottom: 0.75rem;
            background: var(--bg-surface);
        }
        .chat-empty { color: var(--text-tertiary); font-size: 0.85rem; margin: 0; }
        .chat-msg { margin-bottom: 0.75rem; }
        .chat-msg:last-child { margin-bottom: 0; }
        .chat-msg__label {
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-tertiary);
        }
        .chat-msg--inbound .chat-msg__label { color: var(--accent-cyan); }
        .chat-msg--outbound .chat-msg__label { color: var(--accent-green); }
        .chat-msg__content {
            margin: 0.25rem 0 0;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 0.85rem;
            line-height: 1.5;
            color: var(--text-primary);
        }
        .chat-input { display: flex; gap: 0.5rem; }
        .chat-input__field {
            flex: 1;
            padding: 0.5rem 0.75rem;
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            font-size: 0.85rem;
            font-family: inherit;
            background: var(--bg-input);
            color: var(--text-primary);
        }
        .chat-input__field:focus {
            outline: none;
            border-color: var(--accent-cyan);
            box-shadow: var(--glow-cyan);
        }
        .chat-input__btn {
            padding: 0.5rem 1.25rem;
            background: transparent;
            color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan);
            border-radius: var(--radius);
            font-size: 0.85rem;
            font-family: inherit;
            font-weight: 600;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .chat-input__btn:hover:not(:disabled) { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .chat-input__btn:disabled { opacity: 0.3; cursor: not-allowed; }
    `,
})
export class DashboardComponent implements OnInit, OnDestroy {
    protected readonly projectService = inject(ProjectService);
    protected readonly agentService = inject(AgentService);
    protected readonly sessionService = inject(SessionService);
    private readonly wsService = inject(WebSocketService);

    protected readonly algochatStatus = this.sessionService.algochatStatus;
    protected readonly runningSessions = computed(() =>
        this.sessionService.sessions().filter((s) => s.status === 'running')
    );

    protected readonly isLocalChat = computed(() => {
        const status = this.algochatStatus();
        return status?.enabled ?? false;
    });

    protected readonly selectedAgentId = signal('');
    protected readonly chatMessages = signal<ChatMessage[]>([]);
    protected chatInput = '';

    private unsubscribeWs: (() => void) | null = null;

    ngOnInit(): void {
        this.projectService.loadProjects();
        this.agentService.loadAgents();
        this.sessionService.loadSessions();
        this.sessionService.loadAlgoChatStatus();

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'algochat_message') {
                this.chatMessages.update((msgs) => [
                    ...msgs,
                    {
                        content: msg.content,
                        direction: msg.direction,
                        timestamp: new Date(),
                    },
                ]);
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
    }

    protected onAgentSelect(event: Event): void {
        const select = event.target as HTMLSelectElement;
        this.selectedAgentId.set(select.value);
        this.chatMessages.set([]);
    }

    protected sendChat(event: Event): void {
        event.preventDefault();
        const agentId = this.selectedAgentId();
        const content = this.chatInput.trim();
        if (!agentId || !content) return;

        this.wsService.sendChatMessage(agentId, content);
        this.chatInput = '';
    }
}
