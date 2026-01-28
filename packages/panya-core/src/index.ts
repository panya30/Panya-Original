/**
 * Panya Core
 *
 * Independent AI Brain Library
 * Brain + Skills + Identity
 *
 * @example
 * ```typescript
 * import { Panya } from '@panya/core';
 *
 * const panya = new Panya();
 * await panya.initialize();
 *
 * // Use brain
 * panya.brain.insertDocument({ ... });
 *
 * // Use skills
 * const learnings = await panya.skills.autoLearn.extractFromConversation(messages);
 *
 * // Get identity
 * console.log(panya.identity.name); // "Robin"
 * ```
 */

// Core exports
export {
  PanyaDatabase,
  type PanyaConfig,
  type Document,
  type Entity,
  type Relationship,
  type TemporalData,
  // Ontology types
  type KnowledgeLevel,
  type EntityType,
  type RelationshipType,
  type KnowledgeLevelData,
  type PromotionRule,
  type DecayRule,
  type PatternType,
  type PatternStatus,
  type DetectedPattern,
  type ConflictResolution,
  type KnowledgeConflict,
  type SynthesisType,
  type SynthesisHistory,
  type IdentityFacet,
  type RelationshipMemory,
  type ObservationType,
  type ProcessingStage,
  type Observation,
} from './brain/database';
export { EntityExtractor, type ExtractedEntity, type ExtractionResult, type EntityExtractorConfig } from './brain/entities';
export { AutoLearnSkill, type Learning, type Message, type ExtractionResult as AutoLearnResult, type AutoLearnConfig } from './skills/auto-learn';
export {
  ContextRadarSkill,
  type ProjectContext,
  type FileContext,
  type TimeContext,
  type SessionContext,
  type FullContext,
  type ActivityEntry,
  type ContextPattern,
  type ContextRadarConfig
} from './skills/context-radar';
export {
  KnowledgeConnectorSkill,
  type Connection,
  type ConnectionType,
  type KnowledgeNode,
  type KnowledgeGraph,
  type SuggestionResult,
  type KnowledgeConnectorConfig
} from './skills/knowledge-connector';

// Self-Learning Ontology Skills
export {
  KnowledgeLevelManager,
  type KnowledgeLevelManagerConfig,
  type PromotionCandidate,
  type DecayResult,
  type LevelStats,
} from './skills/knowledge-level-manager';
export {
  PatternDetector,
  type PatternDetectorConfig,
  type CoOccurrenceResult,
  type TemporalPattern,
  type SemanticCluster,
  type ContradictionResult,
  type EvolutionChain,
  type DetectionResult,
} from './skills/pattern-detector';
export {
  Synthesizer,
  type SynthesizerConfig,
  type MergeOptions,
  type DistillOptions,
  type SynthesisResult,
  type ConflictResolutionResult,
} from './skills/synthesizer';
export {
  IdentityGuardian,
  type IdentityGuardianConfig,
  type FacetType,
  type FacetUpdate,
  type IdentitySnapshot,
  type ValidationRequest,
  ROBIN_DEFAULT_FACETS,
} from './skills/identity-guardian';
export {
  LearningLoop,
  type LearningLoopConfig,
  type LoopStage,
  type LoopStatus,
  type LoopResult,
} from './skills/learning-loop';

export { type PanyaIdentity, ROBIN_IDENTITY } from './identity';

// Re-export modules for tree-shaking
export * as brain from './brain';
export * as skills from './skills';
export * as identity from './identity';

// ============================================================================
// Main Panya Class (Convenience Wrapper)
// ============================================================================

import { PanyaDatabase, type PanyaConfig } from './brain/database';
import { EntityExtractor } from './brain/entities';
import { AutoLearnSkill, type AutoLearnConfig } from './skills/auto-learn';
import { ContextRadarSkill, type ContextRadarConfig } from './skills/context-radar';
import { KnowledgeConnectorSkill, type KnowledgeConnectorConfig } from './skills/knowledge-connector';
import { KnowledgeLevelManager, type KnowledgeLevelManagerConfig } from './skills/knowledge-level-manager';
import { PatternDetector, type PatternDetectorConfig } from './skills/pattern-detector';
import { Synthesizer, type SynthesizerConfig } from './skills/synthesizer';
import { IdentityGuardian, type IdentityGuardianConfig } from './skills/identity-guardian';
import { LearningLoop, type LearningLoopConfig } from './skills/learning-loop';
import { type PanyaIdentity, ROBIN_IDENTITY } from './identity';

