# ADR-004 — Retro templates as snapshots

**Status:** adopted.

## Context

Teams asked to keep their own retro formats, and for the classic ones to be ready to use.
Until now the five formats offered lived in the web client as lists of column titles; the
service only knew `Start`, `Stop`, `Continue` as a default. A template now carries columns with
a one-line prompt each, a vote budget and a suggested timer, and a team can create, edit,
duplicate and delete its own.

The question that shapes everything else: what happens to the retros already created when a
template changes or disappears?

## Decisions

### D1 — A retro copies its template and never reads it again

At creation, in the same transaction as the retro, the columns and their prompts are copied
into `columns`, and `retros` keeps `template_id`, `template_name` and `default_timer_seconds`.
The board never joins the template. Editing or deleting a template therefore cannot rewrite a
past retro, and there is no version table: the copy is the version. The name is copied rather
than joined for the same reason. This is the one deliberate exception to "nothing is
denormalized" (BEHAVIOUR.md section 2): it is history, not a cache.

### D2 — Built-in templates live in code

The classics are a constant (`service/src/Template/builtinTemplates.ts`), referenced as
`builtin:<slug>`, versioned with the application, neither seeded nor editable. Improving a
text ships with a release and touches no database; a team that wants another wording
duplicates the classic.

### D3 — One persisted scope, the team

`retro_templates.team_id` is `NOT NULL`. A team's templates are read by its members and
written by its admins; an org admin who has not joined the team reads nothing, like for its
boards. Duplicating from another team requires being a member of it, and any other source
answers `404`, so the existence of a template is not disclosed outside its team.
Organization-wide templates are postponed: they would come with their own migration.

### D4 — Template references carry no foreign key

`teams.default_template_id` and `retros.template_id` hold either `builtin:<slug>` or a UUID, so
neither can reference `retro_templates`. The application keeps them right: deleting a template
clears the team default in the same transaction, and the effective default falls back to
`builtin:start-stop-continue` whenever the stored one no longer resolves. `retros.template_id`
is never followed.

### D5 — Last write wins

No optimistic lock and no history. Two admins editing the same template at the same moment is
unlikely at the size of a team, the snapshot already protects past retros, and `updatedAt` /
`updatedBy` show whose version is on screen.

### D6 — Any rebuild of `retros` keeps the snapshot

SQLite cannot alter a `CHECK`, so a future change of the phase enumeration rebuilds `retros`.
That migration must copy `template_id`, `template_name` and `default_timer_seconds`, and its
test checks it. Migrations are remembered by file name: a migration already applied somewhere
is never renamed, or its `ADD COLUMN` would run twice and stop the service at boot.

## Consequences

- `retros.template_name` can differ from the current name of the template: that is the point.
- A retro created from explicit columns, or before this change, has no template and no
  prompts.
- 50 templates per team at most, a guard against abuse rather than a plan limit.
