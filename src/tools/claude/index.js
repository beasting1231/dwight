/**
 * Claude Code CLI Tool
 * Allows Dwight to spawn and manage Claude Code sessions
 */

import {
  startSession,
  getSessionStatus,
  stopSession,
  resumeSession,
  sendSessionInput,
} from './actions.js';
import { loadSavedSessions, saveSessions } from './storage.js';
import { getAllClaudeSessions, createClaudeSession } from '../../state.js';

/**
 * Tool definitions for AI
 */
export const claudeTools = [
  {
    name: 'claude_start',
    description: `Start a NEW Claude Code session. Only use when no session exists!

IMPORTANT: If a session already exists, use claude_resume instead to continue it.

Claude Code is a powerful AI coding assistant that can:
- Read, write, and edit files in any codebase
- Run bash commands and scripts
- Search code and understand project structure
- Create git commits and pull requests
- Debug and fix issues

This runs as a BACKGROUND TASK. You'll receive updates as Claude works.
For follow-up messages, use claude_resume NOT claude_start.`,
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The coding task for Claude Code to work on. Be specific and detailed.',
        },
        workingDir: {
          type: 'string',
          description: 'Directory to work in (default: user home). Use absolute paths.',
        },
        model: {
          type: 'string',
          enum: ['sonnet', 'opus', 'haiku'],
          description: 'Model to use. sonnet is default, opus for complex tasks, haiku for simple ones.',
        },
      },
      required: ['prompt'],
    },
  },

  {
    name: 'claude_input',
    description: `Send input to a running Claude Code session that is waiting for a response.

Use this when:
- Claude asked a question and you know the answer
- The user provided an answer to relay to Claude
- Claude needs confirmation to proceed

The session must be in 'waiting_input' status.`,
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The Claude session ID (full or partial)',
        },
        input: {
          type: 'string',
          description: 'The input/answer to send to Claude',
        },
      },
      required: ['sessionId', 'input'],
    },
  },

  {
    name: 'claude_status',
    description: `Get detailed status of Claude Code sessions including recent activity.

Returns:
- Session status (running, waiting_input, completed, error)
- Recent activity log showing what Claude has been doing:
  - Tool calls (file reads, edits, bash commands)
  - Text output from Claude
  - Questions Claude is asking
- Timestamps to detect if session is stalled (no activity for several minutes)

Use this to:
- Check if Claude is making progress or stalled
- See what tools Claude is using
- Monitor Claude's work in real-time
- Decide if a session needs to be restarted

If no sessionId provided, lists all sessions for the current chat.`,
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Specific session ID to check (optional). Lists all if omitted.',
        },
      },
    },
  },

  {
    name: 'claude_stop',
    description: `Stop a running Claude Code session.

Terminates the session process and removes it from tracking.
Supports partial session ID matching.`,
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID to stop (full or partial match)',
        },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'claude_resume',
    description: `Send a message to an existing Claude Code session.

IMPORTANT: Use this instead of claude_start when a session already exists!
This continues the conversation with Claude in the same session context.

When user says things like:
- "ask claude to..."
- "tell it to..."
- "have claude do..."
And there's already a running/completed session, use claude_resume NOT claude_start.

This preserves:
- The working directory context
- Previous conversation history
- Files Claude has already read`,
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID to resume (use most recent if user doesnt specify)',
        },
        prompt: {
          type: 'string',
          description: 'The message/instruction to send to Claude',
        },
      },
      required: ['sessionId'],
    },
  },
];

/**
 * Execute a Claude tool
 * @param {string} toolName - The tool to execute
 * @param {Object} params - Tool parameters
 * @param {Object} ctx - Context with chatId
 * @returns {Object} Result
 */
export async function executeClaudeTool(toolName, params, ctx = {}) {
  try {
    switch (toolName) {
      case 'claude_start':
        return await startSession(params, ctx);
      case 'claude_input':
        return await sendSessionInput(params, ctx);
      case 'claude_status':
        return await getSessionStatus(params, ctx);
      case 'claude_stop':
        return await stopSession(params, ctx);
      case 'claude_resume':
        return await resumeSession(params, ctx);
      default:
        return { error: `Unknown Claude tool: ${toolName}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Initialize Claude tool - load any saved sessions
 */
export async function initializeClaude() {
  const savedSessions = loadSavedSessions();

  // Restore session metadata (but not processes - those are gone)
  for (const session of savedSessions) {
    // Mark previously running sessions as interrupted
    if (session.status === 'running' || session.status === 'starting') {
      session.status = 'interrupted';
    }
    createClaudeSession(session.chatId, session);
  }

  return {
    success: true,
    restoredCount: savedSessions.length,
  };
}

/**
 * Cleanup Claude tool - stop all sessions
 */
export async function cleanupClaude() {
  const sessions = getAllClaudeSessions();

  for (const session of sessions.values()) {
    if (session.kill) {
      session.kill();
    }
  }

  saveSessions(sessions);
}

/**
 * Check if Claude CLI is available
 */
export async function isClaudeAvailable() {
  try {
    const { execSync } = await import('child_process');
    execSync('which claude', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
