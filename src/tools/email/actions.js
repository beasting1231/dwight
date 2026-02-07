import { simpleParser } from 'mailparser';
import { getImapClient, getSmtpTransport } from './client.js';
import { addNotification } from '../../state.js';

/**
 * List emails from a mailbox
 * @param {Object} options
 * @param {string} options.mailbox - Mailbox to read from (default: INBOX)
 * @param {number} options.limit - Number of emails to fetch (default: 10)
 * @param {boolean} options.unreadOnly - Only fetch unread emails
 * @returns {Promise<Array>} Array of email objects
 */
export async function listEmails({ mailbox = 'INBOX', limit = 10, unreadOnly = false } = {}) {
  const client = getImapClient();
  if (!client) {
    throw new Error('IMAP client not connected');
  }

  const emails = [];

  const lock = await client.getMailboxLock(mailbox);
  try {
    // Build search criteria
    const searchCriteria = unreadOnly ? { seen: false } : { all: true };

    // Search for messages
    const messages = await client.search(searchCriteria, { uid: true });

    // Get the most recent ones (last N)
    const recentUids = messages.slice(-limit).reverse();

    for (const uid of recentUids) {
      const message = await client.fetchOne(uid, {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
      }, { uid: true });

      if (message) {
        emails.push({
          uid: message.uid,
          subject: message.envelope?.subject || '(No Subject)',
          from: message.envelope?.from?.[0] || {},
          to: message.envelope?.to || [],
          date: message.envelope?.date,
          flags: message.flags || new Set(),
          isRead: message.flags?.has('\\Seen') || false,
        });
      }
    }
  } finally {
    lock.release();
  }

  return emails;
}

/**
 * Read a specific email by UID
 * @param {number} uid - Email UID
 * @param {string} mailbox - Mailbox name (default: INBOX)
 * @returns {Promise<Object>} Full email object with body
 */
export async function readEmail(uid, mailbox = 'INBOX') {
  const client = getImapClient();
  if (!client) {
    throw new Error('IMAP client not connected');
  }

  const lock = await client.getMailboxLock(mailbox);
  try {
    // Fetch full message source
    const message = await client.fetchOne(uid, {
      uid: true,
      envelope: true,
      source: true,
      flags: true,
    }, { uid: true });

    if (!message) {
      throw new Error(`Email with UID ${uid} not found`);
    }

    // Parse the email
    const parsed = await simpleParser(message.source);

    // Mark as read
    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });

    return {
      uid: message.uid,
      subject: parsed.subject || '(No Subject)',
      from: parsed.from?.value?.[0] || {},
      to: parsed.to?.value || [],
      cc: parsed.cc?.value || [],
      date: parsed.date,
      text: parsed.text || '',
      html: parsed.html || '',
      attachments: (parsed.attachments || []).map(att => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
      })),
    };
  } finally {
    lock.release();
  }
}

/**
 * Search emails
 * @param {Object} options
 * @param {string} options.query - Search query (searches subject and from)
 * @param {string} options.from - Filter by sender
 * @param {string} options.subject - Filter by subject
 * @param {Date} options.since - Emails since date
 * @param {Date} options.before - Emails before date
 * @param {string} options.mailbox - Mailbox to search (default: INBOX)
 * @param {number} options.limit - Max results (default: 20)
 * @returns {Promise<Array>} Array of matching emails
 */
export async function searchEmails({
  query,
  from,
  subject,
  since,
  before,
  mailbox = 'INBOX',
  limit = 20,
} = {}) {
  const client = getImapClient();
  if (!client) {
    throw new Error('IMAP client not connected');
  }

  const lock = await client.getMailboxLock(mailbox);
  try {
    // Build search criteria
    const criteria = {};

    if (query) {
      // Search in subject OR from
      criteria.or = [
        { subject: query },
        { from: query },
      ];
    }
    if (from) {
      criteria.from = from;
    }
    if (subject) {
      criteria.subject = subject;
    }
    if (since) {
      criteria.since = since;
    }
    if (before) {
      criteria.before = before;
    }

    // If no criteria, search all
    if (Object.keys(criteria).length === 0) {
      criteria.all = true;
    }

    const uids = await client.search(criteria, { uid: true });
    const recentUids = uids.slice(-limit).reverse();

    const emails = [];
    for (const uid of recentUids) {
      const message = await client.fetchOne(uid, {
        uid: true,
        envelope: true,
        flags: true,
      }, { uid: true });

      if (message) {
        emails.push({
          uid: message.uid,
          subject: message.envelope?.subject || '(No Subject)',
          from: message.envelope?.from?.[0] || {},
          date: message.envelope?.date,
          isRead: message.flags?.has('\\Seen') || false,
        });
      }
    }

    return emails;
  } finally {
    lock.release();
  }
}

/**
 * Send an email
 * @param {Object} options
 * @param {string} options.to - Recipient email address(es)
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} options.html - HTML body (optional)
 * @param {string} options.cc - CC recipients (optional)
 * @param {string} options.bcc - BCC recipients (optional)
 * @param {string} options.replyTo - Reply-to address (optional)
 * @returns {Promise<Object>} Send result
 */
export async function sendEmail({ to, subject, text, html, cc, bcc, replyTo }) {
  const transport = getSmtpTransport();
  if (!transport) {
    throw new Error('SMTP transport not configured');
  }

  // Validate required fields
  if (!to || !to.trim()) {
    throw new Error('Recipient (to) is required');
  }
  if (!subject || !subject.trim()) {
    throw new Error('Subject is required');
  }
  if (!text || !text.trim()) {
    throw new Error('Email body (text) is required');
  }

  const mailOptions = {
    to,
    subject,
    text,
  };

  if (html) mailOptions.html = html;
  if (cc) mailOptions.cc = cc;
  if (bcc) mailOptions.bcc = bcc;
  if (replyTo) mailOptions.replyTo = replyTo;

  const result = await transport.sendMail(mailOptions);

  // Verify the email was actually accepted
  const accepted = result.accepted || [];
  const rejected = result.rejected || [];

  if (accepted.length === 0) {
    throw new Error(`Email failed to send. No recipients accepted the message.`);
  }

  if (rejected.length > 0) {
    throw new Error(`Email partially failed. Rejected recipients: ${rejected.join(', ')}`);
  }

  // Only return success if we have confirmation
  addNotification(`mail sent to ${accepted.join(', ')} ✓`);

  return {
    success: true,
    messageId: result.messageId,
    accepted: accepted,
    message: `Email successfully sent to ${accepted.join(', ')}`,
  };
}

/**
 * Get mailbox list
 * @returns {Promise<Array>} Array of mailbox names
 */
export async function listMailboxes() {
  const client = getImapClient();
  if (!client) {
    throw new Error('IMAP client not connected');
  }

  const mailboxes = await client.list();
  return mailboxes.map(mb => ({
    name: mb.name,
    path: mb.path,
    specialUse: mb.specialUse,
  }));
}

/**
 * Get unread count for a mailbox
 * @param {string} mailbox - Mailbox name (default: INBOX)
 * @returns {Promise<number>} Unread count
 */
export async function getUnreadCount(mailbox = 'INBOX') {
  const client = getImapClient();
  if (!client) {
    throw new Error('IMAP client not connected');
  }

  const status = await client.status(mailbox, { unseen: true });
  return status.unseen || 0;
}
