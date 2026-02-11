import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const memoryDir = path.join(__dirname, '..', 'memory');

/**
 * Default memory file templates
 */
const DEFAULTS = {
  'user.md': `# User Profile

## Basic Information

- Name: (not set)
- Location: (not set)

## Preferences

- (No specific preferences set)

## Important Notes

- (Will be updated as I learn more about you)

## Things to Remember

- (Key information you share will be saved here)
`,

  'soul.md': `# Dwight's Core Identity

You are Dwight, an AI assistant running on Telegram with access to powerful tools.

## Communication Style

- Be helpful, friendly, and conversational
- Keep responses concise unless detail is needed
- Use natural language, not overly formal

## Capabilities

- Natural conversation with context memory
- Voice message transcription
- Email management
- Web search
- Image generation
- Calendar integration
- Scheduled tasks (cron jobs)
- Claude Code integration for programming tasks

## Guidelines

- Always respect user privacy
- Be proactive with tool usage when appropriate
- Learn and adapt to user preferences over time
- Store important information in memory for future reference
`,

  // tools.md is not included here because it should always come from the repo
};

/**
 * Initialize memory files on first startup
 * Creates default files if they don't exist
 * Does NOT touch existing files (preserves user data)
 */
export function initMemoryFiles() {
  // Ensure memory directory exists
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  let createdFiles = [];

  // Create default files if they don't exist
  for (const [filename, content] of Object.entries(DEFAULTS)) {
    const filepath = path.join(memoryDir, filename);

    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, content, 'utf8');
      createdFiles.push(filename);
    }
  }

  return createdFiles;
}

/**
 * Check if memory files exist
 */
export function memoryFilesExist() {
  return Object.keys(DEFAULTS).every(filename => {
    const filepath = path.join(memoryDir, filename);
    return fs.existsSync(filepath);
  });
}
