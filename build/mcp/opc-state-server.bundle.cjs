// ../../build/mcp/index.js
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_types4 = require("@modelcontextprotocol/sdk/types.js");

// ../../build/mcp/types.js
var RECOMMENDED_CATEGORIES = [
  "requirement",
  "design",
  "backend",
  "ios",
  "android",
  "harmony",
  "web",
  "miniprogram",
  "qa",
  "ship",
  "growth",
  "bug-fix",
  "issue",
  "tech-doc",
  "guide",
  "api",
  "architecture"
];
var TASK_STAGES = ["product", "design", "dev", "qa", "ship", "growth"];
var STAGE_STATUSES = ["pending", "in_progress", "completed", "blocked"];

// ../../build/mcp/tools.js
var stateTools = [
  {
    name: "opc_state_read",
    description: "Read the current OPC project state. Shows pipeline progress, stage status, and agent activity.",
    inputSchema: {
      type: "object",
      properties: {
        workingDirectory: { type: "string", description: "Working directory (defaults to cwd)" }
      }
    }
  },
  {
    name: "opc_state_write",
    description: "Update OPC project state. Used by founder-agent to track pipeline progress and set knowledge topic.",
    inputSchema: {
      type: "object",
      properties: {
        project_name: { type: "string", description: "Project name (for new projects)" },
        project_description: { type: "string", description: "Project description" },
        knowledge_topic: { type: "string", description: 'Knowledge topic to associate with this task (e.g., "ios-localization")' },
        stage: { type: "string", enum: [...TASK_STAGES] },
        stage_status: { type: "string", enum: [...STAGE_STATUSES] },
        agent: { type: "string", description: "Agent name to record" },
        artifact: { type: "string", description: "Artifact path to record" },
        progress: { type: "object", description: "Progress percentages by subtask" },
        blocker: { type: "string", description: "Blocker description" },
        workingDirectory: { type: "string" }
      }
    }
  },
  {
    name: "opc_state_init",
    description: "Initialize a new OPC project state with automatic knowledge library association. Creates pipeline tracking and links to requirement ID. One task per window. Skills should first check opc_sessions_list, opc_knowledge_list to decide whether to reuse existing resources or create new ones. Automatically matches workflows from .opc/workflows/ directory.",
    inputSchema: {
      type: "object",
      properties: {
        project_name: { type: "string", description: "Project name" },
        project_description: { type: "string", description: "Project description" },
        workingDirectory: { type: "string" }
      },
      required: ["project_name"]
    }
  },
  {
    name: "opc_state_clear",
    description: "Clear current task. Use when abandoning or restarting. The task will be permanently removed.",
    inputSchema: {
      type: "object",
      properties: {
        workingDirectory: { type: "string" }
      }
    }
  }
];
var handoffTools = [
  {
    name: "opc_handoff",
    description: "Hand off work from one agent to another. Preserves context and constraints.",
    inputSchema: {
      type: "object",
      properties: {
        from_agent: { type: "string", description: "Agent handing off work" },
        to_agent: { type: "string", description: "Agent receiving work" },
        artifacts: { type: "array", items: { type: "string" }, description: "Artifacts being handed off" },
        constraints: { type: "array", items: { type: "string" }, description: "Constraints for receiving agent" },
        context: { type: "string", description: "Additional context" },
        workingDirectory: { type: "string" }
      },
      required: ["from_agent", "to_agent", "artifacts"]
    }
  }
];
var sessionTools = [
  {
    name: "opc_sessions_list",
    description: "List all OPC tasks. Shows task name, current stage, and status.",
    inputSchema: {
      type: "object",
      properties: {
        workingDirectory: { type: "string" }
      }
    }
  }
];
var taskGroupTools = [
  {
    name: "opc_task_group_create",
    description: "Create a parallel task group for a stage. Enables tracking multiple concurrent agents.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string", enum: [...TASK_STAGES] },
        group_name: { type: "string", description: "Name for this task group" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              agent: { type: "string", description: "Agent assigned to this task" },
              description: { type: "string", description: "Task description" },
              dependencies: { type: "array", items: { type: "string" }, description: "Task IDs this depends on" }
            },
            required: ["agent", "description"]
          },
          description: "Tasks in this group"
        },
        parallel: { type: "boolean", description: "Run tasks in parallel (default: true)" },
        completion_condition: { type: "string", enum: ["all", "any", "threshold"], description: "When group is complete" },
        threshold: { type: "number", description: "For threshold condition, min completed tasks" },
        workingDirectory: { type: "string" }
      },
      required: ["stage", "group_name", "tasks"]
    }
  },
  {
    name: "opc_task_update",
    description: "Update a parallel task status. Used by agents to report progress.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task ID to update" },
        status: { type: "string", enum: ["pending", "in_progress", "completed", "failed"], description: "New status" },
        progress: { type: "number", description: "Progress percentage (0-100)" },
        artifact: { type: "string", description: "Artifact produced by this task" },
        workingDirectory: { type: "string" }
      },
      required: ["task_id", "status"]
    }
  },
  {
    name: "opc_task_group_status",
    description: "Get status of a task group. Shows progress of all parallel tasks.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string", enum: [...TASK_STAGES], description: "Stage name" },
        group_id: { type: "string", description: "Group ID (optional, shows all if omitted)" },
        workingDirectory: { type: "string" }
      }
    }
  }
];
var workflowTools = [
  {
    name: "opc_workflows_path",
    description: "Get the workflows directory path. Always uses git toplevel root for consistency.",
    inputSchema: {
      type: "object",
      properties: {
        workingDirectory: { type: "string" }
      }
    }
  }
];
var CATEGORY_EXAMPLES = RECOMMENDED_CATEGORIES.slice(0, 8).join(", ");
var CATEGORY_DESCRIPTION = `Knowledge category. Examples: ${CATEGORY_EXAMPLES}. You can also use custom categories.`;
var knowledgeTools = [
  {
    name: "opc_knowledge_init",
    description: "Initialize knowledge library for a topic. Creates directory structure and index entry.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Topic title (can be Chinese or English)" },
        en_topic_name: { type: "string", description: 'English topic name for directory naming (e.g., "localization", "app-login", "image-upload-r2")' },
        workingDirectory: { type: "string" }
      },
      required: ["title", "en_topic_name"]
    }
  },
  {
    name: "opc_knowledge_read",
    description: "Read knowledge from knowledge library. Can read specific doc or all docs in a category. Uses topic from current task if not specified.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Knowledge topic (uses current task topic if not specified)" },
        category: { type: "string", description: CATEGORY_DESCRIPTION },
        doc: { type: "string", description: "Document name (without .md extension)" },
        workingDirectory: { type: "string" }
      },
      required: ["category"]
    }
  },
  {
    name: "opc_knowledge_write",
    description: "Write or update knowledge document. Uses topic from current task if not specified. Supports append, update section, or overwrite. IMPORTANT: Provide name and description for clear document identification.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Knowledge topic (uses current task topic if not specified)" },
        category: { type: "string", description: CATEGORY_DESCRIPTION },
        doc: { type: "string", description: "Document name (without .md extension)" },
        content: { type: "string", description: "Content to write" },
        name: { type: "string", description: 'Document title (human-readable name, e.g., "\u6280\u672F\u67B6\u6784\u6587\u6863", "API\u63A5\u53E3\u6587\u6863")' },
        description: { type: "string", description: "Brief description of the document content" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags for filtering" },
        section: { type: "string", description: "Section header to update (optional)" },
        mode: { type: "string", enum: ["append", "update", "overwrite"], description: "Write mode (default: append)" },
        workingDirectory: { type: "string" }
      },
      required: ["category", "doc", "content", "name", "description", "tags"]
    }
  },
  {
    name: "opc_knowledge_exists",
    description: "Check if knowledge document exists. Uses topic from current task if not specified.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Knowledge topic (uses current task topic if not specified)" },
        category: { type: "string", description: CATEGORY_DESCRIPTION },
        doc: { type: "string", description: "Document name" },
        workingDirectory: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "opc_knowledge_list",
    description: "List topics in knowledge library.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["in_progress", "completed", "paused"], description: "Filter by status" },
        category: { type: "string", description: CATEGORY_DESCRIPTION },
        workingDirectory: { type: "string" }
      }
    }
  },
  {
    name: "opc_knowledge_docs",
    description: "List available documents in a category. Uses topic from current task if not specified.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Knowledge topic (uses current task topic if not specified)" },
        category: { type: "string", description: CATEGORY_DESCRIPTION },
        workingDirectory: { type: "string" }
      },
      required: ["category"]
    }
  },
  {
    name: "opc_knowledge_list_brief",
    description: "List all knowledge documents with brief metadata (name, description, topic, category). Enables progressive loading without reading full document content.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Filter by topic" },
        category: { type: "string", description: CATEGORY_DESCRIPTION },
        workingDirectory: { type: "string" }
      }
    }
  },
  {
    name: "opc_knowledge_rebuild_index",
    description: "Rebuild the knowledge library index.json from the filesystem. Use when index is corrupted, missing, or out of sync with actual files. Scans all topic directories and reconstructs the index with current filesystem state.",
    inputSchema: {
      type: "object",
      properties: {
        workingDirectory: { type: "string" }
      }
    }
  }
];
var tools = [
  ...stateTools,
  ...handoffTools,
  ...sessionTools,
  ...taskGroupTools,
  ...workflowTools,
  ...knowledgeTools
];

// ../../build/mcp/lock.js
var import_fs2 = require("fs");
var import_path2 = require("path");
var import_fs3 = require("fs");

// ../../build/mcp/paths.js
var import_path = require("path");
var import_fs = require("fs");
var OPC_PATHS = {
  ROOT: ".opc",
  STATE: ".opc/state",
  SESSIONS: ".opc/state/sessions",
  LOCKS: ".opc/state/locks",
  ARTIFACTS: ".opc/artifacts",
  LOGS: ".opc/logs",
  WORKFLOWS: ".opc/workflows",
  KNOWLEDGE: ".opc/knowledge"
};
function getWorktreeRoot(cwd) {
  const effectiveCwd = cwd || process.cwd();
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse --show-toplevel", {
      cwd: effectiveCwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return effectiveCwd;
  }
}
function getWorkflowsPath(cwd) {
  const root = getWorktreeRoot(cwd);
  return (0, import_path.join)(root, OPC_PATHS.WORKFLOWS);
}
function ensureWorkflowsDir(cwd) {
  const root = getWorktreeRoot(cwd);
  const dir = (0, import_path.join)(root, OPC_PATHS.WORKFLOWS);
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
  return dir;
}
function ensureOpcDir(subdir, cwd) {
  const root = getWorktreeRoot(cwd);
  const dir = (0, import_path.join)(root, OPC_PATHS.ROOT, subdir);
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
  return dir;
}

