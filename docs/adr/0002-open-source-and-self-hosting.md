# ADR-002 — Open source and the self-hosted edition

**Status:** adopted. Amends [ADR-001](0001-architecture.md) on D11 and D13.

## Context

Pit Stop is published as free software, with a procedure good enough for anybody to run it
on their own infrastructure. Self-hosting is the default way to use it.

### Constraints

| Ref. | Constraint |
|---|---|
| O1 | A stranger runs Pit Stop in under fifteen minutes, with Docker, **without opening any third-party account** |
| O2 | One codebase and one image: no fork between editions, no proprietary folder |
| O3 | No guarantee is weaker when self-hosted: isolation, anonymity, revocable sessions |
| O4 | Operable by one maintainer: the project creates no support obligation |

## Decisions

### D1 — AGPL-3.0, on all the code

One licence, one repository, nothing proprietary. A third party cannot operate Pit Stop as a
service without publishing its modifications.

### D2 — No CLA

Contributions are made under the AGPL, like the rest (*inbound = outbound*). Code contributed
by third parties can therefore never be relicensed; that is accepted.

### D3 — The edition is configuration, and self-hosted has no quotas

`EDITION` is read at startup:

| Value | Quotas |
|---|---|
| `self-hosted` — **default** | None. `suspended` stays closed |
| `cloud` | Those of `Plans.ts` |

`Plans.ts` stays the single place where quotas are resolved; it gains a first short-circuit
on the edition.

**Why default to the permissive edition, when ADR-001 D6 is fail-closed?** Because this
default opens no guarantee: a quota is never a security tier (ADR-001 D13). The worst case of
a misconfiguration is a hosted service that does not bill, and it has a single deployer whose
configuration sets `EDITION=cloud`. The opposite default would fail every new self-hoster,
silently, the day they hit a ceiling.

Like `PLATFORM_ADMIN_EMAILS`, the edition is configuration, never data.

### D4 — One image, one container, for every deployment

The service serves the built SPA next to the API (under `/api`) and the websockets (`/ws`).
One image is published to GHCR for each release and used **as is** by everyone. The
operator's deployment is the one the documentation describes, so every deploy exercises the
self-hosting procedure. One origin also removes any CORS or proxy configuration.

### D5 — Every external dependency is optional

| Dependency | Without it |
|---|---|
| Google OAuth | The Google button disappears; email and password suffice |
| Mail (SMTP or Resend) | Nothing is sent; links are logged at `info` |
| Litestream | The service runs on its volume; the README explains manual backups and says that without either, losing the disk loses everything |

Only `APP_URL` is required in production, because every link is built on it.

### D6 — First boot without email

Sign-up is invitation only, and on an empty instance there is nobody to invite. While no
organisation exists, the service prints a **one-time setup link** in its logs at startup. It
creates the organisation and its first administrator, and signs them in.

Reading the logs is what proves you operate the instance, exactly as deploying proves it for
`PLATFORM_ADMIN_EMAILS`. The token lives in memory only: a restart before setup prints a new
one, none survives the first account, and two racing submissions cannot both succeed.

This also fixes the bootstrap of the paddock: a platform admin needs an account like anybody
else, and the setup link is how the first one comes to exist.

**Invitation links are never shown in the interface.** Receiving the link is what proves the
invitee controls the address (ADR-001 D12). If the inviter could read it, they could accept
it themselves and create an account in somebody else's name — including the address of a
platform admin, which would grant the paddock. Without a mail transport, the link goes to the
logs, which only the operator reads.

### D7 — The scope of anonymity, said publicly

On a self-hosted instance, the operator is the company itself. The README says it plainly:
anonymity protects from other participants, organisation admins and the paddock; it does not
protect from whoever holds the SQLite file. It recommends that the instance be run by
somebody outside the management line of the teams using it.

### D8 — No support promise

Security reports go through GitHub private vulnerability reporting and come first. Issues
are best effort. Releases follow semver; migrations run at startup and only go forward, so an
upgrade is an image tag change.

## Consequences

**Positive.** The anonymity promise can be verified by anyone. There is a way in without a
credit card, with no free-tier machinery. The documented deployment is the real one.

**Negative.** Anybody may run a competing service on this code, provided they publish their
changes. A community, however small, expects answers; D8 bounds them.

## Alternatives rejected

- **MIT or Apache-2.0.** Anybody could run a hosted service on this code without giving
  anything back.
- **BSL, FSL or Elastic License.** Not open source licences in the OSI sense.
- **Open core with a proprietary folder.** Two products for one maintainer, and nothing in
  Pit Stop is worth reserving.
- **Showing invitation links to the inviter.** Convenient when an email lands in spam, but it
  breaks the proof of address that invitations rely on (D6).
- **Keeping cloud quotas when self-hosted.** Deliberately crippled free software shows after
  ten minutes of reading the code.
