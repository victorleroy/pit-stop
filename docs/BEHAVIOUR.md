# Pit Stop — behaviour specification

What the product does, stated once so it can be checked rather than remembered. The service
tests pin the rules in sections 3 to 6; when the two disagree, the tests are the truth and
this page is the bug.

**Status:** current. Service and web client fully specified.

---

## 1. Vocabulary

| Term | Definition |
|---|---|
| **Organization** | A customer company, identified by an opaque `org_id`. An email domain is an optional auto-join rule, never an identity. |
| **Team** | A group of people inside an organization. Owns retros and actions. |
| **Retro** | A session. Moves through 5 phases. Holds columns, notes, clusters and votes. |
| **Note** | A sticky. Has an author, a text, a column and a `revealed` flag. |
| **Cluster** | A grouping of at least 2 notes inside a single column. |
| **Card** | The unit of display and the target of a vote: either a standalone note or a cluster. |
| **Action** | A decision. Lives at **team** level, not at retro level. |
| **Facilitator** | The person driving a retro's phases. Exactly one at a time. |

---

## 2. Domain model

The schema in full. Identity and tenancy come first because everything else hangs off an
organisation.

```
organizations  (id, name, status, created_at)
org_domains    (org_id, domain, verified_at)
org_members    (org_id, user_id, role, created_at)
users          (id, email, name, picture_url, email_verified_at, created_at)
credentials    (user_id, kind, provider_id, password_hash, created_at)
sessions       (token_hash, user_id, expires_at, created_at)
invitations    (id, org_id, email, role, token_hash, invited_by,
                expires_at, accepted_at, revoked_at)

teams          (id, org_id, name, created_by, created_at)
memberships    (team_id, user_id, is_admin, created_at)
retros         (id, team_id, org_id, title, phase, created_by, facilitator_id,
                max_votes DEFAULT 5, timer_ends_at, timer_remaining_ms, created_at)
columns        (id, retro_id, title, position)
notes          (id, retro_id, column_id, cluster_id NULL, author_id,
                text, revealed DEFAULT false, created_at)
clusters       (id, retro_id, column_id, title NULL)
votes          (retro_id, user_id, target_id, count)
actions        (id, team_id, org_id, retro_id, text, status,
                assignee_id NULL, created_at)
```

There is no connections table: the `RetroSession` actor holds them in memory, so presence
is never something that has to be cleaned up after a crash.

Enumerations: `phase in {BRAINSTORM, SHARE, VOTE, DISCUSS, ARCHIVED}`,
`action.status in {OPEN, DONE, DROPPED}`, `timer.state in {IDLE, RUNNING, PAUSED}`,
`organization.status in {demo, active, suspended}`, `org_members.role in {member, admin}`.
`demo` only ever carries quotas in the `cloud` edition; see section 12.

### Nothing is denormalized — on purpose

A team's name, a member's email, an action's retro title and assignee name are all read
through a join. None of them is copied into the row that refers to them.

- A single writer on a local SQLite file makes joins effectively free at this scale.
- Every copy is a staleness bug waiting to happen: rename a retro and its actions would show
  the old title forever.
- `member_count` is a `COUNT(*)` for the same reason.

The one thing a join must never change is section 4: the anonymity projection is applied
**after** the join, never before.

---

## 3. Phase state machine

The facilitator alone changes the phase. No transition is constrained: any phase can move to
any other, including backwards.

| Operation | BRAINSTORM | SHARE | VOTE | DISCUSS | ARCHIVED |
|---|:--:|:--:|:--:|:--:|:--:|
| Create a note | yes | | | | |
| Edit a note's **text** | yes | | | | |
| Move or delete a note | yes | yes | | | |
| Reveal or hide **own** notes | | yes | yes | yes | |
| Group, ungroup, rename a cluster | | yes | | | |
| Cast a vote | | | yes | | |
| See **own** votes | | | yes | yes | yes |
| See vote **totals** | | | | yes | yes |
| Add, rename, delete a column | yes | | | | |
| Create an action | | | | yes | |
| Edit an action | yes | yes | yes | yes | yes |

**Two non-obvious rules that must not be lost:**

1. **Going backwards wipes the votes.** If the current phase is in `{VOTE, DISCUSS, ARCHIVED}`
   and the target phase is in `{BRAINSTORM, SHARE}`, **every vote in the retro is deleted**.
   Rationale: regrouping notes recomposes the cards, and a vote cast on a card that no longer
   exists is lost anyway. Better to restart the round than to strand votes.

