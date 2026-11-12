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
| **Retro** | A session. Moves through 7 phases. Holds columns, notes, clusters and votes. |
| **Waiting room** | The `LOBBY` phase: where a retro waits for its people before it starts. Every new retro opens there. |
| **Icebreaker** | One light question at the start of a retro, the same for everyone, answered on a post-it or out loud. Drawn from a bank of fun questions, in English. |
| **Asked** | An icebreaker question is asked when the retro enters `ICEBREAKER`; until then it is a surprise for everyone, the facilitator included. |
| **Note** | A sticky. Has an author, a text, a column and a `revealed` flag. |
| **Cluster** | A grouping of at least 2 notes inside a single column. |
| **Card** | The unit of display and the target of a vote: either a standalone note or a cluster. |
| **Action** | A decision. Lives at **team** level, not at retro level. |
| **Facilitator** | The person driving a retro's phases. Exactly one at a time. |
| **Review** | Going over, in a retro, the actions it carries over: did we do what we decided? |
| **Outcome** | What a review decided for one action: **Done**, **Drop** or **Keep** (still relevant, carried over again). |
| **Template** | A retro format: columns with their prompts, a vote budget, a suggested timer and its opening steps (icebreaker, action review). `BUILTIN` (shipped in code, read-only, `builtin:<slug>`) or `TEAM` (owned by one team, a UUID). A retro **copies** its template at creation. |
| **Prompt** | One line under a column title telling people what goes in it. |

---

## 2. Domain model

The schema in full. Identity and tenancy come first because everything else hangs off an
organisation.

```
organizations  (id, name, status, created_at)
org_domains    (org_id, domain, verified_at)
org_members    (org_id, user_id, role, created_at)
users          (id, email, name, picture_url, email_verified_at, created_at,
                name_source DEFAULT 'user', sso_name NULL, sso_picture_url NULL,
                avatar_source DEFAULT 'auto')
user_avatars   (id, user_id UNIQUE, mime, bytes, size, created_at)
credentials    (user_id, kind, provider_id, password_hash, created_at)
sessions       (token_hash, user_id, expires_at, created_at)
invitations    (id, org_id, email, role, token_hash, invited_by,
                expires_at, accepted_at, revoked_at)

teams          (id, org_id, name, created_by, created_at, default_template_id NULL)
memberships    (team_id, user_id, is_admin, created_at)
retros         (id, team_id, org_id, title, phase DEFAULT 'LOBBY', created_by, facilitator_id,
                max_votes DEFAULT 5, timer_ends_at, timer_remaining_ms, timer_total_ms,
                created_at, template_id NULL, template_name NULL,
                default_timer_seconds NULL, icebreaker_*, action_review,
                review_focus_action_id NULL)
icebreaker_answers (retro_id, user_id, text, revealed DEFAULT 0, created_at, updated_at)
                   PRIMARY KEY (retro_id, user_id)
columns        (id, retro_id, title, position, prompt NULL)
notes          (id, retro_id, column_id, cluster_id NULL, author_id,
                text, revealed DEFAULT false, created_at)
clusters       (id, retro_id, column_id, title NULL)
votes          (retro_id, user_id, target_id, count)
actions        (id, team_id, org_id, retro_id, text, status,
                assignee_id NULL, created_at, closed_at NULL)
action_reviews (id, org_id, team_id, action_id, retro_id, outcome, comment NULL,
                reviewed_by NULL, reviewed_at)   UNIQUE (action_id, retro_id)
retro_templates        (id, org_id, team_id, name, name_key, description NULL,
                        max_votes NULL, timer_seconds NULL, icebreaker NULL,
                        action_review NULL, created_by, updated_by,
                        created_at, updated_at)
retro_template_columns (template_id, position, title, prompt NULL)
```

`teams.default_template_id` and `retros.template_id` carry no foreign key: they may hold a
`builtin:*` reference (ADR-004 D4).

There is no connections table: the `RetroSession` actor holds them in memory, so presence
is never something that has to be cleaned up after a crash.

Enumerations: `phase in {LOBBY, ICEBREAKER, REVIEW, BRAINSTORM, SHARE, VOTE, DISCUSS, ARCHIVED}`.

The review lives in two columns of `retros`: `action_review` (0/1, default 1), whether the
retro opens with a review, and `review_focus_action_id` (`ON DELETE SET NULL`), the action the
facilitator is reviewing, set in `REVIEW` only.

The icebreaker lives in two columns of `retros`: `icebreaker_question_id` (a bank id) and
`icebreaker_asked_at`, set on entering `ICEBREAKER`. `icebreaker_custom_text` and
`icebreaker_answers_revealed` exist but nothing uses them any more. Which questions a team was asked
is **derived** from its retros (`asked_at` set, with that question id), never stored apart:
deleting a retro takes its question out of the history.
Other enumerations:
`action.status in {OPEN, DONE, DROPPED}`, `action_review.outcome in {DONE, DROPPED, KEPT}`,
`timer.state in {IDLE, RUNNING, PAUSED}`,
`organization.status in {demo, active, suspended}`, `org_members.role in {member, admin}`,
`users.name_source in {sso, user}`, `users.avatar_source in {auto, upload, initials}`
(`preset` is reserved by the constraint, nothing writes it), `user_avatars.mime in
{image/webp, image/jpeg}`.

`users.name` and `users.picture_url` are the values displayed, recomputed in the row on every
write; every join keeps reading them. `name_source` and `avatar_source` say where they come
from, `sso_name` and `sso_picture_url` hold what the identity provider said last. An uploaded
avatar lives in `user_avatars`, a table of its own so that reading a user never loads the bytes.
`demo` only ever carries quotas in the `cloud` edition; see section 12.

### Nothing is denormalized — on purpose

A team's name, a member's email, an action's retro title and assignee name are all read
through a join. None of them is copied into the row that refers to them.

- A single writer on a local SQLite file makes joins effectively free at this scale.
- Every copy is a staleness bug waiting to happen: rename a retro and its actions would show
  the old title forever.
- `member_count` is a `COUNT(*)` for the same reason.

**One exception, the template snapshot.** `retros.template_name`, `default_timer_seconds`
and `columns.prompt` are copies of the template the retro was created from. That is history,
not a cache: renaming, editing or deleting the template must not rewrite a past retro
(ADR-004).

The one thing a join must never change is section 4: the anonymity projection is applied
**after** the join, never before.

---

## 3. Phase state machine

The facilitator alone changes the phase. No transition is constrained, **except back to
`LOBBY`**: any phase can move to any other, including backwards.

