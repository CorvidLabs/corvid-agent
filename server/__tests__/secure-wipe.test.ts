import { describe, expect, test } from 'bun:test';
import { wipeBuffer, wipeBuffers, withSecureBuffer } from '../lib/secure-wipe';

describe('wipeBuffer', () => {
  test('zeroes out a Uint8Array', () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5]);
    wipeBuffer(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test('zeroes out an ArrayBuffer via Uint8Array view', () => {
    const ab = new ArrayBuffer(8);
    const view = new Uint8Array(ab);
    view.set([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8]);
    wipeBuffer(ab);
    expect(new Uint8Array(ab).every((b) => b === 0)).toBe(true);
  });

  test('handles null gracefully', () => {
    expect(() => wipeBuffer(null)).not.toThrow();
  });

  test('handles undefined gracefully', () => {
    expect(() => wipeBuffer(undefined)).not.toThrow();
  });

  test('handles zero-length buffer', () => {
    const buf = new Uint8Array(0);
    expect(() => wipeBuffer(buf)).not.toThrow();
  });
});

describe('wipeBuffers', () => {
  test('wipes multiple buffers', () => {
    const a = new Uint8Array([10, 20, 30]);
    const b = new Uint8Array([40, 50, 60]);
    wipeBuffers(a, b);
    expect(a.every((v) => v === 0)).toBe(true);
    expect(b.every((v) => v === 0)).toBe(true);
  });

  test('skips null/undefined entries without throwing', () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(() => wipeBuffers(a, null, undefined)).not.toThrow();
    expect(a.every((v) => v === 0)).toBe(true);
  });
});

describe('withSecureBuffer', () => {
  test('returns the operation result and wipes buffer on success', async () => {
    const buf = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const result = await withSecureBuffer(buf, async (b) => {
      // Buffer should still contain data during the operation
      expect(b[0]).toBe(0xaa);
      return 'done';
    });
    expect(result).toBe('done');
    expect(buf.every((v) => v === 0)).toBe(true);
  });

  test('wipes buffer even when operation throws', async () => {
    const buf = new Uint8Array([0xde, 0xad]);
    await expect(
      withSecureBuffer(buf, async () => {
        throw new Error('operation failed');
      }),
    ).rejects.toThrow('operation failed');
    expect(buf.every((v) => v === 0)).toBe(true);
  });
});
