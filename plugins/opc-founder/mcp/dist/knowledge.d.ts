/**
 * OPC Knowledge Library
 *
 * Knowledge management organized by topic (e.g., "hud", "state-management").
 * Each topic can have multiple domain documents (backend.md, design.md, etc.)
 */
import type { KnowledgeCategory, KnowledgeIndex } from './types.js';
export declare function readKnowledgeIndex(cwd?: string): KnowledgeIndex;
export declare function writeKnowledgeIndex(index: KnowledgeIndex, cwd?: string): void;
/**
 * Generate a topic slug from a title
 * e.g., "HUD 状态栏实时更新修复" -> "hud"
 * e.g., "State Management" -> "state-management"
 */
export declare function generateTopicSlug(title: string): string;
/**
 * Find or create a topic for a given task
 * Returns the topic slug
 */
export declare function findOrCreateTopic(taskTitle: string, taskDescription: string, cwd?: string): {
    topic: string;
    isNew: boolean;
    title: string;
};
/**
 * Get topic info by slug
 */
export declare function getTopic(topic: string, cwd?: string): KnowledgeIndex['topics'][string] | null;
export declare function readKnowledgeDoc(topic: string, category: KnowledgeCategory, doc: string, cwd?: string): string | null;
export declare function readAllKnowledgeDocs(topic: string, category: KnowledgeCategory, cwd?: string): string | null;
export declare function writeKnowledgeDoc(topic: string, category: KnowledgeCategory, doc: string, content: string, mode?: 'append' | 'update' | 'overwrite', section?: string, cwd?: string): void;
export declare function knowledgeExists(topic: string, category?: KnowledgeCategory, doc?: string, cwd?: string): boolean;
export declare function listKnowledgeDocs(topic: string, category: KnowledgeCategory, cwd?: string): string[];
