import {Hono} from 'hono';
import type {Container} from '~/container';
import {
  DefaultTemplateDto,
  DuplicateTemplateDto,
  SaveAsTemplateDto,
  TemplateDto,
} from '~/Dto/Template/TemplateDto';
import type {Variables} from '~/Http/middleware/auth';
import {validateBody} from '~/Http/middleware/validate';
import type {TemplateContent} from '~/Repository/RetroTemplateRepository';

const contentOf = (body: TemplateDto): TemplateContent => ({
  actionReview: body.actionReview ?? null,
  columns: body.columns.map(({prompt, title}) => ({prompt: prompt ?? null, title})),
  description: body.description ?? null,
  icebreaker: body.icebreaker ?? null,
  maxVotes: body.maxVotes ?? null,
  name: body.name,
  timerSeconds: body.timerSeconds ?? null,
});

/**
 * Template writes touch no retro (a retro keeps the copy it was created from), so they do not
 * go through the hub and broadcast nothing. Saving a board as a template is the exception: it
 * reads the board's columns, in the retro's queue.
 */
export const templateRoutes = (c: Container) => {
  const app = new Hono<{Variables: Variables}>();

  app.get('/teams/:teamId/templates', async (context) =>
    context.json(
      await c.retroTemplateManager.list(context.get('auth'), context.req.param('teamId')),
    ),
  );

  app.post('/teams/:teamId/templates', async (context) => {
    const body = await validateBody(context, TemplateDto);

    return context.json(
      await c.retroTemplateManager.create(
        context.get('auth'),
        context.req.param('teamId'),
        contentOf(body),
      ),
      201,
    );
  });

  app.post('/teams/:teamId/templates/duplicate', async (context) => {
    const body = await validateBody(context, DuplicateTemplateDto);

    return context.json(
      await c.retroTemplateManager.duplicate(
        context.get('auth'),
        context.req.param('teamId'),
        body.sourceTemplateId,
        body.name,
      ),
      201,
    );
  });

  app.put('/teams/:teamId/templates/:templateId', async (context) => {
    const body = await validateBody(context, TemplateDto);

    return context.json(
      await c.retroTemplateManager.update(
        context.get('auth'),
        context.req.param('teamId'),
        context.req.param('templateId'),
        contentOf(body),
      ),
    );
  });

  app.delete('/teams/:teamId/templates/:templateId', async (context) => {
    await c.retroTemplateManager.remove(
      context.get('auth'),
      context.req.param('teamId'),
      context.req.param('templateId'),
    );

    return context.body(null, 204);
  });

  app.put('/teams/:teamId/default-template', async (context) => {
    const body = await validateBody(context, DefaultTemplateDto);

    return context.json(
      await c.retroTemplateManager.setDefault(
        context.get('auth'),
        context.req.param('teamId'),
        body.templateId ?? null,
      ),
    );
  });

  app.post('/retros/:retroId/template', async (context) => {
    const retroId = context.req.param('retroId');
    const body = await validateBody(context, SaveAsTemplateDto);
    const template = await c.hub.run(retroId, () =>
      c.retroTemplateManager.saveFromRetro(context.get('auth'), retroId, {
        description: body.description ?? null,
        name: body.name,
      }),
    );

    return context.json(template, 201);
  });

  return app;
};
