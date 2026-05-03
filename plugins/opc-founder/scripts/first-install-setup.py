#!/usr/bin/env python3
"""
OPC First Install Setup

Runs once on first opc-plugin install:
1. Copy built-in workflows to .opc/workflows/
2. Add .opc/state/ to .gitignore
3. Create marker file to prevent re-run

Usage:
    python scripts/first-install-setup.py [project_root]
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def get_script_dir() -> Path:
    """Get the directory where this script is located."""
    return Path(__file__).parent.resolve()


def get_git_toplevel(path: Path = None) -> Path | None:
    """Get git toplevel directory using git rev-parse."""
    try:
        cwd = str(path) if path else None
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True
        )
        return Path(result.stdout.strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def get_project_root() -> Path:
    """Get project root from argument, git toplevel, or current working directory."""
    if len(sys.argv) > 1:
        arg_path = Path(sys.argv[1]).resolve()
        # Use git toplevel if the argument is inside a git repo
        git_root = get_git_toplevel(arg_path)
        return git_root if git_root else arg_path

    # Try git toplevel from cwd
    git_root = get_git_toplevel()
    return git_root if git_root else Path.cwd()


def get_marketplace_root() -> Path:
    """Get marketplace root (parent of scripts directory)."""
    return get_script_dir().parent


def run_first_install_setup(project_root: Path) -> dict:
    """
    Run first install setup if not already done.

    Returns:
        dict with 'executed' (bool) and 'message' (str)
    """
    marketplace_root = get_marketplace_root()
    marker_file = project_root / ".opc" / ".first-install-done"
    workflows_source = marketplace_root / "plugins" / "opc-founder" / "workflows" / "built-in"
    workflows_target = project_root / ".opc" / "workflows"
    gitignore_path = project_root / ".gitignore"

    # Check if already done
    if marker_file.exists():
        return {
            "executed": False,
            "message": "First install already done, skipping setup."
        }

    results = []

    # 1. Copy built-in workflows
    if workflows_source.exists():
        workflows_target.mkdir(parents=True, exist_ok=True)

        # Copy each JSON file
        copied_files = []
        for workflow_file in workflows_source.glob("*.json"):
            target_file = workflows_target / workflow_file.name
            shutil.copy2(workflow_file, target_file)
            copied_files.append(workflow_file.name)

        if copied_files:
            results.append(f"✅ Copied {len(copied_files)} workflows to .opc/workflows/")
    else:
        results.append("⚠️  Workflows source not found, skipping workflow copy.")

    # 2. Update .gitignore
    gitignore_entry = """
# OPC state - personal session data, don't commit
.opc/state/
"""

    if not gitignore_path.exists():
        gitignore_path.write_text(gitignore_entry)
        results.append("✅ Created .gitignore with OPC entries.")
    else:
        content = gitignore_path.read_text()
        if ".opc/state/" not in content:
            gitignore_path.write_text(content + gitignore_entry)
            results.append("✅ Updated .gitignore with .opc/state/ entry.")
        else:
            results.append("ℹ️  .gitignore already has .opc/state/ entry.")

    # 3. Create marker file
    marker_file.parent.mkdir(parents=True, exist_ok=True)
    marker_info = {
        "version": "1.0.0",
        "installed_at": __import__("datetime").datetime.now().isoformat(),
        "workflows_copied": len(copied_files) if workflows_source.exists() else 0
    }
    marker_file.write_text(json.dumps(marker_info, indent=2))
    results.append("✅ Created first-install marker.")

    return {
        "executed": True,
        "message": "\n".join(results)
    }


def main():
    project_root = get_project_root()

    print(f"OPC First Install Setup")
    print(f"Project root: {project_root}")
    print(f"Marketplace: {get_marketplace_root()}")
    print()

    result = run_first_install_setup(project_root)
    print(result["message"])

    return 0 if result["executed"] or not result["executed"] else 1


if __name__ == "__main__":
    sys.exit(main())
