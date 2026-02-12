#!/usr/bin/env bun
/** Tiny server for the test dashboard. Serves HTML + JSON results. */

const PORT = 3737;
const DIR = import.meta.dir;

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === '/results.json') {
            const file = Bun.file(`${DIR}/test-results.json`);
            if (await file.exists()) {
                return new Response(file, {
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                });
            }
            return new Response('[]', {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }

        // Serve the dashboard HTML
        return new Response(Bun.file(`${DIR}/test-dashboard.html`), {
            headers: { 'Content-Type': 'text/html' },
        });
    },
});

console.log(`Dashboard: http://localhost:${PORT}`);
