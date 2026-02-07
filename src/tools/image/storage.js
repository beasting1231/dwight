/**
 * Local storage for generated images
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, '..', '..', '..', 'images');

// In-memory index of last image per chat
const lastImageIndex = new Map();

/**
 * Ensure images directory exists
 */
function ensureDir() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

/**
 * Slugify text for use in filename
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function slugify(text, maxLength = 40) {
  if (!text) return '';

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')          // Spaces to dashes
    .replace(/-+/g, '-')           // Multiple dashes to single
    .replace(/^-|-$/g, '')         // Trim dashes from ends
    .substring(0, maxLength);
}

/**
 * Generate a filename for an image
 * @param {string} description - Prompt or instruction to use in filename
 * @returns {string}
 */
function generateFilename(description = '') {
  const slug = slugify(description) || 'image';
  const timestamp = Date.now().toString(36); // Short base36 timestamp
  return `${slug}-${timestamp}.png`;
}

/**
 * Save an image to local storage
 * @param {string|number} chatId - Chat ID
 * @param {Buffer} buffer - Image buffer
 * @param {string} type - 'gen' or 'edit'
 * @param {Object} metadata - Additional metadata (prompt, instruction, etc.)
 * @returns {string} - Path to saved image
 */
export function saveImage(chatId, buffer, type = 'gen', metadata = {}) {
  ensureDir();

  // Use prompt or instruction for descriptive filename
  const description = metadata.prompt || metadata.instruction || '';
  const filename = generateFilename(description);
  const filepath = path.join(IMAGES_DIR, filename);

  // Save image
  fs.writeFileSync(filepath, buffer);

  // Save metadata
  const metaPath = filepath.replace('.png', '.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    chatId,
    type,
    createdAt: new Date().toISOString(),
    ...metadata,
  }, null, 2));

  // Update last image index
  lastImageIndex.set(String(chatId), {
    filepath,
    timestamp: Date.now(),
  });

  return filepath;
}

/**
 * Get the last generated/edited image for a chat
 * @param {string|number} chatId - Chat ID
 * @returns {Buffer|null}
 */
export function getLastImage(chatId) {
  // Check in-memory index first (for images just created this session)
  const entry = lastImageIndex.get(String(chatId));
  if (entry && fs.existsSync(entry.filepath)) {
    return fs.readFileSync(entry.filepath);
  }

  // Fallback: scan directory for most recent image for this chat
  const files = listImagesForChat(chatId);
  if (files.length > 0) {
    const mostRecent = files[0]; // Already sorted by date desc
    lastImageIndex.set(String(chatId), {
      filepath: mostRecent.filepath,
      timestamp: Date.now(),
    });
    return fs.readFileSync(mostRecent.filepath);
  }

  return null;
}

/**
 * List all images for a chat
 * @param {string|number} chatId - Chat ID
 * @returns {Array<{filename, filepath, createdAt, type}>}
 */
export function listImagesForChat(chatId) {
  ensureDir();

  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => f.endsWith('.png'))
    .map(filename => {
      const filepath = path.join(IMAGES_DIR, filename);
      const metaPath = filepath.replace('.png', '.json');
      let metadata = {};

      if (fs.existsSync(metaPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {
          // Ignore parse errors
        }
      }

      return {
        filename,
        filepath,
        createdAt: metadata.createdAt || fs.statSync(filepath).mtime.toISOString(),
        type: metadata.type || 'unknown',
        prompt: metadata.prompt,
        instruction: metadata.instruction,
        chatId: metadata.chatId,
      };
    })
    .filter(f => String(f.chatId) === String(chatId)) // Filter by chatId from metadata
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return files;
}

/**
 * Get path to images directory
 * @returns {string}
 */
export function getImagesDir() {
  ensureDir();
  return IMAGES_DIR;
}

/**
 * Clean up old images (older than maxAge)
 * @param {number} maxAgeDays - Max age in days (default 30)
 * @returns {number} - Number of files deleted
 */
export function cleanupOldImages(maxAgeDays = 30) {
  ensureDir();

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let deleted = 0;

  const files = fs.readdirSync(IMAGES_DIR);
  for (const filename of files) {
    const filepath = path.join(IMAGES_DIR, filename);
    const stats = fs.statSync(filepath);

    if (now - stats.mtime.getTime() > maxAgeMs) {
      fs.unlinkSync(filepath);
      deleted++;
    }
  }

  return deleted;
}
