import type { Database as SQLiteDatabase } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('DatabaseService');

/**
 * Abstract database interface to support multiple database backends
 */
export interface DatabaseConnection {
    query(sql: string, params?: any[]): QueryResult;
    exec(sql: string): void;
    transaction<T>(fn: () => T): T;
    close(): void;
}

export interface QueryResult {
    run(...params: any[]): { changes: number; lastInsertRowid?: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
    type: 'sqlite' | 'postgres';
    connectionString?: string;
    sqlitePath?: string;
    pool?: {
        min: number;
        max: number;
    };
}

/**
 * SQLite database wrapper
 */
class SQLiteWrapper implements DatabaseConnection {
    constructor(private db: SQLiteDatabase) {}

    query(sql: string, params: any[] = []): QueryResult {
        const statement = this.db.query(sql);
        return {
            run: (...runParams: any[]) => {
                const actualParams = runParams.length ? runParams : params;
                const result = statement.run(...actualParams);
                return {
                    changes: result.changes,
                    lastInsertRowid: result.lastInsertRowid as number | undefined,
                };
            },
            get: (...getParams: any[]) => {
                const actualParams = getParams.length ? getParams : params;
                return statement.get(...actualParams);
            },
            all: (...allParams: any[]) => {
                const actualParams = allParams.length ? allParams : params;
                return statement.all(...actualParams);
            },
        };
    }

    exec(sql: string): void {
        this.db.exec(sql);
    }

    transaction<T>(fn: () => T): T {
        return this.db.transaction(fn)();
    }

    close(): void {
        this.db.close();
    }
}

/**
 * PostgreSQL database wrapper (placeholder for future implementation)
 */
class PostgreSQLWrapper implements DatabaseConnection {
    constructor(private connectionString: string) {
        // TODO: Implement PostgreSQL connection
        throw new Error('PostgreSQL support not yet implemented');
    }

    query(sql: string, params: any[] = []): QueryResult {
        throw new Error('PostgreSQL support not yet implemented');
    }

    exec(sql: string): void {
        throw new Error('PostgreSQL support not yet implemented');
    }

    transaction<T>(fn: () => T): T {
        throw new Error('PostgreSQL support not yet implemented');
    }

    close(): void {
        // TODO: Close PostgreSQL connection
    }
}

/**
 * Database service that supports dual-write for migrations
 */
export class DatabaseService {
    private primary: DatabaseConnection;
    private secondary?: DatabaseConnection;
    private config: DatabaseConfig;
    private dualWriteMode = false;

    constructor(config: DatabaseConfig, primaryDb?: SQLiteDatabase) {
        this.config = config;

        if (config.type === 'sqlite') {
            if (!primaryDb) {
                throw new Error('SQLite database instance required');
            }
            this.primary = new SQLiteWrapper(primaryDb);
        } else if (config.type === 'postgres') {
            if (!config.connectionString) {
                throw new Error('PostgreSQL connection string required');
            }
            this.primary = new PostgreSQLWrapper(config.connectionString);
        } else {
            throw new Error(`Unsupported database type: ${config.type}`);
        }

        log.info('Database service initialized', {
            type: config.type,
            dualWrite: this.dualWriteMode,
        });
    }

    /**
     * Enable dual-write mode for database migration
     */
    enableDualWrite(secondaryConfig: DatabaseConfig, secondaryDb?: SQLiteDatabase): void {
        if (secondaryConfig.type === 'sqlite') {
            if (!secondaryDb) {
                throw new Error('Secondary SQLite database instance required');
            }
            this.secondary = new SQLiteWrapper(secondaryDb);
        } else if (secondaryConfig.type === 'postgres') {
            if (!secondaryConfig.connectionString) {
                throw new Error('Secondary PostgreSQL connection string required');
            }
            this.secondary = new PostgreSQLWrapper(secondaryConfig.connectionString);
        }

        this.dualWriteMode = true;
        log.info('Dual-write mode enabled', {
            primary: this.config.type,
            secondary: secondaryConfig.type,
        });
    }

    /**
     * Disable dual-write mode and switch primary database
     */
    switchToPrimary(newPrimary: 'primary' | 'secondary'): void {
        if (!this.secondary) {
            log.warn('Cannot switch: no secondary database configured');
            return;
        }

        if (newPrimary === 'secondary') {
            // Switch secondary to primary
            const oldPrimary = this.primary;
            this.primary = this.secondary;
            this.secondary = oldPrimary;

            log.info('Switched secondary database to primary');
        }

        this.dualWriteMode = false;
        this.secondary = undefined;

        log.info('Dual-write mode disabled, using single primary database');
    }

