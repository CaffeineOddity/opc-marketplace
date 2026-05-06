/**
 * Knowledge Handlers
 *
 * Handles opc_knowledge_* tool calls.
 */

import type { KnowledgeCategory } from '../types.js';
import {
  readKnowledgeIndex,
  initKnowledgeLibrary,
  readKnowledgeDoc,
  readAllKnowledgeDocs,
  writeKnowledgeDoc,
  knowledgeExists,
  listKnowledgeDocs,
} from '../knowledge.js';
import type { ToolResult } from './index.js';

export function handleKnowledgeInit(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const title = args.title as string;

  try {
    initKnowledgeLibrary(requirementId, title, cwd);

    return {
      content: [{
        type: 'text',
        text: `## Knowledge Library Initialized

**Requirement ID:** ${requirementId}
**Title:** ${title}
**Path:** .opc/knowledge/${requirementId}/

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
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
}

export function handleKnowledgeRead(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const category = args.category as KnowledgeCategory;
  const doc = args.doc as string | undefined;

  if (doc) {
    const content = readKnowledgeDoc(requirementId, category, doc, cwd);

    if (!content) {
      return {
        content: [{ type: 'text', text: `Knowledge document not found: ${requirementId}/${category}/${doc}.md` }],
      };
    }

    return { content: [{ type: 'text', text: content }] };
  }

  const content = readAllKnowledgeDocs(requirementId, category, cwd);

  if (!content) {
    return {
      content: [{ type: 'text', text: `No knowledge documents found for ${requirementId}/${category}` }],
    };
  }

  return { content: [{ type: 'text', text: content }] };
}

export function handleKnowledgeWrite(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const category = args.category as KnowledgeCategory;
  const doc = args.doc as string;
  const content = args.content as string;
  const mode = (args.mode as 'append' | 'update' | 'overwrite') || 'append';
  const section = args.section as string | undefined;

  const index = readKnowledgeIndex(cwd);
  if (!index.requirements[requirementId]) {
    return {
      content: [{
        type: 'text',
        text: `Error: Requirement ${requirementId} not found. Initialize with opc_knowledge_init first.`,
      }],
      isError: true,
    };
  }

  writeKnowledgeDoc(requirementId, category, doc, content, mode, section, cwd);

  return {
    content: [{
      type: 'text',
      text: `## Knowledge Written

**Requirement:** ${requirementId}
**Document:** ${category}/${doc}.md
**Mode:** ${mode}${section ? `\n**Section:** ${section}` : ''}

Content has been ${mode === 'overwrite' ? 'written' : mode === 'update' ? 'updated' : 'appended'}.`,
    }],
  };
}

export function handleKnowledgeExists(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const category = args.category as KnowledgeCategory | undefined;
  const doc = args.doc as string | undefined;

  const exists = knowledgeExists(requirementId, category, doc, cwd);

  return {
    content: [{ type: 'text', text: exists ? 'true' : 'false' }],
  };
}

export function handleKnowledgeList(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const status = args.status as string | undefined;
  const categoryFilter = args.category as KnowledgeCategory | undefined;

  const index = readKnowledgeIndex(cwd);
  let requirements = Object.entries(index.requirements);

  if (status) {
    requirements = requirements.filter(([, r]) => r.status === status);
  }

  if (categoryFilter) {
    requirements = requirements.filter(([, r]) => r.domains[categoryFilter]?.length > 0);
  }

  if (requirements.length === 0) {
    return { content: [{ type: 'text', text: 'No requirements found in knowledge library.' }] };
  }

  const table = requirements
    .map(([id, r]) => {
      const categories = Object.keys(r.domains).join(', ') || '-';
      return `| ${id} | ${r.title} | ${r.status} | ${categories} | ${r.updated_at.split('T')[0]} |`;
    })
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## Knowledge Library

| ID | Title | Status | Categories | Updated |
|-----|-------|--------|---------|--------|
${table}`,
    }],
  };
}

export function handleKnowledgeDocs(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const requirementId = args.requirementId as string;
  const category = args.category as KnowledgeCategory;

  const docs = listKnowledgeDocs(requirementId, category, cwd);

  if (docs.length === 0) {
    return {
      content: [{ type: 'text', text: `No documents found for ${requirementId}/${category}` }],
    };
  }

  const docList = docs.map(d => `- ${d}.md`).join('\n');

  return {
    content: [{
      type: 'text',
      text: `## ${requirementId}/${category} Documents

${docList}`,
    }],
  };
}