export interface PanyaOptions {
  database?: PanyaConfig;
  autoLearn?: Partial<AutoLearnConfig>;
  contextRadar?: Partial<ContextRadarConfig>;
  knowledgeConnector?: Partial<KnowledgeConnectorConfig>;
  knowledgeLevel?: Partial<KnowledgeLevelManagerConfig>;
  patternDetector?: Partial<PatternDetectorConfig>;
  synthesizer?: Partial<SynthesizerConfig>;
  identityGuardian?: Partial<IdentityGuardianConfig>;
  learningLoop?: Partial<LearningLoopConfig>;
  identity?: PanyaIdentity;
}

export class Panya {
  public brain: PanyaDatabase;
  public entityExtractor: EntityExtractor;
  public skills: {
    autoLearn: AutoLearnSkill;
    contextRadar: ContextRadarSkill;
    knowledgeConnector: KnowledgeConnectorSkill;
    // Self-learning ontology skills
    knowledgeLevel: KnowledgeLevelManager;
    patternDetector: PatternDetector;
    synthesizer: Synthesizer;
    identityGuardian: IdentityGuardian;
    learningLoop: LearningLoop;
  };
  public identity: PanyaIdentity;

  private initialized: boolean = false;

  constructor(options?: PanyaOptions) {
    this.brain = new PanyaDatabase(options?.database);
    this.entityExtractor = new EntityExtractor();
    this.skills = {
      autoLearn: new AutoLearnSkill(options?.autoLearn),
      contextRadar: new ContextRadarSkill(options?.contextRadar),
      knowledgeConnector: new KnowledgeConnectorSkill(options?.knowledgeConnector),
      // Self-learning ontology skills
      knowledgeLevel: new KnowledgeLevelManager(options?.knowledgeLevel),
      patternDetector: new PatternDetector(options?.patternDetector),
      synthesizer: new Synthesizer(options?.synthesizer),
      identityGuardian: new IdentityGuardian(options?.identityGuardian),
      learningLoop: new LearningLoop(options?.learningLoop),
    };
    this.identity = options?.identity || ROBIN_IDENTITY;
  }

  /**
   * Initialize Panya (creates database tables)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.brain.initialize();
    this.initialized = true;
  }

  /**
   * Extract and save learnings from a conversation
   */
  async learn(messages: { role: 'user' | 'assistant'; content: string }[], context?: string): Promise<number[]> {
    const result = await this.skills.autoLearn.extractFromConversation(messages, context);
    if (result.learnings.length > 0) {
      return this.skills.autoLearn.saveLearnings(this.brain, result.learnings);
    }
    return [];
  }

  /**
   * Search the brain
   */
  search(query: string, limit?: number) {
    return this.brain.searchFTS(query, limit);
  }

  /**
   * Get brain stats
   */
  stats() {
    return this.brain.getStats();
  }

  /**
   * Get current context (where am I?)
   */
  context() {
    return this.skills.contextRadar.getFullContext();
  }

  /**
   * Get context summary (for prompts)
   */
  contextSummary() {
    return this.skills.contextRadar.getSummary();
  }

  /**
   * Set current project context
   */
  setProject(path: string) {
    this.skills.contextRadar.setProject(path);
  }

  /**
   * Set current file context
   */
  setFile(path: string) {
    this.skills.contextRadar.setFile(path);
  }

  /**
   * Log activity
   */
  logActivity(type: 'file_access' | 'tool_use' | 'message' | 'search' | 'learning', detail: string) {
    this.skills.contextRadar.logActivity(type, detail);
  }

  /**
   * Find connections for a document
   */
  findConnections(documentId: string) {
    return this.skills.knowledgeConnector.findConnections(this.brain, documentId);
  }

  /**
   * Get related content suggestions
   */
  getSuggestions(documentId: string) {
    return this.skills.knowledgeConnector.getSuggestions(this.brain, documentId);
  }

  /**
   * Build knowledge graph
   */
  buildGraph() {
    return this.skills.knowledgeConnector.buildGraph(this.brain);
  }

  /**
   * Auto-connect a document to related content
   */
  autoConnect(documentId: string, minStrength?: number) {
    return this.skills.knowledgeConnector.autoConnect(this.brain, documentId, minStrength);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.brain.close();
  }
}

// Default export
export default Panya;
