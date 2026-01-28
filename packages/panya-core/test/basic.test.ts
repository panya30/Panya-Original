/**
 * Basic Panya Core Tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Panya, PanyaDatabase, EntityExtractor, AutoLearnSkill, ROBIN_IDENTITY } from '../src';
import { PanyaMCPAdapter, PANYA_MCP_TOOLS } from '../src/adapters/mcp';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = join(import.meta.dir, 'test-panya.db');

describe('Panya Core', () => {
  let panya: Panya;

  beforeAll(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    panya = new Panya({
      database: { dbPath: TEST_DB_PATH },
    });
    await panya.initialize();
  });

  afterAll(() => {
    panya.close();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test('should have Robin identity by default', () => {
    expect(panya.identity.name).toBe('Robin');
    expect(panya.identity.title).toBe('The Alpha');
  });

  test('should initialize database', () => {
    const stats = panya.stats();
    expect(stats).toHaveProperty('documents');
    expect(stats).toHaveProperty('entities');
    expect(stats).toHaveProperty('relationships');
    expect(stats).toHaveProperty('insights');
  });

  test('should extract entities', async () => {
    const result = await panya.entityExtractor.extract(
      'Today Robin and Modz worked on Panya Phase 1'
    );

    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.method).toBe('rules');

    const entityNames = result.entities.map(e => e.name);
    expect(entityNames).toContain('Robin');
    expect(entityNames).toContain('Modz');
  });

  test('should extract learnings from conversation', async () => {
    const messages = [
      { role: 'user' as const, content: 'I prefer using TypeScript over JavaScript' },
      { role: 'assistant' as const, content: 'TypeScript provides type safety which is helpful' },
      { role: 'user' as const, content: 'Yes, I always use strict mode' },
      { role: 'assistant' as const, content: 'Good practice!' },
    ];

    const result = await panya.skills.autoLearn.extractFromConversation(messages, 'test');

    expect(result).toHaveProperty('learnings');
    expect(result).toHaveProperty('processingTime');
  });
});

describe('MCP Adapter', () => {
  let adapter: PanyaMCPAdapter;
  let panya: Panya;

  beforeAll(async () => {
    // Clean up any existing test database
    const mcpDbPath = join(import.meta.dir, 'test-panya-mcp.db');
    if (existsSync(mcpDbPath)) {
      unlinkSync(mcpDbPath);
    }

    panya = new Panya({
      database: { dbPath: mcpDbPath },
    });
    await panya.initialize();
    adapter = new PanyaMCPAdapter(panya);
  });

  afterAll(() => {
    panya.close();
    const mcpDbPath = join(import.meta.dir, 'test-panya-mcp.db');
    if (existsSync(mcpDbPath)) {
      unlinkSync(mcpDbPath);
    }
  });

  test('should expose MCP tools', () => {
    const tools = adapter.getTools();
    expect(tools.length).toBe(13);

    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('panya_auto_learn');
    expect(toolNames).toContain('panya_search');
    expect(toolNames).toContain('panya_stats');
    expect(toolNames).toContain('panya_recent_learnings');
    expect(toolNames).toContain('panya_extract_entities');
  });

  test('should handle panya_stats call', async () => {
    const result = await adapter.handleToolCall({
      name: 'panya_stats',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('text');

    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('brain');
    expect(data).toHaveProperty('identity');
    expect(data.identity.name).toBe('Robin');
  });

  test('should handle panya_extract_entities call', async () => {
    const result = await adapter.handleToolCall({
      name: 'panya_extract_entities',
      arguments: { text: 'Robin is working with Modz on Panya' },
    });

    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text);
    expect(data.entityCount).toBeGreaterThan(0);
  });

  test('should return error for unknown tool', async () => {
    const result = await adapter.handleToolCall({
      name: 'unknown_tool',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });
});

describe('Exports', () => {
  test('should export ROBIN_IDENTITY', () => {
    expect(ROBIN_IDENTITY.name).toBe('Robin');
    expect(ROBIN_IDENTITY.voice.pronouns.self).toBe('ฉัน');
    expect(ROBIN_IDENTITY.voice.pronouns.user).toBe('เธอ');
  });

  test('should export PANYA_MCP_TOOLS', () => {
    expect(Array.isArray(PANYA_MCP_TOOLS)).toBe(true);
    expect(PANYA_MCP_TOOLS.length).toBe(13);
  });
});
