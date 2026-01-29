/**
 * Pattern Detector
 *
 * Detects patterns in the knowledge base:
 * - Co-occurrence: Same entities appearing together frequently
 * - Temporal: Time-based patterns (daily, weekly, seasonal)
 * - Semantic: Similar content/meaning (using FTS similarity)
 * - Contradiction: Conflicting information
 * - Evolution: How knowledge changed over time
 *
 * Patterns can be:
 * - detected: Initially found
 * - validated: Confirmed by user or system
 * - rejected: Marked as false positive
 * - applied: Used for synthesis or other operations
 */

import type {
  PanyaDatabase,
  Document,
  DetectedPattern,
  PatternType,
  PatternStatus,
} from '../brain/database';

// ============================================================================
// Types
// ============================================================================

export interface PatternDetectorConfig {
  minConfidence?: number;
  minCoOccurrence?: number;
  semanticSimilarityThreshold?: number;
  temporalWindowDays?: number;
}

export interface CoOccurrenceResult {
  entityA: string;
  entityB: string;
  count: number;
  documentIds: string[];
  confidence: number;
}

export interface TemporalPattern {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  dayOfWeek?: number;
  hourOfDay?: number;
  dayOfMonth?: number;
  month?: number;
  documentIds: string[];
  confidence: number;
}

export interface SemanticCluster {
  centroidDocId: string;
  memberDocIds: string[];
  commonConcepts: string[];
  similarity: number;
}

export interface ContradictionResult {
  documentAId: string;
  documentBId: string;
  conflictType: 'direct' | 'temporal' | 'source' | 'value';
  description: string;
  confidence: number;
}

export interface EvolutionChain {
  documentIds: string[];
  conceptPath: string[];
  direction: 'growth' | 'refinement' | 'divergence';
  confidence: number;
}

export interface DetectionResult {
  patterns: DetectedPattern[];
  stats: {
    coOccurrence: number;
    temporal: number;
    semantic: number;
    contradiction: number;
    evolution: number;
    total: number;
  };
  processingTimeMs: number;
}

// ============================================================================
// Pattern Detector
// ============================================================================

export class PatternDetector {
  private config: Required<PatternDetectorConfig>;

  constructor(config?: PatternDetectorConfig) {
    this.config = {
      minConfidence: config?.minConfidence ?? 0.5,
      minCoOccurrence: config?.minCoOccurrence ?? 3,
      semanticSimilarityThreshold: config?.semanticSimilarityThreshold ?? 0.6,
      temporalWindowDays: config?.temporalWindowDays ?? 30,
    };
  }

  // ==========================================================================
  // Main Detection Methods
  // ==========================================================================

  /**
   * Run all pattern detection algorithms
   */
  detectAll(db: PanyaDatabase): DetectionResult {
    const startTime = Date.now();
    const patterns: DetectedPattern[] = [];

    // Run each detector
    const coOccurrence = this.detectCoOccurrence(db);
    const temporal = this.detectTemporal(db);
    const semantic = this.detectSemantic(db);
    const contradiction = this.detectContradictions(db);
    const evolution = this.detectEvolution(db);

    // Save patterns to database
    for (const pattern of [...coOccurrence, ...temporal, ...semantic, ...contradiction, ...evolution]) {
      const id = db.savePattern(pattern);
      patterns.push({ ...pattern, id } as DetectedPattern);
    }

    return {
      patterns,
      stats: {
        coOccurrence: coOccurrence.length,
        temporal: temporal.length,
        semantic: semantic.length,
        contradiction: contradiction.length,
        evolution: evolution.length,
        total: patterns.length,
      },
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Detect a specific pattern type
   */
  detect(db: PanyaDatabase, type: PatternType): Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] {
    switch (type) {
      case 'co-occurrence':
        return this.detectCoOccurrence(db);
      case 'temporal':
        return this.detectTemporal(db);
      case 'semantic':
        return this.detectSemantic(db);
      case 'contradiction':
        return this.detectContradictions(db);
      case 'evolution':
        return this.detectEvolution(db);
      default:
        return [];
    }
  }

  // ==========================================================================
  // Co-occurrence Detection
  // ==========================================================================

  /**
   * Find entities that frequently appear together
   */
  detectCoOccurrence(db: PanyaDatabase): Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] {
    const patterns: Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] = [];

    // Get all documents with concepts
    const docs = db.searchFTS('*', 1000); // Get many docs

    // Build concept co-occurrence matrix
    const coOccurrence = new Map<string, { count: number; docIds: Set<string> }>();

    for (const doc of docs) {
      if (!doc.tags || doc.tags.length < 2) continue;

      // Generate pairs
      for (let i = 0; i < doc.tags.length; i++) {
        for (let j = i + 1; j < doc.tags.length; j++) {
          const pair = [doc.tags[i], doc.tags[j]].sort().join('::');
          const existing = coOccurrence.get(pair) || { count: 0, docIds: new Set() };
          existing.count++;
          existing.docIds.add(doc.id);
          coOccurrence.set(pair, existing);
        }
      }
    }

