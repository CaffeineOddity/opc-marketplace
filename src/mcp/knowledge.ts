/**
 * OPC Knowledge Library
 *
 * Knowledge management organized by topic (e.g., "hud", "state-management").
 * Each topic can have multiple domain documents (backend.md, design.md, etc.)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { ensureOpcDir } from './paths.js';
import { readJsonFile, atomicWriteJson } from './io.js';
import type { KnowledgeCategory, KnowledgeIndex, KnowledgeDocMeta, KnowledgeDocWithMeta } from './types.js';
import { RECOMMENDED_CATEGORIES } from './types.js';

// ============================================================
// Knowledge Paths
// ============================================================

function getKnowledgePath(cwd?: string): string {
  return join(ensureOpcDir('', cwd), 'knowledge');
}

function getKnowledgeIndexPath(cwd?: string): string {
  return join(getKnowledgePath(cwd), 'index.json');
}

function getTopicPath(topic: string, cwd?: string): string {
  return join(getKnowledgePath(cwd), topic);
}

function getKnowledgeDocPath(
  topic: string,
  category: KnowledgeCategory,
  doc: string,
  cwd?: string
): string {
  const topicPath = getTopicPath(topic, cwd);
  return join(topicPath, category, `${doc}.md`);
}

// ============================================================
// Knowledge Index
// ============================================================

export function readKnowledgeIndex(cwd?: string): KnowledgeIndex {
  const path = getKnowledgeIndexPath(cwd);
  const index = readJsonFile<KnowledgeIndex>(path);

  if (!index) {
    return { topics: {} };
  }

  // Migration: Convert old 'requirements' key to 'topics'
  if ('requirements' in index && !('topics' in index)) {
    const legacyIndex = index as unknown as { requirements: KnowledgeIndex['topics'] };
    const migratedIndex: KnowledgeIndex = { topics: legacyIndex.requirements };
    // Write migrated index
    writeKnowledgeIndex(migratedIndex, cwd);
    return migratedIndex;
  }

  return index;
}

export function writeKnowledgeIndex(index: KnowledgeIndex, cwd?: string): void {
  const path = getKnowledgeIndexPath(cwd);
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  atomicWriteJson(path, index);
}

// ============================================================
// Topic Management
// ============================================================

/**
 * Generate a topic slug from a title
 * e.g., "HUD 状态栏实时更新修复" -> "hud-status-bar"
 * e.g., "iOS多语言技术方案" -> "ios-localization"
 *
 * IMPORTANT: Avoids collision with category names (ios, android, web, etc.)
 */
export function generateTopicSlug(title: string): string {
  // Category names to avoid as topic slugs
  const categoryNames = new Set<string>(RECOMMENDED_CATEGORIES);

  // Try to extract meaningful English words first
  const englishWords = title.match(/[a-zA-Z]+/g);
  if (englishWords && englishWords.length > 0) {
    // Filter words longer than 2 chars and lowercase
    const words = englishWords
      .filter(w => w.length > 2)
      .map(w => w.toLowerCase());

    if (words.length >= 2) {
      // Use first two significant words
      const slug = words.slice(0, 2).join('-');
      // Avoid collision with category names
      if (!categoryNames.has(slug)) {
        return slug;
      }
      // If collision, prefix with 'topic-'
      return `topic-${slug}`;
    }

    if (words.length === 1) {
      const word = words[0];
      // Avoid collision with category names
      if (!categoryNames.has(word)) {
        return word;
      }
      // If collision, prefix with 'topic-'
      return `topic-${word}`;
    }
  }

  // For Chinese or other languages, generate a slug based on timestamp
  return `topic-${Date.now().toString(36)}`;
}

/**
 * Find similar existing topic by title/description similarity.
 * Used for automatic knowledge topic matching.
 */