| Operation | LOBBY | ICEBREAKER | REVIEW | BRAINSTORM | SHARE | VOTE | DISCUSS | ARCHIVED |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Create a note | | | | yes | yes | | | |
| Edit a note's **text** | | | | yes | | | | |
| Move or delete a note | | | | yes | yes | | | |
| Reveal or hide **own** notes, all or one | | | | | yes | yes | yes | |
| Group, ungroup, rename a cluster | | | | | yes | | | |
| Cast a vote | | | | | | yes | | |
| See **own** votes | | | | | | yes | yes | yes |
| See vote **totals** | | | | | | | yes | yes |
| Add, rename, reorder, delete a column | yes | | | yes | | | | |
| Create an action | | | | | | | yes | |
| Edit an action | yes | yes | yes | yes | yes | yes | yes | yes |
| Record or undo a review outcome | | | yes | yes | yes | yes | yes | |
| Move the review focus (facilitator) | | | yes | | | | | |
| Turn the review on or off (facilitator) | yes | | | | | | | |
| Answer the icebreaker, show or hide **own** answer | | yes | | | | | | |

An operation refused because of the phase answers `403`, except in `ARCHIVED` (`409`).

A note created during `SHARE` is created **already shared** (`revealed = true`): its author is
reading it aloud. Its text stays frozen like every other note's once the brainstorm is over.

**Three non-obvious rules that must not be lost:**

1. **Entering `BRAINSTORM` or `SHARE` wipes every vote, whatever the source phase.**
   Rationale: regrouping notes recomposes the cards, and a vote cast on a card that no longer
   exists is lost anyway. Better to restart the round than to strand votes. Judging the target
   alone means a detour through an opening phase cannot bring votes back into the sharing.
   Going back to `ICEBREAKER` or `REVIEW` keeps the votes, so the vote budget cannot change
   there (`409`).

2. **ARCHIVED is frozen but reversible.** Any change to an archived retro is refused (`409`)
   **except** a phase change. Reopening is always possible, to any phase but `LOBBY`. A review
   outcome belongs to the retro that recorded it, so it is refused in `ARCHIVED` (`409`) even
   though editing the action itself is not.

3. **A retro opens in `LOBBY` and never comes back to it.** `X → LOBBY` for any `X ≠ LOBBY`
   answers `409 "The retro has already started"`; `LOBBY → LOBBY` is a no-op, and the rest of
   the same `PATCH` (title, timer, votes per person) still applies. A board without columns may
   enter `BRAINSTORM` (and later `ICEBREAKER`, `REVIEW`), nothing further (`409`).

