import type { RouteEntry } from './types';
import { CreateSkillBundleSchema, UpdateSkillBundleSchema } from '../../lib/validation';

export const pluginRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/plugins', summary: 'List plugins', tags: ['Plugins'], auth: 'required' },
    { method: 'POST', path: '/api/plugins/load', summary: 'Load a plugin', tags: ['Plugins'], auth: 'required' },
    { method: 'POST', path: '/api/plugins/{name}/unload', summary: 'Unload plugin', tags: ['Plugins'], auth: 'required' },
    { method: 'POST', path: '/api/plugins/{name}/grant', summary: 'Grant capability to plugin', tags: ['Plugins'], auth: 'required' },
    { method: 'POST', path: '/api/plugins/{name}/revoke', summary: 'Revoke capability from plugin', tags: ['Plugins'], auth: 'required' },
    { method: 'GET', path: '/api/skill-bundles', summary: 'List skill bundles', tags: ['Skill Bundles'], auth: 'required' },
    { method: 'POST', path: '/api/skill-bundles', summary: 'Create skill bundle', tags: ['Skill Bundles'], auth: 'required', requestBody: CreateSkillBundleSchema, responses: { 201: { description: 'Created skill bundle' } } },
    { method: 'GET', path: '/api/skill-bundles/{id}', summary: 'Get skill bundle by ID', tags: ['Skill Bundles'], auth: 'required' },
    { method: 'PUT', path: '/api/skill-bundles/{id}', summary: 'Update skill bundle', tags: ['Skill Bundles'], auth: 'required', requestBody: UpdateSkillBundleSchema },
    { method: 'DELETE', path: '/api/skill-bundles/{id}', summary: 'Delete skill bundle', tags: ['Skill Bundles'], auth: 'required' },
    { method: 'POST', path: '/api/exam/run', summary: 'Trigger live model exam', tags: ['Exam'], auth: 'required' },
    { method: 'GET', path: '/api/exam/categories', summary: 'List exam categories', tags: ['Exam'], auth: 'required' },
];
