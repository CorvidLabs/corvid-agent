import { hostname } from 'node:os';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
    debug: 'DEBUG',
    info: 'INFO ',
    warn: 'WARN ',
    error: 'ERROR',
};

// Default to JSON in production, text otherwise. Explicit LOG_FORMAT overrides.
const LOG_FORMAT = (() => {
    const explicit = process.env.LOG_FORMAT?.toLowerCase();
    if (explicit === 'json' || explicit === 'text') return explicit;
    return process.env.NODE_ENV === 'production' ? 'json' : 'text';
})();

const HOST = hostname();
const PID = process.pid;

function getMinLevel(): LogLevel {
    const env = process.env.LOG_LEVEL?.toLowerCase();
    if (env && env in LEVEL_ORDER) return env as LogLevel;
    return 'info';
}

function formatContext(ctx?: Record<string, unknown>): string {
    if (!ctx || Object.keys(ctx).length === 0) return '';
    return ' ' + JSON.stringify(ctx);
}

/**
 * Get trace context from AsyncLocalStorage if the observability module is loaded.
 * We use a lazy import to avoid circular dependencies — the observability module
 * imports the logger, so the logger must not synchronously import observability.
 */
let _getTraceId: (() => string | undefined) | null = null;
let _getRequestId: (() => string | undefined) | null = null;
let _traceContextLoaded = false;

function loadTraceContext(): void {
    if (_traceContextLoaded) return;
    _traceContextLoaded = true;
    try {
        // Dynamic require to avoid circular dependency at module load time.
        // The observability/trace-context module is side-effect-free.
        const mod = require('../observability/trace-context');
        _getTraceId = mod.getTraceId;
        _getRequestId = mod.getRequestId;
    } catch {
        // Trace context not available — that's fine
    }
}

function getTraceContext(): { traceId?: string; requestId?: string } {
    loadTraceContext();
    return {
        traceId: _getTraceId?.(),
        requestId: _getRequestId?.(),
    };
}

function formatLine(level: LogLevel, module: string, msg: string, ctx?: Record<string, unknown>): string {
    const traceCtx = getTraceContext();

    if (LOG_FORMAT === 'json') {
        const entry: Record<string, unknown> = {
            timestamp: new Date().toISOString(),
            level,
            module,
            message: msg,
            pid: PID,
            hostname: HOST,
        };
        if (traceCtx.traceId) entry.traceId = traceCtx.traceId;
        if (traceCtx.requestId) entry.requestId = traceCtx.requestId;
        if (ctx && Object.keys(ctx).length > 0) {
            Object.assign(entry, ctx);
        }
        return JSON.stringify(entry);
    }

    const ts = new Date().toISOString();
    const tracePrefix = traceCtx.traceId ? ` trace=${traceCtx.traceId.slice(0, 8)}` : '';
    return `${ts} ${LEVEL_LABELS[level]} [${module}]${tracePrefix} ${msg}${formatContext(ctx)}`;
}

export interface Logger {
    debug(msg: string, ctx?: Record<string, unknown>): void;
    info(msg: string, ctx?: Record<string, unknown>): void;
    warn(msg: string, ctx?: Record<string, unknown>): void;
    error(msg: string, ctx?: Record<string, unknown>): void;
    child(module: string): Logger;
}

export function createLogger(module: string): Logger {
    const minLevel = getMinLevel();

    function shouldLog(level: LogLevel): boolean {
        return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
    }

    return {
        debug(msg: string, ctx?: Record<string, unknown>): void {
            if (!shouldLog('debug')) return;
            process.stdout.write(formatLine('debug', module, msg, ctx) + '\n');
        },

        info(msg: string, ctx?: Record<string, unknown>): void {
            if (!shouldLog('info')) return;
            process.stdout.write(formatLine('info', module, msg, ctx) + '\n');
        },

        warn(msg: string, ctx?: Record<string, unknown>): void {
            if (!shouldLog('warn')) return;
            process.stderr.write(formatLine('warn', module, msg, ctx) + '\n');
        },

        error(msg: string, ctx?: Record<string, unknown>): void {
            if (!shouldLog('error')) return;
            process.stderr.write(formatLine('error', module, msg, ctx) + '\n');
        },

        child(childModule: string): Logger {
            return createLogger(`${module}:${childModule}`);
        },
    };
}