The guards of a `PATCH` run in this order, inside the retro's queue: archived, back to
`LOBBY`, `LOBBY → LOBBY` no-op, votes per person, columns, timer, vote wipe, entry effects,
write. **Entering `ICEBREAKER` asks the question**: one is drawn if the retro has none, and
`icebreaker_asked_at` is set if it is null, in the same command. Coming back later keeps the
question, its date and its answers. **Entering `REVIEW` focuses the first action of
`review.items` without an outcome in this retro** (none if all are decided); **leaving it drops
the focus**, in the same write. `actionReview` changes only in `LOBBY` (`409` "The action
review can only change before the retro starts").

---

## 4. Anonymity rules — security core

This is the product's central promise. It lives in **one pure function**,
`RetroManager.projectBoard`, shared by the HTTP read and the WebSocket broadcast.
**One implementation, never two.**

| Element | Audience | Rule |
|---|---|---|
| **Note text** | Its author, always | `text` is returned when `revealed === true` **or** the caller is the author |
| | Everybody else | `text` is returned **empty** (`''`) while `revealed === false` |
| **Note author** | Everybody, always | `author.id` and `author.name` are always present, and `author.pictureUrl` when the user has one. Both are today's values, read by join: a new name or avatar shows on every note, archived retros included |
| **Vote totals** | Everybody | Only in `DISCUSS` and `ARCHIVED` |
| **Own votes** | Self | Only in `VOTE`, `DISCUSS`, `ARCHIVED`; otherwise `myVotes: 0` |
| **Votes spent per person** | Everybody | Only in `VOTE`: `voteProgress[userId]` = how many votes they cast, never on which card; `{}` in every other phase |
| **Icebreaker question** | Everybody | Once asked; `question: null` for everyone in `LOBBY`. A question never asked disappears for everyone once the retro left `LOBBY` (`icebreaker: null`): starting without the icebreaker skips it for good |
| **Icebreaker answer** | Everybody, always | `author` is always present: answers are signed |
| | Its author, always | `text` is returned when the answer is `revealed` **or** the caller is the author, `''` otherwise, the facilitator included. An answer is hidden when written, like a brainstorm note; its author alone shares it or hides it again |

> **The product protects the content, not the presence.** Everyone sees that Victor wrote
> three notes; nobody reads them until he shares them.

**Masking happens server side.** Withheld text never leaves the service: the client is not
trusted to hide it. This is the single most important property not to break, and the first thing
the tests lock down.

**Sharing is reversible.** Someone who shared too early can take the text back, and nothing
downstream depends on a note having been read once.

**Sharing is all at once or one note at a time**: `setMineRevealed(retroId, revealed)` flips
*all* of the caller's notes in that retro; `setRevealed(retroId, noteId, revealed)` flips that
one note only, and only its author may call it (`403` for anybody else, the facilitator
included). Both are idempotent and allowed in the same phases. `myNotesRevealed` is `true` as
soon as at least one of the caller's notes is shared.

---

## 5. Authorization

Four levels, on three different scopes.

| Role | Source | Powers |
|---|---|---|
| **Team member** | `memberships` | See and take part in the team's retros |
| **Team admin** | `memberships.is_admin`, or being an org admin | Create and delete retros, rename the team, promote team admins, manage the team's templates and its default template; **add and remove members, by their own `is_admin` only** |
| **Org admin** | `org_members.role = 'admin'` | Everything a team admin can do, on **every** team; manage org admins; list every team and its roster; **delete a team**; read organisation stats. **Cannot read a board of a team they have not joined, and cannot add themselves to one**: what they see of a team's content is counters and dates only, never a note's text, a title, an author or anybody's votes. **Cannot read the templates of a team they have not joined** |
| **Facilitator** | Retro creator, then transferable | Change phase, title, timer, votes per person, columns; moderate notes |

**A profile is its owner's alone.** Everybody edits their own name and avatar, nobody else's:
no route writes another user's profile. The one exception is moderation: an org admin may
**remove** the uploaded avatar of a member of their organisation (`404` for anybody else),
which falls back to the automatic avatar. They can neither set an avatar nor rename anybody.

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
- Creating a retro, and every template write, checks membership **before** the role, so an
  org admin who is not in the team is refused (`403`) before anything is written.
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

- Creation is restricted to **team admins**. The creator becomes the facilitator. A new
  retro opens in `LOBBY`; retros created before the waiting room keep their phase.
- A retro starts from a `templateId` **or** from explicit `columns`, never both (`400`).
  - `templateId`: a `builtin:*`, or a template of **this** team. Any other (another team,
    another organization, deleted) is `404 "Template not found"`.
  - `columns`: the given titles without prompts, and no template reference. An empty list
    creates a **blank** retro with no column; it cannot go past `BRAINSTORM` (nor be archived)
    until at least one column exists (`409`).
  - Neither: the team's default template (see Templates).
- The template is **copied** in one transaction with the retro: columns with their prompts,
  `template {id, name}`, `defaultTimerSeconds`. The board never reads the template again.
- The opening steps follow the same priority: `icebreaker` is
  `body.icebreaker ?? template.icebreaker ?? false`, `actionReview` is
  `body.actionReview ?? template.actionReview ?? true`. The new retro dialog always sends both,
  prefilled with `template.icebreaker ?? true` and `template.actionReview ?? true`.
- `maxVotes` is `body.maxVotes ?? template.maxVotes ?? 5` (1 to 10), and changed by the facilitator
  **only in `LOBBY`, `BRAINSTORM` or `SHARE`** (`409` once voting has started).
- Deletion: team admins only. Removes columns, notes, clusters and votes.
  **Actions survive**: they belong to the team.

### Columns

- Editable only in `LOBBY` and `BRAINSTORM`, and only by the facilitator: the waiting room is
  where the board is set up. Once notes are placed, renaming
  or removing a column moves the ground under the participants.
- A column may carry a **prompt** (<= 140, empty means none), shown under its title to everyone
  in every phase. It is set at creation or with `PATCH {title?, prompt?}` (at least one, `400`
  otherwise), under the same rule as the title: `403` in `SHARE`, `VOTE`, `DISCUSS`, `409` in
  `ARCHIVED`.
- **A column holding notes cannot be deleted** (`409`).
- Inline editing (note text, column title, group title) is validated with Enter, or with the
  check button; Shift+Enter adds a newline in a note; Escape cancels; leaving the field saves.
- `position` is assigned at creation after the last column.
- **Reorder**: the facilitator moves a column one step left or right with the arrows of its
  header. The client sends the full new order (`PUT .../columns/order`, `{columnIds}`); it must
  list every column of the board exactly once (`409` otherwise). Positions are rewritten
  `0..n-1` and every participant receives the new board in real time.

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
  The board does not send such a request: while a note is dragged over a card of another
  column, that card shows a red outline and refuses the drop, with no error message.
- A note cannot be grouped with itself (`409`).
- **Any participant can group or ungroup any shared note**, their own or somebody else's:
  arranging the board is a team effort, and the cluster shows no more than the note already
  did. A note still face down can only be grouped or ungrouped by its author or the
  facilitator (`403`). Grouping never grants the right to edit, move to another column or
  delete somebody else's note.
  On the board, a participant can drag somebody else's shared note onto a card, but not onto
  a column: that drop is ignored rather than refused with an error.
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
- During `VOTE` the board carries `voteProgress`, the number of votes each person has spent,
  so the room sees who is done: each connected participant shows `used/maxVotes` in its
  avatar's tooltip, and an avatar whose whole budget is spent gets a green outline. The
  presence bar is only avatars, with no counter text.

### Actions

- Creation: only in `DISCUSS`, from a retro.
- **Wording**: an open action is closed with **Drop** (red, tooltip "Abandon this action, keep it in history") or **Done** (tooltip "Mark as done", the validating button, on the right). Both stay listed with their status and can be reopened. **Delete** is reserved for permanent removal (note, column, retro, team) and says so in its tooltip or confirmation.
- Cards show the author name and avatar only, never a "wrote this" sentence; an avatar without picture shows the person's initials.
- **Editing: at any time, independent of the phase.** Reviewing an action happens whenever
  the team wants.
- **Editing the text** is inline in the action list (retro panel and team page): a pencil
  button swaps the text for a field, **Enter** or the check button saves (trimmed, empty is
  refused), **Escape** cancels. Every role of the table above may do it.
- The assignee must be a **team member** (`409`).
- `assigneeId: null` unassigns.
- **Automatic carry-over:** every `OPEN` action from an **earlier** retro of the same team
  comes back in the board's `carriedOverActions`. This is the product's value loop.
- **Closing date**: every change of `status` to `DONE` or `DROPPED` sets `closed_at`, a change
  to `OPEN` clears it, the same status sent again leaves it alone. Actions closed before this
  date was recorded keep `closed_at` NULL and are left out of the metrics.

### Review

- A retro **reviews** `review.items`: the actions it carries over, plus those it already
  reviewed, whatever their status now (a Done would otherwise vanish on the next broadcast).
  Oldest first, then by id. An action of this retro, a later one, or one closed elsewhere and
  never reviewed here is not part of it (`409`); an action of another team is `404`.
- A retro reviews when `action_review` is on: `body.actionReview ?? template.actionReview ?? true`
  at creation, then the
  facilitator's switch in `LOBBY`; exposed as `review.enabled`. The review step is skipped
  when it is off or `review.items` is empty (`nextOpeningPhase`), and shown in the stepper only
  then or while in `REVIEW`. The service does not enforce that order.
- **Focus** (`PUT /retros/{retroId}/review/focus {actionId | null}`): the facilitator's alone
  (`403`), in `REVIEW` only (`403`, `409` in `ARCHIVED`), on an action of `review.items`
  (`409`). It is board state: late joiners and a restart keep it. Recording an outcome does
  not move it.
- **Any member** records an outcome (`reviewedBy` keeps who), from the review screen or the
  actions panel. One per
  action and retro, the last write wins. In one transaction, with one timestamp:
  - **Done** / **Drop** close the action (`closed_at` = the review time) unless it already has
    that status; **Keep** reopens it (`closed_at` NULL) and it comes back at the next retro.
  - The **same** outcome again only updates the comment: the review time and the closing date
    stay, so the metrics do not move.
  - The comment is optional, at most 300 characters, trimmed; blank is none. Left out, the
    comment already there stays, so changing the outcome keeps it.
- **Undo** removes the outcome. The action is reopened only if it still carries the closing that
  outcome made (same status, `closed_at` = review time); a Keep, or a closing or reopening done
  elsewhere since, leaves the status alone.
- A review and an edit from the team page are not serialised with each other: the last write
  wins on the status, and the panel always shows the action's real status.
- **Metrics** (`GET /teams/{teamId}/actions/stats?retroId=`, any member, never in the board):
  - `doneSinceLastRetro` / `droppedSinceLastRetro`: actions now `DONE` / `DROPPED` closed since
    the retro before `retroId` (all recorded closings when there is none). Without `retroId`
    it counts since the team's latest retro. Closings outside a review count.
  - `openCount`: the team's open actions now.
  - `completionTrend`: the last 6 retros that reviewed anything, plus `retroId` as the
    `current` point when it is not among them (dropping the oldest), oldest first;
    `rate = done / (done + dropped + kept)` to 2 decimals, `null` when nothing was reviewed.
    Actions left without an outcome are not counted.

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
| `extend` | `seconds` given, positive or negative; a timer exists (`409` otherwise) | adds to `remaining_ms` when paused, otherwise moves `ends_at`; `total_ms` follows |
| `stop` | — | clears both |

Every participant hears a short chime (generated with the Web Audio API) when their local
countdown reaches zero, once per run: a board opened on an overdue timer stays silent. The
chime follows the per-viewer mute preference stored in `localStorage` (toggled from the waiting-room
game; the timer has no mute button). A browser that blocks audio
until the page was touched simply stays silent.

The facilitator starts the timer from a picker: presets of 1, 3, 5 and 10 minutes, or a custom
number of minutes. The picker remembers the last duration chosen. It opens on the
template's suggested duration (`board.defaultTimerSeconds`), 5 minutes otherwise.

`start` takes `seconds` in `[5, 3600]`; `extend` takes a non-zero `seconds` in `[-3600, 3600]`.
The controls sit on a row below the clock and its bar. The facilitator's `-1` and `+1` buttons send `-60` and `+60`; they exist only while a timer is
running or paused. A cut larger than what is left ends the round instead: the remaining time
clamps to `0` (a running clock reaches zero at once, chime included), never below. Extending an
already-overdue timer never yields a negative duration; cutting one is `409` and its `-1` is
disabled.

### Icebreaker

- `icebreaker` at creation is `body.icebreaker ?? template.icebreaker ?? false`: without it the retro has none. With
  it, a question is drawn at creation and asked on entering `ICEBREAKER`.
- The bank (`service/src/Icebreaker/questions.ts`, CC0-1.0) holds 60 questions in English,
  all light and playful: the icebreaker sets a good mood, it does not check on the team or the
  sprint. Ids are
  never reused; a question is retired with `active: false` and still shows in old retros.
- **A draw** picks uniformly among the active questions the team was never asked, leaving out
  those held by the team's other waiting rooms (`LOBBY`, not asked yet). When none is left, a
  new cycle starts: everything but the reserved questions, then the whole bank. Nobody picks
  another question or writes one: the draw is the question.
- Every member answers on one post-it, 1 to 140 characters after trimming, in `ICEBREAKER`
  only; a second answer replaces the text and keeps the post-it's place and visibility, and
  removing it is idempotent. Answering is optional, and nothing tells "did not answer" from
  "answered out loud".
- A post-it is **hidden when written**, like a brainstorm note. Its author alone shares it or
  hides it again (`404` without an answer), in `ICEBREAKER` only; nothing else reveals or hides
  answers, and a new text keeps the post-it shared or hidden as it was.
- Editorial guardrails of the bank: nothing about family, health, religion, politics or money;
  answerable in one sentence; reviewed in the pull request (CONTRIBUTING.md).

### Waiting room game

Wheel Gun, played by everybody in the waiting room while the retro is in `LOBBY`. Nothing of it is stored: it
lives in the retro's `RetroSession` and ends with it (ADR-006).

- Cars cross a pit lane of width 1 on 3 lanes, left to right. A car is `0.12` long and enters
  at `x = -0.12`; `x(t) = -0.12 + speed × (t − spawnAt) / 1000`, `speed` in `[0.11, 0.25]`
  widths per second. Its rear wheel is at `x + 0.025`, its front wheel at `x + 0.095`.
- The service draws the cars and sends them ahead: a first chunk at once covering
  `[now + 1 s, now + 12 s[`, then every 10 s a chunk covering `[now + 2 s, now + 12 s[`. The
  mean gap is `clamp(2200 − 50 × players, 700, 2200)` ms, ±40%. At most 8 cars on the track;
  a car never catches the one ahead in its lane; a draw that fits nowhere is skipped.
- A wheel goes to the first valid hit: +1. The second wheel of a car completes the pit stop:
  +1 more to each distinct contributor, and the team's `Pit stops` count grows.
- A hit is ignored, without an answer, when the game is not running or the retro left
  `LOBBY`, the connection has not joined, the car or the wheel is unknown, the wheel is taken,
  the person already tried that wheel of that car (**one attempt per person, car and wheel**,
  every tab included), or the wheel is not on screen give or take 300 ms. Click coordinates are
  never sent; misses are not sent either. A scripted client can still win the lobby: accepted.
- Scores are per person, ranked by points, then by who reached them first.
- The game runs while somebody has joined; with nobody playing, no car is drawn and the scores
  stay. Joining and every chunk re-check access: a removed member stops receiving the game at
  the next chunk.
- Leaving `LOBBY` ends it: `game.ended` with the scores goes to every connection right after
  the new board. Deleting the retro stops it without `game.ended`.

### Speaking order

During DISCUSS only, everybody connected gets a die in the toolbar and rolls their own, once
(`POST /retros/{retroId}/dice`). The order builds up as the dice land, highest face first; equal
faces are settled by a tie-breaker drawn with the roll and never sent. Every roll sends
`dice.updated` with the ranked list to every connection. The facilitator can reset every die
(`DELETE /retros/{retroId}/dice`). Rolling needs a live connection to the retro (`409`
otherwise), and outside DISCUSS both calls answer `403` (`409` on an archived retro). The dice are held in memory by the
`RetroSession` actor only: nothing is stored, somebody subscribing later receives the current
dice, and they are cleared when the retro leaves DISCUSS or the session ends. They reveal
nothing presence does not already show.

The die sits in the toolbar, right after the **Discuss** step of the phase track; the order
lives in the presence avatars of the band:

- **My die**: a big die (40 px) with a `?` face in a primary-coloured button, tooltip "Roll your
  die". On a phone the track's steps narrow a little to keep it beside Discuss.
- **The spin**: a roll lasts 1.5 seconds on screen. The request leaves at the click, the die
  tumbles through random faces and its button is disabled; the value the service sent is kept
  hidden until the 1.5 seconds are over. My face then stays on the big die for 1 second, after
  which it drops under my avatar and the big die keeps it, dimmed (tooltip "You rolled n").
  Everybody else sees a small die spin under the roller's avatar for the same 1.5 seconds when
  `dice.updated` brings the new roll, then the result lands there. Dice already rolled when
  somebody joins (the snapshot sent on subscribe, marked `snapshot: true`) show at once. With
  `prefers-reduced-motion`, there is no spin, no hold and no movement: the result shows directly.
- **The order**: the presence avatars reorder live as the rolls land: whoever rolled first, in
  the service's ranking (highest face first, ties as the service broke them), then whoever has
  not rolled yet, as they came. Under each ranked avatar a small badge gives the rank and the
  face (tooltip "Name · rolled n · speaks 1st"). The avatars slide to their new place.
- A small check (tooltip "Order complete") beside the die once everybody connected rolled, and
  for the facilitator a small reset icon (tooltip "Reset the dice") once somebody rolled; on a
  phone both sit under the die.
- Outside DISCUSS there is no die, and the presence keeps its order without badges.

### Profile

- **Name.** One field. `PATCH /me {name}` trims it and collapses inner whitespace, then checks
  1 to 80 characters; control and format characters (`\p{Cc}`, `\p{Cf}`) are refused, except
  the zero-width joiner emoji sequences need. The name becomes the user's own:
  `name_source = 'user'`. Two people may share a name; member lists show the email on hover.
- **Avatar.** `auto` shows the identity provider's photo when there is one, else initials;
  `upload` shows the uploaded image; `initials` shows initials even when a photo exists. The
  choice wins over the provider, which wins over initials. `picture_url` is the provider's
  photo, `/api/avatars/{id}` or nothing, accordingly. Initials always sit on the person's
  colour, and remain the fallback when an image fails to load.
- **Upload.** `PUT /me/avatar` with the image as the body. The browser crops it square and
  re-encodes it to 256x256 WebP (JPEG where WebP cannot be produced), which also drops every
  metadata. The service accepts at most 256 KB (`413`), WebP or JPEG only, recognised from the
  bytes and matching the `Content-Type` (`415`), 10 uploads per hour per user (`429`). It
  never decodes the image. A new upload replaces the previous one under a new id; leaving
  `upload` deletes the image in the same transaction. `DELETE /me/avatar` returns to `auto`.
- **Google sign-in** records the name (cleaned, cut to 80 characters) and the photo it
  carries on every sign-in. While `name_source = 'sso'` the name follows; while the avatar is
  `auto` the picture follows, for existing accounts too. A name or an avatar the user chose is
  never overwritten by a sign-in. The response of `/auth/google` already carries the new
  values. An account created by Google starts with `name_source = 'sso'`; one created by
  invitation, registration, setup or dev login with `'user'`. A password sign-in touches no
  `sso_*` value.
- **Use my Google name.** `PATCH /me {useSsoName: true}` hands the name back to Google;
  `409` while no Google name is known, `400` together with `name`.
- **Live boards follow.** After any profile write, a Google sign-in that changed the name or
  picture included, every live retro of the user's organisation is broadcast again from its
  own queue: notes, assignees and presence show the new values without reconnecting.

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
- The **My retros** page offers **New retro** to a team admin, with the same form as the team
  page. The New retro dialog asks for the team when the user administers **and** belongs to
  several; a team an org admin has not joined is not offered. Without such a team, the button
  is not shown.

### Templates

- **Built-in**: 13 classics shipped in code (Start / Stop / Continue, Mad / Sad / Glad, 4L,
  Sailboat, Starfish, KALM, DAKI, Hot-air balloon, Plus / Delta, Rose / Bud / Thorn,
  Wrap-up + kudos, Pit Stop, Blank). Read-only: `PUT` or `DELETE` on one is `404`; a team
  duplicates it to adapt it.
- **Team templates** are read by the team's members and written by its admins only (`403`
  otherwise). A user outside the team, org admins included, gets `403`.
