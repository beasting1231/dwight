import chalk from 'chalk';
import gradient from 'gradient-string';
import boxen from 'boxen';
import { getModelShortName } from './models.js';
import { getTokenCount } from './state.js';

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
 */
export function logToolCall(toolName, status = 'running') {
  const toolIcons = {
    email_list: '📧',
    email_read: '📖',
    email_search: '🔍',
    email_send: '✉️',
    email_unread_count: '📬',
    memory_read: '🧠',
    memory_update: '💾',
    memory_append: '📝',
    datetime_now: '🕐',
  };

  const icon = toolIcons[toolName] || '🔧';
  const name = toolName.replace(/_/g, ' ');

  if (status === 'running') {
    console.log(chalk.gray(`  ${icon} ${name}...`));
  } else if (status === 'success') {
    console.log(chalk.green(`  ${icon} ${name} ✓`));
  } else if (status === 'error') {
    console.log(chalk.red(`  ${icon} ${name} ✗`));
  }
}
