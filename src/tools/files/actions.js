import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { validatePath, ensureAbsolutePath } from './security.js';
import { addPhotoNotification } from '../../state.js';

/**
 * Read file contents with optional line range
 * Returns content with line numbers (cat -n style)
 * @param {string} filePath - Absolute file path
 * @param {number} offset - Starting line (1-indexed, default: 1)
 * @param {number} limit - Max lines to read (default: 2000)
 * @returns {Promise<Object>}
 */
export async function readFile(filePath, offset = 1, limit = 2000) {
  const absolutePath = ensureAbsolutePath(filePath);

  // Validate path security
  const validation = validatePath(absolutePath);
  if (!validation.valid) {
    return { error: validation.error };
  }

  try {
    // Check if file exists
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      return { error: `'${filePath}' is not a file` };
    }

    // Read file content
    const content = await fs.readFile(absolutePath, 'utf-8');
    const lines = content.split('\n');

    // Apply offset and limit (1-indexed)
    const startIndex = Math.max(0, offset - 1);
    const endIndex = Math.min(lines.length, startIndex + limit);
    const selectedLines = lines.slice(startIndex, endIndex);

    // Format with line numbers
    const numberedLines = selectedLines.map((line, idx) => {
      const lineNum = startIndex + idx + 1;
      const padding = String(lines.length).length;
      return `${String(lineNum).padStart(padding)}  ${line}`;
    });

    const result = {
      path: absolutePath,
      content: numberedLines.join('\n'),
      totalLines: lines.length,
      linesReturned: selectedLines.length,
      startLine: startIndex + 1,
      endLine: startIndex + selectedLines.length,
    };

    if (validation.warning) {
      result.warning = validation.warning;
    }

    return result;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { error: `File not found: ${filePath}` };
    }
    if (error.code === 'EACCES') {
      return { error: `Permission denied: ${filePath}` };
    }
    return { error: error.message };
  }
}

/**
 * Write content to a file
 * @param {string} filePath - Absolute file path
 * @param {string} content - Content to write
 * @param {boolean} createDirs - Create parent directories if needed (default: false)
 * @returns {Promise<Object>}
 */
export async function writeFile(filePath, content, createDirs = false) {
  const absolutePath = ensureAbsolutePath(filePath);

  // Validate path security
  const validation = validatePath(absolutePath);
  if (!validation.valid) {
    return { error: validation.error };
  }

  try {
    // Create parent directories if requested
    if (createDirs) {
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });
    }

    // Check if parent directory exists
    const dir = path.dirname(absolutePath);
    try {
      await fs.access(dir);
    } catch {
      return { error: `Parent directory does not exist: ${dir}. Set createDirs: true to create it.` };
    }

    // Write the file
    await fs.writeFile(absolutePath, content, 'utf-8');

    const stats = await fs.stat(absolutePath);
    const result = {
      success: true,
      path: absolutePath,
      size: stats.size,
      message: `Successfully wrote ${stats.size} bytes to ${path.basename(absolutePath)}`,
    };

    if (validation.warning) {
      result.warning = validation.warning;
    }

    return result;
  } catch (error) {
    if (error.code === 'EACCES') {
      return { error: `Permission denied: ${filePath}` };
    }
    return { error: error.message };
  }
}

/**
 * Find and replace text in a file
 * @param {string} filePath - File path to edit
 * @param {string} oldString - Exact text to find
 * @param {string} newString - Replacement text
 * @param {boolean} replaceAll - Replace all occurrences (default: false)
 * @returns {Promise<Object>}
 */