- A template has a name (unique in the team whatever the case, `409`; a team may reuse a
  built-in name), an optional description, 0 to 8 columns with distinct titles (case
  insensitive, `400`), an optional prompt per column, an optional `maxVotes`, an optional
  suggested `timerSeconds`, and its opening steps `icebreaker` and `actionReview`, each
  `true`, `false` or `null` (not set: the new retro dialog decides). Strings are trimmed.
  Every built-in leaves both steps unset; a team wanting another setting duplicates it.
- **At most 50 templates per team** (`409 "Template limit reached"`).
- **Edit** replaces the whole template. Last write wins; `updatedAt` and `updatedBy` say whose
  version it is.
- **Delete** is final. If it was the team default, the default goes back to Start / Stop /
  Continue in the same transaction.
- **Duplicate** (`POST .../templates/duplicate`, `{sourceTemplateId, name?}`): from a
  built-in, or from a template of any team of the organization the caller belongs to. Any
  other source answers `404`, so a team's templates are not disclosed to outsiders. Without a
  name, the copy is called `"<source> (copy)"`, then `"(copy 2)"` and so on.
- **Save as template** (`POST /retros/{retroId}/template`, `{name, description?}`): a team
  admin, in any phase including `ARCHIVED`, copies the board's columns, prompts,
  `maxVotes` and opening steps (an icebreaker question drawn, the review on or off),
  never its notes, and no timer. A board with more than 8 columns or two columns
  of the same title is refused (`409`): rename or remove first. The board's dialog prefills
  the name with the retro's template name, or its title, suffixed `(copy)`, `(copy 2)`... when
  the team already has a template of that name. The board shows the button only in `DISCUSS`,
  the last working phase, to a team admin who is a member; the API stays permissive. A retro
  does not show which template it came from.
