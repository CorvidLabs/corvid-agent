import { Injectable, signal, computed } from '@angular/core';

export interface ChatTab {
    sessionId: string;
    label: string;
    status: string;
    agentName?: string;
}

const STORAGE_KEY = 'corvid_chat_tabs';
const MAX_TABS = 12;

@Injectable({ providedIn: 'root' })
export class ChatTabsService {
    readonly tabs = signal<ChatTab[]>(this.loadTabs());
    readonly activeSessionId = signal<string | null>(null);

    readonly activeTab = computed(() => {
        const id = this.activeSessionId();
        return this.tabs().find((t) => t.sessionId === id) ?? null;
    });

    openTab(sessionId: string, label: string, status = 'idle', agentName?: string, setActive = true): void {
        this.tabs.update((tabs) => {
            const existing = tabs.find((t) => t.sessionId === sessionId);
            if (existing) {
                return tabs.map((t) =>
                    t.sessionId === sessionId ? { ...t, label, status, agentName: agentName || t.agentName } : t,
                );
            }
            const newTabs = [...tabs, { sessionId, label, status, agentName }];
            // Evict oldest if over limit
            if (newTabs.length > MAX_TABS) newTabs.shift();
            return newTabs;
        });
        if (setActive) {
            this.activeSessionId.set(sessionId);
        }
        this.saveTabs();
    }

    closeTab(sessionId: string): string | null {
        let nextId: string | null = null;
        this.tabs.update((tabs) => {
            const idx = tabs.findIndex((t) => t.sessionId === sessionId);
            const filtered = tabs.filter((t) => t.sessionId !== sessionId);

            // If closing the active tab, switch to adjacent
            if (this.activeSessionId() === sessionId && filtered.length > 0) {
                const nextIdx = Math.min(idx, filtered.length - 1);
                nextId = filtered[nextIdx].sessionId;
            }
            return filtered;
        });
        if (nextId) {
            this.activeSessionId.set(nextId);
        } else if (this.tabs().length === 0) {
            this.activeSessionId.set(null);
        }
        this.saveTabs();
        return nextId;
    }

    updateTabStatus(sessionId: string, status: string): void {
        this.tabs.update((tabs) =>
            tabs.map((t) => (t.sessionId === sessionId ? { ...t, status } : t)),
        );
        this.saveTabs();
    }

    updateTabLabel(sessionId: string, label: string): void {
        this.tabs.update((tabs) =>
            tabs.map((t) => (t.sessionId === sessionId ? { ...t, label } : t)),
        );
        this.saveTabs();
    }

    /** Switch to a tab by 0-based index. Returns the sessionId or null if out of range. */
    switchToTabByIndex(index: number): string | null {
        const current = this.tabs();
        if (index < 0 || index >= current.length) return null;
        const tab = current[index];
        this.activeSessionId.set(tab.sessionId);
        return tab.sessionId;
    }

    /** Switch to the last tab (Cmd+9 convention). */
    switchToLastTab(): string | null {
        const current = this.tabs();
        if (current.length === 0) return null;
        const tab = current[current.length - 1];
        this.activeSessionId.set(tab.sessionId);
        return tab.sessionId;
    }

    private saveTabs(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tabs()));
        } catch { /* quota exceeded */ }
    }

    private loadTabs(): ChatTab[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        } catch { /* corrupt data */ }
        return [];
    }
}
