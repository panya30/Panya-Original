/**
 * Panya Entity Extractor
 *
 * Extracts named entities from text using hybrid approach:
 * - Rules-based for known entities (fast)
 * - LLM-based for unknown entities (accurate)
 */

import type { PanyaDatabase, Entity } from './database';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedEntity {
  name: string;
  type: Entity['type'];
  normalizedName?: string;
  context?: string;
  position?: number;
  confidence: number;
  extractedBy: 'rules' | 'llm' | 'manual';
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  processingTime: number;
  method: 'rules' | 'llm' | 'hybrid';
}

export interface EntityExtractorConfig {
  knownEntities?: Record<string, Omit<ExtractedEntity, 'context' | 'position' | 'confidence' | 'extractedBy'>>;
  llmExtractor?: (text: string) => Promise<ExtractedEntity[]>;
}

// ============================================================================
// Default Known Entities
// ============================================================================

const DEFAULT_KNOWN_ENTITIES: Record<string, Omit<ExtractedEntity, 'context' | 'position' | 'confidence' | 'extractedBy'>> = {
  'modz': { name: 'Modz', type: 'person', normalizedName: 'modz' },
  'the architect': { name: 'Modz', type: 'person', normalizedName: 'modz' },
  'robin': { name: 'Robin', type: 'person', normalizedName: 'robin' },
  'the alpha': { name: 'Robin', type: 'person', normalizedName: 'robin' },
  'panya': { name: 'Panya', type: 'organization', normalizedName: 'panya' },
  'panya original': { name: 'Panya Original', type: 'organization', normalizedName: 'panya-original' },
};

// Patterns for dynamic extraction
const PATTERNS = {
  date: /\b(\d{4}-\d{2}-\d{2})\b/g,
  time: /\b(today|yesterday|tomorrow|last week|next week|this month|last month)\b/gi,
  phase: /\b(phase\s*\d+|version\s*[\d.]+|v[\d.]+)\b/gi,
};

// ============================================================================
// Entity Extractor Class
// ============================================================================

export class EntityExtractor {
  private config: EntityExtractorConfig;

  constructor(config?: EntityExtractorConfig) {
    this.config = {
      knownEntities: { ...DEFAULT_KNOWN_ENTITIES, ...config?.knownEntities },
      llmExtractor: config?.llmExtractor,
    };
  }

  /**
   * Add custom known entities
   */
  addKnownEntity(
    pattern: string,
    entity: Omit<ExtractedEntity, 'context' | 'position' | 'confidence' | 'extractedBy'>
  ): void {
    this.config.knownEntities![pattern.toLowerCase()] = entity;
  }

  /**
   * Extract entities using rules only (fast)
   */
  extractWithRules(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Extract known entities
    for (const [pattern, entity] of Object.entries(this.config.knownEntities!)) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      let match;

      while ((match = regex.exec(text)) !== null) {
        entities.push({
          ...entity,
          context: this.getContext(text, match.index, 50),
          position: match.index,
          confidence: 1.0,
          extractedBy: 'rules',
        });
      }
    }

    // Extract dates
    let dateMatch;
    while ((dateMatch = PATTERNS.date.exec(text)) !== null) {
      entities.push({
        name: dateMatch[1],
        type: 'time',
        normalizedName: dateMatch[1],
        context: this.getContext(text, dateMatch.index, 50),
        position: dateMatch.index,
        confidence: 1.0,
        extractedBy: 'rules',
      });
    }

    // Extract time expressions
    let timeMatch;
    while ((timeMatch = PATTERNS.time.exec(text)) !== null) {
      entities.push({
        name: timeMatch[1],
        type: 'time',
        normalizedName: timeMatch[1].toLowerCase().replace(/\s+/g, '-'),
        context: this.getContext(text, timeMatch.index, 50),
        position: timeMatch.index,
        confidence: 0.9,
        extractedBy: 'rules',
      });
    }

    // Extract phases
    let phaseMatch;
    while ((phaseMatch = PATTERNS.phase.exec(text)) !== null) {
      entities.push({
        name: phaseMatch[1],
        type: 'event',
        normalizedName: phaseMatch[1].toLowerCase().replace(/\s+/g, '-'),
        context: this.getContext(text, phaseMatch.index, 50),
        position: phaseMatch.index,
        confidence: 0.95,
        extractedBy: 'rules',
      });
    }

    return this.deduplicateEntities(entities);
  }

  /**
   * Extract entities using LLM (if configured)
   */
  async extractWithLLM(text: string): Promise<ExtractedEntity[]> {
    if (!this.config.llmExtractor) {
      return [];
    }
    return this.config.llmExtractor(text);
  }

  /**
   * Hybrid extraction: rules first, then LLM
   */
  async extract(text: string, options?: { useLLM?: boolean }): Promise<ExtractionResult> {
    const startTime = Date.now();
    const useLLM = options?.useLLM ?? !!this.config.llmExtractor;

    // Always start with rules (fast)
    const rulesEntities = this.extractWithRules(text);

    // If LLM enabled and text is substantial
    if (useLLM && text.length > 200 && this.config.llmExtractor) {
      const llmEntities = await this.extractWithLLM(text);
      const merged = this.mergeEntities(rulesEntities, llmEntities);

      return {
        entities: merged,
        processingTime: Date.now() - startTime,
        method: 'hybrid',
      };
    }

    return {
      entities: rulesEntities,
      processingTime: Date.now() - startTime,
      method: 'rules',
    };
  }

  /**
   * Save entities to database
   */
  saveToDatabase(db: PanyaDatabase, documentId: string, entities: ExtractedEntity[]): void {
    for (const entity of entities) {
      const entityId = `entity_${entity.normalizedName || entity.name.toLowerCase().replace(/\s+/g, '-')}`;

      db.upsertEntity({
        id: entityId,
        name: entity.name,
        type: entity.type,
        normalizedName: entity.normalizedName,
      });
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private getContext(text: string, position: number, radius: number): string {
    const start = Math.max(0, position - radius);
    const end = Math.min(text.length, position + radius);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Map<string, ExtractedEntity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.normalizedName || entity.name.toLowerCase()}`;
      const existing = seen.get(key);

      if (!existing || entity.confidence > existing.confidence) {
        seen.set(key, entity);
      }
    }

    return Array.from(seen.values());
  }

  private mergeEntities(rules: ExtractedEntity[], llm: ExtractedEntity[]): ExtractedEntity[] {
    const merged = new Map<string, ExtractedEntity>();

    for (const entity of rules) {
      const key = `${entity.type}:${entity.normalizedName || entity.name.toLowerCase()}`;
      merged.set(key, entity);
    }

    for (const entity of llm) {
      const key = `${entity.type}:${entity.normalizedName || entity.name.toLowerCase()}`;
      if (!merged.has(key)) {
        merged.set(key, entity);
      }
    }

    return Array.from(merged.values());
  }
}
