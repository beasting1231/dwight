/**
 * Image generation tool tests
 */

import { jest } from '@jest/globals';

// Mock fetch globally for image URL fetching
global.fetch = jest.fn();

describe('Image Tool Definitions', () => {
  beforeEach(async () => {
    jest.resetModules();
  });

  it('should export image_generate, image_edit, and image_list tools', async () => {
    const { imageTools } = await import('../src/tools/image/index.js');
    expect(imageTools).toHaveLength(3);
    expect(imageTools.map(t => t.name)).toContain('image_generate');
    expect(imageTools.map(t => t.name)).toContain('image_edit');
    expect(imageTools.map(t => t.name)).toContain('image_list');
  });

  it('should have correct parameter schemas for image_generate', async () => {
    const { imageTools } = await import('../src/tools/image/index.js');
    const genTool = imageTools.find(t => t.name === 'image_generate');

    expect(genTool.parameters.properties.prompt).toBeDefined();
    expect(genTool.parameters.properties.aspectRatio).toBeDefined();
    expect(genTool.parameters.properties.quality).toBeDefined();
    expect(genTool.parameters.required).toContain('prompt');
  });

  it('should have correct parameter schemas for image_edit', async () => {
    const { imageTools } = await import('../src/tools/image/index.js');
    const editTool = imageTools.find(t => t.name === 'image_edit');

    expect(editTool.parameters.properties.instruction).toBeDefined();
    expect(editTool.parameters.properties.imageUrl).toBeDefined();
    expect(editTool.parameters.required).toContain('instruction');
  });

  it('should have valid aspectRatio enum values', async () => {
    const { imageTools } = await import('../src/tools/image/index.js');
    const genTool = imageTools.find(t => t.name === 'image_generate');

    const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    expect(genTool.parameters.properties.aspectRatio.enum).toEqual(validRatios);
  });

  it('should have valid quality enum values', async () => {
    const { imageTools } = await import('../src/tools/image/index.js');
    const genTool = imageTools.find(t => t.name === 'image_generate');

    expect(genTool.parameters.properties.quality.enum).toEqual(['standard', '4k']);
  });

  it('should have descriptions that mention background task for generate/edit', async () => {
    const { imageTools } = await import('../src/tools/image/index.js');

    const bgTools = imageTools.filter(t => t.name === 'image_generate' || t.name === 'image_edit');
    for (const tool of bgTools) {
      expect(tool.description).toContain('BACKGROUND TASK');
    }
  });

  it('should have image_list tool', async () => {
    const { imageTools } = await import('../src/tools/image/index.js');
    const listTool = imageTools.find(t => t.name === 'image_list');
    expect(listTool).toBeDefined();
  });
});

describe('State Management for Background Tasks', () => {
  beforeEach(async () => {
    jest.resetModules();
  });

  it('should export background task functions', async () => {
    const state = await import('../src/state.js');

    expect(typeof state.createBackgroundTask).toBe('function');
    expect(typeof state.updateBackgroundTask).toBe('function');
    expect(typeof state.getBackgroundTask).toBe('function');
    expect(typeof state.addPhotoNotification).toBe('function');
    expect(typeof state.getAndClearPhotoNotifications).toBe('function');
    expect(typeof state.getChatsWithPendingPhotos).toBe('function');
  });

  it('should create and retrieve background task', async () => {
    const state = await import('../src/state.js');

    const taskId = state.createBackgroundTask(123, 'image_generate', { prompt: 'test' });

    expect(taskId).toBeDefined();
    expect(taskId).toContain('task_');

    const task = state.getBackgroundTask(taskId);
    expect(task).toBeDefined();
    expect(task.type).toBe('image_generate');
    expect(task.chatId).toBe(123);
    expect(task.status).toBe('pending');
    expect(task.metadata.prompt).toBe('test');
  });

  it('should update background task', async () => {
    const state = await import('../src/state.js');

    const taskId = state.createBackgroundTask(123, 'image_generate', {});
    state.updateBackgroundTask(taskId, { status: 'running' });

    const task = state.getBackgroundTask(taskId);
    expect(task.status).toBe('running');
  });

  it('should queue and retrieve photo notifications', async () => {
    const state = await import('../src/state.js');

    const mockBuffer = Buffer.from('fake-image-data');
    state.addPhotoNotification(123, mockBuffer, 'Test caption');

    const chats = state.getChatsWithPendingPhotos();
    expect(chats).toContain(123);

    const photos = state.getAndClearPhotoNotifications(123);
    expect(photos).toHaveLength(1);
    expect(photos[0].buffer).toEqual(mockBuffer);
    expect(photos[0].caption).toBe('Test caption');

    // Should be cleared now
    const photosAgain = state.getAndClearPhotoNotifications(123);
    expect(photosAgain).toHaveLength(0);
  });

  it('should return empty array for chat with no photos', async () => {
    const state = await import('../src/state.js');

    const photos = state.getAndClearPhotoNotifications(999);
    expect(photos).toEqual([]);
  });

  it('should cleanup old background tasks', async () => {
    const state = await import('../src/state.js');

    const taskId = state.createBackgroundTask(123, 'test', {});

    // Task should exist
    expect(state.getBackgroundTask(taskId)).toBeDefined();

    // Wait a tiny bit then cleanup with 1ms max age
    await new Promise(r => setTimeout(r, 10));
    state.cleanupBackgroundTasks(1);

    // Task should be gone
    expect(state.getBackgroundTask(taskId)).toBeUndefined();
  });
});

