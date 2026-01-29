/**
 * ThreadManager Skill
 *
 * Manages multi-turn discussions for complex consultations.
 * Threads allow continuing conversations across sessions.
 *
 * Features:
 * - sendMessage() - Add message to thread (creates new if needed)
 * - list() - List threads with filters
 * - read() - Get full thread with messages
 * - updateStatus() - Change thread status
 */

import type { PanyaDatabase, Thread, ThreadMessage, ThreadStatus } from '../brain/database';

// ============================================================================
// Types
// ============================================================================

export interface ThreadManagerConfig {
  maxMessagesPerRead?: number;
  defaultTitle?: string;
}

export interface SendMessageResult {
  threadId: number;
  messageId: number;
  isNewThread: boolean;
  thread: Thread;
}

export interface ThreadWithMessages extends Thread {
  messages: ThreadMessage[];
  messageCount: number;
}

export interface ThreadSummary {
  id: number;
  title: string;
  status: ThreadStatus;
  messageCount: number;
  lastMessageAt: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<ThreadManagerConfig> = {
  maxMessagesPerRead: 100,
  defaultTitle: 'New Discussion',
};

// ============================================================================
// ThreadManager Skill
// ============================================================================

export class ThreadManager {
  private config: Required<ThreadManagerConfig>;

  constructor(config?: ThreadManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Send a message to a thread
   * Creates a new thread if threadId is not provided
   */
  sendMessage(
    db: PanyaDatabase,
    message: string,
    options?: {
      threadId?: number;
      title?: string;
      role?: 'human' | 'assistant';
    }
  ): SendMessageResult {
    const role = options?.role || 'human';
    let threadId = options?.threadId;
    let isNewThread = false;

    // Create new thread if needed
    if (!threadId) {
      const title = options?.title || this.generateTitle(message);
      threadId = db.createThread(title);
      isNewThread = true;
    }

    // Add message
    const messageId = db.addThreadMessage(threadId, role, message);

    // Get updated thread
    const thread = db.getThread(threadId);

    return {
      threadId,
      messageId,
      isNewThread,
      thread: thread!,
    };
  }

  /**
   * List threads with optional filters
   */
  list(
    db: PanyaDatabase,
    filters?: {
      status?: ThreadStatus;
      limit?: number;
      offset?: number;
    }
  ): ThreadSummary[] {
    const threads = db.listThreads(filters);

    return threads.map(thread => {
      const messages = db.getThreadMessages(thread.id);
      const lastMessage = messages[messages.length - 1];

      return {
        id: thread.id,
        title: thread.title,
        status: thread.status,
        messageCount: messages.length,
        lastMessageAt: lastMessage?.createdAt || thread.createdAt,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      };
    });
  }

  /**
   * Read a thread with all its messages
   */
  read(
    db: PanyaDatabase,
    threadId: number,
    limit?: number
  ): ThreadWithMessages | null {
    const thread = db.getThread(threadId);
    if (!thread) {
      return null;
    }

    const messages = db.getThreadMessages(threadId, limit || this.config.maxMessagesPerRead);

    return {
      ...thread,
      messages,
      messageCount: messages.length,
    };
  }

  /**
   * Update thread status
   */
  updateStatus(
    db: PanyaDatabase,
    threadId: number,
    status: ThreadStatus
  ): { success: boolean; error?: string } {
    const thread = db.getThread(threadId);
    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }

    // Validate status transition
    const validTransitions: Record<ThreadStatus, ThreadStatus[]> = {
      active: ['pending', 'answered', 'closed'],
      pending: ['active', 'answered', 'closed'],
      answered: ['active', 'closed'],
      closed: ['active'], // Can reopen
    };

    if (!validTransitions[thread.status]?.includes(status)) {
      return {
        success: false,
        error: `Invalid status transition: ${thread.status} -> ${status}`,
      };
    }

    db.updateThreadStatus(threadId, status);
    return { success: true };
  }

  /**
   * Get thread statistics
   */
  getStats(db: PanyaDatabase): {
    total: number;
    byStatus: Record<ThreadStatus, number>;
    recentActivity: number;
  } {
    const allThreads = db.listThreads({ limit: 1000 });

    const byStatus: Record<ThreadStatus, number> = {
      active: 0,
      pending: 0,
      answered: 0,
      closed: 0,
    };

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let recentActivity = 0;

    for (const thread of allThreads) {
      byStatus[thread.status]++;
      if (thread.updatedAt > oneDayAgo) {
        recentActivity++;
      }
    }

    return {
      total: allThreads.length,
      byStatus,
      recentActivity,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Generate a title from the first message
   */
  private generateTitle(message: string): string {
    // Take first 50 chars, cut at word boundary
    if (message.length <= 50) {
      return message;
    }

    const truncated = message.slice(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > 30) {
      return truncated.slice(0, lastSpace) + '...';
    }

    return truncated + '...';
  }
}

export default ThreadManager;
