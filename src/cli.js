import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { loadConfig, saveConfig, loadStoredKeys, saveApiKey, getFileMode, setFileMode } from './config.js';
import { MODELS } from './models.js';
import { clearConversations, clearVerifiedUsers, getTokenCount, getToolLog, addToolLog, clearToolLog } from './state.js';
import { drawUI } from './ui.js';
import { setupEmail } from './tools/email/setup.js';
import { setupWeb } from './tools/web/setup.js';
import { setupImage } from './tools/image/setup.js';
import { setupCalendar } from './tools/calendar/setup.js';
import { getSchedulerStatus } from './tools/index.js';
import { loadCrons, deleteCron } from './tools/cron/storage.js';
import { formatPattern } from './tools/cron/patterns.js';

export async function handleApiCommand(config, rl) {
  rl.pause();
  const storedKeys = loadStoredKeys();

  try {
    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: chalk.cyan('Select provider:'),
        choices: [
          {
            name: storedKeys.openrouter ? 'OpenRouter ' + chalk.green('✓') : 'OpenRouter',
            value: 'openrouter'
          },
          {
            name: storedKeys.anthropic ? 'Anthropic ' + chalk.green('✓') : 'Anthropic',
            value: 'anthropic'
          },
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: 'back' }
        ]
      }
    ]);

    if (provider === 'back') {
      rl.resume();
      return false;
    }

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: chalk.cyan(`Enter ${provider} API key:`),
        mask: '*'
      }
    ]);

    if (!apiKey || !apiKey.trim()) {
      console.log(chalk.yellow('  Cancelled.'));
      rl.resume();
      return false;
    }

    // Save API key to persistent storage
    saveApiKey(provider, apiKey.trim());

    // Update current config
    config.ai = config.ai || {};
    config.ai.provider = provider;
    config.ai.apiKey = apiKey.trim();

    if (!config.ai.model || !MODELS[provider].some(m => m.value === config.ai.model)) {
      config.ai.model = MODELS[provider][0].value;
    }

    saveConfig(config);
    console.log(chalk.green('\n  ✅ API key saved!\n'));
    return true;

  } catch (e) {
    rl.resume();
    return false;
  }
}

export async function handleModelCommand(config, rl) {
  rl.pause();
  const storedKeys = loadStoredKeys();

  try {
    const providerChoices = [
      {
        name: storedKeys.openrouter
          ? 'OpenRouter ' + chalk.green('✓')
          : 'OpenRouter ' + chalk.red('(API not configured)'),
        value: 'openrouter'
      },
      {
        name: storedKeys.anthropic
          ? 'Anthropic ' + chalk.green('✓')
          : 'Anthropic ' + chalk.red('(API not configured)'),
        value: 'anthropic'
      },
      new inquirer.Separator(),
      { name: chalk.gray('← Back'), value: 'back' }
    ];

    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: chalk.cyan('Select provider:'),
        choices: providerChoices
      }
    ]);

    if (provider === 'back') {
      rl.resume();
      return false;
    }

    // Check if API is configured for this provider
    if (!storedKeys[provider]) {
      const { apiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: chalk.cyan(`Enter ${provider} API key:`),
          mask: '*'
        }
      ]);

      if (!apiKey || !apiKey.trim()) {
        console.log(chalk.yellow('  Cancelled. Returning to provider selection...\n'));
        return await handleModelCommand(config, rl);
      }

      saveApiKey(provider, apiKey.trim());
      storedKeys[provider] = apiKey.trim();
    }

    // Now select model
    const models = MODELS[provider];
    const modelChoices = models.map(m => ({
      name: `${m.name} ${chalk.gray(`[${m.pricing}]`)}`,
      value: m.value
    }));
    modelChoices.push(new inquirer.Separator());
    modelChoices.push({ name: chalk.gray('← Back'), value: 'back' });

    const { model } = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: chalk.cyan('Select model:'),
        choices: modelChoices,
        pageSize: 15
      }
    ]);

    if (model === 'back') {
      return await handleModelCommand(config, rl);
    }

    // Update config with selected provider/model
    config.ai = config.ai || {};
    config.ai.provider = provider;
    config.ai.apiKey = storedKeys[provider];
    config.ai.model = model;
    saveConfig(config);

    const modelName = models.find(m => m.value === model)?.name || model;
    console.log(chalk.green(`\n  ✅ Model set to ${modelName}\n`));
    return true;

  } catch (e) {
    rl.resume();
    return false;
  }
}

