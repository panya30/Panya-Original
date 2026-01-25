# Phase 1: Core Memory Specification

> Brain Foundation + Skills Preparation

**Phase**: 1
**Timeline**: Week 1-2
**Status**: In Progress
**Last Updated**: 2026-01-25

---

## Goals

1. **Build memory foundation** - Entity extraction, relationships, temporal awareness
2. **Prepare for skills** - Compatible structure for Claude Skills integration
3. **Improve search** - Hybrid search with relationship context

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 1 ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INPUT                                                          │
│  ├── Files (ψ/memory/)                                          │
│  ├── Conversations (chat history)                               │
│  └── Manual entries (oracle_learn)                              │
│                                                                  │
│                      ▼                                           │
│                                                                  │
│  PROCESSING PIPELINE                                            │
│  ├── 1. File Watcher (detect changes)                           │
│  ├── 2. Content Parser (extract text)                           │
│  ├── 3. Entity Extractor (who, what, where, when)               │
│  ├── 4. Relationship Builder (updates, extends, derives)        │
│  ├── 5. Chunker (split into memories)                           │
│  ├── 6. Embedder (vector representation)                        │
│  └── 7. Indexer (FTS5 + ChromaDB + Relationships)               │
│                                                                  │
│                      ▼                                           │
│                                                                  │
│  STORAGE                                                        │
│  ├── SQLite (documents, entities, relationships, metadata)      │
│  ├── FTS5 (keyword search)                                      │
│  └── ChromaDB (vector search)                                   │
│                                                                  │
│                      ▼                                           │
│                                                                  │
│  RETRIEVAL                                                      │
│  ├── Hybrid Search (FTS + Vector + Graph)                       │
│  ├── Context Enrichment (related entities)                      │
│  └── Temporal Filtering (when relevant)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Current Tables (Oracle v2)
```sql
-- documents: stores markdown files
-- concepts: tags and categories
-- document_concepts: many-to-many
-- documents_fts: FTS5 virtual table
```

### New Tables (Phase 1)

```sql
-- Entity storage
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'person', 'place', 'concept', 'event', 'time'
  normalized_name TEXT,  -- lowercase, trimmed for matching
  metadata JSON,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_normalized ON entities(normalized_name);

-- Entity mentions in documents
CREATE TABLE entity_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  context TEXT,  -- surrounding text for context
  position INTEGER,  -- character position in document
  confidence REAL DEFAULT 1.0,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (entity_id) REFERENCES entities(id)
);

CREATE INDEX idx_mentions_doc ON entity_mentions(document_id);
CREATE INDEX idx_mentions_entity ON entity_mentions(entity_id);

-- Relationships between documents/memories
CREATE TABLE relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,  -- document or entity
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'updates', 'extends', 'derives', 'relates_to'
  confidence REAL DEFAULT 1.0,
  metadata JSON,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES documents(id),
  FOREIGN KEY (target_id) REFERENCES documents(id)
);

CREATE INDEX idx_rel_source ON relationships(source_id);
CREATE INDEX idx_rel_target ON relationships(target_id);
CREATE INDEX idx_rel_type ON relationships(type);

-- Temporal metadata
CREATE TABLE temporal_data (
  document_id TEXT PRIMARY KEY,
  document_date TEXT,  -- when the event/fact occurred
  recorded_date TEXT,  -- when we learned about it
  last_accessed TEXT,  -- when it was last retrieved
  access_count INTEGER DEFAULT 0,
  relevance_score REAL DEFAULT 1.0,  -- decays over time
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- Memory layers (hot/warm/cold)
CREATE TABLE memory_layers (
  document_id TEXT PRIMARY KEY,
  layer TEXT DEFAULT 'cold',  -- 'hot', 'warm', 'cold'
  promoted_at TEXT,
  demoted_at TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);
```

---

## Components

### 1. File Watcher Service

**Purpose**: Detect changes in ψ/memory/ and trigger indexing

