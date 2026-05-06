/**
 * OPC Workflow Discovery and Matching
 *
 * Discovers workflow specs and matches tasks to workflows.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getWorkflowsPath } from './paths.js';
import { readJsonFile } from './io.js';
import type { WorkflowSpec, StageState, StageConfig, ProjectState } from './types.js';

// ============================================================
// Workflow Discovery
// ============================================================

/**
 * Read all workflow specs from .opc/workflows/ directory.
 */
export function readAllWorkflows(cwd?: string): WorkflowSpec[] {
  const workflowsDir = getWorkflowsPath(cwd);
  if (!existsSync(workflowsDir)) return [];

  const workflows: WorkflowSpec[] = [];
  const files = readdirSync(workflowsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const path = join(workflowsDir, file);
    const spec = readJsonFile<WorkflowSpec>(path);
    if (spec) {
      workflows.push(spec);
    }
  }

  return workflows;
}

// ============================================================
// Workflow Matching
// ============================================================

/**
 * Match a task description against workflow triggers.
 */
export function matchWorkflow(
  taskDescription: string,
  workflows: WorkflowSpec[]
): { workflow: WorkflowSpec; score: number } | null {
  const lowerTask = taskDescription.toLowerCase();
  let bestMatch: { workflow: WorkflowSpec; score: number } | null = null;

  for (const workflow of workflows) {
    let score = 0;

    // Check keyword matches
    for (const keyword of workflow.triggers.keywords) {
      if (lowerTask.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    // Check regex patterns
    for (const pattern of workflow.triggers.patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(taskDescription)) {
          score += 2;
        }
      } catch {
        // Invalid regex, skip
      }
    }

    const totalTriggers = workflow.triggers.keywords.length + workflow.triggers.patterns.length;
    const normalizedScore = totalTriggers > 0 ? score / totalTriggers : 0;

    if (normalizedScore > 0 && (!bestMatch || normalizedScore > bestMatch.score)) {
      bestMatch = { workflow, score: normalizedScore };
    }
  }

  return bestMatch;
}

// ============================================================
// Stage Building
// ============================================================

/**
 * Build stages from a matched workflow.
 */
export function buildStagesFromWorkflow(workflow: WorkflowSpec): Record<string, StageState> {
  const stages: Record<string, StageState> = {};

  for (const stageDef of workflow.pipeline) {
    stages[stageDef.stage] = {
      status: 'pending',
      config: {
        required: stageDef.required,
        outputs: stageDef.outputs,
        optional_outputs: stageDef.optional_outputs,
        agents: stageDef.agents,
        agent_mode: stageDef.agent_mode,
        skills: stageDef.skills,
        skip_conditions: stageDef.skip_conditions,
        constraints: stageDef.constraints,
        description: stageDef.description,
        knowledge: stageDef.knowledge,
      },
      gates_passed: [],
      gates_blocked: [],
    };
  }

  return stages;
}

/**
 * Build stages automatically when no workflow matches.
 */
