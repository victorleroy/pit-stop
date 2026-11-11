# ADR-003 — Profile: the SSO source of truth and avatar storage

**Status:** adopted.

## Context

Users want to correct the name they are shown under, which came from Google or from what they
typed when invited, and to have an avatar without a Google photo, or another one. Organisations
running Pit Stop may sign their people in through an identity provider that carries a name and
a photo. The two must coexist: a choice made in Pit Stop must survive the next sign-in, while an
untouched profile keeps following the provider.

Names and pictures are read by join everywhere (BEHAVIOUR.md section 2, "Nothing is
denormalized"), and one live retro holds its connections, with their names, in memory.

## Decisions

### D1 — The user's choice, then the provider, then initials; the displayed value in the row

`users.name` and `users.picture_url` stay the values every join reads. Two columns say where
they come from (`name_source in {sso, user}`, `avatar_source in {auto, upload, initials}`) and
two hold what the provider said last (`sso_name`, `sso_picture_url`). Every write recomputes the
displayed value in the same row, in the same transaction as the source.

Each sign-in records the provider's values, then applies them only where the user chose
nothing. The row is written before the session is issued, then read again, so the sign-in
response already carries the new values.

A single name field: splitting first and last names would not change the initials others see,
since every model of a person carries `name` only.

### D2 — Uploaded avatars are BLOBs in SQLite

In their own table, `user_avatars`, so that reading a user never loads the bytes. Litestream
replicates them with everything else, a replacement is atomic with the source change, and no
new dependency is introduced (ADR-002 D5). A file on the volume would not be backed up;
object storage would be a mandatory third-party account (ADR-002 O1). At 256 KB at most per
person, a thousand people weigh 256 MB in the worst case.

### D3 — A public image route, guarded by an unguessable id

An `<img>` carries no bearer token, and the session is not a cookie. `GET /api/avatars/{id}`
is therefore public; the id is random, new on every upload, and only reachable through the
models an organisation's members read. A new upload is a new URL, which is also what busts
caches: the response is cached as immutable.

### D4 — No decoding on the server

The browser crops and re-encodes to 256x256 WebP (JPEG where WebP cannot be produced), which
strips metadata. The service checks the size, recognises WebP and JPEG by their first bytes and
requires the declared type to match. It never decodes the image: no native image library, no
parser exposed to uploads. `nosniff` and a sandboxing CSP on the response bound what a crafted
file could do. Somebody calling the API directly can only leave metadata in their own picture.

### D5 — Live connections refresh their identity from the authorizer

Before every board it sends, a live retro already re-checks each connection's session. That
check now returns the identity, so a connection's name and avatar are updated there, and
presence is sent again when one changed. A profile write, or a sign-in that changed something,
broadcasts every live retro of the organisation again, each from its own queue. No new
websocket event is needed.

## Consequences

- A profile change shows on every board, archived ones included: names are joined, not copied.
- Organisation administrators can remove an uploaded avatar, never set one or rename anybody.
- A removed avatar can survive in SQLite free pages and in replicas for their retention
  (SECURITY.md); purging it belongs with account deletion.
- Rolling back to an earlier version is safe: the new columns are ignored and uploaded avatars
  fall back to initials.

## Alternatives rejected

- **Locking names to the provider for an organisation**: nobody asked; `name_source` allows it
  later.
- **Fetching images with the bearer token into `blob:` URLs**: every display becomes a
  request, and the browser cache is lost.
- **Server-side metadata stripping**: needs a decoder, which D4 avoids.
