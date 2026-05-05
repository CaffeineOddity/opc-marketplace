"""
OPC Plugin Scripts Library

Common utilities for plugin management.
"""

from .paths import (
    get_home,
    get_claude_dir,
    get_marketplace_path,
    get_cache_dir,
    get_installed_plugins_path,
    get_settings_path,
    get_git_toplevel,
)

from .settings import (
    read_json,
    write_json,
    update_settings_plugins,
    remove_statusline,
)

from .plugins import (
    get_plugin_version,
    install_plugin,
    uninstall_plugin,                                                                                                                                                                                           
    uninstall_all_plugins,                                                                                                                                                                                      
    list_installed_plugins,
)

from .hud import (
    install_hud,
    uninstall_hud,
)

__all__ = [
    # paths
    "get_home",
    "get_claude_dir",
    "get_marketplace_path",
    "get_cache_dir",
    "get_installed_plugins_path",
    "get_settings_path",
    "get_git_toplevel",
    # settings
    "read_json",
    "write_json",
    "update_settings_plugins",
    "remove_statusline",
    # plugins
    "get_plugin_version",
    "install_plugin",
    "update_installed_plugins",
    "remove_installed_plugins",
    # hud
    "install_hud",
    "uninstall_hud",
]
