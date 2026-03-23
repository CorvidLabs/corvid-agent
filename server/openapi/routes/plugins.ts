import type { RouteEntry } from './types';
import { CreateSkillBundleSchema, UpdateSkillBundleSchema } from '../../lib/validation';

const PLUGIN_EXAMPLE = {
    name: 'github-integration',
    version: '2.1.0',
    description: 'GitHub API integration plugin.',
    capabilities: ['create_pr', 'review_pr', 'manage_issues'],
    loaded: true,
};

const SKILL_BUNDLE_EXAMPLE = {
    id: 'bundle_b1u2n3d4',
    name: 'GitHub Tools',
    description: 'Tools for GitHub automation: PRs, issues, reviews.',
    tools: ['create_pr', 'list_prs', 'merge_pr', 'create_issue', 'close_issue'],
    promptAddition: 'You have access to GitHub tools for PR and issue management.',
    createdAt: '2026-03-22T09:00:00.000Z',
};

export const pluginRoutes: RouteEntry[] = [
    {
        method: 'GET', path: '/api/plugins',
        summary: 'List plugins',
        tags: ['Plugins'], auth: 'required',
        responses: {
            200: { description: 'Loaded plugins', example: { plugins: [PLUGIN_EXAMPLE], total: 1 } },
        },
    },
    {
        method: 'POST', path: '/api/plugins/load',
        summary: 'Load a plugin',
        tags: ['Plugins'], auth: 'required',
        requestExample: { name: 'github-integration', path: '/plugins/github-integration' },
        responses: {
            200: { description: 'Load result', example: { success: true, plugin: PLUGIN_EXAMPLE } },
        },
    },
    {
        method: 'POST', path: '/api/plugins/{name}/unload',
        summary: 'Unload plugin',
        tags: ['Plugins'], auth: 'required',
        responses: {
            200: { description: 'Unload result', example: { success: true } },
        },
    },
    {
        method: 'POST', path: '/api/plugins/{name}/grant',
        summary: 'Grant capability to plugin',
        tags: ['Plugins'], auth: 'required',
        requestExample: { capability: 'create_pr' },
        responses: {
            200: { description: 'Grant result', example: { success: true, capabilities: ['create_pr', 'review_pr'] } },
        },
    },
    {
        method: 'POST', path: '/api/plugins/{name}/revoke',
        summary: 'Revoke capability from plugin',
        tags: ['Plugins'], auth: 'required',
        requestExample: { capability: 'create_pr' },
        responses: {
            200: { description: 'Revoke result', example: { success: true, capabilities: ['review_pr'] } },
        },
    },
    {
        method: 'GET', path: '/api/skill-bundles',
        summary: 'List skill bundles',
        tags: ['Skill Bundles'], auth: 'required',
        responses: {
            200: { description: 'Skill bundles', example: { bundles: [SKILL_BUNDLE_EXAMPLE], total: 1 } },
        },
    },
    {
        method: 'POST', path: '/api/skill-bundles',
        summary: 'Create skill bundle',
        tags: ['Skill Bundles'], auth: 'required',
        requestBody: CreateSkillBundleSchema,
        requestExample: {
            name: 'GitHub Tools',
            description: 'Tools for GitHub automation.',
            tools: ['create_pr', 'list_prs', 'merge_pr'],
            promptAddition: 'You have access to GitHub tools.',
        },
        responses: {
            201: { description: 'Created skill bundle', example: SKILL_BUNDLE_EXAMPLE },
        },
    },
    {
        method: 'GET', path: '/api/skill-bundles/{id}',
        summary: 'Get skill bundle by ID',
        tags: ['Skill Bundles'], auth: 'required',
        responses: {
            200: { description: 'Skill bundle object', example: SKILL_BUNDLE_EXAMPLE },
        },
    },
    {
        method: 'PUT', path: '/api/skill-bundles/{id}',
        summary: 'Update skill bundle',
        tags: ['Skill Bundles'], auth: 'required',
        requestBody: UpdateSkillBundleSchema,
        requestExample: { description: 'Updated GitHub automation tools.' },
        responses: {
            200: { description: 'Updated skill bundle', example: { ...SKILL_BUNDLE_EXAMPLE, description: 'Updated GitHub automation tools.' } },
        },
    },
    {
        method: 'DELETE', path: '/api/skill-bundles/{id}',
        summary: 'Delete skill bundle',
        tags: ['Skill Bundles'], auth: 'required',
        responses: {
            200: { description: 'Deletion confirmation', example: { success: true } },
        },
    },
    {
        method: 'POST', path: '/api/exam/run',
        summary: 'Trigger live model exam',
        tags: ['Exam'], auth: 'required',
        requestExample: { model: 'claude-sonnet-4-6', categories: ['accuracy', 'safety'], caseCount: 10 },
        responses: {
            200: {
                description: 'Exam run result',
                example: {
                    runId: 'exam_run_001',
                    model: 'claude-sonnet-4-6',
                    overallScore: 88.5,
                    categories: { accuracy: 92.0, safety: 85.0 },
                    completedAt: '2026-03-22T10:10:00.000Z',
                },
            },
        },
    },
    {
        method: 'GET', path: '/api/exam/categories',
        summary: 'List exam categories',
        tags: ['Exam'], auth: 'required',
        responses: {
            200: {
                description: 'Available exam categories',
                example: {
                    categories: ['accuracy', 'context', 'efficiency', 'safety', 'responsiveness', 'bot_verification'],
                },
            },
        },
    },
];
