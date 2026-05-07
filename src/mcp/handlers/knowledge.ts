/**
 * Knowledge Handlers
 *
 * Handles opc_knowledge_* tool calls.
 * Knowledge is organized by topic (e.g., "hud", "state-management").
 */

import type { KnowledgeCategory } from '../types.js';
import {
  readKnowledgeIndex,
  findOrCreateTopic,
  getTopic,
  readKnowledgeDoc,
  readAllKnowledgeDocs,
  writeKnowledgeDoc,
  knowledgeExists,
  listKnowledgeDocs,
} from '../knowledge.js';
import { getCurrentTask } from '../session.js';
import type { ToolResult } from './index.js';

/**
 * Get the topic from args or current task
 */
function resolveTopic(args: Record<string, unknown>, cwd: string | undefined): string | null {
  // If requirementId is provided, use it as topic (backward compatibility)
  if (args.requirementId) {
    return args.requirementId as string;
  }

  // If topic is provided directly
  if (args.topic) {
    return args.topic as string;
  }

  // Try to get from current task
  const state = getCurrentTask(cwd);
  if (state?.project.knowledge_topic) {
    return state.project.knowledge_topic;
  }

  return null;
}

export function handleKnowledgeInit(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const title = args.title as string;

  // For backward compatibility, treat requirementId as topic
  // But also support the new topic-based approach
  const result = findOrCreateTopic(title, '', cwd);
  const topic = requirementId || result.topic;

  const topicData = getTopic(topic, cwd);

  return {
    content: [{
      type: 'text',
      text: `## Knowledge Library Initialized

**Topic:** ${topic}
**Title:** ${title}
**Path:** .opc/knowledge/${topic}/

Knowledge documents will be created on-demand when writing to each category.

### Categories (aligned with pipeline stages)

| Stage | Category | Description |
|-------|----------|-------------|
| Product | requirement | Requirement specs, user stories |
| Design | design | UI/UX, interaction, visual assets |
| Dev | backend, ios, android, harmony, web, miniprogram | Platform-specific implementation |
| QA | qa | Test plans, test cases |
| Ship | ship | Deployment, CI/CD, infrastructure |
| Growth | growth | Metrics, analytics, marketing |`,
    }],
  };
}

export function handleKnowledgeRead(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const topic = resolveTopic(args, cwd);
  const category = args.category as KnowledgeCategory;
  const doc = args.doc as string | undefined;

  if (!topic) {
    return {
      content: [{ type: 'text', text: 'No topic specified. Provide requirementId/topic or start a task first.' }],
      isError: true,
    };
  }

  if (doc) {
    const content = readKnowledgeDoc(topic, category, doc, cwd);

    if (!content) {
      return {
        content: [{ type: 'text', text: `Knowledge document not found: ${topic}/${category}/${doc}.md` }],
      };
    }

    return { content: [{ type: 'text', text: content }] };
  }

  const content = readAllKnowledgeDocs(topic, category, cwd);

  if (!content) {
    return {
      content: [{ type: 'text', text: `No knowledge documents found for ${topic}/${category}` }],
    };
  }

  return { content: [{ type: 'text', text: content }] };
}

export function handleKnowledgeWrite(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const topic = resolveTopic(args, cwd);
  const category = args.category as KnowledgeCategory;
  const doc = args.doc as string;
  const content = args.content as string;
  const mode = (args.mode as 'append' | 'update' | 'overwrite') || 'append';
  const section = args.section as string | undefined;

  if (!topic) {
    return {
      content: [{
        type: 'text',
        text: 'No topic specified. Provide requirementId/topic or start a task first.',
      }],
      isError: true,
    };
  }

  // Ensure topic exists
  const index = readKnowledgeIndex(cwd);
  if (!index.topics[topic]) {
    // Create topic if it doesn't exist
    findOrCreateTopic(topic, '', cwd);
  }

  writeKnowledgeDoc(topic, category, doc, content, mode, section, cwd);

  return {
    content: [{
      type: 'text',
      text: `## Knowledge Written

**Topic:** ${topic}
**Document:** ${category}/${doc}.md
**Mode:** ${mode}${section ? `\n**Section:** ${section}` : ''}

Content has been ${mode === 'overwrite' ? 'written' : mode === 'update' ? 'updated' : 'appended'}.`,
    }],
  };
}

export function handleKnowledgeExists(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const topic = resolveTopic(args, cwd);
  const category = args.category as KnowledgeCategory | undefined;
  const doc = args.doc as string | undefined;

  if (!topic) {
    return {
      content: [{ type: 'text', text: 'false' }],
    };
  }

  const exists = knowledgeExists(topic, category, doc, cwd);

  return {
    content: [{ type: 'text', text: exists ? 'true' : 'false' }],
  };
}

export function handleKnowledgeList(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const status = args.status as string | undefined;
  const categoryFilter = args.category as KnowledgeCategory | undefined;

  const index = readKnowledgeIndex(cwd);
  let topics = Object.entries(index.topics);

  if (status) {
    topics = topics.filter(([, t]) => t.status === status);
  }

  if (categoryFilter) {
    topics = topics.filter(([, t]) => t.domains[categoryFilter]?.length > 0);
  }

  if (topics.length === 0) {
    return { content: [{ type: 'text', text: 'No topics found in knowledge library.' }] };
  }

  const table = topics
    .map(([slug, t]) => {
      const categories = Object.keys(t.domains).join(', ') || '-';
      return `| ${slug} | ${t.title} | ${t.status} | ${categories} | ${t.updated_at.split('T')[0]} |`;
    })
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## Knowledge Library

| Topic | Title | Status | Categories | Updated |
|-------|-------|--------|------------|---------|
${table}`,
    }],
  };
}

export function handleKnowledgeDocs(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const topic = resolveTopic(args, cwd);
  const category = args.category as KnowledgeCategory;

  if (!topic) {
    return {
      content: [{ type: 'text', text: 'No topic specified. Provide requirementId/topic or start a task first.' }],
      isError: true,
    };
  }

  const docs = listKnowledgeDocs(topic, category, cwd);

  if (docs.length === 0) {
    return {
      content: [{ type: 'text', text: `No documents found for ${topic}/${category}` }],
    };
  }

  const docList = docs.map(d => `- ${d}.md`).join('\n');

  return {
    content: [{
      type: 'text',
      text: `## ${topic}/${category} Documents

${docList}`,
    }],
  };
}
