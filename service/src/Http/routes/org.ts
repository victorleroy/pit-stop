import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import type {Container} from '~/container';
import {SetAdminDto} from '~/Dto/Admin/AdminDto';
import {OrgStatsQueryDto} from '~/Dto/Admin/OrgStatsQueryDto';
import {InviteDto} from '~/Dto/Auth/PasswordDto';
import {UpdateProfileDto} from '~/Dto/Auth/ProfileDto';
import {PayloadTooLargeHttpError} from '~/Error/HttpError';
import {AVATAR_MAX_BYTES} from '~/Manager/ProfileManager';
import type {Variables} from '~/Http/middleware/auth';
import {validateBody, validateQuery} from '~/Http/middleware/validate';
import type {OrgRole} from '~/Db/schema';
import type {StatsPeriod} from '~/Model/OrgModel';

export const orgRoutes = (c: Container) => {
  const app = new Hono<{Variables: Variables}>();

  app.get('/me', async (context) => context.json(await c.authManager.getMe(context.get('auth'))));

  app.patch('/me', async (context) => {
    const body = await validateBody(context, UpdateProfileDto);
    const auth = context.get('auth');

    await c.profileManager.updateProfile(auth, {
      ...(body.name !== undefined ? {name: body.name} : {}),
      ...(body.useSsoName ? {useSsoName: true} : {}),
      ...(body.avatar ? {avatar: {source: body.avatar.source}} : {}),
    });

    return context.json(await c.authManager.getMe(auth));
  });

  // The client crops and re-encodes to 256x256 well under this ceiling; the service never
  // decodes the image (ADR on profiles, D4).
  app.put(
    '/me/avatar',
    bodyLimit({
      maxSize: AVATAR_MAX_BYTES,
      onError: () => {
        throw new PayloadTooLargeHttpError('The image must be at most 256 KB');
      },
    }),
    async (context) => {
      const auth = context.get('auth');
      const bytes = Buffer.from(await context.req.arrayBuffer());

      await c.profileManager.uploadAvatar(auth, context.req.header('content-type') ?? '', bytes);

      return context.json(await c.authManager.getMe(auth));
    },
  );

  app.delete('/me/avatar', async (context) => {
    const auth = context.get('auth');

    await c.profileManager.deleteAvatar(auth);

    return context.json(await c.authManager.getMe(auth));
  });

  app.get('/org/admins', async (context) =>
    context.json(await c.adminManager.listOrgAdmins(context.get('auth'))),
  );

  app.get('/org/members', async (context) =>
    context.json(await c.adminManager.listOrgMembers(context.get('auth'))),
  );

  app.put('/org/admins/:userId', async (context) => {
    const body = await validateBody(context, SetAdminDto);

    await c.adminManager.setOrgAdmin(
      context.get('auth'),
      context.req.param('userId'),
      body.isAdmin,
    );

    return context.body(null, 204);
  });

  app.delete('/org/members/:userId/avatar', async (context) => {
    await c.profileManager.removeMemberAvatar(context.get('auth'), context.req.param('userId'));

    return context.body(null, 204);
  });

  app.get('/org/stats', async (context) => {
    const query = await validateQuery(context, OrgStatsQueryDto);

    return context.json(
      await c.adminManager.getOrgStats(context.get('auth'), query.period as StatsPeriod),
    );
  });

  app.get('/org/invitations', async (context) =>
    context.json(await c.invitationManager.list(context.get('auth'))),
  );

  app.post('/org/invitations', async (context) => {
    const body = await validateBody(context, InviteDto);

    return context.json(
      await c.invitationManager.invite(
        context.get('auth'),
        body.email,
        (body.role ?? 'member') as OrgRole,
      ),
      201,
    );
  });

  app.delete('/org/invitations/:invitationId', async (context) => {
    await c.invitationManager.revoke(context.get('auth'), context.req.param('invitationId'));

    return context.body(null, 204);
  });

  return app;
};
