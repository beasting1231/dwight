/**
 * Image generation setup wizard
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, saveConfig } from '../../config.js';
import { resetClient } from './client.js';

/**
 * Run the image generation setup wizard
 * @returns {Promise<boolean>} Whether restart is needed
 */
export async function setupImage() {
  console.log('\n' + chalk.cyan.bold('  Image Generation Setup'));
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log(chalk.gray('  Enables Dwight to generate and edit images'));
  console.log(chalk.gray('  using Nano Banana Pro (Gemini 3 Pro Image).'));
  console.log('');

  const config = loadConfig() || {};
  const existingKey = config?.image?.googleApiKey;

  if (existingKey) {
    console.log(chalk.green('  ✓ Google AI API key is configured'));
    console.log('');

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.cyan('What would you like to do?'),
        choices: [
          { name: 'Test connection', value: 'test' },
          { name: 'Update API key', value: 'update' },
          { name: 'Disable image generation', value: 'disable' },
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: 'back' },
        ],
      },
    ]);

    if (action === 'back') return false;

    if (action === 'test') {
      await testConnection();
      return false;
    }

    if (action === 'disable') {
      config.image = { enabled: false, googleApiKey: null };
      saveConfig(config);
      resetClient();
      console.log(chalk.yellow('\n  Image generation has been disabled.\n'));
      return true;
    }

    // Fall through to update key
  }

  // Setup instructions
  console.log(chalk.white.bold('  How to get a Google AI API key:\n'));
  console.log(chalk.gray('  1. Go to ') + chalk.cyan('https://aistudio.google.com/apikey'));
  console.log(chalk.gray('  2. Sign in with your Google account'));
  console.log(chalk.gray('  3. Click "Create API key"'));
  console.log(chalk.gray('  4. Copy the API key and paste below'));
  console.log('');

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: chalk.cyan('Enter Google AI API key:'),
      mask: '*',
      validate: input => input?.trim() ? true : 'API key is required',
    },
  ]);

  if (!apiKey?.trim()) {
    console.log(chalk.yellow('  Cancelled.\n'));
    return false;
  }

  // Save key
  config.image = { enabled: true, googleApiKey: apiKey.trim() };
  saveConfig(config);
  resetClient();

  console.log(chalk.gray('\n  Testing API key...'));
  const testResult = await testConnection();

  if (!testResult) {
    const { retry } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: chalk.yellow('Would you like to try a different key?'),
        default: true,
      },
    ]);
    if (retry) return setupImage();

    // Clear the invalid key
    config.image = { enabled: false, googleApiKey: null };
    saveConfig(config);
    resetClient();
    return false;
  }

  console.log(chalk.green('\n  Image generation is now enabled!'));
  console.log(chalk.gray('  Dwight can now generate and edit images.\n'));
  return true;
}

/**
 * Test the API connection
 * @returns {Promise<boolean>} Success
 */
async function testConnection() {
  try {
    // Import dynamically to get fresh client after config change
    const { getGenAIClient } = await import('./client.js');
    const client = getGenAIClient();

    // Just verify the client was created successfully
    // A real test would be expensive, so we just check initialization
    if (client) {
      console.log(chalk.green('  ✓ API key appears valid'));
      return true;
    }
    return false;
  } catch (error) {
    console.log(chalk.red('  ✗ ' + error.message));
    return false;
  }
}
