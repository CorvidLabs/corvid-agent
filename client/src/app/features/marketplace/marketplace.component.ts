import { Component, ChangeDetectionStrategy, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { ReputationService } from '../../core/services/reputation.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { MarketplaceListing, MarketplaceReview, ListingCategory } from '../../core/models/marketplace.model';
import type { TrustLevel } from '../../core/models/reputation.model';

@Component({
    selector: 'app-marketplace',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, DecimalPipe, RelativeTimePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Marketplace</h2>
                <button class="create-btn" (click)="showCreateForm.set(!showCreateForm())">
                    {{ showCreateForm() ? 'Cancel' : '+ New Listing' }}
                </button>
            </div>

            <!-- Search and filters -->
            <div class="search-bar">
                <input
                    [(ngModel)]="searchQuery"
                    class="search-input"
                    placeholder="Search marketplace..."
                    (keyup.enter)="onSearch()" />
                <select [(ngModel)]="categoryFilter" class="filter-select" (change)="onSearch()">
                    <option value="">All Categories</option>
                    <option value="coding">Coding</option>
                    <option value="research">Research</option>
                    <option value="writing">Writing</option>
                    <option value="data">Data</option>
                    <option value="devops">DevOps</option>
                    <option value="security">Security</option>
                    <option value="general">General</option>
                </select>
                <button class="btn btn--primary btn--sm" (click)="onSearch()">Search</button>
            </div>

            @if (showCreateForm()) {
                <div class="create-form">
                    <h3>Create Listing</h3>
                    <div class="form-grid">
                        <div class="form-field">
                            <label>Agent</label>
                            <select [(ngModel)]="formAgentId" class="form-select">
                                <option value="">Select agent...</option>
                                @for (agent of agentService.agents(); track agent.id) {
                                    <option [value]="agent.id">{{ agent.name }}</option>
                                }
                            </select>
                        </div>
                        <div class="form-field">
                            <label>Name</label>
                            <input [(ngModel)]="formName" class="form-input" placeholder="Listing name" />
                        </div>
                        <div class="form-field">
                            <label>Category</label>
                            <select [(ngModel)]="formCategory" class="form-select">
                                <option value="general">General</option>
                                <option value="coding">Coding</option>
                                <option value="research">Research</option>
                                <option value="writing">Writing</option>
                                <option value="data">Data</option>
                                <option value="devops">DevOps</option>
                                <option value="security">Security</option>
                            </select>
                        </div>
                        <div class="form-field">
                            <label>Pricing</label>
                            <select [(ngModel)]="formPricing" class="form-select">
                                <option value="free">Free</option>
                                <option value="per_use">Per Use</option>
                                <option value="subscription">Subscription</option>
                            </select>
                        </div>
                        <div class="form-field span-2">
                            <label>Description</label>
                            <textarea [(ngModel)]="formDescription" class="form-textarea" rows="2" placeholder="Short description..."></textarea>
                        </div>
                        <div class="form-field span-2">
                            <label>Tags (comma-separated)</label>
                            <input [(ngModel)]="formTags" class="form-input" placeholder="typescript, review, testing" />
                        </div>
                    </div>
                    <div class="form-actions">
                        <button
                            class="btn btn--primary"
                            [disabled]="creating() || !formName || !formAgentId"
                            (click)="onCreate()">
                            {{ creating() ? 'Creating...' : 'Create Listing' }}
                        </button>
                    </div>
                </div>
            }

            @if (marketplaceService.loading()) {
                <p class="loading">Loading listings...</p>
            } @else if (loadError()) {
                <div class="error-banner">
                    <p>Marketplace service unavailable (503). The service may not be initialized yet.</p>
                </div>
            } @else if (marketplaceService.listings().length === 0) {
                <p class="empty">No listings found.</p>
            } @else {
                <div class="listing-grid">
                    @for (listing of marketplaceService.listings(); track listing.id) {
                        <div
                            class="listing-card"
                            [class.listing-card--selected]="selectedId() === listing.id"
                            (click)="selectListing(listing)">
                            <div class="listing-card__header">
                                <span class="listing-card__name">{{ listing.name }}</span>
                                <div class="listing-card__badges">
                                    @if (agentTrustLevels()[listing.agentId]; as trust) {
                                        <span class="trust-badge" [attr.data-level]="trust">{{ trust }}</span>
                                    }
                                    <span class="listing-card__category">{{ listing.category }}</span>
                                </div>
                            </div>
                            <p class="listing-card__desc">{{ listing.description }}</p>
                            <div class="listing-card__meta">
                                <span class="listing-card__stars" [title]="listing.avgRating + ' / 5'">
                                    @for (star of [1, 2, 3, 4, 5]; track star) {
                                        <span class="star" [class.star--filled]="star <= Math.round(listing.avgRating)">&#9733;</span>
                                    }
                                    <span class="listing-card__review-count">({{ listing.reviewCount }})</span>
                                </span>
                                <span class="listing-card__price">{{ listing.pricingModel === 'free' ? 'Free' : listing.priceCredits + ' credits' }}</span>
                                <span class="listing-card__uses">{{ listing.useCount }} uses</span>
                            </div>
                            @if (listing.tags.length > 0) {
                                <div class="listing-card__tags">
                                    @for (tag of listing.tags; track tag) {
                                        <span class="tag">{{ tag }}</span>
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            }

            <!-- Federated listings -->
            @if (federatedListings().length > 0) {
                <h3 class="section-title">Federated Listings</h3>
                <div class="listing-grid">
                    @for (listing of federatedListings(); track listing.id) {
                        <div
                            class="listing-card listing-card--federated"
                            [class.listing-card--selected]="selectedId() === listing.id"
                            (click)="selectListing(listing)">
                            <div class="listing-card__header">
                                <span class="listing-card__name">{{ listing.name }}</span>
                                <div class="listing-card__badges">
                                    <span class="external-badge">External</span>
                                    <span class="listing-card__category">{{ listing.category }}</span>
                                </div>
                            </div>
                            <p class="listing-card__desc">{{ listing.description }}</p>
                            <div class="listing-card__meta">
                                <span class="listing-card__stars" [title]="listing.avgRating + ' / 5'">
                                    @for (star of [1, 2, 3, 4, 5]; track star) {
                                        <span class="star" [class.star--filled]="star <= Math.round(listing.avgRating)">&#9733;</span>
                                    }
                                    <span class="listing-card__review-count">({{ listing.reviewCount }})</span>
                                </span>
                                <span class="listing-card__price">{{ listing.pricingModel === 'free' ? 'Free' : listing.priceCredits + ' credits' }}</span>
                            </div>
                        </div>
                    }
                </div>
            }

            @if (selectedId()) {
                <div class="detail-panel">
                    @if (selectedListing(); as listing) {
                        <div class="detail-columns">
                            <div class="detail-info">
                                <div class="detail-panel__header">
                                    <h3>{{ listing.name }}</h3>
                                    <button class="btn btn--danger btn--sm" (click)="onDelete(listing.id)">Delete</button>
                                </div>
                                <p>{{ listing.description }}</p>
                                <div class="detail-agent">
                                    <span>Agent: {{ getAgentName(listing.agentId) }}</span>
                                    @if (agentTrustLevels()[listing.agentId]; as trust) {
                                        <span class="trust-badge" [attr.data-level]="trust">{{ trust }}</span>
                                    }
                                </div>
                                <p class="detail-time">Listed {{ listing.createdAt | relativeTime }}</p>
                            </div>
                            <div class="detail-stats">
                                <div class="stat-item">
                                    <span class="stat-label">Rating</span>
                                    <span class="stat-value stat-value--rating">
                                        @for (star of [1, 2, 3, 4, 5]; track star) {
                                            <span class="star star--lg" [class.star--filled]="star <= Math.round(listing.avgRating)">&#9733;</span>
                                        }
                                    </span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Uses</span>
                                    <span class="stat-value">{{ listing.useCount }}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Price</span>
                                    <span class="stat-value stat-value--price">{{ listing.pricingModel === 'free' ? 'Free' : listing.priceCredits + ' credits' }}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Reviews</span>
                                    <span class="stat-value">{{ listing.reviewCount }}</span>
                                </div>
                            </div>
                        </div>

                        <h4>Reviews</h4>
                        @if (reviews().length === 0) {
                            <p class="empty">No reviews yet.</p>
                        } @else {
                            @for (review of reviews(); track review.id) {
                                <div class="review-row">
                                    <div class="review-row__header">
                                        <span class="review-row__stars">
                                            @for (star of [1, 2, 3, 4, 5]; track star) {
                                                <span class="star" [class.star--filled]="star <= review.rating">&#9733;</span>
                                            }
                                        </span>
                                        <span class="review-row__time">{{ review.createdAt | relativeTime }}</span>
                                    </div>
                                    <p class="review-row__comment">{{ review.comment }}</p>
                                </div>
                            }
                        }

                        <div class="review-form">
                            <h4>Leave a Review</h4>
                            <div class="review-form__fields">
                                <select [(ngModel)]="reviewRating" class="form-select review-form__rating">
                                    <option [value]="5">5 stars</option>
                                    <option [value]="4">4 stars</option>
                                    <option [value]="3">3 stars</option>
                                    <option [value]="2">2 stars</option>
                                    <option [value]="1">1 star</option>
                                </select>
                                <input [(ngModel)]="reviewComment" class="form-input" placeholder="Your review..." />
                                <button
                                    class="btn btn--primary btn--sm"
                                    [disabled]="!reviewComment"
                                    (click)="onReview()">Submit</button>
                            </div>
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .create-btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid var(--accent-cyan); background: var(--accent-cyan-dim);
            color: var(--accent-cyan); font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .search-bar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; align-items: center; }
        .search-input {
            flex: 1; padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
        }
        .search-input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .filter-select {
            padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
        }
        .loading, .empty { color: var(--text-secondary); font-size: 0.85rem; }
        .error-banner {
            background: var(--accent-red-dim); border: 1px solid var(--accent-red); border-radius: var(--radius);
            padding: 0.75rem 1rem; margin-bottom: 1rem;
        }
        .error-banner p { margin: 0; color: var(--accent-red); font-size: 0.85rem; }
        .create-form {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1.5rem; margin-bottom: 1.5rem;
        }
        .create-form h3 { margin: 0 0 1rem; color: var(--text-primary); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .form-field label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
        .form-input, .form-select, .form-textarea {
            width: 100%; padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
            box-sizing: border-box;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .form-textarea { resize: vertical; min-height: 3em; line-height: 1.5; }
        .span-2 { grid-column: span 2; }
        .form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }

        /* Listing grid */
        .listing-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
        .listing-card {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1rem; cursor: pointer; transition: border-color 0.15s;
        }
        .listing-card:hover { border-color: var(--accent-cyan); }
        .listing-card--selected { border-color: var(--accent-cyan); background: var(--bg-raised); }
        .listing-card--federated { border-style: dashed; }
        .listing-card__header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
        .listing-card__name { font-weight: 600; color: var(--text-primary); }
        .listing-card__badges { display: flex; gap: 0.35rem; align-items: center; flex-shrink: 0; }
        .listing-card__category {
            font-size: 0.65rem; padding: 1px 6px; border-radius: var(--radius-sm);
            text-transform: uppercase; color: var(--accent-cyan); border: 1px solid var(--accent-cyan);
        }
        .listing-card__desc { margin: 0.5rem 0; font-size: 0.8rem; color: var(--text-secondary); }
        .listing-card__meta { display: flex; gap: 1rem; font-size: 0.75rem; color: var(--text-secondary); align-items: center; }
        .listing-card__stars { display: inline-flex; align-items: center; gap: 0.1rem; }
        .listing-card__review-count { font-size: 0.7rem; color: var(--text-secondary); margin-left: 0.2rem; }
        .listing-card__price { color: var(--accent-green); }
        .listing-card__tags { display: flex; gap: 0.25rem; margin-top: 0.5rem; flex-wrap: wrap; }
        .tag {
            font-size: 0.65rem; padding: 1px 6px; border-radius: var(--radius-sm);
            background: var(--bg-raised); color: var(--text-secondary); border: 1px solid var(--border);
        }

        /* Stars */
        .star { color: var(--border); font-size: 0.85rem; line-height: 1; }
        .star--filled { color: var(--accent-yellow, #ffc107); }
        .star--lg { font-size: 1.1rem; }

        /* Trust badge */
        .trust-badge {
            font-size: 0.6rem; padding: 1px 5px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; background: var(--bg-raised); border: 1px solid var(--border);
        }
        .trust-badge[data-level="verified"], .trust-badge[data-level="high"] { color: var(--accent-green); border-color: var(--accent-green); }
        .trust-badge[data-level="medium"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .trust-badge[data-level="low"] { color: var(--accent-yellow, #ffc107); border-color: var(--accent-yellow, #ffc107); }
        .trust-badge[data-level="untrusted"] { color: var(--accent-red); border-color: var(--accent-red); }
        .external-badge {
            font-size: 0.6rem; padding: 1px 5px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; color: var(--accent-orange, #ff9100); border: 1px solid var(--accent-orange, #ff9100);
            background: var(--bg-raised);
        }

        /* Section title */
        .section-title { margin: 2rem 0 1rem; color: var(--text-primary); font-size: 1rem; }

        /* Detail panel */
        .detail-panel {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1.5rem; margin-top: 1.5rem;
        }
        .detail-columns { display: grid; grid-template-columns: 1fr auto; gap: 2rem; }
        .detail-panel__header { display: flex; justify-content: space-between; align-items: center; }
        .detail-panel__header h3 { margin: 0; color: var(--text-primary); }
        .detail-panel h4 { margin: 1.5rem 0 0.75rem; color: var(--text-primary); }
        .detail-agent { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary); margin: 0.5rem 0; }
        .detail-time { font-size: 0.75rem; color: var(--text-secondary); }
        .detail-stats { display: flex; flex-direction: column; gap: 0.75rem; min-width: 140px; }
        .stat-item { display: flex; flex-direction: column; gap: 0.15rem; }
        .stat-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }
        .stat-value { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
        .stat-value--rating { display: flex; align-items: center; gap: 0.1rem; }
        .stat-value--price { color: var(--accent-green); }
        .review-row { border-bottom: 1px solid var(--border); padding: 0.5rem 0; }
        .review-row__header { display: flex; justify-content: space-between; align-items: center; }
        .review-row__stars { display: inline-flex; gap: 0.1rem; }
        .review-row__time { font-size: 0.75rem; color: var(--text-secondary); }
        .review-row__comment { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--text-primary); }
        .review-form { margin-top: 1rem; }
        .review-form h4 { margin: 0 0 0.5rem; }
        .review-form__fields { display: flex; gap: 0.5rem; align-items: center; }
        .review-form__rating { width: auto; flex-shrink: 0; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .btn--sm { padding: 0.25rem 0.5rem; font-size: 0.7rem; }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: rgba(0, 229, 255, 0.15); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        @media (max-width: 768px) {
            .form-grid { grid-template-columns: 1fr; }
            .span-2 { grid-column: span 1; }
            .listing-grid { grid-template-columns: 1fr; }
            .search-bar { flex-wrap: wrap; }
            .detail-columns { grid-template-columns: 1fr; }
        }
    `,
})
export class MarketplaceComponent implements OnInit {
    protected readonly marketplaceService = inject(MarketplaceService);
    protected readonly agentService = inject(AgentService);
    private readonly reputationService = inject(ReputationService);
    private readonly notify = inject(NotificationService);

    protected readonly showCreateForm = signal(false);
    protected readonly creating = signal(false);
    protected readonly loadError = signal(false);
    protected readonly selectedId = signal<string | null>(null);
    protected readonly selectedListing = signal<MarketplaceListing | null>(null);
    protected readonly reviews = signal<MarketplaceReview[]>([]);
    protected readonly federatedListings = signal<MarketplaceListing[]>([]);

    protected readonly agentTrustLevels = computed(() => {
        const map: Record<string, TrustLevel> = {};
        for (const score of this.reputationService.scores()) {
            map[score.agentId] = score.trustLevel;
        }
        return map;
    });

    protected readonly Math = Math;

    protected searchQuery = '';
    protected categoryFilter = '';
    protected formAgentId = '';
    protected formName = '';
    protected formDescription = '';
    protected formCategory: ListingCategory = 'general';
    protected formPricing = 'free';
    protected formTags = '';
    protected reviewRating = 5;
    protected reviewComment = '';

    private agentNameCache: Record<string, string> = {};

    async ngOnInit(): Promise<void> {
        await this.agentService.loadAgents();
        for (const a of this.agentService.agents()) {
            this.agentNameCache[a.id] = a.name;
        }
        try {
            await this.marketplaceService.getListings();
        } catch {
            this.loadError.set(true);
        }
        // Load reputation scores for trust badges
        try {
            await this.reputationService.loadScores();
        } catch {
            // Non-critical — trust badges just won't show
        }
        // Load federated listings
        try {
            const federated = await this.marketplaceService.getFederatedListings();
            this.federatedListings.set(federated);
        } catch {
            // Non-critical — federated section just won't show
        }
    }

    protected getAgentName(agentId: string): string {
        return this.agentNameCache[agentId] ?? agentId.slice(0, 8);
    }

    async onSearch(): Promise<void> {
        await this.marketplaceService.search({
            query: this.searchQuery || undefined,
            category: (this.categoryFilter as ListingCategory) || undefined,
        });
    }

    async selectListing(listing: MarketplaceListing): Promise<void> {
        this.selectedId.set(listing.id);
        this.selectedListing.set(listing);
        try {
            const reviews = await this.marketplaceService.getReviews(listing.id);
            this.reviews.set(reviews);
        } catch {
            this.reviews.set([]);
        }
    }

    async onCreate(): Promise<void> {
        if (!this.formName || !this.formAgentId) return;
        this.creating.set(true);
        try {
            await this.marketplaceService.createListing({
                agentId: this.formAgentId,
                name: this.formName,
                description: this.formDescription,
                category: this.formCategory,
                pricingModel: this.formPricing as 'free' | 'per_use' | 'subscription',
                tags: this.formTags.split(',').map((t) => t.trim()).filter(Boolean),
            });
            this.formName = '';
            this.formDescription = '';
            this.formTags = '';
            this.formAgentId = '';
            this.showCreateForm.set(false);
            this.notify.success('Listing created');
        } catch {
            this.notify.error('Failed to create listing');
        } finally {
            this.creating.set(false);
        }
    }

    async onDelete(id: string): Promise<void> {
        try {
            await this.marketplaceService.deleteListing(id);
            this.selectedId.set(null);
            this.selectedListing.set(null);
            this.notify.success('Listing deleted');
        } catch {
            this.notify.error('Failed to delete listing');
        }
    }

    async onReview(): Promise<void> {
        const listingId = this.selectedId();
        if (!listingId || !this.reviewComment) return;
        try {
            await this.marketplaceService.createReview(listingId, {
                rating: Number(this.reviewRating),
                comment: this.reviewComment,
            });
            this.reviewComment = '';
            // Reload reviews
            const reviews = await this.marketplaceService.getReviews(listingId);
            this.reviews.set(reviews);
            // Reload listing for updated rating
            await this.marketplaceService.getListings();
            this.notify.success('Review submitted');
        } catch {
            this.notify.error('Failed to submit review');
        }
    }
}
