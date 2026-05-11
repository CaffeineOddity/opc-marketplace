/**
 * OPC Knowledge Library
 *
 * Knowledge management organized by feature (e.g., "hud", "state-management").
 * Each feature can have multiple category documents (architecture/main.md, design/ui.md, etc.)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { ensureOpcDir } from './paths.js';
import { readJsonFile, atomicWriteJson } from './io.js';
import { RECOMMENDED_CATEGORIES } from './types.js';
// ============================================================
// Knowledge Paths
// ============================================================
function getKnowledgePath(cwd) {
    return join(ensureOpcDir('', cwd), 'knowledge');
}
function getKnowledgeIndexPath(cwd) {
    return join(getKnowledgePath(cwd), 'index.json');
}
/**
 * Get the path to knowledge templates JSON.
 */
function getKnowledgeTemplatesPath() {
    if (typeof __dirname !== 'undefined') {
        return join(__dirname, 'statics', 'templates.json');
    }
    const entry = process.argv[1];
    const runtimeDir = (entry && typeof entry === 'string') ? dirname(entry) : process.cwd();
    return join(runtimeDir, 'statics', 'templates.json');
}
/**
 * Get the path to knowledge metadata JSON.
 */
function getKnowledgeMetadataPath() {
    if (typeof __dirname !== 'undefined') {
        return join(__dirname, 'statics', 'knowledge-metadata.json');
    }
    const entry = process.argv[1];
    const runtimeDir = (entry && typeof entry === 'string') ? dirname(entry) : process.cwd();
    return join(runtimeDir, 'statics', 'knowledge-metadata.json');
}
function validateKnowledgePathPart(value, field) {
    if (!value || typeof value !== 'string') {
        throw new Error(`Invalid ${field}: must be a non-empty string`);
    }
    if (value.includes('..')) {
        throw new Error(`Invalid ${field}: path traversal not allowed`);
    }
    if (value.includes('/') || value.includes('\\')) {
        throw new Error(`Invalid ${field}: path separators not allowed`);
    }
    if (value.includes('\0')) {
        throw new Error(`Invalid ${field}: null byte not allowed`);
    }
}
function getFeaturePath(featureName, cwd) {
    validateKnowledgePathPart(featureName, 'feature_name');
    return join(getKnowledgePath(cwd), featureName);
}
function getCategoryPath(featureName, category, cwd) {
    validateKnowledgePathPart(String(category), 'category');
    return join(getFeaturePath(featureName, cwd), String(category));
}
function getKnowledgeDocPath(featureName, category, doc, cwd) {
    validateKnowledgePathPart(String(category), 'category');
    validateKnowledgePathPart(doc, 'doc');
    const featurePath = getFeaturePath(featureName, cwd);
    return join(featurePath, String(category), `${doc}.md`);
}
// ============================================================
// Knowledge Index
// ============================================================
export function readKnowledgeIndex(cwd) {
    const path = getKnowledgeIndexPath(cwd);
    const index = readJsonFile(path);
    if (!index) {
        return { features: {} };
    }
    const raw = index;
    // Migration: Convert old 'requirements' / 'topics' to 'features'
    if ('features' in raw) {
        return index;
    }
    const topicsOrRequirements = (raw.topics ?? raw.requirements);
    if (!topicsOrRequirements || typeof topicsOrRequirements !== 'object') {
        const migratedIndex = { features: {} };
        writeKnowledgeIndex(migratedIndex, cwd);
        return migratedIndex;
    }
    const legacy = topicsOrRequirements;
    const migratedFeatures = {};
    for (const [featureName, data] of Object.entries(legacy)) {
        migratedFeatures[featureName] = {
            title: data.title,
            description: data.description,
            status: data.status,
            created_at: data.created_at,
            updated_at: data.updated_at,
            categories: data.categories || data.domains || {},
        };
    }
    const migratedIndex = { features: migratedFeatures };
    writeKnowledgeIndex(migratedIndex, cwd);
    return migratedIndex;
}
export function writeKnowledgeIndex(index, cwd) {
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
export function generateFeatureSlug(title) {
    // Category names to avoid as feature slugs
    const categoryNames = new Set(RECOMMENDED_CATEGORIES);
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
            // If collision, prefix with 'feature-'
            return `feature-${slug}`;
        }
        if (words.length === 1) {
            const word = words[0];
            // Avoid collision with category names
            if (!categoryNames.has(word)) {
                return word;
            }
            // If collision, prefix with 'feature-'
            return `feature-${word}`;
        }
    }
    // For Chinese or other languages, generate a slug based on timestamp
    return `feature-${Date.now().toString(36)}`;
}
/**
 * Find similar existing feature by title/description similarity.
 * Used for automatic knowledge feature matching.
 */
