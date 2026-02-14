const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

// In-memory cache for API key — avoids storing sensitive data in sessionStorage
let _apiKeyCache: string | null = null;

// API key can be set via ?apiKey= query param on page load, or from in-memory cache
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

        const key = fromUrl ?? _apiKeyCache;
        if (key) {
            _apiKeyCache = key;
        }
        return key;
    })()
    : null;

export const environment = {
    apiUrl: `${protocol}//${host}/api`,
    wsUrl: `${wsProtocol}//${host}/ws`,
    apiKey: storedKey ?? '',
};
