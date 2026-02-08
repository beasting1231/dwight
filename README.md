# Dwight

AI-powered Telegram bot with tools for email, web search, image generation, calendar, and more.

## Quick Install

```bash
git clone https://github.com/your-username/dwight.git
cd dwight
./install.sh
npm start
```

The install script automatically detects your OS (macOS or Ubuntu/Debian) and installs Node.js, ffmpeg, and Whisper.

On first run, you'll be guided through setup to configure:
- Telegram bot token
- AI provider (Anthropic, OpenRouter, etc.)
- Optional: Email, calendar, web search, image generation

## Features

- **Chat** - Natural conversation with AI
- **Voice Messages** - Send voice messages, automatically transcribed with local Whisper
- **Email** - Read, search, and send emails
- **Web Search** - Search the web using Brave Search API
- **Image Generation** - Generate images with AI
- **Calendar** - Google Calendar integration
- **Scheduled Tasks** - Create cron jobs for recurring AI tasks
- **Memory** - Remembers information about you across conversations

## Development

```bash
# Run in watch mode
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Deployment (VPS)

To run Dwight on a VPS (DigitalOcean, Linode, etc.) with auto-restart:

### 1. Set up the server

```bash
cd /root
git clone https://github.com/your-username/dwight.git
cd dwight
./install.sh
```

### 2. Copy your config

Copy your local `~/.dwight/` directory to the VPS:

```bash
# From your local machine
scp -r ~/.dwight root@your-server-ip:~/.dwight
```

### 3. Install the systemd service

```bash
sudo cp dwight.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dwight
sudo systemctl start dwight
```

### 4. Verify it's running

```bash
sudo systemctl status dwight
sudo journalctl -u dwight -f  # View logs
```

### Updating

**From Telegram:**
```
/update
```

**From terminal:**
```bash
./update.sh
```

Both methods pull the latest code, run install.sh for any new dependencies, and restart automatically.

## License

MIT
