#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, resetConfig } from './config.js';
import { displayLogo, showStatus } from './ui.js';
import { startBot } from './bot.js';
import { runOnboarding } from './onboarding.js';

async function showMainMenu() {
  while (true) {
    displayLogo();
    const config = loadConfig();

    if (!config) {
      await runOnboarding();
      continue;
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.cyan('What would you like to do?'),
        choices: [
          { name: '🚀 Start bot', value: 'start' },
          { name: '📊 View status', value: 'status' },
          { name: '⚙️  Reconfigure', value: 'setup' },
          { name: '🗑️  Reset config', value: 'reset' },
          new inquirer.Separator(),
          { name: '👋 Exit', value: 'exit' }
        ]
      }
    ]);

    switch (action) {
      case 'start':
        await startBot(config);
        // When bot stops, loop back to menu
        break;

      case 'status':
        displayLogo();
        showStatus(config);
        console.log('');
        await inquirer.prompt([
          {
            type: 'input',
            name: 'back',
            message: chalk.gray('Press Enter to go back...'),
          }
        ]);
        break;

      case 'setup':
        const { confirmSetup } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmSetup',
            message: chalk.yellow('This will reconfigure your bot. Continue?'),
            default: true
          }
        ]);
        if (confirmSetup) {
          await runOnboarding();
        }
        break;

      case 'reset':
        const { confirmReset } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmReset',
            message: chalk.red('Are you sure you want to reset your configuration?\n') +
              chalk.gray('  This will delete all API keys, passwords, and settings.'),
            default: false
          }
        ]);
        if (confirmReset) {
          resetConfig();
          console.log(chalk.green('\n  ✅ Configuration reset.\n'));
          await new Promise(r => setTimeout(r, 1000));
        }
        break;

      case 'exit':
        console.log(chalk.gray('\n  👋 Goodbye!\n'));
        process.exit(0);
    }
  }
}

async function main() {
  // Global SIGINT handler for Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n' + chalk.gray('👋 Goodbye!'));
    process.exit(0);
  });

  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'start') {
    const config = loadConfig();
    if (!config) {
      console.log(chalk.yellow('⚠️  No configuration found. Running setup first...\n'));
      await runOnboarding();
      return;
    }
    await startBot(config);
  } else if (command === 'status') {
    const config = loadConfig();
    if (!config) {
      console.log(chalk.red('❌ No configuration found. Run setup first.'));
      return;
    }
    displayLogo();
    showStatus(config);
  } else if (command === 'reset') {
    const { confirmReset } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmReset',
        message: chalk.red('Are you sure you want to reset your configuration?'),
        default: false
      }
    ]);
    if (confirmReset) {
      if (resetConfig()) {
        console.log(chalk.green('✅ Configuration reset. Run dwight to set up again.'));
      } else {
        console.log(chalk.yellow('No configuration to reset.'));
      }
    }
  } else {
    // Default: show interactive menu
    await showMainMenu();
  }
}

main().catch(console.error);