export function findSimilarKnowledgeFeature(taskTitle, taskDescription, cwd, threshold = 0.5) {
    const index = readKnowledgeIndex(cwd);
    const features = Object.entries(index.features);
    if (features.length === 0)
        return null;
    const query = `${taskTitle} ${taskDescription}`.toLowerCase();
    const queryWords = query.split(/\s+/).filter(w => w.length > 1);
    let bestMatch = null;
    for (const [slug, data] of features) {
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
            // Infer primary category from categories (first non-empty category)
            const categories = Object.keys(data.categories);
            const primaryCategory = categories.find(c => data.categories[c]?.length > 0);
            bestMatch = {
                feature_name: slug,
                title: data.title,
                score,
                category: primaryCategory
            };
        }
    }
    return bestMatch;
}
/**
 * Create a new knowledge feature.
 * Returns the created feature info.
 */
export function createFeature(featureName, title, description, cwd) {
    const index = readKnowledgeIndex(cwd);
    const now = new Date().toISOString();
    index.features[featureName] = {
        title,
        description,
        status: 'in_progress',
        created_at: now,
        updated_at: now,
        categories: {},
    };
    writeKnowledgeIndex(index, cwd);
    // Create feature directory
    const featurePath = getFeaturePath(featureName, cwd);
    if (!existsSync(featurePath)) {
        mkdirSync(featurePath, { recursive: true });
    }
    return { feature_name: featureName, title };
}
/**
 * Scaffold a knowledge feature with a standard document set.
 * Only creates missing docs (never overwrites existing files).
 */
export function scaffoldKnowledgeFeature(featureName, title, cwd, categories) {
    const templates = loadKnowledgeTemplates(cwd);
    const defaultCategories = Array.from(new Set(templates.map(t => t.category)));
    const targetCategories = (categories && categories.length > 0) ? categories : defaultCategories;
    const created = [];
    for (const category of targetCategories) {
        const categoryTemplates = templates.filter(t => t.category === category);
        const toCreate = categoryTemplates.length > 0
            ? categoryTemplates
            : [{
                    category,
                    doc: 'main',
                    meta: { name: `${category} 文档`, description: `该功能在 ${category} 分类下的说明文档。`, tags: [category] },
                    content: `## 内容\n\n- `,
                }];
        for (const t of toCreate) {
            if (readKnowledgeDoc(featureName, t.category, t.doc, cwd))
                continue;
            writeKnowledgeDoc(featureName, t.category, t.doc, t.content, 'overwrite', undefined, cwd, t.meta);
            created.push({ category: t.category, doc: t.doc });
        }
    }
    if (created.length > 0) {
        const index = readKnowledgeIndex(cwd);
        const featureData = index.features[featureName];
        if (featureData) {
            featureData.title = featureData.title || title;
            writeKnowledgeIndex(index, cwd);
        }
    }
    return { created };
}
/**
 * Load knowledge templates from build-in/mcp/templates.json.
 * Falls back to a minimal built-in template set if the JSON is missing or invalid.
 */
