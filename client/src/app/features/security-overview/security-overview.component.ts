import { Component, ChangeDetectionStrategy, inject, OnInit, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SecurityOverviewService } from '../../core/services/security-overview.service';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

@Component({
    selector: 'app-security-overview',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, SkeletonComponent],
    template: `
        <div class="page">
            <div class="page__header">
                <h2 class="page-title">Security Overview</h2>
            </div>

            @if (service.error()) {
                <p class="error">{{ service.error() }}</p>
            }

            @if (service.loading()) {
                <app-skeleton variant="line" [count]="8" />
            } @else if (data(); as d) {
                <!-- Auto-Merge Rules -->
                <section class="card">
                    <h3 class="card__title">Auto-Merge Rules</h3>
                    <p class="card__desc">
                        Auto-merge is <strong>{{ d.autoMergeEnabled ? 'enabled' : 'disabled' }}</strong>.
                        PRs are validated against protected paths, code scanner patterns, and fetch domain restrictions
                        before squash-merging. Failing CI checks also block merge.
                    </p>
                    <ul class="card__checks">
                        <li>PR must be authored by the configured bot username</li>
                        <li>All CI checks must pass</li>
                        <li>Diff must not modify protected files</li>
                        <li>Diff must not contain blocked code patterns</li>
                        <li>Diff must not introduce unapproved fetch domains</li>
                    </ul>
                </section>

                <!-- Protected Files -->
                <section class="card">
                    <h3 class="card__title">Protected Files <span class="count">({{ d.protectedBasenames.length + d.protectedSubstrings.length }})</span></h3>
                    <p class="card__desc">Files that agents must never modify, even in full-auto mode.</p>
                    <div class="card__columns">
                        <div>
                            <h4 class="card__subtitle">Basename-protected</h4>
                            <ul class="tag-list">
                                @for (name of d.protectedBasenames; track name) {
                                    <li class="tag tag--file">{{ name }}</li>
                                }
                            </ul>
                        </div>
                        <div>
                            <h4 class="card__subtitle">Path-protected (substring)</h4>
                            <ul class="tag-list">
                                @for (sub of d.protectedSubstrings; track sub) {
                                    <li class="tag tag--path">{{ sub }}</li>
                                }
                            </ul>
                        </div>
                    </div>
                </section>

                <!-- Code Scanner Patterns -->
                <section class="card">
                    <h3 class="card__title">Code Scanner Patterns <span class="count">({{ d.blockedPatterns.length }})</span></h3>
                    <p class="card__desc">Patterns detected in PR diffs. Critical patterns block merge; warnings are informational.</p>
                    <div class="card__columns">
                        <div>
                            <h4 class="card__subtitle">Critical (blocking)</h4>
                            <ul class="pattern-list">
                                @for (p of criticalPatterns(); track p.name) {
                                    <li class="pattern pattern--critical">
                                        <span class="pattern__name">{{ p.name }}</span>
                                        <span class="pattern__cat">{{ p.category }}</span>
                                    </li>
                                }
                            </ul>
                        </div>
                        <div>
                            <h4 class="card__subtitle">Warning (non-blocking)</h4>
                            <ul class="pattern-list">
                                @for (p of warningPatterns(); track p.name) {
                                    <li class="pattern pattern--warning">
                                        <span class="pattern__name">{{ p.name }}</span>
                                        <span class="pattern__cat">{{ p.category }}</span>
                                    </li>
                                }
                            </ul>
                        </div>
                    </div>
                </section>

                <!-- Approved Fetch Domains -->
                <section class="card">
                    <h3 class="card__title">Approved Fetch Domains <span class="count">({{ d.approvedDomains.length }})</span></h3>
                    <p class="card__desc">Domains agents are allowed to make HTTP requests to. Requests to unlisted domains are flagged.</p>
                    <ul class="tag-list tag-list--wrap">
                        @for (domain of d.approvedDomains; track domain) {
                            <li class="tag tag--domain">{{ domain }}</li>
                        }
                    </ul>
                </section>

                <!-- Governance Tiers -->
                <section class="card">
                    <h3 class="card__title">Governance Tiers</h3>
                    <p class="card__desc">Three-layer permission model controlling who can modify what.</p>
                    <div class="tier-grid">
                        @for (tier of d.governanceTiers; track tier.tier) {
                            <div class="tier-card" [class]="'tier-card--layer' + tier.tier">
                                <div class="tier-card__header">
                                    <span class="tier-card__badge">Layer {{ tier.tier }}</span>
                                    <span class="tier-card__label">{{ tier.label }}</span>
                                </div>
                                <p class="tier-card__desc">{{ tier.description }}</p>
                                <ul class="tier-card__props">
                                    <li>Quorum: {{ tier.quorumThreshold * 100 }}%</li>
                                    <li>Human approval: {{ tier.requiresHumanApproval ? 'Yes' : 'No' }}</li>
                                    <li>Automation: {{ tier.allowsAutomation ? 'Allowed' : 'Blocked' }}</li>
                                </ul>
                            </div>
                        }
                    </div>
                    @if (d.governancePaths) {
                        <div class="card__columns" style="margin-top: 1rem;">
                            <div>
                                <h4 class="card__subtitle">Layer 0 paths</h4>
                                <ul class="tag-list">
                                    @for (name of d.governancePaths.layer0.basenames; track name) {
                                        <li class="tag tag--file">{{ name }}</li>
                                    }
                                    @for (sub of d.governancePaths.layer0.substrings; track sub) {
                                        <li class="tag tag--path">{{ sub }}</li>
                                    }
                                </ul>
                            </div>
                            <div>
                                <h4 class="card__subtitle">Layer 1 paths</h4>
                                <ul class="tag-list">
                                    @for (name of d.governancePaths.layer1.basenames; track name) {
                                        <li class="tag tag--file">{{ name }}</li>
                                    }
                                    @for (sub of d.governancePaths.layer1.substrings; track sub) {
                                        <li class="tag tag--path">{{ sub }}</li>
                                    }
                                </ul>
                            </div>
                        </div>
                    }
                </section>

                <!-- Quick Links -->
                <section class="card">
                    <h3 class="card__title">Related Pages</h3>
                    <div class="link-grid">
                        <a class="link-card" routerLink="/settings/github-allowlist">
                            <span class="link-card__label">GitHub Allowlist</span>
                            <span class="link-card__count">{{ d.allowlistCount }} entries</span>
                        </a>
                        <a class="link-card" routerLink="/settings/repo-blocklist">
                            <span class="link-card__label">Repo Blocklist</span>
                            <span class="link-card__count">{{ d.blocklistCount }} entries</span>
                        </a>
                    </div>
                </section>
            }
        </div>
    `,
    styles: `
        .page { padding: var(--space-6); max-width: 960px; }
        .page__header { margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .count { color: var(--text-tertiary); font-weight: 400; font-size: 0.85rem; }
        .error { color: var(--accent-red); padding: var(--space-3); background: var(--accent-red-tint); border-radius: var(--radius); }

        .card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: var(--space-5);
            margin-bottom: 1rem;
        }
        .card__title {
            margin: 0 0 0.5rem;
            font-size: 1rem;
            color: var(--text-primary);
        }
        .card__subtitle {
            margin: 0.75rem 0 0.4rem;
            font-size: 0.8rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .card__desc {
            margin: 0 0 0.75rem;
            font-size: 0.85rem;
            color: var(--text-secondary);
            line-height: 1.5;
        }
        .card__checks {
            margin: 0;
            padding-left: var(--space-5);
            font-size: 0.85rem;
            color: var(--text-secondary);
            line-height: 1.8;
        }
        .card__columns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }
        @media (max-width: 600px) {
            .card__columns { grid-template-columns: 1fr; }
        }

        /* Tags */
        .tag-list {
            list-style: none;
            margin: 0.25rem 0 0;
            padding: 0;
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }
        .tag-list--wrap { flex-wrap: wrap; }
        .tag {
            display: inline-block;
            padding: 0.2rem var(--space-2);
            border-radius: var(--radius-sm);
            font-size: 0.75rem;
            font-family: var(--font-mono);
        }
        .tag--file {
            background: var(--accent-cyan-tint);
            color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan-mid);
        }
        .tag--path {
            background: rgba(255, 183, 77, 0.1);
            color: var(--accent-amber);
            border: 1px solid rgba(255, 183, 77, 0.2);
        }
        .tag--domain {
            background: rgba(129, 199, 132, 0.1);
            color: var(--accent-green);
            border: 1px solid rgba(129, 199, 132, 0.2);
        }

        /* Code scanner patterns */
        .pattern-list {
            list-style: none;
            margin: 0.25rem 0 0;
            padding: 0;
        }
        .pattern {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.35rem 0;
            font-size: 0.8rem;
            border-bottom: 1px solid var(--border);
        }
        .pattern:last-child { border-bottom: none; }
        .pattern__name {
            font-family: var(--font-mono);
        }
        .pattern--critical .pattern__name { color: var(--accent-red); }
        .pattern--warning .pattern__name { color: var(--accent-amber); }
        .pattern__cat {
            font-size: 0.7rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }

        /* Governance tier cards */
        .tier-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.75rem;
        }
        @media (max-width: 600px) {
            .tier-grid { grid-template-columns: 1fr; }
        }
        .tier-card {
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: var(--space-3);
            background: var(--bg-raised);
        }
        .tier-card--layer0 { border-color: var(--accent-red); }
        .tier-card--layer1 { border-color: var(--accent-amber); }
        .tier-card--layer2 { border-color: var(--accent-green); }
        .tier-card__header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.4rem;
        }
        .tier-card__badge {
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 0.15rem 0.4rem;
            border-radius: var(--radius-sm);
        }
        .tier-card--layer0 .tier-card__badge { background: var(--accent-red-dim); color: var(--accent-red); }
        .tier-card--layer1 .tier-card__badge { background: rgba(255,183,77,0.15); color: var(--accent-amber); }
        .tier-card--layer2 .tier-card__badge { background: rgba(129,199,132,0.15); color: var(--accent-green); }
        .tier-card__label {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text-primary);
        }
        .tier-card__desc {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin: 0 0 0.4rem;
            line-height: 1.4;
        }
        .tier-card__props {
            list-style: none;
            margin: 0;
            padding: 0;
            font-size: 0.75rem;
            color: var(--text-tertiary);
        }
        .tier-card__props li { padding: 0.1rem 0; }

        /* Quick link cards */
        .link-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.75rem;
        }
        @media (max-width: 600px) {
            .link-grid { grid-template-columns: 1fr; }
        }
        .link-card {
            display: flex;
            flex-direction: column;
            padding: var(--space-3) var(--space-4);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            background: var(--bg-raised);
            text-decoration: none;
            color: var(--text-primary);
            transition: border-color 0.15s, background 0.15s;
        }
        .link-card:hover {
            border-color: var(--accent-cyan);
            background: var(--bg-hover);
        }
        .link-card__label {
            font-size: 0.85rem;
            font-weight: 600;
        }
        .link-card__count {
            font-size: 0.75rem;
            color: var(--text-tertiary);
            margin-top: 0.2rem;
        }
    `,
})
export class SecurityOverviewComponent implements OnInit {
    protected readonly service = inject(SecurityOverviewService);

    readonly data = this.service.data;

    readonly criticalPatterns = computed(() => {
        const d = this.data();
        return d?.blockedPatterns.filter((p) => p.severity === 'critical') ?? [];
    });

    readonly warningPatterns = computed(() => {
        const d = this.data();
        return d?.blockedPatterns.filter((p) => p.severity === 'warning') ?? [];
    });

    ngOnInit(): void {
        this.service.load();
    }
}