2. **ARCHIVED is frozen but reversible.** Any change to an archived retro is refused (`409`)
   **except** a phase change. Reopening is always possible.

---

## 4. Anonymity rules — security core

This is the product's central promise. It lives in **one pure function**,
`RetroManager.projectBoard`, shared by the HTTP read and the WebSocket broadcast.
**One implementation, never two.**

| Element | Audience | Rule |
|---|---|---|
| **Note text** | Its author, always | `text` is returned when `revealed === true` **or** the caller is the author |
| | Everybody else | `text` is returned **empty** (`''`) while `revealed === false` |
| **Note author** | Everybody, always | `author.id` and `author.name` are always present |
| **Vote totals** | Everybody | Only in `DISCUSS` and `ARCHIVED` |
| **Own votes** | Self | Only in `VOTE`, `DISCUSS`, `ARCHIVED`; otherwise `myVotes: 0` |

> **The product protects the content, not the presence.** Everyone sees that Victor wrote
> three notes; nobody reads them until he shares them.

**Masking happens server side.** Withheld text never leaves the service: the client is not
trusted to hide it. This is the single most important property not to break, and the first thing
the tests lock down.

**Sharing is reversible.** Someone who shared too early can take the text back, and nothing
downstream depends on a note having been read once.

**Sharing is author-global, not per note**: `setMineRevealed(retroId, revealed)` flips *all*
of the caller's notes in that retro. It is idempotent.

---

## 5. Authorization

Four levels, on three different scopes.

| Role | Source | Powers |
|---|---|---|
| **Team member** | `memberships` | See and take part in the team's retros |
| **Team admin** | `memberships.is_admin`, or being an org admin | Create and delete retros, rename the team, promote team admins; **add and remove members, by their own `is_admin` only** |
| **Org admin** | `org_members.role = 'admin'` | Everything a team admin can do, on **every** team; manage org admins; list every team and its roster; **delete a team**; read organisation stats. **Cannot read a board of a team they have not joined, and cannot add themselves to one**: what they see of a team's content is counters and dates only, never a note's text, a title, an author or anybody's votes |
| **Facilitator** | Retro creator, then transferable | Change phase, title, timer, votes per person, columns; moderate notes |

**Roles are read from the store on every call, never carried in the token.** A demotion takes
effect immediately, not in twelve hours. Sessions are opaque rows, so revocation is immediate.

### Check chains

- `checkTeamAccess(auth, teamId)` — the caller has a `memberships` row.
- `checkRetroAccess(auth, retroId)` — the retro exists, **belongs to the same organization**,
  and the caller is a member of its team. A retro from another organization returns `404`,
  not `403`: its existence is not disclosed.
- `checkFacilitatorAccess(auth, retroId)` — `checkRetroAccess` then `facilitatorId === userId`.
- `isTeamAdmin` is true for a team admin **or** an org admin.
- Adding and removing members is the one check that does **not** use `isTeamAdmin`: it reads
  the caller's own `memberships.is_admin`. An org admin passing that check could add
  themselves to any team and read its boards, which is exactly the boundary teams exist to
  hold. Administering a team and seeing inside it are separate powers.
- Creating a retro checks membership **before** the role, so an org admin who is not in the
  team is refused before anything is written.
- Deleting a team, its delete summary and the organisation stats use `checkOrgAdmin`, not
  `isTeamAdmin`: a team admin cannot delete their own team. The team's existence is checked
  first, so a team of another organization is `404`.

### Lock-out guards

Three rules exist so that nobody can ever be locked out:

1. The **last** org admin cannot be removed (`409`).
2. You cannot leave a team you are the **only** admin of, if it has other members (`409`).
3. You cannot demote yourself as team admin, unless you are an org admin (`409`).

### Facilitation takeover

A subtle case. `takeFacilitation` allows the takeover when:

- the caller already facilitates (no-op), **or**
- the caller is a team admin, **or**
- **the current facilitator is not connected to the retro**.

That last clause reads **live presence**. It reads the `RetroSession` actor's connection set, so presence
is the live connections rather than a table that has to be kept true.
Otherwise: `409`, "the facilitator is here, ask them to hand over".

`handOverFacilitation`: only the facilitator can hand over, and the target must be a team
member.

---

## 6. Business rules by aggregate

### Retro

- Creation is restricted to **team admins**. The creator becomes the facilitator.
- Default columns when none are given: `Start`, `Stop`, `Continue`. An explicit empty list
  creates a **blank** retro with no column; it cannot leave `BRAINSTORM` (nor be archived)
  until at least one column exists (`409`).
