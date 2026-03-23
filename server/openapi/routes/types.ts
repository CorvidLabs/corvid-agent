import { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RouteEntry {
    method: HttpMethod;
    path: string;               // OpenAPI-style path with {param} syntax
    summary: string;
    description?: string;
    tags: string[];
    requestBody?: z.ZodType;    // Zod schema for request body
    requestExample?: Record<string, unknown>;   // Example request body value
    auth: 'required' | 'admin' | 'none';
    responses?: Record<number, { description: string; example?: Record<string, unknown> }>;
}
