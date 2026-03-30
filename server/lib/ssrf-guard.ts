/**
 * SSRF (Server-Side Request Forgery) protection.
 *
 * Validates URLs before making outbound HTTP requests to ensure they
 * don't resolve to private/internal IP ranges. Prevents agents and
 * user-supplied URLs from reaching internal infrastructure.
 */

import { createLogger } from './logger';

const log = createLogger('SSRFGuard');

/**
 * IPv4 private and reserved ranges that should never be reached
 * by outbound server requests.
 *
 * Each entry: [startIP (as 32-bit integer), mask (as 32-bit integer), label]
 */
const BLOCKED_IPV4_RANGES: Array<[number, number, string]> = [
  [ip4ToInt('10.0.0.0'), cidrMask(8), 'RFC1918 10/8'],
  [ip4ToInt('172.16.0.0'), cidrMask(12), 'RFC1918 172.16/12'],
  [ip4ToInt('192.168.0.0'), cidrMask(16), 'RFC1918 192.168/16'],
  [ip4ToInt('127.0.0.0'), cidrMask(8), 'Loopback'],
  [ip4ToInt('169.254.0.0'), cidrMask(16), 'Link-local'],
  [ip4ToInt('0.0.0.0'), cidrMask(8), 'Current network'],
  [ip4ToInt('100.64.0.0'), cidrMask(10), 'CGN shared'],
  [ip4ToInt('192.0.0.0'), cidrMask(24), 'IETF protocol'],
  [ip4ToInt('192.0.2.0'), cidrMask(24), 'TEST-NET-1'],
  [ip4ToInt('198.51.100.0'), cidrMask(24), 'TEST-NET-2'],
  [ip4ToInt('203.0.113.0'), cidrMask(24), 'TEST-NET-3'],
  [ip4ToInt('224.0.0.0'), cidrMask(4), 'Multicast'],
  [ip4ToInt('240.0.0.0'), cidrMask(4), 'Reserved'],
];

/**
 * IPv6 prefixes that should be blocked.
 * Checked as lowercase hex prefix matches.
 */
const BLOCKED_IPV6_PREFIXES = [
  '::1', // Loopback
  '::ffff:', // IPv4-mapped (checked separately with v4 rules)
  'fc', // Unique local (fc00::/7)
  'fd', // Unique local (fc00::/7)
  'fe80:', // Link-local
  'ff', // Multicast
];

/** Convert dotted IPv4 string to 32-bit integer. */
function ip4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Create a CIDR bitmask for the given prefix length. */
function cidrMask(bits: number): number {
  return bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
}

/**
 * Check whether an IPv4 address string falls in a private/reserved range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const addr = ip4ToInt(ip);
  for (const [start, mask] of BLOCKED_IPV4_RANGES) {
    if ((addr & mask) === (start & mask)) return true;
  }
  return false;
}

/**
 * Check whether an IPv6 address string falls in a private/reserved range.
 * Also handles IPv4-mapped IPv6 addresses (::ffff:x.x.x.x).
 */
export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // IPv4-mapped IPv6 — extract the v4 portion and check it
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);

  for (const prefix of BLOCKED_IPV6_PREFIXES) {
    if (lower === prefix || lower.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Check whether an IP address (v4 or v6) is private/reserved.
 */
export function isPrivateIP(ip: string): boolean {
  if (ip.includes(':')) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

/**
 * Resolve a hostname to its IP addresses and check if any are private.
 * Returns the blocking reason if blocked, or null if safe.
 */
export async function validateUrlTarget(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }

  const hostname = parsed.hostname;

  // Direct IP check (no DNS needed)
  if (isPrivateIP(hostname)) {
    return `Blocked: ${hostname} is a private/reserved IP`;
  }

  // DNS resolution check
  try {
    const { resolve4, resolve6 } = await import('node:dns/promises');
    const results: string[] = [];

    try {
      const v4 = await resolve4(hostname);
      results.push(...v4);
    } catch {
      // No A records — fine
    }

    try {
      const v6 = await resolve6(hostname);
      results.push(...v6);
    } catch {
      // No AAAA records — fine
    }

    for (const ip of results) {
      if (isPrivateIP(ip)) {
        log.warn('SSRF blocked: DNS resolved to private IP', {
          url,
          hostname,
          resolvedIp: ip,
        });
        return `Blocked: ${hostname} resolves to private IP ${ip}`;
      }
    }
  } catch (err) {
    // DNS resolution failed entirely — could be a non-existent domain.
    // Don't block on DNS failure; let the actual fetch handle it.
    log.debug('DNS resolution failed for SSRF check', {
      hostname,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}
