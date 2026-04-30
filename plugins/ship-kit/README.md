# ship-kit

Ship stage plugin — deployment, CI/CD, infrastructure, cost optimization, and incident response for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/deploy` | Structured deployment with rollback |
| `/ci-pipeline` | GitHub Actions CI/CD templates |
| `/changelog` | Automated changelog generation |
| `/cost-opt` | Cloud cost optimization (AWS / Azure / GCP / OCI) |
| `/incident-runbook` | Incident response runbook templates |
| `/terraform` | Terraform IaC module library |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| devops-agent | sonnet | Deployment, infrastructure, operations |
| cloud-architect | inherit | Multi-cloud architecture, IaC, FinOps |
| incident-responder | sonnet | SRE incident response, troubleshooting, post-mortem |

### Hooks

| Hook | Description |
|------|-------------|
| pre-deploy-check | Deploy command safety check |

## Quick Start

### Deploy

```shell
/deploy <service or application>
```

Structured deployment:
- Pre-deployment checklist
- Deployment steps
- Verification
- Rollback plan

### CI Pipeline

```shell
/ci-pipeline <project type>
```

Generates GitHub Actions workflow:
- Build stage
- Test stage
- Deploy stage
- Environment matrix

### Cost Optimization

```shell
/cost-opt <cloud provider>
```

Analyzes and optimizes:
- Compute costs
- Storage costs
- Network costs
- Unused resources

### Incident Runbook

```shell
/incident-runbook <incident type>
```

Generates runbook with:
- Detection signals
- Diagnosis steps
- Mitigation actions
- Communication templates
- Post-mortem outline

### Terraform

```shell
/terraform <resource>
```

Generates Terraform module:
- Resource definition
- Variables
- Outputs
- Best practices

## Agent Usage

### devops-agent

Use for:
- Deployment automation
- CI/CD pipeline design
- Infrastructure provisioning
- Environment management
- Monitoring setup

**Receives from:** qa-agent (approval), backend-agent (deployment config)
**Delivers to:** marketing-agent (launch coordination)

### cloud-architect

Use for:
- Multi-cloud architecture
- Infrastructure as Code
- Cost optimization (FinOps)
- Disaster recovery
- Security architecture

### incident-responder

Use for:
- Incident triage
- Root cause analysis
- Mitigation execution
- Post-mortem writing
- SRE practices

## Workflow Integration

```
qa-kit (approval) → ship-kit (deploy) → growth-kit (launch)
```

### Deployment Flow

```
/deploy → devops-agent → /verification-before-completion
    │
    ├── Pre-deploy checklist
    ├── Execute deployment
    ├── Verify health
    └── Rollback if needed
```

### Incident Response Flow

```
incident-responder → triage + diagnosis
    │
    ├── devops-agent → mitigation
    │
    ├── cloud-architect → infrastructure changes
    │
    └── /incident-runbook → documentation
```

## Deployment Checklist

```markdown
## Pre-Deployment
- [ ] All tests pass
- [ ] Code review approved
- [ ] Changelog updated
- [ ] Environment variables configured
- [ ] Rollback plan documented

## Deployment
- [ ] Deploy to staging
- [ ] Smoke tests pass
- [ ] Deploy to production
- [ ] Health checks pass

## Post-Deployment
- [ ] Monitoring alerts configured
- [ ] Documentation updated
- [ ] Team notified
```
