/**
 * Discovery Worker
 *
 * Periodically checks auto-discover enabled observations for new content.
 * Supports:
 * - GitHub repos: new commits, issues, releases
 * - RSS feeds (future)
 * - Web pages (future)
 */

import type { PanyaDatabase, Observation } from '../brain/database';
import { GitHubProcessor } from './github-processor';

// ============================================================================
// Types
// ============================================================================

export interface DiscoveryResult {
  observationId: number;
  type: string;
  newItems: number;
  cursor?: string;
  error?: string;
}

export interface DiscoveryWorkerConfig {
  checkIntervalMs?: number; // How often to check for due observations
  maxConcurrent?: number;   // Max observations to process at once
}

export interface DiscoveryStatus {
  isRunning: boolean;
  lastCheckAt?: number;
  nextCheckAt?: number;
  observationsChecked: number;
  newItemsFound: number;
}

export interface DiscoveryLogEntry {
  timestamp: number;
  type: 'check' | 'found' | 'error' | 'start' | 'stop';
  message: string;
  observationId?: number;
  details?: any;
}

// ============================================================================
// GitHub Discovery
// ============================================================================

interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

async function discoverGitHubRepo(
  observation: Observation,
  githubProcessor: GitHubProcessor,
  db: PanyaDatabase
): Promise<DiscoveryResult> {
  const url = observation.content;
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);

  if (!match) {
    return {
      observationId: observation.id,
      type: 'github_repo',
      newItems: 0,
      error: 'Invalid GitHub URL',
    };
  }

  const [, owner, repo] = match;
  const repoName = repo.replace(/\.git$/, '');
  const lastCursor = observation.discoverCursor; // Last commit SHA

  try {
    // Fetch recent commits from GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/commits?per_page=10`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Panya-Discovery/1.0',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const commits: any[] = await response.json();

    if (commits.length === 0) {
      return {
        observationId: observation.id,
        type: 'github_repo',
        newItems: 0,
        cursor: lastCursor,
      };
    }

    // Find new commits since last cursor
    let newCommits: GitHubCommit[] = [];
    const latestSha = commits[0].sha;

    if (!lastCursor) {
      // First discovery, just get latest 3 commits
      newCommits = commits.slice(0, 3).map(c => ({
        sha: c.sha,
        message: c.commit.message.split('\n')[0], // First line only
        author: c.commit.author.name,
        date: c.commit.author.date,
      }));
    } else {
      // Find commits after the cursor
      for (const c of commits) {
        if (c.sha === lastCursor) break;
        newCommits.push({
          sha: c.sha,
          message: c.commit.message.split('\n')[0],
          author: c.commit.author.name,
          date: c.commit.author.date,
        });
      }
    }

    // Create documents for new commits
    if (newCommits.length > 0) {
      for (const commit of newCommits) {
        const content = `[GitHub Commit: ${owner}/${repoName}]\n\n` +
          `SHA: ${commit.sha.substring(0, 7)}\n` +
          `Author: ${commit.author}\n` +
          `Date: ${commit.date}\n` +
          `Message: ${commit.message}`;

        db.insertDocument({
          id: `github-commit-${commit.sha.substring(0, 7)}-${Date.now()}`,
          type: 'learning',
          scope: 'common',
          content,
          sourceFile: `github:${owner}/${repoName}/commit/${commit.sha.substring(0, 7)}`,
          tags: [repoName.toLowerCase(), 'commit', 'github'],
        });
      }
    }

    // Update cursor to latest commit
    db.updateDiscoveryState(observation.id, latestSha);

    return {
      observationId: observation.id,
      type: 'github_repo',
      newItems: newCommits.length,
      cursor: latestSha,
    };
  } catch (error: any) {
    return {
      observationId: observation.id,
      type: 'github_repo',
      newItems: 0,
      error: error.message,
    };
  }
}

// ============================================================================
// Discovery Worker
// ============================================================================

export class DiscoveryWorker {
  private config: Required<DiscoveryWorkerConfig>;
  private status: DiscoveryStatus;
  private timer: ReturnType<typeof setInterval> | null = null;
  private githubProcessor: GitHubProcessor;
  private activityLog: DiscoveryLogEntry[] = [];
  private maxLogEntries = 100;

  constructor(config?: DiscoveryWorkerConfig) {
    this.config = {
      checkIntervalMs: config?.checkIntervalMs ?? 60000, // Check every minute
      maxConcurrent: config?.maxConcurrent ?? 5,
    };

    this.status = {
      isRunning: false,
      observationsChecked: 0,
      newItemsFound: 0,
    };

    this.githubProcessor = new GitHubProcessor();
  }

