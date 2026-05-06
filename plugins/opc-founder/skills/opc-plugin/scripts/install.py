#!/usr/bin/env python3
"""
OPC Plugin Installer

Install plugins from opc-marketplace to Claude Code.

Usage:
    python install.py all              # Install all 7 plugins
    python install.py web              # Install web preset
    python install.py mobile           # Install mobile preset
    python install.py hud              # Install HUD statusline only
    python install.py <plugin-name>    # Install specific plugin
"""

import sys
from pathlib import Path

# Add lib to path
sys.path.insert(0, str(Path(__file__).parent))

from lib import (
    get_marketplace_path,
    install_plugin,
    update_installed_plugins,
    update_settings_plugins,
    install_hud,
    cleanup_marketplace_source,
)


# Plugin sets definition
PLUGIN_SETS = {
    "all": ["product-kit", "design-kit", "dev-kit", "qa-kit", "ship-kit", "growth-kit", "docs-kit"],
    "web": ["product-kit", "design-kit", "dev-kit", "qa-kit", "ship-kit", "growth-kit"],
    "mobile": ["product-kit", "design-kit", "dev-kit", "qa-kit", "ship-kit"],
    "designer": ["product-kit", "design-kit", "docs-kit"],
    "content": ["product-kit", "growth-kit", "docs-kit"],
    "minimal": ["product-kit", "dev-kit"],
    "product": ["product-kit"],
    "design": ["design-kit"],
    "dev": ["dev-kit"],
    "qa": ["qa-kit"],
    "ship": ["ship-kit"],
    "growth": ["growth-kit"],
    "docs": ["docs-kit"],
}


def main():
    if len(sys.argv) < 2:
        print("Usage: python install.py <option>")
        print("\nOptions:")
        print("  all       - Install all 7 plugins")
        print("  web       - Install web preset (6 plugins)")
        print("  mobile    - Install mobile preset (5 plugins)")
        print("  designer  - Install designer preset (3 plugins)")
        print("  content   - Install content preset (3 plugins)")
        print("  minimal   - Install minimal preset (2 plugins)")
        print("  hud       - Install HUD statusline only")
        print("  <plugin>  - Install specific plugin")
        sys.exit(1)

    option = sys.argv[1].lower()

    # Find marketplace
    marketplace_path = get_marketplace_path()
    if not marketplace_path:
        print("❌ opc-marketplace not found")
        print("   Please install the marketplace first via /plugin command")
        sys.exit(1)

    # Handle HUD-only install
    if option == "hud":
        print("Installing HUD statusline...")
        success, message = install_hud(marketplace_path)

        if success:
            print(f"✅ {message}")
            print("\nRun /reload-plugins to activate the HUD")
        else:
            print(f"⚠️  {message}")
        return

    print("OPC Plugin Installer")
    print(f"Marketplace: {marketplace_path}")
    print()

    # Determine plugins to install
    if option in PLUGIN_SETS:
        plugins = PLUGIN_SETS[option]
    elif option in [p.rstrip("-kit") for p in PLUGIN_SETS.get("all", [])]:
        # Handle short names like "product" -> "product-kit"
        plugins = [f"{option}-kit"] if f"{option}-kit" in PLUGIN_SETS.get("all", []) else [option]
    else:
        print(f"❌ Unknown option: {option}")
        sys.exit(1)

    print(f"Installing {len(plugins)} plugin(s): {', '.join(plugins)}")
    print()

    # Install plugins
    installed = []
    for plugin in plugins:
        if install_plugin(plugin, marketplace_path):
            installed.append(plugin)

    if not installed:
        print("\n❌ No plugins were installed")
        sys.exit(1)

    # Update installed_plugins.json
    update_installed_plugins(installed, marketplace_path)

    # Update settings.json
    update_settings_plugins(installed, enable=True)

    # Install HUD statusline
    print("\nInstalling HUD statusline...")
    success, message = install_hud(marketplace_path)
    if success:
        print(f"✅ {message}")
    else:
        print(f"⚠️  {message}")

    # Clean up source files from marketplace
    print("\nCleaning up source files...")
    cleanup_marketplace_source(marketplace_path)

    print()
    print(f"✅ Installed {len(installed)} plugin(s)")
    print()
    print("Run /reload-plugins to activate the new plugins")


if __name__ == "__main__":
    main()
