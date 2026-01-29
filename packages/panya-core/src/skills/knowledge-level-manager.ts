/**
 * Knowledge Level Manager
 *
 * Manages the 4-level knowledge hierarchy:
 * - L1 Raw: Fresh observations, conversations, raw data
 * - L2 Extracted: Entities extracted, initial processing done
 * - L3 Synthesized: Multiple sources merged, patterns applied
 * - L4 Core: Validated, high-confidence, frequently used knowledge
 *
 * Handles:
 * - Promotion (moving knowledge up the hierarchy)
 * - Demotion (rare, usually only on conflict)
 * - Decay (reducing relevance over time)
 * - Usage tracking (access counts affect promotion)
 */

import type {
  PanyaDatabase,
  KnowledgeLevel,
  KnowledgeLevelData,
  PromotionRule,
  DecayRule,
  Document,
} from '../brain/database';

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeLevelManagerConfig {
  autoPromote?: boolean;
  autoDecay?: boolean;
  decayIntervalHours?: number;
}

export interface PromotionCandidate {
  documentId: string;
  currentLevel: KnowledgeLevel;
  targetLevel: KnowledgeLevel;
  confidence: number;
  usageCount: number;
  matchedRules: PromotionRule[];
  score: number;
}

export interface DecayResult {
  documentId: string;
  previousConfidence: number;
  newConfidence: number;
  decayApplied: number;
  level: KnowledgeLevel;
}

export interface LevelStats {
  level: KnowledgeLevel;
  count: number;
  avgConfidence: number;
  avgUsage: number;
  oldestDays: number;
  newestDays: number;
}

// ============================================================================
// Knowledge Level Manager
// ============================================================================

export class KnowledgeLevelManager {
  private config: Required<KnowledgeLevelManagerConfig>;

  constructor(config?: KnowledgeLevelManagerConfig) {
    this.config = {
      autoPromote: config?.autoPromote ?? true,
      autoDecay: config?.autoDecay ?? true,
      decayIntervalHours: config?.decayIntervalHours ?? 24,
    };
  }

  // ==========================================================================
  // Level Operations
  // ==========================================================================

  /**
   * Get the knowledge level of a document
   */
  getLevel(db: PanyaDatabase, documentId: string): KnowledgeLevelData | null {
    return db.getKnowledgeLevel(documentId);
  }

  /**
   * Set or initialize knowledge level for a document
   */
  setLevel(
    db: PanyaDatabase,
    documentId: string,
    level: KnowledgeLevel,
    confidence: number = 0.5,
    promotedFromId?: string
  ): void {
    const existing = db.getKnowledgeLevel(documentId);

    db.setKnowledgeLevel({
      documentId,
      level,
      confidence: Math.max(0, Math.min(1, confidence)),
      usageCount: existing?.usageCount ?? 0,
      promotedFromId,
      lastPromotedAt: level > (existing?.level ?? 0) ? Date.now() : existing?.lastPromotedAt,
    });
  }

  /**
   * Initialize a new document at L1 (Raw)
   */
  initializeDocument(db: PanyaDatabase, documentId: string, confidence: number = 0.5): void {
    this.setLevel(db, documentId, 1, confidence);
  }

  /**
   * Record document access (affects promotion eligibility)
   */
  recordAccess(db: PanyaDatabase, documentId: string): void {
    db.incrementUsageCount(documentId);
  }

  // ==========================================================================
  // Promotion Logic
  // ==========================================================================

  /**
   * Evaluate if a document is ready for promotion
   */
  evaluateForPromotion(db: PanyaDatabase, documentId: string): PromotionCandidate | null {
    const levelData = db.getKnowledgeLevel(documentId);
    if (!levelData) return null;

    // L4 is max level, cannot promote further
    if (levelData.level >= 4) return null;

    const targetLevel = (levelData.level + 1) as KnowledgeLevel;
    const rules = db.getPromotionRules(levelData.level);

    if (rules.length === 0) return null;

    const matchedRules: PromotionRule[] = [];
    let score = 0;

    for (const rule of rules) {
      const ruleMatched = this.checkRule(rule, levelData, db, documentId);
      if (ruleMatched) {
        matchedRules.push(rule);
        score += rule.thresholdValue;
      }
    }

    // Need at least one rule to match for promotion
    if (matchedRules.length === 0) return null;

    return {
      documentId,
      currentLevel: levelData.level,
      targetLevel,
      confidence: levelData.confidence,
      usageCount: levelData.usageCount,
      matchedRules,
      score,
    };
  }

