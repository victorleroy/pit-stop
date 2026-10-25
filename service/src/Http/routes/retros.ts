import {Hono} from 'hono';
import type {Container} from '~/container';
import type {RetroPhase} from '~/Db/schema';
import {RenameClusterDto, GroupNoteDto} from '~/Dto/Retro/ClusterDto';
import {CreateColumnDto, RenameColumnDto} from '~/Dto/Retro/ColumnDto';
import {CreateRetroDto} from '~/Dto/Retro/CreateRetroDto';
import {CreateNoteDto, UpdateNoteDto} from '~/Dto/Retro/NoteDto';
import {UpdateRetroDto} from '~/Dto/Retro/UpdateRetroDto';
import {CastVoteDto} from '~/Dto/Retro/VoteDto';
import {CreateActionDto} from '~/Dto/Action/ActionDto';
import {HandOverDto} from '~/Dto/Admin/AdminDto';
import type {Variables} from '~/Http/middleware/auth';
import {validateBody} from '~/Http/middleware/validate';
import type {TimerAction} from '~/Model/TimerModel';

/**
 * Every board mutation goes through the hub: the command is handled in that retro's queue,
 * then the new board is fanned out from the same queue (ADR-001 D1). The broadcast is triggered by
 * the command, never by a database write.
 */
export const retroRoutes = (c: Container) => {
  const app = new Hono<{Variables: Variables}>();

  app.get('/me/retros', async (context) =>
    context.json(await c.retroManager.listMine(context.get('auth'))),
  );

  app.get('/teams/:teamId/retros', async (context) =>
    context.json(
      await c.retroManager.listByTeam(context.get('auth'), context.req.param('teamId')),
    ),
  );

  app.post('/teams/:teamId/retros', async (context) => {
    const body = await validateBody(context, CreateRetroDto);
    const board = await c.retroManager.create(
      context.get('auth'),
      context.req.param('teamId'),
      body.title,
      body.columns,
    );

    return context.json(board, 201);
  });

  app.get('/retros/:retroId', async (context) =>
    context.json(await c.retroManager.getBoard(context.get('auth'), context.req.param('retroId'))),
  );

  app.patch('/retros/:retroId', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, UpdateRetroDto);

    const board = await c.hub.run(retroId, () =>
      c.retroManager.updateRetro(context.get('auth'), retroId, {
        ...(body.phase ? {phase: body.phase as RetroPhase} : {}),
        ...(body.title ? {title: body.title} : {}),
        ...(body.timer
          ? {
              timer: {
                action: body.timer.action as TimerAction,
                ...(body.timer.seconds === undefined ? {} : {seconds: body.timer.seconds}),
              },
            }
          : {}),
      }),
    );

    return context.json(board);
  });

  app.delete('/retros/:retroId', async (context) => {
    const retroId = context.req.param('retroId');

    await c.hub.run(retroId, () => c.retroManager.remove(context.get('auth'), retroId));

    return context.body(null, 204);
  });

  // ------------------------------------------------------------------ columns

  app.post('/retros/:retroId/columns', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, CreateColumnDto);
    const board = await c.hub.run(retroId, () =>
      c.retroManager.addColumn(context.get('auth'), retroId, body.title),
    );

    return context.json(board, 201);
  });

  app.patch('/retros/:retroId/columns/:columnId', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, RenameColumnDto);
    const board = await c.hub.run(retroId, () =>
      c.retroManager.renameColumn(
        context.get('auth'),
        retroId,
        context.req.param('columnId'),
        body.title,
      ),
    );

    return context.json(board);
  });

  app.delete('/retros/:retroId/columns/:columnId', async (context) => {
    const retroId = context.req.param('retroId');
    const board = await c.hub.run(retroId, () =>
      c.retroManager.removeColumn(context.get('auth'), retroId, context.req.param('columnId')),
    );

    return context.json(board);
  });

  // -------------------------------------------------------------------- notes

  app.post('/retros/:retroId/notes', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, CreateNoteDto);
    const board = await c.hub.run(retroId, () =>
      c.noteManager.create(context.get('auth'), retroId, body.columnId, body.text),
    );

    return context.json(board, 201);
  });

  app.patch('/retros/:retroId/notes/:noteId', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, UpdateNoteDto);
    const board = await c.hub.run(retroId, () =>
      c.noteManager.update(context.get('auth'), retroId, context.req.param('noteId'), {
        ...(body.columnId ? {columnId: body.columnId} : {}),
        ...(body.text === undefined ? {} : {text: body.text}),
      }),
    );

    return context.json(board);
  });

  app.post('/retros/:retroId/notes/reveal', async (context) => {
    const retroId = context.req.param('retroId');
    const board = await c.hub.run(retroId, () =>
      c.noteManager.setMineRevealed(context.get('auth'), retroId, true),
    );

    return context.json(board);
  });

  app.delete('/retros/:retroId/notes/reveal', async (context) => {
    const retroId = context.req.param('retroId');
    const board = await c.hub.run(retroId, () =>
      c.noteManager.setMineRevealed(context.get('auth'), retroId, false),
    );

    return context.json(board);
  });

  // Declared after /notes/reveal on purpose: the first matching route wins, and ":noteId"
  // would otherwise read "reveal" as a note id.
  app.delete('/retros/:retroId/notes/:noteId', async (context) => {
    const retroId = context.req.param('retroId');
    const board = await c.hub.run(retroId, () =>
      c.noteManager.remove(context.get('auth'), retroId, context.req.param('noteId')),
    );

    return context.json(board);
  });

  // ----------------------------------------------------------------- clusters

  app.post('/retros/:retroId/notes/:noteId/group', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, GroupNoteDto);
    const board = await c.hub.run(retroId, () =>
      c.clusterManager.group(
        context.get('auth'),
        retroId,
        context.req.param('noteId'),
        body.targetId,
      ),
    );

    return context.json(board);
  });

  app.delete('/retros/:retroId/notes/:noteId/group', async (context) => {
    const retroId = context.req.param('retroId');
    const board = await c.hub.run(retroId, () =>
      c.clusterManager.ungroup(context.get('auth'), retroId, context.req.param('noteId')),
    );

    return context.json(board);
  });

  app.patch('/retros/:retroId/clusters/:clusterId', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, RenameClusterDto);
    const board = await c.hub.run(retroId, () =>
      c.clusterManager.rename(
        context.get('auth'),
        retroId,
        context.req.param('clusterId'),
        body.title,
      ),
    );

    return context.json(board);
  });

  // -------------------------------------------------------------------- votes

  app.post('/retros/:retroId/votes', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, CastVoteDto);
    const board = await c.hub.run(retroId, () =>
      c.voteManager.cast(context.get('auth'), retroId, body.targetId, body.delta),
    );

    return context.json(board);
  });

  // ------------------------------------------------------------- facilitation

  app.post('/retros/:retroId/facilitator', async (context) => {
    const retroId = context.req.param('retroId');

    await c.hub.run(retroId, () => c.adminManager.takeFacilitation(context.get('auth'), retroId));

    return context.body(null, 204);
  });

  app.put('/retros/:retroId/facilitator', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, HandOverDto);

    await c.hub.run(retroId, () =>
      c.adminManager.handOverFacilitation(context.get('auth'), retroId, body.userId),
    );

    return context.body(null, 204);
  });

  // ------------------------------------------------------------------ actions

  app.post('/retros/:retroId/actions', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, CreateActionDto);
    const action = await c.hub.run(retroId, () =>
      c.actionManager.create(context.get('auth'), retroId, body.text, body.assigneeId),
    );

    return context.json(action, 201);
  });

  return app;
};
