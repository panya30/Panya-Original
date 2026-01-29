/**
 * OpenAI LLM Extractor
 *
 * Uses OpenAI API to extract learnings and entities from text.
 * Supports both Thai and English language.
 */

import OpenAI from 'openai';
import type { Learning } from '../skills/auto-learn';
import type { ExtractedEntity } from './entities';

// ============================================================================
// OpenAI Client (lazy-loaded)
// ============================================================================

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// ============================================================================
// Learning Extraction
// ============================================================================

export async function extractLearningsWithOpenAI(
  conversationText: string,
  context?: string
): Promise<Learning[]> {
  const prompt = `Analyze this conversation and extract learnings. Look for:
- Facts and information shared
- Decisions made
- Preferences expressed
- Patterns and routines discovered
- Insights and realizations

Conversation:
${conversationText}

${context ? `Context: ${context}` : ''}

Return a JSON object with a "learnings" array:
{
  "learnings": [
    {
      "type": "fact|preference|decision|pattern|insight",
      "content": "The learning in a clear sentence",
      "confidence": 0.6-1.0 (how confident you are),
      "importance": 0.5-1.0 (how important this is)
    }
  ]
}

Focus on significant, actionable learnings. Skip trivial information.
Support both Thai and English language.`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a learning extraction expert. You analyze conversations and extract meaningful learnings, decisions, preferences, and insights. You understand both Thai and English.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    const learnings = parsed.learnings || parsed;

    // Convert to Learning format
    const now = new Date().toISOString();
    return (Array.isArray(learnings) ? learnings : [learnings]).map((l: any) => ({
      type: l.type || 'insight',
      content: l.content,
      confidence: l.confidence || 0.7,
      importance: l.importance || 0.6,
      source: {
        type: 'conversation' as const,
        timestamp: now,
        context: context || 'OpenAI extraction',
      },
      entities: [],
      relatedTo: [],
    }));
  } catch (error) {
    console.error('OpenAI extraction error:', error);
    return [];
  }
}

// ============================================================================
// Entity Extraction
// ============================================================================

export async function extractEntitiesWithOpenAI(
  text: string
): Promise<ExtractedEntity[]> {
  const prompt = `Extract named entities from this text. Find:
- People (person)
- Organizations (organization)
- Places (place)
- Projects (project)
- Tools/Technologies (tool)
- Concepts/Ideas (concept)
- Events (event)
- Skills (skill)

Text:
${text}

Return a JSON object with an "entities" array:
{
  "entities": [
    {
      "name": "Entity name",
      "type": "person|organization|place|project|tool|concept|event|skill",
      "confidence": 0.0-1.0
    }
  ]
}

Support both Thai and English.`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an entity extraction expert. You identify and classify entities in text. You understand both Thai and English.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    const entities = parsed.entities || parsed;

    // Convert to ExtractedEntity format
    return (Array.isArray(entities) ? entities : [entities]).map((e: any) => ({
      name: e.name,
      type: e.type || 'concept',
      normalizedName: e.name.toLowerCase().replace(/\s+/g, '-'),
      confidence: e.confidence || 0.8,
      extractedBy: 'llm' as const,
    }));
  } catch (error) {
    console.error('OpenAI entity extraction error:', error);
    return [];
  }
}
