const required = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable "${name}"`);
  }

  return value;
};

const optional = (name: string, fallback: string): string => process.env[name] ?? fallback;

const isProduction = process.env.NODE_ENV === 'production';

export const EDITIONS = ['self-hosted', 'cloud'] as const;
export type Edition = (typeof EDITIONS)[number];

const edition = optional('EDITION', 'self-hosted') as Edition;

if (!EDITIONS.includes(edition)) {
  throw new Error(`EDITION must be one of ${EDITIONS.join(', ')}, got "${edition}"`);
}

export const config = {
  appName: optional('APP_NAME', 'Pit Stop'),
  appUrl: optional('APP_URL', 'http://localhost:5173').replace(/\/+$/, ''),
  databaseFile: optional('DATABASE_FILE', './data/pit-stop.db'),

  /**
   * Configuration, never data (ADR-002 D3): the self-hosted edition has no quotas, the cloud
   * applies Plans.ts. The default is self-hosted because a quota is never a security tier.
   */
  edition,
  googleClientId: optional('GOOGLE_CLIENT_ID', ''),
  // Opt-in, never the absence of NODE_ENV: a dev login on a forgotten setting is a backdoor.
  isLocal: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  isProduction,
  port: Number(optional('PORT', '3000')),

  /** The built SPA, served by the service itself when set (ADR-002 D4). */
  webDist: optional('WEB_DIST', ''),

  /**
   * Platform admin is configuration, never data (ADR D8, D12): nobody can grant it with a
   * database write, only with a deploy.
   */
  platformAdminEmails: optional('PLATFORM_ADMIN_EMAILS', '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),

  mail: {
    from: optional('MAIL_FROM', 'Pit Stop <noreply@localhost>'),
    resendApiKey: optional('RESEND_API_KEY', ''),
    smtp: {
      host: optional('SMTP_HOST', ''),
      password: optional('SMTP_PASSWORD', ''),
      port: Number(optional('SMTP_PORT', '587')),
      // Implicit TLS (465) when true, STARTTLS upgrade otherwise.
      secure: optional('SMTP_SECURE', 'false') === 'true',
      user: optional('SMTP_USER', ''),
    },
  },

  sessionTtlDays: Number(optional('SESSION_TTL_DAYS', '30')),
  invitationTtlDays: Number(optional('INVITATION_TTL_DAYS', '7')),
  passwordResetTtlMinutes: Number(optional('PASSWORD_RESET_TTL_MINUTES', '30')),

  requireInProduction: (): void => {
    // Google, mail and the paddock are optional (ADR-002 D5): only the public URL is needed,
    // because every link the service sends or prints is built on it.
    if (isProduction) {
      required('APP_URL');
    }
  },
};