**Implementation**:
```typescript
// src/services/file-watcher.ts

import { watch } from "fs";
import { debounce } from "./utils";

interface WatcherConfig {
  paths: string[];
  extensions: string[];
  debounceMs: number;
}

export class FileWatcher {
  private watchers: Map<string, ReturnType<typeof watch>> = new Map();

  constructor(
    private config: WatcherConfig,
    private onFileChange: (path: string, event: string) => Promise<void>
  ) {}

  start(): void {
    for (const path of this.config.paths) {
      const watcher = watch(path, { recursive: true },
        debounce(async (event, filename) => {
          if (this.shouldProcess(filename)) {
            await this.onFileChange(filename, event);
          }
        }, this.config.debounceMs)
      );
      this.watchers.set(path, watcher);
    }
  }

  private shouldProcess(filename: string): boolean {
    return this.config.extensions.some(ext => filename.endsWith(ext));
  }

  stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
```

**Config**:
```typescript
const config: WatcherConfig = {
  paths: [
    "ψ/memory/learnings",
    "ψ/memory/retrospectives",
    "ψ/memory/resonance",
    "ψ/memory/you",
    "ψ/memory/us"
  ],
  extensions: [".md", ".txt"],
  debounceMs: 1000  // Wait 1s after last change
};
```

---

### 2. Entity Extractor

**Purpose**: Extract entities (people, places, concepts, events, times) from text

**Implementation Options**:

**Option A: LLM-based (Accurate, Slower)**
```typescript
// Use Claude to extract entities
async function extractEntitiesLLM(text: string): Promise<Entity[]> {
  const response = await claude.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Extract entities from this text. Return JSON array.

Types: person, place, concept, event, time

Text:
${text}

Output format:
[{"name": "...", "type": "...", "context": "..."}]`
    }]
  });

  return JSON.parse(response.content[0].text);
}
```

**Option B: Rule-based (Fast, Less Accurate)**
```typescript
// Simple pattern matching
const patterns = {
  person: /(?:Modz|Robin|The Architect|The Alpha)/gi,
  time: /\d{4}-\d{2}-\d{2}|\b(?:today|yesterday|last week)\b/gi,
  concept: /\b(?:first principle|memory|skill|brain)\b/gi
};

function extractEntitiesRules(text: string): Entity[] {
  const entities: Entity[] = [];

  for (const [type, pattern] of Object.entries(patterns)) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      entities.push({
        name: match[0],
        type,
        position: match.index
      });
    }
  }

  return entities;
}
```

**Recommendation**: Hybrid approach
- Use rules for known entities (Modz, Robin, dates)
- Use LLM for unknown/complex entities (batch processing)

---

### 3. Relationship Builder

**Purpose**: Detect relationships between memories

**Relationship Types**:

| Type | Description | Detection Method |
|------|-------------|------------------|
| `updates` | New info contradicts old | Semantic similarity + contradiction detection |
| `extends` | New info adds to old | Semantic similarity + no contradiction |
| `derives` | Inference from combining | LLM inference |
| `relates_to` | Topically connected | Shared entities/concepts |

**Implementation**:
```typescript
interface Relationship {
  sourceId: string;
  targetId: string;
  type: 'updates' | 'extends' | 'derives' | 'relates_to';
  confidence: number;
  metadata?: Record<string, any>;
}

async function findRelationships(
  newDoc: Document,
  existingDocs: Document[]
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];

  // 1. Find similar documents (vector search)
  const similar = await vectorSearch(newDoc.embedding, { limit: 10 });

  // 2. For each similar doc, determine relationship type
  for (const doc of similar) {
    if (doc.similarity > 0.8) {
      // High similarity - check if updates or extends
      const relType = await detectRelationType(newDoc, doc);
      relationships.push({
        sourceId: newDoc.id,
        targetId: doc.id,
        type: relType,
        confidence: doc.similarity
      });
    } else if (doc.similarity > 0.5) {
      // Medium similarity - relates_to
      relationships.push({
        sourceId: newDoc.id,
        targetId: doc.id,
        type: 'relates_to',
        confidence: doc.similarity
      });
    }
  }

  // 3. Check for shared entities
  const sharedEntities = findSharedEntities(newDoc, existingDocs);
  for (const { doc, entities } of sharedEntities) {
    if (!relationships.find(r => r.targetId === doc.id)) {
      relationships.push({
        sourceId: newDoc.id,
        targetId: doc.id,
        type: 'relates_to',
        confidence: 0.6,
        metadata: { sharedEntities: entities }
      });
    }
  }

  return relationships;
}

