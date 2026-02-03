import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('SpendingTracker');

const DAILY_ALGO_LIMIT_MICRO = parseInt(process.env.DAILY_ALGO_LIMIT_MICRO ?? '10000000', 10); // 10 ALGO
const DAILY_API_LIMIT_USD = parseFloat(process.env.DAILY_API_LIMIT_USD ?? '50.00');

interface DailyTotals {
    date: string;
    algoMicro: number;
    apiCostUsd: number;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function ensureRow(db: Database, date: string): void {
    db.query(
        `INSERT OR IGNORE INTO daily_spending (date, algo_micro, api_cost_usd) VALUES (?, 0, 0.0)`
    ).run(date);
}

export function recordAlgoSpend(db: Database, microAlgos: number): void {
    const date = today();
    ensureRow(db, date);
    db.query(
        `UPDATE daily_spending SET algo_micro = algo_micro + ? WHERE date = ?`
    ).run(microAlgos, date);
}

export function recordApiCost(db: Database, usd: number): void {
    const date = today();
    ensureRow(db, date);
    db.query(
        `UPDATE daily_spending SET api_cost_usd = api_cost_usd + ? WHERE date = ?`
    ).run(usd, date);
}

export function getDailyTotals(db: Database): DailyTotals {
    const date = today();
    ensureRow(db, date);
    const row = db.query(
        `SELECT date, algo_micro, api_cost_usd FROM daily_spending WHERE date = ?`
    ).get(date) as { date: string; algo_micro: number; api_cost_usd: number };
    return {
        date: row.date,
        algoMicro: row.algo_micro,
        apiCostUsd: row.api_cost_usd,
    };
}

export function checkAlgoLimit(db: Database, additionalMicro: number): void {
    const totals = getDailyTotals(db);
    const projected = totals.algoMicro + additionalMicro;
    if (projected > DAILY_ALGO_LIMIT_MICRO) {
        const limitAlgo = (DAILY_ALGO_LIMIT_MICRO / 1_000_000).toFixed(6);
        const currentAlgo = (totals.algoMicro / 1_000_000).toFixed(6);
        const message = `Daily ALGO spending limit reached: ${currentAlgo}/${limitAlgo} ALGO`;
        log.warn(message);
        throw new Error(message);
    }
}

export function checkApiLimit(db: Database, additionalUsd: number): void {
    const totals = getDailyTotals(db);
    const projected = totals.apiCostUsd + additionalUsd;
    if (projected > DAILY_API_LIMIT_USD) {
        const message = `Daily API spending limit reached: $${totals.apiCostUsd.toFixed(2)}/$${DAILY_API_LIMIT_USD.toFixed(2)}`;
        log.warn(message);
        throw new Error(message);
    }
}

export function getSpendingLimits(): { algoMicro: number; apiUsd: number } {
    return { algoMicro: DAILY_ALGO_LIMIT_MICRO, apiUsd: DAILY_API_LIMIT_USD };
}
