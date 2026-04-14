import {
    Component,
    ChangeDetectionStrategy,
} from '@angular/core';
import { ContactListComponent } from './contact-list.component';

@Component({
    selector: 'app-settings-integrations',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ContactListComponent],
    template: `<app-contact-list />`,
})
export class SettingsIntegrationsComponent {}
