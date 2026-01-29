/**
 * GitHub Repo Processor
 *
 * Processes GitHub repository URLs and extracts learnings:
 * - README content
 * - Package info (package.json, Cargo.toml, etc.)
 * - Key source file patterns
 * - Repository structure
 *
 * Part of Robin's learning system
 */

import type { PanyaDatabase } from '../brain/database';

// ============================================================================
// Types
// ============================================================================

export interface RepoInfo {
  owner: string;
  repo: string;
  url: string;
  description?: string;
  language?: string;
  topics?: string[];
  stars?: number;
  readme?: string;
  packageJson?: Record<string, any>;
  structure?: string[];
}

export interface ProcessedRepo {
  success: boolean;
  repoInfo?: RepoInfo;
  learnings: string[];
  tags: string[];
  error?: string;
}

// ============================================================================
// GitHub Processor
// ============================================================================

export class GitHubProcessor {

  /**
   * Process a GitHub URL and extract learnings
   */
  async process(url: string): Promise<ProcessedRepo> {
    try {
      // Parse GitHub URL
      const parsed = this.parseGitHubUrl(url);
      if (!parsed) {
        return { success: false, learnings: [], tags: [], error: 'Invalid GitHub URL' };
      }

      const { owner, repo } = parsed;

      // Fetch repo info using gh CLI
      const repoInfo = await this.fetchRepoInfo(owner, repo);
      if (!repoInfo) {
        return { success: false, learnings: [], tags: [], error: 'Failed to fetch repo info' };
      }

      // Extract learnings
      const learnings = this.extractLearnings(repoInfo);
      const tags = this.extractTags(repoInfo);

      return {
        success: true,
        repoInfo,
        learnings,
        tags,
      };
    } catch (error) {
      return {
        success: false,
        learnings: [],
        tags: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Parse GitHub URL to extract owner and repo
   */
  private parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    // Handle various GitHub URL formats
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/\?\#]+)/,
      /^([^\/]+)\/([^\/]+)$/,  // owner/repo format
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, ''),
        };
      }
    }

    return null;
  }

  /**
   * Fetch repository info using gh CLI
   */
  private async fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo | null> {
    try {
      const repoInfo: RepoInfo = {
        owner,
        repo,
        url: `https://github.com/${owner}/${repo}`,
      };

      // Get repo metadata
      const metaResult = await this.runCommand(
        `gh repo view ${owner}/${repo} --json name,description,primaryLanguage,repositoryTopics,stargazerCount`
      );

      if (metaResult) {
        try {
          const meta = JSON.parse(metaResult);
          repoInfo.description = meta.description;
          repoInfo.language = meta.primaryLanguage?.name;
          repoInfo.topics = meta.repositoryTopics?.map((t: any) => t.name) || [];
          repoInfo.stars = meta.stargazerCount;
        } catch {}
      }

      // Get README
      const readmeResult = await this.runCommand(
        `gh api repos/${owner}/${repo}/readme --jq '.content' | base64 -d 2>/dev/null || echo ""`
      );
      if (readmeResult && readmeResult.trim()) {
        // Limit README to first 5000 chars
        repoInfo.readme = readmeResult.substring(0, 5000);
      }

      // Get package.json if exists
      const packageResult = await this.runCommand(
        `gh api repos/${owner}/${repo}/contents/package.json --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || echo ""`
      );
      if (packageResult && packageResult.trim()) {
        try {
          repoInfo.packageJson = JSON.parse(packageResult);
        } catch {}
      }

      // Get directory structure (top level)
      const treeResult = await this.runCommand(
        `gh api repos/${owner}/${repo}/contents --jq '.[].name' 2>/dev/null || echo ""`
      );
      if (treeResult) {
        repoInfo.structure = treeResult.split('\n').filter(Boolean);
      }

      return repoInfo;
    } catch (error) {
      console.error('[github-processor] Error fetching repo:', error);
      return null;
    }
  }

  /**
   * Run shell command and return output
   */
  private async runCommand(cmd: string): Promise<string | null> {
    try {
      const proc = Bun.spawn(['sh', '-c', cmd], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      return output.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract learnings from repo info
   */
  private extractLearnings(info: RepoInfo): string[] {
    const learnings: string[] = [];

    // Basic repo info
    learnings.push(
      `Repository: ${info.owner}/${info.repo}` +
      (info.description ? ` - ${info.description}` : '') +
      (info.language ? ` (${info.language})` : '') +
      (info.stars ? ` [${info.stars} stars]` : '')
    );

    // Topics as learning
    if (info.topics && info.topics.length > 0) {
      learnings.push(`Topics/Tags: ${info.topics.join(', ')}`);
    }

    // Extract from README
    if (info.readme) {
      // Get first meaningful paragraph
      const paragraphs = info.readme
        .split(/\n\n+/)
        .filter(p => p.trim().length > 50 && !p.startsWith('#') && !p.startsWith('```'));

      if (paragraphs.length > 0) {
        learnings.push(`About: ${paragraphs[0].substring(0, 500).trim()}`);
      }

      // Extract key features (look for bullet points)
      const featureMatch = info.readme.match(/(?:features|highlights|what it does)[:\s]*\n((?:[-*]\s+.+\n?)+)/i);
      if (featureMatch) {
        learnings.push(`Features: ${featureMatch[1].substring(0, 300).trim()}`);
      }
    }

    // Package.json insights
    if (info.packageJson) {
      const pkg = info.packageJson;

      if (pkg.dependencies) {
        const deps = Object.keys(pkg.dependencies).slice(0, 10);
        learnings.push(`Dependencies: ${deps.join(', ')}`);
      }

      if (pkg.scripts) {
        const scripts = Object.keys(pkg.scripts).slice(0, 5);
        learnings.push(`Scripts: ${scripts.join(', ')}`);
      }
    }

    // Structure insights
    if (info.structure && info.structure.length > 0) {
      const keyDirs = info.structure.filter(f =>
        ['src', 'lib', 'app', 'components', 'pages', 'api', 'test', 'tests'].includes(f)
      );
      if (keyDirs.length > 0) {
        learnings.push(`Structure: ${keyDirs.join(', ')} directories`);
      }
    }

    return learnings;
  }

  /**
   * Extract tags from repo info
   */
  private extractTags(info: RepoInfo): string[] {
    const tags: string[] = [];

    // Add repo name
    tags.push(info.repo);

    // Add language
    if (info.language) {
      tags.push(info.language.toLowerCase());
    }

    // Add topics
    if (info.topics) {
      tags.push(...info.topics.slice(0, 5));
    }

    // Extract from package.json
    if (info.packageJson?.keywords) {
      tags.push(...info.packageJson.keywords.slice(0, 5));
    }

    // Dedupe and clean
    return [...new Set(tags.map(t => t.toLowerCase()))];
  }

  /**
   * Generate observation content from processed repo
   */
  generateObservationContent(result: ProcessedRepo): string {
    if (!result.success || !result.repoInfo) {
      return `Failed to process repository: ${result.error}`;
    }

    const parts = [
      `[GitHub Repo: ${result.repoInfo.owner}/${result.repoInfo.repo}]`,
      '',
      ...result.learnings,
    ];

    return parts.join('\n');
  }
}

export default GitHubProcessor;
