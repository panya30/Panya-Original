/**
 * Synthesizer
 *
 * Creates new knowledge from existing documents:
 * - merge: Combine related documents into one
 * - distill: Extract essence from verbose content
 * - supersede: Mark old doc as outdated, link to new
 * - resolveConflict: Handle contradicting information
 *
 * Panya Principle: Version, Don't Delete
 * - Old documents are never deleted, only superseded
 * - All synthesis operations are tracked in history
 * - Original sources are always linked
 */

import type {
  PanyaDatabase,
  Document,
  SynthesisType,
  KnowledgeConflict,
  ConflictResolution,
  DetectedPattern,
  KnowledgeLevel,
} from '../brain/database';
import { KnowledgeLevelManager } from './knowledge-level-manager';

// ============================================================================
// Types
// ============================================================================

export interface SynthesizerConfig {
  defaultConfidence?: number;
  requireValidation?: boolean;
  autoPromoteAfterSynthesis?: boolean;
}

export interface MergeOptions {
  strategy: 'concat' | 'dedupe' | 'summarize';
  preserveOriginals?: boolean;
  newType?: string;
  newConcepts?: string[];
}

export interface DistillOptions {
  maxLength?: number;
  preserveEntities?: boolean;
  targetLevel?: KnowledgeLevel;
}

export interface SynthesisResult {
  success: boolean;
  resultDocumentId?: string;
  sourceDocumentIds: string[];
  synthesisType: SynthesisType;
  metadata?: Record<string, any>;
  error?: string;
}

export interface ConflictResolutionResult {
  success: boolean;
  resolution: ConflictResolution;
  resultDocumentId?: string;
  description: string;
}

// ============================================================================
// Synthesizer
// ============================================================================

export class Synthesizer {
  private config: Required<SynthesizerConfig>;
  private levelManager: KnowledgeLevelManager;

  constructor(config?: SynthesizerConfig) {
    this.config = {
      defaultConfidence: config?.defaultConfidence ?? 0.7,
      requireValidation: config?.requireValidation ?? false,
      autoPromoteAfterSynthesis: config?.autoPromoteAfterSynthesis ?? true,
    };
    this.levelManager = new KnowledgeLevelManager();
  }

  // ==========================================================================
  // Merge Operations
  // ==========================================================================

