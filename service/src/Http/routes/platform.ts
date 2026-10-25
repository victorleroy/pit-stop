import {Hono} from 'hono';
import type {Container} from '~/container';
import type {OrgStatus} from '~/Db/schema';
import {
  CreateOrgDto,
  ReleaseDomainDto,
  SetOrgStatusDto,
  VerifyDomainDto,
} from '~/Dto/Admin/PlatformDto';
import type {Variables} from '~/Http/middleware/auth';
import {validateBody} from '~/Http/middleware/validate';

/**
 * The paddock (ADR-001 D8). Metadata and counters only: there is no route here that can read
 * a note, a vote or a note's author, and none that impersonates a user.
 */
export const platformRoutes = (c: Container) => {
  const app = new Hono<{Variables: Variables}>();

  app.get('/paddock/organizations', async (context) =>
    context.json(await c.platformManager.listOrganizations(context.get('auth'))),
  );

  app.post('/paddock/organizations', async (context) => {
    const body = await validateBody(context, CreateOrgDto);

    return context.json(
      await c.platformManager.createOrganization(
        context.get('auth'),
        body.name,
        body.adminEmail,
        body.domain,
      ),
      201,
    );
  });

  app.put('/paddock/organizations/:orgId/status', async (context) => {
    const body = await validateBody(context, SetOrgStatusDto);

    await c.platformManager.setStatus(
      context.get('auth'),
      context.req.param('orgId'),
      body.status as OrgStatus,
    );

    return context.body(null, 204);
  });

  app.put('/paddock/organizations/:orgId/domains', async (context) => {
    const body = await validateBody(context, VerifyDomainDto);

    await c.platformManager.setDomainVerified(
      context.get('auth'),
      context.req.param('orgId'),
      body.domain,
      body.verified,
    );

    return context.body(null, 204);
  });

  app.delete('/paddock/organizations/:orgId/domains', async (context) => {
    const body = await validateBody(context, ReleaseDomainDto);

    await c.platformManager.removeDomain(
      context.get('auth'),
      context.req.param('orgId'),
      body.domain,
    );

    return context.body(null, 204);
  });

  return app;
};
