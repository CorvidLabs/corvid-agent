import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BrainViewerComponent } from './brain-viewer.component';
import { ApiService } from '../../core/services/api.service';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { of, throwError } from 'rxjs';

// ─── Test data factories ────────────────────────────────────────────────────

function createStats(overrides: Record<string, unknown> = {}) {
    return {
        totalMemories: 42,
        byTier: { longterm: 30, shortterm: 12 },
        byStatus: { confirmed: 35, pending: 5, failed: 2 },
        byCategory: { general: 20, system: 15, user: 7 },
        byAgent: [
            { agentId: 'agent-1', agentName: 'CorvidAgent', total: 30, longterm: 20, shortterm: 10 },
            { agentId: 'agent-2', agentName: 'TestBot', total: 12, longterm: 10, shortterm: 2 },
        ],
        oldestMemory: '2026-01-01T00:00:00Z',
        newestMemory: '2026-03-17T12:00:00Z',
        averageDecayScore: 0.72,
        ...overrides,
    };
}

function createSyncStatus(overrides: Record<string, unknown> = {}) {
    return {
        isRunning: true,
        pendingCount: 3,
        failedCount: 1,
        lastSyncAt: '2026-03-17T11:30:00Z',
        syncIntervalMs: 30000,
        recentErrors: [],
        ...overrides,
    };
}

function createMemory(overrides: Record<string, unknown> = {}) {
    return {
        id: 'mem-1',
        agentId: 'agent-1',
        key: 'test-memory-key',
        content: 'This is a test memory content.',
        tier: 'longterm' as const,
        status: 'confirmed',
        txid: 'ABCD1234TXID',
        category: 'general',
        categoryConfidence: 0.95,
        decayScore: 0.85,
        createdAt: '2026-03-15T10:00:00Z',
        updatedAt: '2026-03-17T10:00:00Z',
        ...overrides,
    };
}

