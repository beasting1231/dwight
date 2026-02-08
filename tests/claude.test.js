/**
 * Tests for Claude Code CLI integration
 */

import { jest } from '@jest/globals';

// Import parser utilities
import {
  parseStreamEvent,
  detectQuestionInText,
  generateCompletionSummary,
  parseStreamData,
} from '../src/tools/claude/parser.js';

describe('Claude Parser', () => {
  describe('parseStreamEvent', () => {
    it('detects completion from successful result event', () => {
      const event = {
        type: 'result',
        subtype: 'success',
        result: 'Task completed successfully',
        total_cost_usd: 0.0123,
      };
      const parsed = parseStreamEvent(event);

      expect(parsed.isComplete).toBe(true);
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toBe('Task completed successfully');
      expect(parsed.cost).toBe(0.0123);
    });

    it('detects completion from error result event', () => {
      const event = {
        type: 'result',
        subtype: 'error',
        error: 'Something went wrong',
        total_cost_usd: 0.001,
      };
      const parsed = parseStreamEvent(event);

      expect(parsed.isComplete).toBe(true);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Something went wrong');
    });

    it('detects input request from AskUserQuestion tool', () => {
      const event = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'AskUserQuestion',
              input: {
                questions: [
                  {
                    question: 'Which database should I use?',
                    options: [
                      { label: 'PostgreSQL' },
                      { label: 'MySQL' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      };
      const parsed = parseStreamEvent(event);

      expect(parsed.needsInput).toBe(true);
      expect(parsed.question).toBe('Which database should I use?');
      expect(parsed.questionOptions).toEqual(['PostgreSQL', 'MySQL']);
    });

    it('extracts text content from assistant message', () => {
      const event = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'I found the issue in the login module.',
            },
          ],
        },
      };
      const parsed = parseStreamEvent(event);

      expect(parsed.text).toBe('I found the issue in the login module.');
    });

    it('tracks tool usage', () => {
      const event = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: '/src/index.js' },
            },
          ],
        },
      };
      const parsed = parseStreamEvent(event);

      expect(parsed.toolName).toBe('Read');
      expect(parsed.toolInput).toEqual({ file_path: '/src/index.js' });
    });

    it('detects initialization from system init event', () => {
      const event = {
        type: 'system',
        subtype: 'init',
        session_id: 'abc123',
        model: 'claude-sonnet',
        tools: ['Read', 'Write', 'Bash'],
      };
      const parsed = parseStreamEvent(event);

      expect(parsed.initialized).toBe(true);
      expect(parsed.sessionId).toBe('abc123');
      expect(parsed.model).toBe('claude-sonnet');
      expect(parsed.tools).toEqual(['Read', 'Write', 'Bash']);
    });
  });

  describe('detectQuestionInText', () => {
    it('returns null for non-question text', () => {
      expect(detectQuestionInText('I fixed the bug.')).toBeNull();
      expect(detectQuestionInText('The file has been updated.')).toBeNull();
    });

    it('detects "should I proceed" questions', () => {
      const text = 'I found the issue. Should I proceed with the fix?';
      expect(detectQuestionInText(text)).toBeTruthy();
    });

    it('detects "would you like me to" questions', () => {
      const text = 'Would you like me to add tests for this?';
      expect(detectQuestionInText(text)).toBeTruthy();
    });

    it('detects "please confirm" questions', () => {
      const text = 'Please confirm this is the correct approach.';
      expect(detectQuestionInText(text)).toBeTruthy();
    });

    it('detects "is that correct" questions', () => {
      const text = 'I understand you want to refactor. Is that correct?';
      expect(detectQuestionInText(text)).toBeTruthy();
    });
  });

  describe('generateCompletionSummary', () => {
    it('returns default message for null summary', () => {
      expect(generateCompletionSummary({ success: true })).toBe('Task completed successfully.');
      expect(generateCompletionSummary({ success: false })).toBe('Task failed.');
    });

    it('returns short summary as-is', () => {
      const parsed = { summary: 'Fixed the login bug.' };
      expect(generateCompletionSummary(parsed)).toBe('Fixed the login bug.');
    });

    it('truncates long summary at sentence boundary', () => {
      const longSummary = 'I fixed the authentication bug in the login module. This involved updating the password validation logic and adding proper error handling. The changes have been tested and work correctly. Additional refactoring was also performed to improve code readability.';
      const parsed = { summary: longSummary };
      const result = generateCompletionSummary(parsed);

      expect(result.length).toBeLessThanOrEqual(200);
      expect(result.endsWith('.')).toBe(true);
    });

    it('truncates with ellipsis if no good sentence break', () => {
      const longText = 'A'.repeat(300);
      const parsed = { summary: longText };
      const result = generateCompletionSummary(parsed);

      expect(result.endsWith('...')).toBe(true);
      expect(result.length).toBe(203); // 200 + '...'
    });
  });

  describe('parseStreamData', () => {
    it('parses complete JSON lines', () => {
      const data = '{"type":"system"}\n{"type":"assistant"}\n';
      const { events, buffer } = parseStreamData(data);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('system');
      expect(events[1].type).toBe('assistant');
      expect(buffer).toBe('');
    });

    it('handles incomplete line at end', () => {
      const data = '{"type":"system"}\n{"type":"ass';
      const { events, buffer } = parseStreamData(data);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('system');
      expect(buffer).toBe('{"type":"ass');
    });

    it('continues parsing with buffered data', () => {
      const buffer = '{"type":"ass';
      const data = 'istant"}\n';
      const { events, buffer: newBuffer } = parseStreamData(data, buffer);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('assistant');
      expect(newBuffer).toBe('');
    });

    it('skips empty lines', () => {
      const data = '{"type":"system"}\n\n{"type":"result"}\n';
      const { events } = parseStreamData(data);

      expect(events).toHaveLength(2);
    });

    it('handles invalid JSON gracefully', () => {
      const data = '{"type":"system"}\ninvalid json\n{"type":"result"}\n';
      const { events } = parseStreamData(data);

      // Should parse valid lines and skip invalid
      expect(events).toHaveLength(2);
    });
  });
});

