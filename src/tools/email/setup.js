import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadConfig, saveConfig } from '../../config.js';
import { connectImap, createSmtpTransport, verifySmtp, disconnectImap, getImapConfig, getSmtpConfig, initResend } from './client.js';

/**
 * Run email setup wizard
 */
export async function setupEmail() {
  console.log(chalk.bold.white('\n  📧 EMAIL SETUP\n'));

  // Provider selection
  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: chalk.cyan('Select your email provider:'),
      choices: [
        { name: 'Gmail (Google)', value: 'gmail' },
        { name: 'Outlook / Microsoft 365', value: 'outlook' },
        { name: 'Yahoo Mail', value: 'yahoo' },
        { name: 'Custom IMAP/SMTP', value: 'custom' },
        new inquirer.Separator(),
        { name: chalk.gray('← Cancel'), value: 'cancel' },
      ],
    },
  ]);

  if (provider === 'cancel') {
    return false;
  }

  // Ask about Resend for sending (useful when SMTP is blocked)
  const { useResend } = await inquirer.prompt([
    {
      type: 'list',
      name: 'useResend',
      message: chalk.cyan('How do you want to send emails?'),
      choices: [
        { name: `Use ${provider} SMTP (default)`, value: false },
        { name: 'Use Resend API (if SMTP is blocked)', value: true },
      ],
    },
  ]);

  let resendApiKey = null;
  let resendFromEmail = null;
  if (useResend) {
    console.log(chalk.gray('\n  Get your API key at: https://resend.com/api-keys\n'));
    const resendCreds = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: chalk.cyan('Resend API Key:'),
        mask: '*',
        validate: (input) => input.startsWith('re_') || 'API key should start with re_',
      },
      {
        type: 'input',
        name: 'fromEmail',
        message: chalk.cyan('Send from email (e.g. you@yourdomain.com or onboarding@resend.dev):'),
        validate: (input) => input.includes('@') || 'Enter a valid email',
      },
    ]);
    resendApiKey = resendCreds.apiKey;
    resendFromEmail = resendCreds.fromEmail;
  }

  // Email and password
  const credentials = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: chalk.cyan('Email address:'),
      validate: (input) => {
        if (!input.includes('@')) {
          return 'Please enter a valid email address';
        }
        return true;
      },
    },
    {
      type: 'password',
      name: 'password',
      message: chalk.cyan(provider === 'gmail'
        ? 'App Password (not your regular password):'
        : 'Password or App Password:'),
      mask: '*',
      validate: (input) => input.length > 0 || 'Password is required',
      filter: (input) => {
        // Remove spaces from app passwords (Google gives them with spaces like "xxxx xxxx xxxx xxxx")
        if (provider === 'gmail') {
          return input.replace(/\s/g, '');
        }
        return input;
      },
    },
  ]);

  // Custom server settings
  let imapSettings = {};
  let smtpSettings = {};

  if (provider === 'custom') {
    console.log(chalk.gray('\n  IMAP Settings (for receiving):'));
    imapSettings = await inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: chalk.cyan('IMAP Host:'),
        validate: (input) => input.length > 0 || 'Host is required',
      },
      {
        type: 'number',
        name: 'port',
        message: chalk.cyan('IMAP Port:'),
        default: 993,
      },
      {
        type: 'confirm',
        name: 'secure',
        message: chalk.cyan('Use SSL/TLS?'),
        default: true,
      },
    ]);

    console.log(chalk.gray('\n  SMTP Settings (for sending):'));
    smtpSettings = await inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: chalk.cyan('SMTP Host:'),
        validate: (input) => input.length > 0 || 'Host is required',
      },
      {
        type: 'number',
        name: 'port',
        message: chalk.cyan('SMTP Port:'),
        default: 587,
      },
      {
        type: 'confirm',
        name: 'secure',
        message: chalk.cyan('Use SSL/TLS?'),
        default: false,
      },
    ]);
  }

  // Test connection
  const spinner = ora(chalk.cyan('Testing email connection...')).start();

  try {
    // Test IMAP
    const imapConfig = provider === 'custom'
      ? {
          host: imapSettings.host,
          port: imapSettings.port,
          secure: imapSettings.secure,
          auth: { user: credentials.email, pass: credentials.password },
          logger: false,
        }
      : getImapConfig(provider, credentials.email, credentials.password);

    await connectImap(imapConfig);

    if (useResend) {
      spinner.text = chalk.cyan('IMAP connected, testing Resend...');
      initResend(resendApiKey);
      // Resend doesn't have a verify method, but if API key is invalid it will fail on send
      spinner.succeed(chalk.green('Email connection successful! (Resend will be used for sending)'));
    } else {
      spinner.text = chalk.cyan('IMAP connected, testing SMTP...');

      // Test SMTP
      const smtpConfig = provider === 'custom'
        ? {
            host: smtpSettings.host,
            port: smtpSettings.port,
            secure: smtpSettings.secure,
            auth: { user: credentials.email, pass: credentials.password },
          }
        : getSmtpConfig(provider, credentials.email, credentials.password);

      createSmtpTransport(smtpConfig);
      await verifySmtp();

      spinner.succeed(chalk.green('Email connection successful!'));
    }

    // Disconnect test connection
    await disconnectImap();
  } catch (error) {
    spinner.fail(chalk.red('Connection failed: ' + error.message));

    if (provider === 'gmail') {
      console.log(chalk.yellow('\n  💡 For Gmail, you need to use an App Password:'));
      console.log(chalk.gray('     1. Go to myaccount.google.com/apppasswords'));
      console.log(chalk.gray('     2. Generate a new App Password for "Mail"'));
      console.log(chalk.gray('     3. Use that 16-character password here\n'));
    }

    const { retry } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: chalk.cyan('Try again?'),
        default: true,
      },
    ]);

    if (retry) {
      return setupEmail();
    }
    return false;
  }

  // Save configuration
  const config = loadConfig() || {};
  config.email = {
    enabled: true,
    provider,
    email: credentials.email,
    password: credentials.password,
    imap: provider === 'custom' ? imapSettings : {},
    smtp: provider === 'custom' ? smtpSettings : {},
    resend: useResend ? {
      apiKey: resendApiKey,
      fromEmail: resendFromEmail,
    } : null,
  };

  saveConfig(config);
  console.log(chalk.green('\n  ✅ Email configured successfully!\n'));

  // Ask about notifications
  const { enableNotifications } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enableNotifications',
      message: chalk.cyan('Enable Telegram notifications for new emails?'),
      default: true,
    },
  ]);

  if (enableNotifications) {
    console.log(chalk.gray('\n  To receive notifications, run:'));
    console.log(chalk.white('    node scripts/email-watcher.js --daemon'));
    console.log(chalk.gray('\n  Or set up a cron job:'));
    console.log(chalk.white('    */5 * * * * cd /path/to/dwight && node scripts/email-watcher.js\n'));
  }

  return true;
}
