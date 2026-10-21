import {Hono} from 'hono';
import type {Container} from '~/container';
import {config} from '~/config';
import {DevLoginDto} from '~/Dto/Auth/DevLoginDto';
import {GoogleLoginDto} from '~/Dto/Auth/GoogleLoginDto';
import {
  AcceptInvitationDto,
  ConfirmResetDto,
  LoginDto,
  RegisterDto,
  RequestResetDto,
  SetupDto,
  VerifyEmailDto,
} from '~/Dto/Auth/PasswordDto';
import {bearerOf} from '~/Http/middleware/auth';
import type {Variables} from '~/Http/middleware/auth';
import {validateBody} from '~/Http/middleware/validate';

export const authRoutes = (c: Container) => {
  const app = new Hono<{Variables: Variables}>();

  app.post('/auth/google', async (context) => {
    const body = await validateBody(context, GoogleLoginDto);

    return context.json(await c.authManager.loginWithGoogle(body.idToken));
  });

  app.post('/auth/login', async (context) => {
    const body = await validateBody(context, LoginDto);

    return context.json(await c.authManager.loginWithPassword(body.email, body.password));
  });

  app.post('/auth/register', async (context) => {
    const body = await validateBody(context, RegisterDto);

    await c.authManager.register({email: body.email, name: body.name});

    // No session yet: the account opens once the address is confirmed.
    return context.body(null, 202);
  });

  app.post('/auth/verify-email', async (context) => {
    const body = await validateBody(context, VerifyEmailDto);

    return context.json(await c.authManager.verifyEmail(body.token, body.password));
  });

  /**
   * Accepting binds the email (ADR D12): the invitation cannot be redeemed from another
   * address, so forwarding the mail does not let somebody into the organisation.
   */
  app.post('/auth/invitations/accept', async (context) => {
    const body = await validateBody(context, AcceptInvitationDto);
    const token = bearerOf(context);
    const signedIn = token ? await c.authManager.resolveSession(token) : undefined;

    const accepted = await c.invitationManager.accept({
      ...(body.name ? {name: body.name} : {}),
      ...(body.password ? {password: body.password} : {}),
      token: body.token,
      ...(signedIn ? {userId: signedIn.userId} : {}),
    });

    if (signedIn) {
      return context.body(null, 204);
    }

    // The account was just created from the invitation: sign it in.
    const user = await c.authManager.findUser(accepted.userId);

    return context.json(await c.authManager.issueSession(user));
  });

  /** Answers 204 either way: this route must not tell whether an account exists. */
  app.post('/auth/password-reset', async (context) => {
    const body = await validateBody(context, RequestResetDto);

    await c.passwordResetManager.request(body.email);

    return context.body(null, 204);
  });

  app.put('/auth/password-reset', async (context) => {
    const body = await validateBody(context, ConfirmResetDto);

    await c.passwordResetManager.confirm(body.token, body.password);

    return context.body(null, 204);
  });

  app.post('/auth/dev-login', async (context) => {
    const body = await validateBody(context, DevLoginDto);

    return context.json(await c.authManager.devLogin(body.email, body.name));
  });

  app.post('/auth/logout', async (context) => {
    const token = bearerOf(context);

    if (token) {
      await c.authManager.logout(token);
    }

    return context.body(null, 204);
  });

  /** First boot only (ADR-002 D6): the token comes from the logs, never from this API. */
  app.post('/setup', async (context) => {
    const body = await validateBody(context, SetupDto);

    return context.json(
      await c.setupManager.complete({
        email: body.email,
        name: body.name,
        orgName: body.orgName,
        password: body.password,
        token: body.token,
      }),
    );
  });

  app.get('/config', async (context) =>
    context.json({
      appName: config.appName,
      devLoginEnabled: config.isLocal,
      googleClientId: config.googleClientId,
      mailEnabled: c.mailer.delivers,
      setupRequired: await c.setupManager.isRequired(),
    }),
  );

  return app;
};
