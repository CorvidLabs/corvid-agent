import type { JWTService, AuthToken } from './jwt-service';
import { createLogger } from '../lib/logger';

const log = createLogger('AuthMiddleware');

export interface AuthRequest extends Request {
    user?: AuthToken;
}

export interface AuthMiddlewareConfig {
    jwtService: JWTService;
    publicPaths?: string[];
    requireAuth?: boolean;
}

/**
 * Authentication middleware for HTTP requests
 */
export class AuthMiddleware {
    private jwtService: JWTService;
    private publicPaths: Set<string>;
    private requireAuth: boolean;

    constructor(config: AuthMiddlewareConfig) {
        this.jwtService = config.jwtService;
        this.publicPaths = new Set(config.publicPaths || [
            '/api/auth/login',
            '/api/auth/refresh',
            '/api/health',
            '/health',
            '/', // Root path for health checks
        ]);
        this.requireAuth = config.requireAuth ?? true;
    }

    /**
     * Middleware function for HTTP authentication
     */
    async authenticate(request: Request): Promise<AuthToken | null> {
        const url = new URL(request.url);
        const pathname = url.pathname;

        // Skip authentication for public paths
        if (this.publicPaths.has(pathname)) {
            return null;
        }

        // Skip authentication for development/health endpoints
        if (pathname.startsWith('/api/health') || pathname.startsWith('/_dev')) {
            return null;
        }

        // Extract token from Authorization header
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            if (this.requireAuth) {
                throw new AuthenticationError('Missing or invalid Authorization header');
            }
            return null;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        try {
            const authToken = await this.jwtService.verifyToken(token);

            // Log successful authentication
            log.debug('User authenticated', {
                userId: authToken.userId,
                email: authToken.email,
                role: authToken.role,
                path: pathname,
            });

            return authToken;
        } catch (error) {
            log.warn('Token verification failed', {
                path: pathname,
                error: error instanceof Error ? error.message : String(error),
            });

            if (this.requireAuth) {
                throw new AuthenticationError('Invalid or expired token');
            }
            return null;
        }
    }

    /**
     * Check if user has required permission
     */
    checkPermission(user: AuthToken, permission: string): boolean {
        // Admin has all permissions
        if (user.permissions.includes('*')) {
            return true;
        }

        // Check specific permission
        return user.permissions.includes(permission);
    }

    /**
     * Check if user can access a project
     */
    checkProjectAccess(user: AuthToken, projectId: string): boolean {
        // Admin can access all projects
        if (user.permissions.includes('*')) {
            return true;
        }

        // Check if user has access to this project
        return user.projectIds.includes(projectId);
    }

    /**
     * Require specific permission (throws error if not authorized)
     */
    requirePermission(user: AuthToken | null, permission: string): void {
        if (!user) {
            throw new AuthorizationError('Authentication required');
        }

        if (!this.checkPermission(user, permission)) {
            throw new AuthorizationError(`Permission required: ${permission}`);
        }
    }

    /**
     * Require project access (throws error if not authorized)
     */
    requireProjectAccess(user: AuthToken | null, projectId: string): void {
        if (!user) {
            throw new AuthorizationError('Authentication required');
        }

        if (!this.checkProjectAccess(user, projectId)) {
            throw new AuthorizationError(`Access denied for project: ${projectId}`);
        }
    }

    /**
     * WebSocket authentication
     */
    async authenticateWebSocket(upgrade: Request): Promise<AuthToken | null> {
        const url = new URL(upgrade.url);
        const token = url.searchParams.get('token');

        if (!token) {
            if (this.requireAuth) {
                throw new AuthenticationError('WebSocket authentication token required');
            }
            return null;
        }

        try {
            const authToken = await this.jwtService.verifyToken(token);

            log.debug('WebSocket user authenticated', {
                userId: authToken.userId,
                email: authToken.email,
                role: authToken.role,
            });

            return authToken;
        } catch (error) {
            log.warn('WebSocket token verification failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            if (this.requireAuth) {
                throw new AuthenticationError('Invalid or expired WebSocket token');
            }
            return null;
        }
    }

    /**
     * Extract IP address from request
     */
    getClientIP(request: Request): string {
        const forwardedFor = request.headers.get('x-forwarded-for');
        if (forwardedFor) {
            return forwardedFor.split(',')[0].trim();
        }

        const realIP = request.headers.get('x-real-ip');
        if (realIP) {
            return realIP;
        }

        // For development
        return '127.0.0.1';
    }

    /**
     * Get user agent from request
     */
    getUserAgent(request: Request): string {
        return request.headers.get('user-agent') || 'Unknown';
    }
}

/**
 * Authentication error
 */
export class AuthenticationError extends Error {
    readonly statusCode = 401;

    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

/**
 * Authorization error
 */
export class AuthorizationError extends Error {
    readonly statusCode = 403;

    constructor(message: string) {
        super(message);
        this.name = 'AuthorizationError';
    }
}

/**
 * Helper function to create standardized error response
 */
export function createErrorResponse(error: Error): Response {
    const statusCode = 'statusCode' in error ? (error as any).statusCode : 500;

    return new Response(JSON.stringify({
        error: {
            message: error.message,
            type: error.name,
            code: statusCode,
        },
        timestamp: new Date().toISOString(),
    }), {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        },
    });
}

/**
 * CORS configuration for authentication
 */
export const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With',
    'Access-Control-Expose-Headers': 'X-Total-Count',
    'Access-Control-Max-Age': '86400', // 24 hours
};

/**
 * Handle CORS preflight requests
 */
export function handleCORS(request: Request): Response | null {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: corsHeaders,
        });
    }
    return null;
}