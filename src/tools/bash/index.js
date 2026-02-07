/**
 * Bash tool for AI - Execute shell commands with safety controls
 * Based on Claude Code's Bash tool architecture
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { validateCommand, getCommandPrefix } from './security.js';
import {
  executeCommand,
  isInteractiveCommand,
  formatResult,
  getWorkingDirectory,
  setWorkingDirectory,
  resetWorkingDirectory,
  config,
} from './executor.js';
import { getBashMode } from '../../config.js';
import {
  addNotification,
  setPendingBashCommand,
  isBashCommandConfirmed,
  clearPendingBashCommand,
} from '../../state.js';

/**
 * Tool definition for AI
 */
export const bashTools = [
  {
    name: 'bash_run',
    description: `Execute a bash/shell command on the user's machine. Use this for:
- OPENING FILES: Use "open <file>" to open in default app (macOS). User says "open X" → run this.
- Running build commands (npm, yarn, make, etc.)
- Git operations (status, diff, log, commit, push)
- System commands (ls, pwd, which, etc.)
- Package management (npm install, brew, pip)
- Running scripts and programs (python, node, etc.)

WHEN TO USE:
- User says "open file.txt" → bash_run with "open file.txt"
- User says "run npm install" → bash_run with "npm install"
- User wants to READ file contents → use file_read instead (shows you the content)
- User wants you to OPEN/LAUNCH something → use bash_run with "open"

Commands run in a persistent working directory. Interactive commands (vim, less) NOT supported.`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this command does (for logging)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 120000, max: 600000)',
        },
        workingDir: {
          type: 'string',
          description: 'Override working directory for this command',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'bash_pwd',
    description: 'Get the current working directory for bash commands.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'bash_cd',
    description: 'Change the working directory for subsequent bash commands.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to change to',
        },
      },
      required: ['path'],
    },
  },
];

/**
 * Execute a bash tool
 * @param {string} toolName - Name of the tool
 * @param {Object} params - Tool parameters
 * @param {Object} context - Execution context
 * @returns {Promise<Object>}
 */
export async function executeBashTool(toolName, params, context = {}) {
  try {
    switch (toolName) {
      case 'bash_run':
        return await runBashCommand(params, context);

      case 'bash_pwd':
        return {
          workingDirectory: getWorkingDirectory(),
        };

      case 'bash_cd':
        return changeDirectory(params.path);

      default:
        return { error: `Unknown bash tool: ${toolName}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Run a bash command with security checks
 * @param {Object} params - Command parameters
 * @param {Object} context - Execution context (may include chatId for confirmations)
 * @returns {Promise<Object>}
 */
async function runBashCommand(params, context) {
  const { command, description, timeout, workingDir } = params;

  if (!command || typeof command !== 'string') {
    return { error: 'Command is required and must be a string' };
  }

  // Check for interactive commands
  const interactiveCheck = isInteractiveCommand(command);
  if (interactiveCheck.interactive) {
    return {
      error: `Cannot execute interactive command: ${interactiveCheck.reason}`,
      suggestion: 'Use non-interactive alternatives or dedicated tools',
    };
  }

  // Security validation
  const securityResult = validateCommand(command);

  if (securityResult.decision === 'deny') {
    return {
      blocked: true,
      error: `Command blocked: ${securityResult.reason}`,
    };
  }

  // Check bash mode for 'ask' decisions
  const bashMode = getBashMode();
  const chatId = context?.chatId;

  if (securityResult.decision === 'ask' && bashMode === 'ask') {
    // Check if this exact command has already been confirmed by the user
    if (chatId && isBashCommandConfirmed(chatId, command)) {
      // User confirmed, clear the pending command and proceed with execution
      clearPendingBashCommand(chatId);
      // Fall through to execute the command below
    } else {
      // Store the pending command for confirmation tracking
      if (chatId) {
        setPendingBashCommand(chatId, {
          command,
          reason: securityResult.reason,
          description: description,
        });
      }

      return {
        requiresConfirmation: true,
        reason: securityResult.reason,
        command: command,
        message: `This command requires confirmation: ${securityResult.reason}. Please confirm you want to proceed.`,
      };
    }
  }

  // Log the command
  const cmdPrefix = getCommandPrefix(command);
  addNotification(`bash: ${description || cmdPrefix}`);

  // Execute the command
  const result = await executeCommand(command, {
    timeout,
    workingDir,
  });

  // Format and return result
  const formatted = formatResult(result, command);

  // Include warnings and suggestions if any
  if (securityResult.warning) {
    formatted.warning = securityResult.warning;
  }

  if (securityResult.suggestion) {
    formatted.suggestion = securityResult.suggestion;
  }

  return formatted;
}

/**
 * Change working directory
 * @param {string} targetPath - Path to change to
 * @returns {Object}
 */
function changeDirectory(targetPath) {
  if (!targetPath) {
    return { error: 'Path is required' };
  }

  try {
    let resolvedPath = targetPath;

    // Handle ~ for home directory
    if (targetPath === '~' || targetPath.startsWith('~/')) {
      resolvedPath = targetPath === '~'
        ? os.homedir()
        : path.join(os.homedir(), targetPath.slice(2));
    } else if (!path.isAbsolute(targetPath)) {
      resolvedPath = path.resolve(getWorkingDirectory(), targetPath);
    }

    // Normalize the path
    resolvedPath = path.normalize(resolvedPath);

    // Check if directory exists
    if (!fs.existsSync(resolvedPath)) {
      return { error: `Directory does not exist: ${resolvedPath}` };
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return { error: `Not a directory: ${resolvedPath}` };
    }

    // Update working directory
    setWorkingDirectory(resolvedPath);

    return {
      success: true,
      workingDirectory: resolvedPath,
    };
  } catch (error) {
    return { error: `Failed to change directory: ${error.message}` };
  }
}

// Re-export for direct access
export {
  getWorkingDirectory,
  setWorkingDirectory,
  resetWorkingDirectory,
  validateCommand,
  isInteractiveCommand,
  config,
};
