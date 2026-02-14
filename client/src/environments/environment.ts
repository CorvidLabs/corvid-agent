const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

// API key can be set via ?apiKey= query param on page load, or in-memory cache.
// We avoid sessionStorage to prevent clear-text storage of credentials (CodeQL js/clear-text-storage-of-sensitive-data).
let _cachedApiKey: string | null = null;

const storedKey = typeof window !== 'undefined'
    ? (() => {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get('apiKey');

        // Strip apiKey from URL to prevent logging/sharing
        if (fromUrl) {
            params.delete('apiKey');
            const newQuery = params.toString();
            const cleanUrl = window.location.pathname
                + (newQuery ? `?${newQuery}` : '')
                + window.location.hash;
            window.history.replaceState(null, '', cleanUrl);
        }

        // Prefer URL param, then in-memory cache (from prior call within same page lifecycle)
        const key = fromUrl ?? _cachedApiKey;
        if (key) {
            _cachedApiKey = key;
        }
        return key;
    })()
    : null;

export const environment = {
    apiUrl: `${protocol}//${host}/api`,
    wsUrl: `${wsProtocol}//${host}/ws`,
    apiKey: storedKey ?? '',
};