- **Team default** (`PUT /teams/{teamId}/default-template`, `{templateId | null}`): a built-in
  or a template of this team (`404` otherwise); `null` goes back to Start / Stop / Continue.
  The effective default is never null.
- **Snapshot.** No template write changes an existing retro, and none is broadcast.

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
`/setup`, `/auth/*` and `/avatars/*`.
Observed codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `413`, `415`, `429`.

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
| GET | `/me` | `200` `Profile` |
| PATCH | `/me` | `200` `Profile` — `{name?, useSsoName?: true, avatar?: {source: 'auto'\|'initials'}}`; `400` empty or invalid; `409` no Google name known |
| PUT | `/me/avatar` | `200` `Profile` — raw WebP or JPEG body; `413` over 256 KB, `415` other type, `429` |
| DELETE | `/me/avatar` | `200` `Profile` — back to `auto` |
| GET | `/avatars/{avatarId}` | `200` image, **public**, `nosniff`, `default-src 'none'; sandbox`, cached immutably; `404` unknown |
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
| POST | `/teams/{teamId}/retros` | `201` `Board` — `icebreaker?: boolean`, default `false` |
| GET | `/retros/{retroId}` | `200` `Board` |
| PATCH | `/retros/{retroId}` | `200` `Board` — `409` on a `phase: 'LOBBY'` once started |
| PUT | `/retros/{retroId}/icebreaker/answer` | `200` `Board` — own answer `{text}` |
| DELETE | `/retros/{retroId}/icebreaker/answer` | `200` `Board` — own answer, idempotent |
| POST | `/retros/{retroId}/icebreaker/answer/reveal` | `200` `Board` — share own answer, `404` without one |
| DELETE | `/retros/{retroId}/icebreaker/answer/reveal` | `200` `Board` — hide own answer, `404` without one |
| DELETE | `/retros/{retroId}` | `204` |
| POST | `/retros/{retroId}/columns` | `201` `Board` |
| PUT | `/retros/{retroId}/columns/order` | `200` `Board` |
| PATCH | `/retros/{retroId}/columns/{columnId}` | `200` `Board` |
| DELETE | `/retros/{retroId}/columns/{columnId}` | `200` `Board` |
| POST | `/retros/{retroId}/notes` | `201` `Board` |
| PATCH | `/retros/{retroId}/notes/{noteId}` | `200` `Board` |
| DELETE | `/retros/{retroId}/notes/{noteId}` | `200` `Board` |
| POST | `/retros/{retroId}/notes/reveal` | `200` `Board` |
| DELETE | `/retros/{retroId}/notes/reveal` | `200` `Board` |
| POST | `/retros/{retroId}/notes/{noteId}/reveal` | `200` `Board` — author only |
| DELETE | `/retros/{retroId}/notes/{noteId}/reveal` | `200` `Board` — author only |
| POST | `/retros/{retroId}/notes/{noteId}/group` | `200` `Board` |
| DELETE | `/retros/{retroId}/notes/{noteId}/group` | `200` `Board` |
| PATCH | `/retros/{retroId}/clusters/{clusterId}` | `200` `Board` |
| POST | `/retros/{retroId}/votes` | `200` `Board` |
| POST | `/retros/{retroId}/facilitator` | `204` |
| PUT | `/retros/{retroId}/facilitator` | `204` |
| POST | `/retros/{retroId}/dice` | `200` `{rolls: [{userId, name, pictureUrl?, value}]}` — DISCUSS, own die, once |
| DELETE | `/retros/{retroId}/dice` | `204` — DISCUSS, facilitator only |
| GET | `/teams/{teamId}/templates` | `200` `{team: Template[], builtin: Template[], defaultTemplateId}` — team members |
| POST | `/teams/{teamId}/templates` | `201` `Template` — team admin |
| POST | `/teams/{teamId}/templates/duplicate` | `201` `Template` — team admin, `{sourceTemplateId, name?}` |
| PUT | `/teams/{teamId}/templates/{templateId}` | `200` `Template` — team admin, full replacement |
| DELETE | `/teams/{teamId}/templates/{templateId}` | `204` — team admin |
| PUT | `/teams/{teamId}/default-template` | `200` `{defaultTemplateId}` — team admin, `{templateId \| null}` |
| POST | `/retros/{retroId}/template` | `201` `Template` — team admin, `{name, description?}` |
| GET | `/teams/{teamId}/actions` | `200` `Action[]`, most recent first |
| POST | `/retros/{retroId}/actions` | `201` `Action` |
| PATCH | `/teams/{teamId}/actions/{actionId}` | `200` `Action` |
| GET | `/teams/{teamId}/actions/stats?retroId=` | `200` `ActionStats` — any member, `404` for a retro of another team |
| PUT | `/retros/{retroId}/review/actions/{actionId}` | `200` `ReviewItem` — `{outcome: 'DONE'\|'DROPPED'\|'KEPT', comment?}` |
| DELETE | `/retros/{retroId}/review/actions/{actionId}` | `204` |
| PUT | `/retros/{retroId}/review/focus` | `204` — facilitator, `{actionId: string \| null}`, `REVIEW` only |
| GET | `/org/admins` | `200` `User[]` |
| GET | `/org/members` | `200` `OrgMember[]` sorted by name |
| DELETE | `/org/members/{userId}/avatar` | `204` — org admin removes an uploaded avatar; `403`; `404` outside the organisation |
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
Profile         User & { nameSource: 'sso'|'user', avatarSource: 'auto'|'upload'|'initials',
                  ssoPictureUrl?, hasSsoName }
