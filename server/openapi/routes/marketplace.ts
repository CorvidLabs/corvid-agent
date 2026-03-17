import type { RouteEntry } from './types';
import { CreateListingSchema, UpdateListingSchema, CreateReviewSchema, RegisterFederationInstanceSchema } from '../../lib/schemas/marketplace';

export const marketplaceRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/marketplace/search', summary: 'Search marketplace listings', description: 'Filter by query, category, pricing, rating, tags.', tags: ['Marketplace'], auth: 'required' },
    { method: 'GET', path: '/api/marketplace/listings', summary: 'List marketplace listings', description: 'Optionally filter by agentId query parameter.', tags: ['Marketplace'], auth: 'required' },
    { method: 'POST', path: '/api/marketplace/listings', summary: 'Create marketplace listing', tags: ['Marketplace'], auth: 'required', requestBody: CreateListingSchema, responses: { 201: { description: 'Created listing' } } },
    { method: 'GET', path: '/api/marketplace/listings/{id}', summary: 'Get listing by ID', tags: ['Marketplace'], auth: 'required' },
    { method: 'PUT', path: '/api/marketplace/listings/{id}', summary: 'Update listing', tags: ['Marketplace'], auth: 'required', requestBody: UpdateListingSchema },
    { method: 'DELETE', path: '/api/marketplace/listings/{id}', summary: 'Delete listing', tags: ['Marketplace'], auth: 'required' },
    { method: 'POST', path: '/api/marketplace/listings/{id}/use', summary: 'Record listing use', tags: ['Marketplace'], auth: 'required' },
    { method: 'GET', path: '/api/marketplace/listings/{id}/reviews', summary: 'Get reviews for listing', tags: ['Marketplace'], auth: 'required' },
    { method: 'POST', path: '/api/marketplace/listings/{id}/reviews', summary: 'Create review for listing', tags: ['Marketplace'], auth: 'required', requestBody: CreateReviewSchema, responses: { 201: { description: 'Created review' } } },
    { method: 'DELETE', path: '/api/marketplace/reviews/{id}', summary: 'Delete review', tags: ['Marketplace'], auth: 'required' },
    { method: 'GET', path: '/api/marketplace/federation/instances', summary: 'List federation instances', tags: ['Marketplace'], auth: 'required' },
    { method: 'POST', path: '/api/marketplace/federation/instances', summary: 'Register federation instance', tags: ['Marketplace'], auth: 'required', requestBody: RegisterFederationInstanceSchema, responses: { 201: { description: 'Registered instance' } } },
    { method: 'DELETE', path: '/api/marketplace/federation/instances/{url}', summary: 'Remove federation instance', tags: ['Marketplace'], auth: 'required' },
    { method: 'POST', path: '/api/marketplace/federation/sync', summary: 'Sync all federation instances', tags: ['Marketplace'], auth: 'required' },
    { method: 'GET', path: '/api/marketplace/federated', summary: 'Get federated listings', tags: ['Marketplace'], auth: 'required' },
];
