#!/bin/bash

# Kill any existing dwight node processes
# Match --watch to only get running node processes, not this script
pkill -f "node --watch.*index.js" 2>/dev/null && sleep 1

# Start fresh
exec node --watch src/index.js
