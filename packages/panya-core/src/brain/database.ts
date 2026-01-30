/**
 * Panya Brain Database
 *
 * Core database layer for Panya memory system.
 * Uses SQLite for storage with optional ChromaDB for vector search.
 *
 * Search modes:
 * - FTS5: Fast keyword-based search
 * - Vector: Semantic similarity search via ChromaDB
 * - Hybrid: Combined FTS5 + Vector for best results
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir } from 'fs/promises';
import { ChromaMcpClient, type ChromaDocument, type ChromaQueryResult } from './chroma-client';

// ============================================================================
// Types
// ============================================================================

export interface PanyaConfig {
  dbPath?: string;
  dataDir?: string;
  createIfMissing?: boolean;
  // ChromaDB options for vector search
  enableChroma?: boolean;
  chromaCollectionName?: string;
  chromaDataDir?: string;
  chromaPythonVersion?: string;
}

export type SearchMode = 'fts' | 'vector' | 'hybrid';

export interface HybridSearchResult {
  id: string;
  document: Document;
  ftsScore?: number;
  vectorScore?: number;
  combinedScore: number;
}

// Panya document types (simple, not Oracle-style)
export type PanyaDocType = 'learning' | 'pattern' | 'note' | 'memory';
export type PanyaScope = 'common' | 'personal';

export interface Document {
  id: string;
  type: PanyaDocType;
  scope: PanyaScope;
  sourceFile: string;
  content?: string;
  tags: string[];  // renamed from concepts for clarity
  createdAt: number;
  updatedAt: number;
}

export interface Entity {
  id: string;
  name: string;
  type: 'person' | 'place' | 'concept' | 'event' | 'time' | 'organization';
  normalizedName?: string;
  mentionCount: number;
  firstSeen: number;
  lastSeen: number;
}

export interface Relationship {
  id: number;
  sourceId: string;
  targetId: string;
  type: 'updates' | 'extends' | 'derives' | 'relates_to';
  confidence: number;
  createdAt: number;
}

export interface TemporalData {
  documentId: string;
  documentDate?: number;
  recordedDate: number;
  lastAccessed?: number;
  accessCount: number;
  relevanceScore: number;
}

// ============================================================================
// Ontology Types (Self-Learning System)
// ============================================================================

export type KnowledgeLevel = 1 | 2 | 3 | 4; // L1 Raw → L2 Extracted → L3 Synthesized → L4 Core

export interface EntityType {
  id: string;
  name: string;
  parentTypeId?: string;
  validationSchema?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RelationshipType {
  id: string;
  name: string;
  sourceTypeId?: string;
  targetTypeId?: string;
  inverseId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeLevelData {
  documentId: string;
  level: KnowledgeLevel;
  confidence: number;
  usageCount: number;
  promotedFromId?: string;
  lastPromotedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PromotionRule {
  id: number;
  fromLevel: KnowledgeLevel;
  toLevel: KnowledgeLevel;
  ruleType: 'confidence' | 'usage' | 'entity_count' | 'validation' | 'age';
  thresholdValue: number;
  description?: string;
  enabled: boolean;
  createdAt: number;
}

export interface DecayRule {
  id: number;
  level: KnowledgeLevel;
  decayFunction: 'exponential' | 'linear' | 'none';
  halfLifeDays: number;
  minValue: number;
  enabled: boolean;
  createdAt: number;
}

export type PatternType = 'co-occurrence' | 'temporal' | 'semantic' | 'contradiction' | 'evolution';
export type PatternStatus = 'detected' | 'validated' | 'rejected' | 'applied';

export interface DetectedPattern {
  id: number;
  patternType: PatternType;
  confidence: number;
  documentIds: string[];
  description?: string;
  metadata?: Record<string, any>;
  status: PatternStatus;
  validatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type ConflictResolution = 'pending' | 'merged' | 'superseded' | 'coexist' | 'rejected';

export interface KnowledgeConflict {
  id: number;
  documentAId: string;
  documentBId: string;
  conflictType: string;
  description?: string;
  resolution: ConflictResolution;
  resolvedDocumentId?: string;
  resolvedAt?: number;
  createdAt: number;
}

export type SynthesisType = 'merge' | 'distill' | 'summarize' | 'abstract';

export interface SynthesisHistory {
  id: number;
  resultDocumentId: string;
  sourceDocumentIds: string[];
  synthesisType: SynthesisType;
  metadata?: Record<string, any>;
  createdAt: number;
}

export interface IdentityFacet {
  id: string;
  name: string;
  facetType: 'personality' | 'voice' | 'values' | 'relationship';
  content: string;
  locked: boolean;
  version: number;
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RelationshipMemory {
  id: number;
  memoryType: 'moment' | 'pattern' | 'preference' | 'milestone' | 'inside_joke';
  content: string;
  importance: number;
  entityIds?: string[];
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export type ObservationType = 'conversation' | 'file_change' | 'search' | 'feedback' | 'external' | 'github_repo';
export type ProcessingStage = 'raw' | 'extracting' | 'extracted' | 'synthesizing' | 'synthesized' | 'promoting' | 'completed' | 'failed';

// ============================================================================
// Consultant Types (Oracle Features)
// ============================================================================

export type DecisionStatus = 'pending' | 'parked' | 'researching' | 'decided' | 'implemented' | 'closed';

export interface Decision {
  id: string;
  title: string;
  context?: string;
  project?: string;
  status: DecisionStatus;
  options: DecisionOption[];
  decision?: string;
  rationale?: string;
  decidedBy?: string;
  decidedAt?: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface DecisionOption {
  label: string;
  description?: string;
  pros: string[];
  cons: string[];
  recommended?: boolean;
}

export type TraceStatus = 'raw' | 'reviewed' | 'distilling' | 'distilled';
export type TraceQueryType = 'general' | 'project' | 'pattern' | 'evolution';

export interface Trace {
  id: string;
  query: string;
  queryType: TraceQueryType;
  project?: string;
  status: TraceStatus;
  depth: number;
  parentTraceId?: string;
  foundFiles: FoundFile[];
  foundCommits: FoundCommit[];
  foundIssues: FoundIssue[];
  foundLearnings: string[];
  agentCount?: number;
  durationMs?: number;
  createdAt: number;
}

export interface FoundFile {
  path: string;
  type: 'learning' | 'retro' | 'resonance' | 'other';
  confidence: 'high' | 'medium' | 'low';
  matchReason?: string;
}

export interface FoundCommit {
  hash: string;
  shortHash: string;
  message: string;
  date?: string;
}

export interface FoundIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  url?: string;
}

export type ThreadStatus = 'active' | 'pending' | 'answered' | 'closed';

export interface Thread {
  id: number;
  title: string;
  status: ThreadStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadMessage {
  id: number;
  threadId: number;
  role: 'human' | 'assistant';
  content: string;
  createdAt: number;
}

export interface Observation {
  id: number;
  observationType: ObservationType;
  content: string;
  sourceId?: string;
  metadata?: Record<string, any>;
  processed: boolean;
  processingStage: ProcessingStage;
  processedAt?: number;
  resultDocumentIds?: string[];
  createdAt: number;
  // Auto-discovery fields
  autoDiscover: boolean;
  discoverIntervalMs: number; // default 1 hour
  lastDiscoveredAt?: number;
  discoverCursor?: string; // e.g., last commit SHA, last item date
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<PanyaConfig> = {
  dbPath: join(homedir(), '.panya', 'panya.db'),
  dataDir: join(homedir(), '.panya'),
  createIfMissing: true,
  enableChroma: false,
  chromaCollectionName: 'panya-brain',
  chromaDataDir: join(homedir(), '.panya', 'chroma'),
  chromaPythonVersion: '3.12',
};

// ============================================================================
// Panya Database Class
// ============================================================================

export class PanyaDatabase {
  private db: Database;
  private config: Required<PanyaConfig>;
  private chroma: ChromaMcpClient | null = null;
  private chromaInitialized: boolean = false;

  constructor(config?: PanyaConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = new Database(this.config.dbPath);
  }

  /**
   * Initialize database with all required tables
   */
  async initialize(): Promise<void> {
    // Ensure data directory exists
    await mkdir(this.config.dataDir, { recursive: true });

    // Create tables (backwards compatible - may already exist with old schema)
    this.db.exec(`
      -- Documents table (base schema without constraints that might conflict)
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_file TEXT NOT NULL,
        content TEXT,
        concepts TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        indexed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(type);
      CREATE INDEX IF NOT EXISTS idx_docs_source ON documents(source_file);

      -- FTS5 for full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        id,
        content,
        tokenize='porter unicode61'
      );

      -- Entities table
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        normalized_name TEXT,
        aliases TEXT,
        metadata TEXT,
        first_seen INTEGER,
        last_seen INTEGER,
        mention_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_normalized ON entities(normalized_name);

      -- Entity mentions
      CREATE TABLE IF NOT EXISTS entity_mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        context TEXT,
        position INTEGER,
        confidence REAL DEFAULT 1.0,
        extracted_by TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id),
        FOREIGN KEY (entity_id) REFERENCES entities(id)
      );
      CREATE INDEX IF NOT EXISTS idx_mentions_doc ON entity_mentions(document_id);
      CREATE INDEX IF NOT EXISTS idx_mentions_entity ON entity_mentions(entity_id);

      -- Document relationships
      CREATE TABLE IF NOT EXISTS document_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        metadata TEXT,
        detected_by TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES documents(id),
        FOREIGN KEY (target_id) REFERENCES documents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_rel_source ON document_relationships(source_id);
      CREATE INDEX IF NOT EXISTS idx_rel_target ON document_relationships(target_id);
      CREATE INDEX IF NOT EXISTS idx_rel_type ON document_relationships(type);

      -- Entity relationships
      CREATE TABLE IF NOT EXISTS entity_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_entity_id TEXT NOT NULL,
        target_entity_id TEXT NOT NULL,
        type TEXT NOT NULL,
        strength REAL DEFAULT 1.0,
        metadata TEXT,
        first_seen INTEGER,
        last_seen INTEGER,
        occurrence_count INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (source_entity_id) REFERENCES entities(id),
        FOREIGN KEY (target_entity_id) REFERENCES entities(id)
      );
      CREATE INDEX IF NOT EXISTS idx_entity_rel_source ON entity_relationships(source_entity_id);
      CREATE INDEX IF NOT EXISTS idx_entity_rel_target ON entity_relationships(target_entity_id);

      -- Temporal data
      CREATE TABLE IF NOT EXISTS temporal_data (
        document_id TEXT PRIMARY KEY,
        document_date INTEGER,
        document_date_precision TEXT,
        recorded_date INTEGER NOT NULL,
        last_accessed INTEGER,
        access_count INTEGER DEFAULT 0,
        relevance_score REAL DEFAULT 1.0,
        importance REAL DEFAULT 1.0,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_temporal_relevance ON temporal_data(relevance_score);

      -- Memory layers
      CREATE TABLE IF NOT EXISTS memory_layers (
        document_id TEXT PRIMARY KEY,
        layer TEXT DEFAULT 'cold' NOT NULL,
        promoted_at INTEGER,
        demoted_at INTEGER,
        session_id TEXT,
        decay_rate REAL DEFAULT 1.0,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_memory_layer ON memory_layers(layer);

      -- Skills registry
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        path TEXT,
        version TEXT,
        author TEXT,
        tags TEXT,
        exportable INTEGER DEFAULT 1,
        usage_count INTEGER DEFAULT 0,
        last_used INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_skills_type ON skills(type);

      -- Conversation insights
      CREATE TABLE IF NOT EXISTS conversation_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        source_session_id TEXT,
        source_message_range TEXT,
        entities TEXT,
        promoted_to_document_id TEXT,
        promoted_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_insights_type ON conversation_insights(type);

      -- Migrations tracking
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      );
    `);

    // Record migration
    const now = Date.now();
    this.db.exec(`
      INSERT OR IGNORE INTO migrations (name, applied_at)
      VALUES ('001-panya-core-init', ${now})
    `);

    // Run ontology migration
    await this.runOntologyMigration();

    // Run oracle features migration (decisions, traces, threads)
    await this.runOracleMigration();
  }

  /**
   * Run ontology migration (002-ontology)
   * Adds tables for self-learning system
   */
  private async runOntologyMigration(): Promise<void> {
    const now = Date.now();

    // Check if already migrated
    const existing = this.db.query<{ name: string }, [string]>(
      'SELECT name FROM migrations WHERE name = ?'
    ).get('002-ontology');

    if (existing) return;

    this.db.exec(`
      -- ================================================================
      -- ONTOLOGY LAYER: Entity & Relationship Type Definitions
      -- ================================================================

      CREATE TABLE IF NOT EXISTS entity_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        parent_type_id TEXT,
        validation_schema TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (parent_type_id) REFERENCES entity_types(id)
      );
      CREATE INDEX IF NOT EXISTS idx_entity_types_parent ON entity_types(parent_type_id);

      CREATE TABLE IF NOT EXISTS relationship_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        source_type_id TEXT,
        target_type_id TEXT,
        inverse_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (source_type_id) REFERENCES entity_types(id),
        FOREIGN KEY (target_type_id) REFERENCES entity_types(id),
        FOREIGN KEY (inverse_id) REFERENCES relationship_types(id)
      );

      -- ================================================================
      -- KNOWLEDGE LAYER: 4-Level Hierarchy (L1→L2→L3→L4)
      -- ================================================================

      CREATE TABLE IF NOT EXISTS knowledge_levels (
        document_id TEXT PRIMARY KEY,
        level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4),
        confidence REAL NOT NULL DEFAULT 0.5,
        usage_count INTEGER NOT NULL DEFAULT 0,
        promoted_from_id TEXT,
        last_promoted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id),
        FOREIGN KEY (promoted_from_id) REFERENCES documents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_level ON knowledge_levels(level);
      CREATE INDEX IF NOT EXISTS idx_knowledge_confidence ON knowledge_levels(confidence);

      CREATE TABLE IF NOT EXISTS promotion_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_level INTEGER NOT NULL CHECK (from_level BETWEEN 1 AND 3),
        to_level INTEGER NOT NULL CHECK (to_level BETWEEN 2 AND 4),
        rule_type TEXT NOT NULL CHECK (rule_type IN ('confidence', 'usage', 'entity_count', 'validation', 'age')),
        threshold_value REAL NOT NULL,
        description TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        CHECK (to_level = from_level + 1)
      );

      CREATE TABLE IF NOT EXISTS decay_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level INTEGER NOT NULL UNIQUE CHECK (level BETWEEN 1 AND 4),
        decay_function TEXT NOT NULL CHECK (decay_function IN ('exponential', 'linear', 'none')),
        half_life_days INTEGER NOT NULL,
        min_value REAL NOT NULL DEFAULT 0.1,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      -- ================================================================
      -- LEARNING LAYER: Pattern Detection & Synthesis
      -- ================================================================

      CREATE TABLE IF NOT EXISTS detected_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL CHECK (pattern_type IN ('co-occurrence', 'temporal', 'semantic', 'contradiction', 'evolution')),
        confidence REAL NOT NULL DEFAULT 0.5,
        document_ids TEXT NOT NULL DEFAULT '[]',
        description TEXT,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'validated', 'rejected', 'applied')),
        validated_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_patterns_type ON detected_patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_patterns_status ON detected_patterns(status);

      CREATE TABLE IF NOT EXISTS knowledge_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_a_id TEXT NOT NULL,
        document_b_id TEXT NOT NULL,
        conflict_type TEXT NOT NULL,
        description TEXT,
        resolution TEXT NOT NULL DEFAULT 'pending' CHECK (resolution IN ('pending', 'merged', 'superseded', 'coexist', 'rejected')),
        resolved_document_id TEXT,
        resolved_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (document_a_id) REFERENCES documents(id),
        FOREIGN KEY (document_b_id) REFERENCES documents(id),
        FOREIGN KEY (resolved_document_id) REFERENCES documents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_conflicts_resolution ON knowledge_conflicts(resolution);

      CREATE TABLE IF NOT EXISTS synthesis_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        result_document_id TEXT NOT NULL,
        source_document_ids TEXT NOT NULL DEFAULT '[]',
        synthesis_type TEXT NOT NULL CHECK (synthesis_type IN ('merge', 'distill', 'summarize', 'abstract')),
        metadata TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (result_document_id) REFERENCES documents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_synthesis_result ON synthesis_history(result_document_id);

      -- ================================================================
      -- IDENTITY LAYER: Robin's Protected Facets
      -- ================================================================

      CREATE TABLE IF NOT EXISTS identity_facets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        facet_type TEXT NOT NULL CHECK (facet_type IN ('personality', 'voice', 'values', 'relationship')),
        content TEXT NOT NULL,
        locked INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_facets_type ON identity_facets(facet_type);
      CREATE INDEX IF NOT EXISTS idx_facets_locked ON identity_facets(locked);

      CREATE TABLE IF NOT EXISTS identity_facet_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        facet_id TEXT NOT NULL,
        previous_content TEXT NOT NULL,
        new_content TEXT NOT NULL,
        version INTEGER NOT NULL,
        changed_by TEXT,
        change_reason TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (facet_id) REFERENCES identity_facets(id)
      );

      CREATE TABLE IF NOT EXISTS relationship_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_type TEXT NOT NULL CHECK (memory_type IN ('moment', 'pattern', 'preference', 'milestone', 'inside_joke')),
        content TEXT NOT NULL,
        importance REAL NOT NULL DEFAULT 0.5,
        entity_ids TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rel_mem_type ON relationship_memories(memory_type);
      CREATE INDEX IF NOT EXISTS idx_rel_mem_importance ON relationship_memories(importance);

      -- ================================================================
      -- OBSERVATION LAYER: Learning Loop Input
      -- ================================================================

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        observation_type TEXT NOT NULL CHECK (observation_type IN ('conversation', 'file_change', 'search', 'feedback', 'external', 'github_repo')),
        content TEXT NOT NULL,
        source_id TEXT,
        metadata TEXT,
        processed INTEGER NOT NULL DEFAULT 0,
        processing_stage TEXT NOT NULL DEFAULT 'raw' CHECK (processing_stage IN ('raw', 'extracting', 'extracted', 'synthesizing', 'synthesized', 'promoting', 'completed', 'failed')),
        processed_at INTEGER,
        result_document_ids TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_obs_type ON observations(observation_type);
      CREATE INDEX IF NOT EXISTS idx_obs_processed ON observations(processed);
      CREATE INDEX IF NOT EXISTS idx_obs_stage ON observations(processing_stage);

      -- ================================================================
      -- EXTEND EXISTING TABLES
      -- ================================================================

      -- Add knowledge_level to documents (for quick access)
      -- Note: Main level data is in knowledge_levels table
    `);

    // Add columns to existing tables if not exist
    try {
      this.db.exec(`ALTER TABLE documents ADD COLUMN knowledge_level INTEGER DEFAULT 1`);
    } catch { /* Column may already exist */ }

    try {
      this.db.exec(`ALTER TABLE documents ADD COLUMN superseded_by TEXT`);
    } catch { /* Column may already exist */ }

    try {
      this.db.exec(`ALTER TABLE documents ADD COLUMN synthesized_from TEXT`);
    } catch { /* Column may already exist */ }

    try {
      this.db.exec(`ALTER TABLE temporal_data ADD COLUMN decay_immunity_until INTEGER`);
    } catch { /* Column may already exist */ }

    // Add scope column (003-scope migration)
    try {
      this.db.exec(`ALTER TABLE documents ADD COLUMN scope TEXT NOT NULL DEFAULT 'common' CHECK (scope IN ('common', 'personal'))`);
    } catch { /* Column may already exist */ }

    // Rename concepts to tags (if old column exists, migrate it)
    try {
      // Check if 'tags' column exists
      const hasTagsCol = this.db.query<any, []>(`PRAGMA table_info(documents)`).all().some((c: any) => c.name === 'tags');
      if (!hasTagsCol) {
        // First try to add tags column
        try {
          this.db.exec(`ALTER TABLE documents ADD COLUMN tags TEXT DEFAULT '[]'`);
        } catch { /* Column may already exist */ }
        // Then copy from concepts if exists
        try {
          this.db.exec(`UPDATE documents SET tags = concepts WHERE concepts IS NOT NULL AND tags = '[]'`);
        } catch { /* concepts column may not exist */ }
      }
    } catch { /* Already migrated */ }

    // Add auto-discovery columns to observations (004-autodiscover migration)
    try {
      this.db.exec(`ALTER TABLE observations ADD COLUMN auto_discover INTEGER NOT NULL DEFAULT 0`);
    } catch { /* Column may already exist */ }
    try {
      this.db.exec(`ALTER TABLE observations ADD COLUMN discover_interval_ms INTEGER NOT NULL DEFAULT 3600000`);
    } catch { /* Column may already exist */ }
    try {
      this.db.exec(`ALTER TABLE observations ADD COLUMN last_discovered_at INTEGER`);
    } catch { /* Column may already exist */ }
    try {
      this.db.exec(`ALTER TABLE observations ADD COLUMN discover_cursor TEXT`);
    } catch { /* Column may already exist */ }

    // Insert default promotion rules
    this.db.exec(`
      INSERT OR IGNORE INTO promotion_rules (from_level, to_level, rule_type, threshold_value, description, enabled, created_at) VALUES
        (1, 2, 'confidence', 0.6, 'Promote L1→L2 when entities extracted and confidence > 0.6', 1, ${now}),
        (1, 2, 'entity_count', 1, 'Promote L1→L2 when at least 1 entity extracted', 1, ${now}),
        (2, 3, 'confidence', 0.7, 'Promote L2→L3 when merged with other L2 docs and confidence > 0.7', 1, ${now}),
        (2, 3, 'usage', 5, 'Promote L2→L3 when accessed 5+ times', 1, ${now}),
        (3, 4, 'confidence', 0.9, 'Promote L3→L4 (Core) when confidence > 0.9', 1, ${now}),
        (3, 4, 'usage', 10, 'Promote L3→L4 (Core) when accessed 10+ times', 1, ${now}),
        (3, 4, 'validation', 1, 'Promote L3→L4 (Core) when explicitly validated', 1, ${now})
    `);

    // Insert default decay rules
    this.db.exec(`
      INSERT OR IGNORE INTO decay_rules (level, decay_function, half_life_days, min_value, enabled, created_at) VALUES
        (1, 'exponential', 7, 0.1, 1, ${now}),
        (2, 'exponential', 30, 0.2, 1, ${now}),
        (3, 'linear', 90, 0.3, 1, ${now}),
        (4, 'none', 0, 1.0, 1, ${now})
    `);

    // Insert default entity types
    this.db.exec(`
      INSERT OR IGNORE INTO entity_types (id, name, parent_type_id, created_at, updated_at) VALUES
        ('person', 'Person', NULL, ${now}, ${now}),
        ('place', 'Place', NULL, ${now}, ${now}),
        ('concept', 'Concept', NULL, ${now}, ${now}),
        ('event', 'Event', NULL, ${now}, ${now}),
        ('time', 'Time', NULL, ${now}, ${now}),
        ('organization', 'Organization', NULL, ${now}, ${now}),
        ('project', 'Project', 'concept', ${now}, ${now}),
        ('tool', 'Tool', 'concept', ${now}, ${now}),
        ('skill', 'Skill', 'concept', ${now}, ${now})
    `);

    // Insert default relationship types
    this.db.exec(`
      INSERT OR IGNORE INTO relationship_types (id, name, source_type_id, target_type_id, inverse_id, created_at, updated_at) VALUES
        ('updates', 'updates', NULL, NULL, 'updated_by', ${now}, ${now}),
        ('updated_by', 'updated by', NULL, NULL, 'updates', ${now}, ${now}),
        ('extends', 'extends', NULL, NULL, 'extended_by', ${now}, ${now}),
        ('extended_by', 'extended by', NULL, NULL, 'extends', ${now}, ${now}),
        ('derives', 'derives from', NULL, NULL, 'derived_to', ${now}, ${now}),
        ('derived_to', 'derived to', NULL, NULL, 'derives', ${now}, ${now}),
        ('relates_to', 'relates to', NULL, NULL, 'relates_to', ${now}, ${now}),
        ('supersedes', 'supersedes', NULL, NULL, 'superseded_by', ${now}, ${now}),
        ('superseded_by', 'superseded by', NULL, NULL, 'supersedes', ${now}, ${now}),
        ('contradicts', 'contradicts', NULL, NULL, 'contradicts', ${now}, ${now}),
        ('synthesized_from', 'synthesized from', NULL, NULL, 'synthesized_to', ${now}, ${now}),
        ('synthesized_to', 'synthesized to', NULL, NULL, 'synthesized_from', ${now}, ${now})
    `);

    // Record migration
    this.db.exec(`
      INSERT INTO migrations (name, applied_at) VALUES ('002-ontology', ${now})
    `);
  }

  /**
   * Run Oracle features migration (003-oracle)
   * Adds tables for consultation, decisions, traces, threads
   */
  private async runOracleMigration(): Promise<void> {
    const now = Date.now();

    // Check if already migrated
    const existing = this.db.query<{ name: string }, [string]>(
      'SELECT name FROM migrations WHERE name = ?'
    ).get('003-oracle');

    if (existing) return;

    this.db.exec(`
      -- ================================================================
      -- DECISIONS: Track decisions with options and rationale
      -- ================================================================

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        context TEXT,
        project TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parked', 'researching', 'decided', 'implemented', 'closed')),
        options TEXT DEFAULT '[]',
        decision TEXT,
        rationale TEXT,
        decided_by TEXT,
        decided_at INTEGER,
        tags TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
      CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project);

      -- ================================================================
      -- TRACES: Log discovery sessions with dig points
      -- ================================================================

      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        query_type TEXT NOT NULL DEFAULT 'general' CHECK (query_type IN ('general', 'project', 'pattern', 'evolution')),
        project TEXT,
        status TEXT NOT NULL DEFAULT 'raw' CHECK (status IN ('raw', 'reviewed', 'distilling', 'distilled')),
        depth INTEGER NOT NULL DEFAULT 0,
        parent_trace_id TEXT,
        found_files TEXT DEFAULT '[]',
        found_commits TEXT DEFAULT '[]',
        found_issues TEXT DEFAULT '[]',
        found_learnings TEXT DEFAULT '[]',
        agent_count INTEGER,
        duration_ms INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (parent_trace_id) REFERENCES traces(id)
      );
      CREATE INDEX IF NOT EXISTS idx_traces_query ON traces(query);
      CREATE INDEX IF NOT EXISTS idx_traces_project ON traces(project);
      CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);

      -- ================================================================
      -- THREADS: Multi-turn discussions
      -- ================================================================

      CREATE TABLE IF NOT EXISTS threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'answered', 'closed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);

      CREATE TABLE IF NOT EXISTS thread_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('human', 'assistant')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (thread_id) REFERENCES threads(id)
      );
      CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON thread_messages(thread_id);
    `);

    // Add is_principle column to documents if not exists
    try {
      this.db.exec(`ALTER TABLE documents ADD COLUMN is_principle INTEGER DEFAULT 0`);
    } catch { /* Column may already exist */ }

    try {
      this.db.exec(`ALTER TABLE documents ADD COLUMN principle_type TEXT`);
    } catch { /* Column may already exist */ }

    // Record migration
    this.db.exec(`
      INSERT INTO migrations (name, applied_at) VALUES ('003-oracle', ${now})
    `);
  }

  // ==========================================================================
  // Document Operations
  // ==========================================================================

  insertDocument(doc: Omit<Document, 'createdAt' | 'updatedAt'>): string {
    const now = Date.now();

    // Check if new schema columns exist
    const columns = this.db.query<any, []>(`PRAGMA table_info(documents)`).all();
    const hasScope = columns.some((c: any) => c.name === 'scope');
    const hasTags = columns.some((c: any) => c.name === 'tags');

    if (hasScope && hasTags) {
      // New schema
      const stmt = this.db.prepare(`
        INSERT INTO documents (id, type, scope, source_file, content, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        doc.id,
        doc.type,
        doc.scope || 'common',
        doc.sourceFile,
        doc.content || '',
        JSON.stringify(doc.tags || []),
        now,
        now
      );
    } else {
      // Old schema - use concepts column
      const stmt = this.db.prepare(`
        INSERT INTO documents (id, type, source_file, content, concepts, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        doc.id,
        doc.type,
        doc.sourceFile,
        doc.content || '',
        JSON.stringify(doc.tags || []),
        now,
        now
      );
    }

    // Index in FTS
    if (doc.content) {
      this.db.exec(`
        INSERT INTO documents_fts (id, content) VALUES ('${doc.id}', '${doc.content.replace(/'/g, "''")}')
      `);
    }

    return doc.id;
  }

  getDocument(id: string): Document | null {
    const result = this.db.query<any, [string]>(`
      SELECT * FROM documents WHERE id = ?
    `).get(id);

    if (!result) return null;

    // Handle both old (concepts) and new (tags) schemas
    const tags = result.tags
      ? JSON.parse(result.tags)
      : result.concepts
        ? JSON.parse(result.concepts)
        : [];

    return {
      id: result.id,
      type: result.type as PanyaDocType,
      scope: (result.scope || 'common') as PanyaScope,
      sourceFile: result.source_file,
      content: result.content,
      tags,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  // ==========================================================================
  // Search Operations
  // ==========================================================================

  /**
   * List all documents (for graph building)
   */
  listAllDocuments(limit: number = 500, scope?: PanyaScope): Document[] {
    // Check if scope column exists
    const columns = this.db.query<any, []>(`PRAGMA table_info(documents)`).all();
    const hasScope = columns.some((c: any) => c.name === 'scope');

    // When scope column doesn't exist, all docs are treated as 'common'
    // So 'personal' filter should return empty
    if (scope === 'personal' && !hasScope) {
      return [];
    }

    let query = `SELECT * FROM documents`;
    if (scope && hasScope) query += ` WHERE scope = '${scope}'`;
    query += ` ORDER BY created_at DESC LIMIT ${limit}`;

    const results = this.db.query<any, []>(query).all();

    return results.map(r => {
      // Handle both old (concepts) and new (tags) schemas
      const tags = r.tags
        ? JSON.parse(r.tags)
        : r.concepts
          ? JSON.parse(r.concepts)
          : [];

      return {
        id: r.id,
        type: r.type as PanyaDocType,
        scope: (r.scope || 'common') as PanyaScope,
        sourceFile: r.source_file,
        content: r.content,
        tags,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
  }

  searchFTS(query: string, limit: number = 10, scope?: PanyaScope): Document[] {
    const keywords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 10);

    if (keywords.length === 0) return [];

    const searchQuery = keywords.map(k => `"${k}"`).join(' OR ');

    // Check if scope column exists
    const columns = this.db.query<any, []>(`PRAGMA table_info(documents)`).all();
    const hasScope = columns.some((c: any) => c.name === 'scope');
    const scopeFilter = (scope && hasScope) ? ` AND d.scope = '${scope}'` : '';

    try {
      const results = this.db.query<any, []>(`
        SELECT d.* FROM documents d
        WHERE d.id IN (
          SELECT id FROM documents_fts
          WHERE documents_fts MATCH '${searchQuery}'
          LIMIT ${limit}
        )${scopeFilter}
      `).all();

      return results.map(r => {
        // Handle both old (concepts) and new (tags) schemas
        const tags = r.tags
          ? JSON.parse(r.tags)
          : r.concepts
            ? JSON.parse(r.concepts)
            : [];

        return {
          id: r.id,
          type: r.type as PanyaDocType,
          scope: (r.scope || 'common') as PanyaScope,
          sourceFile: r.source_file,
          content: r.content,
          tags,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      });
    } catch {
      return [];
    }
  }

  // ==========================================================================
  // ChromaDB / Vector Search Operations
  // ==========================================================================

  /**
   * Initialize ChromaDB connection
   */
  async initChroma(): Promise<boolean> {
    if (!this.config.enableChroma) {
      console.log('[panya-db] ChromaDB disabled in config');
      return false;
    }

    if (this.chromaInitialized && this.chroma) {
      return true;
    }

    try {
      this.chroma = new ChromaMcpClient({
        collectionName: this.config.chromaCollectionName,
        dataDir: this.config.chromaDataDir,
        pythonVersion: this.config.chromaPythonVersion,
      });

      await this.chroma.connect();
      await this.chroma.ensureCollection();
      this.chromaInitialized = true;
      console.log('[panya-db] ChromaDB initialized');
      return true;
    } catch (error) {
      console.error('[panya-db] ChromaDB init failed:', error);
      this.chroma = null;
      this.chromaInitialized = false;
      return false;
    }
  }

  /**
   * Check if ChromaDB is available
   */
  isChromaEnabled(): boolean {
    return this.chromaInitialized && this.chroma !== null;
  }

  /**
   * Get ChromaDB stats
   */
  async getChromaStats(): Promise<{ count: number; connected: boolean } | null> {
    if (!this.chroma) {
      return null;
    }
    return this.chroma.getStats();
  }

  /**
   * Search using vector similarity (ChromaDB)
   */
  async searchVector(query: string, limit: number = 10): Promise<Document[]> {
    if (!this.chroma) {
      console.warn('[panya-db] ChromaDB not initialized, falling back to FTS');
      return this.searchFTS(query, limit);
    }

    try {
      const results = await this.chroma.query(query, limit);

      // Convert ChromaDB results to Documents
      const documents: Document[] = [];
      for (const id of results.ids) {
        const doc = this.getDocument(id);
        if (doc) {
          documents.push(doc);
        }
      }

      return documents;
    } catch (error) {
      console.error('[panya-db] Vector search failed:', error);
      return this.searchFTS(query, limit);
    }
  }

  /**
   * Hybrid search combining FTS and Vector
   * Returns results ranked by combined score
   */
  async hybridSearch(
    query: string,
    limit: number = 10,
    ftsWeight: number = 0.4,
    vectorWeight: number = 0.6
  ): Promise<HybridSearchResult[]> {
    // Get FTS results
    const ftsResults = this.searchFTS(query, limit * 2);

    // Get Vector results if available
    let vectorResults: Document[] = [];
    let vectorDistances: Map<string, number> = new Map();

    if (this.chroma) {
      try {
        const chromaResults = await this.chroma.query(query, limit * 2);
        for (let i = 0; i < chromaResults.ids.length; i++) {
          const id = chromaResults.ids[i];
          const distance = chromaResults.distances[i];
          vectorDistances.set(id, distance);

          const doc = this.getDocument(id);
          if (doc) {
            vectorResults.push(doc);
          }
        }
      } catch (error) {
        console.error('[panya-db] Vector search in hybrid failed:', error);
      }
    }

    // Combine and score results
    const scoreMap = new Map<string, HybridSearchResult>();

    // Score FTS results (position-based: first = highest score)
    ftsResults.forEach((doc, index) => {
      const ftsScore = 1 - (index / ftsResults.length);
      scoreMap.set(doc.id, {
        id: doc.id,
        document: doc,
        ftsScore,
        vectorScore: undefined,
        combinedScore: ftsScore * ftsWeight,
      });
    });

    // Score Vector results (distance-based: lower distance = higher score)
    vectorResults.forEach((doc) => {
      const distance = vectorDistances.get(doc.id) || 1;
      // Convert distance to score (0-1 range, lower distance = higher score)
      const vectorScore = Math.max(0, 1 - distance);

      if (scoreMap.has(doc.id)) {
        const existing = scoreMap.get(doc.id)!;
        existing.vectorScore = vectorScore;
        existing.combinedScore = (existing.ftsScore || 0) * ftsWeight + vectorScore * vectorWeight;
      } else {
        scoreMap.set(doc.id, {
          id: doc.id,
          document: doc,
          ftsScore: undefined,
          vectorScore,
          combinedScore: vectorScore * vectorWeight,
        });
      }
    });

    // Sort by combined score and return top results
    const results = Array.from(scoreMap.values())
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit);

    return results;
  }

  /**
   * Index a single document to ChromaDB
   */
  async indexDocumentToChroma(doc: Document): Promise<boolean> {
    if (!this.chroma) {
      return false;
    }

    try {
      await this.chroma.addDocument({
        id: doc.id,
        document: `${doc.content || ''} ${doc.tags.join(' ')}`.trim(),
        metadata: {
          type: doc.type,
          scope: doc.scope,
          sourceFile: doc.sourceFile,
          createdAt: doc.createdAt,
        },
      });
      return true;
    } catch (error) {
      console.error('[panya-db] Failed to index document to ChromaDB:', error);
      return false;
    }
  }

  /**
   * Index all documents to ChromaDB
   */
  async indexAllToChroma(batchSize: number = 100): Promise<{ indexed: number; failed: number }> {
    if (!this.chroma) {
      return { indexed: 0, failed: 0 };
    }

    const allDocs = this.listAllDocuments(10000);
    let indexed = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < allDocs.length; i += batchSize) {
      const batch = allDocs.slice(i, i + batchSize);
      const chromaDocs: ChromaDocument[] = batch.map((doc: Document) => ({
        id: doc.id,
        document: `${doc.content || ''} ${doc.tags.join(' ')}`.trim(),
        metadata: {
          type: doc.type,
          scope: doc.scope,
          sourceFile: doc.sourceFile,
          createdAt: doc.createdAt,
        },
      }));

      try {
        await this.chroma.addDocuments(chromaDocs);
        indexed += batch.length;
      } catch (error) {
        console.error(`[panya-db] Batch ${Math.floor(i / batchSize) + 1} failed:`, error);
        failed += batch.length;
      }
    }

    console.log(`[panya-db] Indexed ${indexed} documents to ChromaDB (${failed} failed)`);
    return { indexed, failed };
  }

  /**
   * Close ChromaDB connection
   */
  async closeChroma(): Promise<void> {
    if (this.chroma) {
      await this.chroma.close();
      this.chroma = null;
      this.chromaInitialized = false;
    }
  }

  // ==========================================================================
  // Entity Operations
  // ==========================================================================

  upsertEntity(entity: Omit<Entity, 'mentionCount' | 'firstSeen' | 'lastSeen'>): string {
    const now = Date.now();
    this.db.exec(`
      INSERT INTO entities (id, name, type, normalized_name, first_seen, last_seen, mention_count, created_at, updated_at)
      VALUES ('${entity.id}', '${entity.name.replace(/'/g, "''")}', '${entity.type}', '${entity.normalizedName || ''}', ${now}, ${now}, 1, ${now}, ${now})
      ON CONFLICT(id) DO UPDATE SET
        last_seen = ${now},
        mention_count = mention_count + 1,
        updated_at = ${now}
    `);
    return entity.id;
  }

  getEntity(id: string): Entity | null {
    return this.db.query<Entity, [string]>(`
      SELECT * FROM entities WHERE id = ?
    `).get(id) || null;
  }

  // ==========================================================================
  // Relationship Operations
  // ==========================================================================

  addRelationship(rel: Omit<Relationship, 'id' | 'createdAt'>): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO document_relationships (source_id, target_id, type, confidence, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(rel.sourceId, rel.targetId, rel.type, rel.confidence, now);
    return Number(result.lastInsertRowid);
  }

  getRelationships(documentId: string): Relationship[] {
    return this.db.query<Relationship, [string, string]>(`
      SELECT * FROM document_relationships
      WHERE source_id = ? OR target_id = ?
    `).all(documentId, documentId);
  }

  // ==========================================================================
  // Insight Operations
  // ==========================================================================

  saveInsight(insight: {
    type: string;
    content: string;
    confidence: number;
    sessionId?: string;
    entities?: string[];
  }): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO conversation_insights (type, content, confidence, source_session_id, entities, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      insight.type,
      insight.content,
      insight.confidence,
      insight.sessionId || null,
      JSON.stringify(insight.entities || []),
      now
    );
    return Number(result.lastInsertRowid);
  }

  getRecentInsights(limit: number = 10): any[] {
    return this.db.query<any, [number]>(`
      SELECT * FROM conversation_insights
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  close(): void {
    this.db.close();
  }

  getStats(): { documents: number; entities: number; relationships: number; insights: number } {
    const docs = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM documents').get();
    const entities = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM entities').get();
    const rels = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM document_relationships').get();
    const insights = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM conversation_insights').get();

    return {
      documents: docs?.count || 0,
      entities: entities?.count || 0,
      relationships: rels?.count || 0,
      insights: insights?.count || 0,
    };
  }

  // ==========================================================================
  // Ontology: Entity Type Operations
  // ==========================================================================

  defineEntityType(type: Omit<EntityType, 'createdAt' | 'updatedAt'>): string {
    const now = Date.now();
    this.db.exec(`
      INSERT INTO entity_types (id, name, parent_type_id, validation_schema, created_at, updated_at)
      VALUES ('${type.id}', '${type.name.replace(/'/g, "''")}', ${type.parentTypeId ? `'${type.parentTypeId}'` : 'NULL'}, ${type.validationSchema ? `'${type.validationSchema}'` : 'NULL'}, ${now}, ${now})
      ON CONFLICT(id) DO UPDATE SET
        name = '${type.name.replace(/'/g, "''")}',
        parent_type_id = ${type.parentTypeId ? `'${type.parentTypeId}'` : 'NULL'},
        validation_schema = ${type.validationSchema ? `'${type.validationSchema}'` : 'NULL'},
        updated_at = ${now}
    `);
    return type.id;
  }

  getEntityTypes(): EntityType[] {
    const results = this.db.query<any, []>(`SELECT * FROM entity_types ORDER BY name`).all();
    return results.map(r => ({
      id: r.id,
      name: r.name,
      parentTypeId: r.parent_type_id,
      validationSchema: r.validation_schema,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  // ==========================================================================
  // Ontology: Relationship Type Operations
  // ==========================================================================

  defineRelationshipType(type: Omit<RelationshipType, 'createdAt' | 'updatedAt'>): string {
    const now = Date.now();
    this.db.exec(`
      INSERT INTO relationship_types (id, name, source_type_id, target_type_id, inverse_id, created_at, updated_at)
      VALUES ('${type.id}', '${type.name.replace(/'/g, "''")}', ${type.sourceTypeId ? `'${type.sourceTypeId}'` : 'NULL'}, ${type.targetTypeId ? `'${type.targetTypeId}'` : 'NULL'}, ${type.inverseId ? `'${type.inverseId}'` : 'NULL'}, ${now}, ${now})
      ON CONFLICT(id) DO UPDATE SET
        name = '${type.name.replace(/'/g, "''")}',
        source_type_id = ${type.sourceTypeId ? `'${type.sourceTypeId}'` : 'NULL'},
        target_type_id = ${type.targetTypeId ? `'${type.targetTypeId}'` : 'NULL'},
        inverse_id = ${type.inverseId ? `'${type.inverseId}'` : 'NULL'},
        updated_at = ${now}
    `);
    return type.id;
  }

  getRelationshipTypes(): RelationshipType[] {
    const results = this.db.query<any, []>(`SELECT * FROM relationship_types ORDER BY name`).all();
    return results.map(r => ({
      id: r.id,
      name: r.name,
      sourceTypeId: r.source_type_id,
      targetTypeId: r.target_type_id,
      inverseId: r.inverse_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  // ==========================================================================
  // Knowledge Level Operations
  // ==========================================================================

  getKnowledgeLevel(documentId: string): KnowledgeLevelData | null {
    const result = this.db.query<any, [string]>(`
      SELECT * FROM knowledge_levels WHERE document_id = ?
    `).get(documentId);

    if (!result) return null;

    return {
      documentId: result.document_id,
      level: result.level as KnowledgeLevel,
      confidence: result.confidence,
      usageCount: result.usage_count,
      promotedFromId: result.promoted_from_id,
      lastPromotedAt: result.last_promoted_at,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  setKnowledgeLevel(data: Omit<KnowledgeLevelData, 'createdAt' | 'updatedAt'>): void {
    const now = Date.now();
    this.db.exec(`
      INSERT INTO knowledge_levels (document_id, level, confidence, usage_count, promoted_from_id, last_promoted_at, created_at, updated_at)
      VALUES ('${data.documentId}', ${data.level}, ${data.confidence}, ${data.usageCount}, ${data.promotedFromId ? `'${data.promotedFromId}'` : 'NULL'}, ${data.lastPromotedAt || 'NULL'}, ${now}, ${now})
      ON CONFLICT(document_id) DO UPDATE SET
        level = ${data.level},
        confidence = ${data.confidence},
        usage_count = ${data.usageCount},
        promoted_from_id = ${data.promotedFromId ? `'${data.promotedFromId}'` : 'NULL'},
        last_promoted_at = ${data.lastPromotedAt || 'NULL'},
        updated_at = ${now}
    `);

    // Also update the documents table for quick access
    this.db.exec(`UPDATE documents SET knowledge_level = ${data.level} WHERE id = '${data.documentId}'`);
  }

  incrementUsageCount(documentId: string): void {
    const now = Date.now();
    this.db.exec(`
      UPDATE knowledge_levels SET usage_count = usage_count + 1, updated_at = ${now}
      WHERE document_id = '${documentId}'
    `);
    this.db.exec(`
      UPDATE temporal_data SET access_count = access_count + 1, last_accessed = ${now}
      WHERE document_id = '${documentId}'
    `);
  }

  getDocumentsByLevel(level: KnowledgeLevel, limit: number = 100): string[] {
    const results = this.db.query<{ document_id: string }, [number, number]>(`
      SELECT document_id FROM knowledge_levels WHERE level = ? ORDER BY confidence DESC LIMIT ?
    `).all(level, limit);
    return results.map(r => r.document_id);
  }

  // ==========================================================================
  // Promotion & Decay Rules
  // ==========================================================================

  getPromotionRules(fromLevel?: KnowledgeLevel): PromotionRule[] {
    let query = 'SELECT * FROM promotion_rules WHERE enabled = 1';
    if (fromLevel) query += ` AND from_level = ${fromLevel}`;
    query += ' ORDER BY from_level, to_level';

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      fromLevel: r.from_level as KnowledgeLevel,
      toLevel: r.to_level as KnowledgeLevel,
      ruleType: r.rule_type,
      thresholdValue: r.threshold_value,
      description: r.description,
      enabled: !!r.enabled,
      createdAt: r.created_at,
    }));
  }

  getDecayRules(): DecayRule[] {
    const results = this.db.query<any, []>(`
      SELECT * FROM decay_rules WHERE enabled = 1 ORDER BY level
    `).all();
    return results.map(r => ({
      id: r.id,
      level: r.level as KnowledgeLevel,
      decayFunction: r.decay_function,
      halfLifeDays: r.half_life_days,
      minValue: r.min_value,
      enabled: !!r.enabled,
      createdAt: r.created_at,
    }));
  }

  // ==========================================================================
  // Pattern Operations
  // ==========================================================================

  savePattern(pattern: Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO detected_patterns (pattern_type, confidence, document_ids, description, metadata, status, validated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      pattern.patternType,
      pattern.confidence,
      JSON.stringify(pattern.documentIds),
      pattern.description || null,
      pattern.metadata ? JSON.stringify(pattern.metadata) : null,
      pattern.status,
      pattern.validatedAt || null,
      now,
      now
    );
    return Number(result.lastInsertRowid);
  }

  getPatterns(status?: PatternStatus, limit: number = 50): DetectedPattern[] {
    let query = 'SELECT * FROM detected_patterns';
    if (status) query += ` WHERE status = '${status}'`;
    query += ' ORDER BY created_at DESC LIMIT ' + limit;

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      patternType: r.pattern_type as PatternType,
      confidence: r.confidence,
      documentIds: JSON.parse(r.document_ids || '[]'),
      description: r.description,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
      status: r.status as PatternStatus,
      validatedAt: r.validated_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  updatePatternStatus(patternId: number, status: PatternStatus): void {
    const now = Date.now();
    this.db.exec(`
      UPDATE detected_patterns SET status = '${status}', ${status === 'validated' ? `validated_at = ${now},` : ''} updated_at = ${now}
      WHERE id = ${patternId}
    `);
  }

  // ==========================================================================
  // Conflict Operations
  // ==========================================================================

  saveConflict(conflict: Omit<KnowledgeConflict, 'id' | 'createdAt'>): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO knowledge_conflicts (document_a_id, document_b_id, conflict_type, description, resolution, resolved_document_id, resolved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      conflict.documentAId,
      conflict.documentBId,
      conflict.conflictType,
      conflict.description || null,
      conflict.resolution,
      conflict.resolvedDocumentId || null,
      conflict.resolvedAt || null,
      now
    );
    return Number(result.lastInsertRowid);
  }

  getConflicts(resolution?: ConflictResolution, limit: number = 50): KnowledgeConflict[] {
    let query = 'SELECT * FROM knowledge_conflicts';
    if (resolution) query += ` WHERE resolution = '${resolution}'`;
    query += ' ORDER BY created_at DESC LIMIT ' + limit;

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      documentAId: r.document_a_id,
      documentBId: r.document_b_id,
      conflictType: r.conflict_type,
      description: r.description,
      resolution: r.resolution as ConflictResolution,
      resolvedDocumentId: r.resolved_document_id,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
    }));
  }

  resolveConflict(conflictId: number, resolution: ConflictResolution, resolvedDocumentId?: string): void {
    const now = Date.now();
    this.db.exec(`
      UPDATE knowledge_conflicts SET
        resolution = '${resolution}',
        resolved_document_id = ${resolvedDocumentId ? `'${resolvedDocumentId}'` : 'NULL'},
        resolved_at = ${now}
      WHERE id = ${conflictId}
    `);
  }

  // ==========================================================================
  // Synthesis Operations
  // ==========================================================================

  saveSynthesis(synthesis: Omit<SynthesisHistory, 'id' | 'createdAt'>): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO synthesis_history (result_document_id, source_document_ids, synthesis_type, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      synthesis.resultDocumentId,
      JSON.stringify(synthesis.sourceDocumentIds),
      synthesis.synthesisType,
      synthesis.metadata ? JSON.stringify(synthesis.metadata) : null,
      now
    );
    return Number(result.lastInsertRowid);
  }

  getSynthesisHistory(documentId?: string, limit: number = 50): SynthesisHistory[] {
    let query = 'SELECT * FROM synthesis_history';
    if (documentId) query += ` WHERE result_document_id = '${documentId}'`;
    query += ' ORDER BY created_at DESC LIMIT ' + limit;

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      resultDocumentId: r.result_document_id,
      sourceDocumentIds: JSON.parse(r.source_document_ids || '[]'),
      synthesisType: r.synthesis_type as SynthesisType,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
      createdAt: r.created_at,
    }));
  }

  // ==========================================================================
  // Identity Facet Operations
  // ==========================================================================

  saveFacet(facet: Omit<IdentityFacet, 'version' | 'createdAt' | 'updatedAt'>): string {
    const now = Date.now();

    // Check if exists and get current version
    const existing = this.db.query<{ version: number; locked: number }, [string]>(
      'SELECT version, locked FROM identity_facets WHERE id = ?'
    ).get(facet.id);

    if (existing) {
      // If locked, throw error
      if (existing.locked && !facet.locked) {
        throw new Error(`Identity facet '${facet.id}' is locked and cannot be modified`);
      }

      const newVersion = existing.version + 1;

      // Save history
      const currentContent = this.db.query<{ content: string }, [string]>(
        'SELECT content FROM identity_facets WHERE id = ?'
      ).get(facet.id);

      if (currentContent) {
        this.db.exec(`
          INSERT INTO identity_facet_history (facet_id, previous_content, new_content, version, changed_by, created_at)
          VALUES ('${facet.id}', '${currentContent.content.replace(/'/g, "''")}', '${facet.content.replace(/'/g, "''")}', ${newVersion}, ${facet.updatedBy ? `'${facet.updatedBy}'` : 'NULL'}, ${now})
        `);
      }

      // Update facet
      this.db.exec(`
        UPDATE identity_facets SET
          name = '${facet.name.replace(/'/g, "''")}',
          facet_type = '${facet.facetType}',
          content = '${facet.content.replace(/'/g, "''")}',
          locked = ${facet.locked ? 1 : 0},
          version = ${newVersion},
          updated_by = ${facet.updatedBy ? `'${facet.updatedBy}'` : 'NULL'},
          updated_at = ${now}
        WHERE id = '${facet.id}'
      `);
    } else {
      // Insert new facet
      this.db.exec(`
        INSERT INTO identity_facets (id, name, facet_type, content, locked, version, updated_by, created_at, updated_at)
        VALUES ('${facet.id}', '${facet.name.replace(/'/g, "''")}', '${facet.facetType}', '${facet.content.replace(/'/g, "''")}', ${facet.locked ? 1 : 0}, 1, ${facet.updatedBy ? `'${facet.updatedBy}'` : 'NULL'}, ${now}, ${now})
      `);
    }

    return facet.id;
  }

  getFacet(id: string): IdentityFacet | null {
    const result = this.db.query<any, [string]>(`
      SELECT * FROM identity_facets WHERE id = ?
    `).get(id);

    if (!result) return null;

    return {
      id: result.id,
      name: result.name,
      facetType: result.facet_type,
      content: result.content,
      locked: !!result.locked,
      version: result.version,
      updatedBy: result.updated_by,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  getFacets(facetType?: string): IdentityFacet[] {
    let query = 'SELECT * FROM identity_facets';
    if (facetType) query += ` WHERE facet_type = '${facetType}'`;
    query += ' ORDER BY name';

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      name: r.name,
      facetType: r.facet_type,
      content: r.content,
      locked: !!r.locked,
      version: r.version,
      updatedBy: r.updated_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  lockFacet(id: string): void {
    const now = Date.now();
    this.db.exec(`UPDATE identity_facets SET locked = 1, updated_at = ${now} WHERE id = '${id}'`);
  }

  unlockFacet(id: string): void {
    const now = Date.now();
    this.db.exec(`UPDATE identity_facets SET locked = 0, updated_at = ${now} WHERE id = '${id}'`);
  }

  // ==========================================================================
  // Relationship Memory Operations
  // ==========================================================================

  saveRelationshipMemory(memory: Omit<RelationshipMemory, 'id' | 'createdAt' | 'updatedAt'>): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO relationship_memories (memory_type, content, importance, entity_ids, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      memory.memoryType,
      memory.content,
      memory.importance,
      memory.entityIds ? JSON.stringify(memory.entityIds) : null,
      memory.metadata ? JSON.stringify(memory.metadata) : null,
      now,
      now
    );
    return Number(result.lastInsertRowid);
  }

  getRelationshipMemories(memoryType?: string, limit: number = 50): RelationshipMemory[] {
    let query = 'SELECT * FROM relationship_memories';
    if (memoryType) query += ` WHERE memory_type = '${memoryType}'`;
    query += ' ORDER BY importance DESC, created_at DESC LIMIT ' + limit;

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      memoryType: r.memory_type,
      content: r.content,
      importance: r.importance,
      entityIds: r.entity_ids ? JSON.parse(r.entity_ids) : undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  // ==========================================================================
  // Observation Operations
  // ==========================================================================

  saveObservation(obs: Omit<Observation, 'id' | 'createdAt'>): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO observations (observation_type, content, source_id, metadata, processed, processing_stage, processed_at, result_document_ids, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      obs.observationType,
      obs.content,
      obs.sourceId || null,
      obs.metadata ? JSON.stringify(obs.metadata) : null,
      obs.processed ? 1 : 0,
      obs.processingStage,
      obs.processedAt || null,
      obs.resultDocumentIds ? JSON.stringify(obs.resultDocumentIds) : null,
      now
    );
    return Number(result.lastInsertRowid);
  }

  getUnprocessedObservations(limit: number = 50): Observation[] {
    const results = this.db.query<any, [number]>(`
      SELECT * FROM observations WHERE processed = 0 ORDER BY created_at ASC LIMIT ?
    `).all(limit);

    return results.map(r => this.mapObservationRow(r));
  }

  /**
   * Get all observations with optional filters
   */
  getObservations(options: {
    limit?: number;
    processed?: boolean;
    type?: ObservationType;
  } = {}): Observation[] {
    const { limit = 100, processed, type } = options;

    let query = 'SELECT * FROM observations WHERE 1=1';
    if (processed !== undefined) {
      query += ` AND processed = ${processed ? 1 : 0}`;
    }
    if (type) {
      query += ` AND observation_type = '${type}'`;
    }
    query += ` ORDER BY created_at DESC LIMIT ${limit}`;

    const results = this.db.query<any, []>(query).all();

    return results.map(r => this.mapObservationRow(r));
  }

  private mapObservationRow(r: any): Observation {
    return {
      id: r.id,
      observationType: r.observation_type as ObservationType,
      content: r.content,
      sourceId: r.source_id,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
      processed: !!r.processed,
      processingStage: r.processing_stage as ProcessingStage,
      processedAt: r.processed_at,
      resultDocumentIds: r.result_document_ids ? JSON.parse(r.result_document_ids) : undefined,
      createdAt: r.created_at,
      autoDiscover: !!r.auto_discover,
      discoverIntervalMs: r.discover_interval_ms || 3600000,
      lastDiscoveredAt: r.last_discovered_at,
      discoverCursor: r.discover_cursor,
    };
  }

  /**
   * Toggle auto-discovery for an observation
   */
  setAutoDiscover(id: number, enabled: boolean, intervalMs?: number): void {
    const interval = intervalMs || 3600000; // default 1 hour
    this.db.exec(`
      UPDATE observations SET
        auto_discover = ${enabled ? 1 : 0},
        discover_interval_ms = ${interval}
      WHERE id = ${id}
    `);
  }

  /**
   * Get observations that are due for discovery
   */
  getObservationsDueForDiscovery(): Observation[] {
    const now = Date.now();
    const results = this.db.query<any, []>(`
      SELECT * FROM observations
      WHERE auto_discover = 1
        AND (last_discovered_at IS NULL OR (? - last_discovered_at) > discover_interval_ms)
      ORDER BY last_discovered_at ASC NULLS FIRST
    `.replace('?', String(now))).all();

    return results.map(r => this.mapObservationRow(r));
  }

  /**
   * Update discovery state after processing
   */
  updateDiscoveryState(id: number, cursor?: string): void {
    const now = Date.now();
    if (cursor) {
      this.db.exec(`
        UPDATE observations SET
          last_discovered_at = ${now},
          discover_cursor = '${cursor}'
        WHERE id = ${id}
      `);
    } else {
      this.db.exec(`
        UPDATE observations SET
          last_discovered_at = ${now}
        WHERE id = ${id}
      `);
    }
  }

  /**
   * Get a single observation by ID
   */
  getObservation(id: number): Observation | null {
    const result = this.db.query<any, [number]>(`SELECT * FROM observations WHERE id = ?`).get(id);
    return result ? this.mapObservationRow(result) : null;
  }

  updateObservationStage(id: number, stage: ProcessingStage, resultDocumentIds?: string[]): void {
    const now = Date.now();
    const processed = stage === 'completed' || stage === 'failed' ? 1 : 0;
    this.db.exec(`
      UPDATE observations SET
        processing_stage = '${stage}',
        processed = ${processed},
        ${processed ? `processed_at = ${now},` : ''}
        ${resultDocumentIds ? `result_document_ids = '${JSON.stringify(resultDocumentIds)}',` : ''}
        processed_at = ${processed ? now : 'processed_at'}
      WHERE id = ${id}
    `);
  }

  // ==========================================================================
  // Extended Stats
  // ==========================================================================

  getOntologyStats(): {
    entityTypes: number;
    relationshipTypes: number;
    knowledgeLevels: { L1: number; L2: number; L3: number; L4: number };
    patterns: { detected: number; validated: number; applied: number };
    conflicts: { pending: number; resolved: number };
    observations: { unprocessed: number; total: number };
    facets: { total: number; locked: number };
  } {
    const entityTypes = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM entity_types').get();
    const relTypes = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM relationship_types').get();

    const L1 = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM knowledge_levels WHERE level = 1').get();
    const L2 = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM knowledge_levels WHERE level = 2').get();
    const L3 = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM knowledge_levels WHERE level = 3').get();
    const L4 = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM knowledge_levels WHERE level = 4').get();

    const pDetected = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM detected_patterns WHERE status = "detected"').get();
    const pValidated = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM detected_patterns WHERE status = "validated"').get();
    const pApplied = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM detected_patterns WHERE status = "applied"').get();

    const cPending = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM knowledge_conflicts WHERE resolution = "pending"').get();
    const cResolved = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM knowledge_conflicts WHERE resolution != "pending"').get();

    const obsUnprocessed = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM observations WHERE processed = 0').get();
    const obsTotal = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM observations').get();

    const facetsTotal = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM identity_facets').get();
    const facetsLocked = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM identity_facets WHERE locked = 1').get();

    return {
      entityTypes: entityTypes?.count || 0,
      relationshipTypes: relTypes?.count || 0,
      knowledgeLevels: {
        L1: L1?.count || 0,
        L2: L2?.count || 0,
        L3: L3?.count || 0,
        L4: L4?.count || 0,
      },
      patterns: {
        detected: pDetected?.count || 0,
        validated: pValidated?.count || 0,
        applied: pApplied?.count || 0,
      },
      conflicts: {
        pending: cPending?.count || 0,
        resolved: cResolved?.count || 0,
      },
      observations: {
        unprocessed: obsUnprocessed?.count || 0,
        total: obsTotal?.count || 0,
      },
      facets: {
        total: facetsTotal?.count || 0,
        locked: facetsLocked?.count || 0,
      },
    };
  }

  /**
   * Mark a document as superseded by another (version, don't delete)
   */
  supersede(oldDocId: string, newDocId: string): void {
    const now = Date.now();
    this.db.exec(`UPDATE documents SET superseded_by = '${newDocId}', updated_at = ${now} WHERE id = '${oldDocId}'`);

    // Also create a relationship
    this.addRelationship({
      sourceId: newDocId,
      targetId: oldDocId,
      type: 'supersedes' as any,
      confidence: 1.0,
    });
  }

  // ==========================================================================
  // Export/Import: For Creating New Robin Instances
  // ==========================================================================

  /**
   * Export common knowledge for creating a new Robin
   * Returns only 'common' scope documents that can be shared
   */
  exportCommonKnowledge(): {
    version: string;
    exportedAt: number;
    documents: Document[];
    entities: Entity[];
    patterns: DetectedPattern[];
    entityTypes: EntityType[];
    relationshipTypes: RelationshipType[];
  } {
    const documents = this.listAllDocuments(1000, 'common');

    const entities = this.db.query<any, []>(`
      SELECT * FROM entities
    `).all().map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      normalizedName: r.normalized_name,
      mentionCount: r.mention_count,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    }));

    const patterns = this.getPatterns('validated', 100);
    const entityTypes = this.getEntityTypes();
    const relationshipTypes = this.getRelationshipTypes();

    return {
      version: '1.0',
      exportedAt: Date.now(),
      documents,
      entities,
      patterns,
      entityTypes,
      relationshipTypes,
    };
  }

  /**
   * Import common knowledge from another Robin
   * Used when creating a new Robin instance
   */
  importCommonKnowledge(data: ReturnType<typeof this.exportCommonKnowledge>): {
    imported: { documents: number; entities: number; patterns: number };
    skipped: { documents: number; entities: number; patterns: number };
  } {
    const result = {
      imported: { documents: 0, entities: 0, patterns: 0 },
      skipped: { documents: 0, entities: 0, patterns: 0 },
    };

    // Import documents
    for (const doc of data.documents) {
      try {
        // Check if already exists
        const existing = this.getDocument(doc.id);
        if (existing) {
          result.skipped.documents++;
          continue;
        }

        this.insertDocument({
          id: doc.id,
          type: doc.type,
          scope: 'common', // Force common scope
          sourceFile: doc.sourceFile,
          content: doc.content,
          tags: doc.tags,
        });
        result.imported.documents++;
      } catch {
        result.skipped.documents++;
      }
    }

    // Import entities
    for (const entity of data.entities) {
      try {
        const existing = this.getEntity(entity.id);
        if (existing) {
          result.skipped.entities++;
          continue;
        }

        this.upsertEntity({
          id: entity.id,
          name: entity.name,
          type: entity.type as Entity['type'],
          normalizedName: entity.normalizedName,
        });
        result.imported.entities++;
      } catch {
        result.skipped.entities++;
      }
    }

    // Import patterns
    for (const pattern of data.patterns) {
      try {
        this.savePattern({
          patternType: pattern.patternType,
          confidence: pattern.confidence,
          documentIds: pattern.documentIds,
          description: pattern.description,
          metadata: pattern.metadata,
          status: 'validated', // Import as validated
        });
        result.imported.patterns++;
      } catch {
        result.skipped.patterns++;
      }
    }

    return result;
  }

  /**
   * Get count of documents by scope
   */
  getDocumentCountByScope(): { common: number; personal: number } {
    // Check if scope column exists
    const columns = this.db.query<any, []>(`PRAGMA table_info(documents)`).all();
    const hasScope = columns.some((c: any) => c.name === 'scope');

    if (!hasScope) {
      // Old schema - all documents treated as common
      const total = this.db.query<{ count: number }, []>(
        `SELECT COUNT(*) as count FROM documents`
      ).get();
      return {
        common: total?.count || 0,
        personal: 0,
      };
    }

    const common = this.db.query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM documents WHERE scope = 'common'`
    ).get();
    const personal = this.db.query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM documents WHERE scope = 'personal'`
    ).get();

    return {
      common: common?.count || 0,
      personal: personal?.count || 0,
    };
  }

  // ==========================================================================
  // Decision Operations
  // ==========================================================================

  createDecision(decision: Omit<Decision, 'createdAt' | 'updatedAt'>): string {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO decisions (id, title, context, project, status, options, decision, rationale, decided_by, decided_at, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      decision.id,
      decision.title,
      decision.context || null,
      decision.project || null,
      decision.status,
      JSON.stringify(decision.options || []),
      decision.decision || null,
      decision.rationale || null,
      decision.decidedBy || null,
      decision.decidedAt || null,
      JSON.stringify(decision.tags || []),
      now,
      now
    );
    return decision.id;
  }

  getDecision(id: string): Decision | null {
    const result = this.db.query<any, [string]>(`
      SELECT * FROM decisions WHERE id = ?
    `).get(id);

    if (!result) return null;

    return {
      id: result.id,
      title: result.title,
      context: result.context,
      project: result.project,
      status: result.status as DecisionStatus,
      options: JSON.parse(result.options || '[]'),
      decision: result.decision,
      rationale: result.rationale,
      decidedBy: result.decided_by,
      decidedAt: result.decided_at,
      tags: JSON.parse(result.tags || '[]'),
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  listDecisions(filters?: {
    status?: DecisionStatus;
    project?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Decision[] {
    let query = 'SELECT * FROM decisions WHERE 1=1';
    if (filters?.status) query += ` AND status = '${filters.status}'`;
    if (filters?.project) query += ` AND project = '${filters.project}'`;
    query += ' ORDER BY created_at DESC';
    if (filters?.limit) query += ` LIMIT ${filters.limit}`;
    if (filters?.offset) query += ` OFFSET ${filters.offset}`;

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      title: r.title,
      context: r.context,
      project: r.project,
      status: r.status as DecisionStatus,
      options: JSON.parse(r.options || '[]'),
      decision: r.decision,
      rationale: r.rationale,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at,
      tags: JSON.parse(r.tags || '[]'),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  updateDecision(id: string, update: Partial<Omit<Decision, 'id' | 'createdAt' | 'updatedAt'>>): void {
    const now = Date.now();
    const sets: string[] = [`updated_at = ${now}`];

    if (update.title !== undefined) sets.push(`title = '${update.title.replace(/'/g, "''")}'`);
    if (update.context !== undefined) sets.push(`context = ${update.context ? `'${update.context.replace(/'/g, "''")}'` : 'NULL'}`);
    if (update.project !== undefined) sets.push(`project = ${update.project ? `'${update.project}'` : 'NULL'}`);
    if (update.status !== undefined) sets.push(`status = '${update.status}'`);
    if (update.options !== undefined) sets.push(`options = '${JSON.stringify(update.options)}'`);
    if (update.decision !== undefined) sets.push(`decision = ${update.decision ? `'${update.decision.replace(/'/g, "''")}'` : 'NULL'}`);
    if (update.rationale !== undefined) sets.push(`rationale = ${update.rationale ? `'${update.rationale.replace(/'/g, "''")}'` : 'NULL'}`);
    if (update.decidedBy !== undefined) sets.push(`decided_by = ${update.decidedBy ? `'${update.decidedBy}'` : 'NULL'}`);
    if (update.decidedAt !== undefined) sets.push(`decided_at = ${update.decidedAt || 'NULL'}`);
    if (update.tags !== undefined) sets.push(`tags = '${JSON.stringify(update.tags)}'`);

    this.db.exec(`UPDATE decisions SET ${sets.join(', ')} WHERE id = '${id}'`);
  }

  // ==========================================================================
  // Trace Operations
  // ==========================================================================

  createTrace(trace: Omit<Trace, 'createdAt'>): string {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO traces (id, query, query_type, project, status, depth, parent_trace_id, found_files, found_commits, found_issues, found_learnings, agent_count, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      trace.id,
      trace.query,
      trace.queryType,
      trace.project || null,
      trace.status,
      trace.depth,
      trace.parentTraceId || null,
      JSON.stringify(trace.foundFiles || []),
      JSON.stringify(trace.foundCommits || []),
      JSON.stringify(trace.foundIssues || []),
      JSON.stringify(trace.foundLearnings || []),
      trace.agentCount || null,
      trace.durationMs || null,
      now
    );
    return trace.id;
  }

  getTrace(id: string): Trace | null {
    const result = this.db.query<any, [string]>(`
      SELECT * FROM traces WHERE id = ?
    `).get(id);

    if (!result) return null;

    return {
      id: result.id,
      query: result.query,
      queryType: result.query_type as TraceQueryType,
      project: result.project,
      status: result.status as TraceStatus,
      depth: result.depth,
      parentTraceId: result.parent_trace_id,
      foundFiles: JSON.parse(result.found_files || '[]'),
      foundCommits: JSON.parse(result.found_commits || '[]'),
      foundIssues: JSON.parse(result.found_issues || '[]'),
      foundLearnings: JSON.parse(result.found_learnings || '[]'),
      agentCount: result.agent_count,
      durationMs: result.duration_ms,
      createdAt: result.created_at,
    };
  }

  listTraces(filters?: {
    status?: TraceStatus;
    project?: string;
    query?: string;
    depth?: number;
    limit?: number;
    offset?: number;
  }): Trace[] {
    let query = 'SELECT * FROM traces WHERE 1=1';
    if (filters?.status) query += ` AND status = '${filters.status}'`;
    if (filters?.project) query += ` AND project = '${filters.project}'`;
    if (filters?.query) query += ` AND query LIKE '%${filters.query}%'`;
    if (filters?.depth !== undefined) query += ` AND depth = ${filters.depth}`;
    query += ' ORDER BY created_at DESC';
    if (filters?.limit) query += ` LIMIT ${filters.limit}`;
    if (filters?.offset) query += ` OFFSET ${filters.offset}`;

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      query: r.query,
      queryType: r.query_type as TraceQueryType,
      project: r.project,
      status: r.status as TraceStatus,
      depth: r.depth,
      parentTraceId: r.parent_trace_id,
      foundFiles: JSON.parse(r.found_files || '[]'),
      foundCommits: JSON.parse(r.found_commits || '[]'),
      foundIssues: JSON.parse(r.found_issues || '[]'),
      foundLearnings: JSON.parse(r.found_learnings || '[]'),
      agentCount: r.agent_count,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
    }));
  }

  updateTraceStatus(id: string, status: TraceStatus): void {
    this.db.exec(`UPDATE traces SET status = '${status}' WHERE id = '${id}'`);
  }

  // ==========================================================================
  // Thread Operations
  // ==========================================================================

  createThread(title: string): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO threads (title, status, created_at, updated_at)
      VALUES (?, 'active', ?, ?)
    `);
    const result = stmt.run(title, now, now);
    return Number(result.lastInsertRowid);
  }

  getThread(id: number): Thread | null {
    const result = this.db.query<any, [number]>(`
      SELECT * FROM threads WHERE id = ?
    `).get(id);

    if (!result) return null;

    return {
      id: result.id,
      title: result.title,
      status: result.status as ThreadStatus,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  listThreads(filters?: {
    status?: ThreadStatus;
    limit?: number;
    offset?: number;
  }): Thread[] {
    let query = 'SELECT * FROM threads WHERE 1=1';
    if (filters?.status) query += ` AND status = '${filters.status}'`;
    query += ' ORDER BY updated_at DESC';
    if (filters?.limit) query += ` LIMIT ${filters.limit}`;
    if (filters?.offset) query += ` OFFSET ${filters.offset}`;

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      title: r.title,
      status: r.status as ThreadStatus,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  updateThreadStatus(id: number, status: ThreadStatus): void {
    const now = Date.now();
    this.db.exec(`UPDATE threads SET status = '${status}', updated_at = ${now} WHERE id = ${id}`);
  }

  addThreadMessage(threadId: number, role: 'human' | 'assistant', content: string): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO thread_messages (thread_id, role, content, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(threadId, role, content, now);

    // Update thread's updated_at
    this.db.exec(`UPDATE threads SET updated_at = ${now} WHERE id = ${threadId}`);

    return Number(result.lastInsertRowid);
  }

  getThreadMessages(threadId: number, limit?: number): ThreadMessage[] {
    let query = `SELECT * FROM thread_messages WHERE thread_id = ${threadId} ORDER BY created_at ASC`;
    if (limit) query += ` LIMIT ${limit}`;

    const results = this.db.query<any, []>(query).all();
    return results.map(r => ({
      id: r.id,
      threadId: r.thread_id,
      role: r.role as 'human' | 'assistant',
      content: r.content,
      createdAt: r.created_at,
    }));
  }

  // ==========================================================================
  // Principle Operations (L4 Core with is_principle flag)
  // ==========================================================================

  /**
   * Get all L4 Core documents marked as principles
   */
  getPrinciples(limit: number = 50): Document[] {
    const results = this.db.query<any, [number]>(`
      SELECT d.* FROM documents d
      JOIN knowledge_levels kl ON d.id = kl.document_id
      WHERE kl.level = 4 OR d.is_principle = 1
      ORDER BY kl.confidence DESC, d.created_at DESC
      LIMIT ?
    `).all(limit);

    return results.map(r => {
      const tags = r.tags
        ? JSON.parse(r.tags)
        : r.concepts
          ? JSON.parse(r.concepts)
          : [];

      return {
        id: r.id,
        type: r.type as PanyaDocType,
        scope: (r.scope || 'common') as PanyaScope,
        sourceFile: r.source_file,
        content: r.content,
        tags,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
  }

  /**
   * Get a random principle for reflection
   */
  getRandomPrinciple(): Document | null {
    const result = this.db.query<any, []>(`
      SELECT d.* FROM documents d
      JOIN knowledge_levels kl ON d.id = kl.document_id
      WHERE kl.level = 4 OR d.is_principle = 1
      ORDER BY RANDOM()
      LIMIT 1
    `).get();

    if (!result) return null;

    const tags = result.tags
      ? JSON.parse(result.tags)
      : result.concepts
        ? JSON.parse(result.concepts)
        : [];

    return {
      id: result.id,
      type: result.type as PanyaDocType,
      scope: (result.scope || 'common') as PanyaScope,
      sourceFile: result.source_file,
      content: result.content,
      tags,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  /**
   * Mark a document as a principle
   */
  markAsPrinciple(documentId: string, principleType?: string): void {
    const now = Date.now();
    this.db.exec(`
      UPDATE documents SET
        is_principle = 1,
        principle_type = ${principleType ? `'${principleType}'` : 'NULL'},
        updated_at = ${now}
      WHERE id = '${documentId}'
    `);
  }
}