function loadKnowledgeTemplates(cwd) {
    const templatesPath = getKnowledgeTemplatesPath();
    const raw = readJsonFile(templatesPath);
    if (!raw || typeof raw !== 'object') {
        return [{
                category: 'requirement',
                doc: 'main',
                meta: { name: '需求说明', description: '需求与验收标准。', tags: ['requirement'] },
                content: `# WHAT\n\n- \n\n# WHY\n\n- \n\n## 验收标准\n\n- `,
            }];
    }
    const templatesRaw = raw.templates;
    if (!Array.isArray(templatesRaw)) {
        return [{
                category: 'requirement',
                doc: 'main',
                meta: { name: '需求说明', description: '需求与验收标准。', tags: ['requirement'] },
                content: `# WHAT\n\n- \n\n# WHY\n\n- \n\n## 验收标准\n\n- `,
            }];
    }
    const parsed = [];
    for (const item of templatesRaw) {
        if (!item || typeof item !== 'object')
            continue;
        const obj = item;
        const category = obj.category;
        const doc = obj.doc;
        const name = obj.name;
        const description = obj.description;
        const content = obj.content;
        const tags = obj.tags;
        if (typeof category !== 'string' || typeof doc !== 'string')
            continue;
        if (typeof name !== 'string' || typeof description !== 'string')
            continue;
        if (typeof content !== 'string')
            continue;
        const meta = {
            name,
            description,
            tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string') : undefined,
        };
        parsed.push({ category, doc, meta, content });
    }
    if (parsed.length > 0)
        return parsed;
    return [{
            category: 'requirement',
            doc: 'main',
            meta: { name: '需求说明', description: '需求与验收标准。', tags: ['requirement'] },
            content: `# WHAT\n\n- \n\n# WHY\n\n- \n\n## 验收标准\n\n- `,
        }];
}
/**
 * Check if a feature exists.
 */
export function featureExists(featureName, cwd) {
    const index = readKnowledgeIndex(cwd);
    return !!index.features[featureName];
}
/**
 * Get feature info by name
 */
export function getFeature(featureName, cwd) {
    const index = readKnowledgeIndex(cwd);
    return index.features[featureName] || null;
}
// ============================================================
// Knowledge Read/Write
// ============================================================
export function readKnowledgeDoc(featureName, category, doc, cwd) {
    const path = getKnowledgeDocPath(featureName, category, doc, cwd);
    if (!existsSync(path))
        return null;
    return readFileSync(path, 'utf-8');
}
export function readAllKnowledgeDocs(featureName, category, cwd) {
    const categoryPath = getCategoryPath(featureName, category, cwd);
    if (!existsSync(categoryPath))
        return null;
    const results = [];
    for (const docFile of readdirSync(categoryPath)) {
        if (!docFile.endsWith('.md'))
            continue;
        const content = readFileSync(join(categoryPath, docFile), 'utf-8');
        results.push(`## ${docFile}\n\n${content}`);
    }
    return results.length > 0 ? results.join('\n\n---\n\n') : null;
}
let cachedKnowledgeMetadata = null;
/**
 * Load knowledge metadata from statics/knowledge-metadata.json.
 */
function loadKnowledgeMetadata() {
    if (cachedKnowledgeMetadata)
        return cachedKnowledgeMetadata;
    const path = getKnowledgeMetadataPath();
    const raw = readJsonFile(path);
    const fallback = {
        category_names: {},
        doc_type_defaults: {},
    };
    if (!raw || typeof raw !== 'object') {
        cachedKnowledgeMetadata = fallback;
        return cachedKnowledgeMetadata;
    }
    const obj = raw;
    const categoryNames = obj.category_names;
    const docTypeDefaults = obj.doc_type_defaults;
    const parsed = {
        category_names: (categoryNames && typeof categoryNames === 'object') ? categoryNames : {},
        doc_type_defaults: (docTypeDefaults && typeof docTypeDefaults === 'object') ? docTypeDefaults : {},
    };
    cachedKnowledgeMetadata = parsed;
    return cachedKnowledgeMetadata;
}
/**
 * Get default metadata for a document type.
 */
