import { describe, expect, test } from 'bun:test';
import { isPrivateIP, isPrivateIPv4, isPrivateIPv6, validateUrlTarget } from '../lib/ssrf-guard';

// ── isPrivateIPv4 ────────────────────────────────────────────────────

describe('isPrivateIPv4', () => {
  test('blocks RFC1918 10.x.x.x', () => {
    expect(isPrivateIPv4('10.0.0.1')).toBe(true);
    expect(isPrivateIPv4('10.255.255.255')).toBe(true);
  });

  test('blocks RFC1918 172.16-31.x.x', () => {
    expect(isPrivateIPv4('172.16.0.1')).toBe(true);
    expect(isPrivateIPv4('172.31.255.255')).toBe(true);
  });

  test('allows 172.32.x.x (outside range)', () => {
    expect(isPrivateIPv4('172.32.0.1')).toBe(false);
  });

  test('blocks RFC1918 192.168.x.x', () => {
    expect(isPrivateIPv4('192.168.0.1')).toBe(true);
    expect(isPrivateIPv4('192.168.255.255')).toBe(true);
  });

  test('blocks loopback 127.x.x.x', () => {
    expect(isPrivateIPv4('127.0.0.1')).toBe(true);
    expect(isPrivateIPv4('127.255.255.255')).toBe(true);
  });

  test('blocks link-local 169.254.x.x', () => {
    expect(isPrivateIPv4('169.254.0.1')).toBe(true);
    expect(isPrivateIPv4('169.254.169.254')).toBe(true); // AWS metadata
  });

  test('blocks 0.0.0.0/8', () => {
    expect(isPrivateIPv4('0.0.0.0')).toBe(true);
  });

  test('blocks CGN shared 100.64.x.x', () => {
    expect(isPrivateIPv4('100.64.0.1')).toBe(true);
    expect(isPrivateIPv4('100.127.255.255')).toBe(true);
  });

  test('blocks multicast 224+', () => {
    expect(isPrivateIPv4('224.0.0.1')).toBe(true);
    expect(isPrivateIPv4('239.255.255.255')).toBe(true);
  });

  test('allows public IPs', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('1.1.1.1')).toBe(false);
    expect(isPrivateIPv4('93.184.216.34')).toBe(false);
    expect(isPrivateIPv4('203.0.114.0')).toBe(false);
  });

  test('rejects malformed addresses', () => {
    expect(isPrivateIPv4('not-an-ip')).toBe(false);
    expect(isPrivateIPv4('256.1.1.1')).toBe(false);
    expect(isPrivateIPv4('1.2.3')).toBe(false);
  });
});

// ── isPrivateIPv6 ────────────────────────────────────────────────────

describe('isPrivateIPv6', () => {
  test('blocks loopback ::1', () => {
    expect(isPrivateIPv6('::1')).toBe(true);
  });

  test('blocks unique local fc00::/7', () => {
    expect(isPrivateIPv6('fc00::1')).toBe(true);
    expect(isPrivateIPv6('fd12:3456::1')).toBe(true);
  });

  test('blocks link-local fe80::', () => {
    expect(isPrivateIPv6('fe80::1')).toBe(true);
  });

  test('blocks IPv4-mapped private', () => {
    expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIPv6('::ffff:192.168.1.1')).toBe(true);
  });

  test('allows IPv4-mapped public', () => {
    expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
  });

  test('blocks multicast ff::', () => {
    expect(isPrivateIPv6('ff02::1')).toBe(true);
  });

  test('allows public IPv6', () => {
    expect(isPrivateIPv6('2001:4860:4860::8888')).toBe(false);
  });
});

// ── isPrivateIP (unified) ────────────────────────────────────────────

describe('isPrivateIP', () => {
  test('dispatches IPv4', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true);
    expect(isPrivateIP('8.8.8.8')).toBe(false);
  });

  test('dispatches IPv6', () => {
    expect(isPrivateIP('::1')).toBe(true);
    expect(isPrivateIP('2001:4860:4860::8888')).toBe(false);
  });
});

// ── validateUrlTarget ────────────────────────────────────────────────

describe('validateUrlTarget', () => {
  test('blocks direct private IP URLs', async () => {
    const result = await validateUrlTarget('http://127.0.0.1:8080/admin');
    expect(result).toContain('private/reserved');
  });

  test('blocks 169.254.169.254 (cloud metadata)', async () => {
    const result = await validateUrlTarget('http://169.254.169.254/latest/meta-data/');
    expect(result).toContain('private/reserved');
  });

  test('blocks 10.x private network', async () => {
    const result = await validateUrlTarget('http://10.0.0.1/internal');
    expect(result).toContain('private/reserved');
  });

  test('rejects invalid URLs', async () => {
    const result = await validateUrlTarget('not-a-url');
    expect(result).toBe('Invalid URL');
  });

  test('allows public URLs', async () => {
    const result = await validateUrlTarget('https://api.github.com/repos');
    expect(result).toBeNull();
  });
});
