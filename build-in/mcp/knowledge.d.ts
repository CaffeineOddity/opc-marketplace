/**
 * OPC Knowledge Library
 *
 * Knowledge management organized by feature (e.g., "hud", "state-management").
 * Each feature can have multiple category documents (architecture/main.md, design/ui.md, etc.)
 */
import type { KnowledgeCategory, KnowledgeIndex, KnowledgeDocMeta, KnowledgeDocWithMeta } from './types.js';
export declare function readKnowledgeIndex(cwd?: string): KnowledgeIndex;
export declare function writeKnowledgeIndex(index: KnowledgeIndex, cwd?: string): void;
/**
 * Generate a topic slug from a title
 * e.g., "HUD 状态栏实时更新修复" -> "hud-status-bar"
 * e.g., "iOS多语言技术方案" -> "ios-localization"
 *
 * IMPORTANT: Avoids collision with category names (ios, android, web, etc.)
 */
export declare function generateFeatureSlug(title: string): string;
/**
 * Find similar existing feature by title/description similarity.
 * Used for automatic knowledge feature matching.
 */
export declare function findSimilarKnowledgeFeature(taskTitle: string, taskDescription: string, cwd?: string, threshold?: number): {
    feature_name: string;
    title: string;
    score: number;
    category?: string;
} | null;
/**
 * Create a new knowledge feature.
 * Returns the created feature info.
 */
export declare function createFeature(featureName: string, title: string, description: string, cwd?: string): {
    feature_name: string;
    title: string;
};
/**
 * Scaffold a knowledge feature with a standard document set.
 * Only creates missing docs (never overwrites existing files).
 */
export declare function scaffoldKnowledgeFeature(featureName: string, title: string, cwd?: string, categories?: KnowledgeCategory[]): {
    created: Array<{
        category: KnowledgeCategory;
        doc: string;
    }>;
};
/**
 * Check if a feature exists.
 */
export declare function featureExists(featureName: string, cwd?: string): boolean;
/**
 * Get feature info by name
 */
export declare function getFeature(featureName: string, cwd?: string): KnowledgeIndex['features'][string] | null;
export declare function readKnowledgeDoc(featureName: string, category: KnowledgeCategory, doc: string, cwd?: string): string | null;
export declare function readAllKnowledgeDocs(featureName: string, category: KnowledgeCategory, cwd?: string): string | null;
export declare function writeKnowledgeDoc(featureName: string, category: KnowledgeCategory, doc: string, content: string, mode?: 'append' | 'update' | 'overwrite', section?: string, cwd?: string, 
/** Optional metadata for frontmatter generation */
meta?: Partial<KnowledgeDocMeta>): void;
export declare function knowledgeExists(featureName: string, category?: KnowledgeCategory, doc?: string, cwd?: string): boolean;
/**
 * Parse YAML frontmatter from document content.
 * Returns metadata and content without frontmatter.
 */
export declare function parseFrontmatter(content: string): {
    meta: Partial<KnowledgeDocMeta>;
    content: string;
};
/**
 * Generate YAML frontmatter string from metadata.
 */
export declare function generateFrontmatter(meta: KnowledgeDocMeta): string;
/**
 * Read knowledge document with parsed frontmatter metadata.
 */
export declare function readKnowledgeDocWithMeta(featureName: string, category: KnowledgeCategory, doc: string, cwd?: string): KnowledgeDocWithMeta | null;
/**
 * List all knowledge documents with brief metadata.
 * Enables progressive loading without reading full content.
 */
export declare function listKnowledgeDocsBrief(featureName?: string, category?: KnowledgeCategory, cwd?: string): KnowledgeDocMeta[];
export declare function listKnowledgeDocs(featureName: string, category: KnowledgeCategory, cwd?: string): string[];
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
export declare function rebuildKnowledgeIndex(cwd?: string): {
    index: KnowledgeIndex;
    stats: {
        featuresFound: number;
        categoriesFound: number;
        docsFound: number;
        featuresAdded: string[];
        featuresRemoved: string[];
    };
};
