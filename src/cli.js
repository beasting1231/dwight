import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, loadStoredKeys, saveApiKey } from './config.js';
import { MODELS } from './models.js';
import { clearConversations, clearVerifiedUsers, getTokenCount } from './state.js';
import { drawUI } from './ui.js';
import { setupEmail } from './tools/email/setup.js';

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
  console.log(chalk.yellow('  email   ') + chalk.gray('Configure email integration'));
  console.log(chalk.yellow('  status  ') + chalk.gray('Show current config'));
  console.log(chalk.yellow('  clear   ') + chalk.gray('Clear conversation context'));
  console.log(chalk.yellow('  restart ') + chalk.gray('Restart the bot'));
  console.log(chalk.yellow('  back    ') + chalk.gray('Return to main menu'));
  console.log('');
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

export function handleStatusCommand(config) {
  const currentConfig = loadConfig();
  drawUI(config, 'online');
  console.log(chalk.gray('  Provider:    ') + chalk.yellow(currentConfig.ai?.provider || 'none'));
  console.log(chalk.gray('  Model:       ') + chalk.white(currentConfig.ai?.model || 'none'));
  console.log(chalk.gray('  Context:     ') + chalk.white(getTokenCount().toLocaleString() + ' tokens'));
  console.log(chalk.gray('  Temperature: ') + chalk.white(currentConfig.ai?.temperature ?? 0.7));
  console.log('');
}

export function handleClearCommand(config) {
  clearConversations();
  clearVerifiedUsers();
  drawUI(config, 'online');
}