export function handleHelpCommand(config) {
  drawUI(config, 'online');
  console.log(chalk.gray('  Commands:\n'));
  console.log(chalk.yellow('  help    ') + chalk.gray('Show this help'));
  console.log(chalk.yellow('  api     ') + chalk.gray('Configure API keys'));
  console.log(chalk.yellow('  model   ') + chalk.gray('Change AI model'));
  console.log(chalk.yellow('  mode    ') + chalk.gray('Set file operation permission mode'));
  console.log(chalk.yellow('  email   ') + chalk.gray('Configure email integration'));
  console.log(chalk.yellow('  web     ') + chalk.gray('Configure web search (Brave Search)'));
  console.log(chalk.yellow('  image   ') + chalk.gray('Configure image generation (Gemini)'));
  console.log(chalk.yellow('  calendar') + chalk.gray(' Configure Google Calendar'));
  console.log(chalk.yellow('  cron    ') + chalk.gray('View and manage scheduled tasks'));
  console.log(chalk.yellow('  status  ') + chalk.gray('Show current config'));
  console.log(chalk.yellow('  logs    ') + chalk.gray('Copy tool logs to clipboard'));
  console.log(chalk.yellow('  clear   ') + chalk.gray('Clear conversation context'));
  console.log(chalk.yellow('  restart ') + chalk.gray('Restart the bot'));
  console.log(chalk.yellow('  update  ') + chalk.gray('Update to latest version from GitHub'));
  console.log(chalk.yellow('  back    ') + chalk.gray('Return to main menu'));
  console.log('');
}

export function handleLogsCommand(config) {
  const log = getToolLog();

  if (log.length === 0) {
    console.log(chalk.yellow('  No tool logs yet.\n'));
    return;
  }

  // Format logs as text
  const logText = log.map(entry => {
    const status = entry.status === 'success' ? '✓' : entry.status === 'error' ? '✗' : '?';
    const detail = entry.detail ? ` ${entry.detail}` : '';
    return `${entry.timestamp}  ${status} ${entry.tool}${detail}`;
  }).join('\n');

  // Copy to clipboard (macOS)
  try {
    execSync('pbcopy', { input: logText });
    console.log(chalk.green(`  Copied ${log.length} log entries to clipboard.\n`));
  } catch {
    // Fallback: just print the logs
    console.log(chalk.gray('  ─── Tool Logs ───\n'));
    console.log(logText);
    console.log(chalk.gray('\n  (Could not copy to clipboard)\n'));
  }
}

export async function handleModeCommand(config, rl) {
  rl.pause();
  const currentMode = getFileMode();

  try {
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: chalk.cyan('Select file operation mode:'),
        choices: [
          {
            name: currentMode === 'ask'
              ? chalk.green('● ') + 'Ask ' + chalk.gray('- Ask permission before file operations')
              : '  Ask ' + chalk.gray('- Ask permission before file operations'),
            value: 'ask'
          },
          {
            name: currentMode === 'auto'
              ? chalk.green('● ') + 'Auto ' + chalk.gray('- Operate freely, only ask when task is unclear')
              : '  Auto ' + chalk.gray('- Operate freely, only ask when task is unclear'),
            value: 'auto'
          },
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: 'back' }
        ]
      }
    ]);

    if (mode === 'back') {
      rl.resume();
      return false;
    }

    setFileMode(mode);

    if (mode === 'ask') {
      console.log(chalk.green('\n  ✅ Mode set to Ask'));
      console.log(chalk.gray('     Dwight will ask permission before file operations.\n'));
    } else {
      console.log(chalk.green('\n  ✅ Mode set to Auto'));
      console.log(chalk.gray('     Dwight will operate freely and only ask when tasks are unclear.\n'));
    }

    rl.resume();
    return false;

  } catch (e) {
    rl.resume();
    return false;
  }
}

export async function handleEmailCommand(config, rl) {
  rl.pause();
  try {
    await setupEmail();
    rl.resume();
    return true; // Restart to apply email config
  } catch (e) {
    rl.resume();
    return false;
  }
}

export async function handleWebCommand(config, rl) {
  rl.pause();
  try {
    const restart = await setupWeb();
    rl.resume();
    return restart; // Restart if config changed
  } catch (e) {
    rl.resume();
    return false;
  }
}

export async function handleImageCommand(config, rl) {
  rl.pause();
  try {
    const restart = await setupImage();
    rl.resume();
    return restart; // Restart if config changed
  } catch (e) {
    rl.resume();
    return false;
  }
}

export async function handleCalendarCommand(config, rl) {
  rl.pause();
  try {
    const restart = await setupCalendar();
    rl.resume();
    return restart; // Restart if config changed
  } catch (e) {
    rl.resume();
    return false;
  }
}

