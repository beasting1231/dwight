// Suppress node-telegram-bot-api deprecation warnings
process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;

import chalk from 'chalk';
import readline from 'readline';
import TelegramBot from 'node-telegram-bot-api';
import { loadConfig, saveVerifiedUser } from './config.js';
import { getModelShortName, supportsVision } from './models.js';
import { transcribeBuffer, isWhisperAvailable } from './whisper.js';
import {
  conversations,
  verifiedUsers,
  loadVerifiedUsers,
  incrementProcessing,
  decrementProcessing,
  getProcessingCount,
  getAndClearNotifications,
  getAndClearPhotoNotifications,
  getChatsWithPendingPhotos,
  getRunningTasks,
  addToolLog,
  clearToolLog,
  checkAndClearReload,
  markPendingEmailConfirmable,
  confirmPendingBashCommand,
  getClaudeSessionsForChat,
  removeClaudeSession,
} from './state.js';
import { getAIResponse } from './ai.js';
import { drawUI, sleep, updateSpinner } from './ui.js';
import {
  handleApiCommand,
  handleModelCommand,
  handleModeCommand,
  handleHelpCommand,
  handleStatusCommand,
  handleClearCommand,
  handleEmailCommand,
  handleWebCommand,
  handleImageCommand,
  handleCalendarCommand,
  handleLogsCommand,
  handleCronCommand
} from './cli.js';
import { initializeTools, cleanupTools, startScheduler, stopScheduler, getSchedulerStatus } from './tools/index.js';
import { formatPattern } from './tools/cron/patterns.js';
import { loadCrons } from './tools/cron/storage.js';
import { needsOnboarding, processOnboarding } from './chatOnboarding.js';

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

  // Register bot commands for Telegram menu
  await bot.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'clear', description: 'Clear conversation history' },
    { command: 'restart', description: 'Reload config and memory' },
    { command: 'update', description: 'Update to latest version' },
    { command: 'cron', description: 'List scheduled tasks' },
    { command: 'claude', description: 'Manage Claude Code sessions' },
    { command: 'stop', description: 'Stop the bot process' },
  ]);

  // Track pending stop confirmations
  const pendingStopConfirmations = new Set();

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // Check if onboarding is needed
    if (needsOnboarding(chatId)) {
      const result = processOnboarding(chatId, '');
      await bot.sendMessage(chatId, result.message);
      return;
    }

    bot.sendMessage(chatId, `Hey! I'm ${config.telegram.name}. Just send me a message and I'll help out.`);
  });

  // Handle /clear command to reset conversation
  bot.onText(/\/clear/, (msg) => {
    const chatId = msg.chat.id;
    conversations.delete(chatId);
    clearToolLog();
    bot.sendMessage(chatId, '🗑️ Conversation cleared! Starting fresh.');
  });

  // Handle /restart command to reload config (keeps conversation)
  bot.onText(/\/restart/, (msg) => {
    const chatId = msg.chat.id;
    Object.assign(config, loadConfig());
    clearToolLog();
    drawUI(config, 'online');
    bot.sendMessage(chatId, '🔄 Restarted! Config and memory reloaded.');
  });

  // Handle /update command to pull latest code and restart
  bot.onText(/\/update/, async (msg) => {
    const chatId = msg.chat.id;

    // Only allow verified users
    const allowedPhones = config.telegram.allowedPhones || [];
    if (allowedPhones.length > 0 && !verifiedUsers.has(chatId)) {
      bot.sendMessage(chatId, '⛔ You are not authorized to update.');
      return;
    }

    await bot.sendMessage(chatId, '🔄 Updating Dwight...');

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Get the project directory
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const projectDir = path.join(__dirname, '..');

      // Backup user.md (personalized), then pull, then restore
      await bot.sendMessage(chatId, '📥 Pulling latest changes...');

      const fs = await import('fs');
      const userMdPath = path.join(projectDir, 'memory', 'user.md');
      let userMdBackup = null;

      // Backup user.md if it exists (it's personalized and should be preserved)
      if (fs.existsSync(userMdPath)) {
        userMdBackup = fs.readFileSync(userMdPath, 'utf8');
        console.log(chalk.cyan('  Backed up user.md'));
      }

      // Reset any local changes to tracked files (tools.md, soul.md will get updated)
      await execAsync('git checkout -- memory/tools.md memory/soul.md', { cwd: projectDir }).catch(() => {});

      // Pull latest
      const { stdout: gitOut } = await execAsync('git pull', { cwd: projectDir });
      console.log(chalk.cyan('  git pull: ' + gitOut.trim()));

      // Restore user.md from backup (preserve personalized content)
      if (userMdBackup) {
        fs.writeFileSync(userMdPath, userMdBackup);
        console.log(chalk.cyan('  Restored user.md'));
      }

      // Run install script for system deps + npm
      await bot.sendMessage(chatId, '📦 Installing dependencies...');
      await execAsync('./install.sh', { cwd: projectDir });

      await bot.sendMessage(chatId, '✅ Update complete! Restarting...');

      // Exit process - systemd will restart us
      setTimeout(() => {
        process.exit(0);
      }, 500);
    } catch (error) {
      console.log(chalk.red('  Update failed: ' + error.message));
      bot.sendMessage(chatId, `❌ Update failed: ${error.message}`);
    }
  });

  // Handle /stop command to terminate the bot
  bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;

    // Only allow verified users
    const allowedPhones = config.telegram.allowedPhones || [];
    if (allowedPhones.length > 0 && !verifiedUsers.has(chatId)) {
      bot.sendMessage(chatId, '⛔ You are not authorized to stop the bot.');
      return;
    }

    pendingStopConfirmations.add(chatId);
    await bot.sendMessage(chatId, '⚠️ Are you sure you want to stop Dwight?\n\nReply "yes" to confirm.');

    // Auto-clear confirmation after 30 seconds
    setTimeout(() => {
      pendingStopConfirmations.delete(chatId);
    }, 30000);
  });

  // Handle stop confirmation
  bot.onText(/^yes$/i, async (msg) => {
    const chatId = msg.chat.id;

    if (!pendingStopConfirmations.has(chatId)) {
      return; // No pending confirmation, ignore
    }

    pendingStopConfirmations.delete(chatId);
    await bot.sendMessage(chatId, '👋 Goodbye! Stopping Dwight...');

    // Give time for message to send
    setTimeout(() => {
      process.exit(0);
    }, 500);
  });

  // Handle /cron command to list scheduled tasks
  bot.onText(/\/cron/, async (msg) => {
    const chatId = msg.chat.id;

    const crons = loadCrons();

    if (crons.length === 0) {
      await bot.sendMessage(chatId,
        '📅 *No scheduled tasks*\n\n' +
        'To create one, just tell me, e.g.:\n' +
        '_"Every Monday at 9am, send me a summary email"_',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let message = '📅 *Scheduled Tasks*\n\n';

    for (const cron of crons) {
      const status = cron.enabled ? '🟢' : '⚪';
      const nextRun = cron.nextRun ? new Date(cron.nextRun).toLocaleString() : 'N/A';
      message += `${status} *${cron.description}*\n`;
      message += `    _${formatPattern(cron.pattern)}_\n`;
      message += `    Next: ${nextRun}\n\n`;
    }

    message += '_To manage tasks, just ask me (e.g. "disable the email summary task")_';

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  });

  // Helper to format age from a date
  const formatAge = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ago`;
    if (hours > 0) return `${hours}h ${mins % 60}m ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'just now';
  };

  // Handle /claude command to manage Claude Code sessions
  bot.onText(/\/claude(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;

    // Only allow verified users
    const allowedPhones = config.telegram.allowedPhones || [];
    if (allowedPhones.length > 0 && !verifiedUsers.has(chatId)) {
      bot.sendMessage(chatId, '⛔ You are not authorized to manage Claude Code sessions.');
      return;
    }

    const subcommand = match[1]?.trim();
    const sessions = getClaudeSessionsForChat(chatId);

    // No subcommand - show status
    if (!subcommand) {
      if (sessions.length === 0) {
        await bot.sendMessage(chatId,
          '🤖 *Claude Code Sessions*\n\n' +
          'No active sessions.\n\n' +
          'To start a session, just ask me to do a coding task, e.g.:\n' +
          '_"Use Claude to fix the login bug"_\n' +
          '_"Have Claude add unit tests to the user module"_',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '🤖 *Claude Code Sessions*\n\n';
      for (const session of sessions) {
        const status = {
          running: '🟢 Running',
          starting: '🟡 Starting',
          waiting_input: '🟠 Waiting for input',
          completed: '✅ Completed',
          error: '❌ Error',
          interrupted: '⚪ Interrupted',
        }[session.status] || '⚪ Unknown';

        const shortId = session.id.slice(0, 12);
        const age = formatAge(new Date(session.startedAt));
        const prompt = session.prompt?.slice(0, 50) || 'No prompt';

        message += `*${shortId}...* ${status}\n`;
        message += `    ${prompt}${session.prompt?.length > 50 ? '...' : ''}\n`;
        message += `    Started: ${age}\n`;

        if (session.pendingQuestion) {
          message += `    ⚠️ Waiting: ${session.pendingQuestion.slice(0, 40)}...\n`;
        }

        if (session.totalCost > 0) {
          message += `    Cost: $${session.totalCost.toFixed(4)}\n`;
        }

        message += '\n';
      }

      message += '_Commands:_\n';
      message += '`/claude stop <id>` - Stop a session\n';
      message += '`/claude details <id>` - Show full details';

      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      return;
    }

    // Parse subcommands
    const [action, ...args] = subcommand.split(/\s+/);
    const targetId = args.join(' ');

    if (action === 'stop' || action === 'kill') {
      if (!targetId) {
        await bot.sendMessage(chatId, '⚠️ Usage: `/claude stop <session-id>`', { parse_mode: 'Markdown' });
        return;
      }

      // Find matching session (supports partial ID)
      const session = sessions.find(s =>
        s.id.startsWith(targetId) ||
        s.id.includes(targetId)
      );

      if (!session) {
        await bot.sendMessage(chatId, `❌ Session not found: ${targetId}`);
        return;
      }

      // Kill the process if running
      if (session.kill) {
        session.kill();
      }
      removeClaudeSession(session.id);

      await bot.sendMessage(chatId, `🛑 Stopped session \`${session.id.slice(0, 12)}...\``, { parse_mode: 'Markdown' });
      return;
    }

    if (action === 'details' || action === 'info') {
      if (!targetId) {
        await bot.sendMessage(chatId, '⚠️ Usage: `/claude details <session-id>`', { parse_mode: 'Markdown' });
        return;
      }

      const session = sessions.find(s =>
        s.id.startsWith(targetId) ||
        s.id.includes(targetId)
      );

      if (!session) {
        await bot.sendMessage(chatId, `❌ Session not found: ${targetId}`);
        return;
      }

      let details = `🤖 *Session Details*\n\n`;
      details += `*ID:* \`${session.id}\`\n`;
      details += `*Status:* ${session.status}\n`;
      details += `*Model:* ${session.model || 'sonnet'}\n`;
      details += `*Working Dir:* \`${session.workingDir}\`\n`;
      details += `*Started:* ${new Date(session.startedAt).toLocaleString()}\n`;
      details += `*Last Activity:* ${new Date(session.lastActivity).toLocaleString()}\n`;
      details += `*Cost:* $${session.totalCost?.toFixed(4) || '0.0000'}\n\n`;
      details += `*Task:*\n${session.prompt}`;

      if (session.pendingQuestion) {
        details += `\n\n*⚠️ Waiting for:*\n${session.pendingQuestion}`;
      }

      if (session.result) {
        details += `\n\n*Result:*\n${session.result}`;
      }

      await bot.sendMessage(chatId, details, { parse_mode: 'Markdown' });
      return;
    }

    if (action === 'clear') {
      // Clear all completed/errored sessions
      let cleared = 0;
      for (const session of sessions) {
        if (session.status === 'completed' || session.status === 'error' || session.status === 'interrupted') {
          removeClaudeSession(session.id);
          cleared++;
        }
      }

      await bot.sendMessage(chatId, `🗑️ Cleared ${cleared} finished session${cleared !== 1 ? 's' : ''}.`);
      return;
    }

    // Unknown subcommand
    await bot.sendMessage(chatId,
      '⚠️ Unknown command. Available:\n' +
      '`/claude` - List sessions\n' +
      '`/claude stop <id>` - Stop a session\n' +
      '`/claude details <id>` - Show details\n' +
      '`/claude clear` - Clear finished sessions',
      { parse_mode: 'Markdown' }
    );
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

    // Handle voice messages
    const hasVoice = msg.voice || msg.audio;
    let voiceTranscription = null;

    if (hasVoice) {
      console.log(chalk.cyan(`  🎤 Voice message received from ${chatId}`));
      try {
        // Check if whisper is available
        console.log(chalk.gray('  Checking whisper availability...'));
        const whisperAvailable = await isWhisperAvailable();
        if (!whisperAvailable) {
          console.log(chalk.red('  Whisper not available'));
          bot.sendMessage(chatId, '❌ Voice transcription not available. Install Whisper with: pip install openai-whisper');
          return;
        }
        console.log(chalk.gray('  Whisper available, downloading audio...'));

        // Show recording indicator while transcribing
        bot.sendChatAction(chatId, 'typing');

        // Get the voice/audio file
        const fileId = msg.voice?.file_id || msg.audio?.file_id;
        const fileLink = await bot.getFileLink(fileId);
        console.log(chalk.gray(`  Downloading: ${fileLink}`));
        const response = await fetch(fileLink);
        const buffer = Buffer.from(await response.arrayBuffer());
        console.log(chalk.gray(`  Downloaded ${buffer.length} bytes`));

        // Determine format from file extension
        const ext = fileLink.split('.').pop().toLowerCase() || 'ogg';
        console.log(chalk.gray(`  Format: ${ext}, transcribing...`));

        // Transcribe
        voiceTranscription = await transcribeBuffer(buffer, ext);
        console.log(chalk.green(`  Transcribed: "${voiceTranscription}"`));

        if (!voiceTranscription || !voiceTranscription.trim()) {
          bot.sendMessage(chatId, '🔇 Could not transcribe the voice message. Please try again or send text.');
          return;
        }
      } catch (error) {
        console.log(chalk.red(`  Failed to transcribe voice: ${error.message}`));
        console.log(chalk.red(`  ${error.stack}`));
        bot.sendMessage(chatId, `❌ Failed to transcribe voice message: ${error.message}`);
        return;
      }
    }

    // Handle text or photo messages
    const userMessage = voiceTranscription || msg.text || msg.caption || '';
    const hasPhoto = msg.photo && msg.photo.length > 0;

    // Skip if no text and no photo and no voice
    if (!userMessage && !hasPhoto) return;

    // Download photo if present
    let image = null;
    let savedImagePath = null;
    if (hasPhoto) {
      try {
        // Get the largest photo (last in array)
        const photo = msg.photo[msg.photo.length - 1];
        const fileLink = await bot.getFileLink(photo.file_id);
        const response = await fetch(fileLink);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Determine mime type from file extension
        const ext = fileLink.split('.').pop().toLowerCase();
        const mimeTypes = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
        };
        const mimeType = mimeTypes[ext] || 'image/jpeg';

        // Always save the image to a file so AI can reference/move it
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        const imagesDir = path.default.join(os.default.homedir(), '.dwight', 'received');
        if (!fs.default.existsSync(imagesDir)) {
          fs.default.mkdirSync(imagesDir, { recursive: true });
        }
        const timestamp = Date.now();
        const filename = `${chatId}_${timestamp}.${ext || 'jpg'}`;
        savedImagePath = path.default.join(imagesDir, filename);
        fs.default.writeFileSync(savedImagePath, buffer);

        // Only include image for vision if model supports it
        if (supportsVision(config.ai.model)) {
          image = {
            base64: buffer.toString('base64'),
            mimeType,
          };
        }
      } catch (error) {
        console.log(chalk.red(`  Failed to download photo: ${error.message}`));
        bot.sendMessage(chatId, '❌ Failed to process the image. Please try again.');
        return;
      }
    }

    // Build the message - always include image path so AI can rename/move it if asked
    let finalMessage = userMessage;

    // Add voice transcription context
    if (voiceTranscription) {
      finalMessage = `[Voice message transcription]: ${voiceTranscription}`;
    }

    if (savedImagePath) {
      const pathNote = `\n\n[User sent an image. Saved to: ${savedImagePath}. If user asks to save/remember it, rename to a descriptive name and update memory.]`;
      finalMessage = (userMessage || 'User sent an image.') + pathNote;
    }

    // Check if onboarding is needed
    if (needsOnboarding(chatId)) {
      bot.sendChatAction(chatId, 'typing');
      const result = processOnboarding(chatId, userMessage);
      await bot.sendMessage(chatId, result.message);

      // Send any pending notifications (memory updates from onboarding)
      const notifications = getAndClearNotifications();
      if (notifications.length > 0) {
        const notifMsg = notifications.join('\n');
        await bot.sendMessage(chatId, notifMsg);
      }

      // If onboarding just completed, reload config to get new bot name
      if (result.complete) {
        Object.assign(config, loadConfig());
      }
      return;
    }

    // Show typing indicator
    bot.sendChatAction(chatId, 'typing');

    // Mark any pending email as confirmable (user has now responded)
    markPendingEmailConfirmable(chatId);

    // Mark any pending bash command as confirmed (user has now responded)
    confirmPendingBashCommand(chatId);

    // Update UI to processing
    incrementProcessing();
    drawUI(config, 'processing');

    try {
      const response = await getAIResponse(config, chatId, finalMessage, image);

      // Send response
      const isEmailConfirmation = response && /^(email|mail)\s+(sent|delivered)/i.test(response.trim());
      if (!response || !response.trim() || isEmailConfirmation) {
        // Empty response or email confirmation (notification handles it) - nothing to send
      } else if (response.length > 4096) {
        // Split long messages
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

      // Send any pending notifications (memory updates, etc.)
      const notifications = getAndClearNotifications();
      if (notifications.length > 0) {
        const notifMsg = notifications.join('\n');
        await bot.sendMessage(chatId, notifMsg);
      }

      // Send any pending photo notifications (from background image generation)
      const photoNotifications = getAndClearPhotoNotifications(chatId);
      for (const photo of photoNotifications) {
        try {
          await bot.sendPhoto(chatId, photo.buffer, {
            caption: photo.caption,
          }, {
            filename: 'image.png',
            contentType: 'image/png',
          });
        } catch (photoError) {
          // Fallback: notify user of failure
          await bot.sendMessage(chatId, 'Image was generated but failed to send. Please try again.');
        }
      }

      // Auto-reload config if memory was updated
      if (checkAndClearReload()) {
        Object.assign(config, loadConfig());
        addToolLog({ tool: 'auto-reload', status: 'success', detail: 'memory updated' });
        drawUI(config, 'online');
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

  // Get the default chat ID for cron executions (first verified user or config owner)
  const getDefaultChatId = () => {
    // Try to get the first verified user
    for (const [chatId] of verifiedUsers) {
      return chatId;
    }
    // Fallback: check config for owner chat
    if (config.telegram?.ownerChatId) {
      return config.telegram.ownerChatId;
    }
    return null;
  };

  // Start the cron scheduler
  startScheduler({
    onExecute: async (cron) => {
      const chatId = getDefaultChatId();
      if (!chatId) {
        console.log(chalk.yellow(`  ⏰ Cron "${cron.description}" fired but no chat to send to`));
        return;
      }

      console.log(chalk.cyan(`  ⏰ Executing cron: ${cron.description}`));
      addToolLog({ tool: 'cron', status: 'running', detail: cron.description });

      try {
        // Show typing indicator
        bot.sendChatAction(chatId, 'typing');

        // Execute the cron's prompt as if user sent it
        incrementProcessing();
        drawUI(config, 'processing');

        const response = await getAIResponse(config, chatId, cron.prompt);

        if (response && response.trim()) {
          // Prepend a note that this is from a scheduled task
          const cronNote = `⏰ *Scheduled task: ${cron.description}*\n\n`;
          const fullResponse = cronNote + response;

          if (fullResponse.length > 4096) {
            const chunks = fullResponse.match(/.{1,4096}/gs) || [];
            for (const chunk of chunks) {
              await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' }).catch(() => {
                bot.sendMessage(chatId, chunk);
              });
            }
          } else {
            await bot.sendMessage(chatId, fullResponse, { parse_mode: 'Markdown' }).catch(() => {
              bot.sendMessage(chatId, fullResponse);
            });
          }
        }

        addToolLog({ tool: 'cron', status: 'success', detail: cron.description });
      } catch (error) {
        console.log(chalk.red(`  ⏰ Cron error: ${error.message}`));
        addToolLog({ tool: 'cron', status: 'error', detail: error.message });
        await bot.sendMessage(chatId, `⏰ Scheduled task "${cron.description}" failed: ${error.message}`);
      } finally {
        decrementProcessing();
        drawUI(config, getProcessingCount() > 0 ? 'processing' : 'online');
      }
    },
    onMissed: async (missedCrons) => {
      const chatId = getDefaultChatId();
      if (!chatId || missedCrons.length === 0) return;

      // Format missed crons message
      const cronList = missedCrons.map(c =>
        `• ${c.description} (was due: ${new Date(c.nextRun).toLocaleString()})`
      ).join('\n');

      const message = `⏰ *Missed scheduled tasks*\n\nThese tasks were due while I was offline:\n\n${cronList}\n\nWould you like me to run them now? Reply "yes" or "run missed crons" to execute them.`;

      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(() => {
        bot.sendMessage(chatId, message);
      });
    },
  });

  // Notify owner that bot is online
  const ownerChatId = getDefaultChatId();
  if (ownerChatId) {
    bot.sendMessage(ownerChatId, '✅ Dwight is online and ready!').catch(() => {});
  }

  // Proactive photo delivery: check for completed background tasks every 2 seconds
  const photoCheckInterval = setInterval(async () => {
    const chatsWithPhotos = getChatsWithPendingPhotos();
    for (const chatId of chatsWithPhotos) {
      const photos = getAndClearPhotoNotifications(chatId);
      for (const photo of photos) {
        try {
          await bot.sendPhoto(chatId, photo.buffer, {
            caption: photo.caption,
          }, {
            filename: 'image.png',
            contentType: 'image/png',
          });
        } catch (error) {
          // Photo send failed, notify user
          await bot.sendMessage(chatId, 'Image was generated but failed to send. Please try again.').catch(() => {});
        }
      }
    }
  }, 2000);

  // UI refresh: animate spinner for running tasks (in-place, no flicker)
  let lastTaskCount = 0;
  const uiRefreshInterval = setInterval(() => {
    const runningTasks = getRunningTasks();
    const taskCount = runningTasks.length;

    // If task count changed, do full redraw
    if (taskCount !== lastTaskCount) {
      drawUI(config, getProcessingCount() > 0 ? 'processing' : 'online');
      lastTaskCount = taskCount;
    } else if (taskCount > 0) {
      // Just update spinner in place
      updateSpinner();
    }
  }, 150);

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
          clearToolLog();
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

        case 'web':
          const webChanged = await handleWebCommand(config, rl);
          if (webChanged) {
            bot.stopPolling();
            rl.close();
            await sleep(300);
            await startBot(loadConfig());
            return;
          }
          drawUI(config, 'online');
          break;

        case 'image':
          const imageChanged = await handleImageCommand(config, rl);
          if (imageChanged) {
            bot.stopPolling();
            rl.close();
            await sleep(300);
            await startBot(loadConfig());
            return;
          }
          drawUI(config, 'online');
          break;

        case 'calendar':
          const calendarChanged = await handleCalendarCommand(config, rl);
          if (calendarChanged) {
            bot.stopPolling();
            rl.close();
            await sleep(300);
            await startBot(loadConfig());
            return;
          }
          drawUI(config, 'online');
          break;

        case 'mode':
          await handleModeCommand(config, rl);
          drawUI(config, 'online');
          break;

        case 'clear':
          handleClearCommand(config);
          break;

        case 'status':
          handleStatusCommand(config);
          break;

        case 'logs':
          handleLogsCommand(config);
          break;

        case 'help':
        case '?':
          handleHelpCommand(config);
          break;

        case 'cron':
        case 'crons':
          await handleCronCommand(config, rl);
          drawUI(config, 'online');
          break;

        case 'update':
          console.log(chalk.cyan('\n  🔄 Updating Dwight...\n'));
          try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            const pathMod = await import('path');
            const fsMod = await import('fs');
            const { fileURLToPath } = await import('url');
            const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
            const projectDir = pathMod.join(__dirname, '..');

            // Backup user.md (personalized content)
            const userMdPath = pathMod.join(projectDir, 'memory', 'user.md');
            let userMdBackup = null;
            if (fsMod.existsSync(userMdPath)) {
              userMdBackup = fsMod.readFileSync(userMdPath, 'utf8');
              console.log(chalk.gray('  Backed up user.md'));
            }

            // Reset memory files to allow clean pull (tools.md and soul.md come from remote)
            await execAsync('git checkout -- memory/tools.md memory/soul.md', { cwd: projectDir }).catch(() => {});

            console.log(chalk.gray('  Pulling latest changes...'));
            const { stdout: gitOut } = await execAsync('git pull', { cwd: projectDir });
            console.log(chalk.gray('  ' + gitOut.trim()));

            // Restore user.md
            if (userMdBackup) {
              fsMod.writeFileSync(userMdPath, userMdBackup);
              console.log(chalk.gray('  Restored user.md'));
            }

            console.log(chalk.gray('  Installing dependencies...'));
            await execAsync('./install.sh', { cwd: projectDir });

            console.log(chalk.green('\n  ✅ Update complete! Restarting...\n'));
            clearInterval(photoCheckInterval);
            clearInterval(uiRefreshInterval);
            stopScheduler();
            bot.stopPolling();
            rl.close();
            await sleep(300);
            await startBot(loadConfig());
            return;
          } catch (error) {
            console.log(chalk.red(`\n  ❌ Update failed: ${error.message}\n`));
            drawUI(config, 'online');
          }
          break;

        case 'quit':
        case 'exit':
        case 'back':
          clearInterval(photoCheckInterval);
          clearInterval(uiRefreshInterval);
          stopScheduler();
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
