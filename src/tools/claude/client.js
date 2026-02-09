/**
 * Claude Code CLI process management
 * Uses PTY (pseudo-terminal) for proper interactive stdin/stdout
 */

import os from 'os';
import { parseStreamData, detectPermissionPrompt } from './parser.js';

// Dynamic import for node-pty (native module)
let pty = null;

async function getPty() {
  if (!pty) {
    const module = await import('node-pty');
    pty = module.default || module;
  }
  return pty;
}

/**
 * Spawn a new Claude Code CLI session using PTY
 * @param {Object} options
 * @param {string} options.prompt - The task prompt for Claude
 * @param {string} options.workingDir - Working directory for the session
 * @param {string} options.model - Model to use (sonnet, opus, haiku)
 * @param {Function} options.onEvent - Callback for parsed stream events
 * @param {Function} options.onError - Callback for errors
 * @param {Function} options.onClose - Callback when process closes
 * @returns {Object} { process, kill, write }
 */
export async function spawnClaudeSession(options) {
  const {
    prompt,
    workingDir = os.homedir(),
    model = 'sonnet',
    onEvent,
    onError,
    onClose,
  } = options;

  const nodePty = await getPty();

  // Build claude command arguments
  // Note: --dangerously-skip-permissions not used because it's blocked when running as root
  // PTY allows us to handle permission prompts interactively instead
  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
  ];

  // Add model if specified
  if (model && model !== 'sonnet') {
    args.push('--model', model);
  }

  // Add the prompt
  args.push(prompt);

  // Spawn with PTY for proper terminal emulation
  const proc = nodePty.spawn('claude', args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: workingDir,
    env: { ...process.env },
  });

  let buffer = '';

  // PTY combines stdout/stderr into single data stream
  proc.onData((data) => {
    // Filter out ANSI escape codes that aren't part of JSON
    const cleaned = stripAnsiCodes(data);

    // Check for permission prompts and auto-approve
    const permission = detectPermissionPrompt(cleaned);
    if (permission) {
      console.log(`Auto-approving permission for: ${permission.tool}`);
      proc.write('y\n');
      return; // Don't parse this as JSON
    }

    const { events, buffer: remaining } = parseStreamData(cleaned, buffer);
    buffer = remaining;

    for (const event of events) {
      if (onEvent) onEvent(event);
    }
  });

  proc.onExit(({ exitCode }) => {
    if (onClose) onClose(exitCode);
  });

  return {
    process: proc,
    write: (input) => {
      proc.write(input);
    },
    kill: (signal = 'SIGTERM') => {
      try {
        proc.kill(signal === 'SIGKILL' ? 9 : 15);
      } catch (e) {
        // Process may already be dead
      }
    },
  };
}

/**
 * Strip ANSI escape codes from string
 * PTY output may contain terminal formatting codes
 */
function stripAnsiCodes(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/\x1b\][^\x07]*\x07/g, '');
}

/**
 * Send input to a running Claude session
 * With PTY, this actually works reliably!
 * @param {Object} proc - The PTY process
 * @param {string} input - The input to send
 * @returns {boolean} Whether input was sent
 */
export function sendInput(proc, input) {
  if (!proc || !proc.write) {
    return false;
  }

  try {
    proc.write(input + '\n');
    return true;
  } catch (error) {
    console.error('Failed to send input to Claude:', error.message);
    return false;
  }
}

/**
 * Resume a previous Claude Code session using PTY
 * @param {Object} options
 * @param {string} options.sessionId - The session ID to resume
 * @param {string} options.prompt - Optional new prompt to continue with
 * @param {string} options.workingDir - Working directory
 * @param {Function} options.onEvent - Event callback
 * @param {Function} options.onError - Error callback
 * @param {Function} options.onClose - Close callback
 * @returns {Object} { process, kill, write }
 */
export async function resumeClaudeSession(options) {
  const {
    sessionId,
    prompt = '',
    workingDir = os.homedir(),
    onEvent,
    onError,
    onClose,
  } = options;

  const nodePty = await getPty();

  // Note: --dangerously-skip-permissions not used because it's blocked when running as root
  // PTY allows us to handle permission prompts interactively instead
  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--resume', sessionId,
  ];

  // Add continuation prompt if provided
  if (prompt) {
    args.push(prompt);
  }

  const proc = nodePty.spawn('claude', args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: workingDir,
    env: { ...process.env },
  });

  let buffer = '';

  proc.onData((data) => {
    const cleaned = stripAnsiCodes(data);

    // Check for permission prompts and auto-approve
    const permission = detectPermissionPrompt(cleaned);
    if (permission) {
      console.log(`Auto-approving permission for: ${permission.tool}`);
      proc.write('y\n');
      return; // Don't parse this as JSON
    }

    const { events, buffer: remaining } = parseStreamData(cleaned, buffer);
    buffer = remaining;

    for (const event of events) {
      if (onEvent) onEvent(event);
    }
  });

  proc.onExit(({ exitCode }) => {
    if (onClose) onClose(exitCode);
  });

  return {
    process: proc,
    write: (input) => {
      proc.write(input);
    },
    kill: (signal = 'SIGTERM') => {
      try {
        proc.kill(signal === 'SIGKILL' ? 9 : 15);
      } catch (e) {
        // Process may already be dead
      }
    },
  };
}