export function handleStatusCommand(config) {
  const currentConfig = loadConfig();
  const fileMode = getFileMode();
  const webEnabled = currentConfig?.web?.enabled && currentConfig?.web?.braveApiKey;
  const imageEnabled = currentConfig?.image?.enabled !== false && currentConfig?.image?.googleApiKey;
  const calendarEnabled = currentConfig?.calendar?.enabled && currentConfig?.calendar?.tokens?.access_token;
  const cronStatus = getSchedulerStatus();
  drawUI(config, 'online');
  console.log(chalk.gray('  Provider:    ') + chalk.yellow(currentConfig.ai?.provider || 'none'));
  console.log(chalk.gray('  Model:       ') + chalk.white(currentConfig.ai?.model || 'none'));
  console.log(chalk.gray('  Context:     ') + chalk.white(getTokenCount().toLocaleString() + ' tokens'));
  console.log(chalk.gray('  Temperature: ') + chalk.white(currentConfig.ai?.temperature ?? 0.7));
  console.log(chalk.gray('  File Mode:   ') + chalk.white(fileMode === 'auto' ? 'Auto' : 'Ask'));
  console.log(chalk.gray('  Web Search:  ') + (webEnabled ? chalk.green('Enabled') : chalk.gray('Not configured')));
  console.log(chalk.gray('  Image Gen:   ') + (imageEnabled ? chalk.green('Enabled') : chalk.gray('Not configured')));
  console.log(chalk.gray('  Calendar:    ') + (calendarEnabled ? chalk.green('Enabled') : chalk.gray('Not configured')));
  console.log(chalk.gray('  Cron Jobs:   ') + chalk.white(`${cronStatus.enabledCrons} active` + (cronStatus.nextCron ? `, next in ${cronStatus.nextCron.inMinutes}m` : '')));
  console.log('');
}

export function handleClearCommand(config) {
  clearConversations();
  clearVerifiedUsers();
  clearToolLog();
  drawUI(config, 'online');
}

export async function handleCronCommand(config, rl) {
  rl.pause();
  const crons = loadCrons();

  try {
    if (crons.length === 0) {
      console.log(chalk.gray('\n  No scheduled tasks.\n'));
      console.log(chalk.gray('  Tell Dwight to create one, e.g.:\n'));
      console.log(chalk.white('  "Every Monday at 9am, send me a summary email"\n'));
      rl.resume();
      return false;
    }

    // Build choices from crons
    const cronChoices = crons.map(c => ({
      name: `${c.enabled ? chalk.green('●') : chalk.gray('○')} ${c.description} ${chalk.gray(`(${formatPattern(c.pattern)})`)}`,
      value: c.id
    }));

    cronChoices.push(new inquirer.Separator());
    cronChoices.push({ name: chalk.gray('← Back'), value: 'back' });

    const { selectedCron } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedCron',
        message: chalk.cyan('Scheduled tasks:'),
        choices: cronChoices,
        pageSize: 15
      }
    ]);

    if (selectedCron === 'back') {
      rl.resume();
      return false;
    }

    // Show cron details and actions
    const cron = crons.find(c => c.id === selectedCron);
    if (!cron) {
      rl.resume();
      return false;
    }

    console.log('');
    console.log(chalk.gray('  Description: ') + chalk.white(cron.description));
    console.log(chalk.gray('  Schedule:    ') + chalk.white(formatPattern(cron.pattern)));
    console.log(chalk.gray('  Prompt:      ') + chalk.white(cron.prompt.substring(0, 50) + (cron.prompt.length > 50 ? '...' : '')));
    console.log(chalk.gray('  Status:      ') + (cron.enabled ? chalk.green('Enabled') : chalk.gray('Disabled')));
    console.log(chalk.gray('  Next run:    ') + chalk.white(cron.nextRun ? new Date(cron.nextRun).toLocaleString() : 'N/A'));
    console.log(chalk.gray('  Last run:    ') + chalk.white(cron.lastRun ? new Date(cron.lastRun).toLocaleString() : 'Never'));
    console.log('');

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.cyan('Action:'),
        choices: [
          { name: cron.enabled ? 'Disable' : 'Enable', value: 'toggle' },
          { name: chalk.red('Delete'), value: 'delete' },
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: 'back' }
        ]
      }
    ]);

    if (action === 'back') {
      return await handleCronCommand(config, rl);
    }

    if (action === 'toggle') {
      const { updateCron } = await import('./tools/cron/storage.js');
      const { calculateNextRun } = await import('./tools/cron/patterns.js');

      const newState = !cron.enabled;
      updateCron(cron.id, { enabled: newState });

      if (newState) {
        const nextRun = calculateNextRun({ ...cron, enabled: true });
        if (nextRun) {
          updateCron(cron.id, { nextRun: nextRun.toISOString() });
        }
      }

      console.log(chalk.green(`\n  ✅ "${cron.description}" ${newState ? 'enabled' : 'disabled'}\n`));
      return await handleCronCommand(config, rl);
    }

    if (action === 'delete') {
      const { confirmDelete } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmDelete',
          message: chalk.red(`Delete "${cron.description}"?`),
          default: false
        }
      ]);

      if (confirmDelete) {
        deleteCron(cron.id);
        console.log(chalk.green(`\n  ✅ Deleted "${cron.description}"\n`));
      }
      return await handleCronCommand(config, rl);
    }

    rl.resume();
    return false;

  } catch (e) {
    rl.resume();
    return false;
  }
}
