import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type {
    MarketplaceListing,
    MarketplaceReview,
    MarketplaceSearchParams,
    MarketplaceSearchResult,
} from '../models/marketplace.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
    private readonly api = inject(ApiService);

    readonly listings = signal<MarketplaceListing[]>([]);
    readonly loading = signal(false);

    async search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult> {
        const query = new URLSearchParams();
        if (params.query) query.set('q', params.query);
        if (params.category) query.set('category', params.category);
        if (params.pricingModel) query.set('pricing', params.pricingModel);
        if (params.minRating != null) query.set('minRating', String(params.minRating));
        if (params.tags?.length) query.set('tags', params.tags.join(','));
        if (params.limit != null) query.set('limit', String(params.limit));
        if (params.offset != null) query.set('offset', String(params.offset));
        const qs = query.toString();
        const result = await firstValueFrom(
            this.api.get<MarketplaceSearchResult>(`/marketplace/search${qs ? '?' + qs : ''}`),
        );
        this.listings.set(result.listings);
        return result;
    }

    async getListings(agentId?: string): Promise<MarketplaceListing[]> {
        const path = agentId ? `/marketplace/listings?agentId=${agentId}` : '/marketplace/listings';
        const raw = await firstValueFrom(this.api.get<MarketplaceListing[] | MarketplaceSearchResult>(path));
        // GET /api/marketplace/listings returns { listings, total, ... } when no agentId
        const listings = Array.isArray(raw) ? raw : raw.listings;
        this.listings.set(listings);
        return listings;
    }

    async createListing(data: Partial<MarketplaceListing>): Promise<MarketplaceListing> {
        const listing = await firstValueFrom(
            this.api.post<MarketplaceListing>('/marketplace/listings', data),
        );
        this.listings.update((current) => [...current, listing]);
        return listing;
    }

    async updateListing(id: string, data: Partial<MarketplaceListing>): Promise<MarketplaceListing> {
        const listing = await firstValueFrom(
            this.api.put<MarketplaceListing>(`/marketplace/listings/${id}`, data),
        );
        this.listings.update((current) => current.map((l) => (l.id === id ? listing : l)));
        return listing;
    }

    async deleteListing(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/marketplace/listings/${id}`));
        this.listings.update((current) => current.filter((l) => l.id !== id));
    }

    async getReviews(listingId: string): Promise<MarketplaceReview[]> {
        return firstValueFrom(
            this.api.get<MarketplaceReview[]>(`/marketplace/listings/${listingId}/reviews`),
        );
    }

    async getFederatedListings(): Promise<MarketplaceListing[]> {
        return firstValueFrom(
            this.api.get<MarketplaceListing[]>('/marketplace/federated'),
        );
    }

    async createReview(listingId: string, data: { rating: number; comment: string }): Promise<MarketplaceReview> {
        return firstValueFrom(
            this.api.post<MarketplaceReview>(`/marketplace/listings/${listingId}/reviews`, data),
        );
    }
}
