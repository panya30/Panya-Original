/**
 * Context Radar Skill
 *
 * Always knows where you are:
 * - Current project/file context
 * - Session state and history
 * - Time awareness (morning/afternoon/evening, workday/weekend)
 * - Activity patterns
 *
 * Part of Panya's 5 Fundamental Meta-Skills
 */

import type { PanyaDatabase } from '../brain/database';

// ============================================================================
// Types
// ============================================================================

export interface ProjectContext {
  path: string;
  name: string;
  type?: 'monorepo' | 'app' | 'library' | 'unknown';
  language?: string;
  framework?: string;
  lastAccessed: number;
}

export interface FileContext {
  path: string;
  name: string;
  extension: string;
  language?: string;
  lastModified?: number;
}

export interface TimeContext {
  timestamp: number;
  hour: number;
  dayOfWeek: number;
  period: 'early-morning' | 'morning' | 'afternoon' | 'evening' | 'night';
  isWeekend: boolean;
  isWorkHours: boolean;
  timezone: string;
}

export interface SessionContext {
  id: string;
  startedAt: number;
  lastActivity: number;
  messageCount: number;
  toolsUsed: string[];
  filesAccessed: string[];
  topicsDiscussed: string[];
}

export interface FullContext {
  project?: ProjectContext;
  file?: FileContext;
  time: TimeContext;
  session: SessionContext;
  recentActivity: ActivityEntry[];
  patterns: ContextPattern[];
}

export interface ActivityEntry {
  timestamp: number;
  type: 'file_access' | 'tool_use' | 'message' | 'search' | 'learning';
  detail: string;
  metadata?: Record<string, any>;
}

export interface ContextPattern {
  pattern: string;
  confidence: number;
  examples: string[];
}

export interface ContextRadarConfig {
  maxActivityHistory?: number;
  patternDetectionEnabled?: boolean;
  workHoursStart?: number;
  workHoursEnd?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<ContextRadarConfig> = {
  maxActivityHistory: 100,
  patternDetectionEnabled: true,
  workHoursStart: 9,
  workHoursEnd: 18,
};

// ============================================================================
// Context Radar Skill
// ============================================================================

export class ContextRadarSkill {
  private config: Required<ContextRadarConfig>;
  private activityLog: ActivityEntry[] = [];
  private currentSession: SessionContext;
  private currentProject?: ProjectContext;
  private currentFile?: FileContext;

