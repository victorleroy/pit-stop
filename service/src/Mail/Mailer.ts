import {createTransport} from 'nodemailer';
import type {Transporter} from 'nodemailer';
import {config} from '~/config';
import {logger} from '~/logger';

export interface Email {
  html: string;
  /** The one link the email exists to deliver, printed when nothing is sent. */
  link?: string;
  subject: string;
  to: string;
}

/**
 * Three transactional emails only (ADR D12): invitation, password reset, email change.
 * Email verification is subsumed by the invitation on the invited path.
 */
export interface Mailer {
  readonly delivers: boolean;
  send(email: Email): Promise<void>;
}

/**
 * Used whenever no transport is configured, production included (ADR-002 D5): nothing leaves
 * the machine and the link lands in the logs, which only the operator reads.
 */
export class ConsoleMailer implements Mailer {
  public readonly delivers = false;

  public async send(email: Email): Promise<void> {
    logger.info(
      {link: email.link, subject: email.subject, to: email.to},
      'Email not sent, no mail transport configured',
    );
    logger.debug({html: email.html}, 'Email body');
  }
}

export class SmtpMailer implements Mailer {
  public readonly delivers = true;

  private readonly transport: Transporter;

  public constructor(
    options: {host: string; password: string; port: number; secure: boolean; user: string},
    private readonly from: string,
  ) {
    this.transport = createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      ...(options.user ? {auth: {pass: options.password, user: options.user}} : {}),
    });
  }

  public async send(email: Email): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        html: email.html,
        subject: email.subject,
        to: email.to,
      });
    } catch (error: unknown) {
      logger.error({err: error, to: email.to}, 'Transactional email refused');
      throw new Error('The mail server refused the message');
    }
  }
}

export class ResendMailer implements Mailer {
  public readonly delivers = true;

  public constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  public async send(email: Email): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: this.from,
        html: email.html,
        subject: email.subject,
        to: [email.to],
      }),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      const body = await response.text();

      // A failed invitation is a broken onboarding with no product-side signal: it is logged
      // loudly on purpose (ADR D12, deliverability risk).
      logger.error({body, status: response.status, to: email.to}, 'Transactional email refused');
      throw new Error(`Email provider refused the message (${response.status})`);
    }
  }
}

export const createMailer = (): Mailer => {
  if (config.mail.smtp.host) {
    return new SmtpMailer(config.mail.smtp, config.mail.from);
  }

  if (config.mail.resendApiKey) {
    return new ResendMailer(config.mail.resendApiKey, config.mail.from);
  }

  return new ConsoleMailer();
};