  /**
   * Merge multiple documents into a new synthesized document
   */
  merge(
    db: PanyaDatabase,
    documentIds: string[],
    options: MergeOptions = { strategy: 'dedupe' }
  ): SynthesisResult {
    if (documentIds.length < 2) {
      return {
        success: false,
        sourceDocumentIds: documentIds,
        synthesisType: 'merge',
        error: 'Need at least 2 documents to merge',
      };
    }

    // Get all source documents
    const docs: Document[] = [];
    for (const id of documentIds) {
      const doc = db.getDocument(id);
      if (doc) docs.push(doc);
    }

    if (docs.length < 2) {
      return {
        success: false,
        sourceDocumentIds: documentIds,
        synthesisType: 'merge',
        error: 'Could not find enough valid documents to merge',
      };
    }

    // Merge content based on strategy
    let mergedContent: string;
    switch (options.strategy) {
      case 'concat':
        mergedContent = docs.map(d => d.content || '').join('\n\n---\n\n');
        break;

      case 'dedupe':
        mergedContent = this.dedupeContent(docs.map(d => d.content || ''));
        break;

      case 'summarize':
        mergedContent = this.summarizeContent(docs.map(d => d.content || ''));
        break;

      default:
        mergedContent = docs.map(d => d.content || '').join('\n\n');
    }

    // Merge concepts (union, deduplicated)
    const allConcepts = new Set<string>();
    for (const doc of docs) {
      for (const c of doc.concepts || []) {
        allConcepts.add(c);
      }
    }

    // Add any custom concepts
    if (options.newConcepts) {
      for (const c of options.newConcepts) {
        allConcepts.add(c);
      }
    }

    // Create new document
    const newDocId = `synth-merge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newType = options.newType || docs[0].type;

    db.insertDocument({
      id: newDocId,
      type: newType,
      sourceFile: `synthesized:${documentIds.join(',')}`,
      content: mergedContent,
      concepts: Array.from(allConcepts),
    });

    // Set knowledge level (L3 Synthesized)
    this.levelManager.setLevel(db, newDocId, 3, this.config.defaultConfidence);

    // Record synthesis history
    db.saveSynthesis({
      resultDocumentId: newDocId,
      sourceDocumentIds: documentIds,
      synthesisType: 'merge',
      metadata: {
        strategy: options.strategy,
        sourceCount: docs.length,
      },
    });

    // Mark originals as synthesized (but not deleted)
    if (!options.preserveOriginals) {
      for (const doc of docs) {
        db.supersede(doc.id, newDocId);
      }
    }

    return {
      success: true,
      resultDocumentId: newDocId,
      sourceDocumentIds: documentIds,
      synthesisType: 'merge',
      metadata: {
        strategy: options.strategy,
        conceptCount: allConcepts.size,
        contentLength: mergedContent.length,
      },
    };
  }

  /**
   * Remove duplicate sentences/paragraphs from content
   */
  private dedupeContent(contents: string[]): string {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const content of contents) {
      const paragraphs = content.split(/\n\n+/);
      for (const para of paragraphs) {
        const normalized = para.trim().toLowerCase();
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          result.push(para.trim());
        }
      }
    }

    return result.join('\n\n');
  }

  /**
   * Create a summary from multiple contents (simplified - just takes key sentences)
   */
  private summarizeContent(contents: string[]): string {
    const allSentences: string[] = [];

    for (const content of contents) {
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
      allSentences.push(...sentences.slice(0, 3)); // Take first 3 sentences from each
    }

    // Dedupe
    const seen = new Set<string>();
    const unique = allSentences.filter(s => {
      const norm = s.trim().toLowerCase();
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });

    return unique.map(s => s.trim()).join('. ') + '.';
  }

  // ==========================================================================
  // Distill Operations
  // ==========================================================================

  /**
   * Extract the essence from a document (make it more concise)
   */
  distill(
    db: PanyaDatabase,
    documentId: string,
    options: DistillOptions = {}
  ): SynthesisResult {
    const doc = db.getDocument(documentId);
    if (!doc) {
      return {
        success: false,
        sourceDocumentIds: [documentId],
        synthesisType: 'distill',
        error: 'Document not found',
      };
    }

    const content = doc.content || '';
    const maxLength = options.maxLength ?? Math.min(content.length / 2, 500);

    // Simple distillation: take key sentences
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const distilled: string[] = [];
    let totalLength = 0;

    for (const sentence of sentences) {
      if (totalLength + sentence.length > maxLength) break;
      distilled.push(sentence.trim());
      totalLength += sentence.length;
    }

    const distilledContent = distilled.join('. ') + (distilled.length > 0 ? '.' : '');

    // Create new distilled document
    const newDocId = `synth-distill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    db.insertDocument({
      id: newDocId,
      type: doc.type,
      sourceFile: `distilled:${documentId}`,
      content: distilledContent,
      concepts: doc.concepts,
    });

    // Set knowledge level
    const targetLevel = options.targetLevel ?? 3;
    this.levelManager.setLevel(db, newDocId, targetLevel, this.config.defaultConfidence);

    // Record synthesis
    db.saveSynthesis({
      resultDocumentId: newDocId,
      sourceDocumentIds: [documentId],
      synthesisType: 'distill',
      metadata: {
        originalLength: content.length,
        distilledLength: distilledContent.length,
        compressionRatio: distilledContent.length / content.length,
      },
    });

    return {
      success: true,
      resultDocumentId: newDocId,
      sourceDocumentIds: [documentId],
      synthesisType: 'distill',
      metadata: {
        originalLength: content.length,
        distilledLength: distilledContent.length,
      },
    };
  }

  // ==========================================================================
  // Supersede Operations
  // ==========================================================================

