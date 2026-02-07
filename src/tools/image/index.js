/**
 * Image generation and editing tools for AI
 *
 * Uses Nano Banana Pro (Gemini 3 Pro Image) for:
 * - Image generation from text prompts
 * - Image editing with instructions
 *
 * Features background task execution so users can continue chatting
 * while images are being generated.
 */

import { startImageGeneration, startImageEdit } from './actions.js';
import { isImageConfigured } from './client.js';
import { listImagesForChat, getImagesDir } from './storage.js';

/**
 * Tool definitions for AI
 */
export const imageTools = [
  {
    name: 'image_generate',
    description: `Generate an image from a text description using Nano Banana Pro (Gemini 3 Pro Image).

This runs as a BACKGROUND TASK - the user can continue chatting while it processes.
After calling this tool, tell the user you're generating the image and they'll be notified when done.

IMPORTANT: All generated images are automatically saved locally in the images/ folder.
The notification will include the full filepath. Use image_list to find saved images.

Use for: creating images, illustrations, art, diagrams, visualizations, photos from text prompts.

Tips for better results:
- Be specific about style (photorealistic, cartoon, watercolor, etc.)
- Describe colors, lighting, composition, and mood
- Include details about perspective and framing`,
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate. Be specific about style, colors, composition, and mood.',
        },
        aspectRatio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          description: 'Image aspect ratio. Use 1:1 for square (default), 16:9 for landscape/desktop, 9:16 for portrait/mobile, 4:3 for photos.',
        },
        quality: {
          type: 'string',
          enum: ['standard', '4k'],
          description: 'Output quality. Use standard for faster generation, 4k for high-detail images (slower).',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'image_edit',
    description: `Edit an existing image based on instructions using Nano Banana Pro.

This runs as a BACKGROUND TASK - the user can continue chatting while it processes.

Use for: modifying images, adding/removing elements, changing styles, enhancing photos, applying effects.

IMPORTANT: If the user just generated an image and wants to edit it, you do NOT need to provide an imageUrl.
The last generated/edited image is automatically available. Just call this tool with the instruction.

Only provide imageUrl if:
- The user provides a specific public URL to edit
- You need to edit an image that wasn't just generated

Do NOT try to fetch Telegram image URLs - they are authenticated and will fail.`,
    parameters: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'What changes to make to the image. Be specific about what to add, remove, or modify.',
        },
        imageUrl: {
          type: 'string',
          description: 'Optional: URL of a PUBLIC image to edit. Do not use Telegram URLs. Leave empty to edit the last generated image.',
        },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'image_list',
    description: `List all locally saved images for this chat.

Returns a list of images with their filepaths, creation times, and metadata (prompts/instructions).
Images are stored in the images/ folder inside the Dwight project directory.

Use this to:
- Find a specific image the user generated earlier
- Get the filepath to open or share an image
- See all images created in this conversation`,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of images to return (default: 10, most recent first)',
        },
      },
      required: [],
    },
  },
];

/**
 * Execute an image tool
 * @param {string} toolName - Tool name
 * @param {Object} params - Tool parameters
 * @param {Object} ctx - Context (includes chatId)
 * @returns {Promise<Object>} - Tool result
 */
export async function executeImageTool(toolName, params, ctx = {}) {
  // Check if image tools are configured
  if (!isImageConfigured()) {
    return {
      error: 'Image generation is not configured. Ask the user to run the "image" command in the CLI to set up their Google AI API key.',
    };
  }

  const { chatId } = ctx;

  try {
    switch (toolName) {
      case 'image_generate':
        if (!params.prompt?.trim()) {
          return { error: 'A prompt is required to generate an image.' };
        }
        return await startImageGeneration(params, chatId);

      case 'image_edit':
        if (!params.instruction?.trim()) {
          return { error: 'Instructions are required to edit an image.' };
        }
        return await startImageEdit(params, chatId);

      case 'image_list': {
        const images = listImagesForChat(chatId);
        const limit = params.limit || 10;
        const limited = images.slice(0, limit);

        if (limited.length === 0) {
          return {
            images: [],
            message: 'No images found for this chat. Generate an image first!',
            imagesDir: getImagesDir(),
          };
        }

        return {
          images: limited.map(img => ({
            filepath: img.filepath,
            filename: img.filename,
            type: img.type === 'gen' ? 'generated' : 'edited',
            createdAt: img.createdAt,
            prompt: img.prompt,
            instruction: img.instruction,
          })),
          total: images.length,
          imagesDir: getImagesDir(),
        };
      }

      default:
        return { error: `Unknown image tool: ${toolName}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

// Re-exports
export { isImageConfigured } from './client.js';
export { setupImage } from './setup.js';
