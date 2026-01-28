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
import {
  KnowledgeLevelManager,
  PatternDetector,
  Synthesizer,
  IdentityGuardian,
  LearningLoop,
} from '../skills';

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

  // Ontology components
  private levelManager: KnowledgeLevelManager;
  private patternDetector: PatternDetector;
  private synthesizer: Synthesizer;
  private identityGuardian: IdentityGuardian;
  private learningLoop: LearningLoop;

  constructor(config?: HTTPServerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.panya = new Panya(this.config.panyaOptions);

    // Initialize ontology components
    this.levelManager = new KnowledgeLevelManager();
    this.patternDetector = new PatternDetector();
    this.synthesizer = new Synthesizer();
    this.identityGuardian = new IdentityGuardian();
    this.learningLoop = new LearningLoop();
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

    // ================================================================
    // ONTOLOGY ENDPOINTS
    // ================================================================

    // Ontology stats
    if (path === '/ontology/stats' && method === 'GET') {
      return this.handleOntologyStats();
    }

    // Entity types
    if (path === '/ontology/entity-types' && method === 'GET') {
      return this.handleListEntityTypes();
    }

    if (path === '/ontology/entity-types' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleDefineEntityType(body);
    }

    // Knowledge levels
    if (path === '/ontology/levels' && method === 'GET') {
      return this.handleLevelStats();
    }

    if (path.startsWith('/ontology/levels/') && method === 'GET') {
      const documentId = path.replace('/ontology/levels/', '');
      return this.handleGetLevel(documentId);
    }

    if (path === '/ontology/promote' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handlePromote(body);
    }

    if (path === '/ontology/demote' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleDemote(body);
    }

    // Patterns
    if (path === '/ontology/patterns' && method === 'GET') {
      const status = url.searchParams.get('status') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50');
      return this.handleListPatterns(status, limit);
    }

    if (path === '/ontology/patterns/detect' && method === 'POST') {
      const body = await req.json().catch(() => ({})) as Record<string, any>;
      return this.handleDetectPatterns(body.type);
    }

    if (path === '/ontology/patterns/validate' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleValidatePattern(body);
    }

    // Synthesis
    if (path === '/ontology/merge' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleMerge(body);
    }

    if (path === '/ontology/distill' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleDistill(body);
    }

    if (path === '/ontology/supersede' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleSupersede(body);
    }

    if (path === '/ontology/conflicts' && method === 'GET') {
      const resolution = url.searchParams.get('resolution') || undefined;
      return this.handleListConflicts(resolution);
    }

    if (path === '/ontology/conflicts/resolve' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleResolveConflict(body);
    }

    // Learning loop
    if (path === '/ontology/loop/status' && method === 'GET') {
      return this.handleLoopStatus();
    }

    if (path === '/ontology/loop/run' && method === 'POST') {
      return await this.handleRunLoop();
    }

    if (path === '/ontology/loop/start' && method === 'POST') {
      return this.handleStartAutoLoop();
    }

    if (path === '/ontology/loop/stop' && method === 'POST') {
      return this.handleStopAutoLoop();
    }

    // Observations
    if (path === '/ontology/observations' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleAddObservation(body);
    }

    // Identity
    if (path === '/ontology/identity' && method === 'GET') {
      const facetId = url.searchParams.get('facetId') || undefined;
      const facetType = url.searchParams.get('facetType') || undefined;
      return this.handleGetIdentity(facetId, facetType);
    }

    if (path === '/ontology/identity/memories' && method === 'GET') {
      const memoryType = url.searchParams.get('type') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50');
      return this.handleGetMemories(memoryType, limit);
    }

    if (path === '/ontology/identity/memories' && method === 'POST') {
      const body = await req.json() as Record<string, any>;
      return this.handleRecordMemory(body);
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

  // ==========================================================================
  // Ontology Handlers
  // ==========================================================================

  private handleOntologyStats(): HTTPResponse {
    const stats = this.panya.brain.getOntologyStats();
    const levelSummary = this.levelManager.getSummary(this.panya.brain);
    const loopStatus = this.learningLoop.getStatus();

    return {
      status: 200,
      body: {
        ontology: stats,
        knowledge: levelSummary,
        learningLoop: loopStatus,
      },
    };
  }

  private handleListEntityTypes(): HTTPResponse {
    const types = this.panya.brain.getEntityTypes();
    return {
      status: 200,
      body: {
        count: types.length,
        entityTypes: types.map(t => ({
          id: t.id,
          name: t.name,
          parentTypeId: t.parentTypeId,
        })),
      },
    };
  }

  private handleDefineEntityType(body: Record<string, any>): HTTPResponse {
    const { id, name, parentTypeId, validationSchema } = body;
    if (!id || !name) {
      return { status: 400, body: { error: 'id and name are required' } };
    }

    const resultId = this.panya.brain.defineEntityType({ id, name, parentTypeId, validationSchema });
    return {
      status: 200,
      body: { success: true, entityTypeId: resultId, name, parentTypeId },
    };
  }

  private handleLevelStats(): HTTPResponse {
    const summary = this.levelManager.getSummary(this.panya.brain);
    const levelStats = this.levelManager.getLevelStats(this.panya.brain);

    return {
      status: 200,
      body: {
        summary,
        levels: levelStats,
      },
    };
  }

  private handleGetLevel(documentId: string): HTTPResponse {
    const levelData = this.levelManager.getLevel(this.panya.brain, documentId);
    if (!levelData) {
      return { status: 404, body: { error: 'Document has no knowledge level data', documentId } };
    }

    const levelNames: Record<number, string> = { 1: 'L1 Raw', 2: 'L2 Extracted', 3: 'L3 Synthesized', 4: 'L4 Core' };
    return {
      status: 200,
      body: {
        documentId,
        level: levelData.level,
        levelName: levelNames[levelData.level],
        confidence: levelData.confidence,
        usageCount: levelData.usageCount,
        promotedFromId: levelData.promotedFromId,
        lastPromotedAt: levelData.lastPromotedAt,
      },
    };
  }

  private handlePromote(body: Record<string, any>): HTTPResponse {
    const { documentId, newConfidence } = body;
    if (!documentId) {
      return { status: 400, body: { error: 'documentId is required' } };
    }

    const result = this.levelManager.promote(this.panya.brain, documentId, newConfidence);
    return {
      status: result.success ? 200 : 400,
      body: { success: result.success, documentId, newLevel: result.newLevel, error: result.error },
    };
  }

  private handleDemote(body: Record<string, any>): HTTPResponse {
    const { documentId, reason } = body;
    if (!documentId || !reason) {
      return { status: 400, body: { error: 'documentId and reason are required' } };
    }

    const result = this.levelManager.demote(this.panya.brain, documentId, reason);
    return {
      status: result.success ? 200 : 400,
      body: { success: result.success, documentId, newLevel: result.newLevel, error: result.error },
    };
  }

  private handleListPatterns(status?: string, limit: number = 50): HTTPResponse {
    const patterns = this.panya.brain.getPatterns(status as any, limit);
    return {
      status: 200,
      body: {
        count: patterns.length,
        patterns: patterns.map(p => ({
          id: p.id,
          type: p.patternType,
          confidence: p.confidence,
          status: p.status,
          description: p.description,
          documentCount: p.documentIds.length,
          createdAt: new Date(p.createdAt).toISOString(),
        })),
      },
    };
  }

  private handleDetectPatterns(type?: string): HTTPResponse {
    let result;
    if (!type || type === 'all') {
      result = this.patternDetector.detectAll(this.panya.brain);
    } else {
      const patterns = this.patternDetector.detect(this.panya.brain, type as any);
      result = { patterns, stats: { [type]: patterns.length, total: patterns.length }, processingTimeMs: 0 };
    }

    return {
      status: 200,
      body: {
        patternsDetected: result.stats.total,
        stats: result.stats,
        processingTimeMs: result.processingTimeMs,
        patterns: result.patterns.slice(0, 20).map((p: any) => ({
          id: p.id,
          type: p.patternType,
          confidence: p.confidence,
          description: p.description,
          documentCount: p.documentIds?.length || 0,
        })),
      },
    };
  }

  private handleValidatePattern(body: Record<string, any>): HTTPResponse {
    const { patternId, valid } = body;
    if (patternId === undefined || valid === undefined) {
      return { status: 400, body: { error: 'patternId and valid are required' } };
    }

    this.patternDetector.validatePattern(this.panya.brain, patternId, valid);
    return {
      status: 200,
      body: { success: true, patternId, newStatus: valid ? 'validated' : 'rejected' },
    };
  }

  private handleMerge(body: Record<string, any>): HTTPResponse {
    const { documentIds, strategy = 'dedupe', preserveOriginals = false } = body;
    if (!documentIds || documentIds.length < 2) {
      return { status: 400, body: { error: 'documentIds array with at least 2 IDs is required' } };
    }

    const result = this.synthesizer.merge(this.panya.brain, documentIds, { strategy, preserveOriginals });
    return {
      status: result.success ? 200 : 400,
      body: { success: result.success, resultDocumentId: result.resultDocumentId, sourceCount: result.sourceDocumentIds.length, error: result.error },
    };
  }

  private handleDistill(body: Record<string, any>): HTTPResponse {
    const { documentId, maxLength } = body;
    if (!documentId) {
      return { status: 400, body: { error: 'documentId is required' } };
    }

    const result = this.synthesizer.distill(this.panya.brain, documentId, { maxLength });
    return {
      status: result.success ? 200 : 400,
      body: { success: result.success, resultDocumentId: result.resultDocumentId, metadata: result.metadata, error: result.error },
    };
  }

  private handleSupersede(body: Record<string, any>): HTTPResponse {
    const { oldDocumentId, newDocumentId, reason } = body;
    if (!oldDocumentId || !newDocumentId) {
      return { status: 400, body: { error: 'oldDocumentId and newDocumentId are required' } };
    }

    const result = this.synthesizer.supersede(this.panya.brain, oldDocumentId, newDocumentId, reason);
    return {
      status: result.success ? 200 : 400,
      body: { success: result.success, oldDocumentId, newDocumentId, error: result.error },
    };
  }

  private handleListConflicts(resolution?: string): HTTPResponse {
    const conflicts = this.panya.brain.getConflicts(resolution as any);
    return {
      status: 200,
      body: {
        count: conflicts.length,
        conflicts: conflicts.map(c => ({
          id: c.id,
          documentAId: c.documentAId,
          documentBId: c.documentBId,
          conflictType: c.conflictType,
          resolution: c.resolution,
          description: c.description,
        })),
      },
    };
  }

  private handleResolveConflict(body: Record<string, any>): HTTPResponse {
    const { conflictId, resolution, keepDocument, mergeDocuments } = body;
    if (conflictId === undefined || !resolution) {
      return { status: 400, body: { error: 'conflictId and resolution are required' } };
    }

    const result = this.synthesizer.resolveConflict(this.panya.brain, conflictId, resolution, { keepDocument, mergeDocuments });
    return {
      status: result.success ? 200 : 400,
      body: { success: result.success, resolution: result.resolution, resultDocumentId: result.resultDocumentId, description: result.description },
    };
  }

  private handleLoopStatus(): HTTPResponse {
    const status = this.learningLoop.getStatus();
    const stats = this.learningLoop.getStats(this.panya.brain);

    return {
      status: 200,
      body: {
        loop: status,
        levels: stats.levels,
        autoLoop: stats.autoLoop,
      },
    };
  }

  private async handleRunLoop(): Promise<HTTPResponse> {
    const result = await this.learningLoop.runOnce(this.panya.brain);
    return {
      status: 200,
      body: {
        success: result.success,
        durationMs: result.durationMs,
        stages: result.stages,
        errors: result.errors,
      },
    };
  }

  private handleStartAutoLoop(): HTTPResponse {
    const result = this.learningLoop.startAutoLoop(this.panya.brain);
    return {
      status: 200,
      body: {
        success: result.success,
        message: result.success ? 'Auto loop started' : 'Auto loop already running',
        intervalMs: result.intervalMs,
      },
    };
  }

  private handleStopAutoLoop(): HTTPResponse {
    const result = this.learningLoop.stopAutoLoop();
    return {
      status: 200,
      body: {
        success: result.success,
        wasStopped: result.wasStopped,
        message: result.wasStopped ? 'Auto loop stopped' : 'Auto loop was not running',
      },
    };
  }

  private handleAddObservation(body: Record<string, any>): HTTPResponse {
    const { content, type = 'external', sourceId, metadata } = body;
    if (!content) {
      return { status: 400, body: { error: 'content is required' } };
    }

    const id = this.learningLoop.addObservation(this.panya.brain, content, type, sourceId, metadata);
    return {
      status: 200,
      body: { success: true, observationId: id, type },
    };
  }

  private handleGetIdentity(facetId?: string, facetType?: string): HTTPResponse {
    // Initialize identity if needed
    this.identityGuardian.initializeIdentity(this.panya.brain);

    if (facetId) {
      const facet = this.identityGuardian.getFacet(this.panya.brain, facetId);
      if (!facet) {
        return { status: 404, body: { error: 'Facet not found', facetId } };
      }
      return {
        status: 200,
        body: {
          facet: {
            id: facet.id,
            name: facet.name,
            type: facet.facetType,
            content: facet.content,
            locked: facet.locked,
            version: facet.version,
          },
        },
      };
    }

    if (facetType) {
      const facets = this.identityGuardian.getFacetsByType(this.panya.brain, facetType as any);
      return {
        status: 200,
        body: {
          type: facetType,
          count: facets.length,
          facets: facets.map(f => ({
            id: f.id,
            name: f.name,
            locked: f.locked,
            contentPreview: f.content.substring(0, 100) + (f.content.length > 100 ? '...' : ''),
          })),
        },
      };
    }

    // Return all facets summary
    const allFacets = this.identityGuardian.getAllFacets(this.panya.brain);
    return {
      status: 200,
      body: {
        totalFacets: allFacets.length,
        facets: allFacets.map(f => ({
          id: f.id,
          name: f.name,
          type: f.facetType,
          locked: f.locked,
          contentPreview: f.content.substring(0, 80) + (f.content.length > 80 ? '...' : ''),
        })),
      },
    };
  }

  private handleGetMemories(memoryType?: string, limit: number = 50): HTTPResponse {
    const memories = this.identityGuardian.getMemories(this.panya.brain, memoryType as any, limit);
    return {
      status: 200,
      body: {
        count: memories.length,
        memories: memories.map(m => ({
          id: m.id,
          type: m.memoryType,
          content: m.content,
          importance: m.importance,
          createdAt: new Date(m.createdAt).toISOString(),
        })),
      },
    };
  }

  private handleRecordMemory(body: Record<string, any>): HTTPResponse {
    const { memoryType, content, importance = 0.5 } = body;
    if (!memoryType || !content) {
      return { status: 400, body: { error: 'memoryType and content are required' } };
    }

    const id = this.identityGuardian.recordMemory(this.panya.brain, { memoryType, content, importance });
    return {
      status: 200,
      body: { success: true, memoryId: id, memoryType, importance },
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
