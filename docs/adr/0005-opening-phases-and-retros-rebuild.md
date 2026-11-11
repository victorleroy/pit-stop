# ADR-005 — Opening phases and the one rebuild of `retros`

**Status:** adopted.

## Context

A retro is getting steps before the board: a waiting room, then an optional icebreaker and an
optional review of the team's open actions. Each was specified separately, and each rebuilt
`retros` on its own, because SQLite cannot alter the `CHECK` on `phase`.

A rebuild is the riskiest migration this project can run. `migrate.ts` opened its connection
with better-sqlite3's default, `foreign_keys = 1`, and `PRAGMA foreign_keys` has no effect
inside a transaction: `DROP TABLE retros` would have cascade-deleted every column, note,
cluster and vote, and nulled `actions.retro_id`.

## Decisions

### D1 — Phases, not states beside the machine

`LOBBY`, `ICEBREAKER` and `REVIEW` are values of `retros.phase`. Every phase list of the
managers already refuses writes outside `BRAINSTORM`, so the waiting room needs no extra
guard; the stepper, the hints and the per-phase tests apply as they are. A `started_at` flag
would have avoided the rebuild but put a "not started" check in every manager.

### D2 — The only constrained transition is back to `LOBBY`

`LOBBY` means "not started yet", which stops being true the moment it is left. `X → LOBBY`
answers `409`, archived included; `LOBBY → LOBBY` is a no-op. Every other transition stays
free (BEHAVIOUR.md section 3), and the order of the guards in `RetroManager.updateRetro` is
fixed there.

### D3 — One rebuild, carrying every opening phase

The rebuild adds all eight phases to the `CHECK` and every column of the opening phases
(`icebreaker_*`, `action_review`, `review_focus_action_id`), even for phases not shipped yet.
An unused `CHECK` value or a null column costs nothing; a second rebuild would be a second
risky operation. `RETRO_PHASES`, which the API validates against, gains each phase only with
the feature that handles it. The columns are listed explicitly, the indexes recreated, and the
rebuild copies every column present at the time it is merged, the templates' included.

### D4 — A per-file directive in `migrate.ts`

A migration whose first line is `-- migrate: foreign_keys=off`:

1. is preceded by `VACUUM INTO '<database>.bak-<migration>'`, outside any transaction (a
   consistent copy under WAL), skipped on a database with no migration applied yet;
2. runs with `foreign_keys = OFF`, set outside the transaction;
3. runs `PRAGMA foreign_key_check` **inside** the transaction, before the commit: one orphan
   rolls the migration back and the boot fails;
4. turns the keys back on in a `finally`.

Every other migration keeps running with the keys on. Turning them off globally would let an
ordinary migration break an invariant silently.

### D5 — No downgrade

An older binary does not know `LOBBY`. Going back means restoring the `.bak-` copy taken
before the rebuild; the release note says so.

### D6 — Persisted review focus

The review's focus is a column (`review_focus_action_id`), not live state in `RetroSession`:
the facilitator's place in the review survives a restart and a reconnection, and is projected
in `board.updated` like the rest of the board.

## Consequences

- Retros created before the rebuild keep their phase and never see a waiting room.
- Tests that need a started retro create it with `Harness.createStartedRetro`.
- Rebuilding a table again takes the same directive; the migration test pins the procedure.
