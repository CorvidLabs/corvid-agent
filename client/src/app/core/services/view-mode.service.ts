import { Injectable, signal } from '@angular/core';
import type { ViewMode } from '../../shared/components/view-mode-toggle.component';

const STORAGE_PREFIX = 'view_mode_';

/**
 * Persists the user's Basic/3D view preference per section.
 * Falls back to 'basic' for accessibility.
 */
@Injectable({ providedIn: 'root' })
export class ViewModeService {
    private readonly modes = new Map<string, ReturnType<typeof signal<ViewMode>>>();

    /** Get a reactive signal for the view mode of a given section. */
    getMode(section: string): ReturnType<typeof signal<ViewMode>> {
        if (!this.modes.has(section)) {
            this.modes.set(section, signal<ViewMode>(this.load(section)));
        }
        return this.modes.get(section)!;
    }

    /** Set and persist the view mode for a section. */
    setMode(section: string, mode: ViewMode): void {
        this.getMode(section).set(mode);
        this.save(section, mode);
    }

    private load(section: string): ViewMode {
        if (typeof localStorage === 'undefined') return 'basic';
        const stored = localStorage.getItem(STORAGE_PREFIX + section);
        return stored === '3d' ? '3d' : 'basic';
    }

    private save(section: string, mode: ViewMode): void {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_PREFIX + section, mode);
        }
    }
}
