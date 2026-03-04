import { describe, expect, test } from 'bun:test';

/**
 * Tests for the cache-control header logic used in static file serving.
 * The pattern matches Angular's outputHashing:"all" filenames (e.g. main.abc12345.js).
 */

const HASHED_ASSET_PATTERN = /\.[a-f0-9]{8,}\.\w+$/;

function getCacheControl(pathname: string): string {
    const basename = pathname.split('/').pop() ?? '';
    if (HASHED_ASSET_PATTERN.test(basename)) {
        return 'public, max-age=31536000, immutable';
    } else if (basename === 'index.html') {
        return 'no-cache, no-store, must-revalidate';
    } else {
        return 'public, max-age=3600';
    }
}

describe('Cache-Control headers', () => {
    describe('hashed assets (immutable, 1 year)', () => {
        test('JS bundle with 8-char hash', () => {
            expect(getCacheControl('/main.a1b2c3d4.js')).toBe('public, max-age=31536000, immutable');
        });

        test('CSS with long hash', () => {
            expect(getCacheControl('/styles.a1b2c3d4e5f6.css')).toBe('public, max-age=31536000, immutable');
        });

        test('uppercase hex does not match (Angular uses lowercase)', () => {
            expect(getCacheControl('/chunk-ABCD1234.js')).not.toBe('public, max-age=31536000, immutable');
        });

        test('chunk with dot-separated hash', () => {
            expect(getCacheControl('/chunk.abcd1234.js')).toBe('public, max-age=31536000, immutable');
        });

        test('nested path with hash', () => {
            expect(getCacheControl('/assets/fonts/icon.ab12cd34.woff2')).toBe('public, max-age=31536000, immutable');
        });

        test('media with hash', () => {
            expect(getCacheControl('/media/logo.deadbeef.svg')).toBe('public, max-age=31536000, immutable');
        });
    });

    describe('index.html (no-cache)', () => {
        test('root index.html', () => {
            expect(getCacheControl('/index.html')).toBe('no-cache, no-store, must-revalidate');
        });

        test('index.html in path', () => {
            // basename extraction means this still matches
            expect(getCacheControl('/some/path/index.html')).toBe('no-cache, no-store, must-revalidate');
        });
    });

    describe('other static files (1 hour)', () => {
        test('favicon', () => {
            expect(getCacheControl('/favicon.ico')).toBe('public, max-age=3600');
        });

        test('robots.txt', () => {
            expect(getCacheControl('/robots.txt')).toBe('public, max-age=3600');
        });

        test('manifest.json', () => {
            expect(getCacheControl('/manifest.json')).toBe('public, max-age=3600');
        });

        test('unhashed JS (no hash in filename)', () => {
            expect(getCacheControl('/polyfills.js')).toBe('public, max-age=3600');
        });

        test('asset without hash', () => {
            expect(getCacheControl('/assets/logo.svg')).toBe('public, max-age=3600');
        });
    });

    describe('hash pattern edge cases', () => {
        test('short hex (7 chars) does not match immutable', () => {
            expect(getCacheControl('/main.a1b2c3d.js')).toBe('public, max-age=3600');
        });

        test('non-hex chars do not match', () => {
            expect(getCacheControl('/main.ghijklmn.js')).toBe('public, max-age=3600');
        });

        test('hash with no extension after does not match', () => {
            // Pattern requires .\w+ after the hash
            expect(getCacheControl('/main.a1b2c3d4')).toBe('public, max-age=3600');
        });
    });
});
