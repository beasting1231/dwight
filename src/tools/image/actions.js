/**
 * Image generation actions with background task support
 */

import { generateImage as clientGenerate, editImage as clientEdit } from './client.js';
import {
  createBackgroundTask,
  updateBackgroundTask,
  addPhotoNotification,
  addNotification,
  addToolLog,
  addRunningTask,
  removeRunningTask,
} from '../../state.js';
import { saveImage, getLastImage, getImagesDir } from './storage.js';

/**
 * Truncate a string to a max length
 * @param {string} str
 * @param {number} len
 * @returns {string}
 */
function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

/**
 * Start image generation as a background task
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - Image description
 * @param {string} params.referenceImage - Optional reference image path
 * @param {string} params.aspectRatio - Aspect ratio
 * @param {string} params.quality - Output quality
 * @param {string|number} chatId - Chat to notify when complete
 * @returns {Object} Immediate response with task status
 */
export async function startImageGeneration(params, chatId) {
  const taskId = createBackgroundTask(chatId, 'image_generate', {
    prompt: params.prompt,
    referenceImage: params.referenceImage,
    aspectRatio: params.aspectRatio,
    quality: params.quality,
  });

  // Start generation in background (don't await)
  runImageGeneration(taskId, params, chatId);

  return {
    status: 'started',
    taskId,
    message: 'Image generation started in background.',
    imagesDir: getImagesDir(),
    instruction: 'Tell the user their image is being generated and they can continue chatting. They will be notified when ready. Use image_list to find the filepath after generation completes.',
  };
}

/**
 * Background image generation runner
 * @param {string} taskId
 * @param {Object} params
 * @param {string|number} chatId
 */
async function runImageGeneration(taskId, params, chatId) {
  updateBackgroundTask(taskId, { status: 'running' });
  addRunningTask(taskId, `generating "${truncate(params.prompt, 25)}"`);

  try {
    const imageBuffer = await clientGenerate({
      prompt: params.prompt,
      referenceImage: params.referenceImage,
      aspectRatio: params.aspectRatio || '1:1',
      quality: params.quality || 'standard',
    });

    // Save image to local storage
    const filepath = saveImage(chatId, imageBuffer, 'gen', { prompt: params.prompt });

    updateBackgroundTask(taskId, { status: 'completed', result: imageBuffer, filepath });

    // Queue simple photo notification
    addPhotoNotification(chatId, imageBuffer, "Here's your image!");

    removeRunningTask(taskId);
    addToolLog({ tool: 'image_generate', status: 'success', detail: truncate(params.prompt, 30) });
  } catch (error) {
    updateBackgroundTask(taskId, { status: 'failed', error: error.message });

    // Queue error notification as text
    addNotification(`Image generation failed: ${error.message}`);

    removeRunningTask(taskId);
    addToolLog({ tool: 'image_generate', status: 'error', detail: error.message });
  }
}

/**
 * Start image editing as a background task
 * @param {Object} params - Edit parameters
 * @param {string} params.instruction - Edit instructions
 * @param {string} params.imageUrl - URL of image to edit
 * @param {string|number} chatId - Chat to notify when complete
 * @param {Buffer} imageBuffer - Optional image buffer if user shared an image
 * @returns {Object} Immediate response with task status
 */
export async function startImageEdit(params, chatId, imageBuffer = null) {
  // Check for last generated image if no explicit image provided
  let imageToEdit = imageBuffer;
  if (!params.imageUrl && !imageToEdit) {
    imageToEdit = getLastImage(chatId);
  }

  if (!params.imageUrl && !imageToEdit) {
    return {
      error: 'No image available to edit. Generate an image first, or provide an image URL.',
    };
  }

  const taskId = createBackgroundTask(chatId, 'image_edit', {
    instruction: params.instruction,
  });

  // Start edit in background (don't await)
  runImageEdit(taskId, params, chatId, imageToEdit);

  return {
    status: 'started',
    taskId,
    message: 'Image edit started in background.',
    imagesDir: getImagesDir(),
    instruction: 'Tell the user their image is being edited and they can continue chatting. They will be notified when ready. Use image_list to find the filepath after editing completes.',
  };
}

/**
 * Background image edit runner
 * @param {string} taskId
 * @param {Object} params
 * @param {string|number} chatId
 * @param {Buffer} imageBuffer
 */
async function runImageEdit(taskId, params, chatId, imageBuffer) {
  updateBackgroundTask(taskId, { status: 'running' });
  addRunningTask(taskId, `editing "${truncate(params.instruction, 25)}"`);

  try {
    const result = await clientEdit({
      instruction: params.instruction,
      image: imageBuffer || params.imageUrl,
    });

    // Save edited image to local storage
    const filepath = saveImage(chatId, result, 'edit', { instruction: params.instruction });

    updateBackgroundTask(taskId, { status: 'completed', result, filepath });

    // Queue simple photo notification
    addPhotoNotification(chatId, result, "Here's your edited image!");

    removeRunningTask(taskId);
    addToolLog({ tool: 'image_edit', status: 'success', detail: truncate(params.instruction, 30) });
  } catch (error) {
    updateBackgroundTask(taskId, { status: 'failed', error: error.message });
    addNotification(`Image edit failed: ${error.message}`);

    removeRunningTask(taskId);
    addToolLog({ tool: 'image_edit', status: 'error', detail: error.message });
  }
}