- `maxVotes` defaults to 5, can be set at creation (1 to 10), and changed by the facilitator
  **only in `BRAINSTORM` or `SHARE`** (`409` once voting has started).
- Deletion: team admins only. Removes columns, notes, clusters and votes.
  **Actions survive**: they belong to the team.

### Columns

- Editable only in `BRAINSTORM`, and only by the facilitator. Once notes are placed, renaming
  or removing a column moves the ground under the participants.
- **A column holding notes cannot be deleted** (`409`).
- `position` is assigned at creation from the current column count.

### Notes

- The author edits their own notes; **the facilitator can also moderate** (move, delete)
  without knowing who wrote what.
- **But the facilitator cannot rewrite an unrevealed note they did not author** (`403`): they
  would replace a text they were never given. This moderate/read distinction is essential.
- Changing column checks that the target column exists (`404`).

### Clusters

- Grouping is allowed **only in `SHARE`**, because once votes are cast they belong to a card
  and moving notes would silently move other people's votes.
- **Only inside the same column** (`409`).
- A note cannot be grouped with itself (`409`).
- Grouping onto a standalone note creates a cluster holding both notes.
- Ungrouping: if the cluster would drop below **2** notes, it is dissolved and the remaining
  note becomes standalone again.
- A note whose cluster no longer exists falls back to a standalone card.

### Votes

- Only in `VOTE`. `delta` is exactly `+1` or `-1`.
- **Valid targets: a standalone note or a cluster, never a note inside a cluster**
  (`409`, "vote for the cluster, not for a note inside it").
- Exceeding `maxVotes` is `409`. Going below zero on a card is `409`.
- A counter reaching zero is deleted, not stored as `0`.
- `myVotesLeft = max(0, maxVotes - sum of my votes)`, counted across all cards.

### Actions

- Creation: only in `DISCUSS`, from a retro.
- **Editing: at any time, independent of the phase.** Reviewing an action happens whenever
  the team wants.
- The assignee must be a **team member** (`409`).
- `assigneeId: null` unassigns.
- **Automatic carry-over:** every `OPEN` action from an **earlier** retro of the same team
  comes back in the board's `carriedOverActions`. This is the product's value loop.

### Timer

Two stored states, so the network never eats the clock:

- Running: store `timer_ends_at`, an **absolute deadline**. Each client counts down locally.
  The board also carries `remainingMs`, computed when it is sent, so a client whose clock is
  off still counts the right duration.
- Paused: store `timer_remaining_ms`.

| Action | Precondition | Effect |
|---|---|---|
| `start` | `seconds` given (`400` otherwise) | `ends_at = now + seconds`; clear `remaining_ms` |
| `pause` | running (`409` otherwise) | `remaining_ms = ends_at - now`; clear `ends_at` |
| `resume` | paused (`409` otherwise) | `ends_at = now + remaining_ms`; clear `remaining_ms` |
| `extend` | `seconds` given; a timer exists | adds to `remaining_ms` when paused, otherwise pushes `ends_at` |
| `stop` | — | clears both |

`seconds` is bounded to `[5, 3600]`. Extending an already-overdue timer never yields a
negative duration.

### Teams

A team is the confidentiality boundary around a board. It is private to its members.

- Any member of the organization can create a team and **becomes its admin**.
- `GET /teams` returns the teams you belong to. An org admin gets every team of the
  organization, with `isMember` false for the ones they have not joined.
- **There is no self-service join.** A team admin adds you (`POST /teams/{id}/members`), and a
  team admin removes you (`DELETE /teams/{id}/members/{userId}`). You can always leave on your
  own, subject to the lock-out guards.
- Adding somebody already in the team preserves their admin flag.
- The target must belong to the organization (`404` otherwise). A team of another
  organization is `404`, checked before the admin check so existence is never disclosed.
- `GET /teams/{id}/members` is open to the team's members and to org admins, nobody else.
- `GET /org/members` lists everybody in the organization, which is what makes adding somebody
  possible, but **the `teams` array is only filled for an org admin**: who is in which team is
  not public inside the organization.
- **Only an org admin deletes a team** (`DELETE /teams/{id}`). Its retros, boards, actions and
  memberships go with it, through `ON DELETE CASCADE`. Anybody still on one of its boards
  receives the `error` event "This retro was deleted". `GET /teams/{id}/summary` gives the
  confirmation its counters, `{retroCount, actionCount}`, and nothing else.