async function detectRelationType(
  newDoc: Document,
  oldDoc: Document
): Promise<'updates' | 'extends'> {
  // Use LLM to detect contradiction
  const response = await claude.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 100,
    messages: [{
      role: "user",
      content: `Do these two texts contradict each other? Answer "yes" or "no".

Text 1 (older):
${oldDoc.content}

Text 2 (newer):
${newDoc.content}`
    }]
  });

  return response.content[0].text.toLowerCase().includes('yes')
    ? 'updates'
    : 'extends';
}
```

---

### 4. Temporal Awareness

**Purpose**: Track when things happened vs when we learned them

**Implementation**:
```typescript
interface TemporalData {
  documentId: string;
  documentDate?: Date;  // When the event occurred
  recordedDate: Date;   // When we recorded it
  lastAccessed?: Date;  // Last retrieval
  accessCount: number;
  relevanceScore: number;
}

// Extract document date from content
function extractDocumentDate(content: string): Date | null {
  // Try frontmatter
  const frontmatter = parseFrontmatter(content);
  if (frontmatter?.date) return new Date(frontmatter.date);

  // Try filename pattern (2026-01-25_title.md)
  const match = content.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return new Date(match[1]);

  // Try content patterns
  const datePatterns = [
    /(?:on|at|date:?)\s*(\d{4}-\d{2}-\d{2})/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})/
  ];

  for (const pattern of datePatterns) {
    const m = content.match(pattern);
    if (m) return new Date(m[1]);
  }

  return null;
}

// Decay function for relevance
function calculateRelevance(
  lastAccessed: Date,
  accessCount: number,
  importance: number = 1.0
): number {
  const daysSinceAccess = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

  // Exponential decay with access count boost
  const decay = Math.exp(-daysSinceAccess / 30);  // Half-life ~30 days
  const accessBoost = Math.log(accessCount + 1) / 10;

  return Math.min(1.0, decay * importance + accessBoost);
}
```

---

### 5. Enhanced Hybrid Search

**Purpose**: Search using keywords + vectors + relationships

**Implementation**:
```typescript
interface SearchOptions {
  query: string;
  limit?: number;
  includeRelated?: boolean;
  temporalFilter?: {
    after?: Date;
    before?: Date;
  };
  entityFilter?: string[];
  minRelevance?: number;
}

interface SearchResult {
  document: Document;
  score: number;
  matchType: 'keyword' | 'semantic' | 'related';
  relatedEntities?: Entity[];
  relationships?: Relationship[];
}

async function hybridSearch(options: SearchOptions): Promise<SearchResult[]> {
  const { query, limit = 10, includeRelated = true } = options;

  // 1. Keyword search (FTS5)
  const keywordResults = await ftsSearch(query, limit * 2);

  // 2. Semantic search (ChromaDB)
  const embedding = await getEmbedding(query);
  const semanticResults = await vectorSearch(embedding, limit * 2);

  // 3. Merge and score
  const merged = mergeResults(keywordResults, semanticResults);

  // 4. Apply temporal filter
  let filtered = merged;
  if (options.temporalFilter) {
    filtered = applyTemporalFilter(merged, options.temporalFilter);
  }

  // 5. Apply relevance decay
  filtered = applyRelevanceDecay(filtered, options.minRelevance);

  // 6. Enrich with relationships
  if (includeRelated) {
    filtered = await enrichWithRelationships(filtered);
  }

  // 7. Extract related entities
  filtered = await enrichWithEntities(filtered);

  return filtered.slice(0, limit);
}

