<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.png">
    <img alt="Pit Stop" src="docs/assets/logo-light.png" width="270">
  </picture>
</p>

# Pit Stop

A team retrospective tool. One retro is a board of stickies, live, with several people at
once: everyone writes in their corner, the notes then show up anonymous, you group them, vote,
and decide on actions. Actions left open come back automatically on the next retro.

The service guarantees anonymity: during the brainstorm, other people's text never leaves the
server, and nobody is tied to a note until they click "reveal". Every rule behind that promise
lives in one pure function, `RetroManager.projectBoard`, and you can read it.

- `service/` — Node API, Hono, WebSockets, SQLite
- `web/` — React + Vite
- `docs/BEHAVIOUR.md` — what the product does, stated once so it can be checked
- `docs/adr/` — the architecture decisions and the reasoning behind them

Pit Stop is free software under the [GNU AGPL v3](LICENSE).
Every page links to its source code, as the licence asks of anyone running a modified
version: a fork points `web/src/components/SourceLink.tsx` at its own repository.

## Run it yourself

One container, one volume, no account to open anywhere.

```bash
curl -O https://raw.githubusercontent.com/victorleroy/pit-stop/main/docker-compose.yml
docker compose up -d
docker compose logs pit-stop | grep setup
```

The logs print a one-time setup link. Open it, name your organisation and create its first
administrator. Then invite your colleagues from **Admin → Invitations**.

Set `APP_URL` in `docker-compose.yml` to the address people will actually open, behind
whatever reverse proxy terminates TLS for you. Every link in an email or in the logs is built
on it. The proxy must pass websockets through on `/ws`.

### What the anonymity protects, and from whom

Notes are withheld from the other participants, from organisation administrators and from the
paddock until their author reveals them. The product has no feature that reads a board, and
none will be added.

That promise stops at whoever holds the database file. On a self-hosted instance, that is
whoever operates it. Have it run by somebody outside the management line of the teams using
it: a retro where the team says the problem is its manager should not be readable by that
manager, even in theory.

### Configuration

Everything is optional except `APP_URL`.

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | — | Public address, base of every link. **Required in production** |
| `PORT` | `3000` | Port the service listens on |
| `DATABASE_FILE` | `/data/pit-stop.db` in the image | The SQLite file |
| `EDITION` | `self-hosted` | `self-hosted` has no quotas; `cloud` applies `service/src/Security/Plans.ts` |
| `PLATFORM_ADMIN_EMAILS` | — | Comma-separated addresses allowed into `/paddock`, to manage several organisations |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | —, `587`, —, —, `false` | Sends invitations and password resets. `SMTP_SECURE=true` for port 465 |
| `RESEND_API_KEY` | — | Alternative to SMTP |
| `MAIL_FROM` | `Pit Stop <noreply@localhost>` | Sender address |
| `GOOGLE_CLIENT_ID` | — | Adds "Continue with Google", with your own OAuth client |
| `LITESTREAM_S3_BUCKET`, `LITESTREAM_S3_ENDPOINT`, `LITESTREAM_S3_REGION`, `LITESTREAM_S3_PATH`, `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY` | —, —, `auto`, `pit-stop`, —, — | Continuous backup to any S3-compatible bucket |
| `SESSION_TTL_DAYS`, `INVITATION_TTL_DAYS`, `PASSWORD_RESET_TTL_MINUTES` | `30`, `7`, `30` | Lifetimes; the last one also bounds email confirmation links |
| `APP_NAME`, `LOG_LEVEL` | `Pit Stop`, `info` | Name shown in emails; pino log level |
| `WEB_DIST` | `/app/web/dist` in the image | Built web client served next to the API |

`LITESTREAM_S3_REGION` stays empty for AWS S3, where Litestream finds the bucket's region on
its own; Cloudflare R2 wants `auto`.

**Without a mail transport**, nothing is sent: each invitation, email confirmation and
password reset link is printed in the service logs, and whoever operates the instance passes
it on. The API never returns those links, because receiving one is what proves an address
belongs to its owner. It follows that **reading the logs is enough to take over any account**:
give log access to the people you would give the instance to, and configure SMTP as soon as
more than a handful of people use it.

### Backups

The database is a single SQLite file in the `/data` volume. **Without one of the two options
below, losing the disk loses everything.**

- **Continuous**: set the `LITESTREAM_*` variables. Litestream streams every change to the
  bucket and restores automatically when the container starts on an empty volume.
- **Periodic**: copy the file safely while the service runs, for instance every night:

  ```bash
  docker compose exec -w /app/service pit-stop \
    node -e "require('better-sqlite3')('/data/pit-stop.db').backup('/data/backup.db')"
  docker compose cp pit-stop:/data/backup.db ./pit-stop-backup.db
  ```

  then keep `pit-stop-backup.db` somewhere else than this machine.

Test a restore once, for real, before you rely on it.

### Upgrading

