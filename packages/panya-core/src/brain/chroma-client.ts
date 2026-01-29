/**
 * ChromaDB MCP Client for Panya
 *
 * Uses chroma-mcp (Python) via MCP protocol for vector embeddings.
 * Enables semantic/vector search alongside FTS5 keyword search.
 *
 * Architecture:
 * Panya (TypeScript) → MCP Client → chroma-mcp (Python) → ChromaDB
 *
 * @example
 * ```typescript
 * const chroma = new ChromaMcpClient('panya-brain', './data/chroma');
 * await chroma.connect();
 * await chroma.addDocuments([{ id: 'doc1', document: 'Hello world', metadata: {} }]);
 * const results = await chroma.query('greeting', 5);
 * ```
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// ============================================================================
// Types
// ============================================================================

export interface ChromaDocument {
  id: string;
  document: string;
  metadata: Record<string, string | number | boolean>;
}

export interface ChromaQueryResult {
  ids: string[];
  documents: string[];
  distances: number[];
  metadatas: Record<string, any>[];
}

export interface ChromaStats {
  count: number;
  connected: boolean;
}

export interface ChromaClientConfig {
  collectionName: string;
  dataDir: string;
  pythonVersion?: string;
}

// ============================================================================
// ChromaMcpClient
// ============================================================================

export class ChromaMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connected: boolean = false;
  private collectionName: string;
  private dataDir: string;
  private pythonVersion: string;

  constructor(config: ChromaClientConfig) {
    this.collectionName = config.collectionName;
    this.dataDir = config.dataDir;
    this.pythonVersion = config.pythonVersion || '3.12';
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Connect to chroma-mcp server
   */
  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    console.log('[panya-chroma] Connecting to chroma-mcp server...');

    try {
      this.transport = new StdioClientTransport({
        command: 'uvx',
        args: [
          '--python', this.pythonVersion,
          'chroma-mcp',
          '--client-type', 'persistent',
          '--data-dir', this.dataDir
        ],
        stderr: 'ignore'
      });

      this.client = new Client({
        name: 'panya-chroma',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      await this.client.connect(this.transport);
      this.connected = true;

      console.log('[panya-chroma] Connected to chroma-mcp server');
    } catch (error) {
      this.resetConnection();
      throw new Error(`Chroma connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Reset connection state
   */
  private resetConnection(): void {
    this.connected = false;
    this.client = null;
    this.transport = null;
  }

  /**
   * Close connection and cleanup subprocess
   */
  async close(): Promise<void> {
    if (!this.connected && !this.client && !this.transport) {
      return;
    }

    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore close errors
      }
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // Ignore close errors
      }
    }

    console.log('[panya-chroma] Connection closed');
    this.resetConnection();
  }

  // ==========================================================================
  // Collection Management
  // ==========================================================================

  /**
   * Ensure collection exists
   */
  async ensureCollection(): Promise<void> {
    await this.connect();

    if (!this.client) {
      throw new Error('Chroma client not initialized');
    }

    try {
      await this.client.callTool({
        name: 'chroma_get_collection_info',
        arguments: {
          collection_name: this.collectionName
        }
      });
      console.log(`[panya-chroma] Collection '${this.collectionName}' exists`);
    } catch {
      console.log(`[panya-chroma] Creating collection '${this.collectionName}'...`);
      await this.client.callTool({
        name: 'chroma_create_collection',
        arguments: {
          collection_name: this.collectionName,
          embedding_function_name: 'default'
        }
      });
      console.log(`[panya-chroma] Collection '${this.collectionName}' created`);
    }
  }

  /**
   * Delete collection if exists
   */
  async deleteCollection(): Promise<void> {
    await this.connect();

    if (!this.client) {
      throw new Error('Chroma client not initialized');
    }

    try {
      await this.client.callTool({
        name: 'chroma_delete_collection',
        arguments: {
          collection_name: this.collectionName
        }
      });
      console.log(`[panya-chroma] Collection '${this.collectionName}' deleted`);
    } catch {
      // Collection doesn't exist, ignore
    }
  }

  // ==========================================================================
  // Document Operations
  // ==========================================================================

  /**
   * Add documents to collection
   */
  async addDocuments(documents: ChromaDocument[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    await this.ensureCollection();

    if (!this.client) {
      throw new Error('Chroma client not initialized');
    }

    // Batch in chunks of 100 to avoid memory issues
    const batchSize = 100;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      await this.client.callTool({
        name: 'chroma_add_documents',
        arguments: {
          collection_name: this.collectionName,
          documents: batch.map(d => d.document),
          ids: batch.map(d => d.id),
          metadatas: batch.map(d => d.metadata)
        }
      });

      console.log(`[panya-chroma] Added batch ${Math.floor(i / batchSize) + 1}: ${batch.length} documents`);
    }

    console.log(`[panya-chroma] Total added: ${documents.length} documents`);
  }

  /**
   * Add single document
   */
  async addDocument(doc: ChromaDocument): Promise<void> {
    await this.addDocuments([doc]);
  }

  /**
   * Update document (delete + add)
   */
  async updateDocument(doc: ChromaDocument): Promise<void> {
    await this.deleteDocuments([doc.id]);
    await this.addDocument(doc);
  }

  /**
   * Delete documents by IDs
   */
  async deleteDocuments(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.connect();

    if (!this.client) {
      throw new Error('Chroma client not initialized');
    }

    try {
      await this.client.callTool({
        name: 'chroma_delete_documents',
        arguments: {
          collection_name: this.collectionName,
          ids: ids
        }
      });
    } catch {
      // Documents might not exist, ignore
    }
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Query collection for semantic search
   */
  async query(
    queryText: string,
    limit: number = 10,
    whereFilter?: Record<string, any>
  ): Promise<ChromaQueryResult> {
    // Reconnect if connection died
    try {
      await this.connect();
    } catch {
      this.resetConnection();
      await this.connect();
    }

    if (!this.client) {
      throw new Error('Chroma client not initialized');
    }

    const args: Record<string, any> = {
      collection_name: this.collectionName,
      query_texts: [queryText],
      n_results: limit,
      include: ['documents', 'metadatas', 'distances']
    };

    if (whereFilter) {
      args.where = JSON.stringify(whereFilter);
    }

    let result;
    try {
      result = await this.client.callTool({
        name: 'chroma_query_documents',
        arguments: args
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Not connected')) {
        console.log('[panya-chroma] Connection lost, reconnecting...');
        this.resetConnection();
        await this.connect();
        result = await this.client!.callTool({
          name: 'chroma_query_documents',
          arguments: args
        });
      } else {
        throw error;
      }
    }

    const content = result.content as Array<{ type: string; text?: string }>;
    const data = content[0];
    if (data.type !== 'text' || !data.text) {
      throw new Error('Unexpected response type from chroma-mcp');
    }

    const parsed = JSON.parse(data.text);

    return {
      ids: parsed.ids?.[0] || [],
      documents: parsed.documents?.[0] || [],
      distances: parsed.distances?.[0] || [],
      metadatas: parsed.metadatas?.[0] || []
    };
  }

  // ==========================================================================
  // Stats
  // ==========================================================================

  /**
   * Get collection stats
   */
  async getStats(): Promise<ChromaStats> {
    try {
      await this.connect();
    } catch {
      return { count: 0, connected: false };
    }

    if (!this.client) {
      return { count: 0, connected: false };
    }

    try {
      const result = await this.client.callTool({
        name: 'chroma_get_collection_info',
        arguments: {
          collection_name: this.collectionName
        }
      });

      const content = result.content as Array<{ type: string; text?: string }>;
      const data = content[0];
      if (data.type !== 'text' || !data.text) {
        return { count: 0, connected: true };
      }

      const parsed = JSON.parse(data.text);
      return { count: parsed.count || 0, connected: true };
    } catch {
      return { count: 0, connected: true };
    }
  }
}

export default ChromaMcpClient;
