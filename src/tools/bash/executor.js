/**
 * Bash command executor with timeout and output handling
 * Based on Claude Code's execution pipeline
 */

import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

// Configuration
const DEFAULT_TIMEOUT_MS = 120000;  // 2 minutes
const MAX_TIMEOUT_MS = 600000;      // 10 minutes
const MAX_OUTPUT_LENGTH = 30000;    // 30K characters

// Working directory persists between commands
let currentWorkingDir = process.cwd();

/**
 * Get the current working directory
 * @returns {string}
 */
export function getWorkingDirectory() {
  return currentWorkingDir;
}

/**
 * Set the working directory
 * @param {string} dir - New working directory
 */
export function setWorkingDirectory(dir) {
  currentWorkingDir = dir;
}

/**
 * Reset working directory to home
 */
export function resetWorkingDirectory() {
  currentWorkingDir = os.homedir();
}

/**
 * Detect the user's preferred shell
 * @returns {string}
 */
function detectShell() {
  // Check environment variable first
  if (process.env.CLAUDE_CODE_SHELL) {
    return process.env.CLAUDE_CODE_SHELL;
  }

  // Check user's login shell
  const shell = process.env.SHELL;
  if (shell && (shell.endsWith('bash') || shell.endsWith('zsh'))) {
    return shell;
  }

  // Default to bash
  return '/bin/bash';
}

/**
 * Execute a bash command
 * @param {string} command - The command to execute
 * @param {Object} options - Execution options
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {string} options.workingDir - Override working directory
 * @param {Object} options.env - Additional environment variables
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean, truncated: boolean, duration: number }>}
 */
export async function executeCommand(command, options = {}) {
  const startTime = Date.now();

  // Validate timeout
  let timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  if (timeout > MAX_TIMEOUT_MS) {
    timeout = MAX_TIMEOUT_MS;
  }

  // Determine working directory
  const workDir = options.workingDir || currentWorkingDir;

  // Detect shell
  const shell = detectShell();
  const isZsh = shell.endsWith('zsh');

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killed = false;

    // Spawn the shell process
    const proc = spawn(shell, ['-c', command], {
      cwd: workDir,
      env: {
        ...process.env,
        ...options.env,
        // Disable interactive features
        TERM: 'dumb',
        // Prevent pagers
        PAGER: 'cat',
        GIT_PAGER: 'cat',
      },
      // Don't inherit stdio - capture it
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      killed = true;
      proc.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    // Capture stdout
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Capture stderr
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process completion
    proc.on('close', (code, signal) => {
      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      // Check for cd command to update working directory
      updateWorkingDirIfCd(command, workDir);

      // Truncate output if needed
      let truncated = false;
      if (stdout.length > MAX_OUTPUT_LENGTH) {
        stdout = stdout.substring(0, MAX_OUTPUT_LENGTH) + '\n\n[Output truncated - exceeded 30K characters]';
        truncated = true;
      }
      if (stderr.length > MAX_OUTPUT_LENGTH) {
        stderr = stderr.substring(0, MAX_OUTPUT_LENGTH) + '\n\n[Output truncated - exceeded 30K characters]';
        truncated = true;
      }

      // Trim trailing whitespace
      stdout = stdout.trimEnd();
      stderr = stderr.trimEnd();

      resolve({
        stdout,
        stderr,
        exitCode: code ?? (signal ? 128 : 1),
        timedOut,
        truncated,
        duration,
        signal: signal || null,
      });
    });

    // Handle spawn errors
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      resolve({
        stdout: '',
        stderr: `Failed to execute command: ${err.message}`,
        exitCode: 1,
        timedOut: false,
        truncated: false,
        duration,
        error: err.message,
      });
    });

    // Close stdin immediately - we don't support interactive commands
    proc.stdin.end();
  });
}

/**
 * Check if command is a cd and update working directory
 * @param {string} command - The executed command
 * @param {string} currentDir - Current working directory
 */
function updateWorkingDirIfCd(command, currentDir) {
  const trimmed = command.trim();

  // Match cd command patterns
  const cdPatterns = [
    /^cd\s+(.+)$/,           // cd <path>
    /^cd\s*$/,               // cd (go to home)
    /^.*&&\s*cd\s+(.+)$/,    // ... && cd <path>
  ];

  for (const pattern of cdPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      let targetDir = match[1]?.trim();

      if (!targetDir || targetDir === '~') {
        currentWorkingDir = os.homedir();
      } else if (targetDir.startsWith('~')) {
        currentWorkingDir = path.join(os.homedir(), targetDir.slice(1));
      } else if (path.isAbsolute(targetDir)) {
        currentWorkingDir = targetDir;
      } else {
        currentWorkingDir = path.resolve(currentDir, targetDir);
      }

      // Normalize the path
      currentWorkingDir = path.normalize(currentWorkingDir);
      break;
    }
  }
}

/**
 * Check if a command is interactive (requires TTY input)
 * @param {string} command - The command to check
 * @returns {{ interactive: boolean, reason?: string }}
 */
export function isInteractiveCommand(command) {
  const interactivePatterns = [
    { pattern: /\bgit\s+rebase\s+-i/, reason: 'Interactive rebase requires editor input' },
    { pattern: /\bgit\s+add\s+-i/, reason: 'Interactive staging requires user input' },
    { pattern: /\bgit\s+add\s+--interactive/, reason: 'Interactive staging requires user input' },
    { pattern: /\bvim?\b/, reason: 'Vim requires interactive terminal' },
    { pattern: /\bnano\b/, reason: 'Nano requires interactive terminal' },
    { pattern: /\bemacs\b/, reason: 'Emacs requires interactive terminal' },
    { pattern: /\bless\b/, reason: 'Less pager requires interactive terminal' },
    { pattern: /\bmore\b/, reason: 'More pager requires interactive terminal' },
    { pattern: /\btop\b/, reason: 'Top requires interactive terminal' },
    { pattern: /\bhtop\b/, reason: 'Htop requires interactive terminal' },
    { pattern: /\bread\s+-[^s]/, reason: 'Read with prompts requires user input' },
    { pattern: /\bssh\b(?!.*-[oT])/, reason: 'SSH may require interactive input' },
    { pattern: /\bpasswd\b/, reason: 'Passwd requires interactive input' },
    { pattern: /\bmysql\b(?!.*-e)/, reason: 'MySQL interactive mode requires user input' },
    { pattern: /\bpsql\b(?!.*-c)/, reason: 'PostgreSQL interactive mode requires user input' },
  ];

  for (const { pattern, reason } of interactivePatterns) {
    if (pattern.test(command)) {
      return { interactive: true, reason };
    }
  }

  return { interactive: false };
}

/**
 * Format execution result for AI consumption
 * @param {Object} result - Execution result from executeCommand
 * @param {string} command - The original command
 * @returns {Object}
 */
export function formatResult(result, command) {
  const formatted = {
    success: result.exitCode === 0,
    exitCode: result.exitCode,
    duration: `${result.duration}ms`,
    workingDirectory: currentWorkingDir,
  };

  if (result.stdout) {
    formatted.stdout = result.stdout;
  }

  if (result.stderr) {
    formatted.stderr = result.stderr;
  }

  if (result.timedOut) {
    formatted.timedOut = true;
    formatted.message = 'Command timed out and was terminated';
  }

  if (result.truncated) {
    formatted.truncated = true;
    formatted.message = (formatted.message ? formatted.message + '. ' : '') +
      'Output was truncated due to length';
  }

  if (result.error) {
    formatted.error = result.error;
  }

  return formatted;
}

// Export constants for testing
export const config = {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_OUTPUT_LENGTH,
};
