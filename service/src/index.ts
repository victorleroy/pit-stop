import 'reflect-metadata';

import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {serve} from '@hono/node-server';
import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {secureHeaders} from 'hono/secure-headers';
import {WebSocketServer} from 'ws';
import {config} from '~/config';
import {createContainer} from '~/container';
import {migrate} from '~/Db/migrate';
import {errorHandler} from '~/Http/errorHandler';
import {requireAuth} from '~/Http/middleware/auth';
import type {Variables} from '~/Http/middleware/auth';
import {authRoutes} from '~/Http/routes/auth';
import {orgRoutes} from '~/Http/routes/org';
import {platformRoutes} from '~/Http/routes/platform';
import {retroRoutes} from '~/Http/routes/retros';
import {teamRoutes} from '~/Http/routes/teams';
import {createSocketAttacher, SOCKET_PROTOCOL, tokenFromProtocols} from '~/Realtime/attachSocket';
import {logger} from '~/logger';

config.requireInProduction();
migrate(config.databaseFile);

const container = createContainer();
const app = new Hono<{Variables: Variables}>();

app.use('*', cors({allowHeaders: ['Content-Type', 'Authorization'], origin: config.appUrl}));
// Google sign-in opens a popup that must be able to report back to this window.
app.use('*', secureHeaders({crossOriginOpenerPolicy: 'same-origin-allow-popups'}));
app.onError(errorHandler);

app.get('/health', (context) =>
  context.json({liveRetros: container.hub.liveRetroCount, status: 'ok'}),
);

// The API lives under /api in every deployment, so the SPA and the API share one origin
// whether the front comes from Vite or from this process (ADR-002 D4).
const api = new Hono<{Variables: Variables}>();
api.route('/', authRoutes(container));

const guarded = new Hono<{Variables: Variables}>();
guarded.use('*', requireAuth(container.authManager));
guarded.route('/', orgRoutes(container));
guarded.route('/', teamRoutes(container));
guarded.route('/', retroRoutes(container));
guarded.route('/', platformRoutes(container));
api.route('/', guarded);
app.route('/api', api);

if (config.webDist) {
  const root = resolve(config.webDist);
  const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

  app.use('/*', serveStatic({root}));
  // Client-side routes (/teams, /invite/:token...) all resolve to the SPA shell.
  app.get('*', (context) =>
    context.req.path.startsWith('/api/')
      ? context.json({message: 'Not found'}, 404)
      : context.html(indexHtml),
  );
}

const server = serve({fetch: app.fetch, port: config.port}, (info) =>
  logger.info(
    {edition: config.edition, port: info.port, web: Boolean(config.webDist)},
    `${config.appName} service listening`,
  ),
);

if (!container.mailer.delivers) {
  logger.warn('No mail transport configured: invitation and reset links are printed here');
}

void container.setupManager.announce();

// Nothing reads an expired session or a spent one-time token again: they are purged at boot,
// then every hour.
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
const purgeExpired = (): void => {
  container.authManager
    .purgeExpired()
    .catch((error: unknown) => logger.error({err: error}, 'Expired token purge failed'));
};

purgeExpired();
setInterval(purgeExpired, PURGE_INTERVAL_MS).unref();

// ---------------------------------------------------------------- websockets

// A cursor message is a few dozen bytes: nothing legitimate comes close to this ceiling.
const wss = new WebSocketServer({
  // Answers the fixed subprotocol only: echoing the token back would serve no purpose.
  handleProtocols: (protocols) => (protocols.has(SOCKET_PROTOCOL) ? SOCKET_PROTOCOL : false),
  maxPayload: 4096,
  noServer: true,
});
const attach = createSocketAttacher(container);

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    attach(ws, tokenFromProtocols(request.headers['sec-websocket-protocol']) ?? '').catch(
      (error: unknown) => {
        logger.error({err: error}, 'Websocket attach failed');
        ws.close();
      },
    );
  });
});

const shutdown = (): void => {
  logger.info('Shutting down');
  wss.close();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