### Organisation stats

`GET /org/stats?period=30d|90d|all`, org admin only, `400` for any other period (or none).
Counters only: no text, title, author or per-person vote ever appears.

| Field | Meaning |
|---|---|
| `people.total`, `people.admins` | Members of the organization, and how many are org admins |
| `teams.total`, `teams.idle` | Teams, and those created more than 30 days ago with no retro created in the last 30 days, **whatever the period** |
| `retros.count`, `retros.total` | Retros created within the period, and all time |
| `notes.count`, `notes.perRetro` | Notes created within the period; `count` divided by the number of retros that received at least one of them, rounded to 1 decimal, `0` when there is no note |
| `actions.open`, `.done`, `.dropped` | Actions created within the period, by their current status |

Periods are rolling: `30d` and `90d` start 30 and 90 days before the request.

---

## 7. HTTP contract

Every route below lives under `/api`, in development (through the Vite proxy) as in
production (served by the service next to the SPA). `/health` and `/ws` stay at the root.

Base: `Authorization: Bearer <token>` on everything except the public routes: `/config`,
`/setup` and `/auth/*`.
Observed codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `429`.

| Method | Route | Response |
|---|---|---|
| GET | `/config` | `200` `{appName, devLoginEnabled, googleClientId, mailEnabled, setupRequired}` |
| POST | `/setup` | `200` `{token, user}` — first boot only, token from the logs; `403` otherwise |
| POST | `/auth/google` | `200` `{token, user}` |
| POST | `/auth/login` | `200` `{token, user}` |
| POST | `/auth/register` | `202` — `{email, name}`, verified domain only, `403` otherwise; sends a confirmation link, opens no session |
| POST | `/auth/verify-email` | `200` `{token, user}` — `{token, password}`: the confirmation link, once, and the account password |
| POST | `/auth/invitations/accept` | `200` `{token, user}` for a new account; `204` when signed in; `409` for an existing account not signed in |
| POST | `/auth/password-reset` | `204` whether or not the address exists |
| PUT | `/auth/password-reset` | `204` |
| POST | `/auth/logout` | `204` |
| POST | `/auth/dev-login` | `200` `{token, user}` — **local only**, `403` otherwise |
| GET | `/me` | `200` `User` |
| GET | `/teams` | `200` `Team[]` sorted by name |
| POST | `/teams` | `201` `Team` |
| PATCH | `/teams/{teamId}` | `200` `Team` — team admin or org admin renames `{name}` |
| DELETE | `/teams/{teamId}` | `204` — org admin only, cascades to retros and actions |
| GET | `/teams/{teamId}/summary` | `200` `{retroCount, actionCount}` — org admin only |
| DELETE | `/teams/{teamId}/members/me` | `204` — leave |
| POST | `/teams/{teamId}/members` | `204` — team admin adds `{userId}` |
| DELETE | `/teams/{teamId}/members/{userId}` | `204` — team admin removes |
| GET | `/teams/{teamId}/members` | `200` `TeamMember[]` sorted by name |
| PUT | `/teams/{teamId}/members/{userId}/admin` | `204` |
| GET | `/me/retros` | `200` `TeamRetroSummary[]`, most recent first |
| GET | `/teams/{teamId}/retros` | `200` `RetroSummary[]` |
| POST | `/teams/{teamId}/retros` | `201` `Board` |
| GET | `/retros/{retroId}` | `200` `Board` |
| PATCH | `/retros/{retroId}` | `200` `Board` |
| DELETE | `/retros/{retroId}` | `204` |
| POST | `/retros/{retroId}/columns` | `201` `Board` |
| PATCH | `/retros/{retroId}/columns/{columnId}` | `200` `Board` |
| DELETE | `/retros/{retroId}/columns/{columnId}` | `200` `Board` |
| POST | `/retros/{retroId}/notes` | `201` `Board` |
| PATCH | `/retros/{retroId}/notes/{noteId}` | `200` `Board` |
| DELETE | `/retros/{retroId}/notes/{noteId}` | `200` `Board` |
| POST | `/retros/{retroId}/notes/reveal` | `200` `Board` |
| DELETE | `/retros/{retroId}/notes/reveal` | `200` `Board` |
| POST | `/retros/{retroId}/notes/{noteId}/group` | `200` `Board` |
| DELETE | `/retros/{retroId}/notes/{noteId}/group` | `200` `Board` |
| PATCH | `/retros/{retroId}/clusters/{clusterId}` | `200` `Board` |
| POST | `/retros/{retroId}/votes` | `200` `Board` |
| POST | `/retros/{retroId}/facilitator` | `204` |
| PUT | `/retros/{retroId}/facilitator` | `204` |
| GET | `/teams/{teamId}/actions` | `200` `Action[]`, most recent first |
| POST | `/retros/{retroId}/actions` | `201` `Action` |
| PATCH | `/teams/{teamId}/actions/{actionId}` | `200` `Action` |
| GET | `/org/admins` | `200` `User[]` |
| GET | `/org/members` | `200` `OrgMember[]` sorted by name |
| PUT | `/org/admins/{userId}` | `204` |
| GET | `/org/stats?period=30d\|90d\|all` | `200` `OrgStats` — org admin only, `400` on another period |
| GET | `/org/invitations` | `200` `Invitation[]` — org admin |
| POST | `/org/invitations` | `201` `Invitation` — org admin, `{email, role?}` |
| DELETE | `/org/invitations/{invitationId}` | `204` — org admin |
| GET, POST | `/paddock/organizations` | platform admin only |
| PUT | `/paddock/organizations/{orgId}/status` | `204` — platform admin only |
| PUT, DELETE | `/paddock/organizations/{orgId}/domains` | `204` — platform admin only |

