const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

export const environment = {
    apiUrl: `${protocol}//${host}/api`,
    wsUrl: `${wsProtocol}//${host}/ws`,
};
