#!/usr/bin/env python3
"""
OPC Project Init

Initialize OPC project configuration:
1. Configure .gitignore (add .opc/state/)
2. Copy built-in workflows to .opc/workflows/
3. Create marker file to prevent re-run

Usage:
    python init.py [--force] [--dry-run]
"""

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

# Add lib to path
sys.path.insert(0, str(Path(__file__).parent))

from lib import (
    get_git_toplevel,
    get_marketplace_path,
)


def get_opc_founder_path(marketplace_path: Path) -> Path:
    """Get opc-founder path from marketplace path."""
    return marketplace_path / "plugins" / "opc-founder"


def run_project_init(project_root: Path, marketplace_path: Path, force: bool = False, dry_run: bool = False) -> dict:
    """
    Run project initialization.

    Args:
        project_root: Path to the project where .opc/ will be created
        marketplace_path: Path to opc-marketplace root
        force: Force re-run even if marker exists
        dry_run: Show what would happen without making changes

    Returns:
        dict with results
    """
    opc_founder_path = get_opc_founder_path(marketplace_path)
    marker_file = project_root / ".opc" / ".project-init"
    gitignore_path = project_root / ".gitignore"

    results = {
        "dry_run": dry_run,
        "gitignore": None,
        "workflows": None,
        "marker": None,
        "errors": []
    }

    # Check marker file (skip if exists unless force)
    if marker_file.exists() and not force:
        marker_info = json.loads(marker_file.read_text())
        results["marker"] = {
            "status": "skipped",
            "reason": "already_initialized",
            "info": marker_info
        }
        return results

    # 1. Configure .gitignore
    gitignore_entry = """
# OPC state - personal session data, don't commit
.opc/state/
"""

    if dry_run:
        if not gitignore_path.exists():
            results["gitignore"] = {"status": "would_create", "action": "create .gitignore with OPC entries"}
        elif ".opc/state/" not in gitignore_path.read_text():
            results["gitignore"] = {"status": "would_update", "action": "add .opc/state/ entry"}
        else:
            results["gitignore"] = {"status": "already_configured", "action": "no changes needed"}
    else:
        if not gitignore_path.exists():
            gitignore_path.write_text(gitignore_entry)
            results["gitignore"] = {"status": "created", "action": "Created .gitignore with OPC entries"}
        else:
            content = gitignore_path.read_text()
            if ".opc/state/" not in content:
                gitignore_path.write_text(content + gitignore_entry)
                results["gitignore"] = {"status": "updated", "action": "Updated .gitignore with .opc/state/ entry"}
            else:
                results["gitignore"] = {"status": "already_configured", "action": ".gitignore already has .opc/state/ entry"}

    # 2. Copy built-in workflows
    workflows_source = opc_founder_path / "workflows" / "built-in"
    workflows_target = project_root / ".opc" / "workflows"

    if not workflows_source.exists():
        results["errors"].append(f"Built-in workflows not found at {workflows_source}")
    else:
        if dry_run:
            workflows_target.mkdir(parents=True, exist_ok=True)
            workflow_files = list(workflows_source.glob("*.json"))
            results["workflows"] = {
                "status": "would_copy",
                "count": len(workflow_files),
                "files": [f.name for f in workflow_files]
            }
        else:
            workflows_target.mkdir(parents=True, exist_ok=True)
            copied_files = []

            for workflow_file in workflows_source.glob("*.json"):
                target_file = workflows_target / workflow_file.name
                if not target_file.exists() or force:
                    shutil.copy2(workflow_file, target_file)
                    copied_files.append(workflow_file.name)

            results["workflows"] = {
                "status": "copied",
                "count": len(copied_files),
                "files": copied_files
            }

    # 3. Create marker file
    if dry_run:
        results["marker"] = {"status": "would_create", "action": "create .opc/.project-init marker"}
    else:
        marker_file.parent.mkdir(parents=True, exist_ok=True)
        marker_info = {
            "version": "1.0.0",
            "initialized_at": datetime.now().isoformat(),
            "workflows_count": results["workflows"]["count"] if results["workflows"] else 0,
            "force_mode": force
        }
        marker_file.write_text(json.dumps(marker_info, indent=2))
        results["marker"] = {"status": "created", "action": "Created project init marker", "info": marker_info}

    return results


def format_output(results: dict) -> str:
    """Format results for display."""
    lines = []

    if results["dry_run"]:
        lines.append("OPC Project Init (dry-run mode)")
        lines.append("No changes will be made.")
    else:
        lines.append("OPC Project Init")

    lines.append("")

    if results["errors"]:
        for error in results["errors"]:
            lines.append(f"❌ {error}")
        return "\n".join(lines)

    # Gitignore status
    if results["gitignore"]:
        status = results["gitignore"]["status"]
        action = results["gitignore"]["action"]
        if "would" in status or status == "already_configured":
            lines.append(f"ℹ️  Gitignore: {action}")
        else:
            lines.append(f"✅ Gitignore: {action}")

    # Workflows status
    if results["workflows"]:
        status = results["workflows"]["status"]
        count = results["workflows"]["count"]
        if "would" in status:
            lines.append(f"ℹ️  Workflows: would copy {count} workflows")
        else:
            lines.append(f"✅ Workflows: copied {count} workflows to .opc/workflows/")

    # Marker status
    if results["marker"]:
        status = results["marker"]["status"]
        if status == "skipped":
            info = results["marker"]["info"]
            lines.append(f"ℹ️  Marker: already initialized at {info.get('initialized_at', 'unknown')}")
            lines.append("   Use --force to re-run initialization")
        elif "would" in status:
            lines.append(f"ℹ️  Marker: {results['marker']['action']}")
        else:
            lines.append(f"✅ Marker: {results['marker']['action']}")

    if not results["dry_run"] and results["marker"]["status"] != "skipped":
        lines.append("")
        lines.append("✅ Project initialized successfully.")
        lines.append("")
        lines.append("Next steps:")
        lines.append("  1. Run /opc-plugin install hud to install HUD statusline")
        lines.append("  2. Use /opc-workflows list to see available workflows")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Initialize OPC project configuration")
    parser.add_argument("--force", action="store_true", help="Force re-run even if already initialized")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen without making changes")
    args = parser.parse_args()

    # Get project root (use git toplevel)
    cwd = Path.cwd()
    git_root = get_git_toplevel(cwd)
    project_root = git_root if git_root else cwd

    # Get marketplace path
    marketplace_path = get_marketplace_path()

    if not marketplace_path:
        print("❌ Marketplace not found. Please ensure opc-marketplace is installed.")
        print("   Run: /plugin marketplace add CaffeineOddity/opc-marketplace")
        return 1

    print(f"Project: {project_root}")
    print(f"Marketplace: {marketplace_path}")
    print()

    results = run_project_init(project_root, marketplace_path, force=args.force, dry_run=args.dry_run)
    print(format_output(results))

    return 0 if not results["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())