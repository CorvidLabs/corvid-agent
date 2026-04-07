import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
    selector: 'app-route-error',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink],
    template: `
        <div class="route-error" role="alert" aria-live="assertive">
            <pre class="route-error__icon" aria-hidden="true">{{ asciiIcon }}</pre>
            <h1 class="route-error__title">
                <span class="route-error__glitch" aria-hidden="true">ROUTE_FAULT</span>
                Route failed to load
            </h1>
            <p class="route-error__desc">
                The requested module could not be resolved.
                This may be a network issue or a broken deployment.
            </p>
            <div class="route-error__actions">
                <button
                    class="route-error__btn route-error__btn--primary"
                    (click)="retry()"
                    aria-label="Retry loading this route">
                    &gt; Retry
                </button>
                <a
                    class="route-error__btn route-error__btn--secondary"
                    routerLink="/chat"
                    aria-label="Go back to home">
                    &gt; Go Home
                </a>
            </div>
            <p class="route-error__hint">ERR::CHUNK_LOAD_FAILED</p>
        </div>
    `,
    styles: `
        :host {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100%;
            padding: 2rem;
        }
        .route-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: 3rem 2rem;
            max-width: 480px;
            border: 1px solid var(--accent-red, #ff3c5f);
            border-radius: var(--radius-lg, 12px);
            background: var(--bg-surface, #12131e);
            position: relative;
            overflow: hidden;
        }
        .route-error::before {
            content: '';
            position: absolute;
            inset: 0;
            background:
                repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(255, 60, 95, 0.03) 2px,
                    rgba(255, 60, 95, 0.03) 4px
                );
            pointer-events: none;
        }
        .route-error__icon {
            margin: 0 0 1.5rem;
            font-family: var(--font-mono);
            font-size: var(--text-4xs);
            line-height: 1.3;
            color: var(--accent-red, #ff3c5f);
            user-select: none;
            animation: glitchShift 4s ease-in-out infinite;
        }
        @keyframes glitchShift {
            0%, 100% { transform: translate(0, 0); }
            20% { transform: translate(-2px, 1px); }
            22% { transform: translate(2px, -1px); }
            24% { transform: translate(0, 0); }
            70% { transform: translate(0, 0); }
            72% { transform: translate(1px, 2px); }
            74% { transform: translate(-1px, -1px); }
            76% { transform: translate(0, 0); }
        }
        .route-error__title {
            margin: 0 0 0.75rem;
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-primary, #e4e6f0);
            line-height: 1.4;
        }
        .route-error__glitch {
            display: block;
            font-size: var(--text-2xs);
            font-weight: 600;
            font-family: var(--font-mono);
            letter-spacing: 0.15em;
            text-transform: uppercase;
            color: var(--accent-red, #ff3c5f);
            margin-bottom: 0.25rem;
            animation: glitchFlicker 3s steps(1) infinite;
        }
        @keyframes glitchFlicker {
            0%, 100% { opacity: 1; }
            42% { opacity: 1; }
            43% { opacity: 0.2; }
            44% { opacity: 1; }
            85% { opacity: 1; }
            86% { opacity: 0.3; }
            87% { opacity: 1; }
        }
        .route-error__desc {
            margin: 0 0 1.75rem;
            font-size: var(--text-caption);
            color: var(--text-secondary, #9498b3);
            max-width: 360px;
            line-height: 1.7;
        }
        .route-error__actions {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            justify-content: center;
        }
        .route-error__btn {
            display: inline-block;
            padding: 0.6rem 1.25rem;
            border-radius: var(--radius, 8px);
            font-size: var(--text-caption);
            font-weight: 600;
            font-family: var(--font-mono);
            text-decoration: none;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .route-error__btn--primary {
            border: 1px solid var(--accent-cyan, #00e5ff);
            background: transparent;
            color: var(--accent-cyan, #00e5ff);
        }
        .route-error__btn--primary:hover {
            background: var(--accent-cyan, #00e5ff);
            color: var(--bg-deep, #0a0b14);
            box-shadow: var(--glow-cyan, 0 0 12px rgba(0, 229, 255, 0.35));
            transform: translateY(-1px);
        }
        .route-error__btn--primary:active {
            transform: translateY(0) scale(0.97);
        }
        .route-error__btn--secondary {
            border: 1px solid var(--border, #2a2d45);
            background: transparent;
            color: var(--text-secondary, #9498b3);
        }
        .route-error__btn--secondary:hover {
            border-color: var(--text-secondary, #9498b3);
            color: var(--text-primary, #e4e6f0);
            transform: translateY(-1px);
        }
        .route-error__btn--secondary:active {
            transform: translateY(0) scale(0.97);
        }
        .route-error__btn:focus-visible {
            outline: 2px solid var(--accent-cyan, #00e5ff);
            outline-offset: 2px;
        }
        .route-error__hint {
            margin: 1.5rem 0 0;
            font-size: var(--text-3xs);
            font-family: var(--font-mono);
            color: var(--text-tertiary, #555770);
            letter-spacing: 0.1em;
        }
        @media (prefers-reduced-motion: reduce) {
            .route-error__icon { animation: none; }
            .route-error__glitch { animation: none; }
            .route-error__btn:hover { transform: none; }
            .route-error__btn:active { transform: none; }
        }
        @media (max-width: 767px) {
            :host { padding: 1.5rem; }
            .route-error { padding: 2rem 1.5rem; }
        }
    `,
})
export class RouteErrorComponent {
    private readonly router = inject(Router);

    readonly asciiIcon = [
        '    ╔══════════╗    ',
        '    ║  ╳    ╳  ║    ',
        '    ║    ▄▄    ║    ',
        '    ║   ╱  ╲   ║    ',
        '    ╚══════════╝    ',
        '     ║║║║║║║║║║     ',
        '   ┌─┘        └─┐  ',
        '   └──────────────┘ ',
    ].join('\n');

    retry(): void {
        this.router.navigateByUrl(this.router.url);
    }
}
