import {
  getOnboardingState,
  saveOnboardingState,
  setBotName,
  isSession,
  saveApiKey,
  saveConfig,
  loadConfig,
} from './config.js';
import { writeMemory, readMemory } from './tools/memory/index.js';
import { MODELS } from './models.js';

/**
 * Onboarding steps
 */
const STEPS = {
  GREETING: 0,
  ASK_BOT_NAME: 1,
  ASK_LOCATION: 2,
  ASK_USER_NAME: 3,
  ASK_PERSONALITY: 4,
  ASK_AI_PROVIDER: 5,
  WAIT_API_KEY: 6,
  ASK_MODEL: 7,
  COMPLETE: 8,
};

/**
 * Check if onboarding is needed for this chat
 */
export function needsOnboarding(chatId) {
  // Session groups inherit onboarding from the owner's private chat
  if (isSession(chatId)) return false;

  const state = getOnboardingState(chatId);

  // If onboarding already complete, skip
  return !state.complete;
}

/**
 * Get the initial greeting message
 */
function getGreetingMessage() {
  return `Hey there! I'm your new AI assistant. Before we get started, let me get to know you a bit so I can help you better.

This'll only take a minute.

First things first - what should I call myself? Pick a name for me:`;
}

/**
 * Process onboarding step and return response
 * @param {string|number} chatId - The chat ID
 * @param {string} userMessage - The user's message
 * @returns {{ message: string, complete: boolean }}
 */