Team            { id, name, createdBy, createdAt?, isAdmin, isMember, memberCount }
TeamMember      { userId, email, name, pictureUrl?, isAdmin, joinedAt? }
OrgStats        { period, people: {total, admins}, teams: {total, idle},
                  retros: {count, total}, notes: {count, perRetro},
                  actions: {open, done, dropped} }
Action          { id, retroId, retroTitle, text, status, assignee?: {id,name}, createdAt?,
                  closedAt }
ReviewItem      { action: Action, outcome?, comment?, reviewedAt?,
                  reviewedBy?: {id, name, pictureUrl?} }
ActionStats     { openCount, doneSinceLastRetro, droppedSinceLastRetro,
                  completionTrend: [{retroId, retroTitle, createdAt, done, dropped, kept,
                                     rate, current}] }
Timer           { state: 'IDLE'|'RUNNING'|'PAUSED', endsAt?, remainingMs? }
Note            { id, columnId, author: {id,name,pictureUrl?}, isMine, revealed, text, createdAt? }
Card            { id, type: 'note'|'cluster', notes: Note[], myVotes, title?, totalVotes? }
Column          { id, title, prompt: string | null, order, cards: Card[] }
Board           { id, title, phase, teamId, createdBy, createdAt?, facilitatorId, isFacilitator,
                  columns, maxVotes, myVotesLeft, myNotesRevealed, votesRevealed,
                  voteProgress: {[userId]: votesSpent},
                  timer, actions, carriedOverActions,
                  review: {enabled, focusActionId, items: ReviewItem[]},
                  template: {id, name} | null, defaultTimerSeconds: number | null,
                  icebreaker: Icebreaker | null }
Icebreaker      { state: 'WAITING'|'ASKED', answeredCount,
                  question: {id, text} | null,
                  answers: [{author: {id, name, pictureUrl?}, text, mine, revealed}] }
Template        { id, scope: 'BUILTIN'|'TEAM', name, description: string | null,
                  columns: [{title, prompt: string | null}], maxVotes: number | null,
                  timerSeconds: number | null, icebreaker: boolean | null,
                  actionReview: boolean | null, updatedAt?, updatedBy?: {id, name} }