  /**
   * Check if a single promotion rule is satisfied
   */
  private checkRule(
    rule: PromotionRule,
    levelData: KnowledgeLevelData,
    db: PanyaDatabase,
    documentId: string
  ): boolean {
    switch (rule.ruleType) {
      case 'confidence':
        return levelData.confidence >= rule.thresholdValue;

      case 'usage':
        return levelData.usageCount >= rule.thresholdValue;

      case 'entity_count': {
        // Check if document has enough entities
        const doc = db.getDocument(documentId);
        if (!doc) return false;
        // Count entities in concepts array (simplified check)
        return (doc.tags?.length ?? 0) >= rule.thresholdValue;
      }

      case 'validation':
        // Validation rule requires explicit validation (handled externally)
        return false;

      case 'age': {
        // Check if document is old enough
        const ageMs = Date.now() - levelData.createdAt;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        return ageDays >= rule.thresholdValue;
      }

      default:
        return false;
    }
  }

  /**
   * Promote a document to the next level
   */
  promote(
    db: PanyaDatabase,
    documentId: string,
    newConfidence?: number
  ): { success: boolean; newLevel?: KnowledgeLevel; error?: string } {
    const levelData = db.getKnowledgeLevel(documentId);

    if (!levelData) {
      return { success: false, error: 'Document has no knowledge level data' };
    }

    if (levelData.level >= 4) {
      return { success: false, error: 'Document is already at maximum level (L4 Core)' };
    }

    const newLevel = (levelData.level + 1) as KnowledgeLevel;
    const confidence = newConfidence ?? Math.min(1, levelData.confidence + 0.1);

    this.setLevel(db, documentId, newLevel, confidence, documentId);

    return { success: true, newLevel };
  }

  /**
   * Demote a document to a lower level (rare operation)
   */
  demote(
    db: PanyaDatabase,
    documentId: string,
    reason: string
  ): { success: boolean; newLevel?: KnowledgeLevel; error?: string } {
    const levelData = db.getKnowledgeLevel(documentId);

    if (!levelData) {
      return { success: false, error: 'Document has no knowledge level data' };
    }

    if (levelData.level <= 1) {
      return { success: false, error: 'Document is already at minimum level (L1 Raw)' };
    }

    const newLevel = (levelData.level - 1) as KnowledgeLevel;
    const confidence = Math.max(0.1, levelData.confidence - 0.2);

    this.setLevel(db, documentId, newLevel, confidence);

    // Log the demotion reason
    db.saveObservation({
      observationType: 'feedback',
      content: `Document ${documentId} demoted from L${levelData.level} to L${newLevel}: ${reason}`,
      sourceId: documentId,
      processed: true,
      processingStage: 'completed',
    });

    return { success: true, newLevel };
  }

  /**
   * Find all documents ready for promotion
   */
  findPromotionCandidates(db: PanyaDatabase, limit: number = 50): PromotionCandidate[] {
    const candidates: PromotionCandidate[] = [];

    // Check each level (1-3)
    for (const level of [1, 2, 3] as KnowledgeLevel[]) {
      const docIds = db.getDocumentsByLevel(level, limit);

      for (const docId of docIds) {
        const candidate = this.evaluateForPromotion(db, docId);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }

    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score);

    return candidates.slice(0, limit);
  }

  /**
   * Batch promote all eligible documents
   */
  batchPromote(db: PanyaDatabase, maxPromotions: number = 10): {
    promoted: string[];
    failed: string[];
  } {
    const candidates = this.findPromotionCandidates(db, maxPromotions);
    const promoted: string[] = [];
    const failed: string[] = [];

    for (const candidate of candidates) {
      const result = this.promote(db, candidate.documentId);
      if (result.success) {
        promoted.push(candidate.documentId);
      } else {
        failed.push(candidate.documentId);
      }
    }

    return { promoted, failed };
  }

  // ==========================================================================
  // Decay Logic
  // ==========================================================================

