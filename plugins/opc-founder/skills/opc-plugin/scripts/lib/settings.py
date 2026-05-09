"""
Settings utilities for OPC plugin scripts.

Handles reading/writing Claude settings.json and installed_plugins.json.
"""

import json
import tempfile
from pathlib import Path
from typing import Any, Optional


def read_json(path: Path) -> Optional[dict]:
    """
    Read JSON file safely.

    Args:
        path: Path to JSON file

    Returns:
        Parsed JSON dict, or None if file doesn't exist or is invalid
    """
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except:
        return None


def write_json(path: Path, data: dict):
    """
    Write JSON file atomically.

    Args:
        path: Target path
        data: Data to write
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(data, indent=2))
    temp_path.replace(path)


def update_settings_plugins(plugins: list[str], enable: bool = True):
    """
    Update settings.json enabledPlugins.

    Args:
        plugins: List of plugin names (e.g., "product-kit")
        enable: True to enable, False to disable
    """
    from .paths import get_settings_path

    settings_path = get_settings_path()
    settings = read_json(settings_path) or {}

    if "enabledPlugins" not in settings:
        settings["enabledPlugins"] = {}

    for plugin_name in plugins:
        key = f"{plugin_name}@opc-marketplace"
        settings["enabledPlugins"][key] = enable

    write_json(settings_path, settings)


def update_statusline(command: str):
    """
    Update settings.json statusLine.

    Args:
        command: Command to set as statusLine
    """
    from .paths import get_settings_path

    settings_path = get_settings_path()
    settings = read_json(settings_path) or {}

    settings["statusLine"] = {
        "type": "command",
        "command": command
    }

    write_json(settings_path, settings)


def remove_statusline() -> bool:
    """
    Remove statusLine from settings.json if it's OPC HUD.

    Returns:
        True if removed, False if not OPC HUD or error
    """
    from .paths import get_settings_path

    settings_path = get_settings_path()
    settings = read_json(settings_path)

    if not settings:
        return False

    statusline = settings.get("statusLine", {})
    command = statusline.get("command", "")

    if "opc-hud.mjs" in command:
        del settings["statusLine"]
        write_json(settings_path, settings)
        return True

    return False


def update_installed_plugins(plugins: list[str], marketplace_path: Path, add: bool = True):
    """
    Update installed_plugins.json.

    Args:
        plugins: List of plugin names
        marketplace_path: Path to marketplace root
        add: True to add, False to remove
    """
    from .paths import get_installed_plugins_path
    from .plugins import get_plugin_version
    from datetime import datetime

    installed_path = get_installed_plugins_path()
    installed = read_json(installed_path) or {"version": 2, "plugins": {}}

    now = datetime.utcnow().isoformat() + "Z"

    # Get git commit SHA if available
    git_sha = None
    try:
        import subprocess
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(marketplace_path),
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            git_sha = result.stdout.strip()
    except:
        pass

    for plugin_name in plugins:
        key = f"{plugin_name}@opc-marketplace"

        if add:
            from .paths import get_cache_dir
            version = get_plugin_version(marketplace_path / "plugins" / plugin_name)
            cache_path = get_cache_dir() / plugin_name / version

            entry = {
                "scope": "user",
                "installPath": str(cache_path),
                "version": version,
                "installedAt": now,
                "lastUpdated": now,
            }

            if git_sha:
                entry["gitCommitSha"] = git_sha

            installed["plugins"][key] = [entry]
        else:
            if key in installed["plugins"]:
                del installed["plugins"][key]

    write_json(installed_path, installed)