```

### Ordering, to preserve

- Columns by ascending `order`.
- Notes inside a card by ascending `createdAt`.
- Icebreaker answers by ascending `createdAt`; replacing an answer keeps its place.
- Cards: **sorted by `totalVotes` descending only when totals are revealed**
  (`DISCUSS`, `ARCHIVED`); otherwise standalone notes first, then clusters.
- An empty cluster is not rendered; a standalone note always is.

---

## 8. WebSocket contract

Ten outbound events, to keep identical:

```ts
{ type: 'board.updated',    board: Board }                    // projected per recipient
{ type: 'presence.updated', participants: [{userId, name, pictureUrl?}] }
{ type: 'cursor.moved',     cursor: {userId, name, x, y} }
{ type: 'cursor.left',      userId }
{ type: 'dice.updated',     rolls: [{userId, name, pictureUrl?, value}], snapshot? }
{ type: 'error',            message }
{ type: 'game.state',  serverNow, cars: [GameCar & {taken: {front?, rear?}}], scores, teamStops } // to who joins
{ type: 'game.spawns', serverNow, cars: [GameCar] }                                               // to players
{ type: 'game.hit',    serverNow, carId, wheel, userId, name, pictureUrl?, points, serviced, teamStops } // to players
{ type: 'game.ended',  scores, teamStops }                                                        // to everyone
// GameCar {id, lane: 0|1|2, spawnAt, speed, livery: 0..11}; GameScore {userId, name, pictureUrl?, points}
```

Inbound actions: `subscribe`, `cursor`, `game.join`, `game.leave`,
`game.hit {carId, wheel: 'front'|'rear'}` (`carId` a positive safe integer, otherwise ignored).
Game messages before a subscribe are ignored. `serverNow` and `spawnAt` are the service's
epoch milliseconds; `points` in `game.hit` is the player's total, not a delta.

**Rules to preserve:**

- `board.updated` is **projected per recipient**: one board read, then one projection per
  connection. The anonymity rules of section 4 are the only ones that ever reach a client.
- Cursors **never touch storage**: they are relayed straight to the other connections. A mouse
  move costs no write and no read.
- Cursors are **not relayed during LOBBY, ICEBREAKER, REVIEW, BRAINSTORM and VOTE** (there is
  no board in the waiting room, the icebreaker nor the review, where the focus points, and elsewhere they would show where others write or vote); the client does not
  draw them either. Every other phase relays them.
- Each participant has one **stable colour** derived from their `userId` (hash into a fixed 10-colour palette taken from the design system tokens of `web/src/ui/theme.ts`, all readable under white initials). The cursor, its name label and the initials of every avatar (`UserAvatar`: presence, notes, member lists, header) share it; it is computed client-side, nothing is stored.
- Cursor coordinates are **board-relative**, as a fraction of the box the columns take, zoom
  included: every screen and every zoom level differs, the same fraction lands on the same note.
- `presence.updated` deduplicates by `userId` (several tabs are one person) and sorts by name.
- Before every board it sends, the session re-resolves each connection, and takes its name
  and avatar from that answer: when one changed, `presence.updated` follows the board. A
  profile write broadcasts every live retro of the organisation again (section 6, Profile);
  cursors take the new name on their next move.
- On subscribe: access check, then `broadcastBoard` **and** `broadcastPresence`, then the
  current dice to the new connection when somebody rolled.
- Access refused on subscribe sends `{type: 'error'}` without closing the socket.
- A dead connection is pruned on the first failed send.
- **An action edit refreshes every live board of its team.** The edit runs in the queue of
  the retro the action came from (outside any queue when that retro was deleted), then every
  other retro of the team somebody is connected to is re-broadcast through its own queue
  (`SessionHub.liveRetroIds()` narrowed to the team, then `SessionHub.refreshRetros(ids)`), so
  the board that carries the action over never shows a stale status. A review outcome does
  the same from the queue of the retro that records it. No event is added: outcomes travel in
  `board.updated`.

---

## 9. Web client behaviour

- Token kept in `localStorage` under `pit-stop.token`. A `401` clears it.
- Socket URL: `wss://<host>/ws`, overridable by `VITE_WS_URL`. The session token is offered
  as a subprotocol, `new WebSocket(url, ['pit-stop', token])`, and the service answers
  `pit-stop`: never in the URL, which proxies log.
- **Reconnection backoff: 1s, 2s, 5s, 10s**, then stays at 10s. The attempt counter resets on
  a successful open.
- On open, the client sends `{action: 'subscribe', retroId}`.
- On close, participants, cursors and the dice are cleared.
- **Cursors are throttled to one message every 120 ms** (about 8 per second); interpolation on
  arrival already looks continuous.
- A cursor with no update for **8 s** is considered gone; a sweep runs every 2 s.
- A `presence.updated` that drops a user also drops their cursor: somebody who left the retro
  cannot leave a pointer behind.
- The board is pushed by the service on every change; the page only falls back to fetching
  while the socket is down.
- **Waiting room** (`LOBBY` then `ICEBREAKER`): one dialog over the board that nobody dismisses
  with the backdrop or `Escape`, gone for everybody once the retro leaves it. Its
  `aria-labelledby` follows the current step's heading.
  - **Step 1** (`LOBBY`): a welcome (`Welcome to the pit stop`, retro title and team), then who
    is here among the team's members (`x/y joined`, present first with their avatar and first
    name, popping in as they join (no animation with reduced motion), then absent as "not here
    yet"; `Everyone is here` once complete), then the game. Presence is shown only while the
    socket is connected, `Reconnecting…` otherwise, so `0/y` never shows. The others read
    `Waiting for {name} to start the retro`; when the facilitator is not connected they also get
    `Take over facilitation`, since the toolbar is under the dialog. The facilitator gets a
    single `Start`, not conditioned on presence, towards `nextOpeningPhase(board)`: `ICEBREAKER`
    when the retro has one (set at creation or by its template), else `REVIEW` when the review
    step is on, else `BRAINSTORM`; the toolbar's start reads `Start` too. A close icon (`Close`)
    in the dialog's top-right corner, for the facilitator alone, closes the dialog for them
    only: the retro stays in `LOBBY` for everybody else, the board and its column controls
    show, and a `Waiting room` button in the toolbar, next to `Start`, reopens it. `LOBBY` is not in the
    phase stepper, and no cursor is sent. Above the people, the facilitator alone gets a
    `Review n open actions first` switch when there is anything to review.
  - **Step 2** (`ICEBREAKER`): the same dialog, no game, no close icon. The question
    is an `h2`, large, at the top; below it one zone of post-its and a counter
    `{n} of {expected} answered` (`aria-live="polite"`, expected = present participants plus
    answer authors). A click in the empty part of the zone creates my post-it in inline edit
    (`Enter` validates, `Escape` cancels, 140 characters with a counter), as when adding a
    note; a hint reads `Click here to add your answer…` until I have one. There is one
    post-it per person: once I have mine, a click in the zone edits mine, as does a click on
    its text; validating an empty text removes it. Each post-it carries the author's
    `UserAvatar` and name, with the board's post-it style. A new post-it is hidden: its author
    clicks the eye (`Show my answer` / `Hide my answer`, `aria-pressed`) to share it. Others'
    hidden post-its are shown like a withheld board note (no text, author visible,
    `aria-label="{name} answered"`). The facilitator reads `Move on to {label}` (target
    `nextOpeningPhase(board)`: `Review` when the review step is on, `Brainstorm` otherwise), enabled with no column; the others read
    `Waiting for {name} to move on`, with `Take over facilitation` when the facilitator is not
    connected. Mobile: one column, no horizontal scroll.
  - After the icebreaker, a recap chip in the header opens a popover with the question and
    only the answers that were revealed.
