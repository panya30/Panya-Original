#!/usr/bin/env bun
/**
 * Panya Web Dashboard Server
 *
 * Serves the Panya Ontology dashboard
 * Run with: bun run web/serve.ts
 */

const port = parseInt(process.env.WEB_PORT || '3101');

console.log(`[panya-web] Starting dashboard server on port ${port}...`);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

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

    // Serve static files from /public
    if (url.pathname.startsWith('/public/') || url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff|woff2)$/)) {
      const filePath = url.pathname.startsWith('/public/')
        ? import.meta.dir + url.pathname
        : import.meta.dir + '/public' + url.pathname;

      const file = Bun.file(filePath);
      const ext = url.pathname.substring(url.pathname.lastIndexOf('.'));
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      return new Response(file, {
        headers: { 'Content-Type': contentType },
      });
    }

    // 404 for other paths
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`[panya-web] Dashboard running at http://localhost:${port}`);
console.log(`[panya-web] Make sure Panya HTTP API is running on port 3100`);
