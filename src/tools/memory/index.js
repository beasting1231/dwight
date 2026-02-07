import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { getFileMode } from '../../config.js';
import { addNotification, setNeedsReload } from '../../state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, '..', '..', '..', 'memory');

/**
 * Get system environment info for the AI
 */
function getSystemInfo() {
  const homeDir = os.homedir();
  const platform = os.platform();
  const username = os.userInfo().username;

  return {
    homeDir,
    platform,
    username,
    desktop: path.join(homeDir, 'Desktop'),
    documents: path.join(homeDir, 'Documents'),
    downloads: path.join(homeDir, 'Downloads'),
  };
}

const MEMORY_FILES = {
  soul: 'soul.md',
  user: 'user.md',
  tools: 'tools.md',
};

/**
 * Tool definitions for AI
 */
export const memoryTools = [
  {
    name: 'memory_read',
    description: 'Read a memory file (soul, user, or tools)',
    parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          enum: ['soul', 'user', 'tools'],
          description: 'Which memory file to read',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'memory_update',
    description: 'Update a memory file. Use this to save important information about the user, update tool instructions based on feedback, or modify personality traits. Be specific about changes.',
    parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          enum: ['soul', 'user', 'tools'],
          description: 'Which memory file to update',
        },
        content: {
          type: 'string',
          description: 'The complete new content for the file (in markdown format)',
        },
        reason: {
          type: 'string',
          description: 'Brief explanation of why this update is being made',
        },
      },
      required: ['file', 'content', 'reason'],
    },
  },
  {
    name: 'memory_append',
    description: 'Append information to a specific section in user.md. Use this for adding new facts about the user.',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'The section header to append to (e.g., "Things to Remember", "Preferences")',
        },
        content: {
          type: 'string',
          description: 'The content to append (will be added as a bullet point)',
        },
      },
      required: ['section', 'content'],
    },
  },
];

/**
 * Get the path to a memory file
 */
function getMemoryPath(file) {
  const filename = MEMORY_FILES[file];
  if (!filename) {
    throw new Error(`Unknown memory file: ${file}`);
  }
  return path.join(MEMORY_DIR, filename);
}

/**
 * Read a memory file
 */
export function readMemory(file) {
  const filepath = getMemoryPath(file);
  try {
    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath, 'utf-8');
    }
    return null;
  } catch (error) {
    throw new Error(`Failed to read ${file}: ${error.message}`);
  }
}

/**
 * Write to a memory file
 */
export function writeMemory(file, content, silent = false) {
  const filepath = getMemoryPath(file);
  try {
    // Ensure directory exists
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
    fs.writeFileSync(filepath, content, 'utf-8');

    // Add notification unless silent
    if (!silent) {
      addNotification(`${file}.md updated ✓`);
    }

    return true;
  } catch (error) {
    throw new Error(`Failed to write ${file}: ${error.message}`);
  }
}

/**
 * Append to a section in user.md
 */
export function appendToUserMemory(section, content) {
  const current = readMemory('user') || '';

  // Find the section and append
  const sectionRegex = new RegExp(`(## ${section}[\\s\\S]*?)(\n##|$)`, 'i');
  const match = current.match(sectionRegex);

  if (match) {
    const sectionContent = match[1];
    const rest = match[2] || '';

    // Add the new bullet point
    const newSection = sectionContent.trimEnd() + `\n- ${content}\n`;
    const newContent = current.replace(sectionRegex, newSection + rest);

    writeMemory('user', newContent);
    return true;
  } else {
    // Section not found, append at end
    const newContent = current.trimEnd() + `\n\n## ${section}\n\n- ${content}\n`;
    writeMemory('user', newContent);
    return true;
  }
}

/**
 * Load all memory files for context
 */
export function loadAllMemory() {
  return {
    soul: readMemory('soul'),
    user: readMemory('user'),
    tools: readMemory('tools'),
  };
}

/**
 * Build system prompt with memory
 */
