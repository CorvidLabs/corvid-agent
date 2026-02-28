import {
    Component,
    ChangeDetectionStrategy,
    inject,
    OnInit,
    OnDestroy,
    signal,
    computed,
} from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { AllowlistService } from '../../core/services/allowlist.service';
import { NotificationService } from '../../core/services/notification.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { firstValueFrom } from 'rxjs';

interface WalletSummary {
    address: string;
    label: string;
    messageCount: number;
    inboundCount: number;
    outboundCount: number;
    lastActive: string;
    onAllowlist: boolean;
    credits: number;
    totalPurchased: number;
}

interface WalletMessage {
    id: number;
    participant: string;
    content: string;
    direction: 'inbound' | 'outbound' | 'status';
    fee: number;
    createdAt: string;
}

@Component({
    selector: 'app-wallet-viewer',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTimePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>
                    Wallets
                    @if (wallets().length > 0) {
                        <span class="count">({{ wallets().length }})</span>
                    }
                </h2>
            </div>

            <div class="search-bar">
                <input
                    class="input"
                    type="text"
                    placeholder="Search by address or label..."
                    [value]="searchQuery()"
                    (input)="onSearch(toInputValue($event))" />
            </div>

            @if (loading()) {
                <p class="loading">Loading wallets...</p>
            } @else if (filteredWallets().length === 0) {
                <p class="empty">No external wallets have interacted via AlgoChat yet.</p>
            } @else {
                <div class="wallet-list">
                    @for (wallet of filteredWallets(); track wallet.address) {
                        <div class="wallet-card" [class.wallet-card--expanded]="expandedWallet() === wallet.address">
                            <div class="wallet-card__header" (click)="toggleExpand(wallet.address)">
                                <div class="wallet-card__info">
                                    <div class="wallet-card__address">
                                        {{ truncateAddress(wallet.address) }}
                                        @if (wallet.label) {
                                            <span class="wallet-card__label">{{ wallet.label }}</span>
                                        }
                                    </div>
                                    <div class="wallet-card__stats">
                                        <span class="stat">
                                            <span class="stat__icon stat__icon--in">&#x2B07;</span>
                                            {{ wallet.inboundCount }}
                                        </span>
                                        <span class="stat">
                                            <span class="stat__icon stat__icon--out">&#x2B06;</span>
                                            {{ wallet.outboundCount }}
                                        </span>
                                        <span class="stat">
                                            <span class="stat__icon stat__icon--credits">&#x26A1;</span>
                                            {{ wallet.credits }}
                                        </span>
                                        <span class="stat stat--time">
                                            {{ wallet.lastActive | relativeTime }}
                                        </span>
                                    </div>
                                </div>
                                <div class="wallet-card__actions">
                                    @if (wallet.onAllowlist) {
                                        <span class="badge badge--allowed">Allowed</span>
                                        <button
                                            class="btn btn--small btn--danger"
                                            (click)="removeFromAllowlist($event, wallet.address)">
                                            Remove
                                        </button>
                                    } @else {
                                        <button
                                            class="btn btn--small btn--primary"
                                            (click)="addToAllowlist($event, wallet.address)">
                                            Allow
                                        </button>
                                    }
                                    <button
                                        class="btn btn--small btn--grant"
                                        (click)="openGrant($event, wallet.address)">
                                        Grant
                                    </button>
                                    <span class="expand-icon">{{ expandedWallet() === wallet.address ? '&#x25B2;' : '&#x25BC;' }}</span>
                                </div>
                            </div>

                            @if (expandedWallet() === wallet.address) {
                                <div class="wallet-card__messages">
                                    @if (messagesLoading()) {
                                        <p class="loading">Loading messages...</p>
                                    } @else if (messages().length === 0) {
                                        <p class="empty">No messages found.</p>
                                    } @else {
                                        <div class="full-address">
                                            <code>{{ wallet.address }}</code>
                                        </div>
                                        <div class="message-list">
                                            @for (msg of messages(); track msg.id) {
                                                <div class="message" [class.message--in]="msg.direction === 'inbound'" [class.message--out]="msg.direction === 'outbound'" [class.message--status]="msg.direction === 'status'">
                                                    <div class="message__header">
                                                        <span class="message__dir">
                                                            @if (msg.direction === 'inbound') {
                                                                <span class="accent-cyan">IN</span>
                                                            } @else if (msg.direction === 'outbound') {
                                                                <span class="accent-magenta">OUT</span>
                                                            } @else {
                                                                <span class="accent-amber">SYS</span>
                                                            }
                                                        </span>
                                                        <span class="message__time">{{ msg.createdAt | relativeTime }}</span>
                                                        @if (msg.fee > 0) {
                                                            <span class="message__fee">{{ (msg.fee / 1000000).toFixed(4) }} ALGO</span>
                                                        }
                                                    </div>
                                                    <div class="message__content">{{ msg.content }}</div>
                                                </div>
                                            }
                                        </div>
                                        @if (messageTotal() > messages().length) {
                                            <button class="btn btn--small btn--ghost load-more" (click)="loadMoreMessages(wallet.address)">
                                                Load more ({{ messageTotal() - messages().length }} remaining)
                                            </button>
                                        }
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            }

            @if (grantAddress()) {
                <div class="modal-overlay" (click)="closeGrant()" (keydown.escape)="closeGrant()">
                    <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Grant credits">
                        <div class="modal__title">Grant Credits</div>
                        <div class="modal__address">{{ truncateAddress(grantAddress()!) }}</div>
                        <div class="modal__field">
                            <label class="modal__label">Amount</label>
                            <input class="input" type="number" min="1" step="1" placeholder="100"
                                #grantAmountInput
                                (keydown.enter)="submitGrant(grantAmountInput.value, grantRefInput.value)" />
                        </div>
                        <div class="modal__field">
                            <label class="modal__label">Reference (optional)</label>
                            <input class="input" type="text" placeholder="e.g. bonus, promo"
                                #grantRefInput
                                (keydown.enter)="submitGrant(grantAmountInput.value, grantRefInput.value)" />
                        </div>
                        <div class="modal__actions">
                            <button class="btn btn--small btn--primary"
                                [disabled]="grantBusy()"
                                (click)="submitGrant(grantAmountInput.value, grantRefInput.value)">
                                {{ grantBusy() ? 'Granting...' : 'Grant' }}
                            </button>
                            <button class="btn btn--small btn--ghost" (click)="closeGrant()">Cancel</button>
                        </div>
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .count { color: var(--text-tertiary); font-weight: 400; font-size: 0.85rem; }

        .search-bar { margin-bottom: 1.5rem; }
        .input {
            width: 100%; padding: 0.5rem 0.75rem; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius); color: var(--text-primary); font-family: inherit; font-size: 0.85rem;
        }
        .input::placeholder { color: var(--text-tertiary); }

        .loading { color: var(--text-secondary); }
        .empty { color: var(--text-tertiary); }

        .wallet-list { display: flex; flex-direction: column; gap: 0.5rem; }

        .wallet-card {
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); overflow: hidden;
            transition: border-color 0.15s;
        }
        .wallet-card:hover { border-color: var(--border-bright); }
        .wallet-card--expanded { border-color: var(--accent-cyan); }

        .wallet-card__header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 1rem; cursor: pointer; gap: 1rem;
        }
        .wallet-card__header:hover { background: var(--bg-hover); }

        .wallet-card__info { flex: 1; min-width: 0; }
        .wallet-card__address {
            font-family: monospace; font-size: 0.85rem; color: var(--text-primary);
            display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
        }
        .wallet-card__label {
            font-size: 0.75rem; color: var(--accent-cyan); font-family: inherit;
            background: rgba(0, 229, 255, 0.08); padding: 0.1rem 0.4rem; border-radius: 3px;
        }

        .wallet-card__stats {
            display: flex; gap: 1rem; margin-top: 0.4rem; font-size: 0.75rem;
            color: var(--text-secondary); flex-wrap: wrap;
        }
        .stat { display: flex; align-items: center; gap: 0.25rem; }
        .stat__icon { font-size: 0.7rem; }
        .stat__icon--in { color: var(--accent-cyan); }
        .stat__icon--out { color: var(--accent-magenta); }
        .stat__icon--credits { color: var(--accent-green); }
        .stat--time { color: var(--text-tertiary); }

        .wallet-card__actions {
            display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;
        }

        .badge {
            font-size: 0.65rem; padding: 0.15rem 0.4rem; border-radius: 3px;
            font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .badge--allowed {
            color: var(--accent-green); background: rgba(0, 255, 136, 0.1);
            border: 1px solid rgba(0, 255, 136, 0.2);
        }

        .expand-icon { color: var(--text-tertiary); font-size: 0.7rem; }

        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s; background: transparent;
        }
        .btn:disabled { opacity: 0.4; cursor: default; }
        .btn--primary { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: rgba(0, 229, 255, 0.1); box-shadow: 0 0 8px rgba(0, 229, 255, 0.2); }
        .btn--danger { color: var(--accent-red, #f44); border-color: var(--accent-red, #f44); }
        .btn--danger:hover { background: rgba(255, 68, 68, 0.1); }
        .btn--small { padding: 0.25rem 0.5rem; font-size: 0.7rem; }
        .btn--ghost { border-color: var(--border); color: var(--text-secondary); }
        .btn--ghost:hover { background: var(--bg-hover); }

        .wallet-card__messages {
            border-top: 1px solid var(--border); padding: 1rem;
            background: var(--bg-deep);
        }

        .full-address {
            font-size: 0.7rem; color: var(--text-tertiary); margin-bottom: 0.75rem;
            word-break: break-all;
        }
        .full-address code { font-family: monospace; color: var(--text-secondary); }

        .message-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 400px; overflow-y: auto; }

        .message {
            padding: 0.6rem 0.75rem; border-radius: var(--radius);
            border: 1px solid var(--border);
        }
        .message--in { border-left: 3px solid var(--accent-cyan); background: rgba(0, 229, 255, 0.03); }
        .message--out { border-left: 3px solid var(--accent-magenta); background: rgba(255, 0, 170, 0.03); }
        .message--status { border-left: 3px solid var(--accent-amber, #ffaa00); background: rgba(255, 170, 0, 0.03); }

        .message__header {
            display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem;
            font-size: 0.7rem;
        }
        .message__dir { font-weight: 700; font-size: 0.65rem; }
        .message__time { color: var(--text-tertiary); }
        .message__fee { color: var(--accent-green); }
        .accent-cyan { color: var(--accent-cyan); }
        .accent-magenta { color: var(--accent-magenta); }
        .accent-amber { color: var(--accent-amber, #ffaa00); }

        .message__content {
            font-size: 0.8rem; color: var(--text-primary); line-height: 1.6;
            white-space: pre-wrap; word-break: break-word;
        }

        .btn--grant { color: var(--accent-green); border-color: var(--accent-green); }
        .btn--grant:hover { background: rgba(0, 255, 136, 0.1); box-shadow: 0 0 8px rgba(0, 255, 136, 0.2); }

        .modal-overlay {
            position: fixed; inset: 0; z-index: 1000;
            background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(2px);
            display: flex; align-items: center; justify-content: center;
        }
        .modal {
            background: var(--bg-surface); border: 1px solid var(--accent-cyan);
            border-radius: var(--radius-lg); padding: 1.5rem; width: 360px; max-width: 90vw;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        }
        .modal__title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; }
        .modal__address {
            font-family: monospace; font-size: 0.75rem; color: var(--accent-cyan);
            margin-bottom: 1rem; word-break: break-all;
        }
        .modal__field { margin-bottom: 0.75rem; }
        .modal__label { display: block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; }
        .modal__actions { display: flex; gap: 0.5rem; margin-top: 1rem; }

        .load-more { margin-top: 0.5rem; width: 100%; }

        @media (max-width: 600px) {
            .wallet-card__header { flex-direction: column; align-items: flex-start; }
            .wallet-card__actions { margin-top: 0.5rem; }
            .wallet-card__stats { gap: 0.5rem; }
        }
    `,
})
export class WalletViewerComponent implements OnInit, OnDestroy {
    private readonly api = inject(ApiService);
    private readonly allowlistService = inject(AllowlistService);
    private readonly notifications = inject(NotificationService);
    private readonly ws = inject(WebSocketService);

    readonly wallets = signal<WalletSummary[]>([]);
    readonly loading = signal(false);
    readonly searchQuery = signal('');
    readonly expandedWallet = signal<string | null>(null);
    readonly messages = signal<WalletMessage[]>([]);
    readonly messagesLoading = signal(false);
    readonly messageTotal = signal(0);
    readonly grantAddress = signal<string | null>(null);
    readonly grantBusy = signal(false);

    readonly filteredWallets = computed(() => {
        const query = this.searchQuery().toLowerCase();
        if (!query) return this.wallets();
        return this.wallets().filter(
            (w) =>
                w.address.toLowerCase().includes(query) ||
                w.label.toLowerCase().includes(query),
        );
    });

    private wsUnsub: (() => void) | null = null;

    ngOnInit(): void {
        this.loadWallets();

        // Listen for real-time AlgoChat messages to update counts
        this.wsUnsub = this.ws.onMessage((msg) => {
            if (msg.type === 'algochat_message') {
                // Refresh wallet list when a new message arrives
                this.loadWallets();
            }
        });
    }

    ngOnDestroy(): void {
        this.wsUnsub?.();
    }

    toInputValue(event: Event): string {
        return (event.target as HTMLInputElement).value;
    }

    onSearch(query: string): void {
        this.searchQuery.set(query);
    }

    truncateAddress(address: string): string {
        if (address.length <= 16) return address;
        return `${address.slice(0, 6)}...${address.slice(-6)}`;
    }

    async loadWallets(): Promise<void> {
        this.loading.set(true);
        try {
            const result = await firstValueFrom(
                this.api.get<{ wallets: WalletSummary[] }>('/wallets/summary'),
            );
            this.wallets.set(result.wallets);
        } finally {
            this.loading.set(false);
        }
    }

    async toggleExpand(address: string): Promise<void> {
        if (this.expandedWallet() === address) {
            this.expandedWallet.set(null);
            this.messages.set([]);
            return;
        }

        this.expandedWallet.set(address);
        this.messagesLoading.set(true);
        this.messages.set([]);

        try {
            const result = await firstValueFrom(
                this.api.get<{ messages: WalletMessage[]; total: number }>(
                    `/wallets/${encodeURIComponent(address)}/messages?limit=50`,
                ),
            );
            this.messages.set(result.messages);
            this.messageTotal.set(result.total);
        } finally {
            this.messagesLoading.set(false);
        }
    }

    async loadMoreMessages(address: string): Promise<void> {
        const currentCount = this.messages().length;
        const result = await firstValueFrom(
            this.api.get<{ messages: WalletMessage[]; total: number }>(
                `/wallets/${encodeURIComponent(address)}/messages?limit=50&offset=${currentCount}`,
            ),
        );
        this.messages.update((msgs) => [...msgs, ...result.messages]);
        this.messageTotal.set(result.total);
    }

    openGrant(event: Event, address: string): void {
        event.stopPropagation();
        this.grantAddress.set(address);
    }

    closeGrant(): void {
        this.grantAddress.set(null);
    }

    async submitGrant(amountStr: string, reference: string): Promise<void> {
        const address = this.grantAddress();
        if (!address) return;
        const amount = parseInt(amountStr, 10);
        if (!amount || amount <= 0) {
            this.notifications.error('Enter a positive amount');
            return;
        }
        this.grantBusy.set(true);
        try {
            await firstValueFrom(
                this.api.post<{ ok: boolean }>(
                    `/wallets/${encodeURIComponent(address)}/credits`,
                    { amount, reference: reference.trim() || undefined },
                ),
            );
            this.notifications.success(`Granted ${amount} credits to ${address.slice(0, 8)}...`);
            this.closeGrant();
            this.loadWallets();
        } catch {
            this.notifications.error('Failed to grant credits');
        } finally {
            this.grantBusy.set(false);
        }
    }

    async addToAllowlist(event: Event, address: string): Promise<void> {
        event.stopPropagation();
        try {
            await this.allowlistService.addEntry(address);
            this.wallets.update((wallets) =>
                wallets.map((w) =>
                    w.address === address ? { ...w, onAllowlist: true } : w,
                ),
            );
        } catch {
            // Silently fail — allowlist service handles errors
        }
    }

    async removeFromAllowlist(event: Event, address: string): Promise<void> {
        event.stopPropagation();
        if (!confirm(`Remove ${address.slice(0, 8)}... from the allowlist?`)) return;
        try {
            await this.allowlistService.removeEntry(address);
            this.wallets.update((wallets) =>
                wallets.map((w) =>
                    w.address === address ? { ...w, onAllowlist: false } : w,
                ),
            );
        } catch {
            // Silently fail
        }
    }
}
