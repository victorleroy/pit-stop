import {Hono} from 'hono';
import type {Container} from '~/container';
import {UpdateActionDto} from '~/Dto/Action/ActionDto';
import {SetAdminDto} from '~/Dto/Admin/AdminDto';
import {AddTeamMemberDto, CreateTeamDto, RenameTeamDto} from '~/Dto/Team/CreateTeamDto';
import type {Variables} from '~/Http/middleware/auth';
import {validateBody} from '~/Http/middleware/validate';
import type {ActionStatus} from '~/Db/schema';

export const teamRoutes = (c: Container) => {
  const app = new Hono<{Variables: Variables}>();

  app.get('/teams', async (context) =>
    context.json(await c.teamManager.listTeams(context.get('auth'))),
  );

  app.post('/teams', async (context) => {
    const body = await validateBody(context, CreateTeamDto);

    return context.json(await c.teamManager.createTeam(context.get('auth'), body.name), 201);
  });

  app.patch('/teams/:teamId', async (context) => {
    const body = await validateBody(context, RenameTeamDto);

    return context.json(
      await c.teamManager.renameTeam(context.get('auth'), context.req.param('teamId'), body.name),
    );
  });

  app.delete('/teams/:teamId', async (context) => {
    const retroIds = await c.teamManager.deleteTeam(
      context.get('auth'),
      context.req.param('teamId'),
    );

    // Whoever is still on one of its boards learns that the retro is gone. Through each retro's
    // queue, so the commands already in flight on it settle before the notice goes out.
    await Promise.all(retroIds.map((retroId) => c.hub.run(retroId, async () => undefined)));

    return context.body(null, 204);
  });

  app.get('/teams/:teamId/summary', async (context) =>
    context.json(
      await c.teamManager.getTeamSummary(context.get('auth'), context.req.param('teamId')),
    ),
  );

  app.delete('/teams/:teamId/members/me', async (context) => {
    await c.teamManager.leaveTeam(context.get('auth'), context.req.param('teamId'));

    return context.body(null, 204);
  });

  app.post('/teams/:teamId/members', async (context) => {
    const body = await validateBody(context, AddTeamMemberDto);

    await c.teamManager.addMember(context.get('auth'), context.req.param('teamId'), body.userId);

    return context.body(null, 204);
  });

  app.delete('/teams/:teamId/members/:userId', async (context) => {
    await c.teamManager.removeMember(
      context.get('auth'),
      context.req.param('teamId'),
      context.req.param('userId'),
    );

    return context.body(null, 204);
  });

  app.get('/teams/:teamId/members', async (context) =>
    context.json(
      await c.teamManager.listMembers(context.get('auth'), context.req.param('teamId')),
    ),
  );

  app.put('/teams/:teamId/members/:userId/admin', async (context) => {
    const body = await validateBody(context, SetAdminDto);

    await c.teamManager.setMemberAdmin(
      context.get('auth'),
      context.req.param('teamId'),
      context.req.param('userId'),
      body.isAdmin,
    );

    return context.body(null, 204);
  });

  app.get('/teams/:teamId/actions', async (context) =>
    context.json(
      await c.actionManager.listByTeam(context.get('auth'), context.req.param('teamId')),
    ),
  );

  app.patch('/teams/:teamId/actions/:actionId', async (context) => {
    const body = await validateBody(context, UpdateActionDto);

    const auth = context.get('auth');
    const teamId = context.req.param('teamId');
    const actionId = context.req.param('actionId');
    const update = () =>
      c.actionManager.update(auth, teamId, actionId, {
        ...(body.assigneeId === undefined ? {} : {assigneeId: body.assigneeId}),
        ...(body.status ? {status: body.status as ActionStatus} : {}),
        ...(body.text ? {text: body.text} : {}),
      });
    const retroId = await c.actionManager.findRetroId(auth, teamId, actionId);

    // Editing an action changes the board of the retro it came from: it goes through that
    // retro's queue, like every other board mutation, which also broadcasts the new board.
    const action = retroId ? await c.hub.run(retroId, update) : await update();

    return context.json(action);
  });

  return app;
};
