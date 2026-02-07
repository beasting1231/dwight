#!/usr/bin/env node

/**
 * Email Watcher Script
 *
 * This script checks for new emails and sends Telegram notifications.
 * Can be run via cron job or triggered by email webhooks.
 *
 * Usage:
 *   node scripts/email-watcher.js           # Check for new emails
 *   node scripts/email-watcher.js --daemon  # Run continuously (checks every 2 min)
 *
 * Cron example (check every 5 minutes):
 *   */5 * * * * cd /path/to/dwight && node scripts/email-watcher.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ImapFlow } from 'imapflow';
import TelegramBot from 'node-telegram-bot-api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const STATE_PATH = path.join(__dirname, '..', '.email-watcher-state.json');

// Load config
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) {
    console.error('Failed to load config:', e.message);
    process.exit(1);
  }
}

// Load/save watcher state (tracks last seen UID)
function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch (e) {
    // Ignore
  }
  return { lastUid: 0 };
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// Format email for Telegram notification
function formatEmailNotification(email) {
  const from = email.from?.address || email.from?.name || 'Unknown';
  const subject = email.subject || '(No Subject)';
  const date = email.date ? new Date(email.date).toLocaleString() : '';

  return `📬 *New Email*\n\n` +
    `*From:* ${escapeMarkdown(from)}\n` +
    `*Subject:* ${escapeMarkdown(subject)}\n` +
    `*Date:* ${date}`;
}

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Check for new emails
async function checkNewEmails(config) {
  const emailConfig = config.email;

  if (!emailConfig?.enabled) {
    console.log('Email not configured');
    return [];
  }

  // Get IMAP config
  const imapConfig = {
    host: emailConfig.imap?.host || getDefaultHost(emailConfig.provider, 'imap'),
    port: emailConfig.imap?.port || 993,
    secure: emailConfig.imap?.secure !== false,
    auth: {
      user: emailConfig.email,
      pass: emailConfig.password,
    },
    logger: false,
  };

  const client = new ImapFlow(imapConfig);
  const newEmails = [];
  const state = loadState();

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Search for unseen emails
      const uids = await client.search({ seen: false }, { uid: true });

      // Filter for emails newer than last seen
      const newUids = uids.filter(uid => uid > state.lastUid);

      for (const uid of newUids) {
        const message = await client.fetchOne(uid, {
          uid: true,
          envelope: true,
        }, { uid: true });

        if (message) {
          newEmails.push({
            uid: message.uid,
            subject: message.envelope?.subject || '(No Subject)',
            from: message.envelope?.from?.[0] || {},
            date: message.envelope?.date,
          });
        }
      }

      // Update state with highest UID
      if (uids.length > 0) {
        state.lastUid = Math.max(...uids);
        saveState(state);
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    console.error('IMAP error:', error.message);
    try {
      await client.logout();
    } catch (e) {
      // Ignore
    }
  }

  return newEmails;
}

function getDefaultHost(provider, type) {
  const hosts = {
    gmail: { imap: 'imap.gmail.com', smtp: 'smtp.gmail.com' },
    outlook: { imap: 'outlook.office365.com', smtp: 'smtp.office365.com' },
    yahoo: { imap: 'imap.mail.yahoo.com', smtp: 'smtp.mail.yahoo.com' },
  };
  return hosts[provider]?.[type] || '';
}

// Send Telegram notifications
async function sendNotifications(config, emails) {
  if (emails.length === 0) return;

  const bot = new TelegramBot(config.telegram.token);

  // Find the chat ID to send to
  // Use the first verified user or the configured notification chat
  const chatId = config.email?.notificationChatId ||
    Object.keys(config.verifiedUsers || {})[0];

  if (!chatId) {
    console.log('No chat ID configured for notifications');
    return;
  }

  for (const email of emails) {
    try {
      const message = formatEmailNotification(email);
      await bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
      console.log(`Notified about email: ${email.subject}`);
    } catch (error) {
      console.error(`Failed to send notification: ${error.message}`);
      // Try without markdown if it fails
      try {
        const plainMessage = `📬 New Email\n\nFrom: ${email.from?.address || 'Unknown'}\nSubject: ${email.subject}`;
        await bot.sendMessage(chatId, plainMessage);
      } catch (e) {
        // Ignore
      }
    }
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const isDaemon = args.includes('--daemon');
  const config = loadConfig();

  console.log('Email Watcher started');

  const check = async () => {
    console.log(`[${new Date().toISOString()}] Checking for new emails...`);
    const newEmails = await checkNewEmails(config);

    if (newEmails.length > 0) {
      console.log(`Found ${newEmails.length} new email(s)`);
      await sendNotifications(config, newEmails);
    } else {
      console.log('No new emails');
    }
  };

  if (isDaemon) {
    // Run continuously
    const interval = parseInt(process.env.CHECK_INTERVAL) || 120000; // Default 2 minutes
    console.log(`Running in daemon mode (checking every ${interval / 60000} min)`);

    await check();
    setInterval(check, interval);
  } else {
    // Single check
    await check();
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
