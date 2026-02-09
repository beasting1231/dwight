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
import { saveSessions, loadSessionCounter, saveSessionCounter } from './storage.js';

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

  const sessionId = getNextSessionId();
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

  // Spawn the Claude process (now async with PTY)
  const { process: proc, kill, write } = await spawnClaudeSession({
    prompt,
    workingDir: cwd,
    model,
    onEvent: (event) => handleClaudeEvent(event, sessionId, chatId),
    onError: (error) => handleClaudeError(error, sessionId, chatId),
    onClose: (code) => handleClaudeClose(code, sessionId, chatId),
  });

  // Store process reference and write function for input
  updateClaudeSession(sessionId, { process: proc, kill, write, status: 'running' });
  saveSessions(getAllClaudeSessions());

  return {
    success: true,
    sessionId,
    message: `Claude Code session started (ID: ${sessionId.slice(0, 12)}...). Working in: ${cwd}`,
  };
}

// Max number of recent activity entries to keep per session
const MAX_ACTIVITY_ENTRIES = 20;

// Progress update interval (2 minutes)
const PROGRESS_UPDATE_INTERVAL = 2 * 60 * 1000;

// Track last progress notification per session
const lastProgressNotification = new Map();

// Simple session counter (loaded from storage on first use)
let sessionCounter = null;

function getNextSessionId() {
  if (sessionCounter === null) {
    sessionCounter = loadSessionCounter();
  }
  sessionCounter++;
  saveSessionCounter(sessionCounter);
  return `claude_${sessionCounter}`;
}

/**
 * Check if we should send a progress update
 */
function shouldSendProgressUpdate(sessionId) {
  const lastUpdate = lastProgressNotification.get(sessionId);
  const session = getClaudeSession(sessionId);
  const activityCount = (session?.recentActivity || []).filter(a => a.type === 'tool').length;

  // Send first update after 3 tool calls
  if (!lastUpdate && activityCount >= 3) return true;

  // Then every PROGRESS_UPDATE_INTERVAL
  if (lastUpdate && Date.now() - lastUpdate > PROGRESS_UPDATE_INTERVAL) return true;

  return false;
}

/**
 * Send a progress notification for a running session
 */
function sendProgressUpdate(sessionId) {
  const session = getClaudeSession(sessionId);
  if (!session || session.status !== 'running') return;

  const activity = session.recentActivity || [];
  if (activity.length === 0) return;

  // Get recent activity summary
  const recentTools = activity
    .filter(a => a.type === 'tool')
    .slice(-3)
    .map(a => a.name);

  const lastText = activity
    .filter(a => a.type === 'text')
    .slice(-1)[0];

  // Build progress message
  let msg = '🔄 *Claude Code Progress*\n\n';

  if (recentTools.length > 0) {
    msg += `Recent actions: ${recentTools.join(', ')}\n`;
  }

  if (lastText && lastText.content) {
    msg += `\n"${truncate(lastText.content, 150)}"`;
  }

  const elapsed = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000);
  msg += `\n\n_Running for ${elapsed} min_`;

  addNotification(msg);
  lastProgressNotification.set(sessionId, Date.now());
}

/**
 * Add activity entry to session's rolling buffer
 */
function addActivityEntry(sessionId, entry) {
  const session = getClaudeSession(sessionId);
  if (!session) return;

  const activity = session.recentActivity || [];
  activity.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });

  // Keep only last N entries
  if (activity.length > MAX_ACTIVITY_ENTRIES) {
    activity.shift();
  }

  updateClaudeSession(sessionId, { recentActivity: activity });
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
    addActivityEntry(sessionId, { type: 'init', model: parsed.model });
  }

  // Handle task completion
  if (parsed.isComplete) {
    removeRunningTask(sessionId);
    lastProgressNotification.delete(sessionId); // Cleanup

    const summary = generateCompletionSummary(parsed);
    addActivityEntry(sessionId, {
      type: 'complete',
      success: parsed.success,
      summary: truncate(summary, 200),
    });

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
    addActivityEntry(sessionId, {
      type: 'question',
      question: truncate(parsed.question, 200),
      options: parsed.questionOptions,
    });

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

  // Track text output
  if (parsed.text) {
    addActivityEntry(sessionId, {
      type: 'text',
      content: truncate(parsed.text, 300),
    });

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
    addActivityEntry(sessionId, {
      type: 'tool',
      name: parsed.toolName,
      input: parsed.toolInput ? truncate(JSON.stringify(parsed.toolInput), 200) : null,
    });

    updateClaudeSession(sessionId, {
      lastTool: parsed.toolName,
      lastActivity: new Date().toISOString(),
    });

    // Send periodic progress updates
    if (shouldSendProgressUpdate(sessionId)) {
      sendProgressUpdate(sessionId);
    }
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
  lastProgressNotification.delete(session.id);
  saveSessions(getAllClaudeSessions());

  return {
    success: true,
    message: `Stopped session ${session.id.slice(0, 12)}...`,
  };
}

/**
 * Resume a previous Claude session or send a follow-up message
 */
export async function resumeSession(params, ctx) {
  const { sessionId, prompt } = params;
  const { chatId } = ctx;

  if (!prompt) {
    return { error: 'Prompt/message is required' };
  }

  // Find session - support partial matching or auto-select most recent
  const sessions = getClaudeSessionsForChat(chatId);
  let session;

  if (sessionId) {
    // Try exact match first, then partial
    session = sessions.find(s => s.id === sessionId);
    if (!session) {
      session = sessions.find(s => s.id.includes(sessionId) || sessionId.includes(s.id.replace('claude_', '')));
    }
  } else {
    // Auto-select most recent session
    session = sessions[sessions.length - 1];
  }

  if (!session) {
    return {
      error: sessionId
        ? `Session not found: ${sessionId}`
        : 'No sessions found. Use claude_start to create one.',
    };
  }

  // Check if session is still running
  if (session.status === 'running' && session.process) {
    return {
      error: `Session ${session.id} is still running. Wait for it to complete or stop it first.`,
      hint: 'Use claude_status to check progress, or claude_stop to terminate.',
    };
  }

  if (!session.claudeSessionId) {
    return {
      error: `Session ${session.id} cannot be resumed - no Claude session ID available.`,
      hint: 'The session may have failed before initialization. Start a new session with claude_start.',
    };
  }

  // Spawn resumed session (now async with PTY)
  addRunningTask(session.id, `Claude: ${truncate(prompt, 30)}`);

  const { process: proc, kill, write } = await resumeClaudeSession({
    sessionId: session.claudeSessionId,
    prompt,
    workingDir: session.workingDir,
    onEvent: (event) => handleClaudeEvent(event, session.id, chatId),
    onError: (error) => handleClaudeError(error, session.id, chatId),
    onClose: (code) => handleClaudeClose(code, session.id, chatId),
  });

  updateClaudeSession(session.id, {
    process: proc,
    kill,
    write,
    status: 'running',
    lastActivity: new Date().toISOString(),
  });

  saveSessions(getAllClaudeSessions());

  return {
    success: true,
    sessionId: session.id,
    message: `Sent message to ${session.id}`,
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

  // With PTY, we have a reliable write function
  if (session.write) {
    session.write(input + '\n');
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

  // Fallback for old stdin method (shouldn't happen with PTY)
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
      message: 'Input sent to Claude (legacy)',
    };
  }

  return {
    error: 'Cannot send input - session not available',
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
    // Include recent activity so AI can see what Claude is doing
    recentActivity: session.recentActivity || [],
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
