/**
 * Claude Code CLI stream-json output parser
 * Parses JSON events from Claude CLI's --output-format stream-json mode
 */

/**
 * Parse a Claude stream event and extract relevant state
 * @param {Object} event - Raw JSON event from Claude CLI
 * @returns {Object} Parsed event with normalized fields
 */
export function parseStreamEvent(event) {
  const result = {
    type: event.type,
    subtype: event.subtype,
    sessionId: event.session_id,
    isComplete: false,
    needsInput: false,
    question: null,
    questionOptions: null,
    summary: null,
    cost: null,
    text: null,
    toolName: null,
    toolInput: null,
    error: null,
  };

  switch (event.type) {
    case 'result':
      result.isComplete = true;
      result.summary = event.result || event.message;
      result.cost = event.total_cost_usd;
      result.success = event.subtype === 'success';
      if (event.subtype === 'error') {
        result.error = event.error || event.message;
      }
      break;

    case 'assistant':
      // Check message content for tool use or text
      const content = event.message?.content || [];

      for (const block of content) {
        if (block.type === 'tool_use') {
          // Check if Claude is asking for user input
          if (block.name === 'AskUserQuestion') {
            result.needsInput = true;
            const input = block.input || {};
            // Extract question(s) from the tool input
            if (input.questions && input.questions.length > 0) {
              const q = input.questions[0];
              result.question = q.question;
              result.questionOptions = q.options?.map(o => o.label);
            } else if (input.question) {
              result.question = input.question;
            }
          } else {
            // Track other tool usage
            result.toolName = block.name;
            result.toolInput = block.input;
          }
        } else if (block.type === 'text') {
          result.text = block.text;
        }
      }
      break;

    case 'user':
      // Tool results being sent back to Claude
      result.isToolResult = true;
      break;

    case 'system':
      if (event.subtype === 'init') {
        result.initialized = true;
        result.tools = event.tools;
        result.model = event.model;
        result.sessionId = event.session_id;
      }
      break;
  }

  return result;
}

/**
 * Detect if text output indicates Claude needs human decision
 * @param {string} text - Text content from Claude
 * @returns {string|null} The question if detected, null otherwise
 */
export function detectQuestionInText(text) {
  if (!text) return null;

  // Common question patterns that indicate Claude wants user input
  const questionPatterns = [
    /should I (?:proceed|continue|do this|go ahead)\??/i,
    /would you like me to/i,
    /do you want me to/i,
    /is that (?:correct|right|ok|okay)\??/i,
    /please (?:confirm|verify|let me know)/i,
    /which (?:one|option|approach) (?:would you|do you)/i,
    /can you (?:clarify|confirm|tell me)/i,
  ];

  for (const pattern of questionPatterns) {
    if (pattern.test(text)) {
      // Return the sentence containing the question
      const sentences = text.split(/[.!]\s+/);
      for (const sentence of sentences) {
        if (pattern.test(sentence) || sentence.includes('?')) {
          return sentence.trim();
        }
      }
      return text.slice(0, 200);
    }
  }

  return null;
}

/**
 * Detect if output is a permission prompt from Claude Code
 * These appear when --dangerously-skip-permissions is not used
 * @param {string} text - Raw text from PTY output
 * @returns {Object|null} { type: 'permission', tool: string } or null
 */
export function detectPermissionPrompt(text) {
  if (!text) return null;

  // Permission prompts look like:
  // "Allow Read tool? [y/n]"
  // "Allow Bash tool? [y/n]"
  // "Do you want to allow this tool? (y/n)"
  const permissionPatterns = [
    /Allow (\w+)(?: tool)?\?\s*\[?[yYnN]/i,
    /allow this (?:tool|action)\?\s*\(?[yYnN]/i,
    /permission.*\[?[yYnN]\/[yYnN]\]?/i,
    /Do you trust.*\[?[yYnN]/i,
  ];

  for (const pattern of permissionPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        type: 'permission',
        tool: match[1] || 'unknown',
        raw: text,
      };
    }
  }

  return null;
}

/**
 * Generate a brief summary from Claude's result
 * @param {Object} parsed - Parsed result event
 * @returns {string} 1-2 sentence summary
 */
export function generateCompletionSummary(parsed) {
  if (!parsed.summary) {
    return parsed.success ? 'Task completed successfully.' : 'Task failed.';
  }

  const summary = parsed.summary;

  // If already short, return as-is
  if (summary.length <= 200) return summary;

  // Find a good sentence break
  const truncated = summary.slice(0, 200);
  const lastSentence = truncated.lastIndexOf('. ');

  if (lastSentence > 100) {
    return truncated.slice(0, lastSentence + 1);
  }

  return truncated + '...';
}

/**
 * Parse newline-delimited JSON stream
 * @param {string} data - Raw string data from stdout
 * @param {string} buffer - Existing buffer of incomplete data
 * @returns {{ events: Object[], buffer: string }} Parsed events and remaining buffer
 */
export function parseStreamData(data, buffer = '') {
  const combined = buffer + data;
  const lines = combined.split('\n');
  const remaining = lines.pop(); // Keep incomplete line in buffer

  const events = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (e) {
      // Log but continue - may be non-JSON output
      console.error('Failed to parse Claude event:', line.slice(0, 100));
    }
  }

  return { events, buffer: remaining };
}
