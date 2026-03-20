import { Injectable, signal, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';

export interface ShortcutEntry {
    keys: string;
    description: string;
    category: string;
}

const SHORTCUTS: ShortcutEntry[] = [
    { keys: 'Cmd+K', description: 'Open command palette', category: 'General' },
    { keys: '?', description: 'Toggle shortcuts overlay', category: 'General' },
    { keys: 'Esc', description: 'Close modal / overlay', category: 'General' },
    { keys: 'n', description: 'New conversation', category: 'Navigation' },
    { keys: 'g d', description: 'Go to Chat Home', category: 'Navigation' },
    { keys: 'g a', description: 'Go to Agents', category: 'Navigation' },
    { keys: 'g s', description: 'Go to Sessions', category: 'Navigation' },
    { keys: 'g w', description: 'Go to Work Tasks', category: 'Navigation' },
];

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService implements OnDestroy {
    private readonly router = inject(Router);

    readonly overlayOpen = signal(false);
    readonly shortcuts = SHORTCUTS;

    private pendingPrefix: string | null = null;
    private prefixTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly boundHandler = this.handleKeydown.bind(this);

    constructor() {
        document.addEventListener('keydown', this.boundHandler);
    }

    ngOnDestroy(): void {
        document.removeEventListener('keydown', this.boundHandler);
        this.clearPrefix();
    }

    toggleOverlay(): void {
        this.overlayOpen.update((v) => !v);
    }

    closeOverlay(): void {
        this.overlayOpen.set(false);
    }

    private handleKeydown(e: KeyboardEvent): void {
        // Don't intercept when user is typing in an input/textarea/contenteditable
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if ((e.target as HTMLElement)?.isContentEditable) return;

        // Don't intercept modified keys (Ctrl, Alt, Meta) except Escape
        if ((e.ctrlKey || e.altKey || e.metaKey) && e.key !== 'Escape') return;

        const key = e.key;

        // Escape — close overlay (or let other handlers deal with it)
        if (key === 'Escape') {
            if (this.overlayOpen()) {
                e.preventDefault();
                this.closeOverlay();
            }
            this.clearPrefix();
            return;
        }

        // Handle prefix sequences (g + next key)
        if (this.pendingPrefix === 'g') {
            e.preventDefault();
            this.clearPrefix();
            switch (key) {
                case 'd': this.router.navigate(['/chat']); break;
                case 'a': this.router.navigate(['/agents']); break;
                case 's': this.router.navigate(['/sessions']); break;
                case 'w': this.router.navigate(['/work-tasks']); break;
            }
            return;
        }

        // Start prefix
        if (key === 'g') {
            e.preventDefault();
            this.pendingPrefix = 'g';
            this.prefixTimer = setTimeout(() => this.clearPrefix(), 1000);
            return;
        }

        // Single-key shortcuts
        if (key === '?') {
            e.preventDefault();
            this.toggleOverlay();
            return;
        }

        if (key === 'n') {
            e.preventDefault();
            this.closeOverlay();
            this.router.navigate(['/sessions/new']);
            return;
        }
    }

    private clearPrefix(): void {
        this.pendingPrefix = null;
        if (this.prefixTimer) {
            clearTimeout(this.prefixTimer);
            this.prefixTimer = null;
        }
    }
}
