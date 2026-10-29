import {Hono} from 'hono';
import type {Container} from '~/container';
import {SetAdminDto} from '~/Dto/Admin/AdminDto';
import {OrgStatsQueryDto} from '~/Dto/Admin/OrgStatsQueryDto';
import {InviteDto} from '~/Dto/Auth/PasswordDto';
import type {Variables} from '~/Http/middleware/auth';
import {validateBody, validateQuery} from '~/Http/middleware/validate';
import type {OrgRole} from '~/Db/schema';
import type {StatsPeriod} from '~/Model/OrgModel';

export const orgRoutes = (c: Container) => {
  const app = new Hono<{Variables: Variables}>();

  app.get('/me', async (context) => context.json(await c.authManager.getMe(context.get('auth'))));

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