export function buildStagesAuto(taskDescription: string): Record<string, StageState> {
  const lowerTask = taskDescription.toLowerCase();
  const stages: Record<string, StageState> = {};

  // Always start with product stage
  stages.product = {
    status: 'pending',
    config: {
      required: true,
      outputs: ['spec.md'],
      agents: ['product-agent'],
      skills: ['spec-driven-development'],
      description: '需求分析和规格定义',
      knowledge: {
        domain: 'requirement',
        doc: 'main',
        read_before: false,
        write_after: true,
      },
    },
    gates_passed: [],
    gates_blocked: [],
  };

  // Detect if design is needed
  const designKeywords = ['ui', '界面', '设计', '页面', 'landing', 'dashboard', '前端', 'web', 'app', '移动'];
  const needsDesign = designKeywords.some(kw => lowerTask.includes(kw));

  if (needsDesign) {
    stages.design = {
      status: 'pending',
      config: {
        required: false,
        outputs: ['design-spec.md'],
        agents: ['web-agent', 'mobile-agent'],
        skills: ['ui-design'],
        description: 'UI/UX 设计',
        knowledge: {
          domain: 'design',
          doc: 'ui',
          read_before: ['requirement'],
          write_after: true,
        },
      },
      gates_passed: [],
      gates_blocked: [],
    };
  }

  // Detect if dev is needed
  const devKeywords = ['实现', '开发', '添加', '新增', '功能', 'build', 'create', 'implement', 'feature'];
  const backendKeywords = ['api', '后端', 'backend', '服务', 'server', '接口'];
  const needsDev = devKeywords.some(kw => lowerTask.includes(kw)) || backendKeywords.some(kw => lowerTask.includes(kw));

  if (needsDev) {
    stages.dev = {
      status: 'pending',
      config: {
        required: true,
        outputs: ['tests/', 'implementation'],
        agents: backendKeywords.some(kw => lowerTask.includes(kw))
          ? ['backend-agent']
          : ['frontend-agent', 'backend-agent'],
        agent_mode: 'parallel',
        skills: ['test-driven-development'],
        constraints: ['tdd_red_first'],
        description: 'TDD 开发',
        knowledge: {
          frontend: {
            domain: 'platforms',
            platform: 'web',
            doc: 'tech',
            read_before: ['requirement', 'design'],
            write_after: true,
          },
          backend: {
            domain: 'backend',
            doc: 'api',
            read_before: ['requirement'],
            write_after: true,
          },
        },
      },
      gates_passed: [],
      gates_blocked: [],
    };
  }

  // Detect if qa is needed
  const qaKeywords = ['测试', 'test', 'qa', '验证'];
  const needsQa = qaKeywords.some(kw => lowerTask.includes(kw)) || needsDev;

  if (needsQa) {
    stages.qa = {
      status: 'pending',
      config: {
        required: true,
        outputs: ['test-report.md'],
        agents: ['qa-agent'],
        skills: ['test-plan'],
        description: '测试验证',
        knowledge: {
          domain: 'backend',
          doc: 'test',
          read_before: ['platforms/web/tech', 'backend/api'],
          write_after: true,
        },
      },
      gates_passed: [],
      gates_blocked: [],
    };
  }

  // Detect if ship is needed
  const shipKeywords = ['部署', 'deploy', '发布', 'release', '上线'];
  const needsShip = shipKeywords.some(kw => lowerTask.includes(kw));

  if (needsShip) {
    stages.ship = {
      status: 'pending',
      config: {
        required: false,
        outputs: ['deployment'],
        agents: ['devops-agent'],
        skills: ['deploy'],
        description: '部署',
        knowledge: {
          domain: 'shared',
          doc: 'infrastructure',
          read_before: ['backend/api'],
          write_after: true,
        },
      },
      gates_passed: [],
      gates_blocked: [],
    };
  }

  // Ensure at least product stage exists
  if (Object.keys(stages).length === 0) {
    stages.product = {
      status: 'pending',
      config: {
        required: true,
        description: '任务分析',
      },
      gates_passed: [],
      gates_blocked: [],
    };
  }

  return stages;
}

/**
 * Build default gates for auto-assembled pipeline.
 */
export function buildDefaultGates(stages: Record<string, StageState>): ProjectState['gates'] {
  const gates: ProjectState['gates'] = [];

  if (stages.product) {
    gates.push({
      name: 'sdd_spec_required',
      description: 'Product 必须产出 Spec，否则 Dev 无法开始',
      check: "stages.product.artifacts.includes('spec.md')",
      blocker: 'Dev 阻止：缺少 Spec。请先在 Product 阶段完成规格定义。',
    });
  }

  if (stages.dev?.config?.constraints?.includes('tdd_red_first')) {
    gates.push({
      name: 'tdd_red_first',
      description: '必须先写失败测试',
      check: 'stages.dev.progress.red_complete === true',
      blocker: '实现阻止：请先写失败测试（RED 阶段）。',
    });
  }

  return gates.length > 0 ? gates : undefined;
}
