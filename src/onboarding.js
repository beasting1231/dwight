import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import { saveConfig } from './config.js';
import { MODELS } from './models.js';
import { accentGradient, sleep } from './ui.js';
import { startBot } from './bot.js';

export async function runOnboarding() {
  // Step 1: Welcome
  console.log(boxen(
    chalk.white('Welcome to ') + chalk.bold.cyan('Dwight') + chalk.white('!\n\n') +
    chalk.gray('Let\'s get you set up with your AI-powered Telegram bot.\n\n') +
    chalk.gray('Required:\n') +
    chalk.white('  • ') + chalk.gray('A Telegram bot token from ') + chalk.underline.blue('@BotFather') + '\n\n' +
    chalk.gray('Optional (configure now or later via Telegram):\n') +
    chalk.white('  • ') + chalk.gray('AI provider API key\n') +
    chalk.white('  • ') + chalk.gray('Email, calendar, web search, image generation'),
    {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: 'cyan'
    }
  ));

  // Step 2: Telegram Setup
  console.log(chalk.bold.white('\n  📱 TELEGRAM SETUP\n'));

  const telegramAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'botToken',
      message: chalk.cyan('Enter your Telegram Bot Token:'),
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'Bot token is required';
        }
        if (!input.includes(':')) {
          return 'Invalid format. Get one from @BotFather on Telegram';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'botName',
      message: chalk.cyan('Give your bot a friendly name:'),
      default: 'Dwight'
    },
    {
      type: 'input',
      name: 'allowedPhones',
      message: chalk.cyan('Allowed phone numbers (comma-separated, empty = all):'),
      default: ''
    }
  ]);

  // Step 3: AI Provider Selection (Optional)
  console.log(chalk.bold.white('\n  🧠 AI PROVIDER SETUP\n'));
  console.log(chalk.gray('  You can configure this now or later via Telegram commands.\n'));

  const { configureAI } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'configureAI',
      message: chalk.cyan('Configure AI provider now?'),
      default: false
    }
  ]);

  let aiProvider = 'none';

  if (configureAI) {
    const aiProviderAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'aiProvider',
        message: chalk.cyan('Select your AI provider:'),
        choices: [
          {
            name: `${chalk.bold('OpenRouter')} ${chalk.gray('- Access 400+ models (Gemini, Claude, GPT, etc)')}`,
            value: 'openrouter'
          },
          {
            name: `${chalk.bold('Anthropic Claude')} ${chalk.gray('- Direct API access to Claude models')}`,
            value: 'anthropic'
          }
        ]
      }
    ]);
    aiProvider = aiProviderAnswer.aiProvider;
  }

  let aiConfig = { provider: aiProvider };

  if (aiProvider !== 'none') {
    // Show provider-specific info
    if (aiProvider === 'anthropic') {
      console.log(boxen(
        chalk.gray('Get your API key at: ') + chalk.underline.blue('https://console.anthropic.com/settings/keys'),
        { padding: { top: 0, bottom: 0, left: 1, right: 1 }, borderStyle: 'round', borderColor: 'gray' }
      ));
    } else if (aiProvider === 'openrouter') {
      console.log(boxen(
        chalk.gray('Get your API key at: ') + chalk.underline.blue('https://openrouter.ai/keys'),
        { padding: { top: 0, bottom: 0, left: 1, right: 1 }, borderStyle: 'round', borderColor: 'gray' }
      ));
    }

    // API Key
    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: chalk.cyan(`Enter your ${aiProvider === 'anthropic' ? 'Anthropic' : 'OpenRouter'} API key:`),
        mask: '*',
        validate: (input) => input.trim().length > 0 || 'API key is required'
      }
    ]);

    aiConfig.apiKey = apiKey;

    // Model Selection
    const modelChoices = MODELS[aiProvider].map(m => ({
      name: `${m.name} ${chalk.gray(`[${m.pricing}]`)}`,
      value: m.value
    }));

    const { model } = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: chalk.cyan('Select your AI model:'),
        choices: modelChoices,
        pageSize: 12
      }
    ]);

    aiConfig.model = model;

    // Advanced options
    const { configureAdvanced } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configureAdvanced',
        message: chalk.gray('Configure advanced options (temperature, max tokens)?'),
        default: false
      }
    ]);

    if (configureAdvanced) {
      const advancedAnswers = await inquirer.prompt([
        {
          type: 'number',
          name: 'temperature',
          message: chalk.cyan('Temperature (0.0-1.0, lower = more focused):'),
          default: 0.7,
          validate: (input) => (input >= 0 && input <= 1) || 'Must be between 0 and 1'
        },
        {
          type: 'number',
          name: 'maxTokens',
          message: chalk.cyan('Max output tokens:'),
          default: 4096
        },
        {
          type: 'input',
          name: 'systemPrompt',
          message: chalk.cyan('System prompt (personality/instructions):'),
          default: 'You are Dwight, a helpful AI assistant on Telegram. Be concise and friendly.'
        }
      ]);

      aiConfig.temperature = advancedAnswers.temperature;
      aiConfig.maxTokens = advancedAnswers.maxTokens;
      aiConfig.systemPrompt = advancedAnswers.systemPrompt;
    } else {
      aiConfig.temperature = 0.7;
      aiConfig.maxTokens = 4096;
      aiConfig.systemPrompt = 'You are Dwight, a helpful AI assistant on Telegram. Be concise and friendly.';
    }
  }

  // Save configuration
  console.log('\n');
  const spinner = ora({
    text: chalk.cyan('Saving configuration...'),
    spinner: 'dots12'
  }).start();

  await sleep(800);

  // Build apiKeys storage
  const apiKeys = {};
  if (aiProvider !== 'none' && aiConfig.apiKey) {
    apiKeys[aiProvider] = aiConfig.apiKey;
  }

  const config = {
    telegram: {
      token: telegramAnswers.botToken,
      name: telegramAnswers.botName,
      allowedPhones: telegramAnswers.allowedPhones
        ? telegramAnswers.allowedPhones.split(',').map(p => p.trim().replace(/[^0-9+]/g, '')).filter(Boolean)
        : []
    },
    ai: aiConfig,
    apiKeys: apiKeys,
    createdAt: new Date().toISOString()
  };

  saveConfig(config);
  spinner.succeed(chalk.green('Configuration saved!'));

  await sleep(400);

  // Summary
  const modelName = aiConfig.model || 'Not configured';
  console.log('\n');
  console.log(boxen(
    accentGradient('✨ Setup Complete! ✨') + '\n\n' +
    chalk.gray('Bot Name:    ') + chalk.cyan(telegramAnswers.botName) + '\n' +
    chalk.gray('Provider:    ') + chalk.yellow(aiProvider === 'none' ? 'Not configured' : aiProvider) + '\n' +
    chalk.gray('Model:       ') + chalk.white(modelName),
    {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: 'double',
      borderColor: 'green'
    }
  ));

  // Auto-start bot
  await sleep(500);
  if (aiProvider === 'none') {
    console.log(chalk.yellow('\n  ⚠️  No AI provider configured yet.'));
    console.log(chalk.gray('  Use Telegram commands to configure:\n'));
    console.log(chalk.white('    /api') + chalk.gray(' - Configure AI provider'));
    console.log(chalk.white('    /model') + chalk.gray(' - Select AI model'));
    console.log(chalk.white('    /email') + chalk.gray(' - Setup email integration'));
    console.log(chalk.white('    /help') + chalk.gray(' - See all commands\n'));
  }
  console.log(chalk.cyan('\n  Starting bot...\n'));
  await startBot(config);
}