export function processOnboarding(chatId, userMessage) {
  const state = getOnboardingState(chatId);

  // Handle based on current step
  switch (state.step) {
    case STEPS.GREETING:
      // First interaction - send greeting and move to next step
      state.step = STEPS.ASK_BOT_NAME;
      saveOnboardingState(chatId, state);
      return {
        message: getGreetingMessage(),
        complete: false,
      };

    case STEPS.ASK_BOT_NAME:
      // User provided bot name
      const botName = userMessage.trim();
      state.data.botName = botName;
      state.step = STEPS.ASK_LOCATION;
      saveOnboardingState(chatId, state);

      // Update the bot name in config
      setBotName(botName);

      return {
        message: `${botName} - I like it!\n\nWhere are you based? (City or timezone, so I know what time it is for you)`,
        complete: false,
      };

    case STEPS.ASK_LOCATION:
      // User provided location
      state.data.location = userMessage.trim();
      state.step = STEPS.ASK_USER_NAME;
      saveOnboardingState(chatId, state);

      return {
        message: `Got it, noted!\n\nAnd what's your name?`,
        complete: false,
      };

    case STEPS.ASK_USER_NAME:
      // User provided their name
      state.data.userName = userMessage.trim();
      state.step = STEPS.ASK_PERSONALITY;
      saveOnboardingState(chatId, state);

      return {
        message: `Nice to meet you, ${state.data.userName}!\n\nLast question: Any specific way you'd like me to behave? Personality traits, communication style, things I should always or never do?\n\n(Or just say "nope" if you're happy with defaults)`,
        complete: false,
      };

    case STEPS.ASK_PERSONALITY:
      // User provided personality preferences
      const personality = userMessage.trim().toLowerCase();
      if (personality !== 'nope' && personality !== 'no' && personality !== 'none' && personality !== 'n') {
        state.data.personality = userMessage.trim();
      }

      // Check if AI is already configured
      const currentCfg = loadConfig();
      const hasApiKey = currentCfg?.ai?.apiKey || currentCfg?.apiKeys?.[currentCfg?.ai?.provider];
      const hasModel = currentCfg?.ai?.model;
      const aiConfigured = hasApiKey && hasModel && currentCfg?.ai?.provider !== 'none';

      if (aiConfigured) {
        // AI already set up, skip to complete
        state.step = STEPS.COMPLETE;
        state.complete = true;
        saveOnboardingState(chatId, state);
        saveOnboardingData(state.data);

        const botName2 = state.data.botName || 'I';
        let confirmMsg = `All set, ${state.data.userName}!\n\n`;
        confirmMsg += `Saved to memory:\n`;
        confirmMsg += `• Name: ${state.data.userName}\n`;
        confirmMsg += `• Location: ${state.data.location}\n`;
        if (state.data.personality) {
          confirmMsg += `• Personality: "${state.data.personality}"\n`;
        }
        confirmMsg += `• Bot name: ${state.data.botName}\n\n`;
        confirmMsg += `I'm ready to chat! Just message me anytime.`;

        return {
          message: confirmMsg,
          complete: true,
        };
      } else {
        // Need to configure AI
        state.step = STEPS.ASK_AI_PROVIDER;
        saveOnboardingState(chatId, state);
        saveOnboardingData(state.data);

        return {
          message: `Perfect! Now let's set up your AI provider so I can actually think.\n\nWhich provider would you like to use?\n\n1️⃣ OpenRouter (access to 400+ models - Claude, GPT, Gemini, etc.)\n2️⃣ Anthropic (direct access to Claude models)\n\nReply with *1* or *2*:`,
          complete: false,
        };
      }

    case STEPS.ASK_AI_PROVIDER:
      // User selected AI provider
      const providerChoice = userMessage.trim();
      let provider = '';
      let providerName = '';

      if (providerChoice === '1' || providerChoice.toLowerCase().includes('openrouter')) {
        provider = 'openrouter';
        providerName = 'OpenRouter';
      } else if (providerChoice === '2' || providerChoice.toLowerCase().includes('anthropic')) {
        provider = 'anthropic';
        providerName = 'Anthropic';
      } else {
        return {
          message: `Please reply with *1* for OpenRouter or *2* for Anthropic.`,
          complete: false,
        };
      }

      state.data.provider = provider;
      state.data.providerName = providerName;
      state.step = STEPS.WAIT_API_KEY;
      saveOnboardingState(chatId, state);

      const apiKeyUrl = provider === 'anthropic'
        ? 'https://console.anthropic.com/settings/keys'
        : 'https://openrouter.ai/keys';

      return {
        message: `Great! You chose *${providerName}*.\n\nNow I need your API key.\n\nGet it here: ${apiKeyUrl}\n\nPaste your API key below (I'll delete your message for security):`,
        complete: false,
      };

    case STEPS.WAIT_API_KEY:
      // User provided API key
      const apiKey = userMessage.trim();

      if (!apiKey || apiKey.length < 10) {
        return {
          message: `That doesn't look like a valid API key. Please paste your ${state.data.providerName} API key:`,
          complete: false,
        };
      }

      state.data.apiKey = apiKey;
      state.step = STEPS.ASK_MODEL;
      saveOnboardingState(chatId, state);

      // Save API key to config
      const currentConfig = loadConfig() || {};
      currentConfig.apiKeys = currentConfig.apiKeys || {};
      currentConfig.apiKeys[state.data.provider] = apiKey;
      currentConfig.ai = currentConfig.ai || {};
      currentConfig.ai.provider = state.data.provider;
      currentConfig.ai.apiKey = apiKey;
      saveConfig(currentConfig);

      // Build model selection message
      const models = MODELS[state.data.provider] || [];
      let modelMsg = `✅ API key saved!\n\nNow, which model would you like to use?\n\n`;

      models.forEach((model, idx) => {
        const shortName = model.name.split('(')[0].trim();
        modelMsg += `${idx + 1}️⃣ ${shortName} - ${model.pricing}\n`;
      });

      modelMsg += `\nReply with the number (1-${models.length}):`;

      return {
        message: modelMsg,
        complete: false,
        deleteUserMessage: true, // Signal to delete the API key message
      };

    case STEPS.ASK_MODEL:
      // User selected model
      const models2 = MODELS[state.data.provider] || [];
      const modelIndex = parseInt(userMessage.trim()) - 1;

      if (isNaN(modelIndex) || modelIndex < 0 || modelIndex >= models2.length) {
        return {
          message: `Please reply with a number between 1 and ${models2.length}.`,
          complete: false,
        };
      }

      const selectedModel = models2[modelIndex];
      state.data.model = selectedModel.value;
      state.step = STEPS.COMPLETE;
      state.complete = true;
      saveOnboardingState(chatId, state);

      // Save model to config
      const finalConfig = loadConfig() || {};
      finalConfig.ai = finalConfig.ai || {};
      finalConfig.ai.model = selectedModel.value;
      finalConfig.ai.temperature = 0.7;
      finalConfig.ai.maxTokens = 4096;
      saveConfig(finalConfig);

      const botName2 = state.data.botName || 'I';
      const modelShortName = selectedModel.name.split('(')[0].trim();

      let confirmMsg = `🎉 All set, ${state.data.userName}!\n\n`;
      confirmMsg += `*Configuration:*\n`;
      confirmMsg += `• Provider: ${state.data.providerName}\n`;
      confirmMsg += `• Model: ${modelShortName}\n`;
      confirmMsg += `• Bot name: ${state.data.botName}\n\n`;
      confirmMsg += `I'm ready to chat! Just message me anytime.`;

      return {
        message: confirmMsg,
        complete: true,
      };

    default:
      // Already complete or unknown state
      state.complete = true;
      saveOnboardingState(chatId, state);
      return {
        message: "Let's get started! How can I help you?",
        complete: true,
      };
  }
}

/**
 * Save collected onboarding data to user memory
 */
function saveOnboardingData(data) {
  const { userName, location, personality, botName } = data;

  // Build updated user.md content
  let content = `# User Profile

## Basic Information

- Name: ${userName || '(not set)'}
- Location: ${location || '(not set)'}

## Preferences

`;

  if (personality) {
    content += `- ${personality}\n`;
  } else {
    content += `- (No specific preferences set)\n`;
  }

  content += `
## Important Notes

- (Will be updated as I learn more about you)

## Things to Remember

- (Key information you share will be saved here)
`;

  // Also update soul.md if personality was specified
  if (personality) {
    const currentSoul = readMemory('soul') || '';

    // Check if there's already a user preferences section
    if (!currentSoul.includes('## User-Requested Behavior')) {
      const updatedSoul = currentSoul.trim() + `

## User-Requested Behavior

${personality}
`;
      writeMemory('soul', updatedSoul);
    }
  }

  writeMemory('user', content);
}

/**
 * Reset onboarding for a chat (for testing)
 */
export function resetOnboarding(chatId) {
  saveOnboardingState(chatId, { step: 0, complete: false, data: {} });
}