  /**
   * Mark an old document as superseded by a new one
   * Version, Don't Delete - the old doc remains but is marked as outdated
   */
  supersede(
    db: PanyaDatabase,
    oldDocumentId: string,
    newDocumentId: string,
    reason?: string
  ): SynthesisResult {
    const oldDoc = db.getDocument(oldDocumentId);
    const newDoc = db.getDocument(newDocumentId);

    if (!oldDoc) {
      return {
        success: false,
        sourceDocumentIds: [oldDocumentId],
        synthesisType: 'summarize', // Using 'summarize' as placeholder for supersede
        error: 'Old document not found',
      };
    }

    if (!newDoc) {
      return {
        success: false,
        sourceDocumentIds: [oldDocumentId, newDocumentId],
        synthesisType: 'summarize',
        error: 'New document not found',
      };
    }

    // Mark as superseded
    db.supersede(oldDocumentId, newDocumentId);

    // Reduce confidence of old document
    const oldLevel = db.getKnowledgeLevel(oldDocumentId);
    if (oldLevel) {
      this.levelManager.setLevel(
        db,
        oldDocumentId,
        oldLevel.level,
        Math.max(0.1, oldLevel.confidence * 0.5)
      );
    }

    // Record the supersession
    db.saveObservation({
      observationType: 'feedback',
      content: `Document ${oldDocumentId} superseded by ${newDocumentId}${reason ? `: ${reason}` : ''}`,
      sourceId: oldDocumentId,
      processed: true,
      processingStage: 'completed',
    });

    return {
      success: true,
      resultDocumentId: newDocumentId,
      sourceDocumentIds: [oldDocumentId],
      synthesisType: 'summarize', // Placeholder
      metadata: {
        reason,
        supersededAt: Date.now(),
      },
    };
  }

  // ==========================================================================
  // Conflict Resolution
  // ==========================================================================

  /**
   * Resolve a knowledge conflict
   */
  resolveConflict(
    db: PanyaDatabase,
    conflictId: number,
    resolution: ConflictResolution,
    options?: {
      mergeDocuments?: boolean;
      keepDocument?: string;
      customResolution?: string;
    }
  ): ConflictResolutionResult {
    const conflicts = db.getConflicts('pending', 100);
    const conflict = conflicts.find(c => c.id === conflictId);

    if (!conflict) {
      return {
        success: false,
        resolution,
        description: 'Conflict not found or already resolved',
      };
    }

    let resultDocId: string | undefined;

    switch (resolution) {
      case 'merged': {
        // Merge the two documents
        if (options?.mergeDocuments) {
          const mergeResult = this.merge(
            db,
            [conflict.documentAId, conflict.documentBId],
            { strategy: 'dedupe' }
          );
          if (mergeResult.success) {
            resultDocId = mergeResult.resultDocumentId;
          }
        }
        break;
      }

      case 'superseded': {
        // One document supersedes the other
        if (options?.keepDocument) {
          const oldDoc = options.keepDocument === conflict.documentAId
            ? conflict.documentBId
            : conflict.documentAId;
          this.supersede(db, oldDoc, options.keepDocument, 'Conflict resolution');
          resultDocId = options.keepDocument;
        }
        break;
      }

      case 'coexist': {
        // Both documents remain valid (different perspectives)
        // Just mark the conflict as resolved
        break;
      }

      case 'rejected': {
        // Conflict was a false positive
        break;
      }
    }

    // Update conflict status
    db.resolveConflict(conflictId, resolution, resultDocId);

    return {
      success: true,
      resolution,
      resultDocumentId: resultDocId,
      description: `Conflict resolved with strategy: ${resolution}`,
    };
  }

