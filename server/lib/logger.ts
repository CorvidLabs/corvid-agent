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

function getMinLevel(): LogLevel {
    const env = process.env.LOG_LEVEL?.toLowerCase();
    if (env && env in LEVEL_ORDER) return env as LogLevel;
    return 'info';
}

function formatContext(ctx?: Record<string, unknown>): string {
    if (!ctx || Object.keys(ctx).length === 0) return '';
    return ' ' + JSON.stringify(ctx);
}

function formatLine(level: LogLevel, module: string, msg: string, ctx?: Record<string, unknown>): string {
    const ts = new Date().toISOString();
    return `${ts} ${LEVEL_LABELS[level]} [${module}] ${msg}${formatContext(ctx)}`;
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
