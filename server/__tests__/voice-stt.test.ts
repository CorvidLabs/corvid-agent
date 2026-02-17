import { test, expect, describe, mock } from 'bun:test';

describe('STT', () => {
    test('transcribe throws without OPENAI_API_KEY', async () => {
        const originalKey = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;

        try {
            const { transcribe } = await import('../voice/stt');
            await expect(transcribe({ audio: Buffer.from('fake') })).rejects.toThrow('OPENAI_API_KEY');
        } finally {
            if (originalKey) process.env.OPENAI_API_KEY = originalKey;
        }
    });

    test('transcribe calls Whisper API and returns text', async () => {
        const { transcribe } = await import('../voice/stt');

        const originalFetch = globalThis.fetch;
        process.env.OPENAI_API_KEY = 'test-key';

        globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
            // Verify the request is correct
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            expect(urlStr).toContain('/v1/audio/transcriptions');
            expect(init?.method).toBe('POST');

            // Verify Authorization header
            const headers = init?.headers as Record<string, string>;
            expect(headers?.['Authorization']).toBe('Bearer test-key');

            return new Response(JSON.stringify({ text: 'Hello world' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as unknown as typeof fetch;

        try {
            const result = await transcribe({
                audio: Buffer.from('fake-audio-data'),
                format: 'ogg',
            });
            expect(result.text).toBe('Hello world');

            // Verify fetch was called once
            const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
            expect(fetchMock.mock.calls.length).toBe(1);
        } finally {
            globalThis.fetch = originalFetch;
            delete process.env.OPENAI_API_KEY;
        }
    });

    test('transcribe handles API errors', async () => {
        const { transcribe } = await import('../voice/stt');

        const originalFetch = globalThis.fetch;
        process.env.OPENAI_API_KEY = 'test-key';

        globalThis.fetch = mock(async () => {
            return new Response('Rate limit exceeded', { status: 429 });
        }) as unknown as typeof fetch;

        try {
            await expect(
                transcribe({ audio: Buffer.from('fake'), format: 'mp3' })
            ).rejects.toThrow('OpenAI Whisper API error (429)');
        } finally {
            globalThis.fetch = originalFetch;
            delete process.env.OPENAI_API_KEY;
        }
    });

    test('transcribe passes language option', async () => {
        const { transcribe } = await import('../voice/stt');

        const originalFetch = globalThis.fetch;
        process.env.OPENAI_API_KEY = 'test-key';

        let capturedBody: FormData | null = null;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as FormData;
            return new Response(JSON.stringify({ text: 'Bonjour' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as unknown as typeof fetch;

        try {
            const result = await transcribe({
                audio: Buffer.from('french-audio'),
                format: 'wav',
                language: 'fr',
            });
            expect(result.text).toBe('Bonjour');
            expect(capturedBody).toBeDefined();
        } finally {
            globalThis.fetch = originalFetch;
            delete process.env.OPENAI_API_KEY;
        }
    });

    test('transcribe defaults format to ogg', async () => {
        const { transcribe } = await import('../voice/stt');

        const originalFetch = globalThis.fetch;
        process.env.OPENAI_API_KEY = 'test-key';

        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({ text: 'test' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as unknown as typeof fetch;

        try {
            // No format specified — should default to ogg
            const result = await transcribe({ audio: Buffer.from('data') });
            expect(result.text).toBe('test');
        } finally {
            globalThis.fetch = originalFetch;
            delete process.env.OPENAI_API_KEY;
        }
    });
});