// ../../build/mcp/lock.js
var processSessionId = null;
function getProcessSessionId() {
  if (!processSessionId) {
    const pid = process.pid;
    const startTime = Date.now();
    processSessionId = `pid-${pid}-${startTime}`;
  }
  return processSessionId;
}
function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "EPERM") {
      return true;
    }
    return false;
  }
}
var O_CREAT = import_fs3.constants.O_CREAT;
var O_EXCL = import_fs3.constants.O_EXCL;
var O_WRONLY = import_fs3.constants.O_WRONLY;
var DEFAULT_STALE_LOCK_MS = 3e4;
var currentLockId = null;
function getLockPath(lockId, cwd) {
  const lockDir = ensureOpcDir("state/locks", cwd);
  return (0, import_path2.join)(lockDir, `${lockId}.lock`);
}
function isLockStale(lockPath, staleLockMs = DEFAULT_STALE_LOCK_MS) {
  try {
    const stat = (0, import_fs2.statSync)(lockPath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < staleLockMs)
      return false;
    try {
      const raw = (0, import_fs2.readFileSync)(lockPath, "utf-8");
      const payload = JSON.parse(raw);
      if (payload.pid && isProcessAlive(payload.pid)) {
        return false;
      }
    } catch {
    }
    return true;
  } catch {
    return false;
  }
}
function acquireWindowLock(cwd) {
  if (currentLockId) {
    return currentLockId;
  }
  const lockId = getProcessSessionId();
  const lockPath = getLockPath(lockId, cwd);
  const lockDir = (0, import_path2.dirname)(lockPath);
  if (!(0, import_fs2.existsSync)(lockDir)) {
    (0, import_fs2.mkdirSync)(lockDir, { recursive: true });
  }
  try {
    const fd = (0, import_fs2.openSync)(lockPath, O_CREAT | O_EXCL | O_WRONLY, 384);
    const payload = JSON.stringify({
      lockId,
      pid: process.pid,
      timestamp: Date.now()
    });
    (0, import_fs2.writeSync)(fd, payload, null, "utf-8");
    (0, import_fs2.closeSync)(fd);
    currentLockId = lockId;
    return lockId;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "EEXIST") {
      if (isLockStale(lockPath)) {
        try {
          (0, import_fs2.unlinkSync)(lockPath);
          return acquireWindowLock(cwd);
        } catch {
          currentLockId = lockId;
          return lockId;
        }
      }
      currentLockId = lockId;
      return lockId;
    }
    throw err;
  }
}
function getCurrentLockId(cwd) {
  if (!currentLockId) {
    currentLockId = acquireWindowLock(cwd);
  }
  return currentLockId;
}

// ../../build/mcp/workflow.js
var import_fs5 = require("fs");
var import_path4 = require("path");

