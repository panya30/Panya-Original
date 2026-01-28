/**
 * Panya Brain Database
 *
 * Core database layer for Panya memory system.
 * Uses SQLite for storage, independent of any MCP or external service.
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { mkdir } from 'fs/promises';

// ============================================================================
// Types
// ============================================================================

export interface PanyaConfig {
  dbPath?: string;
  dataDir?: string;
  createIfMissing?: boolean;
}

export interface Document {
  id: string;
  type: string;
  sourceFile: string;
  content?: string;
  concepts: string[];
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

export type ObservationType = 'conversation' | 'file_change' | 'search' | 'feedback' | 'external';
export type ProcessingStage = 'raw' | 'extracting' | 'extracted' | 'synthesizing' | 'synthesized' | 'promoting' | 'completed' | 'failed';

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
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<PanyaConfig> = {
  dbPath: join(homedir(), '.panya', 'panya.db'),
  dataDir: join(homedir(), '.panya'),
  createIfMissing: true,
};

// ============================================================================
// Panya Database Class
// ============================================================================

export class PanyaDatabase {
  private db: Database;
  private config: Required<PanyaConfig>;

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

    // Create tables
    this.db.exec(`
      -- Documents table
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
        observation_type TEXT NOT NULL CHECK (observation_type IN ('conversation', 'file_change', 'search', 'feedback', 'external')),
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

  // ==========================================================================
  // Document Operations
  // ==========================================================================

  insertDocument(doc: Omit<Document, 'createdAt' | 'updatedAt'>): string {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO documents (id, type, source_file, content, concepts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      doc.id,
      doc.type,
      doc.sourceFile,
      doc.content || '',
      JSON.stringify(doc.concepts),
      now,
      now
    );

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

    return {
      ...result,
      concepts: JSON.parse(result.concepts || '[]'),
    };
  }

  // ==========================================================================
  // Search Operations
  // ==========================================================================

  /**
   * List all documents (for graph building)
   */
  listAllDocuments(limit: number = 500): Document[] {
    const results = this.db.query<any, []>(`
      SELECT * FROM documents
      ORDER BY created_at DESC
      LIMIT ${limit}
    `).all();

    return results.map(r => ({
      ...r,
      concepts: JSON.parse(r.concepts || '[]'),
    }));
  }

  searchFTS(query: string, limit: number = 10): Document[] {
    const keywords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 10);

    if (keywords.length === 0) return [];

    const searchQuery = keywords.map(k => `"${k}"`).join(' OR ');

    try {
      const results = this.db.query<any, []>(`
        SELECT d.* FROM documents d
        WHERE d.id IN (
          SELECT id FROM documents_fts
          WHERE documents_fts MATCH '${searchQuery}'
          LIMIT ${limit}
        )
      `).all();

      return results.map(r => ({
        ...r,
        concepts: JSON.parse(r.concepts || '[]'),
      }));
    } catch {
      return [];
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

    return results.map(r => ({
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
    }));
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
}
