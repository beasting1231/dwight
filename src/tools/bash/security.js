/**
 * Bash command security validation
 * Based on Claude Code's multi-layer safety approach
 */

/**
 * Patterns that should be BLOCKED immediately (too dangerous)
 * These commands can cause irreversible system damage
 */
const BLOCKED_PATTERNS = [
  // Recursive delete from root (only block absolute paths from root, not relative paths)
  { pattern: /rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+\/($|[^.\/])/, message: 'Recursive delete from root is blocked' },
  { pattern: /rm\s+-rf\s+\/($|[^.\/])/, message: 'rm -rf from root is blocked' },
  { pattern: /rm\s+-fr\s+\/($|[^.\/])/, message: 'rm -fr from root is blocked' },

  // Direct device writes
  { pattern: /dd\s+.*of=\/dev\//, message: 'Direct writes to devices are blocked' },
  { pattern: />\s*\/dev\/sd[a-z]/, message: 'Direct writes to disk devices are blocked' },
  { pattern: />\s*\/dev\/nvme/, message: 'Direct writes to NVMe devices are blocked' },

  // Filesystem destruction
  { pattern: /mkfs\./, message: 'Filesystem creation is blocked' },
  { pattern: /mkswap\s+\/dev\//, message: 'Swap creation on devices is blocked' },

  // Fork bombs
  { pattern: /:\(\)\{.*:\|:/, message: 'Fork bomb detected and blocked' },
  { pattern: /\.\(\)\{.*\.\|\.\s*&\s*\}/, message: 'Fork bomb detected and blocked' },

  // Dangerous overwrites
  { pattern: />\s*\/etc\/passwd/, message: 'Overwriting /etc/passwd is blocked' },
  { pattern: />\s*\/etc\/shadow/, message: 'Overwriting /etc/shadow is blocked' },

  // Kernel manipulation
  { pattern: /insmod\s+/, message: 'Kernel module loading is blocked' },
  { pattern: /rmmod\s+/, message: 'Kernel module removal is blocked' },
  { pattern: /modprobe\s+/, message: 'Kernel module manipulation is blocked' },
];

/**
 * Patterns that require user confirmation (potentially dangerous)
 */
const ASK_PATTERNS = [
  // Privilege escalation
  { pattern: /^sudo\s+/, message: 'Command requires elevated privileges (sudo)' },
  { pattern: /^su\s+/, message: 'Command switches user (su)' },
  { pattern: /^doas\s+/, message: 'Command requires elevated privileges (doas)' },

  // Recursive deletes (not from root)
  { pattern: /rm\s+-[a-zA-Z]*r/, message: 'Recursive delete - verify the path is correct' },
  { pattern: /rm\s+--recursive/, message: 'Recursive delete - verify the path is correct' },

  // Dangerous permissions
  { pattern: /chmod\s+777/, message: 'Setting world-writable permissions (777)' },
  { pattern: /chmod\s+-R\s+777/, message: 'Recursively setting world-writable permissions' },
  { pattern: /chmod\s+666/, message: 'Setting world-writable file permissions (666)' },

  // Git destructive operations
  { pattern: /git\s+push\s+.*--force/, message: 'Force push can overwrite remote history' },
  { pattern: /git\s+push\s+-f/, message: 'Force push can overwrite remote history' },
  { pattern: /git\s+reset\s+--hard/, message: 'Hard reset will discard all local changes' },
  { pattern: /git\s+clean\s+-[a-zA-Z]*f/, message: 'Git clean will permanently delete untracked files' },
  { pattern: /git\s+checkout\s+\./, message: 'This will discard all unstaged changes' },
  { pattern: /git\s+restore\s+\./, message: 'This will discard all unstaged changes' },

  // Network-related
  { pattern: /curl\s+.*\|\s*sh/, message: 'Piping curl to shell is risky - review the script first' },
  { pattern: /curl\s+.*\|\s*bash/, message: 'Piping curl to bash is risky - review the script first' },
  { pattern: /wget\s+.*\|\s*sh/, message: 'Piping wget to shell is risky - review the script first' },

  // System modifications
  { pattern: /systemctl\s+(stop|disable|mask)/, message: 'Stopping/disabling system services' },
  { pattern: /launchctl\s+(unload|remove)/, message: 'Unloading macOS services' },

  // Package management - INSTALLING (modifies system)
  { pattern: /brew\s+install/, message: 'Installing packages with Homebrew' },
  { pattern: /apt-get\s+install/, message: 'Installing packages with apt-get' },
  { pattern: /apt\s+install/, message: 'Installing packages with apt' },
  { pattern: /npm\s+install\s+-g/, message: 'Installing global npm packages' },
  { pattern: /npm\s+i\s+-g/, message: 'Installing global npm packages' },
  { pattern: /pip\s+install/, message: 'Installing Python packages' },
  { pattern: /pip3\s+install/, message: 'Installing Python packages' },
  { pattern: /gem\s+install/, message: 'Installing Ruby gems' },
  { pattern: /cargo\s+install/, message: 'Installing Rust packages' },

  // Package management - REMOVING (can break system)
  { pattern: /apt-get\s+remove/, message: 'Removing packages from the system' },
  { pattern: /apt\s+remove/, message: 'Removing packages from the system' },
  { pattern: /brew\s+uninstall/, message: 'Uninstalling packages' },
  { pattern: /npm\s+uninstall\s+-g/, message: 'Uninstalling global npm packages' },

  // Disk operations
  { pattern: /fdisk\s+/, message: 'Disk partitioning tool' },
  { pattern: /parted\s+/, message: 'Disk partitioning tool' },
  { pattern: /diskutil\s+(erase|partition)/, message: 'Disk utility operation' },
];

/**
 * Patterns that should generate a warning but not block
 */
const WARN_PATTERNS = [
  // Potentially slow operations
  { pattern: /find\s+\/\s+/, message: 'Searching from root directory may be slow' },
  { pattern: /du\s+-[a-zA-Z]*h?\s+\/[^\/]/, message: 'Disk usage scan may take a while' },

  // Write operations on sensitive paths
  { pattern: />\s*~\/\.\w+/, message: 'Writing to hidden config file in home directory' },

  // Network downloads
  { pattern: /curl\s+.*-O/, message: 'Downloading file from internet' },
  { pattern: /wget\s+/, message: 'Downloading file from internet' },

  // Environment changes
  { pattern: /export\s+PATH=/, message: 'Modifying PATH environment variable' },
  { pattern: /source\s+/, message: 'Sourcing external script' },
  { pattern: /\.\s+\//, message: 'Sourcing external script' },
];

/**
 * Commands that should prefer dedicated tools
 */
const PREFER_DEDICATED_TOOLS = [
  { pattern: /^cat\s+/, tool: 'file_read', message: 'Consider using file_read tool instead of cat' },
  { pattern: /^head\s+/, tool: 'file_read', message: 'Consider using file_read tool with limit instead of head' },
  { pattern: /^tail\s+/, tool: 'file_read', message: 'Consider using file_read tool with offset instead of tail' },
  { pattern: /^echo\s+.*>/, tool: 'file_write', message: 'Consider using file_write tool instead of echo redirect' },
  { pattern: /^sed\s+-i/, tool: 'file_edit', message: 'Consider using file_edit tool instead of sed -i' },
  { pattern: /^find\s+.*-name/, tool: 'file_list', message: 'Consider using file_list tool with pattern instead of find' },
  { pattern: /^grep\s+/, tool: 'file_search', message: 'Consider using file_search tool instead of grep' },
];

/**
 * Validate a command for security issues
 * @param {string} command - The command to validate
 * @returns {{ allowed: boolean, decision: 'allow'|'ask'|'deny', reason?: string, warning?: string, suggestion?: { tool: string, message: string } }}
 */
export function validateCommand(command) {
  if (!command || typeof command !== 'string') {
    return { allowed: false, decision: 'deny', reason: 'Command must be a non-empty string' };
  }

  const trimmedCommand = command.trim();

  // Check blocked patterns first
  for (const { pattern, message } of BLOCKED_PATTERNS) {
    if (pattern.test(trimmedCommand)) {
      return { allowed: false, decision: 'deny', reason: message };
    }
  }

  // Check ask patterns
  for (const { pattern, message } of ASK_PATTERNS) {
    if (pattern.test(trimmedCommand)) {
      return { allowed: true, decision: 'ask', reason: message };
    }
  }

  // Check warnings
  let warning = null;
  for (const { pattern, message } of WARN_PATTERNS) {
    if (pattern.test(trimmedCommand)) {
      warning = message;
      break;
    }
  }

  // Check for suggestions to use dedicated tools
  let suggestion = null;
  for (const { pattern, tool, message } of PREFER_DEDICATED_TOOLS) {
    if (pattern.test(trimmedCommand)) {
      suggestion = { tool, message };
      break;
    }
  }

  return {
    allowed: true,
    decision: 'allow',
    warning,
    suggestion,
  };
}

/**
 * Check if a command matches a permission pattern
 * Supports wildcard patterns like Bash(git:*), Bash(npm *)
 * @param {string} command - The command to check
 * @param {string} pattern - The permission pattern (e.g., "git:*", "npm *")
 * @returns {boolean}
 */
export function matchesPermissionPattern(command, pattern) {
  if (!pattern || pattern === '*') {
    return true;
  }

  // Handle Bash(command:*) format - extract the command part
  let cmdPattern = pattern;
  if (pattern.startsWith('Bash(') && pattern.endsWith(')')) {
    cmdPattern = pattern.slice(5, -1);
  }

  // Convert pattern to regex
  // * matches anything, : is treated as space for matching
  const regexPattern = cmdPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars except *
    .replace(/:/g, '\\s+')                   // : becomes whitespace
    .replace(/\*/g, '.*');                   // * becomes .*

  const regex = new RegExp(`^${regexPattern}`, 'i');
  return regex.test(command.trim());
}

/**
 * Extract the primary command from a complex command string
 * Handles pipes, &&, ||, and command substitution
 * @param {string} command - The full command string
 * @returns {string} The primary command
 */
export function extractPrimaryCommand(command) {
  if (!command) return '';

  // Remove leading environment variables
  let cmd = command.replace(/^(\s*\w+=[^\s]+\s+)+/, '').trim();

  // Get first part before pipes, &&, ||, ;
  const firstPart = cmd.split(/[|;&]|\s*&&\s*|\s*\|\|\s*/)[0].trim();

  // Get the actual command (first word)
  const words = firstPart.split(/\s+/);
  return words[0] || '';
}

/**
 * Get the full command prefix for permission matching
 * E.g., "git -C /path commit" -> "git commit"
 * @param {string} command - The full command string
 * @returns {string} The command with subcommand
 */
export function getCommandPrefix(command) {
  if (!command) return '';

  const parts = command.trim().split(/\s+/);
  const primaryCmd = parts[0];

  // Commands that have subcommands
  const subcommandTools = ['git', 'npm', 'yarn', 'docker', 'kubectl', 'brew', 'apt', 'apt-get', 'systemctl', 'launchctl'];

  if (subcommandTools.includes(primaryCmd)) {
    // Skip flags and their arguments to find subcommand
    let i = 1;
    while (i < parts.length) {
      const part = parts[i];
      // Skip flags
      if (part.startsWith('-')) {
        i++;
        // If it's a flag that takes an argument (like -C, --prefix), skip the next part too
        if (part.match(/^-[A-Za-z]$/) || part.match(/^--\w+$/)) {
          // Check if next part exists and is not a flag (i.e., it's the argument)
          if (i < parts.length && !parts[i].startsWith('-')) {
            i++;
          }
        }
        continue;
      }
      // Found the subcommand
      return `${primaryCmd} ${part}`;
    }
  }

  return primaryCmd;
}

// Export patterns for testing
export const patterns = {
  BLOCKED_PATTERNS,
  ASK_PATTERNS,
  WARN_PATTERNS,
  PREFER_DEDICATED_TOOLS,
};