export function findSimilarKnowledgeTopic(
  taskTitle: string,
  taskDescription: string,
  cwd?: string,
  threshold: number = 0.5
): { topic: string; title: string; score: number; category?: string } | null {
  const index = readKnowledgeIndex(cwd);
  const topics = Object.entries(index.topics);

  if (topics.length === 0) return null;

  const query = `${taskTitle} ${taskDescription}`.toLowerCase();
  const queryWords = query.split(/\s+/).filter(w => w.length > 1);

  let bestMatch: { topic: string; title: string; score: number; category?: string } | null = null;

  for (const [slug, data] of topics) {
    const titleWords = data.title.toLowerCase().split(/\s+/);
    const descWords = (data.description || '').toLowerCase().split(/\s+/);
    const allWords = [...titleWords, ...descWords].filter(w => w.length > 1);

    let matchCount = 0;
    for (const queryWord of queryWords) {
      for (const word of allWords) {
        if (queryWord === word || queryWord.includes(word) || word.includes(queryWord)) {
          matchCount++;
          break;
        }
      }
    }

    const score = queryWords.length > 0 ? matchCount / queryWords.length : 0;

    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      // Infer primary category from domains (first non-empty category)
      const categories = Object.keys(data.domains);
      const primaryCategory = categories.find(c => data.domains[c]?.length > 0);

      bestMatch = {
        topic: slug,
        title: data.title,
        score,
        category: primaryCategory
      };
    }
  }

  return bestMatch;
}

/**
 * Create a new knowledge topic.
 * Returns the created topic info.
 */
export function createTopic(
  topicSlug: string,
  title: string,
  description: string,
  cwd?: string
): { topic: string; title: string } {
  const index = readKnowledgeIndex(cwd);

  const now = new Date().toISOString();
  index.topics[topicSlug] = {
    title,
    description,
    status: 'in_progress',
    created_at: now,
    updated_at: now,
    domains: {},
  };

  writeKnowledgeIndex(index, cwd);

  // Create topic directory
  const topicPath = getTopicPath(topicSlug, cwd);
  if (!existsSync(topicPath)) {
    mkdirSync(topicPath, { recursive: true });
  }

  return { topic: topicSlug, title };
}

/**
 * Check if a topic exists.
 */
export function topicExists(topicSlug: string, cwd?: string): boolean {
  const index = readKnowledgeIndex(cwd);
  return !!index.topics[topicSlug];
}

/**
 * Get topic info by slug
 */
export function getTopic(topic: string, cwd?: string): KnowledgeIndex['topics'][string] | null {
  const index = readKnowledgeIndex(cwd);
  return index.topics[topic] || null;
}

// ============================================================
// Knowledge Read/Write
// ============================================================

