#!/usr/bin/env python3
"""
OPC Plugin Uninstaller

Remove OPC plugins and HUD from Claude Code.

Usage:
    python uninstall.py              # Interactive uninstall
    python uninstall.py --all        # Uninstall all plugins without prompt
    python uninstall.py <plugin>     # Uninstall specific plugin
    python uninstall.py marketplace  # Full uninstall: plugins + HUD + marketplace
"""

import sys
import subprocess
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
from lib.paths import get_installed_plugins_path, get_cache_dir


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
    args = sys.argv[1:]

    if not args:
        # Interactive mode
        try:
            response = input("Uninstall all OPC plugins and HUD? [y/N] ")
            if response.lower() != "y":
                print("Cancelled.")
                sys.exit(0)
            run_uninstall_all()
        except EOFError:
            print("\nNon-interactive mode. Use --all or marketplace.")
            sys.exit(1)
        return

    arg = args[0].lower()

    if arg == "marketplace":
        # Full uninstall: plugins + HUD + marketplace
        run_uninstall_marketplace()
    elif arg == "--all":
        run_uninstall_all()
    else:
        # Uninstall specific plugin
        print("OPC Plugin Uninstaller")
        print()
        print(f"Uninstalling: {arg}")
        print()

        uninstall_plugin(arg)
        update_settings_plugins([arg], enable=False)
        remove_from_installed_plugins([arg])

        print()
        print("✅ Uninstall complete")


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


def run_uninstall_marketplace():
    """Full uninstall: plugins + HUD + marketplace registration."""
    print("OPC Full Uninstall (Plugins + HUD + Marketplace)")
    print("=" * 50)
    print()

    # Step 1: Remove all plugins from cache
    print("[1/4] Removing OPC plugins from cache...")
    cache_dir = get_cache_dir()
    if cache_dir.exists():
        import shutil
        shutil.rmtree(cache_dir)
        print(f"  ✅ Removed cache directory: {cache_dir}")
    else:
        print("  ℹ️  Cache directory not found")

    # Step 2: Update installed_plugins.json
    print("\n[2/4] Updating installed_plugins.json...")
    count = remove_from_installed_plugins()
    print(f"  ✅ Removed {count} plugin entries")

    # Step 3: Update settings.json (enabledPlugins + statusLine)
    print("\n[3/4] Updating settings.json...")
    settings_path = Path.home() / ".claude" / "settings.json"
    settings = read_json(settings_path) or {}
    changes = []

    # Remove enabledPlugins entries
    if "enabledPlugins" in settings:
        keys_to_remove = [k for k in settings["enabledPlugins"].keys() if "@opc-marketplace" in k]
        for key in keys_to_remove:
            del settings["enabledPlugins"][key]
        if keys_to_remove:
            changes.append(f"removed {len(keys_to_remove)} enabledPlugins entries")

    # Remove statusLine if it's OPC HUD
    if "statusLine" in settings:
        command = settings["statusLine"].get("command", "")
        if "opc-hud" in command:
            del settings["statusLine"]
            changes.append("removed statusLine")

    # Remove extraKnownMarketplaces entry
    if "extraKnownMarketplaces" in settings:
        if "opc-marketplace" in settings["extraKnownMarketplaces"]:
            del settings["extraKnownMarketplaces"]["opc-marketplace"]
            changes.append("removed opc-marketplace from extraKnownMarketplaces")

    if changes:
        write_json(settings_path, settings)
        print(f"  ✅ {', '.join(changes)}")
    else:
        print("  ℹ️  No OPC-related settings found")

    # Step 4: Remove marketplace directory
    print("\n[4/4] Removing marketplace directory...")
    marketplace_dir = Path.home() / ".claude" / "plugins" / "marketplaces" / "opc-marketplace"
    if marketplace_dir.exists():
        import shutil
        shutil.rmtree(marketplace_dir)
        print(f"  ✅ Removed marketplace directory: {marketplace_dir}")
    else:
        print("  ℹ️  Marketplace directory not found")

    print()
    print("=" * 50)
    print("✅ Full uninstall complete!")
    print()
    print("OPC Marketplace has been completely removed.")
    print("Run /reload-plugins to refresh the plugin system.")


if __name__ == "__main__":
    main()
