import type { RouteEntry } from './types';

export const authRoutes: RouteEntry[] = [
  {
    method: 'POST',
    path: '/api/auth/device',
    summary: 'Initiate device authorization flow',
    tags: ['Auth'],
    auth: 'none',
    responses: {
      200: {
        description: 'Device authorization response',
        example: {
          deviceCode: 'DEVICE_CODE_XYZ',
          userCode: 'ABCD-1234',
          verificationUri: 'http://localhost:3000/api/auth/verify',
          expiresIn: 300,
          interval: 5,
        },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/auth/device/token',
    summary: 'Poll for access token',
    tags: ['Auth'],
    auth: 'none',
    requestExample: { deviceCode: 'DEVICE_CODE_XYZ' },
    responses: {
      200: {
        description: 'Access token (when authorized)',
        example: { accessToken: 'tok_abc123def456', tokenType: 'bearer', expiresIn: 86400 },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/auth/device/authorize',
    summary: 'Authorize device from web UI',
    tags: ['Auth'],
    auth: 'none',
    requestExample: { userCode: 'ABCD-1234' },
    responses: {
      200: { description: 'Authorization result', example: { success: true, message: 'Device authorized.' } },
    },
  },
  {
    method: 'GET',
    path: '/api/auth/verify',
    summary: 'Device verification page',
    tags: ['Auth'],
    auth: 'none',
    responses: {
      200: { description: 'HTML verification page (text/html)', example: {} },
    },
  },
  {
    method: 'POST',
    path: '/a2a/tasks/send',
    summary: 'Create and start A2A task',
    tags: ['A2A'],
    auth: 'none',
    requestExample: {
      id: 'task_a2a_001',
      message: {
        role: 'user',
        parts: [{ type: 'text', text: 'Summarize the latest commits.' }],
      },
    },
    responses: {
      200: {
        description: 'A2A task created',
        example: {
          id: 'task_a2a_001',
          status: { state: 'working' },
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/a2a/tasks/{id}',
    summary: 'Poll A2A task status',
    tags: ['A2A'],
    auth: 'none',
    responses: {
      200: {
        description: 'A2A task status',
        example: {
          id: 'task_a2a_001',
          status: { state: 'completed' },
          artifacts: [{ type: 'text', text: 'The latest 3 commits were: ...' }],
        },
      },
    },
  },
];
