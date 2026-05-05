"""
HUD utilities for OPC plugin scripts.

Handles HUD statusline installation and removal.
"""

import shutil
from pathlib import Path


def install_hud(marketplace_path: Path) -> tuple[bool, str]:
    """
    Install HUD statusline.

    Args:
        marketplace_path: Path to opc-marketplace root

    Returns:
        Tuple of (success, message)
    """
    from .paths import get_claude_dir
    from .settings import update_statusline

    claude_config = get_claude_dir()

    # HUD source is in opc-founder plugin
    hud_source = marketplace_path / "plugins" / "opc-founder" / "hud" / "opc-hud.mjs"

    # Install to marketplaces directory (persistent)
    hud_target_dir = claude_config / "plugins" / "marketplaces" / "opc-marketplace" / ".claude" / "hud"
    hud_target = hud_target_dir / "opc-hud.mjs"

    if not hud_source.exists():
        return (False, "HUD source not found, skipping HUD installation.")

    # Create target directory and copy HUD script
    hud_target_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(hud_source, hud_target)

    # Make executable
    hud_target.chmod(0o755)

    # Update settings.json with statusLine
    update_statusline(f"node {hud_target}")

    return (True, f"Installed HUD statusline")


def uninstall_hud() -> tuple[bool, str]:
    """
    Remove HUD statusline.

    Returns:
        Tuple of (success, message)
    """
    from .paths import get_claude_dir
    from .settings import remove_statusline

    claude_config = get_claude_dir()
    removed_files = []

    # Remove HUD from both locations
    locations = [
        claude_config / "plugins" / "cache" / "opc-marketplace" / "hud" / "opc-hud.mjs",
        claude_config / "plugins" / "marketplaces" / "opc-marketplace" / ".claude" / "hud" / "opc-hud.mjs",
    ]

    for hud_path in locations:
        if hud_path.exists():
            hud_path.unlink()
            removed_files.append(str(hud_path.parent))

            # Remove empty directories
            try:
                hud_path.parent.rmdir()
            except:
                pass

    # Remove statusLine from settings.json
    statusline_removed = remove_statusline()

    if removed_files or statusline_removed:
        return (True, f"Removed HUD ({len(removed_files)} files, statusLine: {statusline_removed})")
    else:
        return (False, "HUD not installed")


def check_hud_status() -> dict:
    """
    Check HUD installation status.

    Returns:
        Dict with status info
    """
    from .paths import get_claude_dir, get_settings_path
    from .settings import read_json

    claude_config = get_claude_dir()
    settings_path = get_settings_path()

    hud_locations = [
        claude_config / "plugins" / "cache" / "opc-marketplace" / "hud" / "opc-hud.mjs",
        claude_config / "plugins" / "marketplaces" / "opc-marketplace" / ".claude" / "hud" / "opc-hud.mjs",
    ]

    hud_exists = any(p.exists() for p in hud_locations)
    hud_path = next((p for p in hud_locations if p.exists()), None)

    settings = read_json(settings_path)
    statusline = settings.get("statusLine", {})
    command = statusline.get("command", "")
    statusline_is_hud = "opc-hud.mjs" in command

    return {
        "hud_exists": hud_exists,
        "hud_path": str(hud_path) if hud_path else None,
        "statusline_configured": statusline_is_hud,
        "statusline_command": command if statusline_is_hud else None,
    }