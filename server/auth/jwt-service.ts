import { createLogger } from '../lib/logger';
import type { Database } from 'bun:sqlite';

const log = createLogger('JWTService');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'REDACTED_JWT_SECRET';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';
const REFRESH_TOKEN_EXPIRATION = process.env.REFRESH_TOKEN_EXPIRATION || '30d';

export interface User {
    id: string;
    email: string;
    role: 'admin' | 'agent_operator' | 'viewer';
    createdAt: number;
    lastLoginAt: number | null;
    isActive: boolean;
}

export interface AuthToken {
    userId: string;
    email: string;
    role: 'admin' | 'agent_operator' | 'viewer';
    projectIds: string[];
    permissions: string[];
    expiresAt: number;
    issuedAt: number;
}

export interface LoginResult {
    token: string;
    refreshToken: string;
    user: User;
    expiresAt: number;
}

export interface RefreshResult {
    token: string;
    refreshToken: string;
    expiresAt: number;
}

/**
 * JWT-based authentication service with role-based access control
 */
export class JWTService {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
        this.initializeSchema();
        this.createDefaultAdmin();
    }

    /**
     * Initialize authentication database schema
     */
    private initializeSchema(): void {
        try {
            // Users table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('admin', 'agent_operator', 'viewer')),
                    created_at INTEGER NOT NULL,
                    last_login_at INTEGER,
                    is_active INTEGER NOT NULL DEFAULT 1
                )
            `);

            // User project access table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS user_project_access (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    permissions TEXT NOT NULL,
                    granted_at INTEGER NOT NULL,
                    granted_by TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (id),
                    FOREIGN KEY (project_id) REFERENCES projects (id),
                    UNIQUE (user_id, project_id)
                )
            `);

            // Refresh tokens table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token_hash TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    is_revoked INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            `);

            // Auth audit log
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS auth_audit_log (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    action TEXT NOT NULL,
                    resource TEXT,
                    success INTEGER NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    timestamp INTEGER NOT NULL,
                    details TEXT
                )
            `);

            // Create indexes
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_auth_audit_timestamp ON auth_audit_log(timestamp)`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_user_project_access_user_id ON user_project_access(user_id)`);

            log.info('Authentication schema initialized');
        } catch (error) {
            log.error('Failed to initialize authentication schema', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Create default admin user if no users exist
     */
    private async createDefaultAdmin(): Promise<void> {
        const userCount = this.db.query('SELECT COUNT(*) as count FROM users').get() as { count: number };

        if (userCount.count === 0) {
            const defaultEmail = 'admin@corvid-agent.local';
            const defaultPassword = 'REDACTED_PASSWORD'; // Should be changed immediately

            await this.createUser(defaultEmail, defaultPassword, 'admin');

            log.warn('Created default admin user', {
                email: defaultEmail,
                message: 'Please change the default password immediately'
            });
        }
    }

    /**
     * Create a new user
     */
    async createUser(email: string, password: string, role: User['role']): Promise<User> {
        const userId = crypto.randomUUID();
        const passwordHash = await this.hashPassword(password);
        const now = Date.now();

        try {
            this.db.query(`
                INSERT INTO users (id, email, password_hash, role, created_at, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            `).run(userId, email, passwordHash, role, now);

            const user: User = {
                id: userId,
                email,
                role,
                createdAt: now,
                lastLoginAt: null,
                isActive: true,
            };

            await this.logAuthAction(userId, 'user_created', 'users', true);

            log.info('User created', { userId, email, role });
            return user;
        } catch (error) {
            await this.logAuthAction(userId, 'user_create_failed', 'users', false, undefined, undefined, String(error));
            throw new Error('Failed to create user: email may already exist');
        }
    }

    /**
     * Authenticate user and return JWT token
     */
    async login(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<LoginResult> {
        try {
            // Find user
            const user = this.db.query(`
                SELECT id, email, password_hash, role, created_at, last_login_at, is_active
                FROM users
                WHERE email = ? AND is_active = 1
            `).get(email) as {
                id: string;
                email: string;
                password_hash: string;
                role: User['role'];
                created_at: number;
                last_login_at: number | null;
                is_active: number;
            } | null;

            if (!user) {
                await this.logAuthAction(undefined, 'login_failed', 'auth', false, ipAddress, userAgent, 'User not found');
                throw new Error('Invalid credentials');
            }

            // Verify password
            const isValidPassword = await this.verifyPassword(password, user.password_hash);
            if (!isValidPassword) {
                await this.logAuthAction(user.id, 'login_failed', 'auth', false, ipAddress, userAgent, 'Invalid password');
                throw new Error('Invalid credentials');
            }

            // Update last login
            const now = Date.now();
            this.db.query('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id);

            // Get user projects
            const projectIds = await this.getUserProjectIds(user.id);
            const permissions = this.getRolePermissions(user.role);

            // Generate tokens
            const authToken: AuthToken = {
                userId: user.id,
                email: user.email,
                role: user.role,
                projectIds,
                permissions,
                expiresAt: now + this.parseExpiration(JWT_EXPIRATION),
                issuedAt: now,
            };

            const token = await this.signToken(authToken);
            const refreshToken = await this.generateRefreshToken(user.id);

            const result: LoginResult = {
                token,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    createdAt: user.created_at,
                    lastLoginAt: now,
                    isActive: true,
                },
                expiresAt: authToken.expiresAt,
            };

            await this.logAuthAction(user.id, 'login_success', 'auth', true, ipAddress, userAgent);

            log.info('User logged in', { userId: user.id, email: user.email, projectCount: projectIds.length });
            return result;
        } catch (error) {
            log.error('Login failed', {
                email,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Refresh an access token using a refresh token
     */
    async refreshToken(refreshTokenValue: string): Promise<RefreshResult> {
        const tokenHash = await this.hashPassword(refreshTokenValue);

        const refreshTokenRecord = this.db.query(`
            SELECT rt.id, rt.user_id, rt.expires_at, u.email, u.role, u.is_active
            FROM refresh_tokens rt
            JOIN users u ON rt.user_id = u.id
            WHERE rt.token_hash = ? AND rt.is_revoked = 0 AND rt.expires_at > ? AND u.is_active = 1
        `).get(tokenHash, Date.now()) as {
            id: string;
            user_id: string;
            expires_at: number;
            email: string;
            role: User['role'];
            is_active: number;
        } | null;

        if (!refreshTokenRecord) {
            throw new Error('Invalid or expired refresh token');
        }

        // Revoke old refresh token
        this.db.query('UPDATE refresh_tokens SET is_revoked = 1 WHERE id = ?').run(refreshTokenRecord.id);

        // Get user projects and permissions
        const projectIds = await this.getUserProjectIds(refreshTokenRecord.user_id);
        const permissions = this.getRolePermissions(refreshTokenRecord.role);

        // Generate new tokens
        const now = Date.now();
        const authToken: AuthToken = {
            userId: refreshTokenRecord.user_id,
            email: refreshTokenRecord.email,
            role: refreshTokenRecord.role,
            projectIds,
            permissions,
            expiresAt: now + this.parseExpiration(JWT_EXPIRATION),
            issuedAt: now,
        };

        const newToken = await this.signToken(authToken);
        const newRefreshToken = await this.generateRefreshToken(refreshTokenRecord.user_id);

        await this.logAuthAction(refreshTokenRecord.user_id, 'token_refreshed', 'auth', true);

        return {
            token: newToken,
            refreshToken: newRefreshToken,
            expiresAt: authToken.expiresAt,
        };
    }

    /**
     * Verify and decode a JWT token
     */
    async verifyToken(token: string): Promise<AuthToken> {
        try {
            // Simple JWT verification (in production, use a proper JWT library)
            const [header, payload, signature] = token.split('.');
            if (!header || !payload || !signature) {
                throw new Error('Invalid token format');
            }

            const decodedPayload = JSON.parse(atob(payload)) as AuthToken;

            // Verify expiration
            if (Date.now() > decodedPayload.expiresAt) {
                throw new Error('Token expired');
            }

            // Verify signature (simplified)
            const expectedSignature = await this.createSignature(header + '.' + payload);
            if (signature !== expectedSignature) {
                throw new Error('Invalid token signature');
            }

            // Verify user is still active
            const user = this.db.query('SELECT is_active FROM users WHERE id = ?').get(decodedPayload.userId) as { is_active: number } | null;
            if (!user || !user.is_active) {
                throw new Error('User account is disabled');
            }

            return decodedPayload;
        } catch (error) {
            throw new Error('Invalid token');
        }
    }

    /**
     * Logout and revoke refresh tokens
     */
    async logout(userId: string, refreshToken?: string): Promise<void> {
        if (refreshToken) {
            const tokenHash = await this.hashPassword(refreshToken);
            this.db.query('UPDATE refresh_tokens SET is_revoked = 1 WHERE token_hash = ?').run(tokenHash);
        }

        // Revoke all refresh tokens for user
        this.db.query('UPDATE refresh_tokens SET is_revoked = 1 WHERE user_id = ?').run(userId);

        await this.logAuthAction(userId, 'logout', 'auth', true);
        log.info('User logged out', { userId });
    }

    /**
     * Get user's project IDs
     */
    private async getUserProjectIds(userId: string): Promise<string[]> {
        const result = this.db.query(`
            SELECT project_id FROM user_project_access WHERE user_id = ?
        `).all(userId) as Array<{ project_id: string }>;

        return result.map(r => r.project_id);
    }

    /**
     * Get permissions for a role
     */
    private getRolePermissions(role: User['role']): string[] {
        switch (role) {
            case 'admin':
                return ['*']; // All permissions
            case 'agent_operator':
                return [
                    'sessions.create',
                    'sessions.view',
                    'sessions.manage',
                    'agents.view',
                    'agents.message',
                    'projects.view',
                    'councils.participate'
                ];
            case 'viewer':
                return [
                    'sessions.view',
                    'agents.view',
                    'projects.view'
                ];
            default:
                return [];
        }
    }

    /**
     * Hash a password or token
     */
    private async hashPassword(password: string): Promise<string> {
        // Simple hash (use bcrypt or similar in production)
        const encoder = new TextEncoder();
        const data = encoder.encode(password + JWT_SECRET);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Verify a password against its hash
     */
    private async verifyPassword(password: string, hash: string): Promise<boolean> {
        const computedHash = await this.hashPassword(password);
        return computedHash === hash;
    }

    /**
     * Generate a refresh token
     */
    private async generateRefreshToken(userId: string): Promise<string> {
        const tokenId = crypto.randomUUID();
        const tokenValue = tokenId + ':' + crypto.randomUUID();
        const tokenHash = await this.hashPassword(tokenValue);
        const expiresAt = Date.now() + this.parseExpiration(REFRESH_TOKEN_EXPIRATION);

        this.db.query(`
            INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(tokenId, userId, tokenHash, expiresAt, Date.now());

        return tokenValue;
    }

    /**
     * Sign a JWT token
     */
    private async signToken(authToken: AuthToken): Promise<string> {
        const header = { alg: 'HS256', typ: 'JWT' };
        const encodedHeader = btoa(JSON.stringify(header));
        const encodedPayload = btoa(JSON.stringify(authToken));

        const signature = await this.createSignature(encodedHeader + '.' + encodedPayload);

        return encodedHeader + '.' + encodedPayload + '.' + signature;
    }

    /**
     * Create signature for JWT
     */
    private async createSignature(data: string): Promise<string> {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(JWT_SECRET);
        const messageData = encoder.encode(data);

        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', key, messageData);
        return btoa(String.fromCharCode(...new Uint8Array(signature)));
    }

    /**
     * Parse expiration string to milliseconds
     */
    private parseExpiration(expiration: string): number {
        const match = expiration.match(/^(\d+)([mhd])$/);
        if (!match) return 24 * 60 * 60 * 1000; // Default 24 hours

        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: return 24 * 60 * 60 * 1000;
        }
    }

    /**
     * Log authentication actions for audit
     */
    private async logAuthAction(
        userId: string | undefined,
        action: string,
        resource: string,
        success: boolean,
        ipAddress?: string,
        userAgent?: string,
        details?: string
    ): Promise<void> {
        try {
            this.db.query(`
                INSERT INTO auth_audit_log (id, user_id, action, resource, success, ip_address, user_agent, timestamp, details)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                crypto.randomUUID(),
                userId || null,
                action,
                resource,
                success ? 1 : 0,
                ipAddress || null,
                userAgent || null,
                Date.now(),
                details || null
            );
        } catch (error) {
            log.error('Failed to log auth action', {
                action,
                resource,
                success,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Clean up expired refresh tokens
     */
    async cleanupExpiredTokens(): Promise<number> {
        const result = this.db.query(`
            DELETE FROM refresh_tokens WHERE expires_at < ? OR is_revoked = 1
        `).run(Date.now());

        if (result.changes > 0) {
            log.info(`Cleaned up ${result.changes} expired refresh tokens`);
        }

        return result.changes;
    }

    /**
     * Get authentication statistics
     */
    getAuthStats(): {
        activeUsers: number;
        totalUsers: number;
        activeTokens: number;
        recentLogins: number;
    } {
        const activeUsers = this.db.query('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get() as { count: number };
        const totalUsers = this.db.query('SELECT COUNT(*) as count FROM users').get() as { count: number };
        const activeTokens = this.db.query('SELECT COUNT(*) as count FROM refresh_tokens WHERE expires_at > ? AND is_revoked = 0').get(Date.now()) as { count: number };
        const recentLogins = this.db.query('SELECT COUNT(*) as count FROM users WHERE last_login_at > ?').get(Date.now() - 24 * 60 * 60 * 1000) as { count: number };

        return {
            activeUsers: activeUsers.count,
            totalUsers: totalUsers.count,
            activeTokens: activeTokens.count,
            recentLogins: recentLogins.count,
        };
    }
}