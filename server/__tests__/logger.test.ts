import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createLogger } from '../lib/logger';

// ── Helpers ──────────────────────────────────────────────────────────────────

let capturedStdout: string[] = [];
let capturedStderr: string[] = [];
let origStdoutWrite: typeof process.stdout.write;
let origStderrWrite: typeof process.stderr.write;

function startCapture(): void {
    capturedStdout = [];
    capturedStderr = [];
    origStdoutWrite = process.stdout.write;
    origStderrWrite = process.stderr.write;

    process.stdout.write = ((chunk: string | Uint8Array) => {
        capturedStdout.push(String(chunk));
        return true;
    }) as typeof process.stdout.write;

    process.stderr.write = ((chunk: string | Uint8Array) => {
        capturedStderr.push(String(chunk));
        return true;
    }) as typeof process.stderr.write;
}

function stopCapture(): void {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
}

// We need fresh logger instances for each test since getMinLevel() is captured
// at createLogger() call time. We'll manipulate LOG_LEVEL env var before
// creating the logger.

let savedLogLevel: string | undefined;
let savedLogFormat: string | undefined;
let savedNodeEnv: string | undefined;

beforeEach(() => {
    savedLogLevel = process.env.LOG_LEVEL;
    savedLogFormat = process.env.LOG_FORMAT;
    savedNodeEnv = process.env.NODE_ENV;
});

afterEach(() => {
    stopCapture();
    if (savedLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = savedLogLevel;
    if (savedLogFormat === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = savedLogFormat;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
});

// Note: LOG_FORMAT is evaluated at module-load time (IIFE), so we can't easily
// switch between json/text within a single test run. We test text format (the
// default in non-production) and verify structure.

// ── createLogger ─────────────────────────────────────────────────────────────

describe('createLogger', () => {
    it('returns an object with debug, info, warn, error, and child methods', () => {
        const log = createLogger('TestModule');
        expect(typeof log.debug).toBe('function');
        expect(typeof log.info).toBe('function');
        expect(typeof log.warn).toBe('function');
        expect(typeof log.error).toBe('function');
        expect(typeof log.child).toBe('function');
    });
});

// ── Log output ───────────────────────────────────────────────────────────────

describe('log output', () => {
    it('info writes to stdout', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.info('hello');
        stopCapture();
        expect(capturedStdout.length).toBeGreaterThan(0);
        expect(capturedStdout[0]).toContain('hello');
    });

    it('debug writes to stdout', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.debug('debug msg');
        stopCapture();
        expect(capturedStdout.length).toBeGreaterThan(0);
        expect(capturedStdout[0]).toContain('debug msg');
    });

    it('warn writes to stderr', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.warn('warning');
        stopCapture();
        expect(capturedStderr.length).toBeGreaterThan(0);
        expect(capturedStderr[0]).toContain('warning');
    });

    it('error writes to stderr', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.error('err msg');
        stopCapture();
        expect(capturedStderr.length).toBeGreaterThan(0);
        expect(capturedStderr[0]).toContain('err msg');
    });

    it('includes module name in output', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('MyModule');
        startCapture();
        log.info('test');
        stopCapture();
        expect(capturedStdout[0]).toContain('MyModule');
    });

    it('includes structured context in output', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.info('with ctx', { key: 'value', num: 42 });
        stopCapture();
        const output = capturedStdout[0];
        expect(output).toContain('key');
        expect(output).toContain('value');
    });

    it('output ends with newline', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.info('newline test');
        stopCapture();
        expect(capturedStdout[0]).toEndWith('\n');
    });
});

// ── Log level filtering ──────────────────────────────────────────────────────

describe('log level filtering', () => {
    it('debug level shows all messages', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.debug('d');
        log.info('i');
        log.warn('w');
        log.error('e');
        stopCapture();
        // debug and info go to stdout, warn and error to stderr
        expect(capturedStdout.length).toBe(2);
        expect(capturedStderr.length).toBe(2);
    });

    it('info level filters out debug', () => {
        process.env.LOG_LEVEL = 'info';
        const log = createLogger('Test');
        startCapture();
        log.debug('should be filtered');
        log.info('visible');
        stopCapture();
        expect(capturedStdout.length).toBe(1);
        expect(capturedStdout[0]).toContain('visible');
    });

    it('warn level filters out debug and info', () => {
        process.env.LOG_LEVEL = 'warn';
        const log = createLogger('Test');
        startCapture();
        log.debug('hidden');
        log.info('hidden');
        log.warn('visible');
        log.error('visible');
        stopCapture();
        expect(capturedStdout.length).toBe(0);
        expect(capturedStderr.length).toBe(2);
    });

    it('error level filters out debug, info, and warn', () => {
        process.env.LOG_LEVEL = 'error';
        const log = createLogger('Test');
        startCapture();
        log.debug('hidden');
        log.info('hidden');
        log.warn('hidden');
        log.error('visible');
        stopCapture();
        expect(capturedStdout.length).toBe(0);
        expect(capturedStderr.length).toBe(1);
    });

    it('defaults to info when LOG_LEVEL is unset', () => {
        delete process.env.LOG_LEVEL;
        const log = createLogger('Test');
        startCapture();
        log.debug('hidden');
        log.info('visible');
        stopCapture();
        expect(capturedStdout.length).toBe(1);
        expect(capturedStdout[0]).toContain('visible');
    });

    it('defaults to info for invalid LOG_LEVEL', () => {
        process.env.LOG_LEVEL = 'INVALID';
        const log = createLogger('Test');
        startCapture();
        log.debug('hidden');
        log.info('visible');
        stopCapture();
        expect(capturedStdout.length).toBe(1);
    });
});

// ── Child logger ─────────────────────────────────────────────────────────────

describe('child logger', () => {
    it('returns a Logger with all methods', () => {
        const parent = createLogger('Parent');
        const child = parent.child('Child');
        expect(typeof child.debug).toBe('function');
        expect(typeof child.info).toBe('function');
        expect(typeof child.warn).toBe('function');
        expect(typeof child.error).toBe('function');
        expect(typeof child.child).toBe('function');
    });

    it('includes parent:child module name in output', () => {
        process.env.LOG_LEVEL = 'debug';
        const parent = createLogger('Parent');
        const child = parent.child('Child');
        startCapture();
        child.info('child message');
        stopCapture();
        expect(capturedStdout[0]).toContain('Parent:Child');
    });

    it('supports nested children', () => {
        process.env.LOG_LEVEL = 'debug';
        const grandchild = createLogger('A').child('B').child('C');
        startCapture();
        grandchild.info('nested');
        stopCapture();
        expect(capturedStdout[0]).toContain('A:B:C');
    });
});

// ── Empty / edge cases ───────────────────────────────────────────────────────

describe('edge cases', () => {
    it('handles empty message', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.info('');
        stopCapture();
        expect(capturedStdout.length).toBe(1);
    });

    it('handles empty context object', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.info('msg', {});
        stopCapture();
        expect(capturedStdout.length).toBe(1);
    });

    it('handles special characters in message', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('Test');
        startCapture();
        log.info('hello "world" <>&');
        stopCapture();
        expect(capturedStdout[0]).toContain('hello "world" <>&');
    });
});