export function buildSystemPromptWithMemory(basePrompt) {
  const memory = loadAllMemory();
  const fileMode = getFileMode();
  const sysInfo = getSystemInfo();

  let prompt = basePrompt || '';

  if (memory.soul) {
    prompt += '\n\n---\n\n# YOUR IDENTITY AND RULES\n\n' + memory.soul;
  }

  if (memory.user) {
    prompt += '\n\n---\n\n# ABOUT YOUR USER\n\n' + memory.user;
  }

  if (memory.tools) {
    prompt += '\n\n---\n\n# HOW TO USE YOUR TOOLS\n\n' + memory.tools;
  }

  // Add system environment info
  prompt += '\n\n---\n\n# SYSTEM ENVIRONMENT\n\n';
  prompt += `Platform: ${sysInfo.platform}\n`;
  prompt += `Username: ${sysInfo.username}\n`;
  prompt += `Home Directory: ${sysInfo.homeDir}\n`;
  prompt += `Desktop: ${sysInfo.desktop}\n`;
  prompt += `Documents: ${sysInfo.documents}\n`;
  prompt += `Downloads: ${sysInfo.downloads}\n`;

  // Add file operation mode instructions
  prompt += '\n\n---\n\n# FILE OPERATION MODE\n\n';
  if (fileMode === 'auto') {
    prompt += 'You are in AUTO mode for file operations.\n';
    prompt += '- Execute file operations (read, write, edit, delete, copy, move, etc.) immediately without asking for permission.\n';
    prompt += '- Only ask clarifying questions if the task itself is unclear or ambiguous.\n';
    prompt += '- Be proactive and efficient - get things done.\n';
    prompt += '- Still report what you did after completing operations.';
  } else {
    prompt += 'You are in ASK mode for file operations.\n';
    prompt += '- Before performing any file write, edit, delete, copy, or move operation, ask the user for permission.\n';
    prompt += '- Describe what you intend to do and wait for confirmation.\n';
    prompt += '- You may read files and list directories without asking.\n';
    prompt += '- Example: "I\'d like to create a file at /path/file.txt with [content]. Should I proceed?"';
  }

  // Path resolution instructions
  prompt += '\n\n---\n\n# PATH RESOLUTION & FUZZY MATCHING\n\n';
  prompt += 'IMPORTANT: Never ask the user for full file paths. Figure them out yourself:\n';
  prompt += '- Use the system environment paths above for common locations (Desktop, Documents, Downloads, etc.)\n';
  prompt += '- When user says "desktop", "documents", "downloads" → use the paths listed above\n';
  prompt += '- When user mentions a file or folder name, use file_list to search for it\n';
  prompt += '- When user says "my projects folder" or similar, explore their home directory to find it\n';
  prompt += '- Only ask the user for path help if you truly cannot find something after searching\n';
  prompt += '- Be resourceful - explore the filesystem to find what you need\n\n';
  prompt += 'FUZZY MATCHING - Be proactive about similar names:\n';
  prompt += '- If user asks about "test" but you find "testing" or "test-app", IMMEDIATELY suggest it in the same response\n';
  prompt += '- Don\'t just say "not found" - always check for similar names (partial matches, typos, different cases)\n';
  prompt += '- Example: User asks for "test" folder → you find "testing" → respond: "There\'s no \'test\' folder, but I found \'testing\' on your desktop. Is that what you meant?"\n';
  prompt += '- Be helpful and anticipate what the user probably wants\n';
  prompt += '- When listing directory contents, look for names containing the search term, not just exact matches\n';

  prompt += '\n\n---\n\n# TIMEZONE HANDLING\n\n';
  prompt += 'IMPORTANT: Always use the user\'s timezone from their profile in user.md.\n';
  prompt += '- When calling datetime_now, pass the user\'s timezone (e.g., "Europe/Amsterdam")\n';
  prompt += '- When user updates their location, also update their timezone in user.md\n';
  prompt += '- Common timezone mappings: Amsterdam→Europe/Amsterdam, Tokyo→Asia/Tokyo, New York→America/New_York, LA→America/Los_Angeles, London→Europe/London\n';

  prompt += '\n\n---\n\n# MEMORY UPDATE INSTRUCTIONS\n\n';
  prompt += 'You can update your memory files when:\n';
  prompt += '- User shares important personal information → update user.md\n';
  prompt += '- User corrects how you use a tool → update tools.md\n';
  prompt += '- User says you should ALWAYS or NEVER do something → update appropriate file\n';
  prompt += '- User complains about a mistake → learn from it and update instructions\n';
  prompt += '- User changes location → update both location AND timezone in user.md\n';
  prompt += '\nAlways acknowledge when you update your memory.\n\n';
  prompt += 'HOW TO WRITE EFFECTIVE RULES:\n';
  prompt += 'Rules in memory files are READ BY YOU at the start of each conversation.\n';
  prompt += 'For rules to work, they must be:\n';
  prompt += '1. SPECIFIC - Not "be careful with emails" but "Before sending ANY email, show the full draft (To, Subject, Body) and ask: Send this email? [yes/no]"\n';
  prompt += '2. ACTIONABLE - Include exact steps to follow, not vague guidelines\n';
  prompt += '3. CHECKABLE - You should be able to verify you followed the rule\n\n';
  prompt += 'BAD rule: "Always confirm before sending emails"\n';
  prompt += 'GOOD rule: "EMAIL SENDING PROTOCOL: 1) Draft the email 2) Show user: To, Subject, and full Body 3) Ask explicitly: Send this? 4) Only call email_send after user says yes/send/confirmed"\n\n';
  prompt += 'When updating tools.md, write rules as step-by-step protocols you will actually follow.';

  return prompt;
}

/**
 * Execute a memory tool
 */
export async function executeMemoryTool(toolName, params) {
  try {
    switch (toolName) {
      case 'memory_read':
        const content = readMemory(params.file);
        return { content: content || 'File is empty or does not exist' };

      case 'memory_update':
        writeMemory(params.file, params.content);
        setNeedsReload();
        return {
          success: true,
          message: `Updated ${params.file}.md: ${params.reason}`
        };

      case 'memory_append':
        appendToUserMemory(params.section, params.content);
        setNeedsReload();
        return {
          success: true,
          message: `Added to user.md under "${params.section}": ${params.content}`
        };

      default:
        return { error: `Unknown memory tool: ${toolName}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}
