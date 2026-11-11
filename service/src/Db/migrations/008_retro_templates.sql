-- Teams keep their own retro formats. A retro copies its template when it is created and
-- never reads it again: editing or deleting a template must not rewrite history.
-- Built-in templates live in code (builtin:<slug>) and never in this table.

CREATE TABLE retro_templates (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  name_key      TEXT NOT NULL,               -- lower(trim(name)): one name per team, any case
  description   TEXT,
  max_votes     INTEGER CHECK (max_votes IS NULL OR max_votes BETWEEN 1 AND 10),
  timer_seconds INTEGER CHECK (timer_seconds IS NULL OR timer_seconds BETWEEN 5 AND 3600),
  created_by    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX retro_templates_team_name ON retro_templates(team_id, name_key);
CREATE INDEX retro_templates_org ON retro_templates(org_id);

-- Child table, no org_id: only reached through a template whose access was checked.
CREATE TABLE retro_template_columns (
  template_id TEXT NOT NULL REFERENCES retro_templates(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  title       TEXT NOT NULL,
  prompt      TEXT,
  PRIMARY KEY (template_id, position)
);

-- No FK: a default may be builtin:*. Deleting a template clears it in the same transaction.
ALTER TABLE teams ADD COLUMN default_template_id TEXT;

-- Snapshot of the template a retro was created from. The name is copied, not joined,
-- because the template may be renamed or deleted later. Any rebuild of retros copies them.
ALTER TABLE retros ADD COLUMN template_id TEXT;
ALTER TABLE retros ADD COLUMN template_name TEXT;
ALTER TABLE retros ADD COLUMN default_timer_seconds INTEGER;

ALTER TABLE columns ADD COLUMN prompt TEXT;
