#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Updating Dwight..."

# Pull latest changes
echo "Pulling from git..."
git pull

# Run install script for any new system dependencies
echo "Checking system dependencies..."
./install.sh

# Restart the service if running under systemd
if systemctl is-active --quiet dwight 2>/dev/null; then
    echo "Restarting service..."
    sudo systemctl restart dwight
    echo "Done! Dwight has been updated and restarted."
else
    echo "Done! Run 'npm start' to start Dwight."
fi
