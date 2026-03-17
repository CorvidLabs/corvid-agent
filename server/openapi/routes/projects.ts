import type { RouteEntry } from './types';
import { CreateProjectSchema, UpdateProjectSchema, AssignSkillBundleSchema } from '../../lib/validation';

export const projectRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/projects', summary: 'List projects', tags: ['Projects'], auth: 'required' },
    { method: 'POST', path: '/api/projects', summary: 'Create project', tags: ['Projects'], auth: 'required', requestBody: CreateProjectSchema, responses: { 201: { description: 'Created project' } } },
    { method: 'GET', path: '/api/projects/{id}', summary: 'Get project by ID', tags: ['Projects'], auth: 'required' },
    { method: 'PUT', path: '/api/projects/{id}', summary: 'Update project', tags: ['Projects'], auth: 'required', requestBody: UpdateProjectSchema },
    { method: 'DELETE', path: '/api/projects/{id}', summary: 'Delete project', tags: ['Projects'], auth: 'required' },
    { method: 'GET', path: '/api/browse-dirs', summary: 'Browse filesystem directories', tags: ['Projects'], auth: 'required' },
    { method: 'GET', path: '/api/projects/{id}/skills', summary: 'Get skill bundles assigned to project', tags: ['Projects', 'Skill Bundles'], auth: 'required' },
    { method: 'POST', path: '/api/projects/{id}/skills', summary: 'Assign skill bundle to project', tags: ['Projects', 'Skill Bundles'], auth: 'required', requestBody: AssignSkillBundleSchema },
    { method: 'DELETE', path: '/api/projects/{id}/skills/{bundleId}', summary: 'Remove skill bundle from project', tags: ['Projects', 'Skill Bundles'], auth: 'required' },
];
