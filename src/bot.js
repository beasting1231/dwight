import chalk from 'chalk';
import readline from 'readline';
import TelegramBot from 'node-telegram-bot-api';
import { loadConfig, saveVerifiedUser } from './config.js';
import { getModelShortName } from './models.js';
import {
  conversations,
  verifiedUsers,
  loadVerifiedUsers,
  incrementProcessing,
  decrementProcessing,
  getProcessingCount
} from './state.js';
import { getAIResponse } from './ai.js';
import { drawUI, sleep } from './ui.js';
import {
  handleApiCommand,
  handleModelCommand,
  handleHelpCommand,
  handleStatusCommand,
  handleClearCommand,
  handleEmailCommand
} from './cli.js';
import { initializeTools, cleanupTools } from './tools/index.js';

export async function startBot(config) {
  // Check AI config
  if (!config.ai?.apiKey || config.ai.provider === 'none') {
    console.log(chalk.red('❌ No AI provider configured. Run setup first.'));
    return;
  }

  // Load previously verified users
  loadVerifiedUsers();

  drawUI(config, 'connecting');

  let bot;
  try {
    bot = new TelegramBot(config.telegram.token, { polling: true });
  } catch (error) {
    drawUI(config, 'error');
    console.log(chalk.red('  Failed to connect: ' + error.message));
    return;
  }

  drawUI(config, 'online');

  // Handle /start command
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `👋 Hello! I'm ${config.telegram.name}, your AI assistant powered by ${getModelShortName(config.ai.model)}.\n\nJust send me a message and I'll respond!`);
  });

  // Handle /clear command to reset conversation
  bot.onText(/\/clear/, (msg) => {
    const chatId = msg.chat.id;
    conversations.delete(chatId);
    bot.sendMessage(chatId, '🗑️ Conversation cleared! Starting fresh.');
  });

  // Handle contact sharing for phone verification
  bot.on('contact', (msg) => {
    const chatId = msg.chat.id;
    const sharedPhone = msg.contact.phone_number.replace(/[^0-9+]/g, '');

    // Check if this is the user's own contact
    if (msg.contact.user_id !== msg.from.id) {
      bot.sendMessage(chatId, '⚠️ Please share your own contact, not someone else\'s.');
      return;
    }

    const allowedPhones = config.telegram.allowedPhones || [];
    const isAllowed = allowedPhones.some(p => {
      const normalized = p.replace(/[^0-9]/g, '');
      const sharedNormalized = sharedPhone.replace(/[^0-9]/g, '');
      return sharedNormalized.endsWith(normalized) || normalized.endsWith(sharedNormalized);
    });

    if (isAllowed) {
      verifiedUsers.set(chatId, sharedPhone);
      saveVerifiedUser(chatId, sharedPhone);
      bot.sendMessage(chatId, `✅ Phone verified! You can now chat with me.`, {
        reply_markup: { remove_keyboard: true }
      });
    } else {
      bot.sendMessage(chatId, '⛔ Sorry, your phone number is not authorized to use this bot.', {
        reply_markup: { remove_keyboard: true }
      });
    }
  });

  // Handle all other messages
  bot.on('message', async (msg) => {
    // Skip commands and contacts
    if (msg.text?.startsWith('/')) return;
    if (msg.contact) return;

    const chatId = msg.chat.id;

    // Check phone restrictions
    const allowedPhones = config.telegram.allowedPhones || [];
    if (allowedPhones.length > 0 && !verifiedUsers.has(chatId)) {
      bot.sendMessage(chatId, '📱 Please share your phone number to verify access:', {
        reply_markup: {
          keyboard: [[{ text: '📞 Share Phone Number', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return;
    }

    const userMessage = msg.text;
    if (!userMessage) return;

    // Show typing indicator
    bot.sendChatAction(chatId, 'typing');

    // Update UI to processing
    incrementProcessing();
    drawUI(config, 'processing');

    try {
      const response = await getAIResponse(config, chatId, userMessage);

      // Send response (split if too long)
      if (response.length > 4096) {
        const chunks = response.match(/.{1,4096}/gs) || [];
        for (const chunk of chunks) {
          await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' }).catch(() => {
            bot.sendMessage(chatId, chunk);
          });
        }
      } else {
        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' }).catch(() => {
          bot.sendMessage(chatId, response);
        });
      }
    } catch (error) {
      bot.sendMessage(chatId, `❌ Sorry, I encountered an error: ${error.message}`);
    }

    // Update UI back to online
    decrementProcessing();
    drawUI(config, getProcessingCount() > 0 ? 'processing' : 'online');
  });

  // Handle polling errors silently
  bot.on('polling_error', () => {});

  // CLI command interface - wrapped in Promise to allow returning to menu
  await new Promise((resolve) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptCommand = () => {
    rl.question(chalk.cyan('  > '), async (input) => {
      const cmd = input.trim().toLowerCase();

      switch (cmd) {
        case 'api':
          const apiChanged = await handleApiCommand(config, rl);
          if (apiChanged) {
            bot.stopPolling();
            rl.close();
            await sleep(300);
            await startBot(loadConfig());
            return;
          }
          drawUI(config, 'online');
          break;

        case 'model':
          const modelChanged = await handleModelCommand(config, rl);
          if (modelChanged) {
            bot.stopPolling();
            rl.close();
            await sleep(300);
            await startBot(loadConfig());
            return;
          }
          drawUI(config, 'online');
          break;

        case 'restart':
          bot.stopPolling();
          rl.close();
          await sleep(300);
          await startBot(loadConfig());
          return;

        case 'email':
          const emailChanged = await handleEmailCommand(config, rl);
          if (emailChanged) {
            bot.stopPolling();
            rl.close();
            await sleep(300);
            await startBot(loadConfig());
            return;
          }
          drawUI(config, 'online');
          break;

        case 'clear':
          handleClearCommand(config);
          break;

        case 'status':
          handleStatusCommand(config);
          break;

        case 'help':
        case '?':
          handleHelpCommand(config);
          break;

        case 'quit':
        case 'exit':
        case 'back':
          bot.stopPolling();
          rl.close();
          resolve(); // Return to main menu
          return;

        case '':
          break;

        default:
          drawUI(config, 'online');
          console.log(chalk.gray('  Unknown command. Type ') + chalk.yellow('help') + chalk.gray(' for commands.\n'));
      }

      promptCommand();
    });
  };

  promptCommand();
  });
}
