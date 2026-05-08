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
  listKnowledgeDocsBrief,
  readKnowledgeDocWithMeta,
} from '../knowledge.js';
import { getCurrentTask } from '../session.js';
import type { ToolResult } from './index.js';

/**
 * Get the topic from args or current task
 */
function resolveTopic(args: Record<string, unknown>, cwd: string | undefined): string | null {
  // If topic is provided directly, use it
  if (args.topic) {
    return args.topic as string;
  }

  // Get from current task
  const state = getCurrentTask(cwd);
  if (state?.project.knowledge_topic) {
    return state.project.knowledge_topic;
  }

  return null;
}

export function handleKnowledgeInit(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const title = args.title as string;

  // Create/find topic from title
  const result = findOrCreateTopic(title, '', cwd);
  const topic = result.topic;

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
      content: [{ type: 'text', text: 'No topic specified. Provide topic or start a task first.' }],
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
  // Optional metadata from caller
  const meta = args.meta as Record<string, unknown> | undefined;

  if (!topic) {
    return {
      content: [{
        type: 'text',
        text: 'No topic specified. Provide topic or start a task first.',
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

  // Prepare metadata if provided
  const docMeta = meta ? {
    name: meta.name as string | undefined,
    description: meta.description as string | undefined,
    tags: meta.tags as string[] | undefined,
  } : undefined;

  writeKnowledgeDoc(topic, category, doc, content, mode, section, cwd, docMeta);

  // Get the actual metadata that was written
  const docWithMeta = readKnowledgeDocWithMeta(topic, category, doc, cwd);
  const actualName = docWithMeta?.meta.name || doc;
  const actualDesc = docWithMeta?.meta.description || '';

  return {
    content: [{
      type: 'text',
      text: `## Knowledge Written

**Topic:** ${topic}
**Document:** ${category}/${doc}.md
**Name:** ${actualName}
**Description:** ${actualDesc}
**Mode:** ${mode}${section ? `\n**Section:** ${section}` : ''}

Content has been ${mode === 'overwrite' ? 'written' : mode === 'update' ? 'updated' : 'appended'}.

💡 **Tip:** Provide meaningful \`name\` and \`description\` in the \`meta\` parameter for better document discoverability. Example:
\`\`\`json
{
  "name": "iOS多语言系统架构设计",
  "description": "描述iOS项目中多语言系统的架构设计，包括LanguageManager、BundleProvider等核心组件。",
  "tags": ["ios", "localization", "architecture"]
}
\`\`\``,
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
      content: [{ type: 'text', text: 'No topic specified. Provide topic or start a task first.' }],
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

export function handleKnowledgeListBrief(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const topic = args.topic as string | undefined;
  const category = args.category as KnowledgeCategory | undefined;

  const docs = listKnowledgeDocsBrief(topic, category, cwd);

  if (docs.length === 0) {
    return {
      content: [{ type: 'text', text: 'No knowledge documents found.' }],
    };
  }

  const table = docs
    .map(d => `| ${d.topic} | ${d.category} | ${d.name} | ${d.description || '-'} |`)
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## Knowledge Documents (Brief)

| Topic | Category | Name | Description |
|-------|----------|------|-------------|
${table}

💡 Use \`opc_knowledge_read\` to read full content of specific documents.`,
    }],
  };
}
