/**
 * OPC State Types
 *
 * Type definitions for OPC state management.
 */
// Recommended categories for reference (non-exhaustive)
export const RECOMMENDED_CATEGORIES = [
    'requirement',
    'architecture',
    'design',
    'tech_guide',
    'api_guide',
    'core_flows',
    'data_flows',
    'qa_test',
    'issues',
    'growth',
    'adr',
    'security',
    'operations',
    'observability',
    'release',
    'migration',
    'glossary',
    'research',
];
// ============================================================
// Pipeline Stages
// ============================================================
// Task stages for pipeline tracking
export const TASK_STAGES = ['product', 'design', 'dev', 'qa', 'ship', 'growth'];
// Stage status values
export const STAGE_STATUSES = ['pending', 'in_progress', 'completed', 'blocked'];
