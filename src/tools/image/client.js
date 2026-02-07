/**
 * Image generation client using Google GenAI (Nano Banana Pro / Gemini 3 Pro Image)
 */

import { GoogleGenAI } from '@google/genai';
import { loadConfig } from '../../config.js';

let genaiClient = null;

/**
 * Get or create the GenAI client
 * @returns {GoogleGenAI}
 */
export function getGenAIClient() {
  if (!genaiClient) {
    const config = loadConfig();
    const apiKey = config?.image?.googleApiKey;
    if (!apiKey) {
      throw new Error('Google AI API key not configured. Run "image" command to set it up.');
    }
    genaiClient = new GoogleGenAI({ apiKey });
  }
  return genaiClient;
}

/**
 * Generate an image from a text prompt
 * @param {Object} options
 * @param {string} options.prompt - Text description of the image
 * @param {string} options.aspectRatio - Aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4)
 * @param {string} options.quality - Output quality (standard, 4k)
 * @returns {Promise<Buffer>} Image buffer (PNG)
 */
export async function generateImage(options) {
  const { prompt, aspectRatio = '1:1', quality = 'standard' } = options;

  const client = getGenAIClient();

  const response = await client.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: prompt,
    config: {
      responseModalities: ['image', 'text'],
      imageConfig: {
        aspectRatio,
        imageSize: quality === '4k' ? '4K' : '1K',
      },
    },
  });

  // Extract image from response
  const parts = response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(
    part => part.inlineData?.mimeType?.startsWith('image/')
  );

  if (!imagePart?.inlineData?.data) {
    // Check for text response that might explain why no image
    const textPart = parts.find(part => part.text);
    if (textPart?.text) {
      throw new Error(`Image generation failed: ${textPart.text}`);
    }
    throw new Error('No image generated. The model may have refused the prompt or encountered an error.');
  }

  // Convert base64 to buffer
  return Buffer.from(imagePart.inlineData.data, 'base64');
}

/**
 * Edit an existing image based on instructions
 * @param {Object} options
 * @param {string} options.instruction - Edit instructions
 * @param {Buffer|string} options.image - Image buffer or URL
 * @returns {Promise<Buffer>} Edited image buffer
 */
export async function editImage(options) {
  const { instruction, image } = options;

  const client = getGenAIClient();

  // Prepare image data
  let imageData;
  if (Buffer.isBuffer(image)) {
    imageData = {
      inlineData: {
        data: image.toString('base64'),
        mimeType: 'image/png',
      },
    };
  } else if (typeof image === 'string') {
    // Fetch image from URL
    const response = await fetch(image);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const mimeType = response.headers.get('content-type') || 'image/png';
    imageData = {
      inlineData: {
        data: Buffer.from(buffer).toString('base64'),
        mimeType,
      },
    };
  } else {
    throw new Error('Invalid image input: expected Buffer or URL string');
  }

  const response = await client.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [
      { inlineData: imageData.inlineData },
      { text: instruction },
    ],
    config: {
      responseModalities: ['image', 'text'],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(
    part => part.inlineData?.mimeType?.startsWith('image/')
  );

  if (!imagePart?.inlineData?.data) {
    const textPart = parts.find(part => part.text);
    if (textPart?.text) {
      throw new Error(`Image edit failed: ${textPart.text}`);
    }
    throw new Error('Image edit failed. The model may have refused or encountered an error.');
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}

/**
 * Check if image tools are configured
 * @returns {boolean}
 */
export function isImageConfigured() {
  const config = loadConfig();
  return !!config?.image?.googleApiKey && config?.image?.enabled !== false;
}

/**
 * Reset client (call after config change)
 */
export function resetClient() {
  genaiClient = null;
}