export async function editFile(filePath, oldString, newString, replaceAll = false) {
  const absolutePath = ensureAbsolutePath(filePath);

  // Validate path security
  const validation = validatePath(absolutePath);
  if (!validation.valid) {
    return { error: validation.error };
  }

  try {
    // Read current content
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Check if old_string exists
    if (!content.includes(oldString)) {
      return { error: `Text not found in file: "${oldString.substring(0, 50)}${oldString.length > 50 ? '...' : ''}"` };
    }

    // Count occurrences
    const regex = new RegExp(escapeRegex(oldString), 'g');
    const matches = content.match(regex);
    const occurrences = matches ? matches.length : 0;

    // Check uniqueness if not replacing all
    if (!replaceAll && occurrences > 1) {
      return {
        error: `Found ${occurrences} occurrences of the text. Either provide more context to make it unique, or set replace_all: true to replace all occurrences.`,
      };
    }

    // Perform replacement
    let newContent;
    if (replaceAll) {
      newContent = content.split(oldString).join(newString);
    } else {
      newContent = content.replace(oldString, newString);
    }

    // Write back
    await fs.writeFile(absolutePath, newContent, 'utf-8');

    const replacements = replaceAll ? occurrences : 1;
    const result = {
      success: true,
      path: absolutePath,
      replacements,
      message: `Successfully replaced ${replacements} occurrence${replacements > 1 ? 's' : ''} in ${path.basename(absolutePath)}`,
    };

    if (validation.warning) {
      result.warning = validation.warning;
    }

    return result;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { error: `File not found: ${filePath}` };
    }
    if (error.code === 'EACCES') {
      return { error: `Permission denied: ${filePath}` };
    }
    return { error: error.message };
  }
}

/**
 * List files in a directory with optional pattern matching
 * @param {string} dirPath - Directory path
 * @param {Object} options - List options
 * @param {string} options.pattern - Glob pattern (e.g., "*.js")
 * @param {string} options.searchName - Name to search for (enables fuzzy matching)
 * @param {boolean} options.recursive - Include subdirectories (default: false)
 * @param {boolean} options.showHidden - Include hidden files (default: false)
 * @returns {Promise<Object>}
 */
export async function listFiles(dirPath, options = {}) {
  const { pattern = null, searchName = null, recursive = false, showHidden = false } = options;
  const absolutePath = ensureAbsolutePath(dirPath);

  // Validate path security
  const validation = validatePath(absolutePath);
  if (!validation.valid) {
    return { error: validation.error };
  }

  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      return { error: `'${dirPath}' is not a directory` };
    }

    const files = await listFilesRecursive(absolutePath, {
      pattern,
      recursive,
      showHidden,
      basePath: absolutePath,
    });

    // Sort by type (directories first) then by name
    files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const result = {
      path: absolutePath,
      count: files.length,
      files,
    };

    // If searchName provided, find similar matches (fuzzy search)
    if (searchName) {
      const searchLower = searchName.toLowerCase();
      const exactMatch = files.find(f => f.name.toLowerCase() === searchLower);

      if (!exactMatch) {
        // Find similar names (contains search term, or search term contains name)
        const similar = files.filter(f => {
          const nameLower = f.name.toLowerCase();
          return nameLower.includes(searchLower) ||
                 searchLower.includes(nameLower) ||
                 levenshteinDistance(nameLower, searchLower) <= 3;
        });

        if (similar.length > 0) {
          result.noExactMatch = true;
          result.searchedFor = searchName;
          result.similarMatches = similar.map(f => ({
            name: f.name,
            path: f.path,
            isDirectory: f.isDirectory,
          }));
          result.suggestion = `No exact match for "${searchName}", but found similar: ${similar.map(f => f.name).join(', ')}`;
        }
      } else {
        result.exactMatch = {
          name: exactMatch.name,
          path: exactMatch.path,
          isDirectory: exactMatch.isDirectory,
        };
      }
    }

    return result;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { error: `Directory not found: ${dirPath}` };
    }
    if (error.code === 'EACCES') {
      return { error: `Permission denied: ${dirPath}` };
    }
    return { error: error.message };
  }
}

/**
 * Calculate Levenshtein distance between two strings (for fuzzy matching)
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Recursively list files with filtering
 */
