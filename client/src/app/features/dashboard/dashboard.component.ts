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
        .dashboard h2 { margin: 0 0 1.5rem; }
        .dashboard__cards {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 1.25rem;
        }
        .card__title { margin: 0 0 0.5rem; font-size: 0.85rem; color: #64748b; text-transform: uppercase; }
        .card__count { margin: 0 0 0.5rem; font-size: 2rem; font-weight: 700; color: #1e293b; }
        .card__link { font-size: 0.85rem; color: #3b82f6; text-decoration: none; }
        .card__link:hover { text-decoration: underline; }
        .dashboard__algochat, .dashboard__running { margin-top: 1.5rem; }
        .dashboard__algochat h3, .dashboard__running h3 { margin: 0 0 0.75rem; }
        .algochat-info { display: flex; flex-direction: column; gap: 0.25rem; }
        .algochat-info p { margin: 0.25rem 0; }
        code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 0.8rem; }
        .running-session {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 0;
            border-bottom: 1px solid #f1f5f9;
        }
        .running-session a { color: #3b82f6; text-decoration: none; }
        .local-badge {
            display: inline-block;
            background: #dbeafe;
            color: #1d4ed8;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: 600;
        }
        .dashboard__local-chat { margin-top: 1.5rem; }
        .dashboard__local-chat h3 { margin: 0 0 0.75rem; }
        .chat-controls { margin-bottom: 0.75rem; }
        .chat-agent-select {
            padding: 0.5rem;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            font-size: 0.9rem;
            min-width: 200px;
        }
        .chat-messages {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 1rem;
            max-height: 400px;
            overflow-y: auto;
            margin-bottom: 0.75rem;
            background: #fafbfc;
        }
        .chat-empty { color: #94a3b8; font-size: 0.85rem; margin: 0; }
        .chat-msg { margin-bottom: 0.75rem; }
        .chat-msg:last-child { margin-bottom: 0; }
        .chat-msg__label {
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            color: #64748b;
        }
        .chat-msg--inbound .chat-msg__label { color: #3b82f6; }
        .chat-msg--outbound .chat-msg__label { color: #16a34a; }
        .chat-msg__content {
            margin: 0.25rem 0 0;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 0.9rem;
            line-height: 1.5;
        }
        .chat-input { display: flex; gap: 0.5rem; }
        .chat-input__field {
            flex: 1;
            padding: 0.5rem 0.75rem;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            font-size: 0.9rem;
        }
        .chat-input__field:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
        }
        .chat-input__btn {
            padding: 0.5rem 1.25rem;
            background: #3b82f6;
            color: #fff;
            border: none;
            border-radius: 6px;
            font-size: 0.9rem;
            cursor: pointer;
        }
        .chat-input__btn:hover:not(:disabled) { background: #2563eb; }
        .chat-input__btn:disabled { opacity: 0.5; cursor: not-allowed; }
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
        return status?.address === 'local';
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
