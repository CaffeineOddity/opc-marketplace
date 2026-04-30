# caffeine/opc-marketplace

Caffeine's personal Claude Code plugin marketplace — skills, agents, and hooks for everyday development.

## Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| [code-review](./plugins/code-review) | Skill | `/code-review` — Quick code review for bugs, security, performance, readability |
| [devops-agent](./plugins/devops-agent) | Agent | DevOps specialist for deployment, env config, log analysis, and infrastructure troubleshooting |
| [auto-lint](./plugins/auto-lint) | Hook | Auto-lint on file edit — runs eslint/py_compile/go vet on Write/Edit |

## Install

Add the marketplace:

```shell
/plugin marketplace add caffeine/opc-marketplace
```

Install a plugin:

```shell
/plugin install code-review@opc-marketplace
/plugin install devops-agent@opc-marketplace
/plugin install auto-lint@opc-marketplace
```

Update all plugins:

```shell
/plugin marketplace update opc-marketplace
```

## Usage

### /code-review

Select code or make changes, then run:

```shell
/code-review
```

### devops-agent

The devops agent is available as a specialized agent when you need help with deployment, infrastructure, or operational tasks.

### auto-lint

Automatically active after installation. When you use `Write` or `Edit` tools, the hook runs lint checks based on file type:

- `.js/.jsx/.ts/.tsx` — eslint
- `.py` — py_compile
- `.go` — go vet
- `.rs` — cargo check
