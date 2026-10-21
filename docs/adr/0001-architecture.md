# ADR-001 — Architecture of Pit Stop

**Status:** adopted, amended by [ADR-002](0002-open-source-and-self-hosting.md) on D11 and D13.

## Context

Pit Stop is a collaborative retrospective tool: a real-time board of stickies, with presence,
shared cursors, votes and a guarantee of anonymity. A retro gathers a team around a shared
board for one or two hours, then the tool is left alone for two weeks.

That usage profile, and the anonymity promise, drive most of the decisions below.

### Constraints

| Ref. | Constraint |
|---|---|
| C1 | Real-time multi-user board: presence, shared cursors, votes, follow-up actions |
| C2 | Sign-in with Google and with email and password |
| C3 | Several customer organisations administered from a back office |
| C4 | Operable by one person, with no on-call |
| C5 | Target cost under $10 a month |
| C6 | Anonymity cannot be broken, including by the operator's tooling |

### Load profile

Worst case estimated: 10 teams of 10 people, so 100 simultaneous connections, about 3
mutations and 33 websocket messages a second. One Node process on 512 MB holds more than
10,000 websocket connections. **The peak is about 1% of a single machine.** The product is
bursty, but its peak is tiny in absolute terms. An elastic architecture would solve a problem
this product does not have, while imposing cold starts at the exact moment everybody arrives.

## Decisions

### D1 — One authoritative actor per retro

Each active retro is an in-memory `RetroSession` that holds the set of websocket connections,
serialises mutations and broadcasts. It is created on the first connection and destroyed when
the last participant leaves.

**The database stays the source of truth**; writes are synchronous. The actor owns
connections, ordering and fan-out, not durability. On restart, clients reconnect and the actor
rehydrates. No write-behind: that would need real durability engineering for no gain at this
scale.

**Broadcasting is triggered by the business command that was handled, never by a database
write.** The classic trap — a component that reverse-engineers the business event from
physical storage keys to know what to refresh — does not exist: adding an entity type cannot
produce a silently missing broadcast.

### D2 — A single Node container

One instance, Node, Hono for routing, `ws` for websockets. A single instance is a choice, not
a limitation: it is what makes the in-memory actor correct without external coordination, so
without Redis or pub/sub.

*Accepted consequence:* a few seconds of unavailability at each deploy. Clients reconnect.

### D3 — SQLite on a volume, optionally replicated by Litestream

One instance writes, the data volume is tiny, the model is naturally partitioned by retro.
SQLite through Kysely, for typing and versioned migrations. Litestream streams changes to an
S3-compatible bucket and gives point-in-time restore.

**Explicit revision condition:** move to Postgres if (a) more than one application instance
becomes necessary, (b) the back office needs heavy analytical queries competing with writes,
or (c) a customer requires a contractual RPO.

### D4 — Identity decoupled from authentication methods

The user id never encodes the provider. One `users` row, N `credentials`
(`google` | `password`). A verified email is the linking key: signing in with Google with an
already verified email attaches the credential to the existing account instead of creating a
second one.

Passwords: Argon2id, single-use reset tokens with a 30-minute lifetime, rate limiting per
address — trivial in memory on a single instance.

### D5 — The organisation is a first-class entity

An organisation has an opaque, stable `org_id`. An email domain is not an identity: it is an
**optional, verified auto-join rule**. A domain grants auto-join only once verified, otherwise
anybody registering as `bob@acme.com` would land in Acme. **A domain belongs to one
organisation only**: claiming one already taken is refused, never silently reassigned.

`org_members` is modelled many-to-many even though v1 allows one organisation per user.

### D6 — Fail-closed multi-tenant isolation

Comparing the resource's `org_id` with the caller's at each call site fails open: forgetting
one comparison in a new endpoint exposes one company's data to another.

Every request goes through a `ScopedDb` built from the request context, whose accessors have
already applied the caller's `org_id`. **There is no method returning an unscoped query on a
tenant-owned table**; raw access is a named, documented escape hatch reserved for migrations
and the paddock. A retro of another organisation is not refused: it is not found, `404`.

### D7 — Opaque, revocable sessions

A JWT carrying roles stays valid until it expires: suspending a company or removing a user
would have no immediate effect. Sessions are opaque tokens stored hashed and checked on every
request — microseconds on local SQLite. Websocket connections revalidate their session.

### D8 — Three authorisation planes, and a paddock blind to content

| Plane | Scope | Who |
|---|---|---|
| Platform admin | Every organisation | The operator only |
| Org admin | One organisation | Customer |
| Team admin / facilitator | One team, one retro | Customer |