  /**
   * Apply decay to a single document based on its level
   */
  applyDecay(db: PanyaDatabase, documentId: string): DecayResult | null {
    const levelData = db.getKnowledgeLevel(documentId);
    if (!levelData) return null;

    const rules = db.getDecayRules();
    const rule = rules.find(r => r.level === levelData.level);

    if (!rule || rule.decayFunction === 'none') {
      return null; // L4 Core doesn't decay
    }

    const ageMs = Date.now() - levelData.updatedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    let decayAmount = 0;

    switch (rule.decayFunction) {
      case 'exponential': {
        // Exponential decay: confidence * e^(-λt)
        // where λ = ln(2) / half_life
        const lambda = Math.log(2) / rule.halfLifeDays;
        decayAmount = levelData.confidence * (1 - Math.exp(-lambda * ageDays));
        break;
      }

      case 'linear': {
        // Linear decay: lose (1/half_life) per day
        decayAmount = (levelData.confidence / rule.halfLifeDays) * ageDays;
        break;
      }
    }

    const newConfidence = Math.max(rule.minValue, levelData.confidence - decayAmount);

    if (newConfidence !== levelData.confidence) {
      this.setLevel(db, documentId, levelData.level, newConfidence);
    }

    return {
      documentId,
      previousConfidence: levelData.confidence,
      newConfidence,
      decayApplied: levelData.confidence - newConfidence,
      level: levelData.level,
    };
  }

  /**
   * Apply decay to all documents at a specific level
   */
  batchDecay(db: PanyaDatabase, level?: KnowledgeLevel): {
    processed: number;
    decayed: DecayResult[];
  } {
    const levels = level ? [level] : [1, 2, 3] as KnowledgeLevel[]; // L4 never decays
    const decayed: DecayResult[] = [];
    let processed = 0;

    for (const lvl of levels) {
      const docIds = db.getDocumentsByLevel(lvl, 1000);
      processed += docIds.length;

      for (const docId of docIds) {
        const result = this.applyDecay(db, docId);
        if (result && result.decayApplied > 0) {
          decayed.push(result);
        }
      }
    }

    return { processed, decayed };
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get statistics for each knowledge level
   */
  getLevelStats(db: PanyaDatabase): LevelStats[] {
    const stats: LevelStats[] = [];
    const now = Date.now();

    for (const level of [1, 2, 3, 4] as KnowledgeLevel[]) {
      const docIds = db.getDocumentsByLevel(level, 10000);
      if (docIds.length === 0) {
        stats.push({
          level,
          count: 0,
          avgConfidence: 0,
          avgUsage: 0,
          oldestDays: 0,
          newestDays: 0,
        });
        continue;
      }

      let totalConfidence = 0;
      let totalUsage = 0;
      let oldest = now;
      let newest = 0;

      for (const docId of docIds) {
        const data = db.getKnowledgeLevel(docId);
        if (data) {
          totalConfidence += data.confidence;
          totalUsage += data.usageCount;
          if (data.createdAt < oldest) oldest = data.createdAt;
          if (data.createdAt > newest) newest = data.createdAt;
        }
      }

      stats.push({
        level,
        count: docIds.length,
        avgConfidence: totalConfidence / docIds.length,
        avgUsage: totalUsage / docIds.length,
        oldestDays: (now - oldest) / (1000 * 60 * 60 * 24),
        newestDays: (now - newest) / (1000 * 60 * 60 * 24),
      });
    }

    return stats;
  }

  /**
   * Get summary of knowledge distribution
   */
  getSummary(db: PanyaDatabase): {
    total: number;
    distribution: Record<string, number>;
    avgConfidence: number;
    readyForPromotion: number;
  } {
    const stats = this.getLevelStats(db);
    const total = stats.reduce((sum, s) => sum + s.count, 0);

    const distribution: Record<string, number> = {
      'L1 Raw': stats[0]?.count ?? 0,
      'L2 Extracted': stats[1]?.count ?? 0,
      'L3 Synthesized': stats[2]?.count ?? 0,
      'L4 Core': stats[3]?.count ?? 0,
    };

    const totalConfidence = stats.reduce((sum, s) => sum + s.avgConfidence * s.count, 0);
    const avgConfidence = total > 0 ? totalConfidence / total : 0;

    const candidates = this.findPromotionCandidates(db, 1000);

    return {
      total,
      distribution,
      avgConfidence,
      readyForPromotion: candidates.length,
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default KnowledgeLevelManager;
