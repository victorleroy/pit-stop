# Changelog

All notable changes are recorded here. Versions follow [semantic versioning](https://semver.org).

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
