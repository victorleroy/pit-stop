import {config} from '~/config';

/** Names are typed by users: an inviter called `<a href=...>` must not shape the email. */
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const layout = (title: string, body: string, action?: {label: string; url: string}): string => `
<!doctype html>
<html lang="en"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
  <h1 style="font-size:20px">${title}</h1>
  ${body}
  ${
    action
      ? `<p><a href="${action.url}" style="display:inline-block;padding:10px 18px;background:#1a1a1a;color:#fff;border-radius:6px;text-decoration:none">${action.label}</a></p>
         <p style="font-size:12px;color:#666">If the button does not work, paste this link: ${action.url}</p>`
      : ''
  }
  <p style="font-size:12px;color:#666">${config.appName}</p>
</body></html>`;

export const invitationEmail = (orgName: string, inviterName: string, token: string) => {
  const link = `${config.appUrl}/invite/${token}`;
  const org = escapeHtml(orgName);
  const inviter = escapeHtml(inviterName);

  return {
    html: layout(
      `${inviter} invited you to ${org}`,
      `<p>Retrospectives at ${org} run on ${escapeHtml(config.appName)}. This invitation expires in ${config.invitationTtlDays} days.</p>`,
      {label: 'Accept the invitation', url: link},
    ),
    link,
    subject: `${inviterName} invited you to ${orgName}`,
  };
};

export const passwordResetEmail = (token: string) => {
  const link = `${config.appUrl}/reset-password/${token}`;

  return {
    html: layout(
      'Reset your password',
      `<p>This link is valid for ${config.passwordResetTtlMinutes} minutes and can be used once. If you did not ask for it, ignore this email.</p>`,
      {label: 'Choose a new password', url: link},
    ),
    link,
    subject: `Reset your ${config.appName} password`,
  };
};

export const emailVerificationEmail = (token: string) => {
  const link = `${config.appUrl}/verify-email/${token}`;

  return {
    html: layout(
      'Confirm your email address',
      `<p>Confirm this address and choose your password to finish creating your ${escapeHtml(config.appName)} account. The link is valid for ${config.passwordResetTtlMinutes} minutes and can be used once. If you did not ask for it, ignore this email.</p>`,
      {label: 'Confirm my address', url: link},
    ),
    link,
    subject: `Confirm your ${config.appName} account`,
  };
};