- **Wheel Gun**, in the step 1 dialog below the people, always on: it is played while the dialog is
  open (the facilitator setting up the board leaves it). Positions use
  `offset = serverNow − Date.now()` from the last game event. A tap plays at once; the wheel
  turns to the winner's colour if someone else got it, and frees itself locally after 1 s
  without an answer. Keys `1`, `2`, `3` fit the most advanced free wheel of that lane among
  those on screen; touch targets are at least 44 px. Reduced motion: no particles or outline.
  Every colour of the track comes from the theme (`palette.track`): a pale lane with subtle
  separators, liveries from the wash. The impact sound obeys the global mute
  (`pit-stop.timer-muted`, set with the timer) and only plays for one's own taps. The team's
  `Pit stops: n` sits above the track. The scoreboard appears with the first point: top 5,
  then one's own row, then `+n others`. On `game.ended` with points, a 6 s toast gives the
  record and the winner.
- The retro's actions (this retro's and those carried over) live in a panel on the right,
  opened from the toolbar's `Actions · n` button, `n` being the open actions. On a wide screen
  the panel sits beside the board, which narrows; on a phone it slides over it. Turning a card
  into an action opens the panel. Its "Actions from previous retros" list is `review.items`:
  **Drop** and **Done** record the outcome in this retro, **Reopen** undoes it, from `REVIEW` to
  `DISCUSS` only (never in the waiting room, the icebreaker or an archived retro).
- **Review** (`REVIEW`): the review screen replaces the columns. A banner (`x done since last
  retro · y dropped · z open` and the completion trend, read again 500 ms after the board
  settles); the actions in order, each with its assignee, origin retro (`Deleted retro`), age,
  real status, outcome chip with comment and reviewer, and `Status changed since: …` when the
  status disagrees with the outcome. The focused action is highlighted and scrolled into view
  for everybody. **Drop**, **Keep**, **Done**, then **Undo** and an optional comment (300).
  The facilitator moves the focus by clicking a row, `Previous` / `Next` (next undecided,
  wrapping) or the arrow keys; others read `{name} is leading the review`. `Start brainstorming`
  in the toolbar leaves it; leaving with undecided actions asks first ("They stay open").
  Step 1 of the waiting room gives the facilitator a `Review n open actions first` switch when
  there is anything to review.
- The team page shows a **Follow-through** card above its actions: done since the last retro,
  dropped, open, and one bar per retro of the completion trend, labelled in words too. It is
  hidden while it has nothing to report.
- The retro opens on a single band: the way back to the team, the title (cut with an ellipsis
  when too long, never wrapped) and, on the right, the zoom. The presence (in DISCUSS, in
  speaking order) sits beside the title on a wide screen and on its own line under the band on
  a phone. The band is the same in every
  phase, archived included.
- The board can be **zoomed from 50% to 150%**, by steps of 10%, from the band above it
  (zoom out, reset by clicking the percentage, zoom in) or with Ctrl+wheel / a trackpad pinch
  over the board. The zoom group shows once the board has a column, phone included, where
  zooming out is the only way to see more than one column at a time. Only the columns scale;
  the band, the toolbar and the cursors of others keep their size.
  The zoom is per viewer, kept in `localStorage` under `pit-stop.board-zoom`, and falls back to
  100% when storage is unavailable; a stored value outside the range is clamped to it.
- **Filter by person**: once at least two people wrote on the board, the toolbar offers a
  `Everyone` select listing the note authors, which every card already names (section 4), so
  the filter tells nothing the board does not. Picking one or several fades every other note,
  shared or not, in every phase; `Everyone` clears it. The filter is client-side, per viewer
  and not kept across reloads; it complements the indigo edge on the viewer's own notes.

### Routes

| Path | Page | Access |
|---|---|---|
| `/login` | LoginPage | public |
| `/setup/:token` | SetupPage | public, first boot only |
| `/invite/:token` | InvitePage | public |
| `/reset-password/:token` | ResetPasswordPage | public |
| `/verify-email/:token` | VerifyEmailPage | public |
| `/teams` | TeamsPage | authenticated |
| `/profile` | ProfilePage | authenticated: own name and avatar; reached from the header avatar (the only identity shown in the header; the full name is its tooltip) |
| `/retros` | MyRetrosPage | authenticated |
| `/admin` | AdminPage | authenticated, org admin content: people, invitations, teams |
| `/paddock` | PaddockPage | authenticated, platform admin only |
| `/teams/:teamId` | TeamPage | authenticated |
| `/teams/:teamId/templates` | TeamTemplatesPage | authenticated, team members; writes for team admins |
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
| Column prompt | <= 140, trimmed, empty means none |
| Template name | required, <= 60, trimmed, unique in the team (case insensitive) |
| Template description | <= 200 |
| Template columns | 0 to 8, distinct titles (case insensitive) |
| Template `maxVotes` | integer, 1 to 10, or null |
| Template `timerSeconds` | integer, 5 to 3600, or null |
| Template `icebreaker`, `actionReview` | boolean or null |
| Note text | required, <= 500 |
| Icebreaker answer | 1 to 140 after trimming |
| `icebreaker` at creation | boolean |
| Cluster title | required, <= 60 |
| Team name | required, <= 60, trimmed on rename |
| Display name | 1 to 80 after trimming and collapsing spaces; no control or format character but the zero-width joiner |
| Uploaded avatar | <= 256 KB, WebP or JPEG by its bytes and its `Content-Type` |
| Action text | required, <= 300 |
| `vote.delta` | integer, exactly `1` or `-1` |
| `timer.seconds` | integer, 5 to 3600 for `start`; -3600 to 3600 for `extend` |
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
  only the `OPEN` ones from earlier retros; `review.items` is `carriedOverActions` plus the
  actions this retro already reviewed. An action of the current retro is never reviewed.
- A withheld note can be **moved** by the facilitator, but not rewritten.
- A retro belonging to another organization returns `404`, never `403`.
- A name or an avatar the user chose is never overwritten by a Google sign-in.
- An account invited, then signed in with Google, gets its Google photo and keeps the name
  given at the invitation.
- An unconfirmed account taken over by Google takes the Google name: the name typed by
  whoever registered the address does not survive.
- Editing or deleting a template never changes an existing retro.
- A template outside the team (another team, another organization, deleted) returns `404`.
- A retro never returns to `LOBBY`, archived or not.
- An icebreaker question is not drawn again for the team until the bank is exhausted, then a
  new cycle starts; two waiting rooms of a team never hold the same question.
- A waiting room left straight for the brainstorm forgets its question and frees it.
- A board without columns can go through `ICEBREAKER` and back to it, but not past `BRAINSTORM`.
- Two tabs of one person score as **one** player and share their attempts.

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
