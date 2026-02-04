const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

// API key can be set via ?apiKey= query param on page load, or localStorage
const storedKey = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('apiKey') ?? localStorage.getItem('corvid_api_key')
    : null;

// Persist to localStorage so it survives navigation
if (storedKey && typeof window !== 'undefined') {
    localStorage.setItem('corvid_api_key', storedKey);
}

export const environment = {
    apiUrl: `${protocol}//${host}/api`,
    wsUrl: `${wsProtocol}//${host}/ws`,
    apiKey: storedKey ?? '',
};
