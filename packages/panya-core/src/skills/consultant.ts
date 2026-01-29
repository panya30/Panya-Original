/**
 * Consultant Skill
 *
 * Provides principle-based guidance for decisions.
 * Uses L4 Core documents as the wisdom base.
 *
 * Features:
 * - consult() - Get guidance based on principles
 * - reflect() - Get random wisdom for alignment
 */

import type { PanyaDatabase, Document, KnowledgeLevelData } from '../brain/database';

// ============================================================================
// Types
// ============================================================================

export interface ConsultantConfig {
  maxPrinciples?: number;
  maxPatterns?: number;
  minConfidence?: number;
}

export interface ConsultResult {
  guidance: string;
  principles: Document[];
  patterns: Document[];
  relatedDecisions: Array<{
    id: string;
    title: string;
    decision?: string;
    rationale?: string;
  }>;
  confidence: number;
}

export interface ReflectResult {
  principle: Document | null;
  relatedDocs: Document[];
  insight: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<ConsultantConfig> = {
  maxPrinciples: 5,
  maxPatterns: 5,
  minConfidence: 0.5,
};

// ============================================================================
// Consultant Skill
// ============================================================================

export class Consultant {
  private config: Required<ConsultantConfig>;

  constructor(config?: ConsultantConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get guidance for a decision based on principles and patterns
   */
  async consult(
    db: PanyaDatabase,
    decision: string,
    context?: string
  ): Promise<ConsultResult> {
    // 1. Search for relevant L4 Core principles
    const principles = this.findRelevantPrinciples(db, decision, context);

    // 2. Search for related patterns/learnings
    const patterns = this.findRelevantPatterns(db, decision, context);

    // 3. Find related past decisions
    const relatedDecisions = this.findRelatedDecisions(db, decision);

    // 4. Synthesize guidance
    const guidance = this.synthesizeGuidance(decision, context, principles, patterns, relatedDecisions);

    // 5. Calculate confidence based on how much relevant knowledge we found
    const confidence = this.calculateConfidence(principles, patterns, relatedDecisions);

    return {
      guidance,
      principles,
      patterns,
      relatedDecisions,
      confidence,
    };
  }

  /**
   * Get random principle for reflection/alignment
   */
  async reflect(db: PanyaDatabase): Promise<ReflectResult> {
    // Get random L4 principle
    const principle = db.getRandomPrinciple();

    if (!principle) {
      return {
        principle: null,
        relatedDocs: [],
        insight: 'No principles found. Add knowledge to build your wisdom base.',
      };
    }

    // Find related documents
    const relatedDocs = this.findRelatedDocs(db, principle);

    // Generate insight
    const insight = this.generateInsight(principle, relatedDocs);

    return {
      principle,
      relatedDocs,
      insight,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Find L4 Core principles relevant to the decision
   */
  private findRelevantPrinciples(
    db: PanyaDatabase,
    decision: string,
    context?: string
  ): Document[] {
    const searchQuery = context ? `${decision} ${context}` : decision;

    // Search FTS for relevant documents
    const ftsResults = db.searchFTS(searchQuery, this.config.maxPrinciples * 2);

    // Filter to only L4 or is_principle documents
    const principles: Document[] = [];
    for (const doc of ftsResults) {
      const levelData = db.getKnowledgeLevel(doc.id);
      if (levelData && levelData.level === 4) {
        principles.push(doc);
      }
      if (principles.length >= this.config.maxPrinciples) break;
    }

    // If not enough from FTS, get top principles by confidence
    if (principles.length < this.config.maxPrinciples) {
      const allPrinciples = db.getPrinciples(this.config.maxPrinciples);
      for (const p of allPrinciples) {
        if (!principles.find(x => x.id === p.id)) {
          principles.push(p);
        }
        if (principles.length >= this.config.maxPrinciples) break;
      }
    }

    return principles;
  }

  /**
   * Find patterns and learnings relevant to the decision
   */
  private findRelevantPatterns(
    db: PanyaDatabase,
    decision: string,
    context?: string
  ): Document[] {
    const searchQuery = context ? `${decision} ${context}` : decision;

    // Search FTS for relevant documents
    const ftsResults = db.searchFTS(searchQuery, this.config.maxPatterns * 3);

    // Filter to L2/L3 documents (extracted/synthesized patterns)
    const patterns: Document[] = [];
    for (const doc of ftsResults) {
      const levelData = db.getKnowledgeLevel(doc.id);
      if (levelData && (levelData.level === 2 || levelData.level === 3)) {
        if (levelData.confidence >= this.config.minConfidence) {
          patterns.push(doc);
        }
      }
      if (patterns.length >= this.config.maxPatterns) break;
    }

    return patterns;
  }

  /**
   * Find past decisions that might be relevant
   */
  private findRelatedDecisions(
    db: PanyaDatabase,
    decision: string
  ): Array<{ id: string; title: string; decision?: string; rationale?: string }> {
    // Get recent decided decisions
    const decisions = db.listDecisions({
      status: 'decided',
      limit: 20,
    });

    // Simple keyword matching for relevance
    const keywords = decision.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    const relevant = decisions
      .filter(d => {
        const titleLower = d.title.toLowerCase();
        const contextLower = (d.context || '').toLowerCase();
        return keywords.some(k => titleLower.includes(k) || contextLower.includes(k));
      })
      .slice(0, 5)
      .map(d => ({
        id: d.id,
        title: d.title,
        decision: d.decision,
        rationale: d.rationale,
      }));

    return relevant;
  }

  /**
   * Synthesize guidance from principles, patterns, and past decisions
   */
  private synthesizeGuidance(
    decision: string,
    context: string | undefined,
    principles: Document[],
    patterns: Document[],
    relatedDecisions: Array<{ id: string; title: string; decision?: string; rationale?: string }>
  ): string {
    const parts: string[] = [];

    parts.push(`## Guidance for: ${decision}`);
    if (context) {
      parts.push(`\nContext: ${context}`);
    }
    parts.push('');

    // Principles section
    if (principles.length > 0) {
      parts.push('### Relevant Principles');
      for (const p of principles) {
        const content = p.content?.slice(0, 200) || 'No content';
        parts.push(`- ${content}${p.content && p.content.length > 200 ? '...' : ''}`);
      }
      parts.push('');
    }

    // Patterns section
    if (patterns.length > 0) {
      parts.push('### Related Patterns');
      for (const p of patterns) {
        const content = p.content?.slice(0, 150) || 'No content';
        parts.push(`- ${content}${p.content && p.content.length > 150 ? '...' : ''}`);
      }
      parts.push('');
    }

    // Past decisions section
    if (relatedDecisions.length > 0) {
      parts.push('### Similar Past Decisions');
      for (const d of relatedDecisions) {
        parts.push(`- **${d.title}**`);
        if (d.decision) parts.push(`  Decision: ${d.decision}`);
        if (d.rationale) parts.push(`  Rationale: ${d.rationale.slice(0, 100)}${d.rationale.length > 100 ? '...' : ''}`);
      }
      parts.push('');
    }

    // Summary guidance
    parts.push('### Summary');
    if (principles.length === 0 && patterns.length === 0 && relatedDecisions.length === 0) {
      parts.push('No directly relevant knowledge found. Consider adding observations about this domain to build up the knowledge base.');
    } else {
      parts.push('Based on the above knowledge, consider these factors when making your decision.');
      if (principles.length > 0) {
        parts.push('The principles suggest foundational considerations to keep in mind.');
      }
      if (relatedDecisions.length > 0) {
        parts.push('Past decisions in similar areas may provide useful precedents.');
      }
    }

    return parts.join('\n');
  }

  /**
   * Calculate confidence based on available knowledge
   */
  private calculateConfidence(
    principles: Document[],
    patterns: Document[],
    relatedDecisions: Array<{ id: string; title: string }>
  ): number {
    let score = 0;

    // More principles = higher confidence
    score += Math.min(principles.length * 0.15, 0.45);

    // More patterns = higher confidence
    score += Math.min(patterns.length * 0.1, 0.3);

    // Past decisions = higher confidence
    score += Math.min(relatedDecisions.length * 0.05, 0.25);

    return Math.min(score, 1.0);
  }

  /**
   * Find documents related to a principle
   */
  private findRelatedDocs(db: PanyaDatabase, principle: Document): Document[] {
    // Extract keywords from principle
    const keywords = (principle.content || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 5);

    if (keywords.length === 0) {
      // Use tags if no keywords
      if (principle.tags.length > 0) {
        return db.searchFTS(principle.tags.join(' '), 3);
      }
      return [];
    }

    const results = db.searchFTS(keywords.join(' '), 5);

    // Filter out the principle itself
    return results.filter(d => d.id !== principle.id).slice(0, 3);
  }

  /**
   * Generate an insight from a principle
   */
  private generateInsight(principle: Document, relatedDocs: Document[]): string {
    const parts: string[] = [];

    parts.push('## Reflection');
    parts.push('');

    // The principle
    parts.push('### Principle');
    parts.push(principle.content || 'No content');
    parts.push('');

    // Tags as themes
    if (principle.tags.length > 0) {
      parts.push(`**Themes**: ${principle.tags.join(', ')}`);
      parts.push('');
    }

    // Related knowledge
    if (relatedDocs.length > 0) {
      parts.push('### Related Knowledge');
      for (const doc of relatedDocs) {
        const preview = doc.content?.slice(0, 100) || 'No content';
        parts.push(`- ${preview}${doc.content && doc.content.length > 100 ? '...' : ''}`);
      }
      parts.push('');
    }

    // Insight prompt
    parts.push('### Consider');
    parts.push('How does this principle apply to your current work? What decisions or actions might benefit from this wisdom?');

    return parts.join('\n');
  }
}

export default Consultant;
