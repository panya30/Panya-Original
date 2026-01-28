/**
 * Learning Loop
 *
 * The orchestrator that ties everything together:
 *
 * OBSERVE     → Watch conversations, file changes, searches
 *     ↓
 * EXTRACT     → Entities, insights, relationships
 *     ↓
 * SYNTHESIZE  → Detect patterns, merge related docs
 *     ↓
 * PROMOTE     → Move high-confidence to higher levels
 *     ↓
 * CORRECT     → Resolve conflicts, supersede outdated
 *     ↓
 * DECAY       → Reduce relevance of unused knowledge
 *     ↓
 * (loop)
 *
 * Can run:
 * - Once (manual trigger)
 * - Continuously (auto-loop with interval)
 */

import type { PanyaDatabase, Observation, ProcessingStage } from '../brain/database';
import { KnowledgeLevelManager, type PromotionCandidate } from './knowledge-level-manager';
import { PatternDetector, type DetectionResult } from './pattern-detector';
import { Synthesizer, type SynthesisResult } from './synthesizer';
import { IdentityGuardian } from './identity-guardian';
import { AutoLearnSkill } from './auto-learn';
import { EntityExtractor } from '../brain/entities';

// ============================================================================
// Types
// ============================================================================

export interface LearningLoopConfig {
  autoLoopIntervalMs?: number;
  maxObservationsPerCycle?: number;
  maxPromotionsPerCycle?: number;
  maxSynthesesPerCycle?: number;
  enableDecay?: boolean;
  enablePatternDetection?: boolean;
  enableAutoConflictResolution?: boolean;
}

export type LoopStage = 'idle' | 'observing' | 'extracting' | 'synthesizing' | 'promoting' | 'correcting' | 'decaying' | 'completed' | 'error';

export interface LoopStatus {
  stage: LoopStage;
  isRunning: boolean;
  lastRunAt?: number;
  lastRunDurationMs?: number;
  cycleCount: number;
  error?: string;
}

export interface LoopResult {
  success: boolean;
  durationMs: number;
  stages: {
    observe: { processed: number; created: number };
    extract: { entities: number; insights: number };
    synthesize: { patterns: number; merged: number };
    promote: { promoted: number; failed: number };
    correct: { conflicts: number; resolved: number };
    decay: { processed: number; decayed: number };
  };
  errors: string[];
}

// ============================================================================
// Learning Loop
// ============================================================================

export class LearningLoop {
  private config: Required<LearningLoopConfig>;
  private status: LoopStatus;
  private autoLoopTimer: ReturnType<typeof setInterval> | null = null;

  // Sub-systems
  private levelManager: KnowledgeLevelManager;
  private patternDetector: PatternDetector;
  private synthesizer: Synthesizer;
  private identityGuardian: IdentityGuardian;
  private autoLearn: AutoLearnSkill;
  private entityExtractor: EntityExtractor;

  constructor(config?: LearningLoopConfig) {
    this.config = {
      autoLoopIntervalMs: config?.autoLoopIntervalMs ?? 3600000, // 1 hour
      maxObservationsPerCycle: config?.maxObservationsPerCycle ?? 50,
      maxPromotionsPerCycle: config?.maxPromotionsPerCycle ?? 20,
      maxSynthesesPerCycle: config?.maxSynthesesPerCycle ?? 10,
      enableDecay: config?.enableDecay ?? true,
      enablePatternDetection: config?.enablePatternDetection ?? true,
      enableAutoConflictResolution: config?.enableAutoConflictResolution ?? true,
    };

    this.status = {
      stage: 'idle',
      isRunning: false,
      cycleCount: 0,
    };

    // Initialize sub-systems
    this.levelManager = new KnowledgeLevelManager();
    this.patternDetector = new PatternDetector();
    this.synthesizer = new Synthesizer();
    this.identityGuardian = new IdentityGuardian();
    this.autoLearn = new AutoLearnSkill();
    this.entityExtractor = new EntityExtractor();
  }

  // ==========================================================================
  // Main Loop
  // ==========================================================================

