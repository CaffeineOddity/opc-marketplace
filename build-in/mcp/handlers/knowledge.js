/**
 * Knowledge Handlers
 *
 * Handles opc_knowledge_* tool calls.
 * Knowledge is organized by feature (e.g., "hud", "state-management").
 */
import { RECOMMENDED_CATEGORIES } from '../types.js';
import { readKnowledgeIndex, createFeature, featureExists, getFeature, readKnowledgeDoc, readAllKnowledgeDocs, writeKnowledgeDoc, knowledgeExists, listKnowledgeDocs, listKnowledgeDocsBrief, readKnowledgeDocWithMeta, rebuildKnowledgeIndex, scaffoldKnowledgeFeature, } from '../knowledge.js';
import { getCurrentTask } from '../session.js';
/**
 * Get the feature_name from args or current task
 */
function resolveFeatureName(args, cwd) {
    const featureName = args.feature_name;
    if (featureName)
        return featureName;
    // Get from current task
    const state = getCurrentTask(cwd);
    if (state?.project.knowledge_feature_name) {
        return state.project.knowledge_feature_name;
    }
    return null;
}
export function handleKnowledgeInit(args, cwd) {
    const title = args.title;
    const featureName = args.feature_name;
    const scaffold = args.scaffold ?? true;
    const categories = args.categories;
    if (!featureName) {
        return {
            content: [{
                    type: 'text',
                    text: 'Missing required parameter: feature_name.',
                }],
            isError: true,
        };
    }
    // Create feature (or return existing if already exists)
    if (featureExists(featureName, cwd)) {
        const featureData = getFeature(featureName, cwd);
        return {
            content: [{
                    type: 'text',
                    text: `## Knowledge Feature Already Exists

**Feature:** ${featureName}
**Title:** ${featureData?.title || title}
**Path:** .opc/knowledge/${featureName}/

Use \`opc_knowledge_write\` to add documents to this feature.`,
                }],
        };
    }
    const result = createFeature(featureName, title, '', cwd);
    const createdFeature = result.feature_name;
    // Build category list from RECOMMENDED_CATEGORIES
    const categoryList = RECOMMENDED_CATEGORIES.map(c => `- \`${c}\``).join('\n');
    const scaffoldResult = scaffold ? scaffoldKnowledgeFeature(createdFeature, title, cwd, categories) : { created: [] };
    const scaffoldSummary = scaffoldResult.created.length > 0
        ? `\n\n### Scaffolded Docs\n\n${scaffoldResult.created.map(d => `- \`${d.category}/${d.doc}.md\``).join('\n')}`
        : '';
    return {
        content: [{
                type: 'text',
                text: `## Knowledge Library Initialized

**Feature:** ${createdFeature}
**Title:** ${title}
**Path:** .opc/knowledge/${createdFeature}/

Knowledge documents can be created on-demand, or scaffolded during init.

### Available Categories

${categoryList}

(You can also use custom categories)

### Naming Convention

