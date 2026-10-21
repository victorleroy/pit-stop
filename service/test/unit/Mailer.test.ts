import {config} from '~/config';
import {ConsoleMailer, createMailer, ResendMailer, SmtpMailer} from '~/Mail/Mailer';

/** ADR-002 D5: SMTP, Resend, or nothing sent at all, and the caller knows which. */
describe('createMailer', () => {
  afterEach(() => {
    config.mail.smtp.host = '';
    config.mail.resendApiKey = '';
  });

  it('prints instead of sending when no transport is configured', () => {
    const mailer = createMailer();

    expect(mailer).toBeInstanceOf(ConsoleMailer);
    expect(mailer.delivers).toBe(false);
  });

  it('uses Resend when its key is set', () => {
    config.mail.resendApiKey = 're_test';

    expect(createMailer()).toBeInstanceOf(ResendMailer);
  });

  it('prefers SMTP over Resend when both are set', () => {
    config.mail.resendApiKey = 're_test';
    config.mail.smtp.host = 'smtp.example.test';

    const mailer = createMailer();

    expect(mailer).toBeInstanceOf(SmtpMailer);
    expect(mailer.delivers).toBe(true);
  });
});