    /**
     * Execute a query (reads from primary only)
     */
    query(sql: string, params?: any[]): QueryResult {
        try {
            return this.primary.query(sql, params);
        } catch (error) {
            log.error('Primary database query failed', {
                sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Execute a write operation (dual-write if enabled)
     */
    write(sql: string, params?: any[]): { changes: number; lastInsertRowid?: number } {
        let primaryResult: { changes: number; lastInsertRowid?: number };

        try {
            primaryResult = this.primary.query(sql, params).run();
        } catch (error) {
            log.error('Primary database write failed', {
                sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }

        // Dual-write to secondary if enabled
        if (this.dualWriteMode && this.secondary) {
            try {
                const secondaryResult = this.secondary.query(sql, params).run();

                // Log if results differ (potential issue)
                if (secondaryResult.changes !== primaryResult.changes) {
                    log.warn('Dual-write result mismatch', {
                        primaryChanges: primaryResult.changes,
                        secondaryChanges: secondaryResult.changes,
                        sql: sql.substring(0, 100),
                    });
                }
            } catch (error) {
                log.error('Secondary database write failed (dual-write mode)', {
                    sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                    error: error instanceof Error ? error.message : String(error),
                });
                // Don't fail the operation if secondary write fails
            }
        }

        return primaryResult;
    }

    /**
     * Execute raw SQL (dual-write if enabled)
     */
    exec(sql: string): void {
        try {
            this.primary.exec(sql);
        } catch (error) {
            log.error('Primary database exec failed', {
                sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }

        // Dual-write to secondary if enabled
        if (this.dualWriteMode && this.secondary) {
            try {
                this.secondary.exec(sql);
            } catch (error) {
                log.error('Secondary database exec failed (dual-write mode)', {
                    sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                    error: error instanceof Error ? error.message : String(error),
                });
                // Don't fail the operation if secondary exec fails
            }
        }
    }

    /**
     * Execute a transaction
     */
    transaction<T>(fn: () => T): T {
        // For dual-write mode, we need to handle transactions carefully
        if (this.dualWriteMode && this.secondary) {
            // Execute on primary first
            let primaryResult: T;
            try {
                primaryResult = this.primary.transaction(fn);
            } catch (error) {
                log.error('Primary transaction failed', {
                    error: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }

            // Then execute on secondary
            try {
                this.secondary.transaction(fn);
            } catch (error) {
                log.error('Secondary transaction failed (dual-write mode)', {
                    error: error instanceof Error ? error.message : String(error),
                });
                // Log but don't fail - primary succeeded
            }

            return primaryResult;
        } else {
            return this.primary.transaction(fn);
        }
    }

    /**
     * Verify data consistency between primary and secondary databases
     */
    async verifyConsistency(tables: string[]): Promise<{
        consistent: boolean;
        differences: Array<{
            table: string;
            primaryCount: number;
            secondaryCount: number;
        }>;
    }> {
        if (!this.secondary) {
            throw new Error('Cannot verify consistency: no secondary database configured');
        }

        const differences: Array<{
            table: string;
            primaryCount: number;
            secondaryCount: number;
        }> = [];

        for (const table of tables) {
            try {
                const primaryCount = this.primary.query(`SELECT COUNT(*) as count FROM ${table}`).get().count;
                const secondaryCount = this.secondary.query(`SELECT COUNT(*) as count FROM ${table}`).get().count;

                if (primaryCount !== secondaryCount) {
                    differences.push({
                        table,
                        primaryCount,
                        secondaryCount,
                    });
                }
            } catch (error) {
                log.error(`Failed to verify consistency for table ${table}`, {
                    error: error instanceof Error ? error.message : String(error),
                });
                differences.push({
                    table,
                    primaryCount: -1,
                    secondaryCount: -1,
                });
            }
        }

        const consistent = differences.length === 0;

        log.info('Database consistency verification completed', {
            tablesChecked: tables.length,
            consistent,
            differences: differences.length,
        });

        return { consistent, differences };
    }

    /**
     * Get database statistics
     */
    getStats(): {
        type: string;
        dualWriteMode: boolean;
        tables: Array<{ name: string; rows: number }>;
    } {
        const tables: Array<{ name: string; rows: number }> = [];

        try {
            // Get table list (SQLite specific for now)
            const tableNames = this.primary.query(`
                SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
            `).all() as Array<{ name: string }>;

            for (const { name } of tableNames) {
                try {
                    const result = this.primary.query(`SELECT COUNT(*) as count FROM ${name}`).get();
                    tables.push({ name, rows: result.count });
                } catch (error) {
                    log.warn(`Failed to get row count for table ${name}`, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        } catch (error) {
            log.error('Failed to get database statistics', {
                error: error instanceof Error ? error.message : String(error),
            });
        }

        return {
            type: this.config.type,
            dualWriteMode: this.dualWriteMode,
            tables,
        };
    }

    /**
     * Close database connections
     */
    close(): void {
        this.primary.close();
        if (this.secondary) {
            this.secondary.close();
        }
        log.info('Database connections closed');
    }
}