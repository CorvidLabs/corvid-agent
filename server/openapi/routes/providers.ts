/**
 * Route metadata: LLM Providers and Ollama.
 */
import type { RouteEntry } from './types';
import { OllamaPullModelSchema, OllamaDeleteModelSchema } from '../../lib/validation';

export const providerRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/providers', summary: 'List LLM providers', tags: ['Providers'], auth: 'none' },
    { method: 'GET', path: '/api/providers/{provider}/models', summary: 'List models for a provider', tags: ['Providers'], auth: 'none' },
    { method: 'GET', path: '/api/ollama/status', summary: 'Ollama server status', tags: ['Ollama'], auth: 'none' },
    { method: 'GET', path: '/api/ollama/models', summary: 'List Ollama models', tags: ['Ollama'], auth: 'none' },
    { method: 'GET', path: '/api/ollama/models/running', summary: 'List running Ollama models', tags: ['Ollama'], auth: 'none' },
    { method: 'POST', path: '/api/ollama/models/pull', summary: 'Pull an Ollama model', tags: ['Ollama'], auth: 'none', requestBody: OllamaPullModelSchema },
    { method: 'DELETE', path: '/api/ollama/models', summary: 'Delete an Ollama model', tags: ['Ollama'], auth: 'none', requestBody: OllamaDeleteModelSchema },
    { method: 'GET', path: '/api/ollama/models/pull/status', summary: 'Get active pull statuses', tags: ['Ollama'], auth: 'none' },
    { method: 'GET', path: '/api/ollama/library', summary: 'Search Ollama model library', tags: ['Ollama'], auth: 'none' },
];