describe('Image Actions', () => {
  beforeEach(async () => {
    jest.resetModules();
  });

  it('should return error when no image available for edit', async () => {
    const { startImageEdit } = await import('../src/tools/image/actions.js');

    const result = await startImageEdit(
      { instruction: 'Make it blue' },
      999999 // Use a chat ID with no stored image
    );

    expect(result.error).toBeDefined();
    expect(result.error).toContain('No image available');
  });
});

describe('Local Image Storage', () => {
  beforeEach(async () => {
    jest.resetModules();
  });

  it('should save and retrieve image from disk', async () => {
    const storage = await import('../src/tools/image/storage.js');

    const mockBuffer = Buffer.from('test-image-data-' + Date.now());
    const chatId = 'test_' + Date.now();

    // Save image
    const filepath = storage.saveImage(chatId, mockBuffer, 'gen', { prompt: 'test prompt' });
    expect(filepath).toContain('.png');

    // Retrieve last image
    const retrieved = storage.getLastImage(chatId);
    expect(retrieved).toEqual(mockBuffer);

    // Cleanup
    const fs = await import('fs');
    fs.unlinkSync(filepath);
    fs.unlinkSync(filepath.replace('.png', '.json'));
  });

  it('should return null for chat with no stored image', async () => {
    const storage = await import('../src/tools/image/storage.js');

    const retrieved = storage.getLastImage('nonexistent_chat_' + Date.now());
    expect(retrieved).toBeNull();
  });

  it('should list images for a chat', async () => {
    const storage = await import('../src/tools/image/storage.js');

    const chatId = 'listtest_' + Date.now();
    const mockBuffer = Buffer.from('test');

    // Save two images
    const path1 = storage.saveImage(chatId, mockBuffer, 'gen', { prompt: 'first' });
    await new Promise(r => setTimeout(r, 10)); // Small delay for different timestamps
    const path2 = storage.saveImage(chatId, mockBuffer, 'edit', { instruction: 'second' });

    const images = storage.listImagesForChat(chatId);
    expect(images.length).toBe(2);
    expect(images[0].type).toBe('edit'); // Most recent first

    // Cleanup
    const fs = await import('fs');
    fs.unlinkSync(path1);
    fs.unlinkSync(path1.replace('.png', '.json'));
    fs.unlinkSync(path2);
    fs.unlinkSync(path2.replace('.png', '.json'));
  });
});

describe('Image Client Helpers', () => {
  beforeEach(async () => {
    jest.resetModules();
  });

  it('should check configuration status', async () => {
    const { isImageConfigured } = await import('../src/tools/image/client.js');

    // Will return false when no config exists (test environment)
    const result = isImageConfigured();
    expect(typeof result).toBe('boolean');
  });
});