Pull the new image and restart. Migrations run at startup and only ever go forward. Releases
follow semantic versioning; read `CHANGELOG.md` before a major version.

```bash
docker compose pull && docker compose up -d
```

A restart costs a few seconds: participants reconnect on their own and lose nothing.

### One instance, on purpose

Run exactly one container. Each live retro is an in-memory actor, which is what keeps the
service free of Redis or any shared state; two instances would split a retro in two halves
that cannot see each other. A single process holds far more than a company's worth of
simultaneous retros.

## Develop

Requires Node 20.19+. No Docker, no emulator, no database to install: the SQLite file and its
directory are created on first boot, and migrations run at startup.

```bash
npm run setup       # installs the root, service/ and web/
npm start           # API on :3000, front on :5173
```

Open http://localhost:5173. No `.env` is needed to get going; copy `service/.env.example` to
`service/.env` when you want Google sign-in, real emails or paddock access. The API is
served under `/api`, and Vite proxies `/api` and `/ws` to the service.

### If those ports are taken

Another project may already hold 3000 or 5173. Nothing needs editing, the ports are
overridable:

```bash
PORT=3007 npm --prefix service run dev
VITE_PROXY_TARGET=http://localhost:3007 npm --prefix web run dev -- --port 5177
```

### Being several people at once

The login card has a "development only" field that signs you in as any address with no
password. The first address to use it bootstraps a local organisation, verifies its email
domain and makes you its administrator; anybody signing in afterwards with the same domain
joins that organisation as a plain member.

So: sign in as `victor@acme.io` in your window, open a private window, sign in as
`alice@acme.io`, and you are two people in the same organisation. Teams are private, so add
Alice to your team from its Members panel: there is no self-service join. Then open the same
retro on both sides and watch the board update as one of you types.

That shortcut is guarded by `NODE_ENV` and does not exist in production.

### Testing the invitation flow

With no mail transport, nothing is sent: the link is printed in the service logs. Copy the
`/invite/<token>` URL into a private window to play the recipient.

### Testing the paddock

Paddock access is configuration, not data, so it is granted by an environment variable:

```bash
PLATFORM_ADMIN_EMAILS=victor@acme.io npm --prefix service run dev
```

Sign in as that address and open http://localhost:5173/paddock. Any other account is
redirected away, and the API refuses it too.

### Testing the production image

```bash
docker build -t pit-stop .
docker run --rm -p 3000:3000 -e APP_URL=http://localhost:3000 pit-stop
```

### Automated tests

```bash
npm test            # service and web suites
npm run build       # typecheck + build
npm run migrate     # apply migrations by hand
```

The service suite runs the real managers against throwaway SQLite databases rather than
mocked repositories, so it covers the SQL layer at the same time. A temporary SQLite file is
instantaneous, so there is nothing to buy by mocking the store. It pins the things that must
not regress: the anonymity projection phase by phase, the phase matrix, tenant isolation
between organisations, the privacy of a team, the lock-out guards, the session and invitation
rules, and the first boot.

## Architecture in one paragraph

Each live retro is an in-memory actor (`RetroSession`) that owns the open WebSocket
connections, serialises the commands touching that board and fans the result out. The database
stays the source of truth, so losing an actor to a restart costs a reconnection and nothing
else. Business commands trigger the broadcast, never database writes, which is what keeps a
new entity type from silently missing a broadcast.

Tenant isolation is a property of the type rather than a discipline: application code receives
a `ScopedDb` whose accessors have already applied the caller's `org_id`, and there is no method
that hands back an unscoped query for a tenant-owned table.

Inside an organisation, the team is the next boundary. A team is private to its members: you
are in one because an administrator of that team added you, and an organisation administrator
who administers every team still cannot read the boards of one they have not joined.

The full reasoning is in [ADR-001](docs/adr/0001-architecture.md); the open source and
self-hosted choices are in [ADR-002](docs/adr/0002-open-source-and-self-hosting.md).

## Getting more organisations in

A single self-hosted organisation needs none of this. To host several:

1. Set `PLATFORM_ADMIN_EMAILS` to your own address and sign in with it.
2. From the paddock, create the organisation and enter the email of its first administrator.
   They receive an invitation.
3. That administrator invites their colleagues, or you verify their email domain so their
   colleagues join on their own without any email being sent.

There is no open sign-up: an account exists because it was invited, or because its email
domain is verified for an organisation. Registering on a verified domain opens nothing until
the confirmation link sent to that address is used.

`PLATFORM_ADMIN_EMAILS` is configuration, never data: nobody can grant themselves paddock
access with a database write, only with a deploy.

## The UI kit

`web/src/ui/` holds the theme and the handful of components the product needs and MUI does
not ship: a sized avatar, a named-size dialog, a tag that paints itself from a colour rather
than a palette slot. Pages import from there rather than from `@mui/material`, so a component
can grow a behaviour of its own without every page having to change.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately, as described in
[SECURITY.md](SECURITY.md), never in a public issue.
