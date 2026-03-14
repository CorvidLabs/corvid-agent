import { describe, test, expect, mock, spyOn } from 'bun:test';
import { truncate, formatUptime, resolveProjectFromCwd, handleError } from '../../cli/utils';

describe('truncate', () => {
    test('returns string unchanged when under max', () => {
        expect(truncate('hello', 10)).toBe('hello');
    });

    test('returns string unchanged when exactly at max', () => {
        expect(truncate('hello', 5)).toBe('hello');
    });

    test('truncates and appends ellipsis when over max', () => {
        expect(truncate('hello world', 8)).toBe('hello w…');
    });

    test('handles single character max', () => {
        expect(truncate('hello', 1)).toBe('…');
    });

    test('handles empty string', () => {
        expect(truncate('', 5)).toBe('');
    });
});

describe('formatUptime', () => {
    test('formats minutes only', () => {
        expect(formatUptime(300)).toBe('5m');
    });

    test('formats hours and minutes', () => {
        expect(formatUptime(3720)).toBe('1h 2m');
    });

    test('formats days and hours', () => {
        expect(formatUptime(90000)).toBe('1d 1h');
    });

    test('formats zero seconds', () => {
        expect(formatUptime(0)).toBe('0m');
    });

    test('omits zero minutes for hours', () => {
        expect(formatUptime(7200)).toBe('2h 0m');
    });
});

describe('resolveProjectFromCwd', () => {
    function mockClient(projects: Array<{ id: string; workingDir: string }>) {
        return { get: mock(() => Promise.resolve(projects)) } as unknown as import('../../cli/client').CorvidClient;
    }

    test('returns exact match project id', async () => {
        const cwd = process.cwd();
        const client = mockClient([{ id: 'proj-1', workingDir: cwd }]);
        expect(await resolveProjectFromCwd(client)).toBe('proj-1');
    });

    test('returns prefix match project id', async () => {
        const cwd = process.cwd();
        const sep = require('node:path').sep;
        const parentDir = cwd.split(sep).slice(0, -1).join(sep);
        const client = mockClient([{ id: 'proj-2', workingDir: parentDir }]);
        expect(await resolveProjectFromCwd(client)).toBe('proj-2');
    });

    test('returns undefined when no match', async () => {
        const client = mockClient([{ id: 'proj-3', workingDir: '/nonexistent/path' }]);
        expect(await resolveProjectFromCwd(client)).toBeUndefined();
    });

    test('returns undefined on client error', async () => {
        const client = { get: mock(() => Promise.reject(new Error('network error'))) } as unknown as import('../../cli/client').CorvidClient;
        expect(await resolveProjectFromCwd(client)).toBeUndefined();
    });
});

describe('handleError', () => {
    test('extracts message from Error object and exits', () => {
        const exitSpy = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            handleError(new Error('test error'));
            expect(exitSpy).toHaveBeenCalledWith(1);
        } finally {
            exitSpy.mockRestore();
            stderrSpy.mockRestore();
        }
    });

    test('converts non-Error value to string', () => {
        const exitSpy = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            handleError('plain string error');
            expect(exitSpy).toHaveBeenCalledWith(1);
        } finally {
            exitSpy.mockRestore();
            stderrSpy.mockRestore();
        }
    });
});