function createListResponse(entries = [createMemory()], total = 1) {
    return { entries, total, limit: 50, offset: 0 };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('BrainViewerComponent', () => {
    let fixture: ComponentFixture<BrainViewerComponent>;
    let hostEl: HTMLElement;
    let getMock: ReturnType<typeof vi.fn>;

    function mockApiResponses(
        stats = createStats(),
        syncStatus = createSyncStatus(),
        list = createListResponse(),
    ) {
        getMock.mockImplementation((path: string) => {
            if (path.includes('/dashboard/memories/stats') && !path.includes('observations')) return of(stats);
            if (path.includes('/dashboard/memories/sync-status')) return of(syncStatus);
            if (path.includes('/dashboard/memories/observations/stats')) return of({ agents: [], totalActive: 0, graduationCandidates: 0 });
            if (path.includes('/dashboard/memories/observations')) return of({ observations: [], total: 0 });
            if (path.includes('/dashboard/memories')) return of(list);
            return of(null);
        });
    }

    /** Flush microtasks so Promise.all inside loadAll() resolves. */
    function flush(): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, 0));
    }

    async function createComponent(): Promise<ComponentFixture<BrainViewerComponent>> {
        fixture = TestBed.createComponent(BrainViewerComponent);
        fixture.detectChanges();
        // ngOnInit fires loadAll() which uses Promise.all + firstValueFrom — flush microtasks
        await flush();
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        getMock = vi.fn();
        mockApiResponses();

        TestBed.configureTestingModule({
            imports: [BrainViewerComponent],
            providers: [
                provideRouter([]),
                { provide: ApiService, useValue: { get: getMock } },
            ],
        });
    });

    afterEach(() => {
        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Basic rendering
    // ──────────────────────────────────────────────
    it('should render page header', async () => {
        await createComponent();
        const h2 = hostEl.querySelector('h2');
        expect(h2).toBeTruthy();
        expect(h2!.textContent).toContain('Brain Viewer');
    });

    it('should call API for stats, sync status, and memories on init', async () => {
        await createComponent();
        expect(getMock).toHaveBeenCalledWith('/dashboard/memories/stats');
        expect(getMock).toHaveBeenCalledWith('/dashboard/memories/sync-status');
        expect(getMock).toHaveBeenCalledWith('/dashboard/memories?limit=50&offset=0');
    });

    it('should hide loading indicator after data loads', async () => {
        await createComponent();
        const loading = hostEl.querySelector('.loading');
        expect(loading).toBeFalsy();
    });

    // ──────────────────────────────────────────────
    // Sync banner
    // ──────────────────────────────────────────────
    it('should show sync active banner when running', async () => {
        await createComponent();
        const banner = hostEl.querySelector('.sync-banner');
        expect(banner).toBeTruthy();
        expect(banner!.classList.contains('sync-banner--ok')).toBe(true);
        expect(banner!.textContent).toContain('Sync Active');
    });

    it('should show sync inactive banner when not running', async () => {
        mockApiResponses(createStats(), createSyncStatus({ isRunning: false }));
        await createComponent();
        const banner = hostEl.querySelector('.sync-banner');
        expect(banner).toBeTruthy();
        expect(banner!.classList.contains('sync-banner--warn')).toBe(true);
        expect(banner!.textContent).toContain('Sync Inactive');
    });

    it('should display pending count in sync banner', async () => {
        mockApiResponses(createStats(), createSyncStatus({ pendingCount: 7 }));
        await createComponent();
        const banner = hostEl.querySelector('.sync-banner');
        expect(banner!.textContent).toContain('7 pending');
    });

    it('should display failed count in sync banner', async () => {
        mockApiResponses(createStats(), createSyncStatus({ failedCount: 3 }));
        await createComponent();
        const banner = hostEl.querySelector('.sync-banner');
        expect(banner!.textContent).toContain('3 failed');
    });

    // ──────────────────────────────────────────────
    // Stats cards
    // ──────────────────────────────────────────────
    it('should render all 7 stat cards', async () => {
        await createComponent();
        const cards = hostEl.querySelectorAll('.stat-card');
        // 7 base cards + 1 observations card (shown when obsStats is non-null)
        expect(cards.length).toBeGreaterThanOrEqual(7);
    });

    it('should display total memories count', async () => {
        await createComponent();
        const cards = hostEl.querySelectorAll('.stat-card');
        const totalCard = cards[0];
        expect(totalCard.querySelector('.stat-card__value')!.textContent).toContain('42');
    });

    it('should display longterm and shortterm counts', async () => {
        await createComponent();
        const ltValue = hostEl.querySelector('.stat-card__value--longterm');
        const stValue = hostEl.querySelector('.stat-card__value--shortterm');
        expect(ltValue!.textContent).toContain('30');
        expect(stValue!.textContent).toContain('12');
    });

    it('should display status breakdown counts', async () => {
        await createComponent();
        expect(hostEl.querySelector('.stat-card__value--confirmed')!.textContent).toContain('35');
        expect(hostEl.querySelector('.stat-card__value--pending')!.textContent).toContain('5');
        expect(hostEl.querySelector('.stat-card__value--failed')!.textContent).toContain('2');
    });

    it('should display average decay score', async () => {
        await createComponent();
        const decay = hostEl.querySelector('.stat-card__value--decay');
        expect(decay!.textContent).toContain('0.72');
    });

    it('should show dash when average decay is null', async () => {
        mockApiResponses(createStats({ averageDecayScore: null }));
        await createComponent();
        const decay = hostEl.querySelector('.stat-card__value--decay');
        expect(decay!.textContent).toContain('—');
    });

    // ──────────────────────────────────────────────
    // Tier breakdown bar
    // ──────────────────────────────────────────────
    it('should render tier breakdown bar with LT and ST segments', async () => {
        await createComponent();
        const ltSeg = hostEl.querySelector('.tier-bar__segment--longterm');
        const stSeg = hostEl.querySelector('.tier-bar__segment--shortterm');
        expect(ltSeg).toBeTruthy();
        expect(stSeg).toBeTruthy();
        expect(ltSeg!.textContent).toContain('LT (30)');
        expect(stSeg!.textContent).toContain('ST (12)');
    });

    it('should not render tier bar when total is 0', async () => {
        mockApiResponses(createStats({ totalMemories: 0, byTier: { longterm: 0, shortterm: 0 } }));
        await createComponent();
        expect(hostEl.querySelector('.tier-bar')).toBeFalsy();
    });

    // ──────────────────────────────────────────────
    // Agent table
    // ──────────────────────────────────────────────
    it('should render per-agent rows', async () => {
        await createComponent();
        const rows = hostEl.querySelectorAll('.agent-table__row');
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('CorvidAgent');
        expect(rows[1].textContent).toContain('TestBot');
    });

    it('should filter by agent when clicking row', async () => {
        await createComponent();
        getMock.mockClear();
        const row = hostEl.querySelector('.agent-table__row') as HTMLElement;
        row.click();
        fixture.detectChanges();
        // Should have called loadMemories with agentId param
        expect(getMock).toHaveBeenCalledWith(
            expect.stringContaining('agentId=agent-1'),
        );
    });

    // ──────────────────────────────────────────────
    // Category chips
    // ──────────────────────────────────────────────
    it('should render category chips sorted by count', async () => {
        await createComponent();
        const chips = hostEl.querySelectorAll('.category-chips .chip');
        expect(chips.length).toBe(3);
        // Sorted: general(20), system(15), user(7)
        expect(chips[0].textContent).toContain('general');
        expect(chips[1].textContent).toContain('system');
        expect(chips[2].textContent).toContain('user');
    });

    it('should toggle category filter on chip click', async () => {
        await createComponent();
        getMock.mockClear();
        const chip = hostEl.querySelector('.category-chips .chip') as HTMLElement;
        chip.click();
        fixture.detectChanges();
        expect(getMock).toHaveBeenCalledWith(
            expect.stringContaining('category=general'),
        );
    });

    // ──────────────────────────────────────────────
    // Filter chips (tier & status)
    // ──────────────────────────────────────────────
    it('should render tier filter chips', async () => {
        await createComponent();
        const chips = hostEl.querySelectorAll('.filter-chips .chip');
        // First row: All, Long-term, Short-term
        expect(chips[0].textContent).toContain('All');
        expect(chips[1].textContent).toContain('Long-term');
        expect(chips[2].textContent).toContain('Short-term');
    });

    it('should filter by tier when clicking Long-term chip', async () => {
        await createComponent();
        getMock.mockClear();
        const ltChip = hostEl.querySelectorAll('.filter-chips .chip')[1] as HTMLElement;
        ltChip.click();
        fixture.detectChanges();
        expect(getMock).toHaveBeenCalledWith(
            expect.stringContaining('tier=longterm'),
        );
    });

    it('should filter by status when clicking Confirmed chip', async () => {
        await createComponent();
        getMock.mockClear();
        const statusChips = hostEl.querySelectorAll('.filter-chips')[1];
        const confirmedChip = statusChips.querySelectorAll('.chip')[1] as HTMLElement;
        confirmedChip.click();
        fixture.detectChanges();
        expect(getMock).toHaveBeenCalledWith(
            expect.stringContaining('status=confirmed'),
        );
    });

    // ──────────────────────────────────────────────
    // Memory list
    // ──────────────────────────────────────────────
    it('should display memory count', async () => {
        await createComponent();
        const count = hostEl.querySelector('.list-header__count');
        expect(count!.textContent).toContain('1 memories');
    });

    it('should render memory cards', async () => {
        const memories = [
            createMemory({ id: 'mem-1', key: 'first-key' }),
            createMemory({ id: 'mem-2', key: 'second-key', tier: 'shortterm' }),
        ];
        mockApiResponses(createStats(), createSyncStatus(), createListResponse(memories, 2));
        await createComponent();
        const cards = hostEl.querySelectorAll('.memory-card');
        expect(cards).toHaveLength(2);
    });

    it('should display tier badge, key, and status on memory card', async () => {
        await createComponent();
        const card = hostEl.querySelector('.memory-card')!;
        expect(card.querySelector('.memory-card__tier')!.textContent).toContain('LT');
        expect(card.querySelector('.memory-card__key')!.textContent).toContain('test-memory-key');
        expect(card.querySelector('.memory-card__status')!.textContent).toContain('confirmed');
    });

    it('should display category tag on memory card', async () => {
        await createComponent();
        const cat = hostEl.querySelector('.memory-card__category');
        expect(cat).toBeTruthy();
        expect(cat!.textContent).toContain('general');
    });

    it('should show ST badge for shortterm memories', async () => {
        mockApiResponses(
            createStats(),
            createSyncStatus(),
            createListResponse([createMemory({ tier: 'shortterm' })]),
        );
        await createComponent();
        const tier = hostEl.querySelector('.memory-card__tier');
        expect(tier!.textContent).toContain('ST');
        expect(tier!.getAttribute('data-tier')).toBe('shortterm');
    });

    // ──────────────────────────────────────────────
    // Expand/collapse
    // ──────────────────────────────────────────────
    it('should not show detail by default', async () => {
        await createComponent();
        expect(hostEl.querySelector('.memory-card__detail')).toBeFalsy();
    });

    it('should expand memory detail on click', async () => {
        await createComponent();
        const card = hostEl.querySelector('.memory-card') as HTMLElement;
        card.click();
        fixture.detectChanges();
        const detail = hostEl.querySelector('.memory-card__detail');
        expect(detail).toBeTruthy();
        expect(detail!.textContent).toContain('mem-1');
        expect(detail!.textContent).toContain('agent-1');
        expect(detail!.textContent).toContain('ABCD1234TXID');
    });

    it('should collapse detail on second click', async () => {
        await createComponent();
        const card = hostEl.querySelector('.memory-card') as HTMLElement;
        card.click();
        fixture.detectChanges();
        expect(hostEl.querySelector('.memory-card__detail')).toBeTruthy();
        card.click();
        fixture.detectChanges();
        expect(hostEl.querySelector('.memory-card__detail')).toBeFalsy();
    });

    it('should show full content in expanded detail', async () => {
        await createComponent();
        const card = hostEl.querySelector('.memory-card') as HTMLElement;
        card.click();
        fixture.detectChanges();
        const pre = hostEl.querySelector('.detail-pre');
        expect(pre!.textContent).toContain('This is a test memory content.');
    });

    // ──────────────────────────────────────────────
    // Empty state
    // ──────────────────────────────────────────────
    it('should show empty state when no memories returned', async () => {
        mockApiResponses(createStats(), createSyncStatus(), createListResponse([], 0));
        await createComponent();
        const empty = hostEl.querySelector('.empty-state');
        expect(empty).toBeTruthy();
        expect(empty!.textContent).toContain('No memories found');
    });

    // ──────────────────────────────────────────────
    // Pagination
    // ──────────────────────────────────────────────
    it('should disable Prev button on first page', async () => {
        await createComponent();
        const prevBtn = hostEl.querySelector('.pagination .btn--sm') as HTMLButtonElement;
        expect(prevBtn.disabled).toBe(true);
    });

    it('should disable Next button when on last page', async () => {
        mockApiResponses(createStats(), createSyncStatus(), createListResponse([createMemory()], 1));
        await createComponent();
        const btns = hostEl.querySelectorAll('.pagination .btn--sm');
        const nextBtn = btns[1] as HTMLButtonElement;
        expect(nextBtn.disabled).toBe(true);
    });

    it('should enable Next when total > page size', async () => {
        const memories = Array.from({ length: 50 }, (_, i) => createMemory({ id: `mem-${i}` }));
        mockApiResponses(createStats(), createSyncStatus(), createListResponse(memories, 75));
        await createComponent();
        const btns = hostEl.querySelectorAll('.pagination .btn--sm');
        const nextBtn = btns[1] as HTMLButtonElement;
        expect(nextBtn.disabled).toBe(false);
    });

    it('should paginate forward on Next click', async () => {
        const memories = Array.from({ length: 50 }, (_, i) => createMemory({ id: `mem-${i}` }));
        mockApiResponses(createStats(), createSyncStatus(), createListResponse(memories, 75));
        await createComponent();
        getMock.mockClear();
        const btns = hostEl.querySelectorAll('.pagination .btn--sm');
        (btns[1] as HTMLElement).click();
        fixture.detectChanges();
        expect(getMock).toHaveBeenCalledWith(
            expect.stringContaining('offset=50'),
        );
    });

    // ──────────────────────────────────────────────
    // Decay bar helper
    // ──────────────────────────────────────────────
    it('should render full decay bar for score 1.0', async () => {
        await createComponent();
        const result = fixture.componentInstance.decayBar(1.0);
        expect(result).toBe('\u2588\u2588\u2588\u2588\u2588\u2588');
    });

    it('should render empty decay bar for score 0.0', async () => {
        await createComponent();
        const result = fixture.componentInstance.decayBar(0.0);
        expect(result).toBe('\u2591\u2591\u2591\u2591\u2591\u2591');
    });

    it('should render partial decay bar for score 0.5', async () => {
        await createComponent();
        const result = fixture.componentInstance.decayBar(0.5);
        expect(result).toBe('\u2588\u2588\u2588\u2591\u2591\u2591');
    });

    // ──────────────────────────────────────────────
    // Sync errors section
    // ──────────────────────────────────────────────
    it('should not render errors section when no errors', async () => {
        await createComponent();
        expect(hostEl.querySelector('.section--errors')).toBeFalsy();
    });

    it('should render sync errors when present', async () => {
        mockApiResponses(createStats(), createSyncStatus({
            recentErrors: [
                { memoryId: 'mem-x', key: 'failed-key', error: 'Network timeout', failedAt: '2026-03-17T10:00:00Z' },
            ],
        }));
        await createComponent();
        const errSection = hostEl.querySelector('.section--errors');
        expect(errSection).toBeTruthy();
        expect(errSection!.textContent).toContain('failed-key');
        expect(errSection!.textContent).toContain('Network timeout');
    });

    // ──────────────────────────────────────────────
    // Error handling
    // ──────────────────────────────────────────────
    it('should handle API errors gracefully and stop loading', async () => {
        getMock.mockReturnValue(throwError(() => new Error('API down')));
        await createComponent();
        // Should not crash — loading indicator should be gone
        expect(hostEl.querySelector('.loading')).toBeFalsy();
        // Empty state should show
        const empty = hostEl.querySelector('.empty-state');
        expect(empty).toBeTruthy();
    });

    // ──────────────────────────────────────────────
    // Agent filter chip
    // ──────────────────────────────────────────────
    it('should show agent filter chip when agent selected', async () => {
        await createComponent();
        // Click agent row to set filter
        const row = hostEl.querySelector('.agent-table__row') as HTMLElement;
        row.click();
        fixture.detectChanges();
        const clearChip = hostEl.querySelector('.chip--clear');
        expect(clearChip).toBeTruthy();
        expect(clearChip!.textContent).toContain('agent-1');
    });

    it('should clear agent filter when clicking clear chip', async () => {
        await createComponent();
        // Set agent filter
        const row = hostEl.querySelector('.agent-table__row') as HTMLElement;
        row.click();
        fixture.detectChanges();
        getMock.mockClear();
        // Clear it
        const clearChip = hostEl.querySelector('.chip--clear') as HTMLElement;
        clearChip.click();
        fixture.detectChanges();
        // Should reload without agentId
        expect(getMock).toHaveBeenCalledWith(
            expect.not.stringContaining('agentId'),
        );
    });

    // ──────────────────────────────────────────────
    // Search
    // ──────────────────────────────────────────────
    it('should render search input', async () => {
        await createComponent();
        const input = hostEl.querySelector('.search-input') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.placeholder).toBe('Search memories...');
    });
});
