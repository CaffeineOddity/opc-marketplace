#!/usr/bin/env python3
"""
OPC Plugin Installer

Install plugins from opc-marketplace to Claude Code.

Usage:
    python install.py all              # Install all 7 plugins
    python install.py web              # Install web preset
    python install.py mobile           # Install mobile preset
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
)
from lib.paths import get_project_root


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
        print("  <plugin>  - Install specific plugin")
        sys.exit(1)

    option = sys.argv[1].lower()

    # Find marketplace
    marketplace_path = get_marketplace_path()
    if not marketplace_path:
        print("❌ opc-marketplace not found")
        print("   Please install the marketplace first via /plugin command")
        sys.exit(1)

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

    # Run first-install setup
    print("\nRunning first-install setup...")
    project_root = get_project_root()
    run_first_install_setup(project_root, marketplace_path)

    print()
    print(f"✅ Installed {len(installed)} plugin(s)")
    print()
    print("Run /reload-plugins to activate the new plugins")


def run_first_install_setup(project_root: Path, marketplace_path: Path):
    """Run first-install setup script."""
    setup_script = marketplace_path / "plugins" / "opc-founder" / "skills" / "opc-plugin" / "scripts" / "first-install.py"

    if not setup_script.exists():
        print("  ⚠️  First-install setup script not found, skipping")
        return

    try:
        import subprocess
        result = subprocess.run(
            ["python3", str(setup_script), str(project_root), str(marketplace_path)],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(result.stdout.strip())
        else:
            print(f"  ⚠️  First-install setup warning: {result.stderr.strip()}")
    except Exception as e:
        print(f"  ⚠️  First-install setup error: {e}")


if __name__ == "__main__":
    main()
