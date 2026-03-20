import { Injectable, signal, computed } from '@angular/core';

export type WidgetId =
    | 'metrics'
    | 'agents'
    | 'spending-chart'
    | 'session-chart'
    | 'agent-usage-chart'
    | 'activity'
    | 'quick-actions'
    | 'system-status'
    | 'flock'
    | 'comparison';

export interface WidgetConfig {
    id: WidgetId;
    label: string;
    visible: boolean;
}

const STORAGE_KEY = 'corvid_widget_layout';

/** Default widgets — all available, sensible order */
const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: 'metrics', label: 'Metrics', visible: true },
    { id: 'agents', label: 'Agents', visible: true },
    { id: 'activity', label: 'Recent Activity', visible: true },
    { id: 'quick-actions', label: 'Quick Actions', visible: true },
    { id: 'spending-chart', label: 'Spending Trend', visible: true },
    { id: 'session-chart', label: 'Sessions Breakdown', visible: true },
    { id: 'agent-usage-chart', label: 'Agent Usage', visible: true },
    { id: 'system-status', label: 'System Status', visible: true },
    { id: 'flock', label: 'Flock Directory', visible: true },
    { id: 'comparison', label: 'Agent Comparison', visible: true },
];

@Injectable({ providedIn: 'root' })
export class WidgetLayoutService {
    /** Current widget layout — order + visibility */
    readonly widgets = signal<WidgetConfig[]>(this.load());

    /** Only visible widgets, in order */
    readonly visibleWidgets = computed(() =>
        this.widgets().filter((w) => w.visible),
    );

    /** Whether the customize panel is open */
    readonly customizing = signal(false);

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
    }

    private load(): WidgetConfig[] {
        const stored = this.loadStored();
        if (stored) {
            // Merge: keep stored order/visibility but add any new widgets from defaults
            const storedIds = new Set(stored.map((s) => s.id));
            const merged = [...stored];
            for (const d of DEFAULT_WIDGETS) {
                if (!storedIds.has(d.id)) {
                    merged.push({ ...d });
                }
            }
            return merged;
        }
        return DEFAULT_WIDGETS.map((w) => ({ ...w }));
    }

    private loadStored(): WidgetConfig[] | null {
        if (typeof localStorage === 'undefined') return null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) return null;
            // Validate shape
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
}
