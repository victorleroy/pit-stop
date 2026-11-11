# Security policy

Pit Stop's central promise is that a note stays anonymous until its author reveals it. A flaw
that breaks that promise, or tenant isolation between organisations, is treated before
anything else.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting**: the *Security* tab of the repository, then
*Report a vulnerability*. Please do not open a public issue.

Include the version, what an attacker can obtain, and the steps to reproduce. You will get an
acknowledgement, and the fix ships in a release with a security advisory that credits you
unless you prefer otherwise.

## Supported versions

Only the latest release receives fixes. Upgrading is a restart: see the README.

## Uploaded avatars

- `GET /api/avatars/{id}` is public: an `<img>` carries no bearer token, and the session lives
  in `localStorage`, not in a cookie. What protects an avatar is its id, `av_` plus a random
  UUID v4 (122 bits), new on every upload and only known to the members of the organisation
  through the models they read. Google photos shown today are public URLs already.
- Only WebP and JPEG are stored, recognised from their first bytes and matching the declared
  type; no SVG, nothing that can carry a script. Responses carry `X-Content-Type-Options:
  nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`.
- The service never decodes an image nor reads its metadata. The web client re-encodes every
  upload through a canvas, which drops EXIF and XMP, location included; somebody calling the
  API directly can only expose metadata of their own picture.
- **Retention.** A removed or replaced avatar is deleted from its table at once, but its bytes
  may remain in the free pages of the SQLite file until the next `VACUUM` (`secure_delete` is
  off), and in Litestream replicas for their retention (720 hours with `deploy/litestream.yml`).
  A restore from a replica can bring a deleted avatar back. Purging both belongs with account
  deletion, which does not exist yet.

## Scope

In scope: anything in this repository, including the Docker image.

Out of scope: reading the database file with access to the host. Anonymity protects notes
from participants, administrators and the paddock, not from whoever holds the SQLite file.
The README says so, and so does the architecture record.
