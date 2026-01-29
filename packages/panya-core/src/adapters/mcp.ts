/**
 * Panya MCP Adapter
 *
 * Exposes Panya as MCP tools for use with Claude Code and other MCP clients.
 * Now includes Self-Learning Ontology tools (18 new tools).
 *
 * @example
 * ```typescript
 * import { createMCPServer } from '@panya/core/adapters/mcp';
 *
 * const server = createMCPServer();
 * server.run();
 * ```
 */

import { Panya } from '../index';
import {
  KnowledgeLevelManager,
  PatternDetector,
  Synthesizer,
  IdentityGuardian,
  LearningLoop,
  Consultant,
  ThreadManager,
} from '../skills';

// ============================================================================
// MCP Types (based on Model Context Protocol spec)
// ============================================================================

export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// ============================================================================
// Panya MCP Tools Definition
// ============================================================================

export const PANYA_MCP_TOOLS: MCPTool[] = [
  {
    name: 'panya_auto_learn',
    description: 'Extract and save learnings from a conversation. Panya will analyze the conversation for insights, decisions, preferences, and patterns.',
    parameters: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'Array of conversation messages',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
            },
            required: ['role', 'content'],
          },
        },
        context: {
          type: 'string',
          description: 'Optional context about the conversation (e.g., project name, topic)',
        },
      },
      required: ['messages'],
    },
  },
  {
    name: 'panya_search',
    description: 'Search Panya brain for documents. Supports FTS (keyword), vector (semantic), or hybrid search.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
        },
        mode: {
          type: 'string',
          enum: ['fts', 'vector', 'hybrid'],
          description: 'Search mode: fts (keyword), vector (semantic), hybrid (combined). Default: hybrid if ChromaDB enabled, else fts.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'panya_stats',
    description: 'Get Panya brain statistics (document count, entity count, etc.)',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'panya_recent_learnings',
    description: 'Get recent learnings/insights extracted by Panya',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of learnings to return (default: 10)',
        },
      },
    },
  },
  {
    name: 'panya_extract_entities',
    description: 'Extract named entities from text',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to extract entities from',
        },
      },
      required: ['text'],
    },
  },
  // Context Radar Tools
  {
    name: 'panya_context',
    description: 'Get full context awareness: current project, file, time, session, activity, and detected patterns',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'panya_context_summary',
    description: 'Get a brief context summary (for prompts or quick awareness)',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'panya_set_context',
    description: 'Set current project and/or file context',
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project path to set as current context',
        },
        file: {
          type: 'string',
          description: 'File path to set as current context',
        },
      },
    },
  },
  {
    name: 'panya_log_activity',
    description: 'Log an activity for context tracking',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['file_access', 'tool_use', 'message', 'search', 'learning'],
          description: 'Type of activity',
        },
        detail: {
          type: 'string',
          description: 'Description of the activity',
        },
      },
      required: ['type', 'detail'],
    },
  },
  // Knowledge Connector Tools
  {
    name: 'panya_find_connections',
    description: 'Find connections between a document and other content in the knowledge base',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'ID of the document to find connections for',
        },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'panya_suggestions',
    description: 'Get related content suggestions for a document',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'ID of the document to get suggestions for',
        },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'panya_knowledge_graph',
    description: 'Build and return the knowledge graph showing all connections',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'panya_auto_connect',
    description: 'Automatically create relationships between a document and related content',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'ID of the document to auto-connect',
        },
        minStrength: {
          type: 'number',
          description: 'Minimum connection strength to create relationship (0-1, default: 0.5)',
        },
      },
      required: ['documentId'],
    },
  },

  // ================================================================
  // ONTOLOGY TOOLS (3)
  // ================================================================
  {
    name: 'panya_define_entity_type',
    description: 'Define a new entity type in the ontology (e.g., "project", "person", "concept")',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique ID for the entity type' },
        name: { type: 'string', description: 'Display name for the entity type' },
        parentTypeId: { type: 'string', description: 'Optional parent type ID for inheritance' },
        validationSchema: { type: 'string', description: 'Optional JSON Schema for validation' },
      },
      required: ['id', 'name'],
    },
  },
  {
    name: 'panya_define_relationship_type',
    description: 'Define a new relationship type (e.g., "updates", "extends", "contradicts")',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique ID for the relationship type' },
        name: { type: 'string', description: 'Display name for the relationship' },
        sourceTypeId: { type: 'string', description: 'Optional: restrict to this source entity type' },
        targetTypeId: { type: 'string', description: 'Optional: restrict to this target entity type' },
        inverseId: { type: 'string', description: 'Optional: ID of the inverse relationship' },
      },
      required: ['id', 'name'],
    },
  },
  {
    name: 'panya_list_entity_types',
    description: 'List all defined entity types in the ontology',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ================================================================
  // KNOWLEDGE LEVEL TOOLS (4)
  // ================================================================
  {
    name: 'panya_get_level',
    description: 'Get the knowledge level (L1-L4) and metadata of a document',
    parameters: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'panya_promote',
    description: 'Promote a document to the next knowledge level',
    parameters: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document to promote' },
        newConfidence: { type: 'number', description: 'Optional new confidence value (0-1)' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'panya_demote',
    description: 'Demote a document to a lower knowledge level (rare operation)',
    parameters: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document to demote' },
        reason: { type: 'string', description: 'Reason for demotion' },
      },
      required: ['documentId', 'reason'],
    },
  },
  {
    name: 'panya_level_stats',
    description: 'Get statistics about knowledge levels (counts, avg confidence, etc.)',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ================================================================
  // PATTERN TOOLS (3)
  // ================================================================
  {
    name: 'panya_detect_patterns',
    description: 'Run pattern detection to find co-occurrences, temporal patterns, contradictions, etc.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['co-occurrence', 'temporal', 'semantic', 'contradiction', 'evolution', 'all'],
          description: 'Type of pattern to detect (default: all)',
        },
      },
    },
  },
  {
    name: 'panya_validate_pattern',
    description: 'Validate or reject a detected pattern',
    parameters: {
      type: 'object',
      properties: {
        patternId: { type: 'number', description: 'ID of the pattern' },
        valid: { type: 'boolean', description: 'True to validate, false to reject' },
      },
      required: ['patternId', 'valid'],
    },
  },
  {
    name: 'panya_list_patterns',
    description: 'List detected patterns with optional status filter',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['detected', 'validated', 'rejected', 'applied'],
          description: 'Filter by pattern status',
        },
        limit: { type: 'number', description: 'Max patterns to return (default: 50)' },
      },
    },
  },

  // ================================================================
  // SYNTHESIS TOOLS (4)
  // ================================================================
  {
    name: 'panya_merge',
    description: 'Merge multiple documents into a new synthesized document',
    parameters: {
      type: 'object',
      properties: {
        documentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of documents to merge (minimum 2)',
        },
        strategy: {
          type: 'string',
          enum: ['concat', 'dedupe', 'summarize'],
          description: 'Merge strategy (default: dedupe)',
        },
        preserveOriginals: { type: 'boolean', description: 'Keep original docs (default: false, marks as superseded)' },
      },
      required: ['documentIds'],
    },
  },
  {
    name: 'panya_distill',
    description: 'Extract the essence from a document (make it more concise)',
    parameters: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document to distill' },
        maxLength: { type: 'number', description: 'Maximum length of distilled content' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'panya_supersede',
    description: 'Mark an old document as superseded by a new one (version, don\'t delete)',
    parameters: {
      type: 'object',
      properties: {
        oldDocumentId: { type: 'string', description: 'ID of the document being superseded' },
        newDocumentId: { type: 'string', description: 'ID of the document that supersedes it' },
        reason: { type: 'string', description: 'Optional reason for superseding' },
      },
      required: ['oldDocumentId', 'newDocumentId'],
    },
  },
  {
    name: 'panya_resolve_conflict',
    description: 'Resolve a knowledge conflict between two documents',
    parameters: {
      type: 'object',
      properties: {
        conflictId: { type: 'number', description: 'ID of the conflict' },
        resolution: {
          type: 'string',
          enum: ['merged', 'superseded', 'coexist', 'rejected'],
          description: 'How to resolve the conflict',
        },
        keepDocument: { type: 'string', description: 'For "superseded": which document to keep' },
        mergeDocuments: { type: 'boolean', description: 'For "merged": whether to merge the documents' },
      },
      required: ['conflictId', 'resolution'],
    },
  },

  // ================================================================
  // LEARNING LOOP TOOLS (4)
  // ================================================================
  {
    name: 'panya_run_learning_loop',
    description: 'Run one complete learning cycle (observe → extract → synthesize → promote → correct → decay)',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'panya_loop_status',
    description: 'Get the current status of the learning loop',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'panya_start_auto_loop',
    description: 'Start automatic learning loop (runs periodically)',
    parameters: {
      type: 'object',
      properties: {
        intervalMs: { type: 'number', description: 'Interval between cycles in milliseconds (default: 3600000 = 1 hour)' },
      },
    },
  },
  {
    name: 'panya_stop_auto_loop',
    description: 'Stop the automatic learning loop',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ================================================================
  // IDENTITY GUARDIAN TOOLS (4)
  // ================================================================
  {
    name: 'panya_get_identity',
    description: 'Get Robin\'s identity summary or specific facet',
    parameters: {
      type: 'object',
      properties: {
        facetId: { type: 'string', description: 'Optional: specific facet ID to retrieve' },
        facetType: { type: 'string', enum: ['personality', 'voice', 'values', 'relationship'], description: 'Optional: filter by facet type' },
      },
    },
  },
  {
    name: 'panya_update_facet',
    description: 'Update an identity facet (requires validation for locked facets)',
    parameters: {
      type: 'object',
      properties: {
        facetId: { type: 'string', description: 'ID of the facet to update' },
        content: { type: 'string', description: 'New content for the facet' },
        reason: { type: 'string', description: 'Reason for the update' },
      },
      required: ['facetId', 'content'],
    },
  },
  {
    name: 'panya_record_memory',
    description: 'Record a relationship memory (moment, milestone, inside joke, preference)',
    parameters: {
      type: 'object',
      properties: {
        memoryType: {
          type: 'string',
          enum: ['moment', 'pattern', 'preference', 'milestone', 'inside_joke'],
          description: 'Type of memory',
        },
        content: { type: 'string', description: 'Content of the memory' },
        importance: { type: 'number', description: 'Importance score (0-1, default: 0.5)' },
      },
      required: ['memoryType', 'content'],
    },
  },
  {
    name: 'panya_ontology_stats',
    description: 'Get comprehensive ontology statistics (levels, patterns, conflicts, etc.)',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ================================================================
  // CONSULTANT TOOLS (Oracle Features)
  // ================================================================
  {
    name: 'panya_consult',
    description: 'Get principle-based guidance for a decision. Searches L4 Core wisdom and past decisions.',
    parameters: {
      type: 'object',
      properties: {
        decision: { type: 'string', description: 'The decision you need guidance on' },
        context: { type: 'string', description: 'Additional context about your situation' },
      },
      required: ['decision'],
    },
  },
  {
    name: 'panya_reflect',
    description: 'Get a random principle for reflection. Use for periodic wisdom or to align with core values.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'panya_decisions_list',
    description: 'List tracked decisions with optional filters',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'parked', 'researching', 'decided', 'implemented', 'closed'],
          description: 'Filter by decision status',
        },
        project: { type: 'string', description: 'Filter by project' },
        limit: { type: 'number', description: 'Maximum number of decisions to return (default: 20)' },
      },
    },
  },
  {
    name: 'panya_decisions_create',
    description: 'Create a new decision to track',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Decision title' },
        context: { type: 'string', description: 'Why this decision matters, background info' },
        project: { type: 'string', description: 'Project context' },
        options: {
          type: 'array',
          description: 'Available options with pros/cons',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              pros: { type: 'array', items: { type: 'string' } },
              cons: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
      },
      required: ['title'],
    },
  },
  {
    name: 'panya_decisions_get',
    description: 'Get a single decision with full details',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Decision ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'panya_decisions_update',
    description: 'Update a decision (add decision, rationale, change status)',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Decision ID' },
        status: {
          type: 'string',
          enum: ['pending', 'parked', 'researching', 'decided', 'implemented', 'closed'],
        },
        decision: { type: 'string', description: 'The decision made (what was chosen)' },
        rationale: { type: 'string', description: 'Why this choice was made' },
        decidedBy: { type: 'string', description: 'Who made the decision' },
      },
      required: ['id'],
    },
  },
  {
    name: 'panya_trace',
    description: 'Log a trace/discovery session with dig points (files, commits, issues found)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What was traced/searched' },
        queryType: {
          type: 'string',
          enum: ['general', 'project', 'pattern', 'evolution'],
          description: 'Type of trace query',
        },
        project: { type: 'string', description: 'Project context' },
        foundFiles: {
          type: 'array',
          description: 'Files discovered',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              type: { type: 'string', enum: ['learning', 'retro', 'resonance', 'other'] },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
          },
        },
        foundCommits: {
          type: 'array',
          description: 'Commits discovered',
          items: {
            type: 'object',
            properties: {
              hash: { type: 'string' },
              shortHash: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
        foundIssues: {
          type: 'array',
          description: 'GitHub issues discovered',
          items: {
            type: 'object',
            properties: {
              number: { type: 'number' },
              title: { type: 'string' },
              state: { type: 'string', enum: ['open', 'closed'] },
            },
          },
        },
        durationMs: { type: 'number', description: 'How long the trace took in milliseconds' },
        agentCount: { type: 'number', description: 'Number of agents used' },
      },
      required: ['query'],
    },
  },
  {
    name: 'panya_trace_list',
    description: 'List recent traces with optional filters',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Filter by project' },
        status: { type: 'string', enum: ['raw', 'reviewed', 'distilling', 'distilled'] },
        limit: { type: 'number', description: 'Maximum traces to return (default: 20)' },
      },
    },
  },
  {
    name: 'panya_trace_get',
    description: 'Get full details of a specific trace',
    parameters: {
      type: 'object',
      properties: {
        traceId: { type: 'string', description: 'UUID of the trace' },
      },
      required: ['traceId'],
    },
  },

  // =========================================================================
  // Thread Tools (Multi-turn discussions)
  // =========================================================================
  {
    name: 'panya_thread',
    description: 'Send a message to a thread. Creates a new thread if threadId is not provided. Use for multi-turn discussions and consultations.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Your message' },
        threadId: { type: 'number', description: 'Thread ID to continue (omit to create new)' },
        title: { type: 'string', description: 'Title for new thread (defaults to first 50 chars)' },
        role: { type: 'string', enum: ['human', 'assistant'], description: 'Who is sending (default: human)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'panya_threads',
    description: 'List threads with optional filters. Use to find ongoing discussions.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'pending', 'answered', 'closed'], description: 'Filter by status' },
        limit: { type: 'number', description: 'Maximum threads to return (default: 20)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  {
    name: 'panya_thread_read',
    description: 'Read full message history from a thread.',
    parameters: {
      type: 'object',
      properties: {
        threadId: { type: 'number', description: 'Thread ID to read' },
        limit: { type: 'number', description: 'Maximum messages to return' },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'panya_thread_update',
    description: 'Update thread status. Use to close, reopen, or mark threads as answered/pending.',
    parameters: {
      type: 'object',
      properties: {
        threadId: { type: 'number', description: 'Thread ID to update' },
        status: { type: 'string', enum: ['active', 'pending', 'answered', 'closed'], description: 'New status' },
      },
      required: ['threadId', 'status'],
    },
  },

  // =========================================================================
  // ChromaDB / Vector Search Tools
  // =========================================================================
  {
    name: 'panya_init_chroma',
    description: 'Initialize ChromaDB for vector/semantic search. Must call this before using vector or hybrid search.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'panya_index_to_chroma',
    description: 'Index all documents to ChromaDB for vector search. Call after init_chroma.',
    parameters: {
      type: 'object',
      properties: {
        batchSize: { type: 'number', description: 'Batch size for indexing (default: 100)' },
      },
    },
  },
  {
    name: 'panya_chroma_stats',
    description: 'Get ChromaDB statistics (document count, connection status).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================================================
// MCP Adapter Class
// ============================================================================

export class PanyaMCPAdapter {
  private panya: Panya;
  private initialized: boolean = false;

  // Self-learning ontology components
  private levelManager: KnowledgeLevelManager;
  private patternDetector: PatternDetector;
  private synthesizer: Synthesizer;
  private identityGuardian: IdentityGuardian;
  private learningLoop: LearningLoop;
  private consultant: Consultant;
  private threadManager: ThreadManager;

  constructor(panya?: Panya) {
    this.panya = panya || new Panya();

    // Initialize ontology components
    this.levelManager = new KnowledgeLevelManager();
    this.patternDetector = new PatternDetector();
    this.synthesizer = new Synthesizer();
    this.identityGuardian = new IdentityGuardian();
    this.learningLoop = new LearningLoop();
    this.consultant = new Consultant();
    this.threadManager = new ThreadManager();
  }

  /**
   * Get list of available tools
   */
  getTools(): MCPTool[] {
    return PANYA_MCP_TOOLS;
  }

  /**
   * Handle a tool call
   */
  async handleToolCall(call: MCPToolCall): Promise<MCPToolResult> {
    // Ensure initialized
    if (!this.initialized) {
      await this.panya.initialize();
      this.initialized = true;
    }

    try {
      switch (call.name) {
        case 'panya_auto_learn':
          return this.handleAutoLearn(call.arguments);

        case 'panya_search':
          return await this.handleSearch(call.arguments);

        case 'panya_stats':
          return this.handleStats();

        case 'panya_recent_learnings':
          return this.handleRecentLearnings(call.arguments);

        case 'panya_extract_entities':
          return this.handleExtractEntities(call.arguments);

        // Context Radar handlers
        case 'panya_context':
          return this.handleContext();

        case 'panya_context_summary':
          return this.handleContextSummary();

        case 'panya_set_context':
          return this.handleSetContext(call.arguments);

        case 'panya_log_activity':
          return this.handleLogActivity(call.arguments);

        // Knowledge Connector handlers
        case 'panya_find_connections':
          return this.handleFindConnections(call.arguments);

        case 'panya_suggestions':
          return this.handleSuggestions(call.arguments);

        case 'panya_knowledge_graph':
          return this.handleKnowledgeGraph();

        case 'panya_auto_connect':
          return this.handleAutoConnect(call.arguments);

        // Ontology handlers
        case 'panya_define_entity_type':
          return this.handleDefineEntityType(call.arguments);
        case 'panya_define_relationship_type':
          return this.handleDefineRelationshipType(call.arguments);
        case 'panya_list_entity_types':
          return this.handleListEntityTypes();

        // Knowledge level handlers
        case 'panya_get_level':
          return this.handleGetLevel(call.arguments);
        case 'panya_promote':
          return this.handlePromote(call.arguments);
        case 'panya_demote':
          return this.handleDemote(call.arguments);
        case 'panya_level_stats':
          return this.handleLevelStats();

        // Pattern handlers
        case 'panya_detect_patterns':
          return this.handleDetectPatterns(call.arguments);
        case 'panya_validate_pattern':
          return this.handleValidatePattern(call.arguments);
        case 'panya_list_patterns':
          return this.handleListPatterns(call.arguments);

        // Synthesis handlers
        case 'panya_merge':
          return this.handleMerge(call.arguments);
        case 'panya_distill':
          return this.handleDistill(call.arguments);
        case 'panya_supersede':
          return this.handleSupersede(call.arguments);
        case 'panya_resolve_conflict':
          return this.handleResolveConflict(call.arguments);

        // Learning loop handlers
        case 'panya_run_learning_loop':
          return await this.handleRunLearningLoop();
        case 'panya_loop_status':
          return this.handleLoopStatus();
        case 'panya_start_auto_loop':
          return this.handleStartAutoLoop(call.arguments);
        case 'panya_stop_auto_loop':
          return this.handleStopAutoLoop();

        // Identity handlers
        case 'panya_get_identity':
          return this.handleGetIdentity(call.arguments);
        case 'panya_update_facet':
          return this.handleUpdateFacet(call.arguments);
        case 'panya_record_memory':
          return this.handleRecordMemory(call.arguments);
        case 'panya_ontology_stats':
          return this.handleOntologyStats();

        // Consultant handlers (Oracle features)
        case 'panya_consult':
          return this.handleConsult(call.arguments);
        case 'panya_reflect':
          return this.handleReflect();
        case 'panya_decisions_list':
          return this.handleDecisionsList(call.arguments);
        case 'panya_decisions_create':
          return this.handleDecisionsCreate(call.arguments);
        case 'panya_decisions_get':
          return this.handleDecisionsGet(call.arguments);
        case 'panya_decisions_update':
          return this.handleDecisionsUpdate(call.arguments);
        case 'panya_trace':
          return this.handleTrace(call.arguments);
        case 'panya_trace_list':
          return this.handleTraceList(call.arguments);
        case 'panya_trace_get':
          return this.handleTraceGet(call.arguments);

        // Thread handlers
        case 'panya_thread':
          return this.handleThread(call.arguments);
        case 'panya_threads':
          return this.handleThreads(call.arguments);
        case 'panya_thread_read':
          return this.handleThreadRead(call.arguments);
        case 'panya_thread_update':
          return this.handleThreadUpdate(call.arguments);

        // ChromaDB handlers
        case 'panya_init_chroma':
          return await this.handleInitChroma();
        case 'panya_index_to_chroma':
          return await this.handleIndexToChroma(call.arguments);
        case 'panya_chroma_stats':
          return await this.handleChromaStats();

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${call.name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  // ==========================================================================
  // Tool Handlers
  // ==========================================================================

  private async handleAutoLearn(args: Record<string, any>): Promise<MCPToolResult> {
    const { messages, context } = args;

    if (!messages || !Array.isArray(messages)) {
      return {
        content: [{ type: 'text', text: 'messages array is required' }],
        isError: true,
      };
    }

    const result = await this.panya.skills.autoLearn.extractFromConversation(messages, context);

    if (result.learnings.length > 0) {
      const ids = this.panya.skills.autoLearn.saveLearnings(this.panya.brain, result.learnings);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            learningsExtracted: result.learnings.length,
            savedIds: ids,
            learnings: result.learnings.map(l => ({
              type: l.type,
              content: l.content,
              confidence: l.confidence,
            })),
            processingTime: result.processingTime,
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          learningsExtracted: 0,
          message: 'No significant learnings found in this conversation',
          processingTime: result.processingTime,
        }, null, 2),
      }],
    };
  }

  private async handleSearch(args: Record<string, any>): Promise<MCPToolResult> {
    const { query, limit = 10, mode } = args;

    if (!query) {
      return {
        content: [{ type: 'text', text: 'query is required' }],
        isError: true,
      };
    }

    // Determine search mode
    const searchMode = mode || (this.panya.brain.isChromaEnabled() ? 'hybrid' : 'fts');
    let results: any[] = [];
    let searchType = searchMode;

    if (searchMode === 'hybrid' && this.panya.brain.isChromaEnabled()) {
      const hybridResults = await this.panya.brain.hybridSearch(query, limit);
      results = hybridResults.map(r => ({
        ...r.document,
        ftsScore: r.ftsScore,
        vectorScore: r.vectorScore,
        combinedScore: r.combinedScore,
      }));
    } else if (searchMode === 'vector' && this.panya.brain.isChromaEnabled()) {
      results = await this.panya.brain.searchVector(query, limit);
    } else {
      results = this.panya.search(query, limit);
      searchType = 'fts';
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          mode: searchType,
          chromaEnabled: this.panya.brain.isChromaEnabled(),
          resultCount: results.length,
          results: results.map((doc: any) => ({
            id: doc.id,
            type: doc.type,
            scope: doc.scope,
            sourceFile: doc.sourceFile,
            content: doc.content?.substring(0, 200) + (doc.content && doc.content.length > 200 ? '...' : ''),
            tags: doc.tags,
            ...(doc.ftsScore !== undefined && { ftsScore: doc.ftsScore }),
            ...(doc.vectorScore !== undefined && { vectorScore: doc.vectorScore }),
            ...(doc.combinedScore !== undefined && { combinedScore: doc.combinedScore }),
          })),
        }, null, 2),
      }],
    };
  }

  private handleStats(): MCPToolResult {
    const stats = this.panya.stats();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          brain: stats,
          identity: {
            name: this.panya.identity.name,
            title: this.panya.identity.title,
          },
        }, null, 2),
      }],
    };
  }

  private handleRecentLearnings(args: Record<string, any>): MCPToolResult {
    const { limit = 10 } = args;

    const insights = this.panya.brain.getRecentInsights(limit);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: insights.length,
          learnings: insights.map(i => ({
            id: i.id,
            type: i.type,
            content: i.content,
            confidence: i.confidence,
            createdAt: new Date(i.created_at).toISOString(),
          })),
        }, null, 2),
      }],
    };
  }

  private async handleExtractEntities(args: Record<string, any>): Promise<MCPToolResult> {
    const { text } = args;

    if (!text) {
      return {
        content: [{ type: 'text', text: 'text is required' }],
        isError: true,
      };
    }

    const result = await this.panya.entityExtractor.extract(text, { useLLM: true });

    // Save entities to database
    if (result.entities.length > 0) {
      this.panya.entityExtractor.saveToDatabase(this.panya.brain, 'extract_' + Date.now(), result.entities);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          entityCount: result.entities.length,
          method: result.method,
          processingTime: result.processingTime,
          savedToDb: result.entities.length,
          entities: result.entities.map(e => ({
            name: e.name,
            type: e.type,
            normalizedName: e.normalizedName,
            confidence: e.confidence,
          })),
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Context Radar Handlers
  // ==========================================================================

  private handleContext(): MCPToolResult {
    const context = this.panya.context();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          project: context.project,
          file: context.file,
          time: {
            period: context.time.period,
            hour: context.time.hour,
            isWeekend: context.time.isWeekend,
            isWorkHours: context.time.isWorkHours,
            timezone: context.time.timezone,
          },
          session: {
            id: context.session.id,
            messageCount: context.session.messageCount,
            filesAccessed: context.session.filesAccessed.length,
            toolsUsed: context.session.toolsUsed,
            topicsDiscussed: context.session.topicsDiscussed,
            durationMinutes: Math.round((Date.now() - context.session.startedAt) / 60000),
          },
          patterns: context.patterns.map(p => ({
            pattern: p.pattern,
            confidence: p.confidence,
          })),
          recentActivityCount: context.recentActivity.length,
        }, null, 2),
      }],
    };
  }

  private handleContextSummary(): MCPToolResult {
    const summary = this.panya.contextSummary();

    return {
      content: [{
        type: 'text',
        text: summary,
      }],
    };
  }

  private handleSetContext(args: Record<string, any>): MCPToolResult {
    const { project, file } = args;

    if (project) {
      this.panya.setProject(project);
    }

    if (file) {
      this.panya.setFile(file);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          projectSet: project || null,
          fileSet: file || null,
        }, null, 2),
      }],
    };
  }

  private handleLogActivity(args: Record<string, any>): MCPToolResult {
    const { type, detail } = args;

    if (!type || !detail) {
      return {
        content: [{ type: 'text', text: 'type and detail are required' }],
        isError: true,
      };
    }

    this.panya.logActivity(type, detail);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          logged: { type, detail, timestamp: Date.now() },
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Knowledge Connector Handlers
  // ==========================================================================

  private handleFindConnections(args: Record<string, any>): MCPToolResult {
    const { documentId } = args;

    if (!documentId) {
      return {
        content: [{ type: 'text', text: 'documentId is required' }],
        isError: true,
      };
    }

    const connections = this.panya.findConnections(documentId);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          documentId,
          connectionCount: connections.length,
          connections: connections.map(c => ({
            targetId: c.targetId,
            type: c.type,
            strength: c.strength,
            reason: c.reason,
          })),
        }, null, 2),
      }],
    };
  }

  private handleSuggestions(args: Record<string, any>): MCPToolResult {
    const { documentId } = args;

    if (!documentId) {
      return {
        content: [{ type: 'text', text: 'documentId is required' }],
        isError: true,
      };
    }

    const result = this.panya.getSuggestions(documentId);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          documentId: result.documentId,
          suggestionCount: result.suggestions.length,
          suggestions: result.suggestions,
        }, null, 2),
      }],
    };
  }

  private handleKnowledgeGraph(): MCPToolResult {
    const graph = this.panya.buildGraph();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          stats: graph.stats,
          nodes: graph.nodes.slice(0, 50).map(n => ({
            id: n.id,
            type: n.type,
            label: n.label,
            connections: n.connections,
          })),
          edges: graph.edges.slice(0, 100).map(e => ({
            source: e.sourceId,
            target: e.targetId,
            type: e.type,
            strength: e.strength,
          })),
          truncated: graph.nodes.length > 50 || graph.edges.length > 100,
        }, null, 2),
      }],
    };
  }

  private handleAutoConnect(args: Record<string, any>): MCPToolResult {
    const { documentId, minStrength = 0.5 } = args;

    if (!documentId) {
      return {
        content: [{ type: 'text', text: 'documentId is required' }],
        isError: true,
      };
    }

    const created = this.panya.autoConnect(documentId, minStrength);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          documentId,
          relationshipsCreated: created,
          minStrength,
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Ontology Handlers
  // ==========================================================================

  private handleDefineEntityType(args: Record<string, any>): MCPToolResult {
    const { id, name, parentTypeId, validationSchema } = args;

    if (!id || !name) {
      return {
        content: [{ type: 'text', text: 'id and name are required' }],
        isError: true,
      };
    }

    const resultId = this.panya.brain.defineEntityType({
      id,
      name,
      parentTypeId,
      validationSchema,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          entityTypeId: resultId,
          name,
          parentTypeId: parentTypeId || null,
        }, null, 2),
      }],
    };
  }

  private handleDefineRelationshipType(args: Record<string, any>): MCPToolResult {
    const { id, name, sourceTypeId, targetTypeId, inverseId } = args;

    if (!id || !name) {
      return {
        content: [{ type: 'text', text: 'id and name are required' }],
        isError: true,
      };
    }

    const resultId = this.panya.brain.defineRelationshipType({
      id,
      name,
      sourceTypeId,
      targetTypeId,
      inverseId,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          relationshipTypeId: resultId,
          name,
          inverseId: inverseId || null,
        }, null, 2),
      }],
    };
  }

  private handleListEntityTypes(): MCPToolResult {
    const types = this.panya.brain.getEntityTypes();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: types.length,
          entityTypes: types.map(t => ({
            id: t.id,
            name: t.name,
            parentTypeId: t.parentTypeId,
          })),
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Knowledge Level Handlers
  // ==========================================================================

  private handleGetLevel(args: Record<string, any>): MCPToolResult {
    const { documentId } = args;

    if (!documentId) {
      return {
        content: [{ type: 'text', text: 'documentId is required' }],
        isError: true,
      };
    }

    const levelData = this.levelManager.getLevel(this.panya.brain, documentId);

    if (!levelData) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            documentId,
            hasLevel: false,
            message: 'Document has no knowledge level data',
          }, null, 2),
        }],
      };
    }

    const levelNames = { 1: 'L1 Raw', 2: 'L2 Extracted', 3: 'L3 Synthesized', 4: 'L4 Core' };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          documentId,
          level: levelData.level,
          levelName: levelNames[levelData.level as keyof typeof levelNames],
          confidence: levelData.confidence,
          usageCount: levelData.usageCount,
          promotedFromId: levelData.promotedFromId,
          lastPromotedAt: levelData.lastPromotedAt ? new Date(levelData.lastPromotedAt).toISOString() : null,
        }, null, 2),
      }],
    };
  }

  private handlePromote(args: Record<string, any>): MCPToolResult {
    const { documentId, newConfidence } = args;

    if (!documentId) {
      return {
        content: [{ type: 'text', text: 'documentId is required' }],
        isError: true,
      };
    }

    const result = this.levelManager.promote(this.panya.brain, documentId, newConfidence);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          documentId,
          newLevel: result.newLevel,
          error: result.error,
        }, null, 2),
      }],
    };
  }

  private handleDemote(args: Record<string, any>): MCPToolResult {
    const { documentId, reason } = args;

    if (!documentId || !reason) {
      return {
        content: [{ type: 'text', text: 'documentId and reason are required' }],
        isError: true,
      };
    }

    const result = this.levelManager.demote(this.panya.brain, documentId, reason);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          documentId,
          newLevel: result.newLevel,
          reason,
          error: result.error,
        }, null, 2),
      }],
    };
  }

  private handleLevelStats(): MCPToolResult {
    const summary = this.levelManager.getSummary(this.panya.brain);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: summary.total,
          distribution: summary.distribution,
          averageConfidence: summary.avgConfidence,
          readyForPromotion: summary.readyForPromotion,
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Pattern Handlers
  // ==========================================================================

  private handleDetectPatterns(args: Record<string, any>): MCPToolResult {
    const { type = 'all' } = args;

    let result;
    if (type === 'all') {
      result = this.patternDetector.detectAll(this.panya.brain);
    } else {
      const patterns = this.patternDetector.detect(this.panya.brain, type);
      result = {
        patterns,
        stats: { [type]: patterns.length, total: patterns.length },
        processingTimeMs: 0,
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          patternsDetected: result.stats.total,
          stats: result.stats,
          processingTimeMs: result.processingTimeMs,
          patterns: result.patterns.slice(0, 20).map((p: any) => ({
            id: p.id,
            type: p.patternType,
            confidence: p.confidence,
            description: p.description,
            documentCount: p.documentIds.length,
          })),
        }, null, 2),
      }],
    };
  }

  private handleValidatePattern(args: Record<string, any>): MCPToolResult {
    const { patternId, valid } = args;

    if (patternId === undefined || valid === undefined) {
      return {
        content: [{ type: 'text', text: 'patternId and valid are required' }],
        isError: true,
      };
    }

    this.patternDetector.validatePattern(this.panya.brain, patternId, valid);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          patternId,
          newStatus: valid ? 'validated' : 'rejected',
        }, null, 2),
      }],
    };
  }

  private handleListPatterns(args: Record<string, any>): MCPToolResult {
    const { status, limit = 50 } = args;

    const patterns = this.panya.brain.getPatterns(status, limit);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: patterns.length,
          status: status || 'all',
          patterns: patterns.map(p => ({
            id: p.id,
            type: p.patternType,
            confidence: p.confidence,
            status: p.status,
            description: p.description,
            documentCount: p.documentIds.length,
            createdAt: new Date(p.createdAt).toISOString(),
          })),
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Synthesis Handlers
  // ==========================================================================

  private handleMerge(args: Record<string, any>): MCPToolResult {
    const { documentIds, strategy = 'dedupe', preserveOriginals = false } = args;

    if (!documentIds || documentIds.length < 2) {
      return {
        content: [{ type: 'text', text: 'documentIds array with at least 2 IDs is required' }],
        isError: true,
      };
    }

    const result = this.synthesizer.merge(this.panya.brain, documentIds, {
      strategy,
      preserveOriginals,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          resultDocumentId: result.resultDocumentId,
          sourceCount: result.sourceDocumentIds.length,
          strategy,
          metadata: result.metadata,
          error: result.error,
        }, null, 2),
      }],
    };
  }

  private handleDistill(args: Record<string, any>): MCPToolResult {
    const { documentId, maxLength } = args;

    if (!documentId) {
      return {
        content: [{ type: 'text', text: 'documentId is required' }],
        isError: true,
      };
    }

    const result = this.synthesizer.distill(this.panya.brain, documentId, { maxLength });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          resultDocumentId: result.resultDocumentId,
          originalDocumentId: documentId,
          metadata: result.metadata,
          error: result.error,
        }, null, 2),
      }],
    };
  }

  private handleSupersede(args: Record<string, any>): MCPToolResult {
    const { oldDocumentId, newDocumentId, reason } = args;

    if (!oldDocumentId || !newDocumentId) {
      return {
        content: [{ type: 'text', text: 'oldDocumentId and newDocumentId are required' }],
        isError: true,
      };
    }

    const result = this.synthesizer.supersede(this.panya.brain, oldDocumentId, newDocumentId, reason);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          oldDocumentId,
          newDocumentId,
          reason: reason || null,
          error: result.error,
        }, null, 2),
      }],
    };
  }

  private handleResolveConflict(args: Record<string, any>): MCPToolResult {
    const { conflictId, resolution, keepDocument, mergeDocuments } = args;

    if (conflictId === undefined || !resolution) {
      return {
        content: [{ type: 'text', text: 'conflictId and resolution are required' }],
        isError: true,
      };
    }

    const result = this.synthesizer.resolveConflict(this.panya.brain, conflictId, resolution, {
      keepDocument,
      mergeDocuments,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          conflictId,
          resolution: result.resolution,
          resultDocumentId: result.resultDocumentId,
          description: result.description,
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Learning Loop Handlers
  // ==========================================================================

  private async handleRunLearningLoop(): Promise<MCPToolResult> {
    const result = await this.learningLoop.runOnce(this.panya.brain);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          durationMs: result.durationMs,
          stages: result.stages,
          errors: result.errors,
        }, null, 2),
      }],
    };
  }

  private handleLoopStatus(): MCPToolResult {
    const status = this.learningLoop.getStatus();
    const stats = this.learningLoop.getStats(this.panya.brain);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          loop: status,
          levels: stats.levels,
          autoLoop: stats.autoLoop,
        }, null, 2),
      }],
    };
  }

  private handleStartAutoLoop(args: Record<string, any>): MCPToolResult {
    const { intervalMs } = args;

    if (intervalMs) {
      // Need to recreate learning loop with new config
      // For now, use default
    }

    const result = this.learningLoop.startAutoLoop(this.panya.brain);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          message: result.success ? 'Auto loop started' : 'Auto loop already running',
          intervalMs: result.intervalMs,
        }, null, 2),
      }],
    };
  }

  private handleStopAutoLoop(): MCPToolResult {
    const result = this.learningLoop.stopAutoLoop();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          wasStopped: result.wasStopped,
          message: result.wasStopped ? 'Auto loop stopped' : 'Auto loop was not running',
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Identity Handlers
  // ==========================================================================

  private handleGetIdentity(args: Record<string, any>): MCPToolResult {
    const { facetId, facetType } = args;

    // Initialize identity if needed
    this.identityGuardian.initializeIdentity(this.panya.brain);

    if (facetId) {
      const facet = this.identityGuardian.getFacet(this.panya.brain, facetId);
      if (!facet) {
        return {
          content: [{ type: 'text', text: `Facet not found: ${facetId}` }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            facet: {
              id: facet.id,
              name: facet.name,
              type: facet.facetType,
              content: facet.content,
              locked: facet.locked,
              version: facet.version,
            },
          }, null, 2),
        }],
      };
    }

    if (facetType) {
      const facets = this.identityGuardian.getFacetsByType(this.panya.brain, facetType);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: facetType,
            count: facets.length,
            facets: facets.map(f => ({
              id: f.id,
              name: f.name,
              locked: f.locked,
              contentPreview: f.content.substring(0, 100) + (f.content.length > 100 ? '...' : ''),
            })),
          }, null, 2),
        }],
      };
    }

    // Return summary
    const summary = this.identityGuardian.getSummary(this.panya.brain);

    return {
      content: [{
        type: 'text',
        text: summary,
      }],
    };
  }

  private handleUpdateFacet(args: Record<string, any>): MCPToolResult {
    const { facetId, content, reason } = args;

    if (!facetId || !content) {
      return {
        content: [{ type: 'text', text: 'facetId and content are required' }],
        isError: true,
      };
    }

    const result = this.identityGuardian.updateFacet(this.panya.brain, {
      id: facetId,
      content,
      reason,
      updatedBy: 'user',
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          facetId,
          requiresValidation: result.requiresValidation,
          error: result.error,
          message: result.requiresValidation
            ? 'This facet is locked. Update queued for validation.'
            : result.success
              ? 'Facet updated successfully'
              : 'Update failed',
        }, null, 2),
      }],
    };
  }

  private handleRecordMemory(args: Record<string, any>): MCPToolResult {
    const { memoryType, content, importance = 0.5 } = args;

    if (!memoryType || !content) {
      return {
        content: [{ type: 'text', text: 'memoryType and content are required' }],
        isError: true,
      };
    }

    const memoryId = this.identityGuardian.recordMemory(this.panya.brain, {
      memoryType,
      content,
      importance,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          memoryId,
          memoryType,
          importance,
        }, null, 2),
      }],
    };
  }

  private handleOntologyStats(): MCPToolResult {
    const stats = this.panya.brain.getOntologyStats();
    const levelSummary = this.levelManager.getSummary(this.panya.brain);
    const loopStatus = this.learningLoop.getStatus();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ontology: stats,
          knowledge: levelSummary,
          learningLoop: loopStatus,
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Consultant Handlers (Oracle Features)
  // ==========================================================================

  private async handleConsult(args: Record<string, any>): Promise<MCPToolResult> {
    const { decision, context } = args;

    if (!decision) {
      return {
        content: [{ type: 'text', text: 'decision is required' }],
        isError: true,
      };
    }

    const result = await this.consultant.consult(this.panya.brain, decision, context);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          guidance: result.guidance,
          confidence: result.confidence,
          principleCount: result.principles.length,
          patternCount: result.patterns.length,
          relatedDecisionCount: result.relatedDecisions.length,
          principles: result.principles.map(p => ({
            id: p.id,
            content: p.content?.slice(0, 200),
            tags: p.tags,
          })),
          relatedDecisions: result.relatedDecisions,
        }, null, 2),
      }],
    };
  }

  private async handleReflect(): Promise<MCPToolResult> {
    const result = await this.consultant.reflect(this.panya.brain);

    if (!result.principle) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: result.insight,
            hasPrinciple: false,
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          insight: result.insight,
          principle: {
            id: result.principle.id,
            content: result.principle.content,
            tags: result.principle.tags,
          },
          relatedDocs: result.relatedDocs.map(d => ({
            id: d.id,
            content: d.content?.slice(0, 100),
          })),
        }, null, 2),
      }],
    };
  }

  private handleDecisionsList(args: Record<string, any>): MCPToolResult {
    const { status, project, limit = 20 } = args;

    const decisions = this.panya.brain.listDecisions({
      status,
      project,
      limit,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: decisions.length,
          decisions: decisions.map(d => ({
            id: d.id,
            title: d.title,
            status: d.status,
            project: d.project,
            tags: d.tags,
            createdAt: d.createdAt,
          })),
        }, null, 2),
      }],
    };
  }

  private handleDecisionsCreate(args: Record<string, any>): MCPToolResult {
    const { title, context, project, options, tags } = args;

    if (!title) {
      return {
        content: [{ type: 'text', text: 'title is required' }],
        isError: true,
      };
    }

    const id = `decision-${Date.now()}`;
    const decisionId = this.panya.brain.createDecision({
      id,
      title,
      context,
      project,
      status: 'pending',
      options: options || [],
      tags: tags || [],
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          decisionId,
          title,
          status: 'pending',
        }, null, 2),
      }],
    };
  }

  private handleDecisionsGet(args: Record<string, any>): MCPToolResult {
    const { id } = args;

    if (!id) {
      return {
        content: [{ type: 'text', text: 'id is required' }],
        isError: true,
      };
    }

    const decision = this.panya.brain.getDecision(id);

    if (!decision) {
      return {
        content: [{ type: 'text', text: `Decision not found: ${id}` }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(decision, null, 2),
      }],
    };
  }

  private handleDecisionsUpdate(args: Record<string, any>): MCPToolResult {
    const { id, status, decision, rationale, decidedBy } = args;

    if (!id) {
      return {
        content: [{ type: 'text', text: 'id is required' }],
        isError: true,
      };
    }

    const existing = this.panya.brain.getDecision(id);
    if (!existing) {
      return {
        content: [{ type: 'text', text: `Decision not found: ${id}` }],
        isError: true,
      };
    }

    const update: Record<string, any> = {};
    if (status) update.status = status;
    if (decision) update.decision = decision;
    if (rationale) update.rationale = rationale;
    if (decidedBy) {
      update.decidedBy = decidedBy;
      update.decidedAt = Date.now();
    }

    this.panya.brain.updateDecision(id, update);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          decisionId: id,
          updated: Object.keys(update),
        }, null, 2),
      }],
    };
  }

  private handleTrace(args: Record<string, any>): MCPToolResult {
    const {
      query,
      queryType = 'general',
      project,
      foundFiles = [],
      foundCommits = [],
      foundIssues = [],
      durationMs,
      agentCount,
    } = args;

    if (!query) {
      return {
        content: [{ type: 'text', text: 'query is required' }],
        isError: true,
      };
    }

    const id = crypto.randomUUID();
    const traceId = this.panya.brain.createTrace({
      id,
      query,
      queryType,
      project,
      status: 'raw',
      depth: 0,
      foundFiles,
      foundCommits,
      foundIssues,
      foundLearnings: [],
      agentCount,
      durationMs,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          traceId,
          query,
          foundCount: {
            files: foundFiles.length,
            commits: foundCommits.length,
            issues: foundIssues.length,
          },
        }, null, 2),
      }],
    };
  }

  private handleTraceList(args: Record<string, any>): MCPToolResult {
    const { project, status, limit = 20 } = args;

    const traces = this.panya.brain.listTraces({
      project,
      status,
      limit,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: traces.length,
          traces: traces.map(t => ({
            id: t.id,
            query: t.query,
            queryType: t.queryType,
            status: t.status,
            project: t.project,
            foundCount: {
              files: t.foundFiles.length,
              commits: t.foundCommits.length,
              issues: t.foundIssues.length,
            },
            createdAt: t.createdAt,
          })),
        }, null, 2),
      }],
    };
  }

  private handleTraceGet(args: Record<string, any>): MCPToolResult {
    const { traceId } = args;

    if (!traceId) {
      return {
        content: [{ type: 'text', text: 'traceId is required' }],
        isError: true,
      };
    }

    const trace = this.panya.brain.getTrace(traceId);

    if (!trace) {
      return {
        content: [{ type: 'text', text: `Trace not found: ${traceId}` }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(trace, null, 2),
      }],
    };
  }

  // ==========================================================================
  // Thread Handlers
  // ==========================================================================

  private handleThread(args: Record<string, any>): MCPToolResult {
    const { message, threadId, title, role } = args;

    if (!message) {
      return {
        content: [{ type: 'text', text: 'message is required' }],
        isError: true,
      };
    }

    const result = this.threadManager.sendMessage(this.panya.brain, message, {
      threadId,
      title,
      role,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          threadId: result.threadId,
          messageId: result.messageId,
          isNewThread: result.isNewThread,
          thread: {
            id: result.thread.id,
            title: result.thread.title,
            status: result.thread.status,
          },
        }, null, 2),
      }],
    };
  }

  private handleThreads(args: Record<string, any>): MCPToolResult {
    const { status, limit, offset } = args;

    const threads = this.threadManager.list(this.panya.brain, {
      status,
      limit: limit || 20,
      offset: offset || 0,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: threads.length,
          threads: threads.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            messageCount: t.messageCount,
            lastMessageAt: new Date(t.lastMessageAt).toISOString(),
            createdAt: new Date(t.createdAt).toISOString(),
          })),
        }, null, 2),
      }],
    };
  }

  private handleThreadRead(args: Record<string, any>): MCPToolResult {
    const { threadId, limit } = args;

    if (!threadId) {
      return {
        content: [{ type: 'text', text: 'threadId is required' }],
        isError: true,
      };
    }

    const thread = this.threadManager.read(this.panya.brain, threadId, limit);

    if (!thread) {
      return {
        content: [{ type: 'text', text: `Thread not found: ${threadId}` }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: thread.id,
          title: thread.title,
          status: thread.status,
          messageCount: thread.messageCount,
          messages: thread.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: new Date(m.createdAt).toISOString(),
          })),
        }, null, 2),
      }],
    };
  }

  private handleThreadUpdate(args: Record<string, any>): MCPToolResult {
    const { threadId, status } = args;

    if (!threadId || !status) {
      return {
        content: [{ type: 'text', text: 'threadId and status are required' }],
        isError: true,
      };
    }

    const result = this.threadManager.updateStatus(this.panya.brain, threadId, status);

    if (!result.success) {
      return {
        content: [{ type: 'text', text: result.error || 'Failed to update thread' }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          threadId,
          newStatus: status,
        }, null, 2),
      }],
    };
  }

  // ==========================================================================
  // ChromaDB Handlers
  // ==========================================================================

  private async handleInitChroma(): Promise<MCPToolResult> {
    const success = await this.panya.brain.initChroma();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success,
          message: success
            ? 'ChromaDB initialized successfully. You can now use vector and hybrid search.'
            : 'ChromaDB initialization failed. Check if chroma-mcp is installed and Python is available.',
          chromaEnabled: this.panya.brain.isChromaEnabled(),
        }, null, 2),
      }],
    };
  }

  private async handleIndexToChroma(args: Record<string, any>): Promise<MCPToolResult> {
    const { batchSize = 100 } = args;

    if (!this.panya.brain.isChromaEnabled()) {
      return {
        content: [{ type: 'text', text: 'ChromaDB not initialized. Call panya_init_chroma first.' }],
        isError: true,
      };
    }

    const result = await this.panya.brain.indexAllToChroma(batchSize);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          indexed: result.indexed,
          failed: result.failed,
          message: `Indexed ${result.indexed} documents to ChromaDB (${result.failed} failed)`,
        }, null, 2),
      }],
    };
  }

  private async handleChromaStats(): Promise<MCPToolResult> {
    const stats = await this.panya.brain.getChromaStats();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          chromaEnabled: this.panya.brain.isChromaEnabled(),
          stats: stats || { count: 0, connected: false },
        }, null, 2),
      }],
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an MCP adapter for Panya
 */
export function createPanyaMCPAdapter(panya?: Panya): PanyaMCPAdapter {
  return new PanyaMCPAdapter(panya);
}

// Default export
export default PanyaMCPAdapter;