**Strong convention: almost every board mutation returns the full `Board`, projected for the
caller.** The client never has to recompose state. Keep it.

### Response shapes

```ts
User            { id, email, name, orgId, orgName?, orgStatus?, pictureUrl?,
                  isOrgAdmin?, isPlatformAdmin? }
Team            { id, name, createdBy, createdAt?, isAdmin, isMember, memberCount }
TeamMember      { userId, email, name, pictureUrl?, isAdmin, joinedAt? }
OrgStats        { period, people: {total, admins}, teams: {total, idle},
                  retros: {count, total}, notes: {count, perRetro},
                  actions: {open, done, dropped} }
Action          { id, retroId, retroTitle, text, status, assignee?: {id,name}, createdAt? }
Timer           { state: 'IDLE'|'RUNNING'|'PAUSED', endsAt?, remainingMs? }
Note            { id, columnId, author: {id,name}, isMine, revealed, text, createdAt? }
Card            { id, type: 'note'|'cluster', notes: Note[], myVotes, title?, totalVotes? }
Column          { id, title, order, cards: Card[] }
Board           { id, title, phase, teamId, createdBy, createdAt?, isFacilitator,
                  columns, maxVotes, myVotesLeft, myNotesRevealed, votesRevealed,
                  timer, actions, carriedOverActions }
```

### Ordering, to preserve

- Columns by ascending `order`.
- Notes inside a card by ascending `createdAt`.
- Cards: **sorted by `totalVotes` descending only when totals are revealed**
  (`DISCUSS`, `ARCHIVED`); otherwise standalone notes first, then clusters.
- An empty cluster is not rendered; a standalone note always is.

---

## 8. WebSocket contract

Five outbound events, to keep identical:

```ts
{ type: 'board.updated',    board: Board }                    // projected per recipient
{ type: 'presence.updated', participants: [{userId, name, pictureUrl?}] }
{ type: 'cursor.moved',     cursor: {userId, name, x, y} }
{ type: 'cursor.left',      userId }
{ type: 'error',            message }
```

Inbound actions: `subscribe`, `cursor`.

**Rules to preserve:**

- `board.updated` is **projected per recipient**: one board read, then one projection per
  connection. The anonymity rules of section 4 are the only ones that ever reach a client.
- Cursors **never touch storage**: they are relayed straight to the other connections. A mouse
  move costs no write and no read.
- Cursor coordinates are **board-relative**, as a fraction of its box: every screen differs.
- `presence.updated` deduplicates by `userId` (several tabs are one person) and sorts by name.
- On subscribe: access check, then `broadcastBoard` **and** `broadcastPresence`.
- Access refused on subscribe sends `{type: 'error'}` without closing the socket.
- A dead connection is pruned on the first failed send.

---

## 9. Web client behaviour

- Token kept in `localStorage` under `pit-stop.token`. A `401` clears it.
- Socket URL: `wss://<host>/ws`, overridable by `VITE_WS_URL`. The session token is offered
  as a subprotocol, `new WebSocket(url, ['pit-stop', token])`, and the service answers
  `pit-stop`: never in the URL, which proxies log.
