import {
  getOnboardingState,
  saveOnboardingState,
  setBotName,
} from './config.js';
import { writeMemory, readMemory } from './tools/memory/index.js';

/**
 * Onboarding steps
 */
const STEPS = {
  GREETING: 0,
  ASK_BOT_NAME: 1,
  ASK_LOCATION: 2,
  ASK_USER_NAME: 3,
  ASK_PERSONALITY: 4,
  COMPLETE: 5,
};

/**
 * Check if onboarding is needed for this chat
 */
export function needsOnboarding(chatId) {
  const state = getOnboardingState(chatId);
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
      state.step = STEPS.COMPLETE;
      state.complete = true;
      saveOnboardingState(chatId, state);

      // Save all collected data to memory
      const saveResult = saveOnboardingData(state.data);

      const botName2 = state.data.botName || 'I';
      let confirmMsg = `All set, ${state.data.userName}!\n\n`;
      confirmMsg += `Saved to memory:\n`;
      confirmMsg += `• Name: ${state.data.userName}\n`;
      confirmMsg += `• Location: ${state.data.location}\n`;
      if (state.data.personality) {
        confirmMsg += `• Personality: "${state.data.personality}"\n`;
      }
      confirmMsg += `• Bot name: ${state.data.botName}\n\n`;
      confirmMsg += `${botName2} is ready. Just message me anytime!`;

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
