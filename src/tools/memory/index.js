import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, '..', '..', '..', 'memory');

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
export function writeMemory(file, content) {
  const filepath = getMemoryPath(file);
  try {
    // Ensure directory exists
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
    fs.writeFileSync(filepath, content, 'utf-8');
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

  prompt += '\n\n---\n\n# MEMORY UPDATE INSTRUCTIONS\n\n';
  prompt += 'You can update your memory files when:\n';
  prompt += '- User shares important personal information → update user.md\n';
  prompt += '- User corrects how you use a tool → update tools.md\n';
  prompt += '- User says you should ALWAYS or NEVER do something → update appropriate file\n';
  prompt += '- User complains about a mistake → learn from it and update instructions\n';
  prompt += '\nAlways acknowledge when you update your memory.';

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
        return {
          success: true,
          message: `Updated ${params.file}.md: ${params.reason}`
        };

      case 'memory_append':
        appendToUserMemory(params.section, params.content);
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
