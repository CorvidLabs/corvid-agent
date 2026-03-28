import { Injectable, signal, computed } from '@angular/core';

export type WidgetId =
    | 'metrics'
    | 'agents'
    | 'active-sessions'
    | 'activity'
    | 'quick-actions'
    | 'system-status';

export interface WidgetConfig {
    id: WidgetId;
    label: string;
    visible: boolean;
}

const STORAGE_KEY = 'corvid_widget_layout';

const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: 'metrics', label: 'Metrics', visible: true },
    { id: 'agents', label: 'Agent Activity', visible: true },
    { id: 'active-sessions', label: 'Active Sessions', visible: true },
    { id: 'activity', label: 'Recent Activity', visible: true },
    { id: 'quick-actions', label: 'Quick Actions', visible: true },
    { id: 'system-status', label: 'System Status', visible: true },
];

/** Valid widget IDs for migration from old layouts */
const VALID_IDS = new Set<string>(DEFAULT_WIDGETS.map((w) => w.id));

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
            // Filter out removed widgets from old layouts
            const filtered = (parsed as WidgetConfig[]).filter((w) => VALID_IDS.has(w.id));
            // Add any new widgets that weren't in the stored layout
            for (const def of DEFAULT_WIDGETS) {
                if (!filtered.some((w) => w.id === def.id)) {
                    filtered.push({ ...def });
                }
            }
            return filtered.length > 0 ? filtered : null;
        } catch {
            return null;
        }
    }

    private save(widgets: WidgetConfig[]): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    }
}
