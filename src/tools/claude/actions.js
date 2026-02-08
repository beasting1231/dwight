/**
 * Claude Code session actions
 * Business logic for managing Claude Code CLI sessions
 */

import os from 'os';
import {
  createClaudeSession,
  getClaudeSession,
  getClaudeSessionsForChat,
  getAllClaudeSessions,
  updateClaudeSession,
  removeClaudeSession,
  addNotification,
  addRunningTask,
  removeRunningTask,
} from '../../state.js';
import { spawnClaudeSession, resumeClaudeSession } from './client.js';
import { parseStreamEvent, generateCompletionSummary, detectQuestionInText } from './parser.js';
import { saveSessions } from './storage.js';

/**
 * Start a new Claude Code session
 * @param {Object} params
 * @param {string} params.prompt - The task for Claude
 * @param {string} params.workingDir - Working directory
 * @param {string} params.model - Model to use
 * @param {Object} ctx - Context with chatId
 * @returns {Object} Result
 */
export async function startSession(params, ctx) {
  const { prompt, workingDir, model } = params;
  const { chatId } = ctx;

  if (!prompt) {
    return { error: 'Prompt is required' };
  }

  const sessionId = `claude_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const cwd = workingDir || os.homedir();

  // Create session in state
  createClaudeSession(chatId, {
    id: sessionId,
    status: 'starting',
    workingDir: cwd,
    prompt: prompt.slice(0, 500), // Store truncated prompt
    model: model || 'sonnet',
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    totalCost: 0,
  });

  // Add to running tasks for UI display
  addRunningTask(sessionId, `Claude: ${truncate(prompt, 30)}`);

  // Spawn the Claude process
  const { process: proc, kill } = spawnClaudeSession({
    prompt,
    workingDir: cwd,
    model,
    onEvent: (event) => handleClaudeEvent(event, sessionId, chatId),
    onError: (error) => handleClaudeError(error, sessionId, chatId),
    onClose: (code) => handleClaudeClose(code, sessionId, chatId),
  });

  // Store process reference
  updateClaudeSession(sessionId, { process: proc, kill, status: 'running' });
  saveSessions(getAllClaudeSessions());

  return {
    success: true,
    sessionId,
    message: `Claude Code session started (ID: ${sessionId.slice(0, 12)}...). Working in: ${cwd}`,
  };
}

/**
 * Handle events from Claude stream
 */
function handleClaudeEvent(event, sessionId, chatId) {
  const parsed = parseStreamEvent(event);

  // Update session ID from init event
  if (parsed.initialized && parsed.sessionId) {
    // Claude provides its own session ID
    updateClaudeSession(sessionId, {
      claudeSessionId: parsed.sessionId,
      model: parsed.model,
    });
  }

  // Handle task completion
  if (parsed.isComplete) {
    removeRunningTask(sessionId);

    const summary = generateCompletionSummary(parsed);
    updateClaudeSession(sessionId, {
      status: parsed.success ? 'completed' : 'error',
      totalCost: parsed.cost || 0,
      lastActivity: new Date().toISOString(),
      result: summary,
    });

    // Notify user
    const costStr = parsed.cost ? ` (Cost: $${parsed.cost.toFixed(4)})` : '';
    const statusEmoji = parsed.success ? '✅' : '❌';
    addNotification(`${statusEmoji} *Claude Code completed*\n\n${summary}${costStr}`);

    saveSessions(getAllClaudeSessions());
    return;
  }

  // Handle input request (AskUserQuestion)
  if (parsed.needsInput) {
    updateClaudeSession(sessionId, {
      status: 'waiting_input',
      pendingQuestion: parsed.question,
      pendingOptions: parsed.questionOptions,
      lastActivity: new Date().toISOString(),
    });

    // Format options if available
    let optionsText = '';
    if (parsed.questionOptions && parsed.questionOptions.length > 0) {
      optionsText = '\n\nOptions:\n' + parsed.questionOptions.map((o, i) => `${i + 1}. ${o}`).join('\n');
    }

    addNotification(`🤖 *Claude needs your input*\n\n${parsed.question}${optionsText}\n\n_Reply to answer, or tell me to answer on your behalf._`);
    return;
  }

  // Check for implicit questions in text output
  if (parsed.text) {
    const implicitQuestion = detectQuestionInText(parsed.text);
    if (implicitQuestion) {
      updateClaudeSession(sessionId, {
        status: 'waiting_input',
        pendingQuestion: implicitQuestion,
        lastActivity: new Date().toISOString(),
      });

      addNotification(`🤖 *Claude is asking*\n\n${implicitQuestion}\n\n_Reply to answer._`);
      return;
    }

    // Just update activity
    updateClaudeSession(sessionId, { lastActivity: new Date().toISOString() });
  }

  // Track tool usage
  if (parsed.toolName) {
    updateClaudeSession(sessionId, {
      lastTool: parsed.toolName,
      lastActivity: new Date().toISOString(),
    });
  }
}

/**
 * Handle Claude process errors
 */
function handleClaudeError(error, sessionId, chatId) {
  console.error(`Claude session ${sessionId} error:`, error.message);

  // Don't treat all stderr as fatal - Claude outputs progress to stderr
  // Only update status if it's a real error
  if (error.message.includes('Error') || error.message.includes('failed')) {
    updateClaudeSession(sessionId, {
      lastError: error.message,
      lastActivity: new Date().toISOString(),
    });
  }
}

/**
 * Handle Claude process close
 */
function handleClaudeClose(code, sessionId, chatId) {
  const session = getClaudeSession(sessionId);

  // Only update if not already completed
  if (session && session.status === 'running') {
    removeRunningTask(sessionId);

    const status = code === 0 ? 'completed' : 'error';
    updateClaudeSession(sessionId, {
      status,
      process: null,
      kill: null,
      lastActivity: new Date().toISOString(),
    });

    if (code !== 0) {
      addNotification(`❌ *Claude Code session ended unexpectedly* (exit code: ${code})`);
    }

    saveSessions(getAllClaudeSessions());
  }
}

/**
 * Get status of Claude sessions
 */
export async function getSessionStatus(params, ctx) {
  const { sessionId } = params;
  const { chatId } = ctx;

  if (sessionId) {
    const session = getClaudeSession(sessionId);
    if (!session) {
      return { error: `Session not found: ${sessionId}` };
    }
    return {
      success: true,
      session: formatSessionForDisplay(session),
    };
  }

  // Get all sessions for this chat
  const sessions = getClaudeSessionsForChat(chatId);

  if (sessions.length === 0) {
    return {
      success: true,
      message: 'No active Claude Code sessions.',
      sessions: [],
    };
  }

  return {
    success: true,
    count: sessions.length,
    sessions: sessions.map(formatSessionForDisplay),
  };
}

/**
 * Stop a Claude session
 */
export async function stopSession(params, ctx) {
  const { sessionId } = params;
  const { chatId } = ctx;

  if (!sessionId) {
    return { error: 'Session ID is required' };
  }

  // Support partial ID matching
  const sessions = getClaudeSessionsForChat(chatId);
  const session = sessions.find(s => s.id.startsWith(sessionId) || s.id.includes(sessionId));

  if (!session) {
    return { error: `Session not found: ${sessionId}` };
  }

  // Kill the process if running
  if (session.kill) {
    session.kill();
  }

  removeRunningTask(session.id);
  removeClaudeSession(session.id);
  saveSessions(getAllClaudeSessions());

  return {
    success: true,
    message: `Stopped session ${session.id.slice(0, 12)}...`,
  };
}

/**
 * Resume a previous Claude session
 */
export async function resumeSession(params, ctx) {
  const { sessionId, prompt } = params;
  const { chatId } = ctx;

  if (!sessionId) {
    return { error: 'Session ID is required' };
  }

  const session = getClaudeSession(sessionId);
  if (!session) {
    return { error: `Session not found: ${sessionId}` };
  }

  if (!session.claudeSessionId) {
    return { error: 'Session cannot be resumed - no Claude session ID available' };
  }

  // Spawn resumed session
  addRunningTask(sessionId, `Claude: resuming...`);

  const { process: proc, kill } = resumeClaudeSession({
    sessionId: session.claudeSessionId,
    prompt,
    workingDir: session.workingDir,
    onEvent: (event) => handleClaudeEvent(event, sessionId, chatId),
    onError: (error) => handleClaudeError(error, sessionId, chatId),
    onClose: (code) => handleClaudeClose(code, sessionId, chatId),
  });

  updateClaudeSession(sessionId, {
    process: proc,
    kill,
    status: 'running',
    lastActivity: new Date().toISOString(),
  });

  saveSessions(getAllClaudeSessions());

  return {
    success: true,
    message: `Resumed session ${sessionId.slice(0, 12)}...`,
  };
}

/**
 * Send input to a waiting session
 */
export async function sendSessionInput(params, ctx) {
  const { sessionId, input } = params;
  const { chatId } = ctx;

  if (!sessionId || !input) {
    return { error: 'Session ID and input are required' };
  }

  const session = getClaudeSession(sessionId);
  if (!session) {
    return { error: `Session not found: ${sessionId}` };
  }

  if (session.status !== 'waiting_input') {
    return { error: 'Session is not waiting for input' };
  }

  // Note: In --print mode, stdin interaction is limited
  // This may need enhancement based on Claude CLI capabilities
  if (session.process && session.process.stdin && session.process.stdin.writable) {
    session.process.stdin.write(input + '\n');
    updateClaudeSession(sessionId, {
      status: 'running',
      pendingQuestion: null,
      pendingOptions: null,
      lastActivity: new Date().toISOString(),
    });

    return {
      success: true,
      message: 'Input sent to Claude',
    };
  }

  return {
    error: 'Cannot send input - session stdin not available',
  };
}

/**
 * Format session for display
 */
function formatSessionForDisplay(session) {
  return {
    id: session.id,
    status: session.status,
    prompt: session.prompt,
    workingDir: session.workingDir,
    model: session.model,
    startedAt: session.startedAt,
    lastActivity: session.lastActivity,
    totalCost: session.totalCost,
    pendingQuestion: session.pendingQuestion,
    result: session.result,
  };
}

/**
 * Truncate string to length
 */
function truncate(str, len) {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}
