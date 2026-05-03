#!/usr/bin/env python3
"""
OPC Plugin Installer

Install plugins from opc-marketplace to Claude Code.

Usage:
    python install-plugins.py all              # Install all 7 plugins
    python install-plugins.py web              # Install web preset
    python install-plugins.py mobile           # Install mobile preset
    python install-plugins.py <plugin-name>    # Install specific plugin
"""

import json
import os
import shutil
import sys
from pathlib import Path
from datetime import datetime


# Plugin sets definition
PLUGIN_SETS = {
    'all': ['product-kit', 'design-kit', 'dev-kit', 'qa-kit', 'ship-kit', 'growth-kit', 'docs-kit'],
    'web': ['product-kit', 'design-kit', 'dev-kit', 'qa-kit', 'ship-kit', 'growth-kit'],
    'mobile': ['product-kit', 'design-kit', 'dev-kit', 'qa-kit', 'ship-kit'],
    'designer': ['product-kit', 'design-kit', 'docs-kit'],
    'content': ['product-kit', 'growth-kit', 'docs-kit'],
    'minimal': ['product-kit', 'dev-kit'],
    'product': ['product-kit'],
    'design': ['design-kit'],
    'dev': ['dev-kit'],
    'qa': ['qa-kit'],
    'ship': ['ship-kit'],
    'growth': ['growth-kit'],
    'docs': ['docs-kit'],
}

# Directories to copy for each plugin
PLUGIN_DIRS = ['.claude-plugin', 'agents', 'skills', 'references']
PLUGIN_OPTIONAL_DIRS = ['hooks', 'workflows']


def get_home() -> Path:
    """Get home directory."""
    return Path.home()


def get_claude_dir() -> Path:
    """Get Claude config directory."""
    return get_home() / '.claude'


def get_marketplace_path() -> Path | None:
    """Find opc-marketplace path."""
    # Check marketplaces directory first (Claude Code's official location)
    marketplaces_dir = get_claude_dir() / 'plugins' / 'marketplaces' / 'opc-marketplace'
    if marketplaces_dir.exists():
        return marketplaces_dir

    # Check if we're running from within the marketplace
    script_dir = Path(__file__).parent.resolve()
    if (script_dir.parent.parent.name == 'opc-founder' and
        script_dir.parent.parent.parent.name == 'plugins'):
        return script_dir.parent.parent.parent.parent

    return None


def get_cache_dir() -> Path:
    """Get plugin cache directory."""
    return get_claude_dir() / 'plugins' / 'cache' / 'opc-marketplace'


def get_installed_plugins_path() -> Path:
    """Get installed_plugins.json path."""
    return get_claude_dir() / 'plugins' / 'installed_plugins.json'


def get_settings_path() -> Path:
    """Get settings.json path."""
    return get_claude_dir() / 'settings.json'


def read_json(path: Path) -> dict | None:
    """Read JSON file."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except:
        return None


def write_json(path: Path, data: dict):
    """Write JSON file atomically."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix('.tmp')
    temp_path.write_text(json.dumps(data, indent=2))
    temp_path.replace(path)


def get_plugin_version(plugin_path: Path) -> str:
    """Get plugin version from plugin.json."""
    plugin_json = plugin_path / '.claude-plugin' / 'plugin.json'
    if plugin_json.exists():
        data = read_json(plugin_json)
        if data and 'version' in data:
            return data['version']
    return '1.0.0'


def install_plugin(plugin_name: str, marketplace_path: Path, verbose: bool = True) -> bool:
    """Install a single plugin."""
    source_path = marketplace_path / 'plugins' / plugin_name

    if not source_path.exists():
        if verbose:
            print(f"  ⚠️  Plugin not found: {plugin_name}")
        return False

    version = get_plugin_version(source_path)
    cache_path = get_cache_dir() / plugin_name / version

    # Create cache directory
    cache_path.mkdir(parents=True, exist_ok=True)

    # Copy plugin directories
    for dir_name in PLUGIN_DIRS:
        src_dir = source_path / dir_name
        if src_dir.exists():
            dst_dir = cache_path / dir_name
            if dst_dir.exists():
                shutil.rmtree(dst_dir)
            shutil.copytree(src_dir, dst_dir)

    # Copy optional directories
    for dir_name in PLUGIN_OPTIONAL_DIRS:
        src_dir = source_path / dir_name
        if src_dir.exists():
            dst_dir = cache_path / dir_name
            if dst_dir.exists():
                shutil.rmtree(dst_dir)
            shutil.copytree(src_dir, dst_dir)

    if verbose:
        print(f"  ✅ {plugin_name} v{version}")

    return True


def update_installed_plugins(plugins: list[str], marketplace_path: Path):
    """Update installed_plugins.json."""
    installed_path = get_installed_plugins_path()
    installed = read_json(installed_path) or {'version': 2, 'plugins': {}}

    now = datetime.utcnow().isoformat() + 'Z'

    # Get git commit SHA if available
    git_sha = None
    try:
        import subprocess
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=str(marketplace_path),
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            git_sha = result.stdout.strip()
    except:
        pass

    for plugin_name in plugins:
        version = get_plugin_version(marketplace_path / 'plugins' / plugin_name)
        cache_path = get_cache_dir() / plugin_name / version
        key = f'{plugin_name}@opc-marketplace'

        entry = {
            'scope': 'user',
            'installPath': str(cache_path),
            'version': version,
            'installedAt': now,
            'lastUpdated': now,
        }

        if git_sha:
            entry['gitCommitSha'] = git_sha

        installed['plugins'][key] = [entry]

    write_json(installed_path, installed)


def update_settings(plugins: list[str]):
    """Update settings.json to enable plugins."""
    settings_path = get_settings_path()
    settings = read_json(settings_path) or {}

    if 'enabledPlugins' not in settings:
        settings['enabledPlugins'] = {}

    for plugin_name in plugins:
        key = f'{plugin_name}@opc-marketplace'
        settings['enabledPlugins'][key] = True

    write_json(settings_path, settings)


def run_first_install_setup(marketplace_path: Path, project_root: Path = None):
    """Run first-install setup script."""
    setup_script = marketplace_path / 'plugins' / 'opc-founder' / 'skills' / 'opc-plugin' / 'scripts' / 'first-install-setup.py'

    if not setup_script.exists():
        print("  ⚠️  First-install setup script not found, skipping")
        return

    if project_root is None:
        project_root = Path.cwd()

    try:
        import subprocess
        result = subprocess.run(
            ['python3', str(setup_script), str(project_root)],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(result.stdout.strip())
        else:
            print(f"  ⚠️  First-install setup warning: {result.stderr.strip()}")
    except Exception as e:
        print(f"  ⚠️  First-install setup error: {e}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python install-plugins.py <option>")
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

    print(f"OPC Plugin Installer")
    print(f"Marketplace: {marketplace_path}")
    print()

    # Determine plugins to install
    if option in PLUGIN_SETS:
        plugins = PLUGIN_SETS[option]
    elif option in [p.rstrip('-kit') for p in PLUGIN_SETS.get('all', [])]:
        # Handle short names like 'product' -> 'product-kit'
        plugins = [f'{option}-kit'] if f'{option}-kit' in PLUGIN_SETS.get('all', []) else [option]
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
    update_settings(installed)

    # Run first-install setup
    print("\nRunning first-install setup...")
    run_first_install_setup(marketplace_path, Path.cwd() if len(sys.argv) < 3 else Path(sys.argv[2]))

    print()
    print(f"✅ Installed {len(installed)} plugin(s)")
    print()
    print("Run /reload-plugins to activate the new plugins")


if __name__ == '__main__':
    main()