function getDocTypeDefaults(doc, category) {
    const metadata = loadKnowledgeMetadata();
    const docDefaults = metadata.doc_type_defaults[doc];
    if (docDefaults)
        return docDefaults;
    const categoryLabel = metadata.category_names[category] || '';
    const prefix = categoryLabel ? `${categoryLabel}` : '';
    return {
        name: `${prefix}${doc}文档`,
        description: `描述${prefix}相关的${doc}内容。`,
    };
}
export function writeKnowledgeDoc(featureName, category, doc, content, mode = 'append', section, cwd, 
/** Optional metadata for frontmatter generation */
meta) {
    const path = getKnowledgeDocPath(featureName, category, doc, cwd);
    const dir = join(path, '..');
    const now = new Date().toISOString();
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    let finalContent = content;
    let existingMeta = {};
    // Handle existing document
    if (existsSync(path)) {
        const existing = readFileSync(path, 'utf-8');
        const parsed = parseFrontmatter(existing);
        existingMeta = parsed.meta;
        if (mode === 'append') {
            const timestamp = now.split('T')[0];
            finalContent = `${parsed.content}\n\n## ${timestamp}\n\n${content}`;
        }
        else if (mode === 'update' && section) {
            const sectionRegex = new RegExp(`(## ${section}[\\s]*\\n)([^#]*)(?=##|$)`, 'g');
            if (sectionRegex.test(parsed.content)) {
                finalContent = parsed.content.replace(sectionRegex, `$1${content}\n\n`);
            }
            else {
                finalContent = `${parsed.content}\n\n## ${section}\n\n${content}`;
            }
        }
        // overwrite mode: use new content directly
    }
    // Get feature info for default metadata
    const index = readKnowledgeIndex(cwd);
    const featureData = index.features[featureName];
    // Get document type defaults
    const docDefaults = getDocTypeDefaults(doc, category);
    // Build frontmatter metadata
    // Priority: explicit meta > existing meta > doc type defaults
    const frontmatterMeta = {
        name: meta?.name || existingMeta.name || docDefaults.name,
        description: meta?.description || existingMeta.description || docDefaults.description,
        category: meta?.category || category,
        feature_name: meta?.feature_name || existingMeta.feature_name || featureName,
        created_at: existingMeta.created_at || now,
        updated_at: now,
        tags: meta?.tags || existingMeta.tags,
    };
    // Prepend frontmatter to content
    const frontmatter = generateFrontmatter(frontmatterMeta);
    finalContent = `${frontmatter}\n${finalContent}`;
    writeFileSync(path, finalContent, 'utf-8');
    // Update index
    if (featureData) {
        featureData.updated_at = now;
        if (!featureData.categories[category]) {
            featureData.categories[category] = [];
        }
        if (!featureData.categories[category].includes(doc)) {
            featureData.categories[category].push(doc);
        }
        writeKnowledgeIndex(index, cwd);
    }
}
// ============================================================
// Knowledge Exists
// ============================================================
export function knowledgeExists(featureName, category, doc, cwd) {
    if (!category) {
        const index = readKnowledgeIndex(cwd);
        return !!index.features[featureName];
    }
    if (!doc) {
        const categoryPath = getCategoryPath(featureName, category, cwd);
        return existsSync(categoryPath);
    }
    const path = getKnowledgeDocPath(featureName, category, doc, cwd);
    return existsSync(path);
}
// ============================================================
// Frontmatter Processing
// ============================================================
/**
 * Parse YAML frontmatter from document content.
 * Returns metadata and content without frontmatter.
 */
export function parseFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    if (!match) {
        return { meta: {}, content };
    }
    const [, frontmatterStr, bodyContent] = match;
    const meta = {};
    // Parse simple YAML key-value pairs
    const lines = frontmatterStr.split('\n');
    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1)
            continue;
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();
        // Handle arrays (e.g., tags: [a, b, c])
        if (value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        }
        const normalizedKey = key === 'topic' ? 'feature_name'
            : key === 'featureName' ? 'feature_name'
                : key === 'createdAt' ? 'created_at'
                    : key === 'updatedAt' ? 'updated_at'
                        : key;
        meta[normalizedKey] = value;
    }
    return { meta, content: bodyContent };
}
/**
 * Generate YAML frontmatter string from metadata.
 */