  /**
   * Add a log entry
   */
  private log(type: DiscoveryLogEntry['type'], message: string, observationId?: number, details?: any): void {
    this.activityLog.unshift({
      timestamp: Date.now(),
      type,
      message,
      observationId,
      details,
    });

    // Keep only the last N entries
    if (this.activityLog.length > this.maxLogEntries) {
      this.activityLog = this.activityLog.slice(0, this.maxLogEntries);
    }
  }

  /**
   * Get activity logs
   */
  getActivityLog(limit: number = 50): DiscoveryLogEntry[] {
    return this.activityLog.slice(0, limit);
  }

  /**
   * Clear activity logs
   */
  clearActivityLog(): void {
    this.activityLog = [];
  }

  /**
   * Start the discovery worker
   */
  start(db: PanyaDatabase): void {
    if (this.timer) {
      return; // Already running
    }

    this.status.isRunning = true;
    this.log('start', 'Discovery worker started');
    console.log('[discovery] Worker started');

    // Run immediately
    this.runDiscovery(db);

    // Then run periodically
    this.timer = setInterval(() => {
      this.runDiscovery(db);
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the discovery worker
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status.isRunning = false;
    this.log('stop', 'Discovery worker stopped');
    console.log('[discovery] Worker stopped');
  }

  /**
   * Get current status
   */
  getStatus(): DiscoveryStatus {
    return {
      ...this.status,
      nextCheckAt: this.timer ? Date.now() + this.config.checkIntervalMs : undefined,
    };
  }

  /**
   * Run discovery check
   */
  async runDiscovery(db: PanyaDatabase): Promise<DiscoveryResult[]> {
    const results: DiscoveryResult[] = [];

    try {
      // Get observations due for discovery
      const due = db.getObservationsDueForDiscovery();

      if (due.length === 0) {
        this.log('check', `Checked: No observations due for discovery`);
        return results;
      }

      this.log('check', `Checking ${due.length} observation(s)...`);
      console.log(`[discovery] Found ${due.length} observation(s) due for discovery`);

      // Process up to maxConcurrent at a time
      const toProcess = due.slice(0, this.config.maxConcurrent);

      for (const obs of toProcess) {
        let result: DiscoveryResult;

        switch (obs.observationType) {
          case 'github_repo':
            result = await discoverGitHubRepo(obs, this.githubProcessor, db);
            break;
          default:
            result = {
              observationId: obs.id,
              type: obs.observationType,
              newItems: 0,
              error: `Discovery not supported for type: ${obs.observationType}`,
            };
            // Still update last_discovered_at to prevent repeated checks
            db.updateDiscoveryState(obs.id);
        }

        results.push(result);
        this.status.observationsChecked++;
        this.status.newItemsFound += result.newItems;

        if (result.error) {
          this.log('error', `Error on #${obs.id}: ${result.error}`, obs.id);
        } else if (result.newItems > 0) {
          this.log('found', `Found ${result.newItems} new item(s) from #${obs.id}`, obs.id, {
            type: result.type,
            cursor: result.cursor,
          });
          console.log(`[discovery] Found ${result.newItems} new item(s) from observation #${obs.id}`);
        } else {
          this.log('check', `No new items from #${obs.id}`, obs.id);
        }
      }

      this.status.lastCheckAt = Date.now();
    } catch (error: any) {
      this.log('error', `Discovery error: ${error.message}`);
      console.error('[discovery] Error:', error.message);
    }

    return results;
  }

  /**
   * Manually trigger discovery for a specific observation
   */
  async discoverOne(db: PanyaDatabase, observationId: number): Promise<DiscoveryResult> {
    const obs = db.getObservation(observationId);

    if (!obs) {
      this.log('error', `Observation #${observationId} not found`, observationId);
      return {
        observationId,
        type: 'unknown',
        newItems: 0,
        error: 'Observation not found',
      };
    }

    this.log('check', `Manual check for #${observationId} (${obs.observationType})`, observationId);

    let result: DiscoveryResult;

    switch (obs.observationType) {
      case 'github_repo':
        result = await discoverGitHubRepo(obs, this.githubProcessor, db);
        break;
      default:
        result = {
          observationId: obs.id,
          type: obs.observationType,
          newItems: 0,
          error: `Discovery not supported for type: ${obs.observationType}`,
        };
    }

    this.status.observationsChecked++;
    this.status.newItemsFound += result.newItems;

    // Log result
    if (result.error) {
      this.log('error', `Manual #${observationId}: ${result.error}`, observationId);
    } else if (result.newItems > 0) {
      this.log('found', `Manual #${observationId}: Found ${result.newItems} new item(s)`, observationId, {
        type: result.type,
        cursor: result.cursor,
      });
    } else {
      this.log('check', `Manual #${observationId}: No new items`, observationId);
    }

    return result;
  }
}

export default DiscoveryWorker;
