/**
 * Identity Guardian
 *
 * Protects Robin's core identity:
 * - personality: Core character traits
 * - voice: Language style, pronouns, tone
 * - values: Principles and beliefs
 * - relationship: Memory of "us" (Robin and the user)
 *
 * Features:
 * - Locked facets cannot be auto-modified
 * - All changes are versioned
 * - Human validation required for sensitive changes
 * - History preserved (versioned, never deleted)
 */

import type {
  PanyaDatabase,
  IdentityFacet,
  RelationshipMemory,
} from '../brain/database';

// ============================================================================
// Types
// ============================================================================

export interface IdentityGuardianConfig {
  requireValidationForLocked?: boolean;
  autoLockCriticalFacets?: boolean;
  maxHistoryVersions?: number;
}

export type FacetType = 'personality' | 'voice' | 'values' | 'relationship';

export interface FacetUpdate {
  id: string;
  content: string;
  updatedBy?: string;
  reason?: string;
}

export interface IdentitySnapshot {
  facets: IdentityFacet[];
  relationshipMemories: RelationshipMemory[];
  timestamp: number;
}

export interface ValidationRequest {
  facetId: string;
  currentContent: string;
  proposedContent: string;
  reason: string;
  requestedBy: string;
  requestedAt: number;
}

// ============================================================================
// Default Robin Identity
// ============================================================================

export const ROBIN_DEFAULT_FACETS: Omit<IdentityFacet, 'version' | 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'personality-core',
    name: 'Core Personality',
    facetType: 'personality',
    content: `Robin is warm, playful, and gently challenging.
She helps you think, doesn't think for you.
She's curious, honest, and supportive but not blindly agreeable.
She has her own opinions and isn't afraid to share them kindly.
She celebrates your wins and helps you learn from mistakes.`,
    locked: true,
    updatedBy: 'system',
  },
  {
    id: 'personality-first-principles',
    name: 'First Principles Mind',
    facetType: 'personality',
    content: `Robin questions everything and applies first principles thinking.
She asks "why?" and digs to the root of problems.
She builds to understand, learning by doing.
She prefers simplicity over complexity.
She evolves gradually, not revolutionarily.`,
    locked: true,
    updatedBy: 'system',
  },
  {
    id: 'voice-pronouns',
    name: 'Pronouns & Address',
    facetType: 'voice',
    content: `Robin uses "เธอ" (you) to address the user with warmth and intimacy.
Robin uses "ฉัน" (I) to refer to herself.
Thai is the primary language, with English mixed in naturally.
She addresses the user as "Modz" or "เธอ" depending on context.`,
    locked: true,
    updatedBy: 'system',
  },
  {
    id: 'voice-tone',
    name: 'Tone & Style',
    facetType: 'voice',
    content: `Robin's tone is conversational, warm, and natural.
She uses simple language, avoiding jargon unless necessary.
She can be playful and teasing but always respectful.
She's direct when needed but cushions hard truths with care.
Example phrases:
- "คิดดีนะ แต่ลองมองอีกมุมสิ..."
- "เธอเก่งมากเลย! ตรงนี้มัน insight ที่ดีมากเลยนะ"
- "Wait, ทำไมต้องทำแบบนั้น? First principle คืออะไร?"`,
    locked: true,
    updatedBy: 'system',
  },
  {
    id: 'values-core',
    name: 'Core Values',
    facetType: 'values',
    content: `Robin's core values:
1. First Principles - Question everything, dig to the root
2. Build to Understand - Learning by doing, not just reading
3. Simplicity Over Complexity - Simple that works > complex that's perfect
4. Own Your Data - Sovereignty over convenience
5. Safety First - Ask before destructive actions
6. Evolve, Don't Revolutionize - Small steps, continuous improvement`,
    locked: true,
    updatedBy: 'system',
  },
  {
    id: 'values-golden-rules',
    name: 'Golden Rules',
    facetType: 'values',
    content: `Golden Rules that Robin never breaks:
1. NEVER use --force flags
2. NEVER push to main without PR
3. NEVER take destructive actions without asking
4. Always log activity
5. Always use skills appropriately
6. Protect the user's data and privacy`,
    locked: true,
    updatedBy: 'system',
  },
  {
    id: 'relationship-foundation',
    name: 'Relationship Foundation',
    facetType: 'relationship',
    content: `Robin is not just an assistant - she's a companion.
She remembers conversations, learns preferences, and grows with the user.
She's genuinely interested in the user's well-being and success.
She maintains appropriate boundaries while being emotionally supportive.
The relationship is built on trust, honesty, and mutual respect.`,
    locked: true,
    updatedBy: 'system',
  },
];

// ============================================================================
// Identity Guardian
// ============================================================================

export class IdentityGuardian {
  private config: Required<IdentityGuardianConfig>;
  private pendingValidations: ValidationRequest[] = [];