- **Reconnection backoff: 1s, 2s, 5s, 10s**, then stays at 10s. The attempt counter resets on
  a successful open.
- On open, the client sends `{action: 'subscribe', retroId}`.
- On close, participants and cursors are cleared.
- **Cursors are throttled to one message every 120 ms** (about 8 per second); interpolation on
  arrival already looks continuous.
- A cursor with no update for **8 s** is considered gone; a sweep runs every 2 s.
- A `presence.updated` that drops a user also drops their cursor: somebody who left the retro
  cannot leave a pointer behind.
- The board is pushed by the service on every change; the page only falls back to fetching
  while the socket is down.

### Routes

| Path | Page | Access |
|---|---|---|
| `/login` | LoginPage | public |
| `/setup/:token` | SetupPage | public, first boot only |
| `/invite/:token` | InvitePage | public |
| `/reset-password/:token` | ResetPasswordPage | public |
| `/verify-email/:token` | VerifyEmailPage | public |
| `/teams` | TeamsPage | authenticated |
| `/retros` | MyRetrosPage | authenticated |
| `/admin` | AdminPage | authenticated, org admin content: people, invitations, teams |
| `/paddock` | PaddockPage | authenticated, platform admin only |
| `/teams/:teamId` | TeamPage | authenticated |
| `/teams/:teamId/retros/:retroId` | RetroPage | authenticated |
| `*` | redirect to `/teams` | — |

Unauthenticated access to a protected route redirects to `/login`. While the session is being
restored, a loader is shown rather than a redirect, so a page refresh does not bounce the user
to the login screen.

---

## 10. Validation constraints

| Field | Constraint |
|---|---|
| Retro title | required, <= 80 |
| Columns at creation | <= 8 columns, each title <= 40 |
| Column title | required, <= 40 |
| Note text | required, <= 500 |
| Cluster title | required, <= 60 |
| Team name | required, <= 60, trimmed on rename |
| Action text | required, <= 300 |
| `vote.delta` | integer, exactly `1` or `-1` |
| `timer.seconds` | integer, 5 to 3600 |
| `maxVotes` | integer, 1 to 10 |
| `phase` | within the enumeration |
| `action.status` | within `{OPEN, DONE, DROPPED}` |

---

## 11. Edge cases the tests pin

- Sharing is **idempotent**: sharing twice changes nothing.
- `extend` on an already-overdue timer **never** yields a negative duration.
- The last admin of a team **may** leave it when the team is otherwise empty.
- A person with no team still appears in the organization's member list.
- Two tabs of one person count as **one** presence but two connections.
- `actions` holds this retro's actions **whatever their status**; `carriedOverActions` holds
  only the `OPEN` ones from earlier retros.
- A withheld note can be **moved** by the facilitator, but not rewritten.
- A retro belonging to another organization returns `404`, never `403`.

---

## 12. Editions and first boot

The edition is configuration (`EDITION`), never data. No database write moves an organisation
from one edition to the other.

| Edition | Quotas | New organisation from the paddock |
|---|---|---|
| `self-hosted` (default) | None. `suspended` stays closed | `active` |
| `cloud` | `Plans.ts`, by status | `demo` |

In the cloud, the ceilings are checked where what they count is created: retros per calendar
month (UTC) at retro creation, members at invitation acceptance and at verified-domain join.

**First boot.** While no organisation exists, the service prints a one-time setup link in its
logs at every start. Opening it creates the organisation and its first administrator, and
signs them in. The token lives in memory only; it stops working once the first account exists.
Two submissions racing for it cannot both succeed.

**Without a mail transport**, nothing is sent: each invitation or reset link is printed in the
logs, which only the operator reads. The link is never returned by the API, because the
invitation doubles as proof that the invitee controls the mailbox.

**Google sign-in** is offered only when `GOOGLE_CLIENT_ID` is set.

**Registering by a verified domain** creates an unconfirmed account: no session, no
membership and no password, until the link sent to the address is used. The password is
chosen on that link, by whoever holds the mailbox: chosen at registration, it would belong to
whoever typed the address and survive the owner's click. An unconfirmed account proves
nothing, so registering the same address again replaces it and voids the links already sent,
and an invitation or a Google sign-in for that address takes it over. An account whose address is already confirmed accepts an
invitation only while signed in.

**A live socket follows the session.** Before every board it is sent, access is resolved
again from the store: a revoked session, a suspended organisation or a removal from the team
closes the socket with an `error` event instead.
