import path from 'path';

/**
 * System directories that should be blocked from access
 */
const BLOCKED_DIRECTORIES = [
  '/etc',
  '/sys',
  '/proc',
  '/dev',
  '/boot',
  '/sbin',
  '/bin',
  '/usr/sbin',
  '/var/log',
  '/lib',
  '/lib64',
  '/usr/lib',
];

/**
 * Patterns for sensitive files that should trigger warnings
 */
const SENSITIVE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /secret/i,
  /credential/i,
  /password/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.ssh\//i,
  /\.aws\//i,
  /\.gnupg\//i,
  /token/i,
  /api_key/i,
  /apikey/i,
];

/**
 * Check if a path contains path traversal attempts
 * @param {string} filePath - Path to check
 * @returns {{ valid: boolean, error?: string }}
 */
export function checkPathTraversal(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'Path must be a non-empty string' };
  }

  // Normalize the path
  const normalized = path.normalize(filePath);

  // Check for path traversal patterns
  if (filePath.includes('..')) {
    return { valid: false, error: 'Path traversal (..) is not allowed' };
  }

  // Check if path contains null bytes
  if (filePath.includes('\0')) {
    return { valid: false, error: 'Path contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Check if a path is in a blocked system directory
 * @param {string} filePath - Path to check
 * @returns {{ allowed: boolean, error?: string }}
 */
export function checkSystemDirectory(filePath) {
  const normalized = path.resolve(filePath);

  for (const blocked of BLOCKED_DIRECTORIES) {
    if (normalized === blocked || normalized.startsWith(blocked + '/')) {
      return {
        allowed: false,
        error: `Access to system directory '${blocked}' is blocked`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if a file path matches sensitive file patterns
 * @param {string} filePath - Path to check
 * @returns {{ sensitive: boolean, warning?: string }}
 */
export function detectSensitiveFile(filePath) {
  const normalized = path.resolve(filePath);
  const basename = path.basename(filePath);

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(filePath) || pattern.test(basename)) {
      return {
        sensitive: true,
        warning: `Warning: '${basename}' appears to be a sensitive file. Be careful with credentials and secrets.`,
      };
    }
  }

  return { sensitive: false };
}

/**
 * Validate a file path for security issues
 * @param {string} filePath - Path to validate
 * @param {Object} options - Validation options
 * @param {string[]} options.allowedPaths - Optional list of allowed base paths
 * @param {boolean} options.blockSensitive - Whether to block sensitive files (default: false, just warn)
 * @returns {{ valid: boolean, error?: string, warning?: string }}
 */
export function validatePath(filePath, options = {}) {
  // Check path traversal
  const traversalCheck = checkPathTraversal(filePath);
  if (!traversalCheck.valid) {
    return { valid: false, error: traversalCheck.error };
  }

  // Check system directories
  const systemCheck = checkSystemDirectory(filePath);
  if (!systemCheck.allowed) {
    return { valid: false, error: systemCheck.error };
  }

  // Check allowed paths if specified
  if (options.allowedPaths && options.allowedPaths.length > 0) {
    const normalized = path.resolve(filePath);
    const isAllowed = options.allowedPaths.some(allowed => {
      const normalizedAllowed = path.resolve(allowed);
      return normalized === normalizedAllowed || normalized.startsWith(normalizedAllowed + '/');
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `Path '${filePath}' is outside allowed directories`,
      };
    }
  }

  // Check for sensitive files
  const sensitiveCheck = detectSensitiveFile(filePath);
  if (sensitiveCheck.sensitive) {
    if (options.blockSensitive) {
      return { valid: false, error: sensitiveCheck.warning };
    }
    return { valid: true, warning: sensitiveCheck.warning };
  }

  return { valid: true };
}

/**
 * Check if a path is an absolute path
 * @param {string} filePath - Path to check
 * @returns {boolean}
 */
export function isAbsolutePath(filePath) {
  return path.isAbsolute(filePath);
}

/**
 * Ensure a path is absolute, resolving from a base path if needed
 * @param {string} filePath - Path to resolve
 * @param {string} basePath - Base path for relative paths
 * @returns {string}
 */
export function ensureAbsolutePath(filePath, basePath = process.cwd()) {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }
  return path.resolve(basePath, filePath);
}
