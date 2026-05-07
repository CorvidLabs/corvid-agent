import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { FledgeClient, FledgeError } from '../lib/fledge-client';

// We mock Bun.spawn at the module boundary to avoid actually spawning fledge
let mockSpawnResult: {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const originalSpawn = Bun.spawn;

function mockSpawn() {
  (Bun as any).spawn = mock((..._args: unknown[]) => {
    const stdoutBlob = new Blob([mockSpawnResult.stdout]);
    const stderrBlob = new Blob([mockSpawnResult.stderr]);
    return {
      exited: Promise.resolve(mockSpawnResult.exitCode),
      stdout: stdoutBlob.stream(),
      stderr: stderrBlob.stream(),
      kill: mock(() => {}),
      pid: 12345,
    };
  });
}

beforeEach(() => {
  mockSpawnResult = { exitCode: 0, stdout: '', stderr: '' };
  mockSpawn();
});

afterEach(() => {
  (Bun as any).spawn = originalSpawn;
});

describe('FledgeClient', () => {
  describe('exec', () => {
    test('parses JSON output from successful command', async () => {
      mockSpawnResult = {
        exitCode: 0,
        stdout: '{"ok":true,"address":"TESTADDR","tier":"ephemeral"}\n',
        stderr: '',
      };

      const client = new FledgeClient();
      const result = await client.exec('memory', ['identity']);

      expect(result.ok).toBe(true);
      expect(result.address).toBe('TESTADDR');
      expect(result.tier).toBe('ephemeral');
    });

    test('returns raw output when stdout is not JSON', async () => {
      mockSpawnResult = {
        exitCode: 0,
        stdout: 'fledge 0.5.0\n',
        stderr: '',
      };

      const client = new FledgeClient();
      const result = await client.exec('--version', []);

      expect(result.ok).toBe(true);
      expect(result.raw).toBe('fledge 0.5.0');
    });

    test('throws FledgeError on non-zero exit with JSON error', async () => {
      mockSpawnResult = {
        exitCode: 1,
        stdout: '{"error":"Invalid key format"}\n',
        stderr: '',
      };

      const client = new FledgeClient();
      await expect(client.exec('memory', ['save'])).rejects.toThrow(FledgeError);

      try {
        await client.exec('memory', ['save']);
      } catch (err) {
        expect(err).toBeInstanceOf(FledgeError);
        expect((err as FledgeError).message).toBe('Invalid key format');
        expect((err as FledgeError).exitCode).toBe(1);
      }
    });

    test('throws FledgeError on non-zero exit with stderr', async () => {
      mockSpawnResult = {
        exitCode: 127,
        stdout: '',
        stderr: 'command not found: fledge',
      };

      const client = new FledgeClient();
      try {
        await client.exec('memory', ['identity']);
      } catch (err) {
        expect(err).toBeInstanceOf(FledgeError);
        expect((err as FledgeError).message).toBe('command not found: fledge');
        expect((err as FledgeError).exitCode).toBe(127);
      }
    });

    test('throws FledgeError with generic message when no stderr/JSON', async () => {
      mockSpawnResult = {
        exitCode: 2,
        stdout: '',
        stderr: '',
      };

      const client = new FledgeClient();
      try {
        await client.exec('memory', ['list']);
      } catch (err) {
        expect(err).toBeInstanceOf(FledgeError);
        expect((err as FledgeError).message).toContain('fledge memory exited with code 2');
      }
    });

    test('appends --json flag to all commands', async () => {
      mockSpawnResult = { exitCode: 0, stdout: '{"ok":true}\n', stderr: '' };

      const client = new FledgeClient();
      await client.exec('memory', ['save', '--key', 'test']);

      const spawnCall = (Bun.spawn as any).mock.calls[0];
      const args = spawnCall[0];
      expect(args).toContain('--json');
      expect(args[args.length - 1]).toBe('--json');
    });

    test('sets FLEDGE_NON_INTERACTIVE env var', async () => {
      mockSpawnResult = { exitCode: 0, stdout: '{"ok":true}\n', stderr: '' };

      const client = new FledgeClient();
      await client.exec('memory', ['list']);

      const spawnCall = (Bun.spawn as any).mock.calls[0];
      const opts = spawnCall[1];
      expect(opts.env.FLEDGE_NON_INTERACTIVE).toBe('1');
    });

    test('uses configured cwd', async () => {
      mockSpawnResult = { exitCode: 0, stdout: '{"ok":true}\n', stderr: '' };

      const client = new FledgeClient({ cwd: '/tmp/test-project' });
      await client.exec('memory', ['list']);

      const spawnCall = (Bun.spawn as any).mock.calls[0];
      const opts = spawnCall[1];
      expect(opts.cwd).toBe('/tmp/test-project');
    });

    test('picks first JSON line from multi-line output', async () => {
      mockSpawnResult = {
        exitCode: 0,
        stdout: 'loading plugins...\n{"ok":true,"count":5}\nDone.\n',
        stderr: '',
      };

      const client = new FledgeClient();
      const result = await client.exec('memory', ['list']);

      expect(result.ok).toBe(true);
      expect(result.count).toBe(5);
    });
  });

  describe('memory', () => {
    test('flattens flags into CLI args', async () => {
      mockSpawnResult = { exitCode: 0, stdout: '{"ok":true,"tier":"ephemeral"}\n', stderr: '' };

      const client = new FledgeClient();
      await client.memory('save', { key: 'my-key', value: 'my-value' });

      const spawnCall = (Bun.spawn as any).mock.calls[0];
      const args = spawnCall[0];
      expect(args).toContain('memory');
      expect(args).toContain('save');
      expect(args).toContain('--key');
      expect(args).toContain('my-key');
      expect(args).toContain('--value');
      expect(args).toContain('my-value');
    });
  });

  describe('algochat', () => {
    test('delegates to exec with algochat command', async () => {
      mockSpawnResult = { exitCode: 0, stdout: '{"ok":true,"sent":true}\n', stderr: '' };

      const client = new FledgeClient();
      const result = await client.algochat('send', ['--to', 'ADDR123', '--msg', 'hello']);

      expect(result.ok).toBe(true);
      expect(result.sent).toBe(true);
    });
  });

  describe('sql', () => {
    test('delegates to exec with sql command', async () => {
      mockSpawnResult = { exitCode: 0, stdout: '{"ok":true,"rows":[]}\n', stderr: '' };

      const client = new FledgeClient();
      const result = await client.sql('query', ['SELECT 1']);

      expect(result.ok).toBe(true);
      expect(result.rows).toEqual([]);
    });
  });

  describe('localnet', () => {
    test('delegates to exec with localnet command', async () => {
      mockSpawnResult = { exitCode: 0, stdout: '{"ok":true,"status":"running"}\n', stderr: '' };

      const client = new FledgeClient();
      const result = await client.localnet('status', []);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('running');
    });
  });

  describe('available', () => {
    test('returns true when fledge responds with exit 0', async () => {
      mockSpawnResult = { exitCode: 0, stdout: 'fledge 0.5.0\n', stderr: '' };

      const client = new FledgeClient();
      const result = await client.available();

      expect(result).toBe(true);
    });

    test('returns false when fledge exits non-zero', async () => {
      mockSpawnResult = { exitCode: 127, stdout: '', stderr: 'not found' };

      const client = new FledgeClient();
      const result = await client.available();

      expect(result).toBe(false);
    });

    test('returns false when spawn throws', async () => {
      (Bun as any).spawn = mock(() => {
        throw new Error('ENOENT');
      });

      const client = new FledgeClient();
      const result = await client.available();

      expect(result).toBe(false);
    });
  });
});

describe('FledgeError', () => {
  test('preserves exitCode and message', () => {
    const err = new FledgeError('plugin failed', 42);
    expect(err.message).toBe('plugin failed');
    expect(err.exitCode).toBe(42);
    expect(err.name).toBe('FledgeError');
    expect(err).toBeInstanceOf(Error);
  });
});
