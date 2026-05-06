/**
 * OPC Knowledge Library
 *
 * Knowledge management for requirements across pipeline stages.
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

function getRequirementPath(requirementId: string, cwd?: string): string {
  return join(getKnowledgePath(cwd), requirementId);
}

function getKnowledgeDocPath(
  requirementId: string,
  category: KnowledgeCategory,
  doc: string,
  cwd?: string
): string {
  const reqPath = getRequirementPath(requirementId, cwd);
  return join(reqPath, category, `${doc}.md`);
}

// ============================================================
// Knowledge Index
// ============================================================

export function readKnowledgeIndex(cwd?: string): KnowledgeIndex {
  const path = getKnowledgeIndexPath(cwd);
  const index = readJsonFile<KnowledgeIndex>(path);
  return index || { requirements: {} };
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
// Knowledge Library Initialization
// ============================================================

export function initKnowledgeLibrary(
  requirementId: string,
  title: string,
  cwd?: string
): { isNew: boolean; title: string } {
  const index = readKnowledgeIndex(cwd);

  if (index.requirements[requirementId]) {
    index.requirements[requirementId].status = 'in_progress';
    index.requirements[requirementId].updated_at = new Date().toISOString();
    writeKnowledgeIndex(index, cwd);
    return { isNew: false, title: index.requirements[requirementId].title };
  }

  const now = new Date().toISOString();
  index.requirements[requirementId] = {
    title,
    status: 'in_progress',
    created_at: now,
    updated_at: now,
    domains: {},
  };

  writeKnowledgeIndex(index, cwd);

  const reqPath = getRequirementPath(requirementId, cwd);
  if (!existsSync(reqPath)) {
    mkdirSync(reqPath, { recursive: true });
  }

  return { isNew: true, title };
}

// ============================================================
// Knowledge Read/Write
// ============================================================

export function readKnowledgeDoc(
  requirementId: string,
  category: KnowledgeCategory,
  doc: string,
  cwd?: string
): string | null {
  const path = getKnowledgeDocPath(requirementId, category, doc, cwd);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

export function readAllKnowledgeDocs(
  requirementId: string,
  category: KnowledgeCategory,
  cwd?: string
): string | null {
  const reqPath = getRequirementPath(requirementId, cwd);
  const categoryPath = join(reqPath, category);

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
  requirementId: string,
  category: KnowledgeCategory,
  doc: string,
  content: string,
  mode: 'append' | 'update' | 'overwrite' = 'append',
  section?: string,
  cwd?: string
): void {
  const path = getKnowledgeDocPath(requirementId, category, doc, cwd);
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
  const req = index.requirements[requirementId];
  if (req) {
    req.updated_at = new Date().toISOString();
    if (!req.domains[category]) {
      req.domains[category] = [];
    }
    if (!req.domains[category].includes(doc)) {
      req.domains[category].push(doc);
    }
    writeKnowledgeIndex(index, cwd);
  }
}

// ============================================================
// Knowledge Exists
// ============================================================

export function knowledgeExists(
  requirementId: string,
  category?: KnowledgeCategory,
  doc?: string,
  cwd?: string
): boolean {
  if (!category) {
    const index = readKnowledgeIndex(cwd);
    return !!index.requirements[requirementId];
  }

  if (!doc) {
    const reqPath = getRequirementPath(requirementId, cwd);
    const categoryPath = join(reqPath, category);
    return existsSync(categoryPath);
  }

  const path = getKnowledgeDocPath(requirementId, category, doc, cwd);
  return existsSync(path);
}

// ============================================================
// Knowledge List
// ============================================================

export function listKnowledgeDocs(
  requirementId: string,
  category: KnowledgeCategory,
  cwd?: string
): string[] {
  const reqPath = getRequirementPath(requirementId, cwd);
  const categoryPath = join(reqPath, category);

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
// Requirement ID Helpers
// ============================================================

export function generateNextRequirementId(cwd?: string): string {
  const index = readKnowledgeIndex(cwd);
  const existingIds = Object.keys(index.requirements)
    .filter(id => id.startsWith('REQ-'))
    .map(id => {
      const num = parseInt(id.replace('REQ-', ''), 10);
      return isNaN(num) ? 0 : num;
    });

  const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  return `REQ-${String(nextNum).padStart(3, '0')}`;
}

export function findCandidateRequirements(
  index: KnowledgeIndex,
  query: string,
  threshold: number = 0.3
): Array<{ id: string; title: string; status: string; score: number }> {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const candidates: Array<{ id: string; title: string; status: string; score: number }> = [];

  for (const [id, req] of Object.entries(index.requirements)) {
    const titleWords = req.title.toLowerCase().split(/\s+/).filter(w => w.length > 1);

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

    if (score >= threshold) {
      candidates.push({
        id,
        title: req.title,
        status: req.status,
        score,
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}
