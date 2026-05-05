#!/usr/bin/env python3
"""
OPC First Install Setup

Runs once on first opc-plugin install:
1. Copy built-in workflows to .opc/workflows/
2. Add .opc/state/ to .gitignore
3. Create marker file to prevent re-run
4. Install HUD statusline

Usage:
    python first-install.py <project_root> <marketplace_root>
"""

import json
import shutil
import sys
from pathlib import Path

# Add lib to path
sys.path.insert(0, str(Path(__file__).parent))

from lib import (
    get_git_toplevel,
    install_hud,
)


def get_opc_founder_path(marketplace_path: Path) -> Path:
    """Get opc-founder path from marketplace path."""
    return marketplace_path / "plugins" / "opc-founder"


def run_first_install_setup(project_root: Path, marketplace_path: Path) -> dict:
    """
    Run first install setup if not already done.

    Args:
        project_root: Path to the project where .opc/ will be created
        marketplace_path: Path to opc-marketplace root

    Returns:
        dict with 'executed' (bool) and 'message' (str)
    """
    opc_founder_path = get_opc_founder_path(marketplace_path)
    marker_file = project_root / ".opc" / ".first-install-done"
    workflows_source = opc_founder_path / "workflows" / "built-in"
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
    copied_files = []
    if workflows_source.exists():
        workflows_target.mkdir(parents=True, exist_ok=True)

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

    # 4. Install HUD
    success, message = install_hud(marketplace_path)
    if success:
        results.append(f"✅ {message}")
    else:
        results.append(f"⚠️  {message}")

    return {
        "executed": True,
        "message": "\n".join(results)
    }


def main():
    if len(sys.argv) < 3:
        print("Usage: python first-install.py <project_root> <marketplace_root>")
        sys.exit(1)

    # Get project root (use git toplevel if available)
    arg_path = Path(sys.argv[1]).resolve()
    git_root = get_git_toplevel(arg_path)
    project_root = git_root if git_root else arg_path

    marketplace_path = Path(sys.argv[2]).resolve()

    print("OPC First Install Setup")
    print(f"Project root: {project_root}")
    print(f"Marketplace: {marketplace_path}")
    print()

    result = run_first_install_setup(project_root, marketplace_path)
    print(result["message"])

    return 0


if __name__ == "__main__":
    sys.exit(main())