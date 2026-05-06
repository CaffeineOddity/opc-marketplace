/**
 * OPC Knowledge Library
 *
 * Knowledge management for requirements across pipeline stages.
 */
import type { KnowledgeCategory, KnowledgeIndex } from './types.js';
export declare function readKnowledgeIndex(cwd?: string): KnowledgeIndex;
export declare function writeKnowledgeIndex(index: KnowledgeIndex, cwd?: string): void;
export declare function initKnowledgeLibrary(requirementId: string, title: string, cwd?: string): {
    isNew: boolean;
    title: string;
};
export declare function readKnowledgeDoc(requirementId: string, category: KnowledgeCategory, doc: string, cwd?: string): string | null;
export declare function readAllKnowledgeDocs(requirementId: string, category: KnowledgeCategory, cwd?: string): string | null;
export declare function writeKnowledgeDoc(requirementId: string, category: KnowledgeCategory, doc: string, content: string, mode?: 'append' | 'update' | 'overwrite', section?: string, cwd?: string): void;
export declare function knowledgeExists(requirementId: string, category?: KnowledgeCategory, doc?: string, cwd?: string): boolean;
export declare function listKnowledgeDocs(requirementId: string, category: KnowledgeCategory, cwd?: string): string[];
export declare function generateNextRequirementId(cwd?: string): string;
export declare function findCandidateRequirements(index: KnowledgeIndex, query: string, threshold?: number): Array<{
    id: string;
    title: string;
    status: string;
    score: number;
}>;