  /**
   * Run one complete learning cycle
   */
  async runOnce(db: PanyaDatabase): Promise<LoopResult> {
    if (this.status.isRunning) {
      return {
        success: false,
        durationMs: 0,
        stages: this.emptyStages(),
        errors: ['Loop is already running'],
      };
    }

    const startTime = Date.now();
    this.status.isRunning = true;
    const errors: string[] = [];

    const result: LoopResult = {
      success: true,
      durationMs: 0,
      stages: this.emptyStages(),
      errors,
    };

    try {
      // Stage 1: OBSERVE
      this.status.stage = 'observing';
      const observeResult = await this.stageObserve(db);
      result.stages.observe = observeResult;

      // Stage 2: EXTRACT
      this.status.stage = 'extracting';
      const extractResult = await this.stageExtract(db);
      result.stages.extract = extractResult;

      // Stage 3: SYNTHESIZE
      this.status.stage = 'synthesizing';
      const synthesizeResult = await this.stageSynthesize(db);
      result.stages.synthesize = synthesizeResult;

      // Stage 4: PROMOTE
      this.status.stage = 'promoting';
      const promoteResult = await this.stagePromote(db);
      result.stages.promote = promoteResult;

      // Stage 5: CORRECT
      this.status.stage = 'correcting';
      const correctResult = await this.stageCorrect(db);
      result.stages.correct = correctResult;

      // Stage 6: DECAY
      this.status.stage = 'decaying';
      const decayResult = await this.stageDecay(db);
      result.stages.decay = decayResult;

      this.status.stage = 'completed';
    } catch (error) {
      this.status.stage = 'error';
      this.status.error = error instanceof Error ? error.message : String(error);
      result.success = false;
      errors.push(this.status.error);
    }

    const endTime = Date.now();
    result.durationMs = endTime - startTime;

    this.status.isRunning = false;
    this.status.lastRunAt = endTime;
    this.status.lastRunDurationMs = result.durationMs;
    this.status.cycleCount++;
    this.status.stage = 'idle';

    return result;
  }

  private emptyStages() {
    return {
      observe: { processed: 0, created: 0 },
      extract: { entities: 0, insights: 0 },
      synthesize: { patterns: 0, merged: 0 },
      promote: { promoted: 0, failed: 0 },
      correct: { conflicts: 0, resolved: 0 },
      decay: { processed: 0, decayed: 0 },
    };
  }

  // ==========================================================================
  // Stage 1: OBSERVE
  // ==========================================================================

  /**
   * Process unprocessed observations
   */
  private async stageObserve(db: PanyaDatabase): Promise<{ processed: number; created: number }> {
    const observations = db.getUnprocessedObservations(this.config.maxObservationsPerCycle);
    let processed = 0;
    let created = 0;

    for (const obs of observations) {
      try {
        db.updateObservationStage(obs.id, 'extracting');

        // Create a document from the observation
        const docId = `obs-${obs.id}-${Date.now()}`;

        db.insertDocument({
          id: docId,
          type: obs.observationType,
          sourceFile: `observation:${obs.id}`,
          content: obs.content,
          concepts: [],
        });

        // Initialize at L1 (Raw)
        this.levelManager.initializeDocument(db, docId, 0.5);

        db.updateObservationStage(obs.id, 'extracted', [docId]);
        processed++;
        created++;
      } catch (error) {
        db.updateObservationStage(obs.id, 'failed');
      }
    }

    return { processed, created };
  }

  // ==========================================================================
  // Stage 2: EXTRACT
  // ==========================================================================

  /**
   * Extract entities and insights from L1 documents
   */
  private async stageExtract(db: PanyaDatabase): Promise<{ entities: number; insights: number }> {
    const l1Docs = db.getDocumentsByLevel(1, 100);
    let totalEntities = 0;
    let totalInsights = 0;

    for (const docId of l1Docs) {
      const doc = db.getDocument(docId);
      if (!doc || !doc.content) continue;

      try {
        // Extract entities
        const extractResult = await this.entityExtractor.extract(doc.content, { useLLM: false });

        for (const entity of extractResult.entities) {
          db.upsertEntity({
            id: `${entity.type}-${entity.normalizedName}`,
            name: entity.name,
            type: entity.type as any,
            normalizedName: entity.normalizedName,
          });
          totalEntities++;
        }

        // Update document concepts with extracted entities
        const concepts = extractResult.entities.map(e => e.normalizedName);
        if (concepts.length > 0) {
          // Get the current document and update its concepts
          const currentDoc = db.getDocument(docId);
          if (currentDoc) {
            const mergedConcepts = [...new Set([...(currentDoc.concepts || []), ...concepts])];
            // Update knowledge level confidence based on extraction
            const levelData = db.getKnowledgeLevel(docId);
            if (levelData) {
              const newConfidence = Math.min(1, levelData.confidence + 0.1 * concepts.length);
              this.levelManager.setLevel(db, docId, levelData.level, newConfidence);
            }
          }
        }
      } catch (error) {
        // Log error but continue
      }
    }

    return { entities: totalEntities, insights: totalInsights };
  }

  // ==========================================================================
  // Stage 3: SYNTHESIZE
  // ==========================================================================

  /**
   * Detect patterns and apply synthesis
   */
  private async stageSynthesize(db: PanyaDatabase): Promise<{ patterns: number; merged: number }> {
    if (!this.config.enablePatternDetection) {
      return { patterns: 0, merged: 0 };
    }

    // Detect new patterns
    const detectionResult = this.patternDetector.detectAll(db);
    let merged = 0;

    // Apply validated patterns
    const validatedPatterns = this.patternDetector.getValidatedPatterns(db);

    for (const pattern of validatedPatterns.slice(0, this.config.maxSynthesesPerCycle)) {
      const result = this.synthesizer.applyPattern(db, pattern);
      if (result.success) {
        this.patternDetector.markAsApplied(db, pattern.id);
        merged++;
      }
    }

    return {
      patterns: detectionResult.stats.total,
      merged,
    };
  }

