/**
 * Auto-Learn Skill
 *
 * The meta-skill that makes Panya's memory improve itself.
 * Extracts learnings from conversations automatically.
 */

import type { PanyaDatabase } from '../brain/database';
import { EntityExtractor, type ExtractedEntity } from '../brain/entities';

// ============================================================================
// Types
// ============================================================================

export interface Learning {
  type: 'fact' | 'preference' | 'decision' | 'pattern' | 'insight';
  content: string;
  confidence: number;
  importance: number;
  source: {
    type: 'conversation' | 'file' | 'observation';
    timestamp: string;
    context: string;
  };
  entities: string[];
  relatedTo: string[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExtractionResult {
  learnings: Learning[];
  processingTime: number;
  savedCount: number;
  skippedCount: number;
}

export interface AutoLearnConfig {
  minConfidence: number;
  minImportance: number;
  maxLearningsPerSession: number;
  llmExtractor?: (conversationText: string, context?: string) => Promise<Learning[]>;
  entityLlmExtractor?: (text: string) => Promise<ExtractedEntity[]>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AutoLearnConfig = {
  minConfidence: 0.6,
  minImportance: 0.4,
  maxLearningsPerSession: 10,
};

// ============================================================================
// Auto-Learn Skill Class
// ============================================================================

export class AutoLearnSkill {
  private config: AutoLearnConfig;
  private entityExtractor: EntityExtractor;

  constructor(config?: Partial<AutoLearnConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.entityExtractor = new EntityExtractor({
      llmExtractor: config?.entityLlmExtractor,
    });
  }

  /**
   * Extract learnings from a conversation
   */
  async extractFromConversation(
    messages: Message[],
    context?: string
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    // Skip if conversation too short
    if (messages.length < 3) {
      return {
        learnings: [],
        processingTime: Date.now() - startTime,
        savedCount: 0,
        skippedCount: 0,
      };
    }

    // Format conversation
    const conversationText = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    // Extract learnings
    let learnings: Learning[];
    if (this.config.llmExtractor) {
      learnings = await this.config.llmExtractor(conversationText, context);
    } else {
      learnings = this.extractWithRules(conversationText, context);
    }

    // Filter by quality
    const qualityLearnings = learnings.filter(
      l => l.confidence >= this.config.minConfidence && l.importance >= this.config.minImportance
    );

    // Extract entities for each learning
    for (const learning of qualityLearnings) {
      const result = await this.entityExtractor.extract(learning.content, { useLLM: true });
      learning.entities = result.entities.map(e => e.name);
    }

    return {
      learnings: qualityLearnings,
      processingTime: Date.now() - startTime,
      savedCount: qualityLearnings.length,
      skippedCount: learnings.length - qualityLearnings.length,
    };
  }

  /**
   * Save learnings to database
   */
  saveLearnings(db: PanyaDatabase, learnings: Learning[]): number[] {
    const ids: number[] = [];

    for (const learning of learnings) {
      const id = db.saveInsight({
        type: learning.type,
        content: learning.content,
        confidence: learning.confidence,
        sessionId: learning.source.context,
        entities: learning.entities,
      });
      ids.push(id);
    }

    return ids;
  }

  /**
   * Rule-based extraction (fallback)
   */
  private extractWithRules(text: string, context?: string): Learning[] {
    const learnings: Learning[] = [];
    const now = new Date().toISOString();

    // Decision patterns
    const decisionPatterns = [
      /(?:we\s+)?decided\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
      /let'?s\s+(?:go\s+with|use)\s+(.+?)(?:\.|$)/gi,
      /(?:chose|choosing)\s+(.+?)\s+(?:over|instead)/gi,
    ];

    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        learnings.push({
          type: 'decision',
          content: `Decision: ${match[1].trim()}`,
          confidence: 0.7,
          importance: 0.7,
          source: { type: 'conversation', timestamp: now, context: context || 'Rule-based' },
          entities: [],
          relatedTo: [],
        });
      }
    }

    // Preference patterns
    const preferencePatterns = [
      /i\s+prefer\s+(.+?)(?:\s+over|\s+to|\.|$)/gi,
      /i\s+(?:really\s+)?like\s+(.+?)(?:\.|$)/gi,
      /i\s+find\s+(.+?)\s+(?:better|easier|more)/gi,
    ];

    for (const pattern of preferencePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        learnings.push({
          type: 'preference',
          content: `Preference: ${match[1].trim()}`,
          confidence: 0.75,
          importance: 0.6,
          source: { type: 'conversation', timestamp: now, context: context || 'Rule-based' },
          entities: [],
          relatedTo: [],
        });
      }
    }

    // Routine patterns
    const routinePatterns = [
      /i\s+always\s+(.+?)(?:\.|$)/gi,
      /every\s+(?:morning|day|time)\s+(.+?)(?:\.|$)/gi,
    ];

    for (const pattern of routinePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        learnings.push({
          type: 'pattern',
          content: `Routine: ${match[1].trim()}`,
          confidence: 0.7,
          importance: 0.65,
          source: { type: 'conversation', timestamp: now, context: context || 'Rule-based' },
          entities: [],
          relatedTo: [],
        });
      }
    }

    // Deduplicate and limit
    const seen = new Set<string>();
    return learnings
      .filter(l => {
        const key = l.content.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, this.config.maxLearningsPerSession);
  }
}
