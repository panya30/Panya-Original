#!/usr/bin/env bun
/**
 * Panya MCP Server
 *
 * Standalone MCP server for Panya brain.
 * Run with: bun run packages/panya-core/src/server.ts
 *
 * Add to Claude Code settings:
 * {
 *   "mcpServers": {
 *     "panya": {
 *       "command": "bun",
 *       "args": ["run", "/path/to/packages/panya-core/src/server.ts"]
 *     }
 *   }
 * }
 */

import { Panya } from './index';
import { PanyaMCPAdapter, PANYA_MCP_TOOLS } from './adapters/mcp';
import { extractLearningsWithOpenAI, extractEntitiesWithOpenAI } from './brain/openai-extractor';
import { EntityExtractor } from './brain/entities';

// ============================================================================
// MCP Protocol Types
// ============================================================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, any>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: { code: number; message: string };
}

// ============================================================================
// Server State
// ============================================================================

const panya = new Panya({
  autoLearn: {
    llmExtractor: extractLearningsWithOpenAI,
    entityLlmExtractor: extractEntitiesWithOpenAI,
  },
});

// Configure entity extractor with OpenAI
panya.entityExtractor = new EntityExtractor({
  llmExtractor: extractEntitiesWithOpenAI,
});

const adapter = new PanyaMCPAdapter(panya);
let initialized = false;

// ============================================================================
// Request Handlers
// ============================================================================

async function handleRequest(request: MCPRequest): Promise<MCPResponse> {
  const { id, method, params } = request;

  // Ensure Panya is initialized
  if (!initialized) {
    await panya.initialize();
    initialized = true;
  }

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'panya',
              version: '0.1.0',
            },
          },
        };

      case 'initialized':
        // Notification, no response needed but we return empty for consistency
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: PANYA_MCP_TOOLS.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: {
                type: 'object',
                properties: tool.parameters.properties,
                required: tool.parameters.required || [],
              },
            })),
          },
        };

      case 'tools/call':
        const { name, arguments: args } = params || {};
        const toolResult = await adapter.handleToolCall({ name, arguments: args || {} });

        return {
          jsonrpc: '2.0',
          id,
          result: toolResult,
        };

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// ============================================================================
// Stdio Transport
// ============================================================================

async function main() {
  const decoder = new TextDecoder();
  let buffer = '';

  // Log to stderr (not stdout, which is for MCP protocol)
  console.error('[panya] MCP server starting...');

  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk);

    // Process complete lines
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line) continue;

      try {
        const request = JSON.parse(line) as MCPRequest;
        const response = await handleRequest(request);

        // Send response
        const responseStr = JSON.stringify(response);
        process.stdout.write(responseStr + '\n');
      } catch (parseError) {
        console.error('[panya] Parse error:', parseError);
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: 0,
          error: { code: -32700, message: 'Parse error' },
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('[panya] Shutting down...');
  panya.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[panya] Shutting down...');
  panya.close();
  process.exit(0);
});

main().catch(err => {
  console.error('[panya] Fatal error:', err);
  process.exit(1);
});