**Feature name** should be semantic and concise:
- Format: \`{platform}-{feature}\` or \`{feature}\`
- Examples: \`ios-localization\`, \`app-login\`, \`app-launch\`, \`hud-status-update\`

**Document name** should describe the *purpose*, not the feature:
- Use: \`architecture\`, \`guide\`, \`api\`, \`test-plan\`
- Avoid: \`localization-architecture\`, \`login-guide\` (redundant with feature path)

**Example path structure:**
\`\`\`
.opc/knowledge/ios-localization/
├── requirement/
│   └── main.md
├── architecture/
│   └── main.md
└── qa_test/
    └── main.md
\`\`\``,
            }],
    };
}
export function handleKnowledgeRead(args, cwd) {
    const featureName = resolveFeatureName(args, cwd);
    const category = args.category;
    const doc = args.doc;
    if (!featureName) {
        return {
            content: [{ type: 'text', text: 'No feature_name specified. Provide feature_name or start a task first.' }],
            isError: true,
        };
    }
    if (doc) {
        const content = readKnowledgeDoc(featureName, category, doc, cwd);
        if (!content) {
            return {
                content: [{ type: 'text', text: `Knowledge document not found: ${featureName}/${category}/${doc}.md` }],
            };
        }
        return { content: [{ type: 'text', text: content }] };
    }
    const content = readAllKnowledgeDocs(featureName, category, cwd);
    if (!content) {
        return {
            content: [{ type: 'text', text: `No knowledge documents found for ${featureName}/${category}` }],
        };
    }
    return { content: [{ type: 'text', text: content }] };
}
export function handleKnowledgeWrite(args, cwd) {
    const featureName = resolveFeatureName(args, cwd);
    const category = args.category;
    const doc = args.doc;
    const content = args.content;
    const mode = args.mode || 'append';
    const section = args.section;
    // Direct metadata parameters (recommended)
    const name = args.name;
    const description = args.description;
    const tags = args.tags;
    // Legacy meta object support (for backward compatibility)
    const meta = args.meta;
    if (!featureName) {
        return {
            content: [{
                    type: 'text',
                    text: 'No feature_name specified. Provide feature_name or start a task first.',
                }],
            isError: true,
        };
    }
    if (!category) {
        return {
            content: [{
                    type: 'text',
                    text: `## Missing Required Parameter

**Error:** \`category\` is required.

Please provide a knowledge category for the document.

**Examples:**
- \`requirement\` for functional/non-functional requirements
- \`architecture\` for system architecture
- \`tech_guide\` for implementation/tech stack guide
- \`api_guide\` for API definitions
- \`core_flows\` for business flow diagrams
- \`qa_test\` for test and acceptance

**Naming convention:**
- Use lowercase and hyphens
- Use underscores only when you prefer (e.g., \`core_flows\`, \`qa_test\`)`,
                }],
            isError: true,
        };
    }
    // Ensure feature exists
    if (!featureExists(featureName, cwd)) {
        createFeature(featureName, featureName, '', cwd);
    }
    // Prepare metadata: direct parameters take precedence over meta object
    const docMeta = {
        name: name || meta?.name,
        description: description || meta?.description,
        tags: tags || meta?.tags,
    };
    writeKnowledgeDoc(featureName, category, doc, content, mode, section, cwd, docMeta);
    // Get the actual metadata that was written
    const docWithMeta = readKnowledgeDocWithMeta(featureName, category, doc, cwd);
    const actualName = docWithMeta?.meta.name || doc;
    const actualDesc = docWithMeta?.meta.description || '';
    // Build suggestion if name/description not provided
    const suggestions = [];
    if (!name && !docMeta.name) {
        suggestions.push('💡 **Tip:** Provide `name` parameter for a human-readable document title.');
    }
    if (!description && !docMeta.description) {
        suggestions.push('💡 **Tip:** Provide `description` parameter for a brief document summary.');
    }
    return {
        content: [{
                type: 'text',
                text: `## Knowledge Written

**Feature:** ${featureName}
**Document:** ${category}/${doc}.md
**Name:** ${actualName}
**Description:** ${actualDesc}
**Mode:** ${mode}${section ? `\n**Section:** ${section}` : ''}

Content has been ${mode === 'overwrite' ? 'written' : mode === 'update' ? 'updated' : 'appended'}.
${suggestions.length > 0 ? '\n' + suggestions.join('\n') : ''}

💡 **Naming Convention:**
- **Document name** should describe the *purpose*, not the feature (e.g., \`main\`, \`ui\`, \`index\`)
- Since the path already includes feature and category, avoid redundant prefixes
- Example: For feature \`ios-localization\`, use \`tech_guide/main.md\` not \`localization-tech.md\`

📁 **Path:** \`.opc/knowledge/${featureName}/${category}/${doc}.md\``,
            }],
    };
}
export function handleKnowledgeExists(args, cwd) {
    const featureName = resolveFeatureName(args, cwd);
    const category = args.category;
    const doc = args.doc;
    if (!featureName) {
        return {
            content: [{ type: 'text', text: 'false' }],
        };
    }
    const exists = knowledgeExists(featureName, category, doc, cwd);
    return {
        content: [{ type: 'text', text: exists ? 'true' : 'false' }],
    };
}
export function handleKnowledgeList(args, cwd) {
    const status = args.status;
    const categoryFilter = args.category;
    const index = readKnowledgeIndex(cwd);
    let features = Object.entries(index.features);
    if (status) {
        features = features.filter(([, f]) => f.status === status);
    }
    if (categoryFilter) {
        features = features.filter(([, f]) => f.categories[categoryFilter]?.length > 0);
    }
    if (features.length === 0) {
        return { content: [{ type: 'text', text: 'No features found in knowledge library.' }] };
    }
    const table = features
        .map(([slug, f]) => {
        const categories = Object.keys(f.categories).join(', ') || '-';
        return `| ${slug} | ${f.title} | ${f.status} | ${categories} | ${f.updated_at.split('T')[0]} |`;
    })
        .join('\n');
    return {
        content: [{
                type: 'text',
                text: `## Knowledge Library

| Feature | Title | Status | Categories | Updated |
|---------|-------|--------|------------|---------|
${table}`,
            }],
    };
}
export function handleKnowledgeDocs(args, cwd) {
    const featureName = resolveFeatureName(args, cwd);
    const category = args.category;
    if (!featureName) {
        return {
            content: [{ type: 'text', text: 'No feature_name specified. Provide feature_name or start a task first.' }],
            isError: true,
        };
    }
    const docs = listKnowledgeDocs(featureName, category, cwd);
    if (docs.length === 0) {
        return {
            content: [{ type: 'text', text: `No documents found for ${featureName}/${category}` }],
        };
    }
    const docList = docs.map(d => `- ${d}.md`).join('\n');
    return {
        content: [{
                type: 'text',
                text: `## ${featureName}/${category} Documents

${docList}`,
            }],
    };
}
export function handleKnowledgeListBrief(args, cwd) {
    const featureName = args.feature_name;
    const category = args.category;
    const docs = listKnowledgeDocsBrief(featureName, category, cwd);
    if (docs.length === 0) {
        return {
            content: [{ type: 'text', text: 'No knowledge documents found.' }],
        };
    }
    const table = docs
        .map(d => `| ${d.feature_name} | ${d.category} | ${d.name} | ${d.description || '-'} |`)
        .join('\n');
    return {
        content: [{
                type: 'text',
                text: `## Knowledge Documents (Brief)

| Feature | Category | Name | Description |
|---------|----------|------|-------------|
${table}

💡 Use \`opc_knowledge_read\` to read full content of specific documents.`,
            }],
    };
}
export function handleKnowledgeRebuild(args, cwd) {
    const { index, stats } = rebuildKnowledgeIndex(cwd);
    const changes = [];
    if (stats.featuresAdded.length > 0) {
        changes.push(`**Added features:** ${stats.featuresAdded.join(', ')}`);
    }
    if (stats.featuresRemoved.length > 0) {
        changes.push(`**Removed features:** ${stats.featuresRemoved.join(', ')}`);
    }
    if (changes.length === 0) {
        changes.push('**No structural changes** - index was in sync with filesystem');
    }
    const featureList = Object.entries(index.features)
        .map(([slug, f]) => {
        const categories = Object.keys(f.categories).join(', ') || '-';
        const docCount = Object.values(f.categories).flat().length;
        return `| ${slug} | ${f.title} | ${f.status} | ${categories} | ${docCount} |`;
    })
        .join('\n');
    return {
        content: [{
                type: 'text',
                text: `## Knowledge Index Rebuilt

### Statistics
- **Features found:** ${stats.featuresFound}
- **Categories found:** ${stats.categoriesFound}
- **Documents found:** ${stats.docsFound}

### Changes
${changes.join('\n')}

### Current Index

| Feature | Title | Status | Categories | Docs |
|---------|-------|--------|------------|------|
${featureList}

📁 **Path:** \`.opc/knowledge/index.json\`

💡 Use \`opc_knowledge_list\` to see detailed document listing.`,
            }],
    };
}
