/**
 * Knowledge Handlers
 *
 * Handles opc_knowledge_* tool calls.
 * Knowledge is organized by topic (e.g., "hud", "state-management").
 */
import { RECOMMENDED_CATEGORIES } from '../types.js';
import { readKnowledgeIndex, createTopic, topicExists, getTopic, readKnowledgeDoc, readAllKnowledgeDocs, writeKnowledgeDoc, knowledgeExists, listKnowledgeDocs, listKnowledgeDocsBrief, readKnowledgeDocWithMeta, rebuildKnowledgeIndex, } from '../knowledge.js';
import { getCurrentTask } from '../session.js';
/**
 * Get the topic from args or current task
 */
function resolveTopic(args, cwd) {
    // If topic is provided directly, use it
    if (args.topic) {
        return args.topic;
    }
    // Get from current task
    const state = getCurrentTask(cwd);
    if (state?.project.knowledge_topic) {
        return state.project.knowledge_topic;
    }
    return null;
}
export function handleKnowledgeInit(args, cwd) {
    const title = args.title;
    const enTopicName = args.en_topic_name;
    // Create topic (or return existing if already exists)
    if (topicExists(enTopicName, cwd)) {
        const topicData = getTopic(enTopicName, cwd);
        return {
            content: [{
                    type: 'text',
                    text: `## Knowledge Topic Already Exists

**Topic:** ${enTopicName}
**Title:** ${topicData?.title || title}
**Path:** .opc/knowledge/${enTopicName}/

Use \`opc_knowledge_write\` to add documents to this topic.`,
                }],
        };
    }
    const result = createTopic(enTopicName, title, '', cwd);
    const topic = result.topic;
    // Build category list from RECOMMENDED_CATEGORIES
    const categoryList = RECOMMENDED_CATEGORIES.map(c => `- \`${c}\``).join('\n');
    return {
        content: [{
                type: 'text',
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
├── requirement/
│   └── main.md
├── ios/
│   ├── architecture.md
│   └── guide.md
└── qa/
    └── test-plan.md
\`\`\``,
            }],
    };
}
export function handleKnowledgeRead(args, cwd) {
    const topic = resolveTopic(args, cwd);
    const category = args.category;
    const doc = args.doc;
    if (!topic) {
        return {
            content: [{ type: 'text', text: 'No topic specified. Provide topic or start a task first.' }],
            isError: true,
        };
    }
    if (doc) {
        const content = readKnowledgeDoc(topic, category, doc, cwd);
        if (!content) {
            return {
                content: [{ type: 'text', text: `Knowledge document not found: ${topic}/${category}/${doc}.md` }],
            };
        }
        return { content: [{ type: 'text', text: content }] };
    }
    const content = readAllKnowledgeDocs(topic, category, cwd);
    if (!content) {
        return {
            content: [{ type: 'text', text: `No knowledge documents found for ${topic}/${category}` }],
        };
    }
    return { content: [{ type: 'text', text: content }] };
}
export function handleKnowledgeWrite(args, cwd) {
    const topic = resolveTopic(args, cwd);
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
    if (!topic) {
        return {
            content: [{
                    type: 'text',
                    text: 'No topic specified. Provide topic or start a task first.',
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
- \`ios\` for iOS platform documents
- \`android\` for Android platform documents
- \`bug-fix\` for bug fix documentation
- \`issue\` for issue analysis
- \`tech-doc\` for technical documentation
- \`guide\` for usage guides

**Naming convention:**
- Use lowercase and hyphens
- Platform: ios, android, web, backend, harmony, miniprogram
- Type: bug-fix, issue, tech-doc, guide, api, architecture`,
                }],
            isError: true,
        };
    }
    // Ensure topic exists
    if (!topicExists(topic, cwd)) {
        createTopic(topic, topic, '', cwd);
    }
    // Prepare metadata: direct parameters take precedence over meta object
    const docMeta = {
        name: name || meta?.name,
        description: description || meta?.description,
        tags: tags || meta?.tags,
    };
    writeKnowledgeDoc(topic, category, doc, content, mode, section, cwd, docMeta);
    // Get the actual metadata that was written
    const docWithMeta = readKnowledgeDocWithMeta(topic, category, doc, cwd);
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

**Topic:** ${topic}
**Document:** ${category}/${doc}.md
**Name:** ${actualName}
**Description:** ${actualDesc}
**Mode:** ${mode}${section ? `\n**Section:** ${section}` : ''}

Content has been ${mode === 'overwrite' ? 'written' : mode === 'update' ? 'updated' : 'appended'}.
${suggestions.length > 0 ? '\n' + suggestions.join('\n') : ''}

💡 **Naming Convention:**
- **Document name** should describe the *purpose*, not the topic (e.g., \`architecture\`, \`guide\`, \`api\`, \`test-plan\`)
- Since the path already includes topic and category, avoid redundant prefixes
- Example: For topic \`ios-localization\` with category \`ios\`, use \`architecture.md\` not \`localization-architecture.md\`

📁 **Path:** \`.opc/knowledge/${topic}/${category}/${doc}.md\``,
            }],
    };
}
export function handleKnowledgeExists(args, cwd) {
    const topic = resolveTopic(args, cwd);
    const category = args.category;
    const doc = args.doc;
    if (!topic) {
        return {
            content: [{ type: 'text', text: 'false' }],
        };
    }
    const exists = knowledgeExists(topic, category, doc, cwd);
    return {
        content: [{ type: 'text', text: exists ? 'true' : 'false' }],
    };
}
export function handleKnowledgeList(args, cwd) {
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
        return { content: [{ type: 'text', text: 'No topics found in knowledge library.' }] };
    }
    const table = topics
        .map(([slug, t]) => {
        const categories = Object.keys(t.domains).join(', ') || '-';
        return `| ${slug} | ${t.title} | ${t.status} | ${categories} | ${t.updated_at.split('T')[0]} |`;
    })
        .join('\n');
    return {
        content: [{
                type: 'text',
                text: `## Knowledge Library

| Topic | Title | Status | Categories | Updated |
|-------|-------|--------|------------|---------|
${table}`,
            }],
    };
}
export function handleKnowledgeDocs(args, cwd) {
    const topic = resolveTopic(args, cwd);
    const category = args.category;
    if (!topic) {
        return {
            content: [{ type: 'text', text: 'No topic specified. Provide topic or start a task first.' }],
            isError: true,
        };
    }
    const docs = listKnowledgeDocs(topic, category, cwd);
    if (docs.length === 0) {
        return {
            content: [{ type: 'text', text: `No documents found for ${topic}/${category}` }],
        };
    }
    const docList = docs.map(d => `- ${d}.md`).join('\n');
    return {
        content: [{
                type: 'text',
                text: `## ${topic}/${category} Documents

${docList}`,
            }],
    };
}
export function handleKnowledgeListBrief(args, cwd) {
    const topic = args.topic;
    const category = args.category;
    const docs = listKnowledgeDocsBrief(topic, category, cwd);
    if (docs.length === 0) {
        return {
            content: [{ type: 'text', text: 'No knowledge documents found.' }],
        };
    }
    const table = docs
        .map(d => `| ${d.topic} | ${d.category} | ${d.name} | ${d.description || '-'} |`)
        .join('\n');
    return {
        content: [{
                type: 'text',
                text: `## Knowledge Documents (Brief)

| Topic | Category | Name | Description |
|-------|----------|------|-------------|
${table}

💡 Use \`opc_knowledge_read\` to read full content of specific documents.`,
            }],
    };
}
export function handleKnowledgeRebuild(args, cwd) {
    const { index, stats } = rebuildKnowledgeIndex(cwd);
    const changes = [];
    if (stats.topicsAdded.length > 0) {
        changes.push(`**Added topics:** ${stats.topicsAdded.join(', ')}`);
    }
    if (stats.topicsRemoved.length > 0) {
        changes.push(`**Removed topics:** ${stats.topicsRemoved.join(', ')}`);
    }
    if (changes.length === 0) {
        changes.push('**No structural changes** - index was in sync with filesystem');
    }
    const topicList = Object.entries(index.topics)
        .map(([slug, t]) => {
        const categories = Object.keys(t.domains).join(', ') || '-';
        const docCount = Object.values(t.domains).flat().length;
        return `| ${slug} | ${t.title} | ${t.status} | ${categories} | ${docCount} |`;
    })
        .join('\n');
    return {
        content: [{
                type: 'text',
                text: `## Knowledge Index Rebuilt

### Statistics
- **Topics found:** ${stats.topicsFound}
- **Categories found:** ${stats.categoriesFound}
- **Documents found:** ${stats.docsFound}

### Changes
${changes.join('\n')}

### Current Index

| Topic | Title | Status | Categories | Docs |
|-------|-------|--------|------------|------|
${topicList}

📁 **Path:** \`.opc/knowledge/index.json\`

💡 Use \`opc_knowledge_list\` to see detailed document listing.`,
            }],
    };
}