async function listFilesRecursive(dirPath, options) {
  const { pattern, recursive, showHidden, basePath } = options;
  const results = [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files unless requested
    if (!showHidden && entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    // Check pattern match
    if (pattern && !matchGlob(entry.name, pattern)) {
      // If directory and recursive, still explore it
      if (entry.isDirectory() && recursive) {
        const subResults = await listFilesRecursive(fullPath, options);
        results.push(...subResults);
      }
      continue;
    }

    const stats = await fs.stat(fullPath);

    results.push({
      name: entry.name,
      path: fullPath,
      relativePath,
      isDirectory: entry.isDirectory(),
      size: entry.isDirectory() ? null : stats.size,
      modified: stats.mtime.toISOString(),
    });

    // Recurse into directories
    if (entry.isDirectory() && recursive) {
      const subResults = await listFilesRecursive(fullPath, options);
      results.push(...subResults);
    }
  }

  return results;
}

/**
 * Search file contents using regex pattern
 * @param {string} searchPath - File or directory to search
 * @param {string} pattern - Regex pattern to find
 * @param {Object} options - Search options
 * @returns {Promise<Object>}
 */
export async function searchFiles(searchPath, pattern, options = {}) {
  const {
    filePattern = null,
    contextLines = 0,
    caseInsensitive = false,
    maxResults = 100,
  } = options;

  const absolutePath = ensureAbsolutePath(searchPath);

  // Validate path security
  const validation = validatePath(absolutePath);
  if (!validation.valid) {
    return { error: validation.error };
  }

  try {
    const stats = await fs.stat(absolutePath);
    const isDirectory = stats.isDirectory();

    // Build regex
    let regex;
    try {
      regex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g');
    } catch (e) {
      return { error: `Invalid regex pattern: ${e.message}` };
    }

    const results = [];
    let totalMatches = 0;

    if (isDirectory) {
      // Search in directory
      const files = await getFilesToSearch(absolutePath, filePattern);

      for (const file of files) {
        if (totalMatches >= maxResults) break;

        const fileResults = await searchInFile(file, regex, contextLines, maxResults - totalMatches);
        if (fileResults.matches.length > 0) {
          results.push({
            file,
            relativePath: path.relative(absolutePath, file),
            matches: fileResults.matches,
          });
          totalMatches += fileResults.matches.length;
        }
      }
    } else {
      // Search in single file
      const fileResults = await searchInFile(absolutePath, regex, contextLines, maxResults);
      if (fileResults.matches.length > 0) {
        results.push({
          file: absolutePath,
          matches: fileResults.matches,
        });
        totalMatches = fileResults.matches.length;
      }
    }

    return {
      path: absolutePath,
      pattern,
      totalMatches,
      truncated: totalMatches >= maxResults,
      results,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { error: `Path not found: ${searchPath}` };
    }
    return { error: error.message };
  }
}

/**
 * Get list of files to search in a directory
 */
async function getFilesToSearch(dirPath, filePattern) {
  const files = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files and common non-text directories
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const subFiles = await getFilesToSearch(fullPath, filePattern);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      if (!filePattern || matchGlob(entry.name, filePattern)) {
        // Skip binary files
        if (!isBinaryExtension(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  }

  return files;
}

/**
 * Search for pattern in a single file
 */
async function searchInFile(filePath, regex, contextLines, maxMatches) {
  const matches = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
      const line = lines[i];
      regex.lastIndex = 0; // Reset regex state

      if (regex.test(line)) {
        const match = {
          lineNumber: i + 1,
          line: line.substring(0, 500), // Truncate long lines
        };

        if (contextLines > 0) {
          match.before = lines.slice(Math.max(0, i - contextLines), i).map(l => l.substring(0, 500));
          match.after = lines.slice(i + 1, i + 1 + contextLines).map(l => l.substring(0, 500));
        }

        matches.push(match);
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return { matches };
}

/**
 * Delete a file or directory
 * @param {string} filePath - File or directory path to delete
 * @returns {Promise<Object>}
 */
export async function deleteFile(filePath) {
  const absolutePath = ensureAbsolutePath(filePath);

  // Validate path security
  const validation = validatePath(absolutePath);
  if (!validation.valid) {
    return { error: validation.error };
  }

  try {
    const stats = await fs.stat(absolutePath);
    const isDir = stats.isDirectory();

    if (isDir) {
      // Delete directory recursively
      await fs.rm(absolutePath, { recursive: true });
    } else {
      // Delete single file
      await fs.unlink(absolutePath);
    }

    return {
      success: true,
      path: absolutePath,
      message: `Successfully deleted ${isDir ? 'directory' : 'file'} ${path.basename(absolutePath)}`,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { error: `Path not found: ${filePath}` };
    }
    if (error.code === 'EACCES') {
      return { error: `Permission denied: ${filePath}` };
    }
    return { error: error.message };
  }
}

/**
 * Copy a file to a new location
 * @param {string} source - Source file path
 * @param {string} destination - Destination path
 * @param {boolean} overwrite - Overwrite if destination exists (default: false)
 * @returns {Promise<Object>}
 */
export async function copyFile(source, destination, overwrite = false) {
  const sourcePath = ensureAbsolutePath(source);
  const destPath = ensureAbsolutePath(destination);

  // Validate both paths
  const sourceValidation = validatePath(sourcePath);
  if (!sourceValidation.valid) {
    return { error: `Source: ${sourceValidation.error}` };
  }

  const destValidation = validatePath(destPath);
  if (!destValidation.valid) {
    return { error: `Destination: ${destValidation.error}` };
  }

  try {
    // Check source exists
    const sourceStats = await fs.stat(sourcePath);
    if (!sourceStats.isFile()) {
      return { error: `Source '${source}' is not a file` };
    }

    // Check destination
    try {
      await fs.stat(destPath);
      if (!overwrite) {
        return { error: `Destination already exists: ${destination}. Set overwrite: true to replace.` };
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      // Destination doesn't exist, which is fine
    }

    // Check destination directory exists
    const destDir = path.dirname(destPath);
    try {
      await fs.access(destDir);
    } catch {
      return { error: `Destination directory does not exist: ${destDir}` };
    }

    // Copy the file
    await fs.copyFile(sourcePath, destPath);

    const destStats = await fs.stat(destPath);
    return {
      success: true,
      source: sourcePath,
      destination: destPath,
      size: destStats.size,
      message: `Successfully copied ${path.basename(sourcePath)} to ${path.basename(destPath)}`,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { error: `File not found: ${source}` };
    }
    if (error.code === 'EACCES') {
      return { error: `Permission denied` };
    }
    return { error: error.message };
  }
}

/**
 * Move or rename a file
 * @param {string} source - Current file path
 * @param {string} destination - New path
 * @param {boolean} overwrite - Overwrite if destination exists (default: false)
 * @returns {Promise<Object>}
 */
export async function moveFile(source, destination, overwrite = false) {
  const sourcePath = ensureAbsolutePath(source);
  const destPath = ensureAbsolutePath(destination);

  // Validate both paths
  const sourceValidation = validatePath(sourcePath);
  if (!sourceValidation.valid) {
    return { error: `Source: ${sourceValidation.error}` };
  }

  const destValidation = validatePath(destPath);
  if (!destValidation.valid) {
    return { error: `Destination: ${destValidation.error}` };
  }

  try {
    // Check source exists
    const sourceStats = await fs.stat(sourcePath);
    if (!sourceStats.isFile()) {
      return { error: `Source '${source}' is not a file` };
    }

    // Check destination
    try {
      await fs.stat(destPath);
      if (!overwrite) {
        return { error: `Destination already exists: ${destination}. Set overwrite: true to replace.` };
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }

    // Check destination directory exists
    const destDir = path.dirname(destPath);
    try {
      await fs.access(destDir);
    } catch {
      return { error: `Destination directory does not exist: ${destDir}` };
    }

    // Move the file
    await fs.rename(sourcePath, destPath);

    return {
      success: true,
      source: sourcePath,
      destination: destPath,
      message: `Successfully moved ${path.basename(sourcePath)} to ${path.basename(destPath)}`,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { error: `File not found: ${source}` };
    }
    if (error.code === 'EACCES') {
      return { error: `Permission denied` };
    }
    if (error.code === 'EXDEV') {
      // Cross-device move, need to copy then delete
      const copyResult = await copyFile(source, destination, overwrite);
      if (!copyResult.success) {
        return copyResult;
      }
      await fs.unlink(sourcePath);
      return {
        success: true,
        source: sourcePath,
        destination: destPath,
        message: `Successfully moved ${path.basename(sourcePath)} to ${path.basename(destPath)}`,
      };
    }
    return { error: error.message };
  }
}

/**
 * Get file metadata
 * @param {string} filePath - File path
 * @returns {Promise<Object>}
 */
export async function getFileInfo(filePath) {
  const absolutePath = ensureAbsolutePath(filePath);

  // Validate path security
  const validation = validatePath(absolutePath);
  if (!validation.valid) {
    return { error: validation.error };
  }

  try {
    const stats = await fs.stat(absolutePath);

    const info = {
      path: absolutePath,
      name: path.basename(absolutePath),
      extension: path.extname(absolutePath) || null,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink(),
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      permissions: formatPermissions(stats.mode),
    };

    if (validation.warning) {
      info.warning = validation.warning;
    }

    return info;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { error: `File not found: ${filePath}` };
    }
    if (error.code === 'EACCES') {
      return { error: `Permission denied: ${filePath}` };
    }
    return { error: error.message };
  }
}

// Helper functions

/**
 * Escape special regex characters in a string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Simple glob pattern matching
 * Supports * (any characters) and ? (single character)
 */
function matchGlob(filename, pattern) {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filename);
}

/**
 * Check if file extension suggests binary file
 */
function isBinaryExtension(filename) {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.webm',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.ttf', '.otf', '.woff', '.woff2',
    '.sqlite', '.db',
  ];
  const ext = path.extname(filename).toLowerCase();
  return binaryExtensions.includes(ext);
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format file permissions to octal and symbolic
 */
function formatPermissions(mode) {
  const octal = (mode & 0o777).toString(8);
  return octal;
}

/**
 * Send an image file to the user via Telegram
 * @param {string} filePath - Path to the image file
 * @param {string} caption - Optional caption
 * @param {number} chatId - Chat ID to send to
 * @returns {Promise<Object>}
 */
export async function sendPhotoFile(filePath, caption = '', chatId) {
  if (!chatId) {
    return { error: 'No chat context available to send photo' };
  }

  const absolutePath = ensureAbsolutePath(filePath);

  // Validate path security
  const validation = validatePath(absolutePath);
  if (!validation.valid) {
    return { error: validation.error };
  }

  // Check file extension is an image
  const ext = path.extname(absolutePath).toLowerCase();
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (!imageExtensions.includes(ext)) {
    return { error: `Not an image file. Supported formats: ${imageExtensions.join(', ')}` };
  }

  try {
    // Check file exists
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      return { error: `'${filePath}' is not a file` };
    }

    // Read the file
    const buffer = await fs.readFile(absolutePath);

    // Queue it to be sent
    addPhotoNotification(chatId, buffer, caption || '');

    return {
      success: true,
      message: `Photo queued for delivery: ${path.basename(absolutePath)}`,
      path: absolutePath,
      size: stats.size,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { error: `File not found: ${filePath}` };
    }
    if (error.code === 'EACCES') {
      return { error: `Permission denied: ${filePath}` };
    }
    return { error: error.message };
  }
}
