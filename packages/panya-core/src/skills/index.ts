/**
 * Panya Skills Module
 *
 * 5 Fundamental Meta-Skills:
 * 1. auto-learn - Self-improving memory ✓
 * 2. context-radar - Always knows where you are ✓
 * 3. knowledge-connector - Finds hidden relationships ✓
 * 4. anticipator - Predicts what you need (TODO)
 * 5. skill-generator - Creates new skills automatically (TODO)
 *
 * Self-Learning Ontology Skills:
 * 6. knowledge-level-manager - 4-level hierarchy management ✓
 * 7. pattern-detector - Finds patterns in knowledge ✓
 * 8. synthesizer - Merges and distills knowledge ✓
 * 9. identity-guardian - Protects Robin's identity ✓
 * 10. learning-loop - Orchestrates the learning cycle ✓
 */

export { AutoLearnSkill, type Learning, type Message, type ExtractionResult as AutoLearnResult, type AutoLearnConfig } from './auto-learn';
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
} from './context-radar';
export {
  KnowledgeConnectorSkill,
  type Connection,
  type ConnectionType,
  type KnowledgeNode,
  type KnowledgeGraph,
  type SuggestionResult,
  type KnowledgeConnectorConfig
} from './knowledge-connector';

// Self-Learning Ontology Skills
export {
  KnowledgeLevelManager,
  type KnowledgeLevelManagerConfig,
  type PromotionCandidate,
  type DecayResult,
  type LevelStats
} from './knowledge-level-manager';

export {
  PatternDetector,
  type PatternDetectorConfig,
  type CoOccurrenceResult,
  type TemporalPattern,
  type SemanticCluster,
  type ContradictionResult,
  type EvolutionChain,
  type DetectionResult
} from './pattern-detector';

export {
  Synthesizer,
  type SynthesizerConfig,
  type MergeOptions,
  type DistillOptions,
  type SynthesisResult,
  type ConflictResolutionResult
} from './synthesizer';

export {
  IdentityGuardian,
  type IdentityGuardianConfig,
  type FacetType,
  type FacetUpdate,
  type IdentitySnapshot,
  type ValidationRequest,
  ROBIN_DEFAULT_FACETS
} from './identity-guardian';

export {
  LearningLoop,
  type LearningLoopConfig,
  type LoopStage,
  type LoopStatus,
  type LoopResult
} from './learning-loop';
