import { Injectable, signal, computed } from '@angular/core';

export type WidgetId =
    | 'metrics'
    | 'agents'
    | 'active-sessions'
    | 'spending-chart'
    | 'session-chart'
    | 'agent-usage-chart'
    | 'activity'
    | 'quick-actions'
    | 'system-status'
    | 'flock'
    | 'comparison';

export type ViewMode = 'simple' | 'developer';

export interface WidgetConfig {
    id: WidgetId;
    label: string;
    visible: boolean;
}

const STORAGE_KEY = 'corvid_widget_layout';
const VIEW_MODE_KEY = 'corvid_view_mode';

/** Widgets visible in simple mode — focused on what non-technical users need */
const SIMPLE_WIDGETS: Set<WidgetId> = new Set([
    'agents',
    'active-sessions',
    'activity',
    'quick-actions',
]);

const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: 'metrics', label: 'Metrics', visible: true },
    { id: 'agents', label: 'Agent Activity', visible: true },
    { id: 'active-sessions', label: 'Active Sessions', visible: true },
    { id: 'spending-chart', label: 'Spending Trend', visible: true },
    { id: 'session-chart', label: 'Sessions Breakdown', visible: true },
    { id: 'agent-usage-chart', label: 'Agent Usage', visible: true },
    { id: 'activity', label: 'Recent Activity', visible: true },
    { id: 'quick-actions', label: 'Quick Actions', visible: true },
    { id: 'system-status', label: 'System Status', visible: true },
    { id: 'flock', label: 'Flock Directory', visible: true },
    { id: 'comparison', label: 'Agent Comparison', visible: true },
];

@Injectable({ providedIn: 'root' })
export class WidgetLayoutService {
    /** Current view mode */
    readonly viewMode = signal<ViewMode>(this.loadViewMode());

    /** Current widget layout — order + visibility */
    readonly widgets = signal<WidgetConfig[]>(this.load());

    /** Only visible widgets, in order (respects view mode) */
    readonly visibleWidgets = computed(() => {
        const mode = this.viewMode();
        return this.widgets().filter((w) => {
            if (!w.visible) return false;
            if (mode === 'simple') return SIMPLE_WIDGETS.has(w.id);
            return true;
        });
    });

    /** Whether the customize panel is open */
    readonly customizing = signal(false);

    /** Switch between simple and developer modes */
    setViewMode(mode: ViewMode): void {
        this.viewMode.set(mode);
        this.saveViewMode(mode);
    }

    /** Toggle between modes */
    toggleViewMode(): void {
        this.setViewMode(this.viewMode() === 'simple' ? 'developer' : 'simple');
    }

    /** Move a widget from one index to another */
    moveWidget(fromIndex: number, toIndex: number): void {
        const list = [...this.widgets()];
        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);
        this.widgets.set(list);
        this.save(list);
    }

    /** Toggle widget visibility */
    toggleWidget(id: WidgetId): void {
        const list = this.widgets().map((w) =>
            w.id === id ? { ...w, visible: !w.visible } : w,
        );
        this.widgets.set(list);
        this.save(list);
    }

    /** Reset to defaults */
    resetToDefaults(): void {
        const defaults = DEFAULT_WIDGETS.map((w) => ({ ...w }));
        this.widgets.set(defaults);
        this.save(defaults);
        this.setViewMode('developer');
    }

    private load(): WidgetConfig[] {
        const stored = this.loadStored();
        if (stored) return stored;
        return DEFAULT_WIDGETS.map((w) => ({ ...w }));
    }

    private loadStored(): WidgetConfig[] | null {
        if (typeof localStorage === 'undefined') return null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) return null;
            if (!parsed.every((w: unknown) =>
                typeof w === 'object' && w !== null && 'id' in w && 'label' in w && 'visible' in w,
            )) return null;
            return parsed as WidgetConfig[];
        } catch {
            return null;
        }
    }

    private save(widgets: WidgetConfig[]): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    }

    private loadViewMode(): ViewMode {
        if (typeof localStorage === 'undefined') return 'simple';
        const stored = localStorage.getItem(VIEW_MODE_KEY);
        if (stored === 'simple' || stored === 'developer') return stored;
        return 'simple';
    }

    private saveViewMode(mode: ViewMode): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(VIEW_MODE_KEY, mode);
    }
}
