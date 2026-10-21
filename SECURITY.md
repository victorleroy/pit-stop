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

## Scope

In scope: anything in this repository, including the Docker image.

Out of scope: reading the database file with access to the host. Anonymity protects notes
from participants, administrators and the paddock, not from whoever holds the SQLite file.
The README says so, and so does the architecture record.
