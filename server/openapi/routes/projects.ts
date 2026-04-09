import { AssignSkillBundleSchema, CreateProjectSchema, UpdateProjectSchema } from '../../lib/validation';
import type { RouteEntry } from './types';

const PROJECT_EXAMPLE = {
  id: 'proj_xyz789',
  name: 'my-webapp',
  directory: '/home/user/projects/my-webapp',
  description: 'Main web application project.',
  createdAt: '2026-03-22T09:00:00.000Z',
  updatedAt: '2026-03-22T09:00:00.000Z',
};

export const projectRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/projects',
    summary: 'List projects',
    tags: ['Projects'],
    auth: 'required',
    responses: {
      200: {
        description: 'List of projects',
        example: { projects: [PROJECT_EXAMPLE], total: 1 },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/projects',
    summary: 'Create project',
    tags: ['Projects'],
    auth: 'required',
    requestBody: CreateProjectSchema,
    requestExample: {
      name: 'my-webapp',
      directory: '/home/user/projects/my-webapp',
      description: 'Main web application project.',
    },
    responses: {
      201: { description: 'Created project', example: PROJECT_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/projects/{id}',
    summary: 'Get project by ID',
    tags: ['Projects'],
    auth: 'required',
    responses: {
      200: { description: 'Project object', example: PROJECT_EXAMPLE },
    },
  },
  {
    method: 'PUT',
    path: '/api/projects/{id}',
    summary: 'Update project',
    tags: ['Projects'],
    auth: 'required',
    requestBody: UpdateProjectSchema,
    requestExample: { description: 'Updated project description.' },
    responses: {
      200: {
        description: 'Updated project',
        example: { ...PROJECT_EXAMPLE, description: 'Updated project description.' },
      },
    },
  },
  {
    method: 'DELETE',
    path: '/api/projects/{id}',
    summary: 'Delete project',
    tags: ['Projects'],
    auth: 'required',
    responses: {
      200: { description: 'Deletion confirmation', example: { success: true } },
    },
  },
  {
    method: 'GET',
    path: '/api/browse-dirs',
    summary: 'Browse filesystem directories',
    tags: ['Projects'],
    auth: 'required',
    responses: {
      200: {
        description: 'Directory listing',
        example: {
          path: '/home/user/projects',
          dirs: ['my-webapp', 'api-service', 'mobile-app'],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/projects/{id}/skills',
    summary: 'Get skill bundles assigned to project',
    tags: ['Projects', 'Skill Bundles'],
    auth: 'required',
    responses: {
      200: {
        description: 'Assigned skill bundles',
        example: { bundles: [{ id: 'bundle_001', name: 'GitHub Tools', toolCount: 5 }] },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/projects/{id}/skills',
    summary: 'Assign skill bundle to project',
    tags: ['Projects', 'Skill Bundles'],
    auth: 'required',
    requestBody: AssignSkillBundleSchema,
    requestExample: { bundleId: 'bundle_001' },
    responses: {
      200: { description: 'Skill bundle assigned', example: { success: true } },
    },
  },
  {
    method: 'DELETE',
    path: '/api/projects/{id}/skills/{bundleId}',
    summary: 'Remove skill bundle from project',
    tags: ['Projects', 'Skill Bundles'],
    auth: 'required',
    responses: {
      200: { description: 'Removal confirmation', example: { success: true } },
    },
  },
];
