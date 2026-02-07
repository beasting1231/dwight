import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the modules to test
import {
  fileTools,
  executeFileTool,
  readFile,
  writeFile,
  editFile,
  listFiles,
  searchFiles,
  deleteFile,
  copyFile,
  moveFile,
  getFileInfo,
} from '../src/tools/files/index.js';

import {
  validatePath,
  checkPathTraversal,
  checkSystemDirectory,
  detectSensitiveFile,
  isAbsolutePath,
  ensureAbsolutePath,
} from '../src/tools/files/security.js';

// Test fixtures
let testDir;
let testFile;

beforeAll(async () => {
  // Create a temporary test directory
  testDir = path.join(os.tmpdir(), `dwight-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });

  // Create a test file
  testFile = path.join(testDir, 'test.txt');
  await fs.writeFile(testFile, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n');

  // Create a subdirectory with files
  const subDir = path.join(testDir, 'subdir');
  await fs.mkdir(subDir);
  await fs.writeFile(path.join(subDir, 'nested.js'), 'console.log("hello");');
  await fs.writeFile(path.join(subDir, 'nested.txt'), 'nested content');
});

afterAll(async () => {
  // Cleanup test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('fileTools definitions', () => {
  it('should export an array of tools', () => {
    expect(Array.isArray(fileTools)).toBe(true);
    expect(fileTools.length).toBe(9);
  });

  it('should have file_read tool', () => {
    const tool = fileTools.find(t => t.name === 'file_read');
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toContain('path');
  });

  it('should have file_write tool', () => {
    const tool = fileTools.find(t => t.name === 'file_write');
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toContain('path');
    expect(tool.parameters.required).toContain('content');
  });

  it('should have file_edit tool', () => {
    const tool = fileTools.find(t => t.name === 'file_edit');
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toContain('path');
    expect(tool.parameters.required).toContain('old_string');
    expect(tool.parameters.required).toContain('new_string');
  });

  it('should have file_list tool', () => {
    const tool = fileTools.find(t => t.name === 'file_list');
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toContain('path');
  });

  it('should have file_search tool', () => {
    const tool = fileTools.find(t => t.name === 'file_search');
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toContain('path');
    expect(tool.parameters.required).toContain('pattern');
  });

  it('should have file_delete tool', () => {
    const tool = fileTools.find(t => t.name === 'file_delete');
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toContain('path');
  });

  it('should have file_copy tool', () => {
    const tool = fileTools.find(t => t.name === 'file_copy');
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toContain('source');
    expect(tool.parameters.required).toContain('destination');
  });

  it('should have file_move tool', () => {
    const tool = fileTools.find(t => t.name === 'file_move');
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toContain('source');
    expect(tool.parameters.required).toContain('destination');
  });

  it('should have file_info tool', () => {
    const tool = fileTools.find(t => t.name === 'file_info');
    expect(tool).toBeDefined();
    expect(tool.parameters.required).toContain('path');
  });

  it('each tool should have required properties', () => {
    fileTools.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('parameters');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.parameters).toHaveProperty('type', 'object');
    });
  });
});

describe('security module', () => {
  describe('checkPathTraversal', () => {
    it('should allow normal paths', () => {
      expect(checkPathTraversal('/home/user/file.txt').valid).toBe(true);
      expect(checkPathTraversal('/tmp/test').valid).toBe(true);
    });

    it('should block path traversal', () => {
      expect(checkPathTraversal('/home/user/../root/.ssh/id_rsa').valid).toBe(false);
      expect(checkPathTraversal('../../etc/passwd').valid).toBe(false);
    });

    it('should reject null bytes', () => {
      expect(checkPathTraversal('/home/user\0/file').valid).toBe(false);
    });

    it('should reject empty paths', () => {
      expect(checkPathTraversal('').valid).toBe(false);
      expect(checkPathTraversal(null).valid).toBe(false);
    });
  });

  describe('checkSystemDirectory', () => {
    it('should block system directories', () => {
      expect(checkSystemDirectory('/etc/passwd').allowed).toBe(false);
      expect(checkSystemDirectory('/sys/kernel').allowed).toBe(false);
      expect(checkSystemDirectory('/proc/1/status').allowed).toBe(false);
    });

    it('should allow normal directories', () => {
      expect(checkSystemDirectory('/home/user').allowed).toBe(true);
      expect(checkSystemDirectory('/tmp/test').allowed).toBe(true);
    });
  });

  describe('detectSensitiveFile', () => {
    it('should detect .env files', () => {
      expect(detectSensitiveFile('/project/.env').sensitive).toBe(true);
      expect(detectSensitiveFile('/project/.env.local').sensitive).toBe(true);
    });

    it('should detect credential files', () => {
      expect(detectSensitiveFile('/home/user/.ssh/id_rsa').sensitive).toBe(true);
      expect(detectSensitiveFile('credentials.json').sensitive).toBe(true);
      expect(detectSensitiveFile('password.txt').sensitive).toBe(true);
    });

    it('should not flag normal files', () => {
      expect(detectSensitiveFile('/project/index.js').sensitive).toBe(false);
      expect(detectSensitiveFile('/project/readme.md').sensitive).toBe(false);
    });
  });

  describe('validatePath', () => {
    it('should combine all security checks', () => {
      expect(validatePath('/tmp/test.txt').valid).toBe(true);
      expect(validatePath('/etc/passwd').valid).toBe(false);
      expect(validatePath('../../../etc/passwd').valid).toBe(false);
    });

    it('should support allowed paths restriction', () => {
      const options = { allowedPaths: ['/home/user', '/tmp'] };
      expect(validatePath('/home/user/file.txt', options).valid).toBe(true);
      expect(validatePath('/var/log/syslog', options).valid).toBe(false);
    });
  });

  describe('isAbsolutePath', () => {
    it('should identify absolute paths', () => {
      expect(isAbsolutePath('/home/user')).toBe(true);
      expect(isAbsolutePath('./relative')).toBe(false);
      expect(isAbsolutePath('relative')).toBe(false);
    });
  });

  describe('ensureAbsolutePath', () => {
    it('should return absolute paths as-is', () => {
      expect(ensureAbsolutePath('/absolute/path')).toBe('/absolute/path');
    });

    it('should resolve relative paths', () => {
      const result = ensureAbsolutePath('relative/path', '/base');
      expect(result).toBe('/base/relative/path');
    });
  });
});

describe('file actions', () => {
  describe('readFile', () => {
    it('should read file contents with line numbers', async () => {
      const result = await readFile(testFile);
      expect(result.error).toBeUndefined();
      expect(result.content).toContain('1');
      expect(result.content).toContain('Line 1');
      expect(result.totalLines).toBe(6); // 5 lines + trailing newline
    });

    it('should support offset and limit', async () => {
      const result = await readFile(testFile, 2, 2);
      expect(result.error).toBeUndefined();
      expect(result.content).toContain('Line 2');
      expect(result.content).toContain('Line 3');
      expect(result.linesReturned).toBe(2);
      expect(result.startLine).toBe(2);
    });

    it('should return error for non-existent file', async () => {
      const result = await readFile('/nonexistent/file.txt');
      expect(result.error).toContain('not found');
    });

    it('should block system directories', async () => {
      const result = await readFile('/etc/passwd');
      expect(result.error).toContain('blocked');
    });
  });

  describe('writeFile', () => {
    it('should write content to a file', async () => {
      const newFile = path.join(testDir, 'new-file.txt');
      const result = await writeFile(newFile, 'Hello World');

      expect(result.success).toBe(true);
      expect(result.size).toBeGreaterThan(0);

      const content = await fs.readFile(newFile, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should create parent directories when requested', async () => {
      const deepFile = path.join(testDir, 'deep', 'nested', 'file.txt');
      const result = await writeFile(deepFile, 'Deep content', true);

      expect(result.success).toBe(true);
      const content = await fs.readFile(deepFile, 'utf-8');
      expect(content).toBe('Deep content');
    });

    it('should fail if parent directory does not exist', async () => {
      const noParent = path.join(testDir, 'noparent', 'file.txt');
      const result = await writeFile(noParent, 'content', false);

      expect(result.error).toContain('does not exist');
    });
  });

  describe('editFile', () => {
    let editTestFile;

    beforeEach(async () => {
      editTestFile = path.join(testDir, `edit-test-${Date.now()}.txt`);
      await fs.writeFile(editTestFile, 'Hello World\nGoodbye World\n');
    });

    it('should replace text in a file', async () => {
      const result = await editFile(editTestFile, 'Hello', 'Hi');

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(1);

      const content = await fs.readFile(editTestFile, 'utf-8');
      expect(content).toContain('Hi World');
    });

    it('should fail when text is not unique', async () => {
      const result = await editFile(editTestFile, 'World', 'Universe');

      expect(result.error).toContain('occurrences');
    });

    it('should replace all when replace_all is true', async () => {
      const result = await editFile(editTestFile, 'World', 'Universe', true);

      expect(result.success).toBe(true);
      expect(result.replacements).toBe(2);

      const content = await fs.readFile(editTestFile, 'utf-8');
      expect(content).toContain('Hello Universe');
      expect(content).toContain('Goodbye Universe');
    });

    it('should fail when text is not found', async () => {
      const result = await editFile(editTestFile, 'NotFound', 'Replacement');

      expect(result.error).toContain('not found');
    });
  });

  describe('listFiles', () => {
    it('should list files in a directory', async () => {
      const result = await listFiles(testDir);

      expect(result.error).toBeUndefined();
      expect(result.count).toBeGreaterThan(0);
      expect(result.files.some(f => f.name === 'test.txt')).toBe(true);
    });

    it('should filter by pattern', async () => {
      const result = await listFiles(testDir, { pattern: '*.txt' });

      expect(result.error).toBeUndefined();
      result.files.forEach(f => {
        if (!f.isDirectory) {
          expect(f.name.endsWith('.txt')).toBe(true);
        }
      });
    });

    it('should list recursively', async () => {
      const result = await listFiles(testDir, { recursive: true });

      expect(result.error).toBeUndefined();
      expect(result.files.some(f => f.name === 'nested.js')).toBe(true);
    });

    it('should return error for non-existent directory', async () => {
      const result = await listFiles('/nonexistent/directory');

      expect(result.error).toContain('not found');
    });
  });

  describe('searchFiles', () => {
    it('should search for pattern in file', async () => {
      const result = await searchFiles(testFile, 'Line');

      expect(result.error).toBeUndefined();
      expect(result.totalMatches).toBeGreaterThan(0);
    });

    it('should search recursively in directory', async () => {
      const result = await searchFiles(testDir, 'console');

      expect(result.error).toBeUndefined();
      expect(result.totalMatches).toBeGreaterThan(0);
    });

    it('should support case insensitive search', async () => {
      const result = await searchFiles(testFile, 'LINE', { caseInsensitive: true });

      expect(result.error).toBeUndefined();
      expect(result.totalMatches).toBeGreaterThan(0);
    });

    it('should limit results', async () => {
      const result = await searchFiles(testFile, 'Line', { maxResults: 2 });

      expect(result.error).toBeUndefined();
      expect(result.totalMatches).toBeLessThanOrEqual(2);
    });

    it('should return error for invalid regex', async () => {
      const result = await searchFiles(testFile, '[invalid');

      expect(result.error).toContain('Invalid regex');
    });
  });

  describe('deleteFile', () => {
    it('should delete a file', async () => {
      const fileToDelete = path.join(testDir, 'to-delete.txt');
      await fs.writeFile(fileToDelete, 'delete me');

      const result = await deleteFile(fileToDelete);

      expect(result.success).toBe(true);

      // Verify file is deleted
      await expect(fs.access(fileToDelete)).rejects.toThrow();
    });

    it('should return error for non-existent file', async () => {
      const result = await deleteFile('/nonexistent/file.txt');

      expect(result.error).toContain('not found');
    });

    it('should not delete directories', async () => {
      const result = await deleteFile(testDir);

      expect(result.error).toContain('directory');
    });
  });

  describe('copyFile', () => {
    it('should copy a file', async () => {
      const dest = path.join(testDir, 'copy-dest.txt');
      const result = await copyFile(testFile, dest);

      expect(result.success).toBe(true);

      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toContain('Line 1');
    });

    it('should not overwrite by default', async () => {
      const existing = path.join(testDir, 'existing.txt');
      await fs.writeFile(existing, 'existing content');

      const result = await copyFile(testFile, existing);

      expect(result.error).toContain('already exists');
    });

    it('should overwrite when requested', async () => {
      const existing = path.join(testDir, 'overwrite-me.txt');
      await fs.writeFile(existing, 'old content');

      const result = await copyFile(testFile, existing, true);

      expect(result.success).toBe(true);

      const content = await fs.readFile(existing, 'utf-8');
      expect(content).toContain('Line 1');
    });
  });

  describe('moveFile', () => {
    it('should move a file', async () => {
      const source = path.join(testDir, 'move-source.txt');
      await fs.writeFile(source, 'move me');

      const dest = path.join(testDir, 'move-dest.txt');
      const result = await moveFile(source, dest);

      expect(result.success).toBe(true);

      // Source should not exist
      await expect(fs.access(source)).rejects.toThrow();

      // Dest should exist with content
      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toBe('move me');
    });

    it('should not overwrite by default', async () => {
      const source = path.join(testDir, 'move-src2.txt');
      await fs.writeFile(source, 'source');

      const existing = path.join(testDir, 'move-existing.txt');
      await fs.writeFile(existing, 'existing');

      const result = await moveFile(source, existing);

      expect(result.error).toContain('already exists');
    });
  });

  describe('getFileInfo', () => {
    it('should return file metadata', async () => {
      const result = await getFileInfo(testFile);

      expect(result.error).toBeUndefined();
      expect(result.name).toBe('test.txt');
      expect(result.isFile).toBe(true);
      expect(result.isDirectory).toBe(false);
      expect(result.size).toBeGreaterThan(0);
      expect(result.created).toBeDefined();
      expect(result.modified).toBeDefined();
      expect(result.permissions).toBeDefined();
    });

    it('should return directory info', async () => {
      const result = await getFileInfo(testDir);

      expect(result.error).toBeUndefined();
      expect(result.isFile).toBe(false);
      expect(result.isDirectory).toBe(true);
    });

    it('should return error for non-existent file', async () => {
      const result = await getFileInfo('/nonexistent/file.txt');

      expect(result.error).toContain('not found');
    });
  });
});

describe('executeFileTool', () => {
  it('should execute file_read', async () => {
    const result = await executeFileTool('file_read', { path: testFile });
    expect(result.content).toBeDefined();
  });

  it('should execute file_info', async () => {
    const result = await executeFileTool('file_info', { path: testFile });
    expect(result.name).toBe('test.txt');
  });

  it('should return error for unknown tool', async () => {
    const result = await executeFileTool('unknown_tool', {});
    expect(result.error).toContain('Unknown');
  });
});

describe('tools index integration', () => {
  let allTools, getTool, getToolsByCategory;

  beforeAll(async () => {
    const tools = await import('../src/tools/index.js');
    allTools = tools.allTools;
    getTool = tools.getTool;
    getToolsByCategory = tools.getToolsByCategory;
  });

  it('should include file tools in allTools', () => {
    const fileTool = allTools.find(t => t.name.startsWith('file_'));
    expect(fileTool).toBeDefined();
  });

  it('should return file tools by category', () => {
    const tools = getToolsByCategory('file');
    expect(tools.length).toBe(9);
    tools.forEach(tool => {
      expect(tool.name.startsWith('file_')).toBe(true);
    });
  });

  it('should get file_read tool by name', () => {
    const tool = getTool('file_read');
    expect(tool).toBeDefined();
    expect(tool.name).toBe('file_read');
  });
});
