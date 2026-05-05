#!/usr/bin/env python3
"""
OPC Plugin Uninstaller

Remove OPC plugins and HUD from Claude Code.

Usage:
    python uninstall.py           # Interactive uninstall
    python uninstall.py --all     # Uninstall all without prompt
    python uninstall.py <plugin>  # Uninstall specific plugin
"""

import sys
from pathlib import Path

# Add lib to path
sys.path.insert(0, str(Path(__file__).parent))

from lib import (
    uninstall_plugin,
    uninstall_all_plugins,
    update_settings_plugins,
    uninstall_hud,
)
from lib.settings import read_json, write_json
from lib.paths import get_installed_plugins_path


def remove_from_installed_plugins(plugins: list[str] = None):
    """
    Remove plugins from installed_plugins.json.

    Args:
        plugins: List of plugin names, or None to remove all OPC plugins
    """
    installed_path = get_installed_plugins_path()
    installed = read_json(installed_path)

    if not installed:
        return

    if plugins is None:
        # Remove all OPC plugins
        keys_to_remove = [k for k in installed.get("plugins", {}).keys() if "@opc-marketplace" in k]
    else:
        keys_to_remove = [f"{p}@opc-marketplace" for p in plugins]

    for key in keys_to_remove:
        if key in installed.get("plugins", {}):
            del installed["plugins"][key]

    write_json(installed_path, installed)
    return len(keys_to_remove)


def main():
    force_all = "--all" in sys.argv
    specific_plugin = None

    for arg in sys.argv[1:]:
        if not arg.startswith("--"):
            specific_plugin = arg
            break

    print("OPC Plugin Uninstaller")
    print()

    if specific_plugin:
        # Uninstall specific plugin
        print(f"Uninstalling: {specific_plugin}")
        print()

        uninstall_plugin(specific_plugin)
        update_settings_plugins([specific_plugin], enable=False)
        remove_from_installed_plugins([specific_plugin])

        print()
        print("✅ Uninstall complete")

    elif force_all:
        # Uninstall all without prompt
        run_uninstall_all()

    else:
        # Interactive mode
        try:
            response = input("Uninstall all OPC plugins and HUD? [y/N] ")
            if response.lower() != "y":
                print("Cancelled.")
                sys.exit(0)
            run_uninstall_all()
        except EOFError:
            print("\nNon-interactive mode. Use --all to skip prompt.")
            sys.exit(1)


def run_uninstall_all():
    """Uninstall all OPC plugins and HUD."""
    print("Removing OPC plugins...")
    removed = uninstall_all_plugins()

    print("\nUpdating installed_plugins.json...")
    count = remove_from_installed_plugins()
    print(f"  ✅ Removed {count} plugin entries")

    print("\nUpdating settings.json...")
    # Disable all OPC plugins in enabledPlugins
    settings_path = Path.home() / ".claude" / "settings.json"
    settings = read_json(settings_path) or {}

    if "enabledPlugins" in settings:
        keys_to_remove = [k for k in settings["enabledPlugins"].keys() if "@opc-marketplace" in k]
        for key in keys_to_remove:
            del settings["enabledPlugins"][key]
        write_json(settings_path, settings)
        print(f"  ✅ Removed {len(keys_to_remove)} from enabledPlugins")

    print("\nRemoving HUD...")
    success, message = uninstall_hud()
    print(f"  {'✅' if success else 'ℹ️ '} {message}")

    print()
    print("✅ Uninstall complete")
    print()
    print("Next step: Run /plugin remove opc-marketplace")


if __name__ == "__main__":
    main()
