/**
 * HTTP client for communicating with a corvid-agent REST API.
 */

export interface CorvidClientConfig {
  /** Base URL of the corvid-agent server (e.g. http://localhost:3000) */
  baseUrl: string;
  /** Optional API key for authentication */
  apiKey?: string;
}

export class CorvidApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CorvidApiError';
  }
}

export class CorvidClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: CorvidClientConfig) {
    let url = config.baseUrl;
    while (url.endsWith('/')) url = url.slice(0, -1);
    this.baseUrl = url;
    this.headers = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      this.headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers,
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const data = (await response.json()) as Record<string, unknown>;
        if (typeof data.error === 'string') {
          message = data.error;
        }
      } catch {
        message = response.statusText || message;
      }
      throw new CorvidApiError(response.status, message);
    }

    return response.json() as Promise<T>;
  }
}