export function readKnowledgeDoc(
  topic: string,
  category: KnowledgeCategory,
  doc: string,
  cwd?: string
): string | null {
  const path = getKnowledgeDocPath(topic, category, doc, cwd);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

export function readAllKnowledgeDocs(
  topic: string,
  category: KnowledgeCategory,
  cwd?: string
): string | null {
  const topicPath = getTopicPath(topic, cwd);
  const categoryPath = join(topicPath, category);

  if (!existsSync(categoryPath)) return null;

  const results: string[] = [];
  for (const docFile of readdirSync(categoryPath)) {
    if (!docFile.endsWith('.md')) continue;
    const content = readFileSync(join(categoryPath, docFile), 'utf-8');
    results.push(`## ${docFile}\n\n${content}`);
  }

  return results.length > 0 ? results.join('\n\n---\n\n') : null;
}


// ============================================================
// Document Type Metadata Defaults
// ============================================================

/**
 * Default metadata for common document types.
 * Provides meaningful name and description when caller doesn't specify.
 */
const DOC_TYPE_DEFAULTS: Record<string, { name: string; description: string }> = {
  // Architecture documents
  architecture: {
    name: '技术架构文档',
    description: '描述系统的整体架构设计，包括组件关系、技术选型、分层结构和核心模块。',
  },
  tech: {
    name: '技术方案文档',
    description: '描述技术实现方案，包括技术栈选择、实现细节和关键决策。',
  },
  api: {
    name: 'API接口文档',
    description: '描述API端点、请求/响应格式、认证方式和错误处理。',
  },
  // Requirement documents
  main: {
    name: '需求规格文档',
    description: '描述功能需求、用户故事、验收标准和业务目标。',
  },
  'user-stories': {
    name: '用户故事文档',
    description: '描述用户故事、验收标准和优先级排序。',
  },
  // Design documents
  ui: {
    name: 'UI设计文档',
    description: '描述用户界面设计，包括布局、组件、交互和视觉规范。',
  },
  interaction: {
    name: '交互设计文档',
    description: '描述用户交互流程、状态转换和动画效果。',
  },
  // Test documents
  'test-plan': {
    name: '测试计划文档',
    description: '描述测试策略、测试范围、测试环境和资源安排。',
  },
  cases: {
    name: '测试用例文档',
    description: '描述测试用例、预期结果和覆盖率分析。',
  },
  // Deployment documents
  deployment: {
    name: '部署文档',
    description: '描述部署流程、环境配置和发布检查清单。',
  },
  infrastructure: {
    name: '基础设施文档',
    description: '描述基础设施架构、资源配置和运维指南。',
  },
  // Growth documents
  metrics: {
    name: '指标体系文档',
    description: '描述业务指标、监控维度和数据采集方案。',
  },
  analytics: {
    name: '数据分析文档',
    description: '描述分析方法、数据模型和洞察结论。',
  },
};

/**
 * Get default metadata for a document type.
 * Falls back to generic defaults if type not found.
 */
function getDocTypeDefaults(
  doc: string,
  category: KnowledgeCategory
): { name: string; description: string } {
  // Check explicit defaults first
  if (DOC_TYPE_DEFAULTS[doc]) {
    return DOC_TYPE_DEFAULTS[doc];
  }

  // Generate category-aware defaults
  const categoryNames: Record<KnowledgeCategory, string> = {
    requirement: '需求',
    design: '设计',
    backend: '后端',
    ios: 'iOS',
    android: 'Android',
    harmony: '鸿蒙',
    web: 'Web',
    miniprogram: '小程序',
    qa: '测试',
    ship: '部署',
    growth: '增长',
  };

  return {
    name: `${categoryNames[category] || ''}${doc}文档`,
    description: `描述${categoryNames[category] || ''}相关的${doc}内容。`,
  };
}

export function writeKnowledgeDoc(
  topic: string,
  category: KnowledgeCategory,
  doc: string,
  content: string,
  mode: 'append' | 'update' | 'overwrite' = 'append',
  section?: string,
  cwd?: string,
  /** Optional metadata for frontmatter generation */
  meta?: Partial<KnowledgeDocMeta>
): void {
  const path = getKnowledgeDocPath(topic, category, doc, cwd);
  const dir = join(path, '..');
  const now = new Date().toISOString();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let finalContent = content;
  let existingMeta: Partial<KnowledgeDocMeta> = {};

  // Handle existing document
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf-8');
    const parsed = parseFrontmatter(existing);
    existingMeta = parsed.meta;

    if (mode === 'append') {
      const timestamp = now.split('T')[0];
      finalContent = `${parsed.content}\n\n## ${timestamp}\n\n${content}`;
    } else if (mode === 'update' && section) {
      const sectionRegex = new RegExp(`(## ${section}[\\s]*\\n)([^#]*)(?=##|$)`, 'g');
      if (sectionRegex.test(parsed.content)) {
        finalContent = parsed.content.replace(sectionRegex, `$1${content}\n\n`);
      } else {
        finalContent = `${parsed.content}\n\n## ${section}\n\n${content}`;
      }
    }
    // overwrite mode: use new content directly
  }

  // Get topic info for default metadata
  const index = readKnowledgeIndex(cwd);
  const topicData = index.topics[topic];

  // Get document type defaults
  const docDefaults = getDocTypeDefaults(doc, category);

  // Build frontmatter metadata
  // Priority: explicit meta > existing meta > doc type defaults
  const frontmatterMeta: KnowledgeDocMeta = {
    name: meta?.name || existingMeta.name || docDefaults.name,
    description: meta?.description || existingMeta.description || docDefaults.description,
    category: meta?.category || category,
    topic: meta?.topic || topic,
    created_at: existingMeta.created_at || now,
    updated_at: now,
    tags: meta?.tags || existingMeta.tags,
  };

  // Prepend frontmatter to content
  const frontmatter = generateFrontmatter(frontmatterMeta);
  finalContent = `${frontmatter}\n${finalContent}`;

  writeFileSync(path, finalContent, 'utf-8');

  // Update index
  if (topicData) {
    topicData.updated_at = now;
    if (!topicData.domains[category]) {
      topicData.domains[category] = [];
    }
    if (!topicData.domains[category].includes(doc)) {
      topicData.domains[category].push(doc);
    }
    writeKnowledgeIndex(index, cwd);
  }
}

// ============================================================
// Knowledge Exists
// ============================================================

