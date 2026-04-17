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
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
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
    imports: [RelativeTimePipe, EmptyStateComponent, SkeletonComponent],
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
                <app-skeleton variant="card" [count]="3" />
            } @else if (filteredWallets().length === 0) {
                <app-empty-state
                    icon="  [===]\n  | $ |\n  [===]"
                    title="No wallets detected."
                    description="External wallets will appear here when they interact with your agents via AlgoChat."
                    actionLabel="View Settings"
                    actionRoute="/settings"
                    actionAriaLabel="Check AlgoChat settings" />
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
                                    <span class="expand-icon section-chevron" [class.section-chevron--open]="expandedWallet() === wallet.address">&#9654;</span>
                                </div>
                            </div>

                            @if (expandedWallet() === wallet.address) {
                                <div class="wallet-card__messages">
                                    @if (messagesLoading()) {
                                        <app-skeleton variant="line" [count]="3" />
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
        .page { padding: clamp(var(--space-3), 2vw, var(--space-6)); }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); flex-wrap: wrap; gap: var(--space-3); }
        .page__header h2 { margin: 0; color: var(--text-primary); font-size: var(--text-xl); }
        .count { color: var(--text-tertiary); font-weight: 400; font-size: var(--text-base); }

        .search-bar { margin-bottom: var(--space-5); }
        .input {
            width: 100%; padding: var(--space-3) var(--space-4); background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); color: var(--text-primary); font-family: inherit; font-size: var(--text-base);
            min-height: 48px;
            transition: border-color var(--transition-fast), box-shadow var(--transition-base);
        }
        .input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .input::placeholder { color: var(--text-tertiary); }

        .loading { color: var(--text-secondary); }
        .empty { color: var(--text-tertiary); }

        .wallet-list { display: flex; flex-direction: column; gap: var(--space-4); }

        .wallet-card {
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); overflow: hidden;
            transition: border-color var(--transition-fast), transform var(--transition-base), box-shadow var(--transition-base);
        }
        .wallet-card:hover { border-color: var(--border-bright); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); }
        .wallet-card--expanded { border-color: var(--accent-cyan); transform: none; box-shadow: 0 0 0 1px var(--accent-cyan), 0 4px 20px var(--accent-cyan-wash); }

        .wallet-card__header {
            display: flex; align-items: center; justify-content: space-between;
            padding: var(--space-4); cursor: pointer; gap: var(--space-4);
        }
        .wallet-card__header:hover { background: var(--bg-hover); }

        .wallet-card__info { flex: 1; min-width: 0; }
        .wallet-card__address {
            font-family: var(--font-mono); font-size: var(--text-base); color: var(--text-primary);
            display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
        }
        .wallet-card__label {
            font-size: var(--text-sm); color: var(--accent-cyan); font-family: inherit;
            background: var(--accent-cyan-wash); padding: 0.25rem 0.625rem; border-radius: var(--radius);
        }

        .wallet-card__stats {
            display: flex; gap: var(--space-4); margin-top: var(--space-2); font-size: var(--text-sm);
            color: var(--text-secondary); flex-wrap: wrap;
        }
        .stat { display: flex; align-items: center; gap: var(--space-1); }
        .stat__icon { font-size: var(--text-sm); }
        .stat__icon--in { color: var(--accent-cyan); }
        .stat__icon--out { color: var(--accent-magenta); }
        .stat__icon--credits { color: var(--accent-green); }
        .stat--time { color: var(--text-tertiary); }

        .wallet-card__actions {
            display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0;
        }

        .badge {
            font-size: var(--text-xs); padding: 0.25rem 0.625rem; border-radius: var(--radius);
            font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .badge--allowed {
            color: var(--accent-green); background: var(--accent-green-tint);
            border: 1px solid var(--accent-green-mid);
        }

        .expand-icon { color: var(--text-tertiary); font-size: var(--text-sm); }

        .btn {
            padding: var(--space-3) var(--space-5); border-radius: var(--radius); font-size: var(--text-sm); font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s; background: transparent; min-height: 44px;
        }
        .btn:disabled { opacity: 0.4; cursor: default; }
        .btn--primary { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: var(--accent-cyan-tint); box-shadow: 0 0 8px var(--accent-cyan-mid); }
        .btn--danger { color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: rgba(255, 68, 68, 0.1); }
        .btn--small { padding: var(--space-2) var(--space-3); font-size: var(--text-xs); min-height: 40px; }
        .btn--ghost { border-color: var(--border); color: var(--text-secondary); }
        .btn--ghost:hover { background: var(--bg-hover); }

        .wallet-card__messages {
            border-top: 1px solid var(--border); padding: clamp(var(--space-3), 2vw, var(--space-5));
            background: var(--bg-deep);
            animation: expandReveal 0.3s ease-out;
        }

        .full-address {
            font-size: var(--text-sm); color: var(--text-tertiary); margin-bottom: var(--space-3);
            word-break: break-all;
        }
        .full-address code { font-family: var(--font-mono); color: var(--text-secondary); }

        .message-list { display: flex; flex-direction: column; gap: var(--space-3); max-height: 400px; overflow-y: auto; }

        .message {
            padding: var(--space-3) var(--space-4); border-radius: var(--radius-lg);
            border: 1px solid var(--border);
            transition: background var(--transition-fast), transform var(--transition-fast);
        }
        .message:hover { transform: translateX(2px); }
        .message--in { border-left: 3px solid var(--accent-cyan); background: var(--accent-cyan-faint); }
        .message--out { border-left: 3px solid var(--accent-magenta); background: var(--accent-magenta-subtle); }
        .message--status { border-left: 3px solid var(--accent-amber); background: rgba(255, 170, 0, 0.03); }

        .message__header {
            display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1);
            font-size: var(--text-sm);
        }
        .message__dir { font-weight: 700; font-size: var(--text-xs); }
        .message__time { color: var(--text-tertiary); }
        .message__fee { color: var(--accent-green); }
        .accent-cyan { color: var(--accent-cyan); }
        .accent-magenta { color: var(--accent-magenta); }
        .accent-amber { color: var(--accent-amber); }

        .message__content {
            font-size: var(--text-base); color: var(--text-primary); line-height: var(--leading-relaxed);
            white-space: pre-wrap; word-break: break-word;
        }

        .btn--grant { color: var(--accent-green); border-color: var(--accent-green); }
        .btn--grant:hover { background: var(--accent-green-tint); box-shadow: 0 0 8px var(--accent-green-mid); }

        .modal-overlay {
            position: fixed; inset: 0; z-index: 1000;
            background: var(--overlay-heavy); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            animation: fadeIn var(--transition-base) ease-out;
        }
        .modal {
            background: var(--bg-surface); border: 1px solid var(--accent-cyan);
            border-radius: var(--radius-xl); padding: clamp(var(--space-4), 3vw, var(--space-6)); width: 420px; max-width: 90vw;
            box-shadow: 0 8px 32px var(--overlay), 0 0 0 1px var(--accent-cyan-tint);
            animation: modalSlideIn 0.2s ease-out;
        }
        @keyframes modalSlideIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .modal__title { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-1); }
        .modal__address {
            font-family: var(--font-mono); font-size: var(--text-xs); color: var(--accent-cyan);
            margin-bottom: var(--space-4); word-break: break-all;
        }
        .modal__field { margin-bottom: var(--space-3); }
        .modal__label { display: block; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: var(--space-1); }
        .modal__actions { display: flex; gap: var(--space-3); margin-top: var(--space-4); }

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
