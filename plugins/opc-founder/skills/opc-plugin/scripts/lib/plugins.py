"""
Plugin utilities for OPC plugin scripts.

Handles plugin installation, version detection, and cache management.
"""

import shutil
from pathlib import Path
from typing import List


# Directories to copy for each plugin
PLUGIN_DIRS = [".claude-plugin", "agents", "skills", "references"]
PLUGIN_OPTIONAL_DIRS = ["hooks", "workflows"]


def get_plugin_version(plugin_path: Path) -> str:
    """
    Get plugin version from plugin.json.

    Args:
        plugin_path: Path to plugin directory

    Returns:
        Version string (defaults to "1.0.0")
    """
    from .settings import read_json

    plugin_json = plugin_path / ".claude-plugin" / "plugin.json"
    if plugin_json.exists():
        data = read_json(plugin_json)
        if data and "version" in data:
            return data["version"]
    return "1.0.0"


def install_plugin(plugin_name: str, marketplace_path: Path, verbose: bool = True) -> bool:
    """
    Install a single plugin to cache.

    Args:
        plugin_name: Name of plugin (e.g., "product-kit")
        marketplace_path: Path to marketplace root
        verbose: Print status messages

    Returns:
        True if successful, False otherwise
    """
    from .paths import get_cache_dir

    source_path = marketplace_path / "plugins" / plugin_name

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


def uninstall_plugin(plugin_name: str, verbose: bool = True) -> bool:
    """
    Remove a plugin from cache.

    Args:
        plugin_name: Name of plugin
        verbose: Print status messages

    Returns:
        True if removed, False if not found
    """
    from .paths import get_cache_dir

    cache_path = get_cache_dir() / plugin_name

    if cache_path.exists():
        shutil.rmtree(cache_path)
        if verbose:
            print(f"  ✅ Removed: {plugin_name}")
        return True

    if verbose:
        print(f"  ℹ️  Not installed: {plugin_name}")
    return False


def uninstall_all_plugins(verbose: bool = True) -> List[str]:
    """
    Remove all OPC plugins from cache.

    Args:
        verbose: Print status messages

    Returns:
        List of removed plugin names
    """
    from .paths import get_cache_dir

    cache_dir = get_cache_dir()
    removed = []

    if not cache_dir.exists():
        return removed

    for plugin_dir in cache_dir.iterdir():
        if plugin_dir.is_dir():
            shutil.rmtree(plugin_dir)
            removed.append(plugin_dir.name)
            if verbose:
                print(f"  ✅ Removed: {plugin_dir.name}")

    return removed


def list_installed_plugins() -> List[str]:
    """
    List installed OPC plugins.

    Returns:
        List of plugin names
    """
    from .paths import get_cache_dir

    cache_dir = get_cache_dir()
    plugins = []

    if not cache_dir.exists():
        return plugins

    for plugin_dir in cache_dir.iterdir():
        if plugin_dir.is_dir():
            plugins.append(plugin_dir.name)

    return sorted(plugins)


def cleanup_marketplace_source(marketplace_path: Path, verbose: bool = True) -> bool:
    """
    Remove source files from marketplace after installation.

    This keeps source code tracked in git but removes it from
    the installed marketplace to save space.

    Args:
        marketplace_path: Path to marketplace root
        verbose: Print status messages

    Returns:
        True if cleaned up, False if nothing to clean
    """
    src_dir = marketplace_path / "src"

    if src_dir.exists():
        shutil.rmtree(src_dir)
        if verbose:
            print("  ✅ Cleaned up source files (src/)")
        return True

    if verbose:
        print("  ℹ️  No source files to clean")
    return False