export function knowledgeExists(
  topic: string,
  category?: KnowledgeCategory,
  doc?: string,
  cwd?: string
): boolean {
  if (!category) {
    const index = readKnowledgeIndex(cwd);
    return !!index.topics[topic];
  }

  if (!doc) {
    const topicPath = getTopicPath(topic, cwd);
    const categoryPath = join(topicPath, category);
    return existsSync(categoryPath);
  }

  const path = getKnowledgeDocPath(topic, category, doc, cwd);
  return existsSync(path);
}

// ============================================================
// Frontmatter Processing
// ============================================================

/**
 * Parse YAML frontmatter from document content.
 * Returns metadata and content without frontmatter.
 */
export function parseFrontmatter(content: string): { meta: Partial<KnowledgeDocMeta>; content: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { meta: {}, content };
  }

  const [, frontmatterStr, bodyContent] = match;
  const meta: Partial<KnowledgeDocMeta> = {};

  // Parse simple YAML key-value pairs
  const lines = frontmatterStr.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: string | string[] = line.slice(colonIndex + 1).trim();

    // Handle arrays (e.g., tags: [a, b, c])
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    }

    // Map to camelCase for consistency
    const normalizedKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    (meta as Record<string, unknown>)[normalizedKey] = value;
  }

  return { meta, content: bodyContent };
}

/**
 * Generate YAML frontmatter string from metadata.
 */
