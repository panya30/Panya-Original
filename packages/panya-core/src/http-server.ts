#!/usr/bin/env bun
/**
 * Panya HTTP Server
 *
 * Standalone HTTP server for Panya brain.
 * Run with: bun run packages/panya-core/src/http-server.ts
 *
 * Environment variables:
 * - PANYA_PORT: Server port (default: 3100)
 * - PANYA_HOST: Server host (default: 0.0.0.0)
 *
 * API Endpoints:
 * - GET  /health - Health check
 * - GET  /stats - Brain statistics
 * - GET  /search?q=query - Search brain
 * - POST /learn - Extract learnings
 * - GET  /context - Current context
 * - POST /context - Set context
 * - GET  /graph - Knowledge graph
 * - GET  /connections/:id - Find connections
 * - GET  /suggestions/:id - Get suggestions
 * - POST /connect/:id - Auto-connect document
 * - GET  /learnings - Recent learnings
 * - POST /entities - Extract entities
 */

import { createPanyaHTTPServer } from './adapters/http';

const port = parseInt(process.env.PANYA_PORT || '3100');
const host = process.env.PANYA_HOST || '0.0.0.0';

console.log('[panya] Starting HTTP server...');

const server = createPanyaHTTPServer({ port, host });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[panya] Shutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[panya] Shutting down...');
  server.stop();
  process.exit(0);
});

// Start server
server.start().catch(err => {
  console.error('[panya] Failed to start:', err);
  process.exit(1);
});
