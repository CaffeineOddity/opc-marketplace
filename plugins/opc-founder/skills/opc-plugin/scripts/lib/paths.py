"""
Path utilities for OPC plugin scripts.

Provides consistent path resolution for Claude config directories,
marketplace locations, and git roots.
"""

import subprocess
from pathlib import Path


def get_home() -> Path:
    """Get home directory."""
    return Path.home()


def get_claude_dir() -> Path:
    """Get Claude config directory (~/.claude)."""
    return get_home() / ".claude"


def get_marketplace_path() -> Path | None:
    """
    Find opc-marketplace path.

    Checks:
    1. Official marketplaces directory
    2. Current script location (for development)

    Returns:
        Path to opc-marketplace root, or None if not found
    """
    # Check marketplaces directory first (Claude Code's official location)
    marketplaces_dir = get_claude_dir() / "plugins" / "marketplaces" / "opc-marketplace"
    if marketplaces_dir.exists():
        return marketplaces_dir

    # Check if we're running from within the marketplace (development mode)
    try:
        script_dir = Path(__file__).parent.parent.resolve()
        if (script_dir.parent.name == "opc-plugin" and
            script_dir.parent.parent.name == "skills" and
            script_dir.parent.parent.parent.name == "opc-founder"):
            return script_dir.parent.parent.parent.parent.parent
    except:
        pass

    return None


def get_cache_dir() -> Path:
    """Get plugin cache directory."""
    return get_claude_dir() / "plugins" / "cache" / "opc-marketplace"


def get_installed_plugins_path() -> Path:
    """Get installed_plugins.json path."""
    return get_claude_dir() / "plugins" / "installed_plugins.json"


def get_settings_path() -> Path:
    """Get settings.json path."""
    return get_claude_dir() / "settings.json"


def get_git_toplevel(path: Path = None) -> Path | None:
    """
    Get git toplevel directory using git rev-parse.

    Args:
        path: Starting path for git lookup (defaults to cwd)

    Returns:
        Git root path, or None if not in a git repo
    """
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


def get_project_root(start_path: Path = None) -> Path:
    """
    Get project root from git toplevel or current working directory.

    Args:
        start_path: Starting path (defaults to cwd)

    Returns:
        Project root path
    """
    if start_path:
        git_root = get_git_toplevel(start_path)
        return git_root if git_root else start_path

    git_root = get_git_toplevel()
    return git_root if git_root else Path.cwd()