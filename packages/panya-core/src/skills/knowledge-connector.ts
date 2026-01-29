/**
 * Knowledge Connector Skill
 *
 * Finds hidden relationships between pieces of knowledge:
 * - Connects documents by shared entities
 * - Detects semantic similarity
 * - Builds knowledge graph
 * - Suggests related content
 *
 * Part of Panya's 5 Fundamental Meta-Skills
 */

import type { PanyaDatabase, Document, Entity, Relationship } from '../brain/database';

// ============================================================================
// Types
// ============================================================================

export interface Connection {
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  strength: number;
  reason: string;
  sharedEntities?: string[];
  sharedConcepts?: string[];
}

export type ConnectionType =
  | 'entity_shared'      // Same entities mentioned
  | 'concept_shared'     // Same concepts/topics
  | 'temporal_proximity' // Close in time
  | 'semantic_similar'   // Semantically similar content
  | 'explicit_link'      // Explicitly linked (updates, extends, etc.)
  | 'author_same'        // Same author/source
  | 'text_similarity'    // Shared significant words
  | 'same_type';         // Same document type

export interface KnowledgeNode {
  id: string;
  type: string;
  scope?: string;
  label: string;
  weight: number;
  connections: number;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: Connection[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgConnections: number;
    clusters: number;
  };
}

export interface SuggestionResult {
  documentId: string;
  suggestions: Array<{
    relatedId: string;
    relatedTitle: string;
    connectionType: ConnectionType;
    strength: number;
    reason: string;
  }>;
}

export interface KnowledgeConnectorConfig {
  minConnectionStrength?: number;
  maxSuggestions?: number;
  enableSemanticSimilarity?: boolean;
  temporalWindowDays?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<KnowledgeConnectorConfig> = {
  minConnectionStrength: 0.3,
  maxSuggestions: 10,
  enableSemanticSimilarity: false, // Requires vector DB
  temporalWindowDays: 7,
};

// ============================================================================
// Knowledge Connector Skill
// ============================================================================

export class KnowledgeConnectorSkill {
  private config: Required<KnowledgeConnectorConfig>;

  constructor(config?: KnowledgeConnectorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Connection Detection
  // ==========================================================================

  /**
   * Find connections for a specific document
   */
  findConnections(db: PanyaDatabase, documentId: string): Connection[] {
    const connections: Connection[] = [];
    const doc = db.getDocument(documentId);

    if (!doc) return connections;

    // Get all documents
    const allDocs = this.getAllDocuments(db);

    for (const other of allDocs) {
      if (other.id === documentId) continue;

      const docConnections = this.detectConnections(doc, other);
      connections.push(...docConnections);
    }

    // Sort by strength
    connections.sort((a, b) => b.strength - a.strength);

    return connections.filter(c => c.strength >= this.config.minConnectionStrength);
  }

  /**
   * Detect connections between two documents
   */
  private detectConnections(doc1: Document, doc2: Document): Connection[] {
    const connections: Connection[] = [];

    // 1. Shared tags (formerly concepts)
    const sharedTags = this.findSharedConcepts(doc1.tags || [], doc2.tags || []);
    if (sharedTags.length > 0) {
      connections.push({
        sourceId: doc1.id,
        targetId: doc2.id,
        type: 'concept_shared',
        strength: Math.min(1, sharedTags.length * 0.3),
        reason: `Shared tags: ${sharedTags.join(', ')}`,
        sharedConcepts: sharedTags,
      });
    }

    // 2. Temporal proximity
    const timeDiff = Math.abs(doc1.createdAt - doc2.createdAt);
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
    if (daysDiff <= this.config.temporalWindowDays) {
      const strength = 1 - (daysDiff / this.config.temporalWindowDays);
      if (strength >= this.config.minConnectionStrength) {
        connections.push({
          sourceId: doc1.id,
          targetId: doc2.id,
          type: 'temporal_proximity',
          strength,
          reason: `Created within ${Math.round(daysDiff)} days of each other`,
        });
      }
    }

    // 3. Text similarity (shared significant words)
    const sharedWords = this.findSharedWords(doc1.content || '', doc2.content || '');
    if (sharedWords.length >= 2) {
      const strength = Math.min(1, sharedWords.length * 0.15);
      if (strength >= this.config.minConnectionStrength) {
        connections.push({
          sourceId: doc1.id,
          targetId: doc2.id,
          type: 'text_similarity',
          strength,
          reason: `Shared terms: ${sharedWords.slice(0, 5).join(', ')}`,
        });
      }
    }

    // 4. Same type (weaker connection)
    if (doc1.type === doc2.type && connections.length === 0) {
      connections.push({
        sourceId: doc1.id,
        targetId: doc2.id,
        type: 'same_type',
        strength: 0.25,
        reason: `Same document type: ${doc1.type}`,
      });
    }

    return connections;
  }

  private findSharedWords(text1: string, text2: string): string[] {
    const stopWords = new Set(['the', 'is', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'of', 'with', 'are', 'that', 'this', 'it', 'be', 'as', 'on', 'by', 'at', 'from']);

    const extractWords = (text: string): Set<string> => {
      return new Set(
        text.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3 && !stopWords.has(w))
      );
    };

    const words1 = extractWords(text1);
    const words2 = extractWords(text2);

    return [...words1].filter(w => words2.has(w));
  }

  private findSharedConcepts(concepts1: string[], concepts2: string[]): string[] {
    const set1 = new Set(concepts1.map(c => c.toLowerCase()));
    return concepts2.filter(c => set1.has(c.toLowerCase()));
  }

  // ==========================================================================
  // Entity-Based Connections
  // ==========================================================================

