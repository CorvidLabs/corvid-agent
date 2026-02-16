import type { CliConfig } from './config';
import type { ServerMessage, ClientMessage } from '../shared/ws-protocol';

// ─── HTTP Client ────────────────────────────────────────────────────────────

export interface ApiError {
    status: number;
    message: string;
}

export class CorvidClient {
    private baseUrl: string;
    private headers: Record<string, string>;

    constructor(config: CliConfig) {
        this.baseUrl = config.serverUrl.replace(/\/+$/, '');
        this.headers = { 'Content-Type': 'application/json' };
        if (config.authToken) {
            this.headers['Authorization'] = `Bearer ${config.authToken}`;
        }
    }

    async get<T>(path: string): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers });
        return this.handleResponse<T>(res);
    }

    async post<T>(path: string, body?: unknown): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: this.headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return this.handleResponse<T>(res);
    }

    async put<T>(path: string, body: unknown): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: 'PUT',
            headers: this.headers,
            body: JSON.stringify(body),
        });
        return this.handleResponse<T>(res);
    }

    async delete<T>(path: string): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: 'DELETE',
            headers: this.headers,
        });
        return this.handleResponse<T>(res);
    }

    private async handleResponse<T>(res: Response): Promise<T> {
        const text = await res.text();
        if (!res.ok) {
            let message: string;
            try {
                const parsed = JSON.parse(text) as { error?: string };
                message = parsed.error ?? text;
            } catch {
                message = text || res.statusText;
            }
            const err: ApiError = { status: res.status, message };
            throw err;
        }
        return JSON.parse(text) as T;
    }

    // ─── WebSocket ──────────────────────────────────────────────────────────

    connectWebSocket(onMessage: (msg: ServerMessage) => void, onClose?: () => void): WebSocket {
        const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
        const urlObj = new URL(wsUrl);

        // Pass auth token via query param (browsers can't set WS headers)
        const authHeader = this.headers['Authorization'];
        if (authHeader) {
            const token = authHeader.replace(/^Bearer\s+/i, '');
            urlObj.searchParams.set('key', token);
        }

        const ws = new WebSocket(urlObj.toString());

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(String(event.data)) as ServerMessage;
                onMessage(msg);
            } catch {
                // Ignore non-JSON messages
            }
        };

        ws.onclose = () => onClose?.();

        return ws;
    }

    sendWs(ws: WebSocket, msg: ClientMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }
}
