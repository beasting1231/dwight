import { loadConfig, saveConfig } from '../../config.js';
import { setPendingEmail, getPendingEmail, clearPendingEmail } from '../../state.js';
import {
  getImapConfig,
  getSmtpConfig,
  connectImap,
  disconnectImap,
  createSmtpTransport,
  verifySmtp,
  getImapClient,
} from './client.js';
import {
  listEmails,
  readEmail,
  searchEmails,
  sendEmail,
  listMailboxes,
  getUnreadCount,
} from './actions.js';

/**
 * Tool definitions for AI
 */
export const emailTools = [
  {
    name: 'email_list',
    description: 'List recent emails from inbox or specified mailbox',
    parameters: {
      type: 'object',
      properties: {
        mailbox: {
          type: 'string',
          description: 'Mailbox to read from (default: INBOX)',
        },
        limit: {
          type: 'number',
          description: 'Number of emails to fetch (default: 10, max: 50)',
        },
        unreadOnly: {
          type: 'boolean',
          description: 'Only fetch unread emails',
        },
      },
    },
  },
  {
    name: 'email_read',
    description: 'Read the full content of a specific email by its UID',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'number',
          description: 'The UID of the email to read',
        },
        mailbox: {
          type: 'string',
          description: 'Mailbox containing the email (default: INBOX)',
        },
      },
      required: ['uid'],
    },
  },
  {
    name: 'email_search',
    description: 'Search emails by query, sender, subject, or date range',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'General search query (searches subject and sender)',
        },
        from: {
          type: 'string',
          description: 'Filter by sender email or name',
        },
        subject: {
          type: 'string',
          description: 'Filter by subject line',
        },
        since: {
          type: 'string',
          description: 'Emails since date (ISO format)',
        },
        before: {
          type: 'string',
          description: 'Emails before date (ISO format)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20)',
        },
      },
    },
  },
  {
    name: 'email_draft',
    description: 'REQUIRED first step to send any email. Call this tool to stage the draft - do NOT just write email text without calling this tool. After calling, show the draft and ask user to confirm.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address(es), comma-separated for multiple',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        text: {
          type: 'string',
          description: 'Email body (plain text)',
        },
        cc: {
          type: 'string',
          description: 'CC recipients (optional)',
        },
      },
      required: ['to', 'subject', 'text'],
    },
  },
  {
    name: 'email_confirm',
    description: 'Send the email that was staged with email_draft. Will FAIL if email_draft was not called first. Only call after user confirms.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'email_unread_count',
    description: 'Get the number of unread emails in a mailbox',
    parameters: {
      type: 'object',
      properties: {
        mailbox: {
          type: 'string',
          description: 'Mailbox to check (default: INBOX)',
        },
      },
    },
  },
];

/**
 * Initialize email client from config
 */
export async function initializeEmail() {
  const config = loadConfig();
  const emailConfig = config?.email;

  if (!emailConfig?.enabled) {
    return { success: false, error: 'Email not configured' };
  }

  try {
    // Connect IMAP
    const imapConfig = emailConfig.imap.host
      ? {
          host: emailConfig.imap.host,
          port: emailConfig.imap.port,
          secure: emailConfig.imap.secure,
          auth: {
            user: emailConfig.email,
            pass: emailConfig.password,
          },
          logger: false,
        }
      : getImapConfig(emailConfig.provider, emailConfig.email, emailConfig.password);

    await connectImap(imapConfig);

    // Setup SMTP
    const smtpConfig = emailConfig.smtp.host
      ? {
          host: emailConfig.smtp.host,
          port: emailConfig.smtp.port,
          secure: emailConfig.smtp.secure,
          auth: {
            user: emailConfig.email,
            pass: emailConfig.password,
          },
        }
      : getSmtpConfig(emailConfig.provider, emailConfig.email, emailConfig.password);

    smtpConfig.from = emailConfig.email;
    createSmtpTransport(smtpConfig);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if email is connected
 */
export function isEmailConnected() {
  return getImapClient() !== null;
}

/**
 * Execute an email tool
 */
export async function executeEmailTool(toolName, params, ctx = {}) {
  // Ensure connected
  if (!isEmailConnected()) {
    const init = await initializeEmail();
    if (!init.success) {
      return { error: init.error };
    }
  }

  try {
    switch (toolName) {
      case 'email_list':
        return await listEmails({
          mailbox: params.mailbox,
          limit: Math.min(params.limit || 10, 50),
          unreadOnly: params.unreadOnly,
        });

      case 'email_read':
        return await readEmail(params.uid, params.mailbox);

      case 'email_search':
        return await searchEmails({
          query: params.query,
          from: params.from,
          subject: params.subject,
          since: params.since ? new Date(params.since) : undefined,
          before: params.before ? new Date(params.before) : undefined,
          limit: params.limit,
        });

      case 'email_draft':
        // Check if "to" is a valid email address
        if (!params.to.includes('@')) {
          return {
            error: `"${params.to}" is not an email address. Use contacts_lookup tool first to find their email, then call email_draft with the actual email address.`
          };
        }

        // Store the email as pending, return draft for user review
        const chatId = ctx?.chatId || 'default';
        console.log('[email_draft] chatId:', chatId);
        setPendingEmail(chatId, {
          to: params.to,
          subject: params.subject,
          text: params.text,
          cc: params.cc,
        });
        return {
          status: 'draft_ready',
          instruction: 'DISPLAY THIS FULL DRAFT TO USER, then ask "Send this email?"',
          to: params.to,
          subject: params.subject,
          body: params.text,
          cc: params.cc || null,
        };

      case 'email_confirm':
        // Send the pending email
        const confirmChatId = ctx?.chatId || 'default';
        const pending = getPendingEmail(confirmChatId);
        if (!pending) {
          return { error: 'No pending email. Use email_draft first.' };
        }
        if (!pending.userConfirmed) {
          return { error: 'Cannot send yet. You must show the draft to user and wait for their confirmation message before calling email_confirm.' };
        }
        clearPendingEmail(confirmChatId);
        return await sendEmail({
          to: pending.to,
          subject: pending.subject,
          text: pending.text,
          cc: pending.cc,
        });

      case 'email_unread_count':
        const count = await getUnreadCount(params.mailbox);
        return { unreadCount: count };

      default:
        return { error: `Unknown email tool: ${toolName}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Cleanup email connections
 */
export async function cleanupEmail() {
  await disconnectImap();
}

// Re-export for direct access if needed
export {
  listEmails,
  readEmail,
  searchEmails,
  sendEmail,
  listMailboxes,
  getUnreadCount,
};