function mergeResults(
  keyword: SearchResult[],
  semantic: SearchResult[]
): SearchResult[] {
  const scoreMap = new Map<string, SearchResult>();

  // Weight: keyword=0.4, semantic=0.6
  for (const r of keyword) {
    scoreMap.set(r.document.id, {
      ...r,
      score: r.score * 0.4,
      matchType: 'keyword'
    });
  }

  for (const r of semantic) {
    const existing = scoreMap.get(r.document.id);
    if (existing) {
      existing.score += r.score * 0.6;
    } else {
      scoreMap.set(r.document.id, {
        ...r,
        score: r.score * 0.6,
        matchType: 'semantic'
      });
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score);
}
```

---

### 6. Conversation Insight Extractor

**Purpose**: Extract learnings from conversations automatically

**Trigger**: End of significant conversation or manual `/rrr`

**Implementation**:
```typescript
interface ConversationInsight {
  type: 'fact' | 'preference' | 'decision' | 'learning' | 'task';
  content: string;
  confidence: number;
  entities: Entity[];
  source: {
    conversationId: string;
    messageRange: [number, number];
  };
}

async function extractConversationInsights(
  messages: Message[]
): Promise<ConversationInsight[]> {
  const response = await claude.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `Analyze this conversation and extract insights.

Return JSON array with:
- type: 'fact', 'preference', 'decision', 'learning', or 'task'
- content: the insight in one sentence
- confidence: 0.0-1.0
- entities: [{name, type}]

Conversation:
${messages.map(m => `${m.role}: ${m.content}`).join('\n\n')}

Only include significant insights, not obvious statements.`
    }]
  });

  return JSON.parse(response.content[0].text);
}

// Auto-save insights as learnings
async function saveConversationInsights(
  insights: ConversationInsight[]
): Promise<void> {
  for (const insight of insights) {
    if (insight.confidence > 0.7) {
      await oracle_learn({
        pattern: insight.content,
        concepts: insight.entities.map(e => e.name),
        source: `Conversation ${insight.source.conversationId}`
      });
    }
  }
}
```

---

## Skills Preparation

### Directory Structure
```
ψ/skills/
├── imported/           # Claude Skills from external sources
│   └── .gitkeep
├── learned/            # Skills learned from user behavior
│   └── .gitkeep
├── personal/           # User-created skills
│   └── .gitkeep
└── index.json          # Skill registry
```

### Skill Registry Schema
```typescript
interface SkillRegistry {
  version: string;
  skills: SkillEntry[];
}

interface SkillEntry {
  id: string;
  name: string;
  description: string;
  path: string;
  type: 'imported' | 'learned' | 'personal';
  tags: string[];
  exportable: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  lastUsed?: string;
}
```

### Skill-Memory Connection
```sql
-- Link skills to memories they were derived from
CREATE TABLE skill_sources (
  skill_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  contribution_type TEXT,  -- 'example', 'pattern', 'reference'
  PRIMARY KEY (skill_id, document_id),
  FOREIGN KEY (document_id) REFERENCES documents(id)
);
```

---

## Deliverables Checklist

### Week 1
- [ ] Database schema migration (new tables)
- [ ] File watcher service
- [ ] Basic entity extractor (rules-based)
- [ ] Temporal data extraction

### Week 2
- [ ] Relationship builder
- [ ] Enhanced hybrid search
- [ ] Conversation insight extractor
- [ ] Skills directory structure
- [ ] Integration tests

---

## Success Criteria

| Metric | Target |
|--------|--------|
| New files indexed | < 5 seconds |
| Entity extraction accuracy | > 80% |
| Relationship detection | > 70% |
| Search relevance (manual eval) | > 85% |
| Conversation insights captured | > 3 per significant chat |

---

## API Changes

### New MCP Tools

```typescript
// oracle_entities - List entities in knowledge base
oracle_entities(type?: string, limit?: number): Entity[]

// oracle_relationships - Get relationships for a document
oracle_relationships(documentId: string): Relationship[]

// oracle_timeline - Get temporal view of knowledge
oracle_timeline(after?: Date, before?: Date, limit?: number): Document[]

// oracle_search (enhanced)
oracle_search(query: string, options?: {
  includeRelated?: boolean;
  temporalFilter?: { after?: Date; before?: Date };
  entityFilter?: string[];
  minRelevance?: number;
}): SearchResult[]
```

---

## Migration Plan

1. **Backup existing database**
2. **Run schema migration** (add new tables)
3. **Backfill entities** for existing documents
4. **Backfill relationships** (batch process)
5. **Backfill temporal data** (extract from content/filenames)
6. **Test search quality**
7. **Deploy file watcher**

---

*Phase 1 Spec v1.0*
*"First principles, not conventions"*
