/**
 * Claude Code CLI process management
 * Spawns and manages Claude Code CLI processes
 */

import { spawn } from 'child_process';
import os from 'os';
import { parseStreamData } from './parser.js';

/**
 * Spawn a new Claude Code CLI session
 * @param {Object} options
 * @param {string} options.prompt - The task prompt for Claude
 * @param {string} options.workingDir - Working directory for the session
 * @param {string} options.model - Model to use (sonnet, opus, haiku)
 * @param {Function} options.onEvent - Callback for parsed stream events
 * @param {Function} options.onError - Callback for errors
 * @param {Function} options.onClose - Callback when process closes
 * @returns {Object} { process, kill }
 */
export function spawnClaudeSession(options) {
  const {
    prompt,
    workingDir = os.homedir(),
    model = 'sonnet',
    onEvent,
    onError,
    onClose,
  } = options;

  // Build claude command arguments
  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',  // Required for non-interactive mode
  ];

  // Add model if specified
  if (model && model !== 'sonnet') {
    args.push('--model', model);
  }

  // Add the prompt
  args.push(prompt);

  // Spawn the process
  const proc = spawn('claude', args, {
    cwd: workingDir,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';

  // Parse stdout as newline-delimited JSON
  proc.stdout.on('data', (data) => {
    const { events, buffer: remaining } = parseStreamData(data.toString(), buffer);
    buffer = remaining;

    for (const event of events) {
      if (onEvent) onEvent(event);
    }
  });

  // Capture stderr
  proc.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text && onError) {
      onError(new Error(text));
    }
  });

  // Handle process close
  proc.on('close', (code) => {
    if (onClose) onClose(code);
  });

  proc.on('error', (error) => {
    if (onError) onError(error);
  });

  return {
    process: proc,
    kill: (signal = 'SIGTERM') => {
      if (!proc.killed) {
        proc.kill(signal);
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }
    },
  };
}

/**
 * Send input to a running Claude session
 * Note: In --print mode with stream-json, stdin may not be fully interactive.
 * For now, this is a placeholder for future enhancement.
 * @param {ChildProcess} proc - The Claude process
 * @param {string} input - The input to send
 * @returns {boolean} Whether input was sent
 */
export function sendInput(proc, input) {
  if (!proc || !proc.stdin || !proc.stdin.writable) {
    return false;
  }

  try {
    // In stream-json mode, input might need special formatting
    proc.stdin.write(input + '\n');
    return true;
  } catch (error) {
    console.error('Failed to send input to Claude:', error.message);
    return false;
  }
}

/**
 * Resume a previous Claude Code session
 * @param {Object} options
 * @param {string} options.sessionId - The session ID to resume
 * @param {string} options.prompt - Optional new prompt to continue with
 * @param {string} options.workingDir - Working directory
 * @param {Function} options.onEvent - Event callback
 * @param {Function} options.onError - Error callback
 * @param {Function} options.onClose - Close callback
 * @returns {Object} { process, kill }
 */
export function resumeClaudeSession(options) {
  const {
    sessionId,
    prompt = '',
    workingDir = os.homedir(),
    onEvent,
    onError,
    onClose,
  } = options;

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
    '--resume', sessionId,
  ];

  // Add continuation prompt if provided
  if (prompt) {
    args.push(prompt);
  }

  const proc = spawn('claude', args, {
    cwd: workingDir,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';

  proc.stdout.on('data', (data) => {
    const { events, buffer: remaining } = parseStreamData(data.toString(), buffer);
    buffer = remaining;

    for (const event of events) {
      if (onEvent) onEvent(event);
    }
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text && onError) {
      onError(new Error(text));
    }
  });

  proc.on('close', (code) => {
    if (onClose) onClose(code);
  });

  proc.on('error', (error) => {
    if (onError) onError(error);
  });

  return {
    process: proc,
    kill: (signal = 'SIGTERM') => {
      if (!proc.killed) {
        proc.kill(signal);
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }
    },
  };
}
