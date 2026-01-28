/**
 * Panya HTTP Adapter
 *
 * Exposes Panya as a REST API for universal access.
 * Any application can use Panya via HTTP requests.
 *
 * @example
 * ```typescript
 * import { createPanyaHTTPServer } from '@panya/core/adapters/http';
 *
 * const server = createPanyaHTTPServer({ port: 3000 });
 * await server.start();
 * ```
 *
 * API Endpoints:
 * - POST /learn - Extract learnings from conversation
 * - GET  /search?q=query - Search brain
 * - GET  /stats - Brain statistics
 * - GET  /context - Current context
 * - POST /context - Set context
 * - GET  /graph - Knowledge graph
 * - POST /connect/:id - Auto-connect document
 */

import { Panya, type PanyaOptions } from '../index';

// ============================================================================
// Types
// ============================================================================

export interface HTTPServerConfig {
  port?: number;
  host?: string;
  corsOrigins?: string[];
  panyaOptions?: PanyaOptions;
}

export interface HTTPResponse {
  status: number;
  body: any;
  headers?: Record<string, string>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<HTTPServerConfig, 'panyaOptions'>> & { panyaOptions?: PanyaOptions } = {
  port: 3100,
  host: '0.0.0.0',
  corsOrigins: ['*'],
  panyaOptions: undefined,
};

// ============================================================================
// HTTP Adapter Class
// ============================================================================

export class PanyaHTTPAdapter {
  private panya: Panya;
  private config: Required<Omit<HTTPServerConfig, 'panyaOptions'>> & { panyaOptions?: PanyaOptions };
  private server: ReturnType<typeof Bun.serve> | null = null;

  constructor(config?: HTTPServerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.panya = new Panya(this.config.panyaOptions);
  }

  // ==========================================================================
  // Server Lifecycle
  // ==========================================================================

  async start(): Promise<void> {
    await this.panya.initialize();

    this.server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,
      fetch: async (req) => {
        const url = new URL(req.url);
        const method = req.method;
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
          'Access-Control-Allow-Origin': this.config.corsOrigins.join(', '),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle preflight
        if (method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: corsHeaders });
        }

