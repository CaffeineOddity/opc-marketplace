#!/usr/bin/env python3
"""
OPC HUD Manager

Install or uninstall HUD statusline.

Usage:
    python hud.py install    # Install HUD statusline
    python hud.py uninstall  # Uninstall HUD statusline
    python hud.py status     # Show HUD status
"""

import sys
from pathlib import Path

# Add lib to path
sys.path.insert(0, str(Path(__file__).parent))

from lib import (
    get_marketplace_path,
    install_hud,
    uninstall_hud,
)
from lib.hud import check_hud_status


def main():
    if len(sys.argv) < 2:
        print("Usage: python hud.py <command>")
        print("\nCommands:")
        print("  install    - Install HUD statusline")
        print("  uninstall  - Uninstall HUD statusline")
        print("  status     - Show HUD status")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "install":
        # Find marketplace
        marketplace_path = get_marketplace_path()
        if not marketplace_path:
            print("❌ opc-marketplace not found")
            print("   Please install the marketplace first via /plugin command")
            sys.exit(1)

        print("Installing HUD statusline...")
        success, message = install_hud(marketplace_path)

        if success:
            print(f"✅ {message}")
            print("\nRun /reload-plugins to activate the HUD")
        else:
            print(f"⚠️  {message}")

    elif command == "uninstall":
        print("Uninstalling HUD statusline...")
        success, message = uninstall_hud()

        if success:
            print(f"✅ {message}")
            print("\nRun /reload-plugins to refresh")
        else:
            print(f"⚠️  {message}")

    elif command == "status":
        status = check_hud_status()

        print("HUD Status:")
        if status["statusline_configured"]:
            print("  ✅ HUD statusline is configured")
            print(f"     Command: {status['statusline_command']}")
        else:
            print("  ❌ HUD statusline is not configured")

    else:
        print(f"❌ Unknown command: {command}")
        print("   Valid commands: install, uninstall, status")
        sys.exit(1)


if __name__ == "__main__":
    main()
