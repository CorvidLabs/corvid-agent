import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { BrainViewerComponent } from './brain-viewer.component';
import { MemoryBrowserComponent } from './memory-browser.component';
import { PageShellComponent } from '../../shared/components/page-shell.component';

type MemoryView = 'overview' | 'browse';

const STORAGE_KEY = 'memory_view_mode';

@Component({
    selector: 'app-unified-memory',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-shell title="Memory" icon="memory">
            <mat-button-toggle-group actions [value]="view()" (change)="setView($event.value)" hideSingleSelectionIndicator aria-label="Memory view mode">
                <mat-button-toggle value="overview">Overview</mat-button-toggle>
                <mat-button-toggle value="browse">Browse</mat-button-toggle>
            </mat-button-toggle-group>
            <div class="unified-memory__content">
                @switch (view()) {
                    @case ('overview') {
                        <app-brain-viewer />
                    }
                    @case ('browse') {
                        <app-memory-browser />
                    }
                }
            </div>
        </app-page-shell>
    `,
    styles: `
        .unified-memory__content {
            flex: 1;
            overflow-y: auto;
        }
    `,
    imports: [BrainViewerComponent, MemoryBrowserComponent, PageShellComponent, MatButtonToggleModule],
})
export class UnifiedMemoryComponent {
    readonly view = signal<MemoryView>(this.loadView());

    setView(mode: MemoryView): void {
        this.view.set(mode);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, mode);
        }
    }

    private loadView(): MemoryView {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'overview' || stored === 'browse') return stored;
        }
        return 'overview';
    }
}