        try {
          const response = await this.handleRequest(method, path, url, req);
          return new Response(JSON.stringify(response.body), {
            status: response.status,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
              ...response.headers,
            },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            }
          );
        }
      },
    });

    console.log(`[panya-http] Server running at http://${this.config.host}:${this.config.port}`);
  }

  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    this.panya.close();
  }

  // ==========================================================================
  // Request Routing
  // ==========================================================================

  private async handleRequest(
    method: string,
    path: string,
    url: URL,
    req: Request
  ): Promise<HTTPResponse> {
    // Root / health check
    if (path === '/' || path === '/health') {
      return {
        status: 200,
        body: {
          service: 'panya',
          version: '0.1.0',
          identity: this.panya.identity.name,
          status: 'healthy',
        },
      };
    }

    // Stats
    if (path === '/stats' && method === 'GET') {
      return this.handleStats();
    }

    // Search
    if (path === '/search' && method === 'GET') {
      const query = url.searchParams.get('q') || '';
      const limit = parseInt(url.searchParams.get('limit') || '10');
      return this.handleSearch(query, limit);
    }

    // Learn
    if (path === '/learn' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleLearn(body);
    }

    // Context
    if (path === '/context' && method === 'GET') {
      return this.handleGetContext();
    }

    if (path === '/context' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleSetContext(body);
    }

    // Knowledge Graph
    if (path === '/graph' && method === 'GET') {
      return this.handleGraph();
    }

    // Connections
    if (path.startsWith('/connections/') && method === 'GET') {
      const documentId = path.replace('/connections/', '');
      return this.handleConnections(documentId);
    }

    // Suggestions
    if (path.startsWith('/suggestions/') && method === 'GET') {
      const documentId = path.replace('/suggestions/', '');
      return this.handleSuggestions(documentId);
    }

    // Auto-connect
    if (path.startsWith('/connect/') && method === 'POST') {
      const documentId = path.replace('/connect/', '');
      const body = await req.json().catch(() => ({})) as Record<string, any>;
      return this.handleAutoConnect(documentId, body.minStrength);
    }

    // Recent learnings
    if (path === '/learnings' && method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '10');
      return this.handleRecentLearnings(limit);
    }

    // Entities
    if (path === '/entities' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleExtractEntities(body.text);
    }

    // Not found
    return {
      status: 404,
      body: { error: 'Not found', path },
    };
  }

  // ==========================================================================
  // Handlers
  // ==========================================================================

  private handleStats(): HTTPResponse {
    const stats = this.panya.stats();
    return {
      status: 200,
      body: {
        brain: stats,
        identity: {
          name: this.panya.identity.name,
          title: this.panya.identity.title,
        },
      },
    };
  }

  private handleSearch(query: string, limit: number): HTTPResponse {
    if (!query) {
      return { status: 400, body: { error: 'Query parameter "q" is required' } };
    }

    const results = this.panya.search(query, limit);
    return {
      status: 200,
      body: {
        query,
        resultCount: results.length,
        results: results.map(doc => ({
          id: doc.id,
          type: doc.type,
          sourceFile: doc.sourceFile,
          content: doc.content?.substring(0, 200),
          concepts: doc.concepts,
        })),
      },
    };
  }

  private async handleLearn(body: Record<string, any>): Promise<HTTPResponse> {
    const { messages, context } = body;

    if (!messages || !Array.isArray(messages)) {
      return { status: 400, body: { error: 'messages array is required' } };
    }

    const result = await this.panya.skills.autoLearn.extractFromConversation(messages, context);

    if (result.learnings.length > 0) {
      const ids = this.panya.skills.autoLearn.saveLearnings(this.panya.brain, result.learnings);
      return {
        status: 200,
        body: {
          success: true,
          learningsExtracted: result.learnings.length,
          savedIds: ids,
          learnings: result.learnings.map(l => ({
            type: l.type,
            content: l.content,
            confidence: l.confidence,
          })),
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        learningsExtracted: 0,
        message: 'No significant learnings found',
      },
    };
  }

  private handleGetContext(): HTTPResponse {
    const context = this.panya.context();
    const summary = this.panya.contextSummary();

    return {
      status: 200,
      body: {
        summary,
        full: {
          project: context.project,
          file: context.file,
          time: context.time,
          session: {
            id: context.session.id,
            messageCount: context.session.messageCount,
            filesAccessed: context.session.filesAccessed.length,
            toolsUsed: context.session.toolsUsed,
            topicsDiscussed: context.session.topicsDiscussed,
          },
          patterns: context.patterns,
        },
      },
    };
  }

  private handleSetContext(body: Record<string, any>): HTTPResponse {
    const { project, file } = body;

    if (project) {
      this.panya.setProject(project);
    }
    if (file) {
      this.panya.setFile(file);
    }

    return {
      status: 200,
      body: {
        success: true,
        projectSet: project || null,
        fileSet: file || null,
      },
    };
  }

  private handleGraph(): HTTPResponse {
    const graph = this.panya.buildGraph();

    return {
      status: 200,
      body: {
        stats: graph.stats,
        nodes: graph.nodes.slice(0, 100),
        edges: graph.edges.slice(0, 200),
        truncated: graph.nodes.length > 100 || graph.edges.length > 200,
      },
    };
  }

  private handleConnections(documentId: string): HTTPResponse {
    const connections = this.panya.findConnections(documentId);

    return {
      status: 200,
      body: {
        documentId,
        connectionCount: connections.length,
        connections: connections.map(c => ({
          targetId: c.targetId,
          type: c.type,
          strength: c.strength,
          reason: c.reason,
        })),
      },
    };
  }

  private handleSuggestions(documentId: string): HTTPResponse {
    const result = this.panya.getSuggestions(documentId);

    return {
      status: 200,
      body: result,
    };
  }

  private handleAutoConnect(documentId: string, minStrength?: number): HTTPResponse {
    const created = this.panya.autoConnect(documentId, minStrength || 0.5);

    return {
      status: 200,
      body: {
        success: true,
        documentId,
        relationshipsCreated: created,
      },
    };
  }

  private handleRecentLearnings(limit: number): HTTPResponse {
    const insights = this.panya.brain.getRecentInsights(limit);

    return {
      status: 200,
      body: {
        count: insights.length,
        learnings: insights.map(i => ({
          id: i.id,
          type: i.type,
          content: i.content,
          confidence: i.confidence,
          createdAt: new Date(i.created_at).toISOString(),
        })),
      },
    };
  }

  private async handleExtractEntities(text: string): Promise<HTTPResponse> {
    if (!text) {
      return { status: 400, body: { error: 'text is required' } };
    }

    const result = await this.panya.entityExtractor.extract(text, { useLLM: false });

    return {
      status: 200,
      body: {
        entityCount: result.entities.length,
        entities: result.entities.map(e => ({
          name: e.name,
          type: e.type,
          normalizedName: e.normalizedName,
          confidence: e.confidence,
        })),
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPanyaHTTPServer(config?: HTTPServerConfig): PanyaHTTPAdapter {
  return new PanyaHTTPAdapter(config);
}

export default PanyaHTTPAdapter;
