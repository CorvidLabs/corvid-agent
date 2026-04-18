import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { LiveFeedComponent } from './live-feed.component';
import { AgentCommsComponent } from './agent-comms.component';
import { PageShellComponent } from '../../shared/components/page-shell.component';

type CommsView = 'feed' | 'network';

const STORAGE_KEY = 'comms_view_mode';

@Component({
    selector: 'app-unified-comms',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [LiveFeedComponent, AgentCommsComponent, PageShellComponent, MatButtonToggleModule],
    template: `
        <app-page-shell title="Comms" icon="comms">
            <mat-button-toggle-group actions [value]="view()" (change)="setView($event.value)" hideSingleSelectionIndicator aria-label="Comms view mode">
                <mat-button-toggle value="feed">Feed</mat-button-toggle>
                <mat-button-toggle value="network">Network</mat-button-toggle>
            </mat-button-toggle-group>
            <div class="unified-comms__content">
                @switch (view()) {
                    @case ('feed') {
                        <app-live-feed />
                    }
                    @case ('network') {
                        <app-agent-comms />
                    }
                }
            </div>
        </app-page-shell>
    `,
    styles: `
        .unified-comms__content {
            flex: 1;
            overflow-y: auto;
        }
    `,
})
export class UnifiedCommsComponent {
    readonly view = signal<CommsView>(this.loadView());

    setView(mode: CommsView): void {
        this.view.set(mode);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, mode);
        }
    }

    private loadView(): CommsView {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'feed' || stored === 'network') return stored;
        }
        return 'feed';
    }
}