export function generateFrontmatter(meta) {
    const lines = ['---'];
    lines.push(`name: ${meta.name}`);
    lines.push(`description: ${meta.description}`);
    lines.push(`category: ${meta.category}`);
    lines.push(`feature_name: ${meta.feature_name}`);
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
export function readKnowledgeDocWithMeta(featureName, category, doc, cwd) {
    const rawContent = readKnowledgeDoc(featureName, category, doc, cwd);
    if (!rawContent)
        return null;
    const { meta, content } = parseFrontmatter(rawContent);
    // Provide defaults if frontmatter missing
    return {
        meta: {
            name: meta.name || doc,
            description: meta.description || '',
            category: meta.category || category,
            feature_name: meta.feature_name || featureName,
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
export function listKnowledgeDocsBrief(featureName, category, cwd) {
    const index = readKnowledgeIndex(cwd);
    const results = [];
    const featuresToScan = featureName ? [featureName] : Object.keys(index.features);
    for (const f of featuresToScan) {
        const featureData = index.features[f];
        if (!featureData)
            continue;
        const categoriesToScan = category
            ? [category]
            : Object.keys(featureData.categories);
        for (const c of categoriesToScan) {
            const docs = featureData.categories[c] || [];
            for (const doc of docs) {
                // Try to read frontmatter, fall back to index data
                const docWithMeta = readKnowledgeDocWithMeta(f, c, doc, cwd);
                if (docWithMeta) {
                    results.push(docWithMeta.meta);
                }
                else {
                    // Fallback: create minimal metadata from index
                    results.push({
                        name: doc,
                        description: featureData.description || '',
                        category: c,
                        feature_name: f,
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
export function listKnowledgeDocs(featureName, category, cwd) {
    const categoryPath = getCategoryPath(featureName, category, cwd);
    if (!existsSync(categoryPath))
        return [];
    const docs = [];
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
export function rebuildKnowledgeIndex(cwd) {
    const knowledgePath = getKnowledgePath(cwd);
    const oldIndex = readKnowledgeIndex(cwd);
    const oldFeatures = Object.keys(oldIndex.features);
    const newIndex = { features: {} };
    const stats = {
        featuresFound: 0,
        categoriesFound: 0,
        docsFound: 0,
        featuresAdded: [],
        featuresRemoved: [],
    };
    // Check if knowledge directory exists
    if (!existsSync(knowledgePath)) {
        // No knowledge directory, return empty index
        writeKnowledgeIndex(newIndex, cwd);
        stats.featuresRemoved = oldFeatures;
        return { index: newIndex, stats };
    }
    // Scan all directories in knowledge path (each is a feature)
    const entries = readdirSync(knowledgePath, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        // Skip special directories (like .git, etc.)
        if (entry.name.startsWith('.'))
            continue;
        const featureName = entry.name;
        const featurePath = join(knowledgePath, featureName);
        // Scan categories within feature
        const categories = {};
        let featureUpdatedAt = '';
        let latestDocTime = 0;
        const categoryEntries = readdirSync(featurePath, { withFileTypes: true });
        for (const catEntry of categoryEntries) {
            if (!catEntry.isDirectory())
                continue;
            const categorySlug = catEntry.name;
            const categoryPath = join(featurePath, categorySlug);
            // Scan documents within category
            const docs = [];
            const docEntries = readdirSync(categoryPath, { withFileTypes: true });
            for (const docEntry of docEntries) {
                if (!docEntry.isFile() || !docEntry.name.endsWith('.md'))
                    continue;
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
                }
                catch {
                    // Ignore stat errors
                }
            }
            if (docs.length > 0) {
                categories[categorySlug] = docs.sort();
                stats.categoriesFound++;
            }
        }
        // Only add feature if it has documents
        if (Object.keys(categories).length > 0) {
            stats.featuresFound++;
            // Preserve existing metadata if available
            const existingFeature = oldIndex.features[featureName];
            const now = new Date().toISOString();
            // Try to extract title from frontmatter of first document found
            let title = existingFeature?.title || featureName;
            let description = existingFeature?.description || '';
            // Find first document to extract title from frontmatter
            if (!existingFeature?.title) {
                for (const [category, docs] of Object.entries(categories)) {
                    if (docs.length > 0) {
                        const docWithMeta = readKnowledgeDocWithMeta(featureName, category, docs[0], cwd);
                        if (docWithMeta?.meta.feature_name === featureName) {
                            title = featureName;
                            break;
                        }
                    }
                }
            }
            newIndex.features[featureName] = {
                title,
                description,
                status: existingFeature?.status || 'in_progress',
                created_at: existingFeature?.created_at || now,
                updated_at: latestDocTime > 0 ? new Date(latestDocTime).toISOString() : now,
                categories,
            };
            // Track if this is a new feature
            if (!oldFeatures.includes(featureName)) {
                stats.featuresAdded.push(featureName);
            }
        }
    }
    // Track removed features
    const newFeatures = Object.keys(newIndex.features);
    for (const oldFeature of oldFeatures) {
        if (!newFeatures.includes(oldFeature)) {
            stats.featuresRemoved.push(oldFeature);
        }
    }
    // Write the rebuilt index
    writeKnowledgeIndex(newIndex, cwd);
    return { index: newIndex, stats };
}