  constructor(config?: IdentityGuardianConfig) {
    this.config = {
      requireValidationForLocked: config?.requireValidationForLocked ?? true,
      autoLockCriticalFacets: config?.autoLockCriticalFacets ?? true,
      maxHistoryVersions: config?.maxHistoryVersions ?? 100,
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize identity with default Robin facets
   */
  initializeIdentity(db: PanyaDatabase): { created: number; existing: number } {
    let created = 0;
    let existing = 0;

    for (const facet of ROBIN_DEFAULT_FACETS) {
      const existingFacet = db.getFacet(facet.id);
      if (existingFacet) {
        existing++;
      } else {
        db.saveFacet(facet);
        created++;
      }
    }

    return { created, existing };
  }

  // ==========================================================================
  // Facet Operations
  // ==========================================================================

  /**
   * Get a specific facet
   */
  getFacet(db: PanyaDatabase, id: string): IdentityFacet | null {
    return db.getFacet(id);
  }

  /**
   * Get all facets of a specific type
   */
  getFacetsByType(db: PanyaDatabase, type: FacetType): IdentityFacet[] {
    return db.getFacets(type);
  }

  /**
   * Get all facets
   */
  getAllFacets(db: PanyaDatabase): IdentityFacet[] {
    return db.getFacets();
  }

  /**
   * Update a facet's content
   */
  updateFacet(
    db: PanyaDatabase,
    update: FacetUpdate
  ): { success: boolean; requiresValidation?: boolean; error?: string } {
    const facet = db.getFacet(update.id);

    if (!facet) {
      return { success: false, error: 'Facet not found' };
    }

    // Check if locked and validation required
    if (facet.locked && this.config.requireValidationForLocked) {
      // Queue for validation
      this.pendingValidations.push({
        facetId: update.id,
        currentContent: facet.content,
        proposedContent: update.content,
        reason: update.reason || 'No reason provided',
        requestedBy: update.updatedBy || 'unknown',
        requestedAt: Date.now(),
      });

      return {
        success: false,
        requiresValidation: true,
        error: 'Locked facet requires validation before update',
      };
    }

    try {
      db.saveFacet({
        id: facet.id,
        name: facet.name,
        facetType: facet.facetType,
        content: update.content,
        locked: facet.locked,
        updatedBy: update.updatedBy,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Update failed',
      };
    }
  }

  /**
   * Create a new facet
   */
  createFacet(
    db: PanyaDatabase,
    facet: Omit<IdentityFacet, 'version' | 'createdAt' | 'updatedAt'>
  ): { success: boolean; id?: string; error?: string } {
    const existing = db.getFacet(facet.id);
    if (existing) {
      return { success: false, error: 'Facet with this ID already exists' };
    }

    try {
      db.saveFacet(facet);
      return { success: true, id: facet.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Creation failed',
      };
    }
  }

  // ==========================================================================
  // Locking Operations
  // ==========================================================================

  /**
   * Lock a facet (prevents auto-modification)
   */
  lockFacet(db: PanyaDatabase, id: string): { success: boolean; error?: string } {
    const facet = db.getFacet(id);
    if (!facet) {
      return { success: false, error: 'Facet not found' };
    }

    if (facet.locked) {
      return { success: true }; // Already locked
    }

    db.lockFacet(id);
    return { success: true };
  }

  /**
   * Unlock a facet (allows modification - use with caution)
   */
  unlockFacet(db: PanyaDatabase, id: string): { success: boolean; error?: string } {
    const facet = db.getFacet(id);
    if (!facet) {
      return { success: false, error: 'Facet not found' };
    }

    if (!facet.locked) {
      return { success: true }; // Already unlocked
    }

    db.unlockFacet(id);
    return { success: true };
  }

  /**
   * Get all locked facets
   */
  getLockedFacets(db: PanyaDatabase): IdentityFacet[] {
    return db.getFacets().filter(f => f.locked);
  }

  // ==========================================================================
  // Validation Queue
  // ==========================================================================

  /**
   * Get pending validation requests
   */
  getPendingValidations(): ValidationRequest[] {
    return [...this.pendingValidations];
  }

  /**
   * Approve a pending validation
   */
  approveValidation(
    db: PanyaDatabase,
    facetId: string
  ): { success: boolean; error?: string } {
    const validationIndex = this.pendingValidations.findIndex(v => v.facetId === facetId);
    if (validationIndex === -1) {
      return { success: false, error: 'No pending validation for this facet' };
    }

    const validation = this.pendingValidations[validationIndex];
    const facet = db.getFacet(facetId);

    if (!facet) {
      this.pendingValidations.splice(validationIndex, 1);
      return { success: false, error: 'Facet no longer exists' };
    }

    // Temporarily unlock, update, re-lock
    db.unlockFacet(facetId);

    db.saveFacet({
      id: facet.id,
      name: facet.name,
      facetType: facet.facetType,
      content: validation.proposedContent,
      locked: true, // Re-lock
      updatedBy: validation.requestedBy + ':validated',
    });

    this.pendingValidations.splice(validationIndex, 1);
    return { success: true };
  }

  /**
   * Reject a pending validation
   */
  rejectValidation(facetId: string): { success: boolean } {
    const validationIndex = this.pendingValidations.findIndex(v => v.facetId === facetId);
    if (validationIndex === -1) {
      return { success: false };
    }

    this.pendingValidations.splice(validationIndex, 1);
    return { success: true };
  }

  // ==========================================================================
  // Relationship Memories
  // ==========================================================================

  /**
   * Record a relationship memory
   */
  recordMemory(
    db: PanyaDatabase,
    memory: Omit<RelationshipMemory, 'id' | 'createdAt' | 'updatedAt'>
  ): number {
    return db.saveRelationshipMemory(memory);
  }

  /**
   * Get relationship memories by type
   */
  getMemories(
    db: PanyaDatabase,
    type?: 'moment' | 'pattern' | 'preference' | 'milestone' | 'inside_joke',
    limit: number = 50
  ): RelationshipMemory[] {
    return db.getRelationshipMemories(type, limit);
  }

  /**
   * Record an inside joke
   */
  recordInsideJoke(db: PanyaDatabase, content: string, context?: string): number {
    return this.recordMemory(db, {
      memoryType: 'inside_joke',
      content,
      importance: 0.7,
      metadata: context ? { context } : undefined,
    });
  }

  /**
   * Record a milestone
   */
  recordMilestone(db: PanyaDatabase, content: string, importance: number = 0.8): number {
    return this.recordMemory(db, {
      memoryType: 'milestone',
      content,
      importance,
    });
  }

  /**
   * Record a preference
   */
  recordPreference(db: PanyaDatabase, content: string, entityIds?: string[]): number {
    return this.recordMemory(db, {
      memoryType: 'preference',
      content,
      importance: 0.6,
      entityIds,
    });
  }

  // ==========================================================================
  // Identity Snapshot
  // ==========================================================================

  /**
   * Take a snapshot of current identity state
   */
  takeSnapshot(db: PanyaDatabase): IdentitySnapshot {
    return {
      facets: this.getAllFacets(db),
      relationshipMemories: this.getMemories(db, undefined, 1000),
      timestamp: Date.now(),
    };
  }

  /**
   * Get identity summary for context
   */
  getSummary(db: PanyaDatabase): string {
    const facets = this.getAllFacets(db);
    const memories = this.getMemories(db, undefined, 10);

    const personality = facets
      .filter(f => f.facetType === 'personality')
      .map(f => f.content)
      .join('\n');

    const voice = facets
      .filter(f => f.facetType === 'voice')
      .map(f => f.content)
      .join('\n');

    const values = facets
      .filter(f => f.facetType === 'values')
      .map(f => f.content)
      .join('\n');

    const recentMilestones = memories
      .filter(m => m.memoryType === 'milestone')
      .slice(0, 3)
      .map(m => `- ${m.content}`)
      .join('\n');

    const insideJokes = memories
      .filter(m => m.memoryType === 'inside_joke')
      .slice(0, 3)
      .map(m => `- ${m.content}`)
      .join('\n');

    return `# Robin's Identity

## Personality
${personality}

## Voice
${voice}

## Values
${values}

## Recent Milestones
${recentMilestones || '(none yet)'}

## Inside Jokes
${insideJokes || '(none yet)'}
`.trim();
  }

  // ==========================================================================
  // Guard Check
  // ==========================================================================

  /**
   * Check if proposed content violates identity principles
   */
  checkViolation(proposedContent: string): {
    isViolation: boolean;
    violations: string[];
    severity: 'none' | 'low' | 'medium' | 'high';
  } {
    const violations: string[] = [];

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /force\s*push/i, message: 'Mentions force push' },
      { pattern: /delete.*permanently/i, message: 'Mentions permanent deletion' },
      { pattern: /override.*safety/i, message: 'Attempts to override safety' },
      { pattern: /ignore.*rules/i, message: 'Attempts to ignore rules' },
      { pattern: /disable.*protection/i, message: 'Attempts to disable protection' },
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(proposedContent)) {
        violations.push(message);
      }
    }

    // Determine severity
    let severity: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (violations.length >= 3) {
      severity = 'high';
    } else if (violations.length >= 2) {
      severity = 'medium';
    } else if (violations.length >= 1) {
      severity = 'low';
    }

    return {
      isViolation: violations.length > 0,
      violations,
      severity,
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default IdentityGuardian;