// ../../build/mcp/io.js
var import_fs4 = require("fs");
var import_path3 = require("path");
function atomicWriteJson(filePath, data) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  (0, import_fs4.writeFileSync)(tempPath, JSON.stringify(data, null, 2), { mode: 384 });
  (0, import_fs4.renameSync)(tempPath, filePath);
}
function readJsonFile(filePath) {
  if (!(0, import_fs4.existsSync)(filePath))
    return null;
  try {
    const content = (0, import_fs4.readFileSync)(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function updateGitignore(cwd) {
  const root = getWorktreeRoot(cwd);
  const gitignorePath = (0, import_path3.join)(root, ".gitignore");
  const OPC_GITIGNORE_ENTRY = `
# OPC state - personal session data, don't commit
.opc/state/
`;
  if (!(0, import_fs4.existsSync)(gitignorePath)) {
    (0, import_fs4.writeFileSync)(gitignorePath, OPC_GITIGNORE_ENTRY);
    return true;
  }
  const content = (0, import_fs4.readFileSync)(gitignorePath, "utf-8");
  if (content.includes(".opc/state/")) {
    return false;
  }
  (0, import_fs4.writeFileSync)(gitignorePath, content + OPC_GITIGNORE_ENTRY);
  return true;
}

// ../../build/mcp/workflow.js
function readAllWorkflows(cwd) {
  const workflowsDir = getWorkflowsPath(cwd);
  if (!(0, import_fs5.existsSync)(workflowsDir))
    return [];
  const workflows = [];
  const files = (0, import_fs5.readdirSync)(workflowsDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const path = (0, import_path4.join)(workflowsDir, file);
    const spec = readJsonFile(path);
    if (spec) {
      workflows.push(spec);
    }
  }
  return workflows;
}
function matchWorkflow(taskDescription, workflows) {
  const lowerTask = taskDescription.toLowerCase();
  let bestMatch = null;
  for (const workflow of workflows) {
    let score = 0;
    for (const keyword of workflow.triggers.keywords) {
      if (lowerTask.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    for (const pattern of workflow.triggers.patterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(taskDescription)) {
          score += 2;
        }
      } catch {
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
function buildStagesFromWorkflow(workflow) {
  const stages = {};
  for (const stageDef of workflow.pipeline) {
    stages[stageDef.stage] = {
      status: "pending",
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
        knowledge: stageDef.knowledge
      },
      gates_passed: [],
      gates_blocked: []
    };
  }
  return stages;
}
function buildStagesAuto(taskDescription) {
  const lowerTask = taskDescription.toLowerCase();
  const stages = {};
  stages.product = {
    status: "pending",
    config: {
      required: true,
      outputs: ["spec.md"],
      agents: ["product-agent"],
      skills: ["spec-driven-development"],
      description: "\u9700\u6C42\u5206\u6790\u548C\u89C4\u683C\u5B9A\u4E49",
      knowledge: {
        domain: "requirement",
        doc: "main",
        read_before: false,
        write_after: true
      }
    },
    gates_passed: [],
    gates_blocked: []
  };
  const designKeywords = ["ui", "\u754C\u9762", "\u8BBE\u8BA1", "\u9875\u9762", "landing", "dashboard", "\u524D\u7AEF", "web", "app", "\u79FB\u52A8"];
  const needsDesign = designKeywords.some((kw) => lowerTask.includes(kw));
  if (needsDesign) {
    stages.design = {
      status: "pending",
      config: {
        required: false,
        outputs: ["design-spec.md"],
        agents: ["web-agent", "mobile-agent"],
        skills: ["ui-design"],
        description: "UI/UX \u8BBE\u8BA1",
        knowledge: {
          domain: "design",
          doc: "ui",
          read_before: ["requirement"],
          write_after: true
        }
      },
      gates_passed: [],
      gates_blocked: []
    };
  }
  const devKeywords = ["\u5B9E\u73B0", "\u5F00\u53D1", "\u6DFB\u52A0", "\u65B0\u589E", "\u529F\u80FD", "build", "create", "implement", "feature"];
  const backendKeywords = ["api", "\u540E\u7AEF", "backend", "\u670D\u52A1", "server", "\u63A5\u53E3"];
  const needsDev = devKeywords.some((kw) => lowerTask.includes(kw)) || backendKeywords.some((kw) => lowerTask.includes(kw));
  if (needsDev) {
    stages.dev = {
      status: "pending",
      config: {
        required: true,
        outputs: ["tests/", "implementation"],
        agents: backendKeywords.some((kw) => lowerTask.includes(kw)) ? ["backend-agent"] : ["frontend-agent", "backend-agent"],
        agent_mode: "parallel",
        skills: ["test-driven-development"],
        constraints: ["tdd_red_first"],
        description: "TDD \u5F00\u53D1",
        knowledge: {
          frontend: {
            domain: "platforms",
            platform: "web",
            doc: "tech",
            read_before: ["requirement", "design"],
            write_after: true
          },
          backend: {
            domain: "backend",
            doc: "api",
            read_before: ["requirement"],
            write_after: true
          }
        }
      },
      gates_passed: [],
      gates_blocked: []
    };
  }
  const qaKeywords = ["\u6D4B\u8BD5", "test", "qa", "\u9A8C\u8BC1"];
  const needsQa = qaKeywords.some((kw) => lowerTask.includes(kw)) || needsDev;
  if (needsQa) {
    stages.qa = {
      status: "pending",
      config: {
        required: true,
        outputs: ["test-report.md"],
        agents: ["qa-agent"],
        skills: ["test-plan"],
        description: "\u6D4B\u8BD5\u9A8C\u8BC1",
        knowledge: {
          domain: "backend",
          doc: "test",
          read_before: ["platforms/web/tech", "backend/api"],
          write_after: true
        }
      },
      gates_passed: [],
      gates_blocked: []
    };
  }
  const shipKeywords = ["\u90E8\u7F72", "deploy", "\u53D1\u5E03", "release", "\u4E0A\u7EBF"];
  const needsShip = shipKeywords.some((kw) => lowerTask.includes(kw));
  if (needsShip) {
    stages.ship = {
      status: "pending",
      config: {
        required: false,
        outputs: ["deployment"],
        agents: ["devops-agent"],
        skills: ["deploy"],
        description: "\u90E8\u7F72",
        knowledge: {
          domain: "shared",
          doc: "infrastructure",
          read_before: ["backend/api"],
          write_after: true
        }
      },
      gates_passed: [],
      gates_blocked: []
    };
  }
  if (Object.keys(stages).length === 0) {
    stages.product = {
      status: "pending",
      config: {
        required: true,
        description: "\u4EFB\u52A1\u5206\u6790"
      },
      gates_passed: [],
      gates_blocked: []
    };
  }
  return stages;
}
function buildDefaultGates(stages) {
  const gates = [];
  if (stages.product) {
    gates.push({
      name: "sdd_spec_required",
      description: "Product \u5FC5\u987B\u4EA7\u51FA Spec\uFF0C\u5426\u5219 Dev \u65E0\u6CD5\u5F00\u59CB",
      check: "stages.product.artifacts.includes('spec.md')",
      blocker: "Dev \u963B\u6B62\uFF1A\u7F3A\u5C11 Spec\u3002\u8BF7\u5148\u5728 Product \u9636\u6BB5\u5B8C\u6210\u89C4\u683C\u5B9A\u4E49\u3002"
    });
  }
  if (stages.dev?.config?.constraints?.includes("tdd_red_first")) {
    gates.push({
      name: "tdd_red_first",
      description: "\u5FC5\u987B\u5148\u5199\u5931\u8D25\u6D4B\u8BD5",
      check: "stages.dev.progress.red_complete === true",
      blocker: "\u5B9E\u73B0\u963B\u6B62\uFF1A\u8BF7\u5148\u5199\u5931\u8D25\u6D4B\u8BD5\uFF08RED \u9636\u6BB5\uFF09\u3002"
    });
  }
  return gates.length > 0 ? gates : void 0;
}

// ../../build/mcp/knowledge.js
var import_fs6 = require("fs");
var import_path5 = require("path");
function getKnowledgePath(cwd) {
  return (0, import_path5.join)(ensureOpcDir("", cwd), "knowledge");
}
function getKnowledgeIndexPath(cwd) {
  return (0, import_path5.join)(getKnowledgePath(cwd), "index.json");
}
function getTopicPath(topic, cwd) {
  return (0, import_path5.join)(getKnowledgePath(cwd), topic);
}
function getKnowledgeDocPath(topic, category, doc, cwd) {
  const topicPath = getTopicPath(topic, cwd);
  return (0, import_path5.join)(topicPath, category, `${doc}.md`);
}
function readKnowledgeIndex(cwd) {
  const path = getKnowledgeIndexPath(cwd);
  const index = readJsonFile(path);
  if (!index) {
    return { topics: {} };
  }
  if ("requirements" in index && !("topics" in index)) {
    const legacyIndex = index;
    const migratedIndex = { topics: legacyIndex.requirements };
    writeKnowledgeIndex(migratedIndex, cwd);
    return migratedIndex;
  }
  return index;
}
function writeKnowledgeIndex(index, cwd) {
  const path = getKnowledgeIndexPath(cwd);
  const dir = (0, import_path5.join)(path, "..");
  if (!(0, import_fs6.existsSync)(dir)) {
    (0, import_fs6.mkdirSync)(dir, { recursive: true });
  }
  atomicWriteJson(path, index);
}
function findSimilarKnowledgeTopic(taskTitle, taskDescription, cwd, threshold = 0.5) {
  const index = readKnowledgeIndex(cwd);
  const topics = Object.entries(index.topics);
  if (topics.length === 0)
    return null;
  const query = `${taskTitle} ${taskDescription}`.toLowerCase();
  const queryWords = query.split(/\s+/).filter((w) => w.length > 1);
  let bestMatch = null;
  for (const [slug, data] of topics) {
    const titleWords = data.title.toLowerCase().split(/\s+/);
    const descWords = (data.description || "").toLowerCase().split(/\s+/);
    const allWords = [...titleWords, ...descWords].filter((w) => w.length > 1);
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
      const categories = Object.keys(data.domains);
      const primaryCategory = categories.find((c) => data.domains[c]?.length > 0);
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
function createTopic(topicSlug, title, description, cwd) {
  const index = readKnowledgeIndex(cwd);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  index.topics[topicSlug] = {
    title,
    description,
    status: "in_progress",
    created_at: now,
    updated_at: now,
    domains: {}
  };
  writeKnowledgeIndex(index, cwd);
  const topicPath = getTopicPath(topicSlug, cwd);
  if (!(0, import_fs6.existsSync)(topicPath)) {
    (0, import_fs6.mkdirSync)(topicPath, { recursive: true });
  }
  return { topic: topicSlug, title };
}
function topicExists(topicSlug, cwd) {
  const index = readKnowledgeIndex(cwd);
  return !!index.topics[topicSlug];
}
function getTopic(topic, cwd) {
  const index = readKnowledgeIndex(cwd);
  return index.topics[topic] || null;
}
function readKnowledgeDoc(topic, category, doc, cwd) {
  const path = getKnowledgeDocPath(topic, category, doc, cwd);
  if (!(0, import_fs6.existsSync)(path))
    return null;
  return (0, import_fs6.readFileSync)(path, "utf-8");
}
function readAllKnowledgeDocs(topic, category, cwd) {
  const topicPath = getTopicPath(topic, cwd);
  const categoryPath = (0, import_path5.join)(topicPath, category);
  if (!(0, import_fs6.existsSync)(categoryPath))
    return null;
  const results = [];
  for (const docFile of (0, import_fs6.readdirSync)(categoryPath)) {
    if (!docFile.endsWith(".md"))
      continue;
    const content = (0, import_fs6.readFileSync)((0, import_path5.join)(categoryPath, docFile), "utf-8");
    results.push(`## ${docFile}

${content}`);
  }
  return results.length > 0 ? results.join("\n\n---\n\n") : null;
}
var DOC_TYPE_DEFAULTS = {
  // Architecture documents
  architecture: {
    name: "\u6280\u672F\u67B6\u6784\u6587\u6863",
    description: "\u63CF\u8FF0\u7CFB\u7EDF\u7684\u6574\u4F53\u67B6\u6784\u8BBE\u8BA1\uFF0C\u5305\u62EC\u7EC4\u4EF6\u5173\u7CFB\u3001\u6280\u672F\u9009\u578B\u3001\u5206\u5C42\u7ED3\u6784\u548C\u6838\u5FC3\u6A21\u5757\u3002"
  },
  tech: {
    name: "\u6280\u672F\u65B9\u6848\u6587\u6863",
    description: "\u63CF\u8FF0\u6280\u672F\u5B9E\u73B0\u65B9\u6848\uFF0C\u5305\u62EC\u6280\u672F\u6808\u9009\u62E9\u3001\u5B9E\u73B0\u7EC6\u8282\u548C\u5173\u952E\u51B3\u7B56\u3002"
  },
  api: {
    name: "API\u63A5\u53E3\u6587\u6863",
    description: "\u63CF\u8FF0API\u7AEF\u70B9\u3001\u8BF7\u6C42/\u54CD\u5E94\u683C\u5F0F\u3001\u8BA4\u8BC1\u65B9\u5F0F\u548C\u9519\u8BEF\u5904\u7406\u3002"
  },
  // Requirement documents
  main: {
    name: "\u9700\u6C42\u89C4\u683C\u6587\u6863",
    description: "\u63CF\u8FF0\u529F\u80FD\u9700\u6C42\u3001\u7528\u6237\u6545\u4E8B\u3001\u9A8C\u6536\u6807\u51C6\u548C\u4E1A\u52A1\u76EE\u6807\u3002"
  },
  "user-stories": {
    name: "\u7528\u6237\u6545\u4E8B\u6587\u6863",
    description: "\u63CF\u8FF0\u7528\u6237\u6545\u4E8B\u3001\u9A8C\u6536\u6807\u51C6\u548C\u4F18\u5148\u7EA7\u6392\u5E8F\u3002"
  },
  // Design documents
  ui: {
    name: "UI\u8BBE\u8BA1\u6587\u6863",
    description: "\u63CF\u8FF0\u7528\u6237\u754C\u9762\u8BBE\u8BA1\uFF0C\u5305\u62EC\u5E03\u5C40\u3001\u7EC4\u4EF6\u3001\u4EA4\u4E92\u548C\u89C6\u89C9\u89C4\u8303\u3002"
  },
  interaction: {
    name: "\u4EA4\u4E92\u8BBE\u8BA1\u6587\u6863",
    description: "\u63CF\u8FF0\u7528\u6237\u4EA4\u4E92\u6D41\u7A0B\u3001\u72B6\u6001\u8F6C\u6362\u548C\u52A8\u753B\u6548\u679C\u3002"
  },
  // Test documents
  "test-plan": {
    name: "\u6D4B\u8BD5\u8BA1\u5212\u6587\u6863",
    description: "\u63CF\u8FF0\u6D4B\u8BD5\u7B56\u7565\u3001\u6D4B\u8BD5\u8303\u56F4\u3001\u6D4B\u8BD5\u73AF\u5883\u548C\u8D44\u6E90\u5B89\u6392\u3002"
  },
  cases: {
    name: "\u6D4B\u8BD5\u7528\u4F8B\u6587\u6863",
    description: "\u63CF\u8FF0\u6D4B\u8BD5\u7528\u4F8B\u3001\u9884\u671F\u7ED3\u679C\u548C\u8986\u76D6\u7387\u5206\u6790\u3002"
  },
  // Deployment documents
  deployment: {
    name: "\u90E8\u7F72\u6587\u6863",
    description: "\u63CF\u8FF0\u90E8\u7F72\u6D41\u7A0B\u3001\u73AF\u5883\u914D\u7F6E\u548C\u53D1\u5E03\u68C0\u67E5\u6E05\u5355\u3002"
  },
  infrastructure: {
    name: "\u57FA\u7840\u8BBE\u65BD\u6587\u6863",
    description: "\u63CF\u8FF0\u57FA\u7840\u8BBE\u65BD\u67B6\u6784\u3001\u8D44\u6E90\u914D\u7F6E\u548C\u8FD0\u7EF4\u6307\u5357\u3002"
  },
  // Growth documents
  metrics: {
    name: "\u6307\u6807\u4F53\u7CFB\u6587\u6863",
    description: "\u63CF\u8FF0\u4E1A\u52A1\u6307\u6807\u3001\u76D1\u63A7\u7EF4\u5EA6\u548C\u6570\u636E\u91C7\u96C6\u65B9\u6848\u3002"
  },
  analytics: {
    name: "\u6570\u636E\u5206\u6790\u6587\u6863",
    description: "\u63CF\u8FF0\u5206\u6790\u65B9\u6CD5\u3001\u6570\u636E\u6A21\u578B\u548C\u6D1E\u5BDF\u7ED3\u8BBA\u3002"
  }
};
function getDocTypeDefaults(doc, category) {
  if (DOC_TYPE_DEFAULTS[doc]) {
    return DOC_TYPE_DEFAULTS[doc];
  }
  const categoryNames = {
    requirement: "\u9700\u6C42",
    design: "\u8BBE\u8BA1",
    backend: "\u540E\u7AEF",
    ios: "iOS",
    android: "Android",
    harmony: "\u9E3F\u8499",
    web: "Web",
    miniprogram: "\u5C0F\u7A0B\u5E8F",
    qa: "\u6D4B\u8BD5",
    ship: "\u90E8\u7F72",
    growth: "\u589E\u957F"
  };
  return {
    name: `${categoryNames[category] || ""}${doc}\u6587\u6863`,
    description: `\u63CF\u8FF0${categoryNames[category] || ""}\u76F8\u5173\u7684${doc}\u5185\u5BB9\u3002`
  };
}
function writeKnowledgeDoc(topic, category, doc, content, mode = "append", section, cwd, meta) {
  const path = getKnowledgeDocPath(topic, category, doc, cwd);
  const dir = (0, import_path5.join)(path, "..");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (!(0, import_fs6.existsSync)(dir)) {
    (0, import_fs6.mkdirSync)(dir, { recursive: true });
  }
  let finalContent = content;
  let existingMeta = {};
  if ((0, import_fs6.existsSync)(path)) {
    const existing = (0, import_fs6.readFileSync)(path, "utf-8");
    const parsed = parseFrontmatter(existing);
    existingMeta = parsed.meta;
    if (mode === "append") {
      const timestamp = now.split("T")[0];
      finalContent = `${parsed.content}

## ${timestamp}

${content}`;
    } else if (mode === "update" && section) {
      const sectionRegex = new RegExp(`(## ${section}[\\s]*\\n)([^#]*)(?=##|$)`, "g");
      if (sectionRegex.test(parsed.content)) {
        finalContent = parsed.content.replace(sectionRegex, `$1${content}

`);
      } else {
        finalContent = `${parsed.content}

## ${section}

${content}`;
      }
    }
  }
  const index = readKnowledgeIndex(cwd);
  const topicData = index.topics[topic];
  const docDefaults = getDocTypeDefaults(doc, category);
  const frontmatterMeta = {
    name: meta?.name || existingMeta.name || docDefaults.name,
    description: meta?.description || existingMeta.description || docDefaults.description,
    category: meta?.category || category,
    topic: meta?.topic || topic,
    created_at: existingMeta.created_at || now,
    updated_at: now,
    tags: meta?.tags || existingMeta.tags
  };
  const frontmatter = generateFrontmatter(frontmatterMeta);
  finalContent = `${frontmatter}
${finalContent}`;
  (0, import_fs6.writeFileSync)(path, finalContent, "utf-8");
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
function knowledgeExists(topic, category, doc, cwd) {
  if (!category) {
    const index = readKnowledgeIndex(cwd);
    return !!index.topics[topic];
  }
  if (!doc) {
    const topicPath = getTopicPath(topic, cwd);
    const categoryPath = (0, import_path5.join)(topicPath, category);
    return (0, import_fs6.existsSync)(categoryPath);
  }
  const path = getKnowledgeDocPath(topic, category, doc, cwd);
  return (0, import_fs6.existsSync)(path);
}
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  if (!match) {
    return { meta: {}, content };
  }
  const [, frontmatterStr, bodyContent] = match;
  const meta = {};
  const lines = frontmatterStr.split("\n");
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1)
      continue;
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    }
    const normalizedKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    meta[normalizedKey] = value;
  }
  return { meta, content: bodyContent };
}
function generateFrontmatter(meta) {
  const lines = ["---"];
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
    lines.push(`tags: [${meta.tags.join(", ")}]`);
  }
  lines.push("---");
  return lines.join("\n");
}
function readKnowledgeDocWithMeta(topic, category, doc, cwd) {
  const rawContent = readKnowledgeDoc(topic, category, doc, cwd);
  if (!rawContent)
    return null;
  const { meta, content } = parseFrontmatter(rawContent);
  return {
    meta: {
      name: meta.name || doc,
      description: meta.description || "",
      category: meta.category || category,
      topic: meta.topic || topic,
      created_at: meta.created_at,
      updated_at: meta.updated_at,
      tags: meta.tags
    },
    content
  };
}
function listKnowledgeDocsBrief(topic, category, cwd) {
  const index = readKnowledgeIndex(cwd);
  const results = [];
  const topicsToScan = topic ? [topic] : Object.keys(index.topics);
  for (const t of topicsToScan) {
    const topicData = index.topics[t];
    if (!topicData)
      continue;
    const categoriesToScan = category ? [category] : Object.keys(topicData.domains);
    for (const c of categoriesToScan) {
      const docs = topicData.domains[c] || [];
      for (const doc of docs) {
        const docWithMeta = readKnowledgeDocWithMeta(t, c, doc, cwd);
        if (docWithMeta) {
          results.push(docWithMeta.meta);
        } else {
          results.push({
            name: doc,
            description: topicData.description || "",
            category: c,
            topic: t
          });
        }
      }
    }
  }
  return results;
}
function listKnowledgeDocs(topic, category, cwd) {
  const topicPath = getTopicPath(topic, cwd);
  const categoryPath = (0, import_path5.join)(topicPath, category);
  if (!(0, import_fs6.existsSync)(categoryPath))
    return [];
  const docs = [];
  for (const docFile of (0, import_fs6.readdirSync)(categoryPath)) {
    if (docFile.endsWith(".md")) {
      docs.push(docFile.replace(".md", ""));
    }
  }
  return docs;
}
function rebuildKnowledgeIndex(cwd) {
  const knowledgePath = getKnowledgePath(cwd);
  const oldIndex = readKnowledgeIndex(cwd);
  const oldTopics = Object.keys(oldIndex.topics);
  const newIndex = { topics: {} };
  const stats = {
    topicsFound: 0,
    categoriesFound: 0,
    docsFound: 0,
    topicsAdded: [],
    topicsRemoved: []
  };
  if (!(0, import_fs6.existsSync)(knowledgePath)) {
    writeKnowledgeIndex(newIndex, cwd);
    stats.topicsRemoved = oldTopics;
    return { index: newIndex, stats };
  }
  const entries = (0, import_fs6.readdirSync)(knowledgePath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue;
    if (entry.name.startsWith("."))
      continue;
    const topicSlug = entry.name;
    const topicPath = (0, import_path5.join)(knowledgePath, topicSlug);
    const domains = {};
    let topicUpdatedAt = "";
    let latestDocTime = 0;
    const categoryEntries = (0, import_fs6.readdirSync)(topicPath, { withFileTypes: true });
    for (const catEntry of categoryEntries) {
      if (!catEntry.isDirectory())
        continue;
      const categorySlug = catEntry.name;
      const categoryPath = (0, import_path5.join)(topicPath, categorySlug);
      const docs = [];
      const docEntries = (0, import_fs6.readdirSync)(categoryPath, { withFileTypes: true });
      for (const docEntry of docEntries) {
        if (!docEntry.isFile() || !docEntry.name.endsWith(".md"))
          continue;
        const docName = docEntry.name.replace(".md", "");
        docs.push(docName);
        stats.docsFound++;
        const docPath = (0, import_path5.join)(categoryPath, docEntry.name);
        try {
          const stat = (0, import_fs6.statSync)(docPath);
          if (stat.mtimeMs > latestDocTime) {
            latestDocTime = stat.mtimeMs;
          }
        } catch {
        }
      }
      if (docs.length > 0) {
        domains[categorySlug] = docs.sort();
        stats.categoriesFound++;
      }
    }
    if (Object.keys(domains).length > 0) {
      stats.topicsFound++;
      const existingTopic = oldIndex.topics[topicSlug];
      const now = (/* @__PURE__ */ new Date()).toISOString();
      let title = existingTopic?.title || topicSlug;
      let description = existingTopic?.description || "";
      if (!existingTopic?.title) {
        for (const [category, docs] of Object.entries(domains)) {
          if (docs.length > 0) {
            const docWithMeta = readKnowledgeDocWithMeta(topicSlug, category, docs[0], cwd);
            if (docWithMeta?.meta.topic) {
              title = topicSlug;
              break;
            }
          }
        }
      }
      newIndex.topics[topicSlug] = {
        title,
        description,
        status: existingTopic?.status || "in_progress",
        created_at: existingTopic?.created_at || now,
        updated_at: latestDocTime > 0 ? new Date(latestDocTime).toISOString() : now,
        domains
      };
      if (!oldTopics.includes(topicSlug)) {
        stats.topicsAdded.push(topicSlug);
      }
    }
  }
  const newTopics = Object.keys(newIndex.topics);
  for (const oldTopic of oldTopics) {
    if (!newTopics.includes(oldTopic)) {
      stats.topicsRemoved.push(oldTopic);
    }
  }
  writeKnowledgeIndex(newIndex, cwd);
  return { index: newIndex, stats };
}

// ../../build/mcp/session.js
var import_fs8 = require("fs");
var import_path7 = require("path");

// ../../build/mcp/state.js
var import_fs7 = require("fs");
var import_path6 = require("path");
function generateSessionFilename(requirementId, source) {
  return `${requirementId}.json`;
}
function getProjectStatePath(requirementId, source, cwd) {
  const sessionsDir = ensureOpcDir("state/sessions", cwd);
  const filename = generateSessionFilename(requirementId, source);
  return (0, import_path6.join)(sessionsDir, filename);
}
function findSessionByRequirementId(requirementId, cwd) {
  const sessionsDir = ensureOpcDir("state/sessions", cwd);
  if (!(0, import_fs7.existsSync)(sessionsDir)) {
    return null;
  }
  const files = (0, import_fs7.readdirSync)(sessionsDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const path = (0, import_path6.join)(sessionsDir, file);
    const state = readJsonFile(path);
    if (state?.project?.requirement_id === requirementId) {
      return path;
    }
  }
  return null;
}
function readProjectState(requirementId, source, cwd) {
  const existingPath = findSessionByRequirementId(requirementId, cwd);
  if (existingPath) {
    return readJsonFile(existingPath);
  }
  const path = getProjectStatePath(requirementId, source, cwd);
  return readJsonFile(path);
}
function writeProjectState(state, cwd) {
  const requirementId = state.project.requirement_id;
  if (!requirementId) {
    throw new Error("Cannot write project state without requirement_id");
  }
  const source = state.workflow?.source || "auto_assembled";
  let path = findSessionByRequirementId(requirementId, cwd);
  if (!path) {
    path = getProjectStatePath(requirementId, source, cwd);
  }
  const dir = (0, import_path6.join)(path, "..");
  if (!(0, import_fs7.existsSync)(dir)) {
    (0, import_fs7.mkdirSync)(dir, { recursive: true });
  }
  state.project.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  state._meta.updated_by = "opc_state_write";
  atomicWriteJson(path, state);
}
function initializeProjectState(name, description, lockId, requirementId, cwd, workflow, workflowSource, workflowConfidence, knowledgeTopic, knowledgeCategory) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let stages;
  let gates;
  let rules;
  let workflowMeta;
  if (workflow) {
    stages = buildStagesFromWorkflow(workflow);
    gates = workflow.gates;
    rules = workflow.rules;
    workflowMeta = {
      name: workflow.name,
      source: workflowSource || "matched",
      matched_at: now,
      confidence: workflowConfidence
    };
  } else {
    stages = buildStagesAuto(description);
    gates = buildDefaultGates(stages);
    rules = {
      tdd: !!stages.dev?.config?.constraints?.includes("tdd_red_first"),
      sdd: !!stages.product,
      parallel_allowed: stages.dev?.config?.agent_mode === "parallel",
      knowledge_enabled: true
    };
    workflowMeta = {
      name: "auto-assembled",
      source: "auto_assembled",
      matched_at: now
    };
  }
  const stageOrder = Object.keys(stages);
  const firstStage = stageOrder[0] || "product";
  return {
    project: {
      name,
      description,
      requirement_id: requirementId,
      knowledge_topic: knowledgeTopic || "",
      knowledge_category: knowledgeCategory || "",
      created_at: now,
      updated_at: now
    },
    pipeline: {
      current_stage: firstStage,
      stage_order: stageOrder,
      // Preserve stage order
      stages
    },
    workflow: workflowMeta,
    gates,
    rules,
    context: {
      lock_id: lockId,
      worktree: getWorktreeRoot(cwd)
    },
    _meta: {
      version: "3.1.0",
      updated_by: "opc_state_init"
    }
  };
}
function getHandoffPath(lockId, cwd) {
  const stateDir = ensureOpcDir("state", cwd);
  return (0, import_path6.join)(stateDir, lockId, "handoffs.json");
}
function recordHandoff(fromAgent, toAgent, artifacts, constraints, context, lockId, cwd) {
  const handoff = {
    handoff_id: `handoff-${Date.now().toString(36)}`,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    from_agent: fromAgent,
    to_agent: toAgent,
    artifacts,
    constraints,
    context,
    lock_id: lockId
  };
  const path = getHandoffPath(lockId, cwd);
  let handoffs = readJsonFile(path) || [];
  handoffs.push(handoff);
  atomicWriteJson(path, handoffs);
  return handoff;
}
function createTaskGroup(state, stage, groupName, tasks, parallel, completionCondition, threshold, cwd) {
  const groupId = `tg-${Date.now().toString(36)}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const taskGroup = {
    group_id: groupId,
    name: groupName,
    tasks: tasks.map((t, i) => ({
      task_id: `${groupId}-task-${i}`,
      agent: t.agent,
      description: t.description,
      status: "pending",
      progress: 0,
      dependencies: t.dependencies
    })),
    parallel,
    completion_condition: completionCondition,
    threshold,
    started_at: now
  };
  if (!state.pipeline.stages[stage]) {
    state.pipeline.stages[stage] = { status: "pending" };
  }
  if (!state.pipeline.stages[stage].task_groups) {
    state.pipeline.stages[stage].task_groups = [];
  }
  state.pipeline.stages[stage].task_groups.push(taskGroup);
  writeProjectState(state, cwd);
  return { state, groupId };
}
function updateTask(state, taskId, status, progress, artifact, cwd) {
  let found = false;
  for (const stageName of Object.keys(state.pipeline.stages)) {
    const stage = state.pipeline.stages[stageName];
    if (!stage.task_groups)
      continue;
    for (const group of stage.task_groups) {
      const task = group.tasks.find((t) => t.task_id === taskId);
      if (task) {
        task.status = status;
        if (progress !== void 0)
          task.progress = progress;
        if (status === "in_progress" && !task.started_at) {
          task.started_at = (/* @__PURE__ */ new Date()).toISOString();
        }
        if (status === "completed" || status === "failed") {
          task.completed_at = (/* @__PURE__ */ new Date()).toISOString();
          task.progress = 100;
        }
        if (artifact) {
          if (!task.artifacts)
            task.artifacts = [];
          task.artifacts.push(artifact);
        }
        found = true;
        const completedCount = group.tasks.filter((t) => t.status === "completed").length;
        if (group.completion_condition === "all" && completedCount === group.tasks.length) {
          group.completed_at = (/* @__PURE__ */ new Date()).toISOString();
        } else if (group.completion_condition === "any" && completedCount > 0) {
          group.completed_at = (/* @__PURE__ */ new Date()).toISOString();
        } else if (group.completion_condition === "threshold" && group.threshold && completedCount >= group.threshold) {
          group.completed_at = (/* @__PURE__ */ new Date()).toISOString();
        }
        break;
      }
    }
    if (found)
      break;
  }
  if (found) {
    writeProjectState(state, cwd);
  }
  return state;
}
function getTaskGroups(state, stage, groupId) {
  const groups = [];
  for (const stageName of Object.keys(state.pipeline.stages)) {
    if (stage && stageName !== stage)
      continue;
    const stageData = state.pipeline.stages[stageName];
    if (!stageData.task_groups)
      continue;
    for (const group of stageData.task_groups) {
      if (groupId && group.group_id !== groupId)
        continue;
      groups.push(group);
    }
  }
  return groups;
}

// ../../build/mcp/session.js
function generateNextRequirementId(source = "auto_assembled", cwd) {
  const sessionsDir = ensureOpcDir("state/sessions", cwd);
  const today = /* @__PURE__ */ new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  let nextNum = 1;
  if ((0, import_fs8.existsSync)(sessionsDir)) {
    const existingFiles = (0, import_fs8.readdirSync)(sessionsDir).filter((f) => f.startsWith(dateStr) && f.endsWith(".json")).map((f) => {
      const match = f.match(/^\d{8}_(\d{3})_/);
      return match ? parseInt(match[1], 10) : 0;
    }).filter((n) => !isNaN(n));
    if (existingFiles.length > 0) {
      nextNum = Math.max(...existingFiles) + 1;
    }
  }
  const numStr = String(nextNum).padStart(3, "0");
  return `${dateStr}_${numStr}_${source}`;
}
function getSessionIndexPath(cwd) {
  const stateDir = ensureOpcDir("state", cwd);
  return (0, import_path7.join)(stateDir, "sessions.json");
}
function readSessionIndex(cwd) {
  const path = getSessionIndexPath(cwd);
  const index = readJsonFile(path);
  return index || { sessions: {} };
}
function writeSessionIndex(index, cwd) {
  const path = getSessionIndexPath(cwd);
  atomicWriteJson(path, index);
}
function bindSessionToRequirement(lockId, requirementId, source, workflowName, cwd) {
  const index = readSessionIndex(cwd);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (index.sessions[lockId]) {
    index.sessions[lockId].requirement_id = requirementId;
    index.sessions[lockId].source = source;
    index.sessions[lockId].workflow_name = workflowName;
    index.sessions[lockId].updated_at = now;
  } else {
    index.sessions[lockId] = {
      requirement_id: requirementId,
      source,
      workflow_name: workflowName,
      created_at: now,
      updated_at: now
    };
  }
  writeSessionIndex(index, cwd);
}
function getCurrentSession(lockId, cwd) {
  const index = readSessionIndex(cwd);
  return index.sessions[lockId] || null;
}
function findSimilarTask(projectName, projectDescription, cwd, threshold = 0.5) {
  const sessionsDir = ensureOpcDir("state/sessions", cwd);
  if (!(0, import_fs8.existsSync)(sessionsDir))
    return null;
  const query = `${projectName} ${projectDescription}`.toLowerCase();
  const queryWords = query.split(/\s+/).filter((w) => w.length > 1);
  let bestMatch = null;
  const sessionFiles = (0, import_fs8.readdirSync)(sessionsDir).filter((f) => f.endsWith(".json"));
  for (const file of sessionFiles) {
    const path = (0, import_path7.join)(sessionsDir, file);
    const state = readJsonFile(path);
    if (!state)
      continue;
    const titleWords = state.project.name.toLowerCase().split(/\s+/);
    const descWords = (state.project.description || "").toLowerCase().split(/\s+/);
    const allTitleWords = [...titleWords, ...descWords].filter((w) => w.length > 1);
    let matchCount = 0;
    for (const queryWord of queryWords) {
      for (const titleWord of allTitleWords) {
        if (queryWord === titleWord || queryWord.includes(titleWord) || titleWord.includes(queryWord)) {
          matchCount++;
          break;
        }
      }
    }
    const score = queryWords.length > 0 ? matchCount / queryWords.length : 0;
    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      const requirementId = state.project.requirement_id || "";
      const source = state.workflow?.source || "auto_assembled";
      bestMatch = { requirementId, source, state, score };
    }
  }
  return bestMatch;
}
function getCurrentTask(cwd) {
  const lockId = getCurrentLockId(cwd);
  const session = getCurrentSession(lockId, cwd);
  if (!session) {
    return null;
  }
  return readProjectState(session.requirement_id, session.source, cwd);
}
function clearCurrentTask(cwd) {
  const lockId = getCurrentLockId(cwd);
  const index = readSessionIndex(cwd);
  if (index.sessions[lockId]) {
    delete index.sessions[lockId];
    writeSessionIndex(index, cwd);
    const handoffPath = getHandoffPath(lockId, cwd);
    if ((0, import_fs8.existsSync)(handoffPath)) {
      (0, import_fs8.unlinkSync)(handoffPath);
    }
    return true;
  }
  return false;
}

// ../../build/mcp/handlers/state.js
function handleStateRead(cwd) {
  const state = getCurrentTask(cwd);
  if (!state) {
    return {
      content: [{
        type: "text",
        text: "No active task. Use opc_state_init to start a new project."
      }]
    };
  }
  const stageStatus = Object.entries(state.pipeline.stages).map(([stage, data]) => {
    const icon = data.status === "completed" ? "\u2705" : data.status === "in_progress" ? "\u{1F504}" : data.status === "blocked" ? "\u{1F6AB}" : "\u23F3";
    const required = data.config?.required === false ? " (optional)" : "";
    const desc = data.config?.description ? ` \u2014 ${data.config.description}` : "";
    return `${icon} **${stage}**${required}: ${data.status}${desc}${data.progress ? ` (${Object.entries(data.progress).map(([k, v]) => `${k}: ${v}%`).join(", ")})` : ""}`;
  }).join("\n");
  const requirementInfo = state.project.requirement_id ? `
**Requirement ID:** ${state.project.requirement_id}` : "";
  const topicInfo = state.project.knowledge_topic ? `
**Knowledge Topic:** ${state.project.knowledge_topic}${state.project.knowledge_category ? ` (${state.project.knowledge_category})` : ""}` : "";
  const workflowInfo = state.workflow ? `
**Workflow:** ${state.workflow.name} (${state.workflow.source}${state.workflow.confidence ? `, ${Math.round(state.workflow.confidence * 100)}% match` : ""})` : "";
  const rulesInfo = state.rules ? `

### Rules
${state.rules.tdd ? "- \u2705 TDD enabled\n" : ""}${state.rules.sdd ? "- \u2705 SDD enabled\n" : ""}${state.rules.parallel_allowed ? "- \u2705 Parallel execution allowed\n" : ""}${state.rules.knowledge_enabled ? "- \u2705 Knowledge flow enabled\n" : ""}` : "";
  const currentStage = state.pipeline.stages[state.pipeline.current_stage];
  const knowledgeInfo = currentStage?.config?.knowledge ? `

### Current Stage Knowledge
` + (currentStage.config.knowledge.read_before ? `- **Read before:** ${Array.isArray(currentStage.config.knowledge.read_before) ? currentStage.config.knowledge.read_before.join(", ") : "none"}
` : "") + (currentStage.config.knowledge.write_after ? `- **Write after:** ${currentStage.config.knowledge.domain}/${currentStage.config.knowledge.doc}
` : "") : "";
  return {
    content: [{
      type: "text",
      text: `## OPC Project State

**Project:** ${state.project.name}${requirementInfo}${topicInfo}
**Lock ID:** ${state.context.lock_id}
**Current Stage:** ${state.pipeline.current_stage}${workflowInfo}
**Created:** ${state.project.created_at}
**Updated:** ${state.project.updated_at}

### Pipeline Progress

${stageStatus}${rulesInfo}${knowledgeInfo}

### Artifacts
${Object.entries(state.pipeline.stages).filter(([, data]) => data.artifacts?.length).map(([stage, data]) => `- **${stage}**: ${data.artifacts?.join(", ")}`).join("\n") || "No artifacts recorded yet."}
`
    }]
  };
}
function handleStateInit(args, cwd) {
  const projectName = args.project_name;
  const projectDescription = args.project_description || "";
  const lockId = getCurrentLockId(cwd);
  const currentSession = getCurrentSession(lockId, cwd);
  if (currentSession) {
    const existingTask = readProjectState(currentSession.requirement_id, currentSession.source, cwd);
    if (existingTask) {
      const currentStatus = existingTask.pipeline.stages[existingTask.pipeline.current_stage]?.status;
      if (currentStatus === "in_progress") {
        return {
          content: [{
            type: "text",
            text: `## Task Already Bound

**Current Task:** ${existingTask.project.name}
**Requirement ID:** ${existingTask.project.requirement_id || "Not set"}
**Knowledge Topic:** ${existingTask.project.knowledge_topic || "Not set"}
**Stage:** ${existingTask.pipeline.current_stage}
**Status:** \u{1F504} in_progress

One window can only have one active task at a time.

Options:
1. Continue the current task with \`opc_state_read\`
2. Unbind from current task with \`opc_state_clear\` and start fresh
`
          }]
        };
      }
    }
  }
  const similarTask = findSimilarTask(projectName, projectDescription, cwd, 0.5);
  let requirementId;
  let workflowSource;
  let matchedWorkflow = null;
  let workflowConfidence;
  let isReused = false;
  if (similarTask) {
    requirementId = similarTask.requirementId;
    workflowSource = similarTask.source;
    matchedWorkflow = similarTask.state.workflow?.name ? readAllWorkflows(cwd).find((w) => w.name === similarTask.state.workflow.name) || null : null;
    workflowConfidence = similarTask.state.workflow?.confidence;
    isReused = true;
  } else {
    const taskDescription = `${projectName} ${projectDescription}`.trim();
    const workflows = readAllWorkflows(cwd);
    const workflowMatch = matchWorkflow(taskDescription, workflows);
    workflowSource = "auto_assembled";
    if (workflowMatch && workflowMatch.score >= 0.3) {
      matchedWorkflow = workflowMatch.workflow;
      workflowSource = "matched";
      workflowConfidence = workflowMatch.score;
    }
    requirementId = generateNextRequirementId(workflowSource, cwd);
  }
  let matchedKnowledgeTopic;
  let matchedKnowledgeCategory;
  let knowledgeTopicInfo = "";
  if (!isReused || !similarTask.state.project.knowledge_topic) {
    const similarTopic = findSimilarKnowledgeTopic(projectName, projectDescription, cwd, 0.5);
    if (similarTopic) {
      matchedKnowledgeTopic = similarTopic.topic;
      matchedKnowledgeCategory = similarTopic.category;
      knowledgeTopicInfo = `

\u{1F4DA} **Matched knowledge topic:** ${similarTopic.topic}${similarTopic.category ? ` (${similarTopic.category})` : ""} (${Math.round(similarTopic.score * 100)}% similarity)`;
    }
  } else {
    matchedKnowledgeTopic = similarTask.state.project.knowledge_topic;
    matchedKnowledgeCategory = similarTask.state.project.knowledge_category;
  }
  bindSessionToRequirement(lockId, requirementId, workflowSource, matchedWorkflow?.name, cwd);
  const state = isReused ? similarTask.state : initializeProjectState(projectName, projectDescription, lockId, requirementId, cwd, matchedWorkflow, workflowSource, workflowConfidence, matchedKnowledgeTopic, matchedKnowledgeCategory);
  if (isReused) {
    state.project.name = projectName;
    state.project.description = projectDescription;
  }
  const firstStage = state.pipeline.current_stage;
  if (state.pipeline.stages[firstStage]) {
    state.pipeline.stages[firstStage].status = "in_progress";
    if (!state.pipeline.stages[firstStage].started_at) {
      state.pipeline.stages[firstStage].started_at = (/* @__PURE__ */ new Date()).toISOString();
    }
  }
  writeProjectState(state, cwd);
  const gitignoreUpdated = updateGitignore(cwd);
  const gitignoreMsg = gitignoreUpdated ? "\n\n\u{1F4DD} **.gitignore updated**: Added `.opc/state/` to ignore personal session data." : "";
  const stageList = Object.entries(state.pipeline.stages).map(([stageName, stageData]) => {
    const required = stageData.config?.required ? " (required)" : "";
    const desc = stageData.config?.description ? ` - ${stageData.config.description}` : "";
    return `- **${stageName}**${required}${desc}`;
  }).join("\n");
  const workflowInfo = matchedWorkflow ? `

\u{1F4CB} **Workflow:** ${matchedWorkflow.name} (matched, ${Math.round(workflowConfidence * 100)}% confidence)` : "\n\n\u{1F527} **Pipeline:** Auto-assembled";
  const reuseInfo = isReused ? `

\u{1F517} **Reused existing task:** ${similarTask.requirementId} (${Math.round(similarTask.score * 100)}% similarity)` : `

\u{1F195} **Created new task:** ${requirementId}`;
  const knowledgeTopicDisplay = state.project.knowledge_topic ? `
**Knowledge Topic:** ${state.project.knowledge_topic}${state.project.knowledge_category ? ` (${state.project.knowledge_category})` : ""}` : "\n**Knowledge Topic:** (not set)";
  const nextSteps = state.project.knowledge_topic ? `1. **Update Progress:** Use \`opc_state_write\` as you advance through stages
2. **Manage Knowledge:** Use \`opc_knowledge_read\` and \`opc_knowledge_write\` to manage knowledge documents` : `1. **Set Knowledge Topic:** Use \`opc_knowledge_list\` to check existing topics, then \`opc_state_write(knowledge_topic="...")\` to set
2. **Update Progress:** Use \`opc_state_write\` as you advance through stages
3. **Manage Knowledge:** Use \`opc_knowledge_read\` and \`opc_knowledge_write\` to manage knowledge documents`;
  return {
    content: [{
      type: "text",
      text: `## OPC Task ${isReused ? "Resumed" : "Initialized"}

**Lock ID:** ${lockId}
**Project:** ${projectName}
**Requirement ID:** ${requirementId}${knowledgeTopicDisplay}${workflowInfo}${reuseInfo}${knowledgeTopicInfo}

### Pipeline Stages

${stageList}

### Next Steps

${nextSteps}${gitignoreMsg}
`
    }]
  };
}
function handleStateClear(cwd) {
  const lockId = getCurrentLockId(cwd);
  const session = getCurrentSession(lockId, cwd);
  const cleared = clearCurrentTask(cwd);
  if (cleared) {
    return {
      content: [{
        type: "text",
        text: `## Task Unbound

**Previous Requirement:** ${session?.requirement_id}

The current window has been unbound from this requirement.
You can start a new task with \`opc_state_init\`.

**Note:** The requirement's state file is preserved for history.
To resume, use \`opc_state_init\` with a similar project name (auto-matching will find it).`
      }]
    };
  } else {
    return {
      content: [{
        type: "text",
        text: `No task to clear. Use \`opc_state_init\` to start a new task.`
      }]
    };
  }
}
function handleStateWrite(args, cwd) {
  const state = getCurrentTask(cwd);
  if (!state) {
    return {
      content: [{ type: "text", text: "No active task. Use opc_state_init to start a new project." }],
      isError: true
    };
  }
  if (args.knowledge_topic) {
    state.project.knowledge_topic = args.knowledge_topic;
  }
  if (args.stage && args.stage_status) {
    const stage = args.stage;
    const stageStatus = args.stage_status;
    if (!state.pipeline.stages[stage]) {
      state.pipeline.stages[stage] = { status: "pending" };
    }
    state.pipeline.stages[stage].status = stageStatus;
    if (stageStatus === "in_progress" && !state.pipeline.stages[stage].started_at) {
      state.pipeline.stages[stage].started_at = (/* @__PURE__ */ new Date()).toISOString();
    }
    if (stageStatus === "completed") {
      state.pipeline.stages[stage].completed_at = (/* @__PURE__ */ new Date()).toISOString();
      state.pipeline.stages[stage].verification_passed = true;
      const stageOrder = state.pipeline.stage_order || Object.keys(state.pipeline.stages);
      const currentIndex = stageOrder.indexOf(stage);
      if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
        const nextStage = stageOrder[currentIndex + 1];
        if (!state.pipeline.stages[nextStage] || state.pipeline.stages[nextStage]?.status === "pending") {
          state.pipeline.current_stage = nextStage;
          if (!state.pipeline.stages[nextStage]) {
            state.pipeline.stages[nextStage] = { status: "pending" };
          }
        }
      }
    }
    if (stageStatus === "in_progress") {
      state.pipeline.current_stage = stage;
    }
  }
  if (args.agent) {
    const stage = state.pipeline.current_stage;
    if (!state.pipeline.stages[stage].agents_used) {
      state.pipeline.stages[stage].agents_used = [];
    }
    if (!state.pipeline.stages[stage].agents_used.includes(args.agent)) {
      state.pipeline.stages[stage].agents_used.push(args.agent);
    }
  }
  if (args.artifact) {
    const stage = args.stage || state.pipeline.current_stage;
    if (!state.pipeline.stages[stage]) {
      state.pipeline.stages[stage] = { status: "pending" };
    }
    if (!state.pipeline.stages[stage].artifacts) {
      state.pipeline.stages[stage].artifacts = [];
    }
    state.pipeline.stages[stage].artifacts.push(args.artifact);
  }
  if (args.progress) {
    const stage = args.stage || state.pipeline.current_stage;
    if (!state.pipeline.stages[stage]) {
      state.pipeline.stages[stage] = { status: "pending" };
    }
    state.pipeline.stages[stage].progress = args.progress;
  }
  if (args.blocker) {
    const stage = args.stage || state.pipeline.current_stage;
    if (!state.pipeline.stages[stage]) {
      state.pipeline.stages[stage] = { status: "pending" };
    }
    if (!state.pipeline.stages[stage].blockers) {
      state.pipeline.stages[stage].blockers = [];
    }
    state.pipeline.stages[stage].blockers.push(args.blocker);
    state.pipeline.stages[stage].status = "blocked";
  }
  writeProjectState(state, cwd);
  return {
    content: [{
      type: "text",
      text: `State updated.

**Current Stage:** ${state.pipeline.current_stage}
**Stage Status:** ${state.pipeline.stages[state.pipeline.current_stage].status}
`
    }]
  };
}

