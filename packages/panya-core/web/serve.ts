#!/usr/bin/env bun
/**
 * Panya Web Dashboard Server
 *
 * Serves the Panya Ontology dashboard
 * Run with: bun run web/serve.ts
 */

const port = parseInt(process.env.WEB_PORT || '3101');

console.log(`[panya-web] Starting dashboard server on port ${port}...`);

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);

    // Serve index.html for root
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(Bun.file(import.meta.dir + '/index.html'), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // 404 for other paths
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`[panya-web] Dashboard running at http://localhost:${port}`);
console.log(`[panya-web] Make sure Panya HTTP API is running on port 3100`);
