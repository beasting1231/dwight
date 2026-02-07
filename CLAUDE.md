# Dwight - Project Rules

## Code Structure

This project follows a modular architecture. Always maintain this structure:

```
src/
├── index.js        # Entry point only - minimal code
├── config.js       # Config load/save/paths
├── models.js       # AI model definitions
├── state.js        # Shared state (conversations, verifiedUsers)
├── ai.js           # AI API calls with tool support
├── bot.js          # Telegram bot initialization and handlers
├── cli.js          # CLI command handlers
├── ui.js           # UI drawing and display functions
├── onboarding.js   # Setup wizard
└── tools/          # AI tools directory
    ├── index.js    # Tool registry and executor
    └── email/      # Email tool
        ├── index.js    # Tool definitions and exports
        ├── client.js   # IMAP/SMTP client
        ├── actions.js  # Email operations
        └── setup.js    # Email setup wizard

scripts/
└── email-watcher.js  # Standalone email notification script

memory/
├── soul.md           # Dwight's personality, rules, and guidelines
├── user.md           # Information about the user (auto-updated)
└── tools.md          # Tool usage instructions (auto-updated on feedback)

tests/
├── models.test.js
├── state.test.js
├── config.test.js
├── ai.test.js
└── email.test.js
```

## Rules for Claude Code

1. **Never create monolithic files** - Keep each module focused on a single responsibility
2. **New features** should be added to the appropriate module or create a new module if needed
3. **Shared state** goes in `state.js` - never duplicate state across modules
4. **UI/display code** goes in `ui.js` - keep presentation separate from logic
5. **Config operations** go in `config.js` - centralized config management
6. **Keep functions small** - If a function exceeds ~50 lines, consider splitting it

## Module Responsibilities

- **index.js**: Entry point, argument parsing, main menu
- **config.js**: Load, save, and manage configuration file
- **models.js**: AI model lists and helper functions for model names
- **state.js**: In-memory state (conversations map, verified users map, processing count)
- **ai.js**: API calls to AI providers, response handling
- **bot.js**: Telegram bot setup, message handlers, command handlers
- **cli.js**: Interactive CLI commands (api, model, help, status, etc.)
- **ui.js**: Logo, gradients, drawUI, status display
- **onboarding.js**: First-time setup wizard

## Adding New Features

1. Identify which module the feature belongs to
2. If it spans multiple concerns, create appropriate functions in each module
3. Export only what's needed by other modules
4. Update this file if adding new modules

## Adding New Tools

Tools give the AI capabilities to interact with external services. Follow this structure:

### Creating a New Tool

1. Create a directory: `src/tools/[toolname]/`
2. Required files:
   - `index.js` - Tool definitions and main exports
   - `client.js` - External service client/connection
   - `actions.js` - Individual operations
   - `setup.js` - Configuration wizard (if needed)

3. Tool definition format:
```javascript
export const myTools = [
  {
    name: 'tool_action',           // Prefix with tool category
    description: 'What this does', // Clear description for AI
    parameters: {
      type: 'object',
      properties: { /* ... */ },
      required: ['param1'],
    },
  },
];
```

4. Register in `src/tools/index.js`:
   - Import tool definitions
   - Add to `allTools` array
   - Add executor to `toolExecutors`

5. Add CLI command in `src/cli.js` if setup is needed

6. Write tests in `tests/[toolname].test.js`

### Tool Naming Convention

- Use snake_case: `email_send`, `calendar_create`
- Prefix with category: `email_`, `calendar_`, `file_`
- Use verbs: `list`, `read`, `send`, `search`, `create`, `delete`

## Memory System

Dwight has a memory system using markdown files in the `memory/` directory.

### Memory Files

- **soul.md**: Core identity, personality, and strict rules. Rarely changes.
- **user.md**: Information about the user. Auto-updates when user shares personal info.
- **tools.md**: Instructions for using tools. Auto-updates when user gives feedback.

### How Memory Works

1. Memory files are loaded into the system prompt on every API call
2. Dwight can read/update these files using memory tools
3. Auto-update triggers:
   - User shares personal information → update user.md
   - User corrects tool usage → update tools.md
   - User says "always" or "never" do something → update appropriate file
   - User complains about a mistake → learn and update

### Memory Tools

- `memory_read` - Read a memory file
- `memory_update` - Replace entire memory file content
- `memory_append` - Add a bullet point to a section in user.md

## Testing (Test-Driven Development)

**Always write tests for new functionality.** This project uses Jest for testing.

### Test Structure
```
tests/
├── models.test.js    # Model definitions and helpers
├── state.test.js     # State management
├── config.test.js    # Config operations (mocked fs)
├── ai.test.js        # AI API calls (mocked fetch)
└── [module].test.js  # Mirror src/ structure
```

### Testing Rules

1. **Write tests first** when adding new features (TDD)
2. **Run tests before committing**: `npm test`
3. **All tests must pass** before merging changes
4. **Mock external dependencies** (fs, fetch, Telegram API)
5. **Test edge cases** - null values, empty arrays, error conditions
6. **Keep tests focused** - one concept per test

### Test Commands

- `npm test` - Run all tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run with coverage report

### What to Test

- **Pure functions**: All input/output combinations
- **State management**: Mutations, clearing, counting
- **API calls**: Success responses, error handling, request format
- **Config**: Load, save, reset, key management
- **Edge cases**: Empty inputs, missing properties, invalid data

### What NOT to Test

- Interactive CLI prompts (inquirer)
- Console output formatting
- Third-party library internals