describe('Claude Tool Definitions', () => {
  it('exports claudeTools array', async () => {
    const { claudeTools } = await import('../src/tools/claude/index.js');
    expect(Array.isArray(claudeTools)).toBe(true);
    expect(claudeTools.length).toBeGreaterThan(0);
  });

  it('has claude_start tool with required parameters', async () => {
    const { claudeTools } = await import('../src/tools/claude/index.js');
    const startTool = claudeTools.find(t => t.name === 'claude_start');

    expect(startTool).toBeDefined();
    expect(startTool.description).toContain('Claude Code');
    expect(startTool.parameters.required).toContain('prompt');
    expect(startTool.parameters.properties.prompt).toBeDefined();
    expect(startTool.parameters.properties.workingDir).toBeDefined();
    expect(startTool.parameters.properties.model).toBeDefined();
  });

  it('has claude_input tool', async () => {
    const { claudeTools } = await import('../src/tools/claude/index.js');
    const inputTool = claudeTools.find(t => t.name === 'claude_input');

    expect(inputTool).toBeDefined();
    expect(inputTool.parameters.required).toContain('sessionId');
    expect(inputTool.parameters.required).toContain('input');
  });

  it('has claude_status tool', async () => {
    const { claudeTools } = await import('../src/tools/claude/index.js');
    const statusTool = claudeTools.find(t => t.name === 'claude_status');

    expect(statusTool).toBeDefined();
    expect(statusTool.description).toContain('status');
  });

  it('has claude_stop tool', async () => {
    const { claudeTools } = await import('../src/tools/claude/index.js');
    const stopTool = claudeTools.find(t => t.name === 'claude_stop');

    expect(stopTool).toBeDefined();
    expect(stopTool.parameters.required).toContain('sessionId');
  });

  it('has claude_resume tool', async () => {
    const { claudeTools } = await import('../src/tools/claude/index.js');
    const resumeTool = claudeTools.find(t => t.name === 'claude_resume');

    expect(resumeTool).toBeDefined();
    expect(resumeTool.parameters.required).toContain('sessionId');
  });
});

describe('Claude State Management', () => {
  it('exports session management functions', async () => {
    const state = await import('../src/state.js');

    expect(typeof state.createClaudeSession).toBe('function');
    expect(typeof state.getClaudeSession).toBe('function');
    expect(typeof state.getClaudeSessionsForChat).toBe('function');
    expect(typeof state.updateClaudeSession).toBe('function');
    expect(typeof state.removeClaudeSession).toBe('function');
    expect(typeof state.getAllClaudeSessions).toBe('function');
  });

  it('creates and retrieves sessions', async () => {
    const {
      createClaudeSession,
      getClaudeSession,
      removeClaudeSession,
    } = await import('../src/state.js');

    const testId = `test_session_${Date.now()}`;
    createClaudeSession(12345, {
      id: testId,
      status: 'running',
      prompt: 'Test task',
    });

    const session = getClaudeSession(testId);
    expect(session).toBeDefined();
    expect(session.id).toBe(testId);
    expect(session.chatId).toBe(12345);
    expect(session.status).toBe('running');

    // Cleanup
    removeClaudeSession(testId);
    expect(getClaudeSession(testId)).toBeUndefined();
  });

  it('filters sessions by chat', async () => {
    const {
      createClaudeSession,
      getClaudeSessionsForChat,
      removeClaudeSession,
    } = await import('../src/state.js');

    const id1 = `test_chat1_${Date.now()}`;
    const id2 = `test_chat2_${Date.now()}`;

    createClaudeSession(111, { id: id1, status: 'running' });
    createClaudeSession(222, { id: id2, status: 'running' });

    const chat1Sessions = getClaudeSessionsForChat(111);
    expect(chat1Sessions).toHaveLength(1);
    expect(chat1Sessions[0].id).toBe(id1);

    // Cleanup
    removeClaudeSession(id1);
    removeClaudeSession(id2);
  });
});
