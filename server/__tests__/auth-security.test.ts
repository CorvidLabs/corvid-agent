import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { JWTService } from '../auth/jwt-service';

let testDb: Database;
let jwtService: JWTService;

beforeAll(() => {
    testDb = new Database(':memory:');

    // Create the minimal schema needed for JWTService (projects table is referenced by FK)
    testDb.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            working_dir TEXT NOT NULL,
            claude_md TEXT DEFAULT '',
            env_vars TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    jwtService = new JWTService(testDb);
});

afterAll(() => {
    testDb.close();
});

describe('Password Hashing - Argon2id', () => {
    it('should create users with argon2id password hashes', async () => {
        const user = await jwtService.createUser('test-argon2@test.com', 'securePass123', 'viewer');
        expect(user).toBeDefined();
        expect(user.email).toBe('test-argon2@test.com');

        // Verify the stored hash is argon2id format
        const row = testDb.query('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string };
        expect(row.password_hash).toMatch(/^\$argon2id\$/);
    });

    it('should authenticate users with argon2id hashes', async () => {
        const result = await jwtService.login('test-argon2@test.com', 'securePass123');
        expect(result).toBeDefined();
        expect(result.token).toBeTruthy();
        expect(result.refreshToken).toBeTruthy();
        expect(result.user.email).toBe('test-argon2@test.com');
    });

    it('should reject invalid passwords', async () => {
        await expect(
            jwtService.login('test-argon2@test.com', 'wrongPassword')
        ).rejects.toThrow('Invalid credentials');
    });

    it('should reject non-existent users', async () => {
        await expect(
            jwtService.login('nonexistent@test.com', 'anyPassword')
        ).rejects.toThrow('Invalid credentials');
    });
});

describe('Legacy SHA-256 Hash Migration', () => {
    it('should authenticate and migrate legacy SHA-256 hashes to argon2id', async () => {
        // Manually insert a user with a legacy SHA-256 hash
        // Legacy hash = SHA-256(password + hardcoded_secret)
        const legacyUserId = crypto.randomUUID();
        const password = 'legacyPass123';
        const secret = 'corvid-agent-jwt-secret-change-in-production';

        const encoder = new TextEncoder();
        const data = encoder.encode(password + secret);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const legacyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        testDb.query(`
            INSERT INTO users (id, email, password_hash, role, created_at, is_active, must_change_password)
            VALUES (?, ?, ?, ?, ?, 1, 0)
        `).run(legacyUserId, 'legacy@test.com', legacyHash, 'viewer', Date.now());

        // Verify the hash is in legacy format
        const beforeRow = testDb.query('SELECT password_hash FROM users WHERE id = ?').get(legacyUserId) as { password_hash: string };
        expect(beforeRow.password_hash).toMatch(/^[0-9a-f]{64}$/);

        // Login should succeed with legacy hash
        const result = await jwtService.login('legacy@test.com', password);
        expect(result).toBeDefined();
        expect(result.token).toBeTruthy();

        // After login, the hash should be migrated to argon2id
        const afterRow = testDb.query('SELECT password_hash FROM users WHERE id = ?').get(legacyUserId) as { password_hash: string };
        expect(afterRow.password_hash).toMatch(/^\$argon2id\$/);

        // Should still be able to login with the new hash
        const result2 = await jwtService.login('legacy@test.com', password);
        expect(result2).toBeDefined();
        expect(result2.token).toBeTruthy();
    });
});

describe('Force Password Change', () => {
    it('should set mustChangePassword for default admin', async () => {
        // The default admin was created in beforeAll via the JWTService constructor
        const defaultAdmin = testDb.query(
            'SELECT must_change_password FROM users WHERE email = ?'
        ).get('admin@corvid-agent.local') as { must_change_password: number } | null;

        expect(defaultAdmin).not.toBeNull();
        expect(defaultAdmin!.must_change_password).toBe(1);
    });

    it('should return mustChangePassword flag in login response for default admin', async () => {
        const result = await jwtService.login('admin@corvid-agent.local', 'admin123');
        expect(result.mustChangePassword).toBe(true);
    });

    it('should not set mustChangePassword for normal users', async () => {
        const user = await jwtService.createUser('normal@test.com', 'normalPass123', 'viewer');

        const row = testDb.query(
            'SELECT must_change_password FROM users WHERE id = ?'
        ).get(user.id) as { must_change_password: number };

        expect(row.must_change_password).toBe(0);

        const result = await jwtService.login('normal@test.com', 'normalPass123');
        expect(result.mustChangePassword).toBeUndefined();
    });
});

describe('Change Password', () => {
    let testUserId: string;

    beforeAll(async () => {
        const user = await jwtService.createUser('changepw@test.com', 'oldPassword123', 'viewer');
        testUserId = user.id;
    });

    it('should change password successfully', async () => {
        await jwtService.changePassword(testUserId, 'oldPassword123', 'newPassword456');

        // Should be able to login with new password
        const result = await jwtService.login('changepw@test.com', 'newPassword456');
        expect(result).toBeDefined();
        expect(result.token).toBeTruthy();
    });

    it('should reject wrong old password', async () => {
        await expect(
            jwtService.changePassword(testUserId, 'wrongOldPassword', 'anotherNew123')
        ).rejects.toThrow('Invalid old password');
    });

    it('should reject short new password', async () => {
        await expect(
            jwtService.changePassword(testUserId, 'newPassword456', 'short')
        ).rejects.toThrow('New password must be at least 8 characters');
    });

    it('should reject same old and new password', async () => {
        await expect(
            jwtService.changePassword(testUserId, 'newPassword456', 'newPassword456')
        ).rejects.toThrow('New password must be different from old password');
    });

    it('should clear mustChangePassword flag after password change', async () => {
        // Set the flag manually
        testDb.query('UPDATE users SET must_change_password = 1 WHERE id = ?').run(testUserId);

        await jwtService.changePassword(testUserId, 'newPassword456', 'finalPassword789');

        const row = testDb.query('SELECT must_change_password FROM users WHERE id = ?').get(testUserId) as { must_change_password: number };
        expect(row.must_change_password).toBe(0);
    });

    it('should revoke all refresh tokens after password change', async () => {
        // Login to create a refresh token
        await jwtService.login('changepw@test.com', 'finalPassword789');

        const beforeTokens = testDb.query(
            'SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ? AND is_revoked = 0'
        ).get(testUserId) as { count: number };
        expect(beforeTokens.count).toBeGreaterThan(0);

        // Change password
        await jwtService.changePassword(testUserId, 'finalPassword789', 'ultraNewPass123');

        const afterTokens = testDb.query(
            'SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ? AND is_revoked = 0'
        ).get(testUserId) as { count: number };
        expect(afterTokens.count).toBe(0);
    });
});

describe('Token Operations', () => {
    it('should generate and verify JWT tokens', async () => {
        const loginResult = await jwtService.login('test-argon2@test.com', 'securePass123');
        const token = loginResult.token;

        const verified = await jwtService.verifyToken(token);
        expect(verified).toBeDefined();
        expect(verified.email).toBe('test-argon2@test.com');
        expect(verified.role).toBe('viewer');
    });

    it('should reject tampered tokens', async () => {
        const loginResult = await jwtService.login('test-argon2@test.com', 'securePass123');
        const token = loginResult.token;

        // Tamper with the token
        const parts = token.split('.');
        parts[1] = btoa(JSON.stringify({ ...JSON.parse(atob(parts[1])), role: 'admin' }));
        const tamperedToken = parts.join('.');

        await expect(jwtService.verifyToken(tamperedToken)).rejects.toThrow('Invalid token');
    });

    it('should handle token refresh flow', async () => {
        const loginResult = await jwtService.login('test-argon2@test.com', 'securePass123');

        const refreshResult = await jwtService.refreshToken(loginResult.refreshToken);
        expect(refreshResult).toBeDefined();
        expect(refreshResult.token).toBeTruthy();
        expect(refreshResult.refreshToken).toBeTruthy();

        // Old refresh token should now be revoked
        await expect(
            jwtService.refreshToken(loginResult.refreshToken)
        ).rejects.toThrow('Invalid or expired refresh token');
    });

    it('should handle logout by revoking tokens', async () => {
        const loginResult = await jwtService.login('test-argon2@test.com', 'securePass123');

        await jwtService.logout(loginResult.user.id, loginResult.refreshToken);

        // Refresh token should now be invalid
        await expect(
            jwtService.refreshToken(loginResult.refreshToken)
        ).rejects.toThrow('Invalid or expired refresh token');
    });
});

describe('Audit Logging', () => {
    it('should log authentication events', async () => {
        // Login to generate audit events
        await jwtService.login('test-argon2@test.com', 'securePass123');

        // Check audit log
        const auditEntries = testDb.query(
            'SELECT action, success FROM auth_audit_log WHERE action = ? ORDER BY timestamp DESC LIMIT 1'
        ).get('login_success') as { action: string; success: number } | null;

        expect(auditEntries).not.toBeNull();
        expect(auditEntries!.action).toBe('login_success');
        expect(auditEntries!.success).toBe(1);
    });

    it('should log failed login attempts', async () => {
        try {
            await jwtService.login('test-argon2@test.com', 'wrongPassword');
        } catch {
            // Expected
        }

        const auditEntries = testDb.query(
            'SELECT action, success, details FROM auth_audit_log WHERE action = ? ORDER BY timestamp DESC LIMIT 1'
        ).get('login_failed') as { action: string; success: number; details: string } | null;

        expect(auditEntries).not.toBeNull();
        expect(auditEntries!.action).toBe('login_failed');
        expect(auditEntries!.success).toBe(0);
    });
});

describe('Auth Statistics', () => {
    it('should return accurate auth stats', () => {
        const stats = jwtService.getAuthStats();

        expect(stats.totalUsers).toBeGreaterThan(0);
        expect(stats.activeUsers).toBeGreaterThan(0);
        expect(typeof stats.activeTokens).toBe('number');
        expect(typeof stats.recentLogins).toBe('number');
    });
});
