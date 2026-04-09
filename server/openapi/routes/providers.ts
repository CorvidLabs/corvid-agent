/**
 * Route metadata: LLM Providers and Ollama.
 */

import { OllamaDeleteModelSchema, OllamaPullModelSchema } from '../../lib/validation';
import type { RouteEntry } from './types';

export const providerRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/providers',
    summary: 'List LLM providers',
    tags: ['Providers'],
    auth: 'none',
    responses: {
      200: {
        description: 'Available LLM providers',
        example: {
          providers: [
            {
              id: 'anthropic',
              name: 'Anthropic',
              models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
            },
            { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'] },
            { id: 'ollama', name: 'Ollama (local)', models: [] },
          ],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/providers/{provider}/models',
    summary: 'List models for a provider',
    tags: ['Providers'],
    auth: 'none',
    responses: {
      200: {
        description: 'Models for this provider',
        example: {
          provider: 'anthropic',
          models: [
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000 },
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextWindow: 200000 },
          ],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/ollama/status',
    summary: 'Ollama server status',
    tags: ['Ollama'],
    auth: 'none',
    responses: {
      200: {
        description: 'Ollama server status',
        example: { running: true, version: '0.4.2', baseUrl: 'http://localhost:11434' },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/ollama/models',
    summary: 'List Ollama models',
    tags: ['Ollama'],
    auth: 'none',
    responses: {
      200: {
        description: 'Available Ollama models',
        example: {
          models: [
            { name: 'llama3.2:latest', size: 2048000000, modifiedAt: '2026-03-20T00:00:00.000Z' },
            { name: 'codellama:7b', size: 4096000000, modifiedAt: '2026-03-15T00:00:00.000Z' },
          ],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/ollama/models/running',
    summary: 'List running Ollama models',
    tags: ['Ollama'],
    auth: 'none',
    responses: {
      200: {
        description: 'Currently loaded models',
        example: {
          models: [{ name: 'llama3.2:latest', expiresAt: '2026-03-22T10:30:00.000Z' }],
        },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/ollama/models/pull',
    summary: 'Pull an Ollama model',
    tags: ['Ollama'],
    auth: 'none',
    requestBody: OllamaPullModelSchema,
    requestExample: { model: 'llama3.2:latest' },
    responses: {
      200: { description: 'Pull initiated', example: { success: true, model: 'llama3.2:latest', status: 'pulling' } },
    },
  },
  {
    method: 'DELETE',
    path: '/api/ollama/models',
    summary: 'Delete an Ollama model',
    tags: ['Ollama'],
    auth: 'none',
    requestBody: OllamaDeleteModelSchema,
    requestExample: { model: 'llama3.2:latest' },
    responses: {
      200: { description: 'Deletion result', example: { success: true, model: 'llama3.2:latest' } },
    },
  },
  {
    method: 'GET',
    path: '/api/ollama/models/pull/status',
    summary: 'Get active pull statuses',
    tags: ['Ollama'],
    auth: 'none',
    responses: {
      200: {
        description: 'Active pull statuses',
        example: {
          pulls: [
            {
              model: 'llama3.2:latest',
              status: 'downloading',
              progress: 0.45,
              bytesDownloaded: 921600000,
              totalBytes: 2048000000,
            },
          ],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/ollama/library',
    summary: 'Search Ollama model library',
    tags: ['Ollama'],
    auth: 'none',
    responses: {
      200: {
        description: 'Library search results',
        example: {
          models: [
            { name: 'llama3.2', description: 'Meta Llama 3.2', pullCount: 1200000, tags: ['3b', '11b', 'latest'] },
            { name: 'codellama', description: 'Code Llama', pullCount: 850000, tags: ['7b', '13b', '34b'] },
          ],
        },
      },
    },
  },
];
