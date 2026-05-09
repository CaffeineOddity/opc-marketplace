"""
HUD utilities for OPC plugin scripts.

Handles HUD statusline installation and removal.
"""

from pathlib import Path


def install_hud(marketplace_path: Path) -> tuple[bool, str]:
    """
    Install HUD statusline.

    Args:
        marketplace_path: Path to opc-marketplace root

    Returns:
        Tuple of (success, message)
    """
    from .settings import update_statusline

    # HUD bundle is located in build-in/hud (built from TypeScript)
    hud_path = marketplace_path / "build-in" / "hud" / "opc-hud.bundle.cjs"

    if not hud_path.exists():
        return (False, "HUD source not found. Please run 'npm run build' in src/hud first.")

    # Update settings.json with statusLine pointing to the fixed location
    update_statusline(f"node {hud_path}")

    return (True, f"Installed HUD statusline")


def uninstall_hud() -> tuple[bool, str]:
    """
    Remove HUD statusline.

    Returns:
        Tuple of (success, message)
    """
    from .settings import remove_statusline

    # Remove statusLine from settings.json
    statusline_removed = remove_statusline()

    if statusline_removed:
        return (True, "Removed HUD statusline")
    else:
        return (False, "HUD not installed")


def check_hud_status() -> dict:
    """
    Check HUD installation status.

    Returns:
        Dict with status info
    """
    from .paths import get_settings_path
    from .settings import read_json

    settings_path = get_settings_path()

    settings = read_json(settings_path)
    statusline = settings.get("statusLine", {})
    command = statusline.get("command", "")
    statusline_is_hud = "opc-hud" in command

    return {
        "statusline_configured": statusline_is_hud,
        "statusline_command": command if statusline_is_hud else None,
    }