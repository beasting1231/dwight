#!/bin/bash

set -e

echo "Installing Dwight..."

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "Detected macOS"

    if ! command -v brew &> /dev/null; then
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi

    echo "Installing Node.js and ffmpeg..."
    brew install node ffmpeg

    echo "Installing Whisper..."
    pip3 install openai-whisper

elif [[ -f /etc/debian_version ]]; then
    # Ubuntu/Debian
    echo "Detected Ubuntu/Debian"

    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs

    echo "Installing ffmpeg..."
    sudo apt install -y ffmpeg

    echo "Installing Whisper..."
    pip3 install openai-whisper

else
    echo "Unsupported OS. Please install manually:"
    echo "  - Node.js 18+"
    echo "  - ffmpeg"
    echo "  - openai-whisper (pip3 install openai-whisper)"
    exit 1
fi

# Install npm dependencies
echo "Installing npm dependencies..."
npm install

echo ""
echo "Installation complete! Run 'npm start' to start Dwight."