export function generateFrontmatter(meta: KnowledgeDocMeta): string {
  const lines: string[] = ['---'];

  lines.push(`name: ${meta.name}`);
  lines.push(`description: ${meta.description}`);
  lines.push(`category: ${meta.category}`);
  lines.push(`topic: ${meta.topic}`);

  if (meta.created_at) {
    lines.push(`created_at: ${meta.created_at}`);
  }
  if (meta.updated_at) {
    lines.push(`updated_at: ${meta.updated_at}`);
  }
  if (meta.tags && meta.tags.length > 0) {
    lines.push(`tags: [${meta.tags.join(', ')}]`);
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Read knowledge document with parsed frontmatter metadata.
 */
export function readKnowledgeDocWithMeta(
  topic: string,
  category: KnowledgeCategory,
  doc: string,
  cwd?: string
): KnowledgeDocWithMeta | null {
  const rawContent = readKnowledgeDoc(topic, category, doc, cwd);
  if (!rawContent) return null;

  const { meta, content } = parseFrontmatter(rawContent);

  // Provide defaults if frontmatter missing
  return {
    meta: {
      name: meta.name || doc,
      description: meta.description || '',
      category: meta.category || category,
      topic: meta.topic || topic,
      created_at: meta.created_at,
      updated_at: meta.updated_at,
      tags: meta.tags,
    },
    content,
  };
}

/**
 * List all knowledge documents with brief metadata.
 * Enables progressive loading without reading full content.
 */
export function listKnowledgeDocsBrief(
  topic?: string,
  category?: KnowledgeCategory,
  cwd?: string
): KnowledgeDocMeta[] {
  const index = readKnowledgeIndex(cwd);
  const results: KnowledgeDocMeta[] = [];

  const topicsToScan = topic ? [topic] : Object.keys(index.topics);

  for (const t of topicsToScan) {
    const topicData = index.topics[t];
    if (!topicData) continue;

    const categoriesToScan = category
      ? [category]
      : (Object.keys(topicData.domains) as KnowledgeCategory[]);

    for (const c of categoriesToScan) {
      const docs = topicData.domains[c] || [];
      for (const doc of docs) {
        // Try to read frontmatter, fall back to index data
        const docWithMeta = readKnowledgeDocWithMeta(t, c, doc, cwd);
        if (docWithMeta) {
          results.push(docWithMeta.meta);
        } else {
          // Fallback: create minimal metadata from index
          results.push({
            name: doc,
            description: topicData.description || '',
            category: c,
            topic: t,
          });
        }
      }
    }
  }

  return results;
}

// ============================================================
// Knowledge List
// ============================================================

export function listKnowledgeDocs(
  topic: string,
  category: KnowledgeCategory,
  cwd?: string
): string[] {
  const topicPath = getTopicPath(topic, cwd);
  const categoryPath = join(topicPath, category);

  if (!existsSync(categoryPath)) return [];

  const docs: string[] = [];
  for (const docFile of readdirSync(categoryPath)) {
    if (docFile.endsWith('.md')) {
      docs.push(docFile.replace('.md', ''));
    }
  }

  return docs;
}

// ============================================================
// Knowledge Index Rebuild
// ============================================================

/**
 * Rebuild the knowledge index from the filesystem.
 * Scans all topic directories and their categories to reconstruct index.json.
 *
 * Use cases:
 * - index.json is corrupted or missing
 * - Manual file operations (create/delete) were performed
 * - Migrating from older versions
 * - Syncing index with actual filesystem state
 *
 * @param cwd Working directory
 * @returns Rebuilt index and summary of changes
 */
export function rebuildKnowledgeIndex(cwd?: string): {
  index: KnowledgeIndex;
  stats: {
    topicsFound: number;
    categoriesFound: number;
    docsFound: number;
    topicsAdded: string[];
    topicsRemoved: string[];
  };
} {
  const knowledgePath = getKnowledgePath(cwd);
  const oldIndex = readKnowledgeIndex(cwd);
  const oldTopics = Object.keys(oldIndex.topics);

  const newIndex: KnowledgeIndex = { topics: {} };
  const stats = {
    topicsFound: 0,
    categoriesFound: 0,
    docsFound: 0,
    topicsAdded: [] as string[],
    topicsRemoved: [] as string[],
  };

  // Check if knowledge directory exists
  if (!existsSync(knowledgePath)) {
    // No knowledge directory, return empty index
    writeKnowledgeIndex(newIndex, cwd);
    stats.topicsRemoved = oldTopics;
    return { index: newIndex, stats };
  }

  // Scan all directories in knowledge path (each is a topic)
  const entries = readdirSync(knowledgePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // Skip special directories (like .git, etc.)
    if (entry.name.startsWith('.')) continue;

    const topicSlug = entry.name;
    const topicPath = join(knowledgePath, topicSlug);

    // Scan categories within topic
    const domains: Record<string, string[]> = {};
    let topicUpdatedAt = '';
    let latestDocTime = 0;

    const categoryEntries = readdirSync(topicPath, { withFileTypes: true });

    for (const catEntry of categoryEntries) {
      if (!catEntry.isDirectory()) continue;

      const categorySlug = catEntry.name;
      const categoryPath = join(topicPath, categorySlug);

      // Scan documents within category
      const docs: string[] = [];
      const docEntries = readdirSync(categoryPath, { withFileTypes: true });

      for (const docEntry of docEntries) {
        if (!docEntry.isFile() || !docEntry.name.endsWith('.md')) continue;

        const docName = docEntry.name.replace('.md', '');
        docs.push(docName);
        stats.docsFound++;

        // Track latest modification time
        const docPath = join(categoryPath, docEntry.name);
        try {
          const stat = statSync(docPath);
          if (stat.mtimeMs > latestDocTime) {
            latestDocTime = stat.mtimeMs;
          }
        } catch {
          // Ignore stat errors
        }
      }

      if (docs.length > 0) {
        domains[categorySlug] = docs.sort();
        stats.categoriesFound++;
      }
    }

    // Only add topic if it has documents
    if (Object.keys(domains).length > 0) {
      stats.topicsFound++;

      // Preserve existing metadata if available
      const existingTopic = oldIndex.topics[topicSlug];
      const now = new Date().toISOString();

      // Try to extract title from frontmatter of first document found
      let title = existingTopic?.title || topicSlug;
      let description = existingTopic?.description || '';

      // Find first document to extract title from frontmatter
      if (!existingTopic?.title) {
        for (const [category, docs] of Object.entries(domains)) {
          if (docs.length > 0) {
            const docWithMeta = readKnowledgeDocWithMeta(topicSlug, category, docs[0], cwd);
            if (docWithMeta?.meta.topic) {
              // Use topic from frontmatter if it matches
              title = topicSlug;
              break;
            }
          }
        }
      }

      newIndex.topics[topicSlug] = {
        title,
        description,
        status: existingTopic?.status || 'in_progress',
        created_at: existingTopic?.created_at || now,
        updated_at: latestDocTime > 0 ? new Date(latestDocTime).toISOString() : now,
        domains,
      };

      // Track if this is a new topic
      if (!oldTopics.includes(topicSlug)) {
        stats.topicsAdded.push(topicSlug);
      }
    }
  }

  // Track removed topics
  const newTopics = Object.keys(newIndex.topics);
  for (const oldTopic of oldTopics) {
    if (!newTopics.includes(oldTopic)) {
      stats.topicsRemoved.push(oldTopic);
    }
  }

  // Write the rebuilt index
  writeKnowledgeIndex(newIndex, cwd);

  return { index: newIndex, stats };
}