  // ==========================================================================
  // Stage 4: PROMOTE
  // ==========================================================================

  /**
   * Promote eligible documents to higher levels
   */
  private async stagePromote(db: PanyaDatabase): Promise<{ promoted: number; failed: number }> {
    const result = this.levelManager.batchPromote(db, this.config.maxPromotionsPerCycle);
    return {
      promoted: result.promoted.length,
      failed: result.failed.length,
    };
  }

  // ==========================================================================
  // Stage 5: CORRECT
  // ==========================================================================

  /**
   * Resolve conflicts and correct inconsistencies
   */
  private async stageCorrect(db: PanyaDatabase): Promise<{ conflicts: number; resolved: number }> {
    if (!this.config.enableAutoConflictResolution) {
      return { conflicts: 0, resolved: 0 };
    }

    const pendingConflicts = db.getConflicts('pending');
    const result = this.synthesizer.autoResolveConflicts(db, 10);

    return {
      conflicts: pendingConflicts.length,
      resolved: result.resolved,
    };
  }

  // ==========================================================================
  // Stage 6: DECAY
  // ==========================================================================

  /**
   * Apply decay to reduce relevance of unused knowledge
   */
  private async stageDecay(db: PanyaDatabase): Promise<{ processed: number; decayed: number }> {
    if (!this.config.enableDecay) {
      return { processed: 0, decayed: 0 };
    }

    const result = this.levelManager.batchDecay(db);
    return {
      processed: result.processed,
      decayed: result.decayed.length,
    };
  }

  // ==========================================================================
  // Auto Loop Control
  // ==========================================================================

  /**
   * Start automatic learning loop
   */
  startAutoLoop(db: PanyaDatabase): { success: boolean; intervalMs: number } {
    if (this.autoLoopTimer) {
      return { success: false, intervalMs: this.config.autoLoopIntervalMs };
    }

    this.autoLoopTimer = setInterval(async () => {
      await this.runOnce(db);
    }, this.config.autoLoopIntervalMs);

    // Run immediately
    this.runOnce(db);

    return { success: true, intervalMs: this.config.autoLoopIntervalMs };
  }

  /**
   * Stop automatic learning loop
   */
  stopAutoLoop(): { success: boolean; wasStopped: boolean } {
    if (!this.autoLoopTimer) {
      return { success: true, wasStopped: false };
    }

    clearInterval(this.autoLoopTimer);
    this.autoLoopTimer = null;

    return { success: true, wasStopped: true };
  }

  /**
   * Check if auto loop is running
   */
  isAutoLoopRunning(): boolean {
    return this.autoLoopTimer !== null;
  }

  // ==========================================================================
  // Status & Stats
  // ==========================================================================

  /**
   * Get current loop status
   */
  getStatus(): LoopStatus {
    return { ...this.status };
  }

  /**
   * Get comprehensive learning stats
   */
  getStats(db: PanyaDatabase): {
    loop: LoopStatus;
    levels: ReturnType<KnowledgeLevelManager['getSummary']>;
    ontology: ReturnType<PanyaDatabase['getOntologyStats']>;
    autoLoop: { running: boolean; intervalMs: number };
  } {
    return {
      loop: this.getStatus(),
      levels: this.levelManager.getSummary(db),
      ontology: db.getOntologyStats(),
      autoLoop: {
        running: this.isAutoLoopRunning(),
        intervalMs: this.config.autoLoopIntervalMs,
      },
    };
  }

  // ==========================================================================
  // Manual Operations
  // ==========================================================================

  /**
   * Add an observation for the learning loop to process
   */
  addObservation(
    db: PanyaDatabase,
    content: string,
    type: 'conversation' | 'file_change' | 'search' | 'feedback' | 'external',
    sourceId?: string,
    metadata?: Record<string, any>
  ): number {
    return db.saveObservation({
      observationType: type,
      content,
      sourceId,
      metadata,
      processed: false,
      processingStage: 'raw',
    });
  }

  /**
   * Force promote a specific document
   */
  forcePromote(db: PanyaDatabase, documentId: string): { success: boolean; newLevel?: number; error?: string } {
    return this.levelManager.promote(db, documentId);
  }

  /**
   * Force decay on all documents
   */
  forceDecay(db: PanyaDatabase): { processed: number; decayed: number } {
    const result = this.levelManager.batchDecay(db);
    return {
      processed: result.processed,
      decayed: result.decayed.length,
    };
  }

  /**
   * Manually trigger pattern detection
   */
  detectPatterns(db: PanyaDatabase): DetectionResult {
    return this.patternDetector.detectAll(db);
  }

  /**
   * Validate a detected pattern
   */
  validatePattern(db: PanyaDatabase, patternId: number, valid: boolean): void {
    this.patternDetector.validatePattern(db, patternId, valid);
  }
}

// ============================================================================
// Export
// ============================================================================

export default LearningLoop;
