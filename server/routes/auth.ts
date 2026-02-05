import type { Database } from 'bun:sqlite';
import { JWTService } from '../auth/jwt-service';
import { AuthMiddleware, createErrorResponse, handleCORS, corsHeaders } from '../auth/middleware';
import { createLogger } from '../lib/logger';

const log = createLogger('AuthRoutes');

export interface AuthRoutesConfig {
    db: Database;
    jwtService: JWTService;
    authMiddleware: AuthMiddleware;
}

/**
 * Authentication API routes
 */
export function createAuthRoutes(config: AuthRoutesConfig) {
    const { db, jwtService, authMiddleware } = config;

    return {
        async handleAuth(request: Request): Promise<Response> {
            // Handle CORS preflight
            const corsResponse = handleCORS(request);
            if (corsResponse) return corsResponse;

            const url = new URL(request.url);
            const path = url.pathname.replace('/api/auth', '');

            try {
                switch (path) {
                    case '/login':
                        return await handleLogin(request);

                    case '/refresh':
                        return await handleRefresh(request);

                    case '/logout':
                        return await handleLogout(request);

                    case '/me':
                        return await handleMe(request);

                    case '/register':
                        return await handleRegister(request);

                    default:
                        return new Response(JSON.stringify({
                            error: { message: 'Auth endpoint not found', type: 'not_found', code: 404 }
                        }), {
                            status: 404,
                            headers: { 'Content-Type': 'application/json', ...corsHeaders }
                        });
                }
            } catch (error) {
                log.error('Auth route error', {
                    path,
                    error: error instanceof Error ? error.message : String(error)
                });
                return createErrorResponse(error instanceof Error ? error : new Error(String(error)));
            }
        }
    };

    /**
     * POST /api/auth/login
     */
    async function handleLogin(request: Request): Promise<Response> {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({
                error: { message: 'Method not allowed', type: 'method_not_allowed', code: 405 }
            }), {
                status: 405,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const body = await request.json() as { email: string; password: string };

        if (!body.email || !body.password) {
            return new Response(JSON.stringify({
                error: { message: 'Email and password are required', type: 'validation_error', code: 400 }
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const ipAddress = authMiddleware.getClientIP(request);
        const userAgent = authMiddleware.getUserAgent(request);

        const result = await jwtService.login(body.email, body.password, ipAddress, userAgent);

        return new Response(JSON.stringify({
            success: true,
            data: result,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    /**
     * POST /api/auth/refresh
     */
    async function handleRefresh(request: Request): Promise<Response> {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({
                error: { message: 'Method not allowed', type: 'method_not_allowed', code: 405 }
            }), {
                status: 405,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const body = await request.json() as { refreshToken: string };

        if (!body.refreshToken) {
            return new Response(JSON.stringify({
                error: { message: 'Refresh token is required', type: 'validation_error', code: 400 }
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const result = await jwtService.refreshToken(body.refreshToken);

        return new Response(JSON.stringify({
            success: true,
            data: result,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    /**
     * POST /api/auth/logout
     */
    async function handleLogout(request: Request): Promise<Response> {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({
                error: { message: 'Method not allowed', type: 'method_not_allowed', code: 405 }
            }), {
                status: 405,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // Authenticate user
        const user = await authMiddleware.authenticate(request);
        if (!user) {
            return new Response(JSON.stringify({
                error: { message: 'Authentication required', type: 'authentication_error', code: 401 }
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const body = await request.json() as { refreshToken?: string };

        await jwtService.logout(user.userId, body.refreshToken);

        return new Response(JSON.stringify({
            success: true,
            message: 'Logged out successfully',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    /**
     * GET /api/auth/me
     */
    async function handleMe(request: Request): Promise<Response> {
        if (request.method !== 'GET') {
            return new Response(JSON.stringify({
                error: { message: 'Method not allowed', type: 'method_not_allowed', code: 405 }
            }), {
                status: 405,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // Authenticate user
        const user = await authMiddleware.authenticate(request);
        if (!user) {
            return new Response(JSON.stringify({
                error: { message: 'Authentication required', type: 'authentication_error', code: 401 }
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // Get full user details
        const userRecord = db.query(`
            SELECT id, email, role, created_at, last_login_at, is_active
            FROM users
            WHERE id = ?
        `).get(user.userId) as {
            id: string;
            email: string;
            role: string;
            created_at: number;
            last_login_at: number;
            is_active: number;
        } | null;

        if (!userRecord) {
            return new Response(JSON.stringify({
                error: { message: 'User not found', type: 'not_found', code: 404 }
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // Get user's project access
        const projects = db.query(`
            SELECT p.id, p.name, upa.permissions
            FROM projects p
            JOIN user_project_access upa ON p.id = upa.project_id
            WHERE upa.user_id = ?
        `).all(user.userId) as Array<{
            id: string;
            name: string;
            permissions: string;
        }>;

        return new Response(JSON.stringify({
            success: true,
            data: {
                user: {
                    id: userRecord.id,
                    email: userRecord.email,
                    role: userRecord.role,
                    createdAt: userRecord.created_at,
                    lastLoginAt: userRecord.last_login_at,
                    isActive: userRecord.is_active === 1,
                },
                permissions: user.permissions,
                projects: projects.map(p => ({
                    id: p.id,
                    name: p.name,
                    permissions: p.permissions.split(',').map(s => s.trim()),
                })),
            },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    /**
     * POST /api/auth/register (Admin only)
     */
    async function handleRegister(request: Request): Promise<Response> {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({
                error: { message: 'Method not allowed', type: 'method_not_allowed', code: 405 }
            }), {
                status: 405,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // Authenticate user
        const user = await authMiddleware.authenticate(request);
        if (!user) {
            return new Response(JSON.stringify({
                error: { message: 'Authentication required', type: 'authentication_error', code: 401 }
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // Check if user is admin
        authMiddleware.requirePermission(user, '*');

        const body = await request.json() as {
            email: string;
            password: string;
            role: 'admin' | 'agent_operator' | 'viewer';
        };

        if (!body.email || !body.password || !body.role) {
            return new Response(JSON.stringify({
                error: { message: 'Email, password, and role are required', type: 'validation_error', code: 400 }
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        if (!['admin', 'agent_operator', 'viewer'].includes(body.role)) {
            return new Response(JSON.stringify({
                error: { message: 'Invalid role', type: 'validation_error', code: 400 }
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const newUser = await jwtService.createUser(body.email, body.password, body.role);

        return new Response(JSON.stringify({
            success: true,
            data: {
                user: newUser,
            },
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
}