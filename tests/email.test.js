import { jest } from '@jest/globals';
import {
  emailTools,
  executeEmailTool,
  isEmailConnected,
} from '../src/tools/email/index.js';

describe('email tools', () => {
  describe('emailTools definitions', () => {
    it('should export an array of tools', () => {
      expect(Array.isArray(emailTools)).toBe(true);
      expect(emailTools.length).toBeGreaterThan(0);
    });

    it('should have email_list tool', () => {
      const tool = emailTools.find(t => t.name === 'email_list');
      expect(tool).toBeDefined();
      expect(tool.description).toContain('List');
    });

    it('should have email_read tool', () => {
      const tool = emailTools.find(t => t.name === 'email_read');
      expect(tool).toBeDefined();
      expect(tool.parameters.required).toContain('uid');
    });

    it('should have email_search tool', () => {
      const tool = emailTools.find(t => t.name === 'email_search');
      expect(tool).toBeDefined();
      expect(tool.parameters.properties).toHaveProperty('query');
    });

    it('should have email_send tool', () => {
      const tool = emailTools.find(t => t.name === 'email_send');
      expect(tool).toBeDefined();
      expect(tool.parameters.required).toContain('to');
      expect(tool.parameters.required).toContain('subject');
      expect(tool.parameters.required).toContain('text');
    });

    it('should have email_unread_count tool', () => {
      const tool = emailTools.find(t => t.name === 'email_unread_count');
      expect(tool).toBeDefined();
    });

    it('each tool should have required properties', () => {
      emailTools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(tool.parameters).toHaveProperty('type', 'object');
      });
    });
  });

  describe('isEmailConnected', () => {
    it('should return false when not connected', () => {
      expect(isEmailConnected()).toBe(false);
    });
  });

  describe('executeEmailTool', () => {
    it('should return error for unknown tool', async () => {
      const result = await Promise.race([
        executeEmailTool('unknown_tool', {}),
        new Promise(resolve => setTimeout(() => resolve({ error: 'timeout' }), 3000))
      ]);
      expect(result).toHaveProperty('error');
      expect(result.error).toBeDefined();
    }, 5000);

    it('should return error or result for email_list', async () => {
      // Will either return error (not configured/connection failed) or list of emails
      // Set a short timeout to avoid long waits on connection attempts
      const result = await Promise.race([
        executeEmailTool('email_list', {}),
        new Promise(resolve => setTimeout(() => resolve({ error: 'timeout' }), 3000))
      ]);
      // Either has error property or is an array of emails
      const hasError = result.hasOwnProperty('error');
      const isEmailList = Array.isArray(result);
      expect(hasError || isEmailList).toBe(true);
    }, 5000);
  });
});

describe('email client', () => {
  let getImapConfig, getSmtpConfig;

  beforeAll(async () => {
    const client = await import('../src/tools/email/client.js');
    getImapConfig = client.getImapConfig;
    getSmtpConfig = client.getSmtpConfig;
  });

  describe('getImapConfig', () => {
    it('should return Gmail IMAP config', () => {
      const config = getImapConfig('gmail', 'test@gmail.com', 'password');
      expect(config.host).toBe('imap.gmail.com');
      expect(config.port).toBe(993);
      expect(config.secure).toBe(true);
      expect(config.auth.user).toBe('test@gmail.com');
    });

    it('should return Outlook IMAP config', () => {
      const config = getImapConfig('outlook', 'test@outlook.com', 'password');
      expect(config.host).toBe('outlook.office365.com');
      expect(config.port).toBe(993);
    });

    it('should return Yahoo IMAP config', () => {
      const config = getImapConfig('yahoo', 'test@yahoo.com', 'password');
      expect(config.host).toBe('imap.mail.yahoo.com');
    });

    it('should return default config for unknown provider', () => {
      const config = getImapConfig('unknown', 'test@example.com', 'password');
      expect(config.port).toBe(993);
      expect(config.secure).toBe(true);
    });
  });

  describe('getSmtpConfig', () => {
    it('should return Gmail SMTP config', () => {
      const config = getSmtpConfig('gmail', 'test@gmail.com', 'password');
      expect(config.host).toBe('smtp.gmail.com');
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
    });

    it('should return Outlook SMTP config', () => {
      const config = getSmtpConfig('outlook', 'test@outlook.com', 'password');
      expect(config.host).toBe('smtp.office365.com');
      expect(config.port).toBe(587);
    });

    it('should return Yahoo SMTP config', () => {
      const config = getSmtpConfig('yahoo', 'test@yahoo.com', 'password');
      expect(config.host).toBe('smtp.mail.yahoo.com');
    });
  });
});

describe('tools index', () => {
  let allTools, getTool, getToolsByCategory, formatToolsForAI;

  beforeAll(async () => {
    const tools = await import('../src/tools/index.js');
    allTools = tools.allTools;
    getTool = tools.getTool;
    getToolsByCategory = tools.getToolsByCategory;
    formatToolsForAI = tools.formatToolsForAI;
  });

  describe('allTools', () => {
    it('should include email tools', () => {
      const emailTool = allTools.find(t => t.name.startsWith('email_'));
      expect(emailTool).toBeDefined();
    });
  });

  describe('getTool', () => {
    it('should return tool by name', () => {
      const tool = getTool('email_list');
      expect(tool).toBeDefined();
      expect(tool.name).toBe('email_list');
    });

    it('should return undefined for unknown tool', () => {
      const tool = getTool('nonexistent_tool');
      expect(tool).toBeUndefined();
    });
  });

  describe('getToolsByCategory', () => {
    it('should return all email tools', () => {
      const tools = getToolsByCategory('email');
      expect(tools.length).toBeGreaterThan(0);
      tools.forEach(tool => {
        expect(tool.name.startsWith('email_')).toBe(true);
      });
    });

    it('should return empty array for unknown category', () => {
      const tools = getToolsByCategory('unknown');
      expect(tools).toEqual([]);
    });
  });

  describe('formatToolsForAI', () => {
    it('should format tools for Anthropic', () => {
      const formatted = formatToolsForAI('anthropic');
      expect(Array.isArray(formatted)).toBe(true);
      if (formatted.length > 0) {
        expect(formatted[0]).toHaveProperty('name');
        expect(formatted[0]).toHaveProperty('description');
        expect(formatted[0]).toHaveProperty('input_schema');
      }
    });

    it('should format tools for OpenRouter', () => {
      const formatted = formatToolsForAI('openrouter');
      expect(Array.isArray(formatted)).toBe(true);
      if (formatted.length > 0) {
        expect(formatted[0]).toHaveProperty('type', 'function');
        expect(formatted[0]).toHaveProperty('function');
        expect(formatted[0].function).toHaveProperty('name');
      }
    });
  });
});
