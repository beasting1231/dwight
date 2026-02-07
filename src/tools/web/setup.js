/**
 * Web search setup wizard
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, saveConfig } from '../../config.js';
import { braveSearch } from './client.js';

/**
 * Interactive web search setup
 */
export async function setupWeb() {
  console.log('\n' + chalk.cyan.bold('  Web Search Setup'));
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log(chalk.gray('  Enables Dwight to search the web for'));
  console.log(chalk.gray('  current information and fetch web pages.'));
  console.log('');

  const config = loadConfig() || {};
  const existingKey = config?.web?.braveApiKey;

  if (existingKey) {
    console.log(chalk.green('  ✓ Brave Search API key is configured'));
    console.log('');

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.cyan('What would you like to do?'),
        choices: [
          { name: 'Test connection', value: 'test' },
          { name: 'Update API key', value: 'update' },
          { name: 'Disable web search', value: 'disable' },
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: 'back' },
        ],
      },
    ]);

    if (action === 'back') {
      return false;
    }

    if (action === 'test') {
      await testConnection(existingKey);
      return false;
    }

    if (action === 'disable') {
      config.web = config.web || {};
      config.web.enabled = false;
      config.web.braveApiKey = null;
      saveConfig(config);
      console.log(chalk.yellow('\n  Web search has been disabled.\n'));
      return true;
    }

    // Continue to update key
  }

  // Get API key instructions
  console.log(chalk.white.bold('  How to get a Brave Search API key:\n'));
  console.log(chalk.gray('  1. Go to ') + chalk.cyan('https://brave.com/search/api/'));
  console.log(chalk.gray('  2. Sign up for a free account'));
  console.log(chalk.gray('  3. Create an API key'));
  console.log(chalk.gray('  4. Copy the API key and paste below'));
  console.log('');
  console.log(chalk.gray('  Free tier: 2,000 queries/month'));
  console.log(chalk.gray('  Cost: $0.005 per query after free tier'));
  console.log('');

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: chalk.cyan('Enter Brave Search API key:'),
      mask: '*',
      validate: input => {
        if (!input || !input.trim()) {
          return 'API key is required';
        }
        return true;
      },
    },
  ]);

  if (!apiKey || !apiKey.trim()) {
    console.log(chalk.yellow('  Cancelled.\n'));
    return false;
  }

  // Test the API key
  console.log(chalk.gray('\n  Testing API key...'));

  const testResult = await testConnection(apiKey.trim());
  if (!testResult) {
    const { retry } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: chalk.yellow('Would you like to try a different key?'),
        default: true,
      },
    ]);

    if (retry) {
      return setupWeb();
    }
    return false;
  }

  // Save configuration
  config.web = config.web || {};
  config.web.enabled = true;
  config.web.braveApiKey = apiKey.trim();
  saveConfig(config);

  console.log(chalk.green('\n  ✅ Web search is now enabled!'));
  console.log(chalk.gray('  Dwight can now search the web and fetch pages.\n'));

  return true;
}

/**
 * Test Brave Search API connection
 */
async function testConnection(apiKey) {
  try {
    const result = await braveSearch({
      query: 'test search',
      apiKey,
      count: 1,
    });

    if (result.results && result.results.length > 0) {
      console.log(chalk.green('  ✓ API key is valid'));
      console.log(chalk.gray(`  Found ${result.totalResults} result(s) for test query\n`));
      return true;
    } else {
      console.log(chalk.yellow('  ⚠ API key works but returned no results'));
      return true;
    }
  } catch (error) {
    console.log(chalk.red('  ✗ ' + error.message));
    return false;
  }
}