  constructor(config?: ContextRadarConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentSession = this.createSession();
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  private createSession(): SessionContext {
    return {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      toolsUsed: [],
      filesAccessed: [],
      topicsDiscussed: [],
    };
  }

  getSession(): SessionContext {
    return { ...this.currentSession };
  }

  // ==========================================================================
  // Time Context
  // ==========================================================================

  getTimeContext(): TimeContext {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    return {
      timestamp: now.getTime(),
      hour,
      dayOfWeek,
      period: this.getPeriod(hour),
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isWorkHours: hour >= this.config.workHoursStart && hour < this.config.workHoursEnd,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  private getPeriod(hour: number): TimeContext['period'] {
    if (hour >= 5 && hour < 9) return 'early-morning';
    if (hour >= 9 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  // ==========================================================================
  // Project & File Context
  // ==========================================================================

  setProject(path: string, metadata?: Partial<ProjectContext>): void {
    const name = path.split('/').pop() || path;
    this.currentProject = {
      path,
      name,
      type: metadata?.type || this.detectProjectType(path),
      language: metadata?.language,
      framework: metadata?.framework,
      lastAccessed: Date.now(),
    };

    this.logActivity('file_access', `Switched to project: ${name}`, { projectPath: path });
  }

  setFile(path: string): void {
    const parts = path.split('/');
    const name = parts.pop() || path;
    const extension = name.includes('.') ? name.split('.').pop() || '' : '';

    this.currentFile = {
      path,
      name,
      extension,
      language: this.detectLanguage(extension),
      lastModified: Date.now(),
    };

    // Track in session
    if (!this.currentSession.filesAccessed.includes(path)) {
      this.currentSession.filesAccessed.push(path);
    }

    this.logActivity('file_access', `Opened file: ${name}`, { filePath: path });
  }

  private detectProjectType(path: string): ProjectContext['type'] {
    // Simple heuristic based on path
    if (path.includes('packages/') || path.includes('apps/')) return 'monorepo';
    if (path.includes('-core') || path.includes('-lib')) return 'library';
    return 'unknown';
  }

  private detectLanguage(extension: string): string | undefined {
    const langMap: Record<string, string> = {
      ts: 'TypeScript',
      tsx: 'TypeScript',
      js: 'JavaScript',
      jsx: 'JavaScript',
      py: 'Python',
      rs: 'Rust',
      go: 'Go',
      md: 'Markdown',
      json: 'JSON',
      yaml: 'YAML',
      yml: 'YAML',
    };
    return langMap[extension];
  }

  // ==========================================================================
  // Activity Tracking
  // ==========================================================================

  logActivity(type: ActivityEntry['type'], detail: string, metadata?: Record<string, any>): void {
    const entry: ActivityEntry = {
      timestamp: Date.now(),
      type,
      detail,
      metadata,
    };

    this.activityLog.unshift(entry);
    this.currentSession.lastActivity = Date.now();

    // Trim old entries
    if (this.activityLog.length > this.config.maxActivityHistory) {
      this.activityLog = this.activityLog.slice(0, this.config.maxActivityHistory);
    }
  }

  logToolUse(toolName: string): void {
    if (!this.currentSession.toolsUsed.includes(toolName)) {
      this.currentSession.toolsUsed.push(toolName);
    }
    this.logActivity('tool_use', `Used tool: ${toolName}`, { tool: toolName });
  }

  logMessage(role: 'user' | 'assistant', preview?: string): void {
    this.currentSession.messageCount++;
    this.logActivity('message', `${role}: ${preview?.slice(0, 50) || '...'}`, { role });
  }

  logTopic(topic: string): void {
    if (!this.currentSession.topicsDiscussed.includes(topic)) {
      this.currentSession.topicsDiscussed.push(topic);
    }
  }

  // ==========================================================================
  // Pattern Detection
  // ==========================================================================

  detectPatterns(): ContextPattern[] {
    if (!this.config.patternDetectionEnabled) return [];

    const patterns: ContextPattern[] = [];

    // Detect time-based patterns
    const timeContext = this.getTimeContext();
    if (timeContext.period === 'night') {
      patterns.push({
        pattern: 'late-night-coding',
        confidence: 0.8,
        examples: ['Working outside normal hours'],
      });
    }

    // Detect file access patterns
    const recentFiles = this.activityLog
      .filter(a => a.type === 'file_access')
      .slice(0, 10);

    const testFiles = recentFiles.filter(a =>
      a.detail.includes('test') || a.detail.includes('spec')
    );
    if (testFiles.length >= 3) {
      patterns.push({
        pattern: 'testing-focus',
        confidence: testFiles.length / recentFiles.length,
        examples: testFiles.map(f => f.detail),
      });
    }

    // Detect tool usage patterns
    const toolCounts = this.currentSession.toolsUsed.reduce((acc, tool) => {
      acc[tool] = (acc[tool] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    if (toolCounts['search'] > 5 || toolCounts['grep'] > 5) {
      patterns.push({
        pattern: 'exploration-mode',
        confidence: 0.7,
        examples: ['Heavy search/grep usage suggests exploring codebase'],
      });
    }

    return patterns;
  }

  // ==========================================================================
  // Full Context
  // ==========================================================================

  getFullContext(): FullContext {
    return {
      project: this.currentProject,
      file: this.currentFile,
      time: this.getTimeContext(),
      session: this.getSession(),
      recentActivity: this.activityLog.slice(0, 20),
      patterns: this.detectPatterns(),
    };
  }

  // ==========================================================================
  // Context Summary (for prompts)
  // ==========================================================================

  getSummary(): string {
    const ctx = this.getFullContext();
    const lines: string[] = [];

    // Time context
    const time = ctx.time;
    lines.push(`🕐 ${time.period} (${time.isWorkHours ? 'work hours' : 'off hours'}${time.isWeekend ? ', weekend' : ''})`);

    // Project context
    if (ctx.project) {
      lines.push(`📁 Project: ${ctx.project.name}${ctx.project.type ? ` (${ctx.project.type})` : ''}`);
    }

    // File context
    if (ctx.file) {
      lines.push(`📄 File: ${ctx.file.name}${ctx.file.language ? ` [${ctx.file.language}]` : ''}`);
    }

    // Session stats
    lines.push(`💬 Session: ${ctx.session.messageCount} messages, ${ctx.session.filesAccessed.length} files accessed`);

    // Topics
    if (ctx.session.topicsDiscussed.length > 0) {
      lines.push(`🏷️ Topics: ${ctx.session.topicsDiscussed.slice(0, 5).join(', ')}`);
    }

    // Patterns
    if (ctx.patterns.length > 0) {
      const patternNames = ctx.patterns.map(p => p.pattern).join(', ');
      lines.push(`🔮 Patterns: ${patternNames}`);
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  saveToDatabase(db: PanyaDatabase): void {
    const ctx = this.getFullContext();

    // Save session as insight
    db.saveInsight({
      type: 'session_context',
      content: JSON.stringify(ctx),
      confidence: 1.0,
      sessionId: ctx.session.id,
    });

    // Log activity summary
    if (this.activityLog.length > 0) {
      db.saveInsight({
        type: 'activity_summary',
        content: this.getSummary(),
        confidence: 0.9,
        sessionId: ctx.session.id,
      });
    }
  }

  loadFromDatabase(db: PanyaDatabase, sessionId: string): boolean {
    const insights = db.getRecentInsights(50);
    const sessionInsight = insights.find(
      i => i.type === 'session_context' && i.source_session_id === sessionId
    );

    if (sessionInsight) {
      try {
        const ctx = JSON.parse(sessionInsight.content) as FullContext;
        this.currentSession = ctx.session;
        this.currentProject = ctx.project;
        this.currentFile = ctx.file;
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
