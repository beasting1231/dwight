import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

let imapClient = null;
let smtpTransport = null;

/**
 * Get IMAP configuration based on provider
 */
export function getImapConfig(provider, email, password) {
  const configs = {
    gmail: {
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
    },
    outlook: {
      host: 'outlook.office365.com',
      port: 993,
      secure: true,
    },
    yahoo: {
      host: 'imap.mail.yahoo.com',
      port: 993,
      secure: true,
    },
  };

  const base = configs[provider] || {};

  return {
    host: base.host,
    port: base.port || 993,
    secure: base.secure !== false,
    auth: {
      user: email,
      pass: password,
    },
    logger: false,
  };
}

/**
 * Get SMTP configuration based on provider
 */
export function getSmtpConfig(provider, email, password) {
  const configs = {
    gmail: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
    },
    outlook: {
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
    },
    yahoo: {
      host: 'smtp.mail.yahoo.com',
      port: 587,
      secure: false,
    },
  };

  const base = configs[provider] || {};

  return {
    host: base.host,
    port: base.port || 587,
    secure: base.secure || false,
    auth: {
      user: email,
      pass: password,
    },
  };
}

/**
 * Connect to IMAP server
 */
export async function connectImap(config) {
  if (imapClient) {
    try {
      await imapClient.logout();
    } catch (e) {
      // Ignore logout errors
    }
  }

  imapClient = new ImapFlow(config);
  await imapClient.connect();
  return imapClient;
}

/**
 * Get current IMAP client
 */
export function getImapClient() {
  return imapClient;
}

/**
 * Disconnect IMAP client
 */
export async function disconnectImap() {
  if (imapClient) {
    await imapClient.logout();
    imapClient = null;
  }
}

/**
 * Create SMTP transport
 */
export function createSmtpTransport(config) {
  smtpTransport = nodemailer.createTransport(config);
  return smtpTransport;
}

/**
 * Get current SMTP transport
 */
export function getSmtpTransport() {
  return smtpTransport;
}

/**
 * Verify SMTP connection
 */
export async function verifySmtp() {
  if (!smtpTransport) {
    throw new Error('SMTP transport not configured');
  }
  return smtpTransport.verify();
}
