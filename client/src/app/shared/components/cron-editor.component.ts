import {
    Component,
    ChangeDetectionStrategy,
    input,
    output,
    signal,
    computed,
    effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { cronToHuman, validateCron } from '../pipes/cron-human.pipe';

export interface CronEditorResult {
    expression: string;
    human: string;
}

interface CronPreset {
    label: string;
    cron: string;
    icon: string;
}

const PRESETS: CronPreset[] = [
    { label: 'Every hour', cron: '0 * * * *', icon: '60m' },
    { label: 'Every 6 hours', cron: '0 */6 * * *', icon: '6h' },
    { label: 'Daily at 9 AM', cron: '0 9 * * *', icon: '9a' },
    { label: 'Daily at midnight', cron: '0 0 * * *', icon: '12a' },
    { label: 'Weekdays at 9 AM', cron: '0 9 * * 1-5', icon: 'M-F' },
    { label: 'Weekly (Mon 9 AM)', cron: '0 9 * * 1', icon: 'Wk' },
    { label: 'Every 15 minutes', cron: '*/15 * * * *', icon: '15m' },
    { label: 'Every 30 minutes', cron: '*/30 * * * *', icon: '30m' },
];

@Component({
    selector: 'app-cron-editor',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="cron-editor" [class.cron-editor--error]="validationError()">
            <label class="cron-editor__label">{{ label() }}</label>

            <!-- Preset chips -->
            <div class="cron-editor__presets" role="group" aria-label="Cron presets">
                @for (preset of presets; track preset.cron) {
                    <button
                        type="button"
                        class="cron-preset"
                        [class.cron-preset--active]="value() === preset.cron"
                        [title]="preset.label"
                        (click)="selectPreset(preset)">
                        <span class="cron-preset__icon">{{ preset.icon }}</span>
                        <span class="cron-preset__label">{{ preset.label }}</span>
                    </button>
                }
            </div>

            <!-- Manual input -->
            <div class="cron-editor__input-row">
                <input
                    class="cron-editor__input mono"
                    [ngModel]="value()"
                    (ngModelChange)="onInput($event)"
                    placeholder="0 9 * * 1-5"
                    [attr.aria-invalid]="!!validationError()"
                    aria-describedby="cron-preview cron-error"
                    spellcheck="false"
                    autocomplete="off" />
                <div class="cron-editor__field-hints">
                    <span>min</span><span>hour</span><span>day</span><span>mon</span><span>dow</span>
                </div>
            </div>

            <!-- Preview / Error -->
            @if (validationError()) {
                <div class="cron-editor__error" id="cron-error" role="alert">
                    {{ validationError() }}
                </div>
            } @else if (humanPreview()) {
                <div class="cron-editor__preview" id="cron-preview">
                    {{ humanPreview() }}
                </div>
            }
        </div>
    `,
    styles: `
        .cron-editor {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .cron-editor__label {
            font-size: 0.65rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .cron-editor__presets {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }
        .cron-preset {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0.3rem 0.55rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            font-size: 0.65rem;
            cursor: pointer;
            transition: border-color 0.1s, color 0.1s, background 0.1s;
            white-space: nowrap;
        }
        .cron-preset:hover {
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
        }
        .cron-preset--active {
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
            background: var(--accent-cyan-dim);
        }
        .cron-preset__icon {
            font-family: var(--font-mono);
            font-size: 0.7rem;
            font-weight: 700;
            opacity: 0.7;
        }
        .cron-preset__label {
            display: none;
        }
        @media (min-width: 600px) {
            .cron-preset__label {
                display: inline;
            }
        }
        .cron-editor__input-row {
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
        }
        .cron-editor__input {
            padding: 0.45rem 0.6rem;
            background: var(--bg-input);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 0.85rem;
            font-family: var(--font-mono);
            letter-spacing: 0.08em;
            transition: border-color 0.15s, box-shadow 0.15s;
        }
        .cron-editor__input:focus {
            border-color: var(--accent-cyan);
            box-shadow: var(--glow-cyan);
            outline: none;
        }
        .cron-editor--error .cron-editor__input {
            border-color: var(--accent-red);
        }
        .cron-editor--error .cron-editor__input:focus {
            box-shadow: 0 0 0 2px var(--accent-red-dim);
        }
        .cron-editor__field-hints {
            display: flex;
            gap: 0;
            padding: 0 0.6rem;
        }
        .cron-editor__field-hints span {
            flex: 1;
            text-align: center;
            font-size: 0.65rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        .cron-editor__preview {
            font-size: 0.7rem;
            color: var(--accent-cyan);
            font-weight: 600;
            padding: 0.3rem 0.5rem;
            background: var(--accent-cyan-dim);
            border-radius: var(--radius-sm);
            border-left: 2px solid var(--accent-cyan);
        }
        .cron-editor__error {
            font-size: 0.7rem;
            color: var(--accent-red);
            font-weight: 600;
            padding: 0.3rem 0.5rem;
            background: var(--accent-red-dim);
            border-radius: var(--radius-sm);
            border-left: 2px solid var(--accent-red);
        }
        @media (max-width: 480px) {
            .cron-editor__presets {
                gap: 0.25rem;
            }
            .cron-preset {
                padding: 0.25rem 0.4rem;
                font-size: 0.6rem;
            }
        }
    `,
})
export class CronEditorComponent {
    readonly label = input<string>('Cron Expression');
    readonly initialValue = input<string>('');
    readonly save = output<CronEditorResult>();
    readonly cancel = output<void>();
    readonly valueChange = output<string>();

    readonly presets = PRESETS;
    readonly value = signal('');

    readonly humanPreview = computed(() => {
        const v = this.value();
        if (!v.trim()) return '';
        const err = validateCron(v);
        if (err) return '';
        return cronToHuman(v);
    });

    readonly validationError = computed(() => {
        const v = this.value();
        if (!v.trim()) return '';
        return validateCron(v);
    });

    readonly isValid = computed(() => {
        const v = this.value();
        return v.trim().length > 0 && !validateCron(v);
    });

    constructor() {
        effect(() => {
            const init = this.initialValue();
            if (init) this.value.set(init);
        });
    }

    selectPreset(preset: CronPreset): void {
        this.value.set(preset.cron);
        this.valueChange.emit(preset.cron);
    }

    onInput(val: string): void {
        this.value.set(val);
        this.valueChange.emit(val);
    }

    emitSave(): void {
        if (!this.isValid()) return;
        this.save.emit({ expression: this.value(), human: this.humanPreview() });
    }

    emitCancel(): void {
        this.cancel.emit();
    }
}
