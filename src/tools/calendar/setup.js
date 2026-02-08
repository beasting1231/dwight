/**
 * Google Calendar setup wizard
 * Guides user through OAuth2 authentication
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, saveConfig } from '../../config.js';
import { getAuthorizationUrl, exchangeCodeForTokens, saveCalendarTokens } from './oauth.js';
import { listEvents } from './client.js';

/**
 * Interactive calendar setup
 */
export async function setupCalendar() {
  console.log('\n' + chalk.cyan.bold('  Google Calendar Setup'));
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log(chalk.gray('  Enables Dwight to manage your Google'));
  console.log(chalk.gray('  Calendar - list, create, update, delete.'));
  console.log('');

  const config = loadConfig() || {};
  const existingConfig = config?.calendar;

  if (existingConfig?.enabled && existingConfig?.tokens?.access_token) {
    console.log(chalk.green('  ✓ Google Calendar is configured'));
    console.log('');

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.cyan('What would you like to do?'),
        choices: [
          { name: 'Test connection', value: 'test' },
          { name: 'Re-authenticate', value: 'reauth' },
          { name: 'Disable calendar', value: 'disable' },
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: 'back' },
        ],
      },
    ]);

    if (action === 'back') {
      return false;
    }

    if (action === 'test') {
      await testConnection();
      return false;
    }

    if (action === 'disable') {
      config.calendar = { enabled: false };
      saveConfig(config);
      console.log(chalk.yellow('\n  Calendar integration has been disabled.\n'));
      return true;
    }

    // Continue to re-authenticate
  }

  // Show setup instructions
  console.log(chalk.white.bold('  How to set up Google Calendar:\n'));
  console.log(chalk.gray('  1. Go to ') + chalk.cyan('https://console.cloud.google.com'));
  console.log(chalk.gray('  2. Create a new project (or select existing)'));
  console.log(chalk.gray('  3. Enable the "Google Calendar API"'));
  console.log(chalk.gray('  4. Configure OAuth consent screen (External, add your email as test user)'));
  console.log(chalk.gray('  5. Go to "Credentials" → "Create Credentials" → "OAuth client ID"'));
  console.log(chalk.gray('  6. Application type: ') + chalk.white('"Web application"'));
  console.log(chalk.gray('  7. Add authorized redirect URI:'));
  console.log(chalk.cyan('     http://localhost:8085/oauth/callback'));
  console.log(chalk.gray('  8. Copy the Client ID and Client Secret'));
  console.log('');

  // Get Client ID
  const { clientId } = await inquirer.prompt([
    {
      type: 'input',
      name: 'clientId',
      message: chalk.cyan('Enter Client ID:'),
      validate: input => {
        if (!input || !input.trim()) {
          return 'Client ID is required';
        }
        if (!input.includes('.apps.googleusercontent.com')) {
          return 'Invalid Client ID format. Should end with .apps.googleusercontent.com';
        }
        return true;
      },
    },
  ]);

  if (!clientId || !clientId.trim()) {
    console.log(chalk.yellow('  Cancelled.\n'));
    return false;
  }

  // Get Client Secret
  const { clientSecret } = await inquirer.prompt([
    {
      type: 'password',
      name: 'clientSecret',
      message: chalk.cyan('Enter Client Secret:'),
      mask: '*',
      validate: input => {
        if (!input || !input.trim()) {
          return 'Client Secret is required';
        }
        return true;
      },
    },
  ]);

  if (!clientSecret || !clientSecret.trim()) {
    console.log(chalk.yellow('  Cancelled.\n'));
    return false;
  }

  // Generate authorization URL
  const authUrl = getAuthorizationUrl(clientId.trim());

  console.log('');
  console.log(chalk.white.bold('  Step 2: Authorize access'));
  console.log('');
  console.log(chalk.gray('  Open this URL in your browser:'));
  console.log('');
  console.log(chalk.cyan('  ' + authUrl));
  console.log('');
  console.log(chalk.gray('  After authorizing, you\'ll be redirected to a page that may not load.'));
  console.log(chalk.gray('  Copy the ENTIRE URL from your browser\'s address bar and paste it below.'));
  console.log(chalk.gray('  (It will look like: http://localhost:8085/oauth/callback?code=...)'));
  console.log('');

  // Ask user to paste the redirect URL or code
  const { authInput } = await inquirer.prompt([
    {
      type: 'input',
      name: 'authInput',
      message: chalk.cyan('Paste the redirect URL or code:'),
      validate: input => {
        if (!input || !input.trim()) {
          return 'Please paste the redirect URL or authorization code';
        }
        return true;
      },
    },
  ]);

  // Extract code from URL or use directly
  let authCode;
  if (authInput.includes('code=')) {
    const url = new URL(authInput.replace('#', '?')); // Handle hash fragments
    authCode = url.searchParams.get('code');
  } else {
    authCode = authInput.trim();
  }

  if (!authCode) {
    console.log(chalk.red('  ✗ Could not extract authorization code'));
    return false;
  }

  // Exchange code for tokens
  console.log(chalk.gray('  Exchanging code for tokens...'));

  try {
    const tokens = await exchangeCodeForTokens(
      authCode,
      clientId.trim(),
      clientSecret.trim()
    );

    // Save tokens
    saveCalendarTokens(tokens, clientId.trim(), clientSecret.trim());

    console.log(chalk.green('  ✓ Authentication successful!'));

    // Test the connection
    await testConnection();

    console.log(chalk.green('\n  ✅ Google Calendar is now enabled!'));
    console.log(chalk.gray('  Dwight can now manage your calendar.\n'));

    return true;
  } catch (error) {
    console.log(chalk.red('  ✗ ' + error.message));
    console.log('');

    const { retry } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: chalk.yellow('Would you like to try again?'),
        default: true,
      },
    ]);

    if (retry) {
      return setupCalendar();
    }
    return false;
  }
}

/**
 * Test calendar connection by listing events
 */
async function testConnection() {
  try {
    console.log(chalk.gray('\n  Testing connection...'));

    const response = await listEvents({ maxResults: 3 });
    const events = response.items || [];

    console.log(chalk.green('  ✓ Connection successful!'));

    if (events.length > 0) {
      console.log(chalk.gray(`  Found ${events.length} upcoming event(s):`));
      events.forEach(event => {
        const start = event.start?.dateTime || event.start?.date;
        const date = new Date(start).toLocaleDateString();
        console.log(chalk.white(`    • ${event.summary} `) + chalk.gray(`(${date})`));
      });
    } else {
      console.log(chalk.gray('  No upcoming events found.'));
    }
    console.log('');
    return true;
  } catch (error) {
    console.log(chalk.red('  ✗ Connection failed: ' + error.message));
    console.log('');
    return false;
  }
}