  /**
   * Auto-resolve conflicts based on confidence and recency
   */
  autoResolveConflicts(
    db: PanyaDatabase,
    maxConflicts: number = 10
  ): { resolved: number; failed: number } {
    const conflicts = db.getConflicts('pending', maxConflicts);
    let resolved = 0;
    let failed = 0;

    for (const conflict of conflicts) {
      const docA = db.getDocument(conflict.documentAId);
      const docB = db.getDocument(conflict.documentBId);

      if (!docA || !docB) {
        db.resolveConflict(conflict.id, 'rejected');
        failed++;
        continue;
      }

      const levelA = db.getKnowledgeLevel(conflict.documentAId);
      const levelB = db.getKnowledgeLevel(conflict.documentBId);

      // Strategy: Keep the one with higher level, or higher confidence, or more recent
      let keepDoc: string;
      let resolution: ConflictResolution;

      if ((levelA?.level ?? 1) !== (levelB?.level ?? 1)) {
        // Different levels - keep higher level
        keepDoc = (levelA?.level ?? 1) > (levelB?.level ?? 1)
          ? conflict.documentAId
          : conflict.documentBId;
        resolution = 'superseded';
      } else if ((levelA?.confidence ?? 0.5) !== (levelB?.confidence ?? 0.5)) {
        // Different confidence - keep higher confidence
        keepDoc = (levelA?.confidence ?? 0.5) > (levelB?.confidence ?? 0.5)
          ? conflict.documentAId
          : conflict.documentBId;
        resolution = 'superseded';
      } else if (docA.createdAt !== docB.createdAt) {
        // Same level and confidence - keep more recent
        keepDoc = docA.createdAt > docB.createdAt
          ? conflict.documentAId
          : conflict.documentBId;
        resolution = 'superseded';
      } else {
        // Identical - let them coexist
        keepDoc = conflict.documentAId;
        resolution = 'coexist';
      }

      const result = this.resolveConflict(db, conflict.id, resolution, {
        keepDocument: keepDoc,
      });

      if (result.success) {
        resolved++;
      } else {
        failed++;
      }
    }

    return { resolved, failed };
  }

  // ==========================================================================
  // Pattern-based Synthesis
  // ==========================================================================

  /**
   * Apply a validated pattern to create synthesized knowledge
   */
  applyPattern(db: PanyaDatabase, pattern: DetectedPattern): SynthesisResult {
    if (pattern.status !== 'validated') {
      return {
        success: false,
        sourceDocumentIds: pattern.documentIds,
        synthesisType: 'merge',
        error: 'Pattern must be validated before applying',
      };
    }

    switch (pattern.patternType) {
      case 'co-occurrence':
      case 'semantic': {
        // Merge related documents
        return this.merge(db, pattern.documentIds, {
          strategy: 'dedupe',
          newConcepts: pattern.metadata?.commonConcepts,
        });
      }

      case 'evolution': {
        // Create a summary of the evolution
        const docs = pattern.documentIds.map(id => db.getDocument(id)).filter(Boolean) as Document[];
        if (docs.length === 0) {
          return {
            success: false,
            sourceDocumentIds: pattern.documentIds,
            synthesisType: 'summarize',
            error: 'No documents found for evolution pattern',
          };
        }

        // Keep most recent, supersede others
        const sorted = docs.sort((a, b) => b.createdAt - a.createdAt);
        const latest = sorted[0];

        for (const doc of sorted.slice(1)) {
          this.supersede(db, doc.id, latest.id, `Evolution: superseded by newer version`);
        }

        return {
          success: true,
          resultDocumentId: latest.id,
          sourceDocumentIds: pattern.documentIds,
          synthesisType: 'summarize',
          metadata: {
            direction: pattern.metadata?.direction,
            evolvedDocuments: sorted.length,
          },
        };
      }

      case 'contradiction': {
        // Create a conflict record
        if (pattern.documentIds.length >= 2) {
          db.saveConflict({
            documentAId: pattern.documentIds[0],
            documentBId: pattern.documentIds[1],
            conflictType: pattern.metadata?.conflictType || 'unknown',
            description: pattern.description,
            resolution: 'pending',
          });
        }

        return {
          success: true,
          sourceDocumentIds: pattern.documentIds,
          synthesisType: 'merge',
          metadata: {
            conflictCreated: true,
          },
        };
      }

      default:
        return {
          success: false,
          sourceDocumentIds: pattern.documentIds,
          synthesisType: 'merge',
          error: `Unknown pattern type: ${pattern.patternType}`,
        };
    }
  }
}

// ============================================================================
// Export
// ============================================================================

export default Synthesizer;