  /**
   * Find connections based on shared entities
   */
  findEntityConnections(db: PanyaDatabase, documentId: string): Connection[] {
    // This would query entity_mentions table to find documents that share entities
    // For now, simplified implementation

    const connections: Connection[] = [];
    const relationships = db.getRelationships(documentId);

    for (const rel of relationships) {
      const otherId = rel.sourceId === documentId ? rel.targetId : rel.sourceId;

      connections.push({
        sourceId: documentId,
        targetId: otherId,
        type: 'explicit_link',
        strength: rel.confidence,
        reason: `Explicit relationship: ${rel.type}`,
      });
    }

    return connections;
  }

  // ==========================================================================
  // Knowledge Graph
  // ==========================================================================

  /**
   * Build a knowledge graph from all documents
   * @param scope - Filter by scope: 'common', 'personal', or undefined (all)
   */
  buildGraph(db: PanyaDatabase, scope?: 'common' | 'personal'): KnowledgeGraph {
    const nodes: KnowledgeNode[] = [];
    const edges: Connection[] = [];
    const connectionCounts: Record<string, number> = {};

    const allDocs = this.getAllDocuments(db, scope);

    // Create nodes
    for (const doc of allDocs) {
      nodes.push({
        id: doc.id,
        type: doc.type,
        scope: doc.scope,
        label: this.getDocLabel(doc),
        weight: 1,
        connections: 0,
      });
      connectionCounts[doc.id] = 0;
    }

    // Find all connections
    for (let i = 0; i < allDocs.length; i++) {
      for (let j = i + 1; j < allDocs.length; j++) {
        const connections = this.detectConnections(allDocs[i], allDocs[j]);
        for (const conn of connections) {
          if (conn.strength >= this.config.minConnectionStrength) {
            edges.push(conn);
            connectionCounts[conn.sourceId]++;
            connectionCounts[conn.targetId]++;
          }
        }
      }
    }

    // Update node connection counts
    for (const node of nodes) {
      node.connections = connectionCounts[node.id] || 0;
    }

    // Calculate stats
    const totalConnections = Object.values(connectionCounts).reduce((a, b) => a + b, 0);
    const avgConnections = nodes.length > 0 ? totalConnections / nodes.length : 0;

    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        avgConnections,
        clusters: this.countClusters(nodes, edges),
      },
    };
  }

  private getDocLabel(doc: Document): string {
    if (doc.content) {
      // Get first line or first 50 chars
      const firstLine = doc.content.split('\n')[0];
      return firstLine.slice(0, 50) + (firstLine.length > 50 ? '...' : '');
    }
    return doc.sourceFile.split('/').pop() || doc.id;
  }

  private countClusters(nodes: KnowledgeNode[], edges: Connection[]): number {
    // Simple cluster detection using connected components
    const visited = new Set<string>();
    let clusters = 0;

    const adjacency: Record<string, string[]> = {};
    for (const node of nodes) {
      adjacency[node.id] = [];
    }
    for (const edge of edges) {
      adjacency[edge.sourceId]?.push(edge.targetId);
      adjacency[edge.targetId]?.push(edge.sourceId);
    }

    const dfs = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      for (const neighbor of adjacency[nodeId] || []) {
        dfs(neighbor);
      }
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        clusters++;
        dfs(node.id);
      }
    }

    return clusters;
  }

  // ==========================================================================
  // Suggestions
  // ==========================================================================

  /**
   * Get related content suggestions for a document
   */
  getSuggestions(db: PanyaDatabase, documentId: string): SuggestionResult {
    const connections = this.findConnections(db, documentId);
    const entityConnections = this.findEntityConnections(db, documentId);

    // Merge and deduplicate
    const allConnections = [...connections, ...entityConnections];
    const seen = new Set<string>();
    const uniqueConnections = allConnections.filter(c => {
      const key = `${c.sourceId}-${c.targetId}-${c.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by strength and take top N
    uniqueConnections.sort((a, b) => b.strength - a.strength);
    const topConnections = uniqueConnections.slice(0, this.config.maxSuggestions);

    return {
      documentId,
      suggestions: topConnections.map(c => {
        const relatedId = c.sourceId === documentId ? c.targetId : c.sourceId;
        const relatedDoc = db.getDocument(relatedId);

        return {
          relatedId,
          relatedTitle: relatedDoc ? this.getDocLabel(relatedDoc) : relatedId,
          connectionType: c.type,
          strength: c.strength,
          reason: c.reason,
        };
      }),
    };
  }

  // ==========================================================================
  // Auto-Connect
  // ==========================================================================

  /**
   * Automatically create relationships in the database
   */
  autoConnect(db: PanyaDatabase, documentId: string, minStrength: number = 0.5): number {
    const connections = this.findConnections(db, documentId);
    let created = 0;

    for (const conn of connections) {
      if (conn.strength >= minStrength) {
        // Map connection type to relationship type
        const relType = this.mapToRelationType(conn.type);

        db.addRelationship({
          sourceId: conn.sourceId,
          targetId: conn.targetId,
          type: relType,
          confidence: conn.strength,
        });
        created++;
      }
    }

    return created;
  }

  private mapToRelationType(connType: ConnectionType): Relationship['type'] {
    switch (connType) {
      case 'temporal_proximity':
      case 'concept_shared':
      case 'entity_shared':
        return 'relates_to';
      case 'semantic_similar':
        return 'derives';
      case 'explicit_link':
        return 'extends';
      default:
        return 'relates_to';
    }
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  private getAllDocuments(db: PanyaDatabase, scope?: 'common' | 'personal'): Document[] {
    return db.listAllDocuments(500, scope);
  }
}