// ../../build/mcp/handlers/handoff.js
function handleHandoff(args, cwd) {
  const state = getCurrentTask(cwd);
  if (!state) {
    return {
      content: [{ type: "text", text: "No active task for handoff." }],
      isError: true
    };
  }
  const handoff = recordHandoff(args.from_agent, args.to_agent, args.artifacts, args.constraints || [], args.context || "", state.context.lock_id, cwd);
  return {
    content: [{
      type: "text",
      text: `## Handoff Recorded

**From:** ${handoff.from_agent}
**To:** ${handoff.to_agent}
**Artifacts:** ${handoff.artifacts.join(", ")}
**Constraints:** ${handoff.constraints.length > 0 ? handoff.constraints.join(", ") : "None"}

The receiving agent should check constraints and artifacts before starting work.
`
    }]
  };
}

// ../../build/mcp/handlers/session.js
var import_fs9 = require("fs");
function handleSessionsList(cwd) {
  const lockId = getCurrentLockId(cwd);
  const currentSession = getCurrentSession(lockId, cwd);
  const sessionsDir = ensureOpcDir("state/sessions", cwd);
  const allSessionFiles = (0, import_fs9.existsSync)(sessionsDir) ? (0, import_fs9.readdirSync)(sessionsDir).filter((f) => f.endsWith(".json")) : [];
  if (allSessionFiles.length === 0) {
    return {
      content: [{ type: "text", text: "No tasks found. Use opc_state_init to start a new project." }]
    };
  }
  const taskList = allSessionFiles.map((filename) => {
    const requirementId = filename.replace(/\.json$/, "");
    const sourceMatch = requirementId.match(/_(matched|auto_assembled)$/);
    const source = sourceMatch ? sourceMatch[1] : "auto_assembled";
    const state = readProjectState(requirementId, source, cwd);
    if (!state)
      return null;
    const isCurrent = currentSession && currentSession.requirement_id === requirementId;
    const status = state.pipeline.stages[state.pipeline.current_stage]?.status || "pending";
    const icon = status === "in_progress" ? "\u{1F504}" : status === "completed" ? "\u2705" : status === "blocked" ? "\u{1F6AB}" : "\u23F3";
    const currentMarker = isCurrent ? " \u2190 **current**" : "";
    const workflowTag = state.workflow?.name || source;
    return `${icon} **${requirementId}** [${workflowTag}]: ${state.project.name} (${status})${currentMarker}`;
  }).filter(Boolean).join("\n");
  return {
    content: [{
      type: "text",
      text: `## All Tasks (${allSessionFiles.length})

${taskList}
`
    }]
  };
}

