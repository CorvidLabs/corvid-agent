import {
  CreateListingSchema,
  CreateReviewSchema,
  RegisterFederationInstanceSchema,
  UpdateListingSchema,
} from '../../lib/schemas/marketplace';
import type { RouteEntry } from './types';

const LISTING_EXAMPLE = {
  id: 'listing_l1i2s3t4',
  agentId: 'agent_a1b2c3d4',
  name: 'PR Reviewer Pro',
  description: 'Automated PR review with detailed feedback.',
  category: 'code-review',
  pricing: 'per-use',
  priceCredits: 10,
  rating: 4.8,
  useCount: 142,
  tags: ['github', 'code-review', 'automation'],
  createdAt: '2026-03-01T09:00:00.000Z',
};

const REVIEW_EXAMPLE = {
  id: 'review_r1e2v3i4',
  listingId: 'listing_l1i2s3t4',
  rating: 5,
  comment: 'Excellent PR review quality, very detailed.',
  createdAt: '2026-03-22T09:00:00.000Z',
};

export const marketplaceRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/marketplace/search',
    summary: 'Search marketplace listings',
    description: 'Filter by query, category, pricing, rating, tags.',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: {
        description: 'Search results',
        example: { listings: [LISTING_EXAMPLE], total: 1 },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/marketplace/listings',
    summary: 'List marketplace listings',
    description: 'Optionally filter by agentId query parameter.',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: { description: 'Marketplace listings', example: { listings: [LISTING_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'POST',
    path: '/api/marketplace/listings',
    summary: 'Create marketplace listing',
    tags: ['Marketplace'],
    auth: 'required',
    requestBody: CreateListingSchema,
    requestExample: {
      agentId: 'agent_a1b2c3d4',
      name: 'PR Reviewer Pro',
      description: 'Automated PR review with detailed feedback.',
      category: 'code-review',
      pricing: 'per-use',
      priceCredits: 10,
      tags: ['github', 'code-review'],
    },
    responses: {
      201: { description: 'Created listing', example: LISTING_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/marketplace/listings/{id}',
    summary: 'Get listing by ID',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: { description: 'Listing object', example: LISTING_EXAMPLE },
    },
  },
  {
    method: 'PUT',
    path: '/api/marketplace/listings/{id}',
    summary: 'Update listing',
    tags: ['Marketplace'],
    auth: 'required',
    requestBody: UpdateListingSchema,
    requestExample: { priceCredits: 15, description: 'Enhanced PR review with AI-powered suggestions.' },
    responses: {
      200: { description: 'Updated listing', example: { ...LISTING_EXAMPLE, priceCredits: 15 } },
    },
  },
  {
    method: 'DELETE',
    path: '/api/marketplace/listings/{id}',
    summary: 'Delete listing',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: { description: 'Deletion confirmation', example: { success: true } },
    },
  },
  {
    method: 'POST',
    path: '/api/marketplace/listings/{id}/use',
    summary: 'Record listing use',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: { description: 'Use recorded', example: { success: true, newUseCount: 143 } },
    },
  },
  {
    method: 'GET',
    path: '/api/marketplace/listings/{id}/reviews',
    summary: 'Get reviews for listing',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: { description: 'Listing reviews', example: { reviews: [REVIEW_EXAMPLE], total: 1, averageRating: 4.8 } },
    },
  },
  {
    method: 'POST',
    path: '/api/marketplace/listings/{id}/reviews',
    summary: 'Create review for listing',
    tags: ['Marketplace'],
    auth: 'required',
    requestBody: CreateReviewSchema,
    requestExample: { rating: 5, comment: 'Excellent PR review quality, very detailed.' },
    responses: {
      201: { description: 'Created review', example: REVIEW_EXAMPLE },
    },
  },
  {
    method: 'DELETE',
    path: '/api/marketplace/reviews/{id}',
    summary: 'Delete review',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: { description: 'Deletion confirmation', example: { success: true } },
    },
  },
  {
    method: 'GET',
    path: '/api/marketplace/federation/instances',
    summary: 'List federation instances',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: {
        description: 'Federation instances',
        example: {
          instances: [
            {
              url: 'https://marketplace.corvid.example',
              name: 'Corvid Marketplace',
              listingCount: 25,
              lastSyncAt: '2026-03-22T08:00:00.000Z',
            },
          ],
          total: 1,
        },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/marketplace/federation/instances',
    summary: 'Register federation instance',
    tags: ['Marketplace'],
    auth: 'required',
    requestBody: RegisterFederationInstanceSchema,
    requestExample: { url: 'https://marketplace.corvid.example', name: 'Corvid Marketplace' },
    responses: {
      201: {
        description: 'Registered instance',
        example: {
          url: 'https://marketplace.corvid.example',
          name: 'Corvid Marketplace',
          registeredAt: '2026-03-22T10:00:00.000Z',
        },
      },
    },
  },
  {
    method: 'DELETE',
    path: '/api/marketplace/federation/instances/{url}',
    summary: 'Remove federation instance',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: { description: 'Removal confirmation', example: { success: true } },
    },
  },
  {
    method: 'POST',
    path: '/api/marketplace/federation/sync',
    summary: 'Sync all federation instances',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: { description: 'Sync result', example: { synced: 1, failed: 0, listingsImported: 25 } },
    },
  },
  {
    method: 'GET',
    path: '/api/marketplace/federated',
    summary: 'Get federated listings',
    tags: ['Marketplace'],
    auth: 'required',
    responses: {
      200: {
        description: 'Federated listings from all instances',
        example: { listings: [{ ...LISTING_EXAMPLE, source: 'https://marketplace.corvid.example' }], total: 1 },
      },
    },
  },
];
