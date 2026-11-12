# Changelog

All notable changes are recorded here. Versions follow [semantic versioning](https://semver.org).

## 0.3.0 — 2026-11-12

### Added

- Waiting room: every retro opens in a dialog where people appear as they join, with Wheel
  Gun, a shared pit-stop game, while the team gathers. The facilitator starts the retro or
  closes the dialog for themselves.
- Icebreaker: an optional opening question (60 in the bank, never twice for a team) where
  everyone writes one post-it, hidden until its author shares it.
- Action review: an optional step before the brainstorm to walk through the team's open
  actions and record Done, Drop or Keep. The team page shows the follow-through.
- Team templates: teams save and edit their own boards, next to 13 built-in classics, picked
  from a searchable list. A template also decides whether its retros open with an
  icebreaker and an action review.
- Profile: edit your display name and avatar from the header. Upload a photo (cropped in the
  browser), use your Google photo, or initials. Choices survive the next Google sign-in, and
  open retros show them at once.
- Organisation administrators can remove an uploaded avatar.
- Speaking order: in the discussion everyone rolls their own die; avatars line up in
  speaking order as the dice land.
- Vote progress per participant, shown in the avatars' tooltips during the vote.
- Share or hide one note at a time; notes added during the share arrive already shared.
- Group someone else's shared note; reorder columns; filter cards by person.
- Timer: pick its duration, add or remove a minute, and a chime when it ends.
- Edit an action's text after adding it.
- Zoom the board from 50% to 150%.

### Changed

- The retro opens on one band: the way back, the title, the people and the zoom. Phase
  descriptions, "x online" and the name in the navigation bar are gone: avatars carry
  tooltips instead.
- Actions live in a side panel instead of below the board.
- Your own notes stand out, show their author's avatar, and are more compact. Inline edits
  validate with Enter or a check button.
- Avatar and cursor colours come from the design system; each person keeps one colour.
- Other people's cursors are hidden while writing and voting.
- A live board is sent to whoever joins rather than to the whole room, and at most every
  250 ms during bursts: about five times less traffic with 30+ people.

### Fixed

- Google photos now appear, and follow Google, for accounts created by invitation or
  registration and for accounts created before this version.
- An unconfirmed account taken over through Google sign-in takes the Google name.
- Action changes reach every open retro of the team.
- Dropping a card on another column shows a red outline instead of an error.
- Phone layouts: presence with many people, the phase track, the review step, long words in
  notes and actions, team and administration pages, 44 px touch targets.

### Upgrading

- Migrations 005 to 012 run at start. 009 rebuilds the `retros` table and first writes a
  backup next to the database (`.bak-009_retro_phases`); there is no downgrade.

## 0.2.0 — 2026-10-29

### Added

- Votes per person chosen when starting a retro (3 by default) and adjustable by the
  facilitator until voting starts.
- Blank template: a retro can start with no column; it cannot leave the brainstorm until one
  is added.
- Turn a card into an action from the discussion: the action form is pre-filled, never
  submitted on its own.
- Team rename, by the team's administrators and organisation administrators.
- Team deletion, by organisation administrators only, after typing the team's name.
- Administration: activity counters over the last 30 days, the last quarter or all time,
  and a searchable, scrollable people list.
- Search when adding members to a team, several at once.

### Changed

- The board scrolls sideways instead of wrapping columns, and takes the full window width.
- The timer counts from the time left sent by the service, so a skewed clock or a pause and
  resume no longer makes it jump.
- "Take mine back" is now "Hide my notes"; sharing and hiding carry eye icons, and the
  toolbar is grouped into timer, my notes and facilitation.
- `/` opens My retros. Destructive actions are red. Member and people rows use a single
  actions menu.
- The source code link is gone from the interface: the source is referenced from the README.

### Fixed

- Second row of team cards misaligned, black separators in the members list, oval vote
  counter.
- Long retro and column titles, note footers wrapping in narrow columns, tight chip padding,
  toolbar controls floating right when they wrap, and overflow at phone widths.

## 0.1.1 — 2026-10-25

### Added

- A screenshot in the README, a code of conduct and a pull request template.

### Changed

- CI builds the Docker image on every pull request, and a release runs the tests before
  publishing the image.
- Development dependencies upgraded past known advisories: Vite 6.4.5, Vitest 4.
- The three most voted topics are marked by a solid vote badge instead of a square outline.

## 0.1.0 — 2026-10-25

### Added

- Self-hosted edition, the default (`EDITION=self-hosted`): no quotas. The operator's
  deployment sets `EDITION=cloud`.
- First boot without email: while no organisation exists, a one-time setup link is printed in
  the logs and creates the organisation and its first administrator.
- SMTP transport for transactional emails, next to Resend.
- Invitations panel for organisation administrators.
- Single Docker image serving the API, the websockets and the web client, with
  `docker-compose.yml`.
- AGPL-3.0 licence, contributing guide and security policy.
- A link to the source code on every page (AGPL section 13).

### Changed

- The API is served under `/api` in every deployment.
- Google sign-in, the paddock and replication are optional. Only `APP_URL` is required in
  production.
- Litestream variables are renamed `LITESTREAM_S3_*` and work with any S3-compatible bucket.
- Without a mail transport, invitation and reset links are logged at `info` level.
- The web client ships its vendors in separate chunks, cached across releases.

### Security

- Registering on a verified domain now requires confirming the address by email before any
  session or membership. Before, anybody could register as a colleague, or as a platform
  admin. An unconfirmed account no longer blocks the real owner, and an invitation or a
  Google sign-in that proves the address drops the password the squatter chose.
- An open websocket stops receiving boards as soon as its session or team membership ends.
- A team member could edit the actions of another team of the same organisation.
- An organisation admin could change team administrators in another organisation.
- The development login is enabled only with `NODE_ENV=development` or `test`, never by the
  absence of `NODE_ENV`.
- Names typed by users are escaped in emails. Security headers are sent.
- Registering again over an unconfirmed address voids the confirmation links already sent.
  Before, the owner clicking the link they expected verified the account under the squatter's
  password.
- Password login pays the hash cost for an unknown account too, so timing no longer tells
  which accounts exist.
- The websocket session token travels as a subprotocol instead of in the URL, which proxies
  log.
- Expired sessions and spent or expired one-time tokens are purged at boot and every hour.
- An address with a quoted local part holding "@", such as `"x@acme.com@"@attacker.com`,
  passed the verified-domain check of `acme.com` while its confirmation link went to
  `attacker.com`, which let an outsider join the organisation. Addresses are now plain (one
  "@", no quote) and the domain is read after the last "@".
- Registering no longer takes a password: it is chosen on the confirmation link. Before, an
  outsider registering a colleague's address kept the password they chose, and got the
  account as soon as the colleague clicked the confirmation email.
- Dependencies upgraded past known advisories: Hono (static path middleware bypass),
  Kysely (SQL injection through JSON paths), and Google Auth to a release without the
  vulnerable `uuid`.

### Fixed

- HTTP commands created live retro sessions that were never released, and the last
  participant leaving could split a retro's command queue in two, letting concurrent votes
  exceed the limit. Commands are now serialised by the hub, apart from presence.
- Re-subscribing a socket to another retro left it present in the previous one.
- A refused timer action in a phase change wiped the votes anyway.
- A cluster left with one note, after a move, a delete or a regroup, is dissolved.
- An archived retro answers changes with `409`, and a rename cannot ride along a reopening.
- A new column could share the position of an existing one after a deletion.
- `carriedOverActions` no longer shows actions decided after the retro.
- Demoting a plain member no longer trips the last-administrator guard.
- An invitation whose email failed is removed instead of lingering as pending.
- First boot setup is one transaction.
- Accepting an invitation signs the new account in; an existing account signs in first.
- Signing out, or a session expiring, clears the cached data of the previous account.
- A failed Litestream restore stops the container instead of starting on an empty database.
- The production build left `~/` import aliases unresolved and shipped no migrations, so it
  could not start.
- `@hono/node-server` was a development dependency, missing from the production image.
- Taking shared notes back answered `404`: the note deletion route caught `/notes/reveal`.
- Accepting an invitation of another organisation added a second membership; it is refused.
- An organisation whose first admin invitation could not be sent is removed with its domain.
- The cloud ceilings on retros per month and on members are enforced.
- An HTTP response could roll a live board back over a newer one pushed by the websocket.
- Overlapping subscribes could leave a socket on the retro it asked for first.
- Editing an action goes through its retro's command queue, like every board mutation.
