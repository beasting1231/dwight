import {
  readFile,
  writeFile,
  editFile,
  listFiles,
  searchFiles,
  deleteFile,
  copyFile,
  moveFile,
  getFileInfo,
} from './actions.js';

/**
 * Tool definitions for AI
 */
export const fileTools = [
  {
    name: 'file_read',
    description: 'Read file contents with optional line range. Returns content with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute file path to read',
        },
        offset: {
          type: 'number',
          description: 'Starting line number (1-indexed, default: 1)',
        },
        limit: {
          type: 'number',
          description: 'Maximum lines to read (default: 2000)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_write',
    description: 'Write content to a file. Creates a new file or overwrites existing content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute file path to write',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
        createDirs: {
          type: 'boolean',
          description: 'Create parent directories if they do not exist (default: false)',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'file_edit',
    description: 'Find and replace text in a file. The old_string must be unique unless replace_all is true.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit',
        },
        old_string: {
          type: 'string',
          description: 'Exact text to find in the file',
        },
        new_string: {
          type: 'string',
          description: 'Text to replace it with',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace all occurrences instead of just the first (default: false)',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'file_list',
    description: 'List files in a directory. Use searchName when looking for a specific file/folder - it will find similar names if no exact match exists.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list',
        },
        searchName: {
          type: 'string',
          description: 'Name to search for. Returns exact match or suggests similar names (e.g., searching "test" might find "testing")',
        },
        pattern: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.js", "*.txt")',
        },
        recursive: {
          type: 'boolean',
          description: 'Include files in subdirectories (default: false)',
        },
        showHidden: {
          type: 'boolean',
          description: 'Include hidden files starting with . (default: false)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_search',
    description: 'Search file contents using a regex pattern. Searches recursively in directories.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File or directory to search in',
        },
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for',
        },
        filePattern: {
          type: 'string',
          description: 'Glob pattern to filter which files to search (e.g., "*.js")',
        },
        contextLines: {
          type: 'number',
          description: 'Number of lines to show before and after each match (default: 0)',
        },
        caseInsensitive: {
          type: 'boolean',
          description: 'Perform case-insensitive search (default: false)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of matches to return (default: 100)',
        },
      },
      required: ['path', 'pattern'],
    },
  },
  {
    name: 'file_delete',
    description: 'Delete a file or directory (and all its contents).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File or directory path to delete',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_copy',
    description: 'Copy a file to a new location.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source file path',
        },
        destination: {
          type: 'string',
          description: 'Destination file path',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite destination if it already exists (default: false)',
        },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'file_move',
    description: 'Move or rename a file.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Current file path',
        },
        destination: {
          type: 'string',
          description: 'New file path',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite destination if it already exists (default: false)',
        },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'file_info',
    description: 'Get file metadata including size, dates, and permissions.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to get info for',
        },
      },
      required: ['path'],
    },
  },
];

/**
 * Execute a file tool
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} params - Tool parameters
 * @returns {Promise<Object>} Tool result
 */
export async function executeFileTool(toolName, params) {
  try {
    switch (toolName) {
      case 'file_read':
        return await readFile(params.path, params.offset, params.limit);

      case 'file_write':
        return await writeFile(params.path, params.content, params.createDirs);

      case 'file_edit':
        return await editFile(params.path, params.old_string, params.new_string, params.replace_all);

      case 'file_list':
        return await listFiles(params.path, {
          pattern: params.pattern,
          searchName: params.searchName,
          recursive: params.recursive,
          showHidden: params.showHidden,
        });

      case 'file_search':
        return await searchFiles(params.path, params.pattern, {
          filePattern: params.filePattern,
          contextLines: params.contextLines,
          caseInsensitive: params.caseInsensitive,
          maxResults: params.maxResults,
        });

      case 'file_delete':
        return await deleteFile(params.path);

      case 'file_copy':
        return await copyFile(params.source, params.destination, params.overwrite);

      case 'file_move':
        return await moveFile(params.source, params.destination, params.overwrite);

      case 'file_info':
        return await getFileInfo(params.path);

      default:
        return { error: `Unknown file tool: ${toolName}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

// Re-export actions for direct access if needed
export {
  readFile,
  writeFile,
  editFile,
  listFiles,
  searchFiles,
  deleteFile,
  copyFile,
  moveFile,
  getFileInfo,
};
