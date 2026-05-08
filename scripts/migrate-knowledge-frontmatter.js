#!/usr/bin/env node

/**
 * Migrate existing knowledge documents to include YAML frontmatter.
 *
 * Usage: node scripts/migrate-knowledge-frontmatter.js
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const KNOWLEDGE_DIR = '.opc/knowledge';

function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { meta: {}, content };
  }

  const [, frontmatterStr, bodyContent] = match;
  const meta = {};

  const lines = frontmatterStr.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    }

    const normalizedKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    meta[normalizedKey] = value;
  }

  return { meta, content: bodyContent };
}

function generateFrontmatter(meta) {
  const lines = ['---'];

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

function migrateKnowledgeDocs() {
  const knowledgePath = join(process.cwd(), KNOWLEDGE_DIR);

  if (!existsSync(knowledgePath)) {
    console.log('No knowledge directory found.');
    return;
  }

  // Read index.json for metadata
  const indexPath = join(knowledgePath, 'index.json');
  let index = { topics: {} };

  if (existsSync(indexPath)) {
    try {
      index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    } catch (e) {
      console.log('Warning: Could not read index.json');
    }
  }

  let migratedCount = 0;

  // Iterate through topics
  for (const [topicSlug, topicData] of Object.entries(index.topics || {})) {
    const topicPath = join(knowledgePath, topicSlug);

    if (!existsSync(topicPath)) continue;

    // Iterate through categories
    for (const [category, docs] of Object.entries(topicData.domains || {})) {
      const categoryPath = join(topicPath, category);

      if (!existsSync(categoryPath)) continue;

      // Iterate through documents
      for (const doc of docs) {
        const docPath = join(categoryPath, `${doc}.md`);

        if (!existsSync(docPath)) continue;

        const rawContent = readFileSync(docPath, 'utf-8');
        const { meta, content } = parseFrontmatter(rawContent);

        // Skip if already has frontmatter
        if (meta.name && meta.description && meta.category && meta.topic) {
          console.log(`✓ ${topicSlug}/${category}/${doc}.md - already has frontmatter`);
          continue;
        }

        // Build frontmatter
        const now = new Date().toISOString();
        const frontmatterMeta = {
          name: meta.name || doc,
          description: meta.description || topicData.description || '',
          category: meta.category || category,
          topic: meta.topic || topicSlug,
          created_at: meta.created_at || topicData.created_at || now,
          updated_at: now,
          tags: meta.tags,
        };

        // Generate and write
        const frontmatter = generateFrontmatter(frontmatterMeta);
        const newContent = `${frontmatter}\n${content}`;

        writeFileSync(docPath, newContent, 'utf-8');
        console.log(`✓ ${topicSlug}/${category}/${doc}.md - migrated`);
        migratedCount++;
      }
    }
  }

  console.log(`\nMigration complete. ${migratedCount} documents updated.`);
}

migrateKnowledgeDocs();
