import type { Database, SQLQueryBindings } from 'bun:sqlite';

/** Row shape returned by `SELECT COUNT(*) as cnt …` */
export interface CountRow {
  cnt: number;
}

/** Execute a `SELECT COUNT(*) as cnt …` query and return the count. */
export function queryCount(db: Database, sql: string, ...params: SQLQueryBindings[]): number {
  const row = db.query(sql).get(...params) as CountRow | null;
  return row?.cnt ?? 0;
}

/** Convenience: returns true when the count query yields > 0 rows. */
export function queryExists(db: Database, sql: string, ...params: SQLQueryBindings[]): boolean {
  return queryCount(db, sql, ...params) > 0;
}

/** Generic paginated result wrapper. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

/** Row with a string id column. */
export interface IdRow {
  id: string;
}

/** Row with a numeric id column. */
export interface NumericIdRow {
  id: number;
}
