#!/bin/bash

set -e

echo "Checking dependencies..."

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if ! command -v brew &> /dev/null; then
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi

    if ! command -v node &> /dev/null; then
        echo "Installing Node.js..."
        brew install node
    fi

    if ! command -v ffmpeg &> /dev/null; then
        echo "Installing ffmpeg..."
        brew install ffmpeg
    fi

    if ! command -v whisper &> /dev/null; then
        echo "Installing Whisper..."
        pip3 install openai-whisper
    fi

    if ! command -v claude &> /dev/null; then
        echo "Installing Claude Code CLI..."
        npm install -g @anthropic-ai/claude-code
    fi

    if ! command -v expect &> /dev/null; then
        echo "Installing expect..."
        brew install expect
    fi

elif [[ -f /etc/debian_version ]]; then
    # Ubuntu/Debian
    # Build tools needed for node-pty native compilation
    echo "Installing build tools for native modules..."
    sudo apt install -y build-essential python3

    if ! command -v node &> /dev/null; then
        echo "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt install -y nodejs
    fi

    if ! command -v ffmpeg &> /dev/null; then
        echo "Installing ffmpeg..."
        sudo apt install -y ffmpeg python3-pip
    fi

    if ! command -v whisper &> /dev/null; then
        echo "Installing Whisper..."
        pip3 install openai-whisper --break-system-packages
    fi

    if ! command -v claude &> /dev/null; then
        echo "Installing Claude Code CLI..."
        npm install -g @anthropic-ai/claude-code
    fi

    if ! command -v expect &> /dev/null; then
        echo "Installing expect..."
        sudo apt install -y expect
    fi

else
    echo "Unsupported OS. Please install manually:"
    echo "  - Node.js 18+"
    echo "  - ffmpeg"
    echo "  - expect"
    echo "  - openai-whisper (pip3 install openai-whisper)"
    echo "  - Claude Code CLI (npm install -g @anthropic-ai/claude-code)"
    exit 1
fi

# Always run npm install to get new packages
echo "Installing npm dependencies..."
npm install

echo "Done!"