    // Filter by minimum co-occurrence
    for (const [pair, data] of coOccurrence) {
      if (data.count >= this.config.minCoOccurrence) {
        const [entityA, entityB] = pair.split('::');
        const confidence = Math.min(1, data.count / 10); // Scale confidence

        if (confidence >= this.config.minConfidence) {
          patterns.push({
            patternType: 'co-occurrence',
            confidence,
            documentIds: Array.from(data.docIds),
            description: `Concepts "${entityA}" and "${entityB}" co-occur in ${data.count} documents`,
            metadata: { entityA, entityB, count: data.count },
            status: 'detected',
          });
        }
      }
    }

    return patterns;
  }

  // ==========================================================================
  // Temporal Pattern Detection
  // ==========================================================================

  /**
   * Find time-based patterns
   */
  detectTemporal(db: PanyaDatabase): Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] {
    const patterns: Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    const docs = db.searchFTS('*', 1000);

    // Group by day of week
    const byDayOfWeek = new Map<number, string[]>();
    // Group by hour
    const byHour = new Map<number, string[]>();

    for (const doc of docs) {
      const date = new Date(doc.createdAt);
      const dayOfWeek = date.getDay();
      const hour = date.getHours();

      // Day of week
      const existingDay = byDayOfWeek.get(dayOfWeek) || [];
      existingDay.push(doc.id);
      byDayOfWeek.set(dayOfWeek, existingDay);

      // Hour
      const existingHour = byHour.get(hour) || [];
      existingHour.push(doc.id);
      byHour.set(hour, existingHour);
    }

    // Analyze day of week patterns
    const avgPerDay = docs.length / 7;
    for (const [day, docIds] of byDayOfWeek) {
      const ratio = docIds.length / avgPerDay;
      if (ratio > 1.5) {
        // Significantly more than average
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        patterns.push({
          patternType: 'temporal',
          confidence: Math.min(1, (ratio - 1) / 2),
          documentIds: docIds.slice(0, 50), // Limit stored IDs
          description: `High activity on ${dayNames[day]}s (${Math.round(ratio * 100)}% of average)`,
          metadata: { type: 'weekly', dayOfWeek: day, ratio },
          status: 'detected',
        });
      }
    }

    // Analyze hourly patterns
    const avgPerHour = docs.length / 24;
    for (const [hour, docIds] of byHour) {
      const ratio = docIds.length / avgPerHour;
      if (ratio > 2) {
        // Significantly more than average
        patterns.push({
          patternType: 'temporal',
          confidence: Math.min(1, (ratio - 1) / 3),
          documentIds: docIds.slice(0, 50),
          description: `Peak activity at ${hour}:00 (${Math.round(ratio * 100)}% of average)`,
          metadata: { type: 'daily', hourOfDay: hour, ratio },
          status: 'detected',
        });
      }
    }

    return patterns;
  }

  // ==========================================================================
  // Semantic Similarity Detection
  // ==========================================================================

  /**
   * Find semantically similar documents (clusters)
   */
  detectSemantic(db: PanyaDatabase): Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] {
    const patterns: Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    const docs = db.searchFTS('*', 500);

    // Build concept-based similarity clusters
    const clusters = new Map<string, { centroid: Document; members: Document[] }>();

    // Group by primary concept
    for (const doc of docs) {
      if (!doc.tags || doc.tags.length === 0) continue;

      const primaryConcept = doc.tags[0];
      const existing = clusters.get(primaryConcept);

      if (existing) {
        existing.members.push(doc);
      } else {
        clusters.set(primaryConcept, { centroid: doc, members: [doc] });
      }
    }

    // Find significant clusters
    for (const [concept, cluster] of clusters) {
      if (cluster.members.length >= 3) {
        // Find common concepts across cluster
        const conceptCounts = new Map<string, number>();
        for (const doc of cluster.members) {
          for (const c of doc.tags || []) {
            conceptCounts.set(c, (conceptCounts.get(c) || 0) + 1);
          }
        }

        const commonConcepts = Array.from(conceptCounts.entries())
          .filter(([_, count]) => count >= cluster.members.length * 0.5)
          .map(([c]) => c);

        const confidence = Math.min(1, cluster.members.length / 10);

        if (confidence >= this.config.minConfidence) {
          patterns.push({
            patternType: 'semantic',
            confidence,
            documentIds: cluster.members.map(d => d.id),
            description: `Semantic cluster around "${concept}" with ${cluster.members.length} documents`,
            metadata: {
              primaryConcept: concept,
              commonConcepts,
              memberCount: cluster.members.length,
            },
            status: 'detected',
          });
        }
      }
    }

    return patterns;
  }

  // ==========================================================================
  // Contradiction Detection
  // ==========================================================================

  /**
   * Find potentially contradicting documents
   */
  detectContradictions(db: PanyaDatabase): Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] {
    const patterns: Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    const docs = db.searchFTS('*', 500);

    // Simple contradiction detection based on concept overlap + different types
    const byConceptGroup = new Map<string, Document[]>();

    for (const doc of docs) {
      if (!doc.tags || doc.tags.length === 0) continue;

      // Create a concept group key
      const key = doc.tags.slice(0, 3).sort().join('|');
      const existing = byConceptGroup.get(key) || [];
      existing.push(doc);
      byConceptGroup.set(key, existing);
    }

    // Look for contradictions within groups
    for (const [_, group] of byConceptGroup) {
      if (group.length < 2) continue;

      // Check for documents with same concepts but different types (possible contradiction)
      const typeGroups = new Map<string, Document[]>();
      for (const doc of group) {
        const existing = typeGroups.get(doc.type) || [];
        existing.push(doc);
        typeGroups.set(doc.type, existing);
      }

      // If we have different types for same concepts, might be contradiction or evolution
      if (typeGroups.size > 1) {
        const types = Array.from(typeGroups.keys());
        for (let i = 0; i < types.length; i++) {
          for (let j = i + 1; j < types.length; j++) {
            const docsA = typeGroups.get(types[i])!;
            const docsB = typeGroups.get(types[j])!;

            // Check if they were created around same time (more likely contradiction)
            for (const docA of docsA.slice(0, 5)) {
              for (const docB of docsB.slice(0, 5)) {
                const timeDiffMs = Math.abs(docA.createdAt - docB.createdAt);
                const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);

                if (timeDiffDays < this.config.temporalWindowDays) {
                  // Potential contradiction
                  patterns.push({
                    patternType: 'contradiction',
                    confidence: Math.max(0.3, 1 - timeDiffDays / this.config.temporalWindowDays),
                    documentIds: [docA.id, docB.id],
                    description: `Potential contradiction: "${docA.type}" vs "${docB.type}" for same concepts`,
                    metadata: {
                      conflictType: 'temporal',
                      typeA: docA.type,
                      typeB: docB.type,
                      timeDiffDays,
                    },
                    status: 'detected',
                  });
                }
              }
            }
          }
        }
      }
    }

    return patterns;
  }

  // ==========================================================================
  // Evolution Detection
  // ==========================================================================

  /**
   * Find how knowledge evolved over time
   */
  detectEvolution(db: PanyaDatabase): Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] {
    const patterns: Omit<DetectedPattern, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    const docs = db.searchFTS('*', 500);

    // Group docs by shared concepts and sort by time
    const conceptTimelines = new Map<string, Document[]>();

    for (const doc of docs) {
      for (const concept of doc.tags || []) {
        const existing = conceptTimelines.get(concept) || [];
        existing.push(doc);
        conceptTimelines.set(concept, existing);
      }
    }

    // Find concepts with evolution (multiple docs over time)
    for (const [concept, timeline] of conceptTimelines) {
      if (timeline.length < 3) continue;

      // Sort by creation time
      timeline.sort((a, b) => a.createdAt - b.createdAt);

      // Check for evolution pattern
      const timeSpanDays = (timeline[timeline.length - 1].createdAt - timeline[0].createdAt) / (1000 * 60 * 60 * 24);

      if (timeSpanDays > 7 && timeline.length >= 3) {
        // Analyze direction
        const firstConcepts = new Set(timeline[0].tags || []);
        const lastConcepts = new Set(timeline[timeline.length - 1].tags || []);

        let direction: 'growth' | 'refinement' | 'divergence' = 'refinement';

        if (lastConcepts.size > firstConcepts.size * 1.5) {
          direction = 'growth';
        } else if (
          [...lastConcepts].filter(c => !firstConcepts.has(c)).length >
          [...lastConcepts].filter(c => firstConcepts.has(c)).length
        ) {
          direction = 'divergence';
        }

        patterns.push({
          patternType: 'evolution',
          confidence: Math.min(1, timeline.length / 10),
          documentIds: timeline.map(d => d.id).slice(0, 20),
          description: `Evolution of "${concept}" over ${Math.round(timeSpanDays)} days (${direction})`,
          metadata: {
            concept,
            direction,
            timeSpanDays,
            documentCount: timeline.length,
          },
          status: 'detected',
        });
      }
    }

    return patterns;
  }

  // ==========================================================================
  // Pattern Validation
  // ==========================================================================

  /**
   * Validate a detected pattern (mark as validated or rejected)
   */
  validatePattern(db: PanyaDatabase, patternId: number, valid: boolean): void {
    db.updatePatternStatus(patternId, valid ? 'validated' : 'rejected');
  }

  /**
   * Get patterns awaiting validation
   */
  getPendingPatterns(db: PanyaDatabase, limit: number = 50): DetectedPattern[] {
    return db.getPatterns('detected', limit);
  }

  /**
   * Get validated patterns ready for synthesis
   */
  getValidatedPatterns(db: PanyaDatabase, type?: PatternType, limit: number = 50): DetectedPattern[] {
    const patterns = db.getPatterns('validated', limit);
    if (type) {
      return patterns.filter(p => p.patternType === type);
    }
    return patterns;
  }

  /**
   * Mark a pattern as applied (after synthesis)
   */
  markAsApplied(db: PanyaDatabase, patternId: number): void {
    db.updatePatternStatus(patternId, 'applied');
  }
}

// ============================================================================
// Export
// ============================================================================

export default PatternDetector;