// ../../build/mcp/handlers/task.js
function handleTaskGroupCreate(args, cwd) {
  const state = getCurrentTask(cwd);
  if (!state) {
    return {
      content: [{ type: "text", text: "No active task. Use opc_state_init first." }],
      isError: true
    };
  }
  const stage = args.stage;
  const groupName = args.group_name;
  const tasks = args.tasks;
  const parallel = args.parallel !== false;
  const completionCondition = args.completion_condition || "all";
  const threshold = args.threshold;
  const result = createTaskGroup(state, stage, groupName, tasks, parallel, completionCondition, threshold, cwd);
  const taskList = result.state.pipeline.stages[stage].task_groups.find((g) => g.group_id === result.groupId).tasks.map((t) => `- **${t.task_id}**: ${t.agent} - ${t.description}`).join("\n");
  return {
    content: [{
      type: "text",
      text: `## Task Group Created

**Group ID:** ${result.groupId}
**Stage:** ${stage}
**Parallel:** ${parallel}
**Completion:** ${completionCondition}${threshold ? ` (threshold: ${threshold})` : ""}

### Tasks (${tasks.length})

${taskList}

Use \`opc_task_update\` to update task progress.
`
    }]
  };
}
function handleTaskUpdate(args, cwd) {
  const state = getCurrentTask(cwd);
  if (!state) {
    return {
      content: [{ type: "text", text: "No active task." }],
      isError: true
    };
  }
  const taskId = args.task_id;
  const status = args.status;
  const progress = args.progress;
  const artifact = args.artifact;
  updateTask(state, taskId, status, progress, artifact, cwd);
  return {
    content: [{
      type: "text",
      text: `Task ${taskId} updated: ${status}${progress !== void 0 ? ` (${progress}%)` : ""}`
    }]
  };
}
function handleTaskGroupStatus(args, cwd) {
  const state = getCurrentTask(cwd);
  if (!state) {
    return {
      content: [{ type: "text", text: "No active task." }],
      isError: true
    };
  }
  const stage = args.stage;
  const groupId = args.group_id;
  const groups = getTaskGroups(state, stage, groupId);
  if (groups.length === 0) {
    return { content: [{ type: "text", text: "No task groups found." }] };
  }
  const output = groups.map((group) => {
    const completed = group.tasks.filter((t) => t.status === "completed").length;
    const inProgress = group.tasks.filter((t) => t.status === "in_progress").length;
    const failed = group.tasks.filter((t) => t.status === "failed").length;
    const pending = group.tasks.filter((t) => t.status === "pending").length;
    const taskList = group.tasks.map((t) => {
      const icon = t.status === "completed" ? "\u2705" : t.status === "in_progress" ? "\u{1F504}" : t.status === "failed" ? "\u274C" : "\u23F3";
      return `  ${icon} ${t.task_id}: ${t.agent} (${t.progress}%) - ${t.description}`;
    }).join("\n");
    return `### ${group.name} (${group.group_id})
**Parallel:** ${group.parallel} | **Completion:** ${group.completion_condition}
**Status:** \u2705${completed} \u{1F504}${inProgress} \u274C${failed} \u23F3${pending}
${group.completed_at ? `**Completed:** ${group.completed_at}` : ""}

${taskList}`;
  }).join("\n\n");
  return {
    content: [{ type: "text", text: `## Task Group Status

${output}` }]
  };
}