The paddock lists and creates organisations, suspends them, verifies domains, and shows usage
counters. **It has no access to note text, votes or authorship. Impersonation is forbidden
and will not be implemented.**

The honest scope of that guarantee: the product offers no way to read a board, and no paddock
action grants board access. It is not a claim that the operator *cannot* read the data — they
hold the deployment and the database file. What it buys is that reading a board is never a
supported operation, never an accident, and never something a support request can quietly
turn into.

### D9 — Behaviour is specified before it is coded

`docs/BEHAVIOUR.md` states what the product does, once. Two things are locked harder than the
rest: `RetroManager.projectBoard`, the pure function holding **every** anonymity rule, shared
by HTTP reads and websocket broadcasts; and the real-time contract (`board.updated`,
`presence.updated`, `cursor.moved`, `cursor.left`, `error`).

Tests run the real managers against a throwaway SQLite file rather than mocked repositories.

### D10 — Observability

Structured logs with pino on stdout, a `/health` route. One process, so one log trail per
request, with no distributed correlation to rebuild.

### D11 — Front

React and Vite, MUI, and `web/src/ui/` for the theme and the few components MUI does not ship.
The paddock is a route of the same SPA. *Amended by ADR-002 D4: the service serves the built
SPA itself.*

### D12 — Bootstrap, invitations and the way in

**Platform admin is configuration, not data.** `PLATFORM_ADMIN_EMAILS` is evaluated at session
creation against the account's verified email, never stored. Nobody can promote themselves
with a database write; it takes a deploy.

**One invitation mechanism.** A 32-byte random token, sent only in the link; **only its hash
is stored**. Single use, expires after 7 days, revocable. **The invitation binds the email**:
an invitation sent to alice@acme.com cannot be accepted while signed in as bob@gmail.com.
**Accepting proves control of the mailbox**, so it doubles as email verification.

| Way in | Who invites | Role |
|---|---|---|
| New customer organisation | Platform admin, from the paddock | admin |
| Adding a colleague | Org admin | member or admin |
| Auto-join by verified domain | Nobody | member only |

**No open sign-up.** A registration with no valid invitation and no matching verified domain
is refused.

### D13 — Organisation status and the `demo` tier

`organizations.status` is `demo`, `active` or `suspended`. `demo` is a **quota tier, never a
security tier**: same isolation, anonymity and durability. Quotas are resolved in one place,
`Plans.ts`. **A quota never interrupts a retro in progress**: ceilings are checked at
creation, never during a session. *Amended by ADR-002 D3: quotas only apply in the `cloud`
edition.*

### D14 — Design direction

"Quiet chrome, loud paper": the stickies are the content, so they carry the colour, and
everything around them recedes. A withheld note is turned over — hatched, padlocked, author
still named — because anonymity is the product's central promise and deserves a physical
state rather than a caption. Tokens live in `web/src/ui/theme.ts`.

### D15 — The team is the confidentiality boundary

Anonymity protects *who wrote what* inside a retro. Who can *open* the retro is the team's
job, and a team is private. There is no self-service join: an administrator of the team adds
you. **Administering a team and seeing inside it are two distinct powers**: an org admin lists
every team and manages its roles, but cannot read a board of a team they have not joined, nor
add themselves to it.

An open directory of teams was rejected: it makes the boundary cosmetic. A retro where the
team says the problem is its manager would become readable by that manager, retroactively and
without trace.

## Consequences

**Positive.** One service to run, one process to observe. A new entity type cannot miss a
broadcast. Millisecond broadcast latency, no cold start. `npm start` with no Docker. Tenant
isolation is a property of the type. Instant session revocation.

**Negative.** A short gap at each deploy. A single instance is a single point of failure.
Durability depends on Litestream or on the operator's backups, and must be tested by a real
restore.

## Alternatives rejected

- **Serverless (Lambda, API Gateway, DynamoDB).** The problem is stateful, the architecture
  stateless: four services to emulate a `ws.send()`, a broadcast component decoding storage
  keys, cold starts as the team arrives.
- **Cloudflare Workers and Durable Objects.** Architecturally the best fit — a Durable Object
  per retro *is* D1 — but decorators, `class-validator` and `google-auth-library` are a gamble
  on that runtime. The first alternative to reconsider if a single instance ever becomes a
  problem.
- **Managed Postgres from the start.** Durability whose need is not demonstrated at this
  volume; switch conditions in D3.
- **Full in-memory write-behind.** Negligible latency gain, real risk of data loss.
- **Impersonation in the paddock.** Incompatible with C6.
