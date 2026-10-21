import {invitationEmail} from '~/Mail/templates';

describe('invitationEmail', () => {
  it('escapes names typed by users before they reach the HTML', () => {
    const email = invitationEmail('Acme', '<a href="https://evil.test">Boss</a>', 'token');

    expect(email.html).not.toContain('<a href="https://evil.test">');
    expect(email.html).toContain('&#60;a href=&#34;https://evil.test&#34;&#62;Boss');
  });

  it('carries the link it exists to deliver', () => {
    expect(invitationEmail('Acme', 'Boss', 'abc').link).toMatch(/\/invite\/abc$/);
  });
});
