#!/usr/bin/env python3
"""
OPC Workflows Init

Copy built-in workflows from opc-founder plugin to project's .opc/workflows/ directory.

Usage:
    python init.py [--force] [--dry-run]
"""

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

# Add lib to path from opc-plugin
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "opc-plugin" / "scripts"))

from lib import (
    get_git_toplevel,
    get_marketplace_path,
)


def get_opc_founder_path(marketplace_path: Path) -> Path:
    """Get opc-founder plugin path from marketplace path."""
    return marketplace_path / "plugins" / "opc-founder"


def run_workflows_init(project_root: Path, marketplace_path: Path, force: bool = False, dry_run: bool = False) -> dict:
    """
    Copy built-in workflows to project.

    Args:
        project_root: Path to the project where .opc/workflows/ exists
        marketplace_path: Path to opc-marketplace root
        force: Overwrite existing workflows
        dry_run: Show what would happen without making changes

    Returns:
        dict with results
    """
    opc_founder_path = get_opc_founder_path(marketplace_path)
    workflows_source = opc_founder_path / "workflows" / "built-in"
    workflows_target = project_root / ".opc" / "workflows"
    marker_file = project_root / ".opc" / ".workflows-init"

    results = {
        "dry_run": dry_run,
        "copied": [],
        "skipped": [],
        "preserved": [],
        "errors": []
    }

    # Check source exists
    if not workflows_source.exists():
        results["errors"].append(f"Built-in workflows not found at {workflows_source}")
        return results

    # Ensure target directory exists
    if not dry_run:
        workflows_target.mkdir(parents=True, exist_ok=True)

    # Get list of built-in workflows
    built_in_workflows = list(workflows_source.glob("*.json"))

    # Get existing workflows in target
    existing_workflows = list(workflows_target.glob("*.json")) if workflows_target.exists() else []
    existing_names = {w.name for w in existing_workflows}
    built_in_names = {w.name for w in built_in_workflows}

    # Identify custom workflows (not in built-in)
    custom_workflows = [w for w in existing_workflows if w.name not in built_in_names]
    results["preserved"] = [w.name for w in custom_workflows]

    # Process each built-in workflow
    for workflow_file in built_in_workflows:
        target_file = workflows_target / workflow_file.name

        if target_file.exists() and not force:
            results["skipped"].append(workflow_file.name)
        else:
            if dry_run:
                action = "would copy" if not target_file.exists() else "would overwrite"
                results["copied"].append(f"{workflow_file.name} ({action})")
            else:
                shutil.copy2(workflow_file, target_file)
                action = "copied" if not target_file.exists() else "overwritten"
                results["copied"].append(f"{workflow_file.name} ({action})")

    # Update marker file (not in dry_run)
    if not dry_run:
        marker_file.parent.mkdir(parents=True, exist_ok=True)
        marker_info = {
            "version": "1.0.0",
            "last_init": datetime.now().isoformat(),
            "workflows_count": len(built_in_workflows),
            "force_mode": force
        }
        marker_file.write_text(json.dumps(marker_info, indent=2))

    return results


def format_output(results: dict) -> str:
    """Format results for display."""
    lines = []

    if results["dry_run"]:
        lines.append("OPC Workflows Init (dry-run mode)")
        lines.append("No changes will be made.")
    else:
        lines.append("OPC Workflows Init")

    lines.append("")

    if results["errors"]:
        for error in results["errors"]:
            lines.append(f"❌ {error}")
        return "\n".join(lines)

    if results["copied"]:
        lines.append(f"✅ {len(results['copied'])} workflows {'would be ' if results['dry_run'] else ''}copied:")
        for item in results["copied"]:
            lines.append(f"  - {item}")

    if results["skipped"]:
        lines.append(f"ℹ️  {len(results['skipped'])} existing workflows skipped (use --force to overwrite):")
        for item in results["skipped"]:
            lines.append(f"  - {item}")

    if results["preserved"]:
        lines.append(f"ℹ️  {len(results['preserved'])} custom workflows preserved:")
        for item in results["preserved"]:
            lines.append(f"  - {item}")

    if not results["dry_run"]:
        lines.append("")
        lines.append("✅ Workflows initialized successfully.")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Initialize OPC workflows")
    parser.add_argument("--force", action="store_true", help="Overwrite existing workflows")
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

    results = run_workflows_init(project_root, marketplace_path, force=args.force, dry_run=args.dry_run)
    print(format_output(results))

    return 0 if not results["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())