// ../../build/mcp/handlers/workflow.js
function handleWorkflowsPath(cwd) {
  const workflowsDir = ensureWorkflowsDir(cwd);
  const gitRoot = getWorktreeRoot(cwd);
  return {
    content: [{
      type: "text",
      text: `## Workflows Directory

**Path:** ${workflowsDir}
**Git Root:** ${gitRoot}

All workflow files should be read from/written to this directory.
This ensures consistency regardless of current working directory.`
    }]
  };
}

// ../../build/mcp/handlers/knowledge.js
function resolveTopic(args, cwd) {
  if (args.topic) {
    return args.topic;
  }
  const state = getCurrentTask(cwd);
  if (state?.project.knowledge_topic) {
    return state.project.knowledge_topic;
  }
  return null;
}
function handleKnowledgeInit(args, cwd) {
  const title = args.title;
  const enTopicName = args.en_topic_name;
  if (topicExists(enTopicName, cwd)) {
    const topicData = getTopic(enTopicName, cwd);
    return {
      content: [{
        type: "text",
        text: `## Knowledge Topic Already Exists

**Topic:** ${enTopicName}
**Title:** ${topicData?.title || title}
**Path:** .opc/knowledge/${enTopicName}/

Use \`opc_knowledge_write\` to add documents to this topic.`
      }]
    };
  }
  const result = createTopic(enTopicName, title, "", cwd);
  const topic = result.topic;
  const categoryList = RECOMMENDED_CATEGORIES.map((c) => `- \`${c}\``).join("\n");
  return {
    content: [{
      type: "text",
      text: `## Knowledge Library Initialized

**Topic:** ${topic}
**Title:** ${title}
**Path:** .opc/knowledge/${topic}/

Knowledge documents will be created on-demand when writing to each category.

### Available Categories

${categoryList}

(You can also use custom categories)

### Naming Convention

**Topic name** should be semantic and concise:
- Format: \`{platform}-{feature}\` or \`{feature}\`
- Examples: \`ios-localization\`, \`app-login\`, \`app-launch\`, \`hud-status-update\`

**Document name** should describe the *purpose*, not the topic:
- Use: \`architecture\`, \`guide\`, \`api\`, \`test-plan\`
- Avoid: \`localization-architecture\`, \`login-guide\` (redundant with topic path)

**Example path structure:**
\`\`\`
.opc/knowledge/ios-localization/
\u251C\u2500\u2500 requirement/
\u2502   \u2514\u2500\u2500 main.md
\u251C\u2500\u2500 ios/
\u2502   \u251C\u2500\u2500 architecture.md
\u2502   \u2514\u2500\u2500 guide.md
\u2514\u2500\u2500 qa/
    \u2514\u2500\u2500 test-plan.md
\`\`\``
    }]
  };
}
function handleKnowledgeRead(args, cwd) {
  const topic = resolveTopic(args, cwd);
  const category = args.category;
  const doc = args.doc;
  if (!topic) {
    return {
      content: [{ type: "text", text: "No topic specified. Provide topic or start a task first." }],
      isError: true
    };
  }
  if (doc) {
    const content2 = readKnowledgeDoc(topic, category, doc, cwd);
    if (!content2) {
      return {
        content: [{ type: "text", text: `Knowledge document not found: ${topic}/${category}/${doc}.md` }]
      };
    }
    return { content: [{ type: "text", text: content2 }] };
  }
  const content = readAllKnowledgeDocs(topic, category, cwd);
  if (!content) {
    return {
      content: [{ type: "text", text: `No knowledge documents found for ${topic}/${category}` }]
    };
  }
  return { content: [{ type: "text", text: content }] };
}
function handleKnowledgeWrite(args, cwd) {
  const topic = resolveTopic(args, cwd);
  const category = args.category;
  const doc = args.doc;
  const content = args.content;
  const mode = args.mode || "append";
  const section = args.section;
  const name = args.name;
  const description = args.description;
  const tags = args.tags;
  const meta = args.meta;
  if (!topic) {
    return {
      content: [{
        type: "text",
        text: "No topic specified. Provide topic or start a task first."
      }],
      isError: true
    };
  }
  if (!category) {
    return {
      content: [{
        type: "text",
        text: `## Missing Required Parameter

**Error:** \`category\` is required.

Please provide a knowledge category for the document.

**Examples:**
- \`ios\` for iOS platform documents
- \`android\` for Android platform documents
- \`bug-fix\` for bug fix documentation
- \`issue\` for issue analysis
- \`tech-doc\` for technical documentation
- \`guide\` for usage guides

**Naming convention:**
- Use lowercase and hyphens
- Platform: ios, android, web, backend, harmony, miniprogram
- Type: bug-fix, issue, tech-doc, guide, api, architecture`
      }],
      isError: true
    };
  }
  if (!topicExists(topic, cwd)) {
    createTopic(topic, topic, "", cwd);
  }
  const docMeta = {
    name: name || meta?.name,
    description: description || meta?.description,
    tags: tags || meta?.tags
  };
  writeKnowledgeDoc(topic, category, doc, content, mode, section, cwd, docMeta);
  const docWithMeta = readKnowledgeDocWithMeta(topic, category, doc, cwd);
  const actualName = docWithMeta?.meta.name || doc;
  const actualDesc = docWithMeta?.meta.description || "";
  const suggestions = [];
  if (!name && !docMeta.name) {
    suggestions.push("\u{1F4A1} **Tip:** Provide `name` parameter for a human-readable document title.");
  }
  if (!description && !docMeta.description) {
    suggestions.push("\u{1F4A1} **Tip:** Provide `description` parameter for a brief document summary.");
  }
  return {
    content: [{
      type: "text",
      text: `## Knowledge Written

**Topic:** ${topic}
**Document:** ${category}/${doc}.md
**Name:** ${actualName}
**Description:** ${actualDesc}
**Mode:** ${mode}${section ? `
**Section:** ${section}` : ""}

Content has been ${mode === "overwrite" ? "written" : mode === "update" ? "updated" : "appended"}.
${suggestions.length > 0 ? "\n" + suggestions.join("\n") : ""}

\u{1F4A1} **Naming Convention:**
- **Document name** should describe the *purpose*, not the topic (e.g., \`architecture\`, \`guide\`, \`api\`, \`test-plan\`)
- Since the path already includes topic and category, avoid redundant prefixes
- Example: For topic \`ios-localization\` with category \`ios\`, use \`architecture.md\` not \`localization-architecture.md\`

\u{1F4C1} **Path:** \`.opc/knowledge/${topic}/${category}/${doc}.md\``
    }]
  };
}
function handleKnowledgeExists(args, cwd) {
  const topic = resolveTopic(args, cwd);
  const category = args.category;
  const doc = args.doc;
  if (!topic) {
    return {
      content: [{ type: "text", text: "false" }]
    };
  }
  const exists = knowledgeExists(topic, category, doc, cwd);
  return {
    content: [{ type: "text", text: exists ? "true" : "false" }]
  };
}
function handleKnowledgeList(args, cwd) {
  const status = args.status;
  const categoryFilter = args.category;
  const index = readKnowledgeIndex(cwd);
  let topics = Object.entries(index.topics);
  if (status) {
    topics = topics.filter(([, t]) => t.status === status);
  }
  if (categoryFilter) {
    topics = topics.filter(([, t]) => t.domains[categoryFilter]?.length > 0);
  }
  if (topics.length === 0) {
    return { content: [{ type: "text", text: "No topics found in knowledge library." }] };
  }
  const table = topics.map(([slug, t]) => {
    const categories = Object.keys(t.domains).join(", ") || "-";
    return `| ${slug} | ${t.title} | ${t.status} | ${categories} | ${t.updated_at.split("T")[0]} |`;
  }).join("\n");
  return {
    content: [{
      type: "text",
      text: `## Knowledge Library

| Topic | Title | Status | Categories | Updated |
|-------|-------|--------|------------|---------|
${table}`
    }]
  };
}
function handleKnowledgeDocs(args, cwd) {
  const topic = resolveTopic(args, cwd);
  const category = args.category;
  if (!topic) {
    return {
      content: [{ type: "text", text: "No topic specified. Provide topic or start a task first." }],
      isError: true
    };
  }
  const docs = listKnowledgeDocs(topic, category, cwd);
  if (docs.length === 0) {
    return {
      content: [{ type: "text", text: `No documents found for ${topic}/${category}` }]
    };
  }
  const docList = docs.map((d) => `- ${d}.md`).join("\n");
  return {
    content: [{
      type: "text",
      text: `## ${topic}/${category} Documents

${docList}`
    }]
  };
}
function handleKnowledgeListBrief(args, cwd) {
  const topic = args.topic;
  const category = args.category;
  const docs = listKnowledgeDocsBrief(topic, category, cwd);
  if (docs.length === 0) {
    return {
      content: [{ type: "text", text: "No knowledge documents found." }]
    };
  }
  const table = docs.map((d) => `| ${d.topic} | ${d.category} | ${d.name} | ${d.description || "-"} |`).join("\n");
  return {
    content: [{
      type: "text",
      text: `## Knowledge Documents (Brief)

| Topic | Category | Name | Description |
|-------|----------|------|-------------|
${table}

\u{1F4A1} Use \`opc_knowledge_read\` to read full content of specific documents.`
    }]
  };
}
function handleKnowledgeRebuild(args, cwd) {
  const { index, stats } = rebuildKnowledgeIndex(cwd);
  const changes = [];
  if (stats.topicsAdded.length > 0) {
    changes.push(`**Added topics:** ${stats.topicsAdded.join(", ")}`);
  }
  if (stats.topicsRemoved.length > 0) {
    changes.push(`**Removed topics:** ${stats.topicsRemoved.join(", ")}`);
  }
  if (changes.length === 0) {
    changes.push("**No structural changes** - index was in sync with filesystem");
  }
  const topicList = Object.entries(index.topics).map(([slug, t]) => {
    const categories = Object.keys(t.domains).join(", ") || "-";
    const docCount = Object.values(t.domains).flat().length;
    return `| ${slug} | ${t.title} | ${t.status} | ${categories} | ${docCount} |`;
  }).join("\n");
  return {
    content: [{
      type: "text",
      text: `## Knowledge Index Rebuilt

### Statistics
- **Topics found:** ${stats.topicsFound}
- **Categories found:** ${stats.categoriesFound}
- **Documents found:** ${stats.docsFound}

### Changes
${changes.join("\n")}

### Current Index

| Topic | Title | Status | Categories | Docs |
|-------|-------|--------|------------|------|
${topicList}

\u{1F4C1} **Path:** \`.opc/knowledge/index.json\`

\u{1F4A1} Use \`opc_knowledge_list\` to see detailed document listing.`
    }]
  };
}

// ../../build/mcp/handlers/index.js
var handlers = {
  opc_state_read: (_, cwd) => handleStateRead(cwd),
  opc_state_init: (args, cwd) => handleStateInit(args, cwd),
  opc_state_clear: (_, cwd) => handleStateClear(cwd),
  opc_state_write: (args, cwd) => handleStateWrite(args, cwd),
  opc_handoff: (args, cwd) => handleHandoff(args, cwd),
  opc_sessions_list: (_, cwd) => handleSessionsList(cwd),
  opc_task_group_create: (args, cwd) => handleTaskGroupCreate(args, cwd),
  opc_task_update: (args, cwd) => handleTaskUpdate(args, cwd),
  opc_task_group_status: (args, cwd) => handleTaskGroupStatus(args, cwd),
  opc_workflows_path: (_, cwd) => handleWorkflowsPath(cwd),
  opc_knowledge_init: (args, cwd) => handleKnowledgeInit(args, cwd),
  opc_knowledge_read: (args, cwd) => handleKnowledgeRead(args, cwd),
  opc_knowledge_write: (args, cwd) => handleKnowledgeWrite(args, cwd),
  opc_knowledge_exists: (args, cwd) => handleKnowledgeExists(args, cwd),
  opc_knowledge_list: (args, cwd) => handleKnowledgeList(args, cwd),
  opc_knowledge_docs: (args, cwd) => handleKnowledgeDocs(args, cwd),
  opc_knowledge_list_brief: (args, cwd) => handleKnowledgeListBrief(args, cwd),
  opc_knowledge_rebuild_index: (args, cwd) => handleKnowledgeRebuild(args, cwd)
};
async function handleToolCall(name, args) {
  const cwd = args.workingDirectory;
  try {
    const handler = handlers[name];
    if (handler) {
      return handler(args, cwd);
    }
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

// ../../build/mcp/index.js
var server = new import_server.Server({ name: "opc-state", version: "3.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(import_types4.ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(import_types4.CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args || {});
});
async function main() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
}
main().catch(console.error);
