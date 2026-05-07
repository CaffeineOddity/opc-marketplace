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
import type { KnowledgeCategory, KnowledgeIndex } from './types.js';

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
 * e.g., "HUD 状态栏实时更新修复" -> "hud"
 * e.g., "State Management" -> "state-management"
 */
export function generateTopicSlug(title: string): string {
  // Try to extract meaningful English words first
  const englishWords = title.match(/[a-zA-Z]+/g);
  if (englishWords && englishWords.length > 0) {
    // Use the longest English word or first significant word
    const significant = englishWords.find(w => w.length > 2) || englishWords[0];
    return significant.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  // For Chinese or other languages, generate a slug based on timestamp
  return `topic-${Date.now().toString(36)}`;
}

/**
 * Find or create a topic for a given task
 * Returns the topic slug
 */
export function findOrCreateTopic(
  taskTitle: string,
  taskDescription: string,
  cwd?: string
): { topic: string; isNew: boolean; title: string } {
  const index = readKnowledgeIndex(cwd);
  const searchQuery = `${taskTitle} ${taskDescription}`.toLowerCase();

  // Try to find existing topic by title similarity
  const candidates = Object.entries(index.topics)
    .map(([slug, data]) => {
      const titleWords = data.title.toLowerCase().split(/\s+/);
      const queryWords = searchQuery.split(/\s+/).filter(w => w.length > 1);

      let matchCount = 0;
      for (const queryWord of queryWords) {
        for (const titleWord of titleWords) {
          if (queryWord === titleWord || queryWord.includes(titleWord) || titleWord.includes(queryWord)) {
            matchCount++;
            break;
          }
        }
      }

      const score = queryWords.length > 0 ? matchCount / queryWords.length : 0;
      return { slug, data, score };
    })
    .filter(c => c.score >= 0.3)
    .sort((a, b) => b.score - a.score);

  // If high similarity found, use existing topic
  if (candidates.length > 0 && candidates[0].score >= 0.5) {
    return {
      topic: candidates[0].slug,
      isNew: false,
      title: candidates[0].data.title,
    };
  }

  // Create new topic
  const now = new Date().toISOString();
  const slug = generateTopicSlug(taskTitle);

  index.topics[slug] = {
    title: taskTitle,
    description: taskDescription,
    status: 'in_progress',
    created_at: now,
    updated_at: now,
    domains: {},
  };

  writeKnowledgeIndex(index, cwd);

  // Create topic directory
  const topicPath = getTopicPath(slug, cwd);
  if (!existsSync(topicPath)) {
    mkdirSync(topicPath, { recursive: true });
  }

  return { topic: slug, isNew: true, title: taskTitle };
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

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function writeKnowledgeDoc(
  topic: string,
  category: KnowledgeCategory,
  doc: string,
  content: string,
  mode: 'append' | 'update' | 'overwrite' = 'append',
  section?: string,
  cwd?: string
): void {
  const path = getKnowledgeDocPath(topic, category, doc, cwd);
  const dir = join(path, '..');

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let finalContent = content;

  if (mode === 'append' && existsSync(path)) {
    const existing = readFileSync(path, 'utf-8');
    const timestamp = new Date().toISOString().split('T')[0];
    finalContent = `${existing}\n\n## ${timestamp}\n\n${content}`;
  } else if (mode === 'update' && section && existsSync(path)) {
    const existing = readFileSync(path, 'utf-8');
    const sectionRegex = new RegExp(`(## ${section}[\\s]*\\n)([^#]*)(?=##|$)`, 'g');
    if (sectionRegex.test(existing)) {
      finalContent = existing.replace(sectionRegex, `$1${content}\n\n`);
    } else {
      finalContent = `${existing}\n\n## ${section}\n\n${content}`;
    }
  }

  writeFileSync(path, finalContent, 'utf-8');

  // Update index
  const index = readKnowledgeIndex(cwd);
  const topicData = index.topics[topic];
  if (topicData) {
    topicData.updated_at = new Date().toISOString();
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
