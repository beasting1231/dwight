import chalk from 'chalk';
import gradient from 'gradient-string';
import boxen from 'boxen';
import { getModelShortName } from './models.js';
import { getTokenCount, addToolLog, getToolLog } from './state.js';

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

  // Show recent tool log
  const log = getToolLog();
  if (log.length > 0) {
    console.log(chalk.gray('  ─── Tool Log ───'));
    // Show last 10 entries
    const recentLog = log.slice(-10);
    for (const entry of recentLog) {
      const icon = entry.status === 'success' ? chalk.green('✓') :
                   entry.status === 'error' ? chalk.red('✗') :
                   chalk.yellow('…');
      const detail = entry.detail ? chalk.cyan(` ${entry.detail}`) : '';
      console.log(chalk.gray(`  ${entry.timestamp}  ${icon} ${entry.tool}`) + detail);
    }
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
