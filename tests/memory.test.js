import { jest } from '@jest/globals';
import fs from 'fs';

describe('memory tools', () => {
  let memoryTools, executeMemoryTool, readMemory, writeMemory, loadAllMemory, buildSystemPromptWithMemory;

  beforeAll(async () => {
    const memory = await import('../src/tools/memory/index.js');
    memoryTools = memory.memoryTools;
    executeMemoryTool = memory.executeMemoryTool;
    readMemory = memory.readMemory;
    writeMemory = memory.writeMemory;
    loadAllMemory = memory.loadAllMemory;
    buildSystemPromptWithMemory = memory.buildSystemPromptWithMemory;
  });

  describe('memoryTools definitions', () => {
    it('should export an array of tools', () => {
      expect(Array.isArray(memoryTools)).toBe(true);
      expect(memoryTools.length).toBe(3);
    });

    it('should have memory_read tool', () => {
      const tool = memoryTools.find(t => t.name === 'memory_read');
      expect(tool).toBeDefined();
      expect(tool.parameters.required).toContain('file');
    });

    it('should have memory_update tool', () => {
      const tool = memoryTools.find(t => t.name === 'memory_update');
      expect(tool).toBeDefined();
      expect(tool.parameters.required).toContain('file');
      expect(tool.parameters.required).toContain('content');
    });

    it('should have memory_append tool', () => {
      const tool = memoryTools.find(t => t.name === 'memory_append');
      expect(tool).toBeDefined();
      expect(tool.parameters.required).toContain('section');
      expect(tool.parameters.required).toContain('content');
    });
  });

  describe('readMemory', () => {
    it('should read soul.md', () => {
      const content = readMemory('soul');
      expect(content).toBeDefined();
      expect(content).toContain('Dwight');
    });

    it('should read user.md', () => {
      const content = readMemory('user');
      expect(content).toBeDefined();
      expect(content).toContain('User Profile');
    });

    it('should read tools.md', () => {
      const content = readMemory('tools');
      expect(content).toBeDefined();
      expect(content).toContain('Tool Usage');
    });

    it('should throw for unknown file', () => {
      expect(() => readMemory('unknown')).toThrow('Unknown memory file');
    });
  });

  describe('loadAllMemory', () => {
    it('should load all memory files', () => {
      const memory = loadAllMemory();
      expect(memory).toHaveProperty('soul');
      expect(memory).toHaveProperty('user');
      expect(memory).toHaveProperty('tools');
    });
  });

  describe('buildSystemPromptWithMemory', () => {
    it('should include base prompt', () => {
      const prompt = buildSystemPromptWithMemory('Base prompt here');
      expect(prompt).toContain('Base prompt here');
    });

    it('should include soul content', () => {
      const prompt = buildSystemPromptWithMemory('');
      expect(prompt).toContain('YOUR IDENTITY AND RULES');
    });

    it('should include user content', () => {
      const prompt = buildSystemPromptWithMemory('');
      expect(prompt).toContain('ABOUT YOUR USER');
    });

    it('should include tools content', () => {
      const prompt = buildSystemPromptWithMemory('');
      expect(prompt).toContain('HOW TO USE YOUR TOOLS');
    });

    it('should include memory update instructions', () => {
      const prompt = buildSystemPromptWithMemory('');
      expect(prompt).toContain('MEMORY UPDATE INSTRUCTIONS');
    });
  });

  describe('executeMemoryTool', () => {
    it('should read memory file', async () => {
      const result = await executeMemoryTool('memory_read', { file: 'soul' });
      expect(result).toHaveProperty('content');
      expect(result.content).toContain('Dwight');
    });

    it('should return error for unknown tool', async () => {
      const result = await executeMemoryTool('unknown_tool', {});
      expect(result).toHaveProperty('error');
    });
  });
});
