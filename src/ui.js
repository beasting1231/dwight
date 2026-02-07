import chalk from 'chalk';
import gradient from 'gradient-string';
import boxen from 'boxen';
import { getModelShortName } from './models.js';
import { getTokenCount, addToolLog, getToolLog, getRunningTasks } from './state.js';
import readline from 'readline';

// Spinner frames for running tasks
const spinnerFrames = ['·', '✦', '✧', '★', '✷', '✹', '✷', '★', '✧', '✦'];
let spinnerIndex = 0;

// Track spinner line position for in-place updates
let spinnerLineCount = 0;
let lastDrawTime = 0;

// Colors for loading animation (matching logo first color)
const loadingColor = '#ff6b35';
const shineColor = '#ffaa77';
let shinePosition = 0;

/**
 * Apply shine effect to text - makes one character brighter
 */
function applyShine(text, shinePos) {
  let result = '';
  const visibleChars = text.replace(/\x1b\[[0-9;]*m/g, ''); // Strip ANSI for length
  const normalizedPos = shinePos % (visibleChars.length + 5); // +5 for gap between shines

  let charIndex = 0;
  for (const char of text) {
    if (charIndex === normalizedPos || charIndex === normalizedPos - 1 || charIndex === normalizedPos + 1) {
      // Shine position - brighter
      result += chalk.hex(shineColor)(char);
    } else {
      result += chalk.hex(loadingColor)(char);
    }
    charIndex++;
  }
  return result;
}

export const dwightGradient = gradient(['#ff6b35', '#f7c59f', '#efefef']);
export const accentGradient = gradient(['#2ec4b6', '#e71d36']);

export const LOGO = `
    ██████╗ ██╗    ██╗██╗ ██████╗ ██╗  ██╗████████╗
    ██╔══██╗██║    ██║██║██╔════╝ ██║  ██║╚══██╔══╝
    ██║  ██║██║ █╗ ██║██║██║  ███╗███████║   ██║
    ██║  ██║██║███╗██║██║██║   ██║██╔══██║   ██║
    ██████╔╝╚███╔███╔╝██║╚██████╔╝██║  ██║   ██║
    ╚═════╝  ╚══╝╚══╝ ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝
`;

export const SUBTITLE = `
        ┌────────────────────────────────────────┐
        │   Assistant to the Regional Manager    │
        └────────────────────────────────────────┘
`;

export function displayLogo() {
  console.clear();
  console.log('\n');
  console.log(dwightGradient(LOGO));
  console.log(chalk.gray(SUBTITLE));
  console.log('\n');
}

export function drawUI(config, status = 'online') {
  console.clear();
  console.log('\n');
  console.log(dwightGradient(LOGO));
  console.log(chalk.gray(SUBTITLE));

  const modelName = getModelShortName(config.ai?.model);
  const tokenCount = getTokenCount();

  let statusIcon, statusText, statusColor;
  switch (status) {
    case 'processing':
      statusIcon = '◉';
      statusText = 'Processing';
      statusColor = 'yellow';
      break;
    case 'connecting':
      statusIcon = '◌';
      statusText = 'Connecting';
      statusColor = 'cyan';
      break;
    case 'error':
      statusIcon = '◉';
      statusText = 'Error';
      statusColor = 'red';
      break;
    default:
      statusIcon = '◉';
      statusText = 'Online';
      statusColor = 'green';
  }

  const statusLine =
    chalk[statusColor](statusIcon) + ' ' + chalk[statusColor](statusText) +
    chalk.gray('  │  ') + chalk.white(modelName) +
    chalk.gray('  │  ') + chalk.gray(tokenCount.toLocaleString() + ' tokens');

  console.log('\n  ' + statusLine + '\n');

  // Show tool log and running tasks
  const runningTasks = getRunningTasks();
  const log = getToolLog();

  if (runningTasks.length > 0 || log.length > 0) {
    console.log(chalk.gray('  ─── Tool Log ───'));

    // Show completed log entries first
    const maxLogEntries = runningTasks.length > 0 ? 8 : 10;
    const recentLog = log.slice(-maxLogEntries);
    for (const entry of recentLog) {
      const icon = entry.status === 'success' ? chalk.green('✓') :
                   entry.status === 'error' ? chalk.red('✗') :
                   chalk.yellow('…');
      const detail = entry.detail ? chalk.cyan(` ${entry.detail}`) : '';
      console.log(chalk.gray(`  ${entry.timestamp}  ${icon} ${entry.tool}`) + detail);
    }

    // Show running tasks at the bottom (for easy in-place updates)
    spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
    shinePosition += 2;
    const spinner = chalk.hex(loadingColor)(spinnerFrames[spinnerIndex]);

    for (const task of runningTasks) {
      const elapsed = Math.floor((Date.now() - task.startedAt) / 1000);
      const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const taskText = `${task.description} (${elapsed}s)`;
      const shineText = applyShine(taskText, shinePosition);
      console.log(chalk.gray(`  ${time}  `) + spinner + ' ' + shineText);
    }

    // Track how many running task lines we drew (for updateSpinner)
    spinnerLineCount = runningTasks.length;
    lastDrawTime = Date.now();

    console.log('');
  }
}

export function showStatus(config) {
  const modelInfo = config.ai?.model || 'Not configured';
  const providerInfo = config.ai?.provider || 'Not configured';

  console.log(boxen(
    chalk.bold.white('Bot Status\n\n') +
    chalk.gray('Name:        ') + chalk.cyan(config.telegram.name) + '\n' +
    chalk.gray('Provider:    ') + chalk.yellow(providerInfo) + '\n' +
    chalk.gray('Model:       ') + chalk.white(modelInfo) + '\n' +
    chalk.gray('Temperature: ') + chalk.white(config.ai?.temperature ?? 'N/A') + '\n' +
    chalk.gray('Max Tokens:  ') + chalk.white(config.ai?.maxTokens ?? 'N/A') + '\n' +
    chalk.gray('Phones:      ') + chalk.white(
      config.telegram.allowedPhones?.length > 0
        ? config.telegram.allowedPhones.join(', ')
        : 'All users'
    ) + '\n' +
    chalk.gray('Created:     ') + chalk.white(new Date(config.createdAt).toLocaleDateString()),
    {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: 'cyan'
    }
  ));
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update just the spinner animation without redrawing the whole UI
 * Returns true if there are running tasks, false otherwise
 */
export function updateSpinner() {
  const runningTasks = getRunningTasks();

  if (runningTasks.length === 0 || spinnerLineCount === 0) {
    return false;
  }

  // Hide cursor during update to reduce flicker
  process.stdout.write('\x1b[?25l');

  // Move cursor up to overwrite spinner lines (running tasks + empty line)
  const linesToMoveUp = spinnerLineCount + 1; // +1 for the empty line after
  process.stdout.write(`\x1b[${linesToMoveUp}A`);

  // Update spinner frame
  spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
  shinePosition += 2;
  const spinner = chalk.hex(loadingColor)(spinnerFrames[spinnerIndex]);

  // Rewrite each running task line
  for (const task of runningTasks) {
    const elapsed = Math.floor((Date.now() - task.startedAt) / 1000);
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const taskText = `${task.description} (${elapsed}s)`;
    const shineText = applyShine(taskText, shinePosition);
    // Clear line and write content, then move to next line
    process.stdout.write(`\x1b[2K\r${chalk.gray(`  ${time}  `)}${spinner} ${shineText}\n`);
  }

  // Write empty line
  process.stdout.write('\x1b[2K\n');

  // Show cursor again
  process.stdout.write('\x1b[?25h');

  return true;
}

/**
 * Log a tool call to the UI
 * @param {string} toolName - Name of the tool
 * @param {string} status - 'running', 'success', or 'error'
 * @param {Object} params - Tool parameters (optional)
 */
export function logToolCall(toolName, status = 'running', params = null) {
  const name = toolName.replace(/_/g, ' ');

  // Add to persistent log (only final status, not 'running')
  if (status !== 'running') {
    let detail = null;

    // Extract relevant details based on tool type
    if (params) {
      if (toolName.startsWith('file_')) {
        // File tools - show path(s)
        if (params.path) {
          detail = shortenPath(params.path);
        } else if (params.source && params.destination) {
          detail = `${shortenPath(params.source)} → ${shortenPath(params.destination)}`;
        }
      } else if (toolName === 'memory_update' || toolName === 'memory_read') {
        detail = params.file;
      } else if (toolName === 'email_send') {
        detail = params.to;
      }
    }

    addToolLog({ tool: name, status, detail });
  }
}

/**
 * Shorten a file path for display
 */
function shortenPath(filePath) {
  if (!filePath) return '';
  const parts = filePath.split('/');
  if (parts.length <= 3) return filePath;
  // Show last 2 parts (e.g., "Desktop/test.txt")
  return '.../' + parts.slice(-2).join('/');
}
