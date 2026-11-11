-- migrate: foreign_keys=off
-- A retro now opens in a waiting room, then optionally an icebreaker and an action review.
-- SQLite cannot alter a CHECK, so retros is rebuilt once for every opening phase, with the
-- columns of the phases not shipped yet; foreign keys are off for this file only, or dropping
-- retros would cascade-delete every board (ADR 0005). Existing retros keep their phase.
CREATE TABLE retros_new (
  id                          TEXT PRIMARY KEY,
  org_id                      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id                     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title                       TEXT NOT NULL,
  phase                       TEXT NOT NULL DEFAULT 'LOBBY'
                              CHECK (phase IN ('LOBBY', 'ICEBREAKER', 'REVIEW', 'BRAINSTORM',
                                               'SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED')),
  created_by                  TEXT NOT NULL,
  facilitator_id              TEXT NOT NULL,
  max_votes                   INTEGER NOT NULL DEFAULT 5,
  timer_ends_at               TEXT,
  timer_remaining_ms          INTEGER,
  created_at                  TEXT NOT NULL,
  timer_total_ms              INTEGER,
  template_id                 TEXT,
  template_name               TEXT,
  default_timer_seconds       INTEGER,
  icebreaker_question_id      TEXT,
  icebreaker_custom_text      TEXT CHECK (icebreaker_custom_text IS NULL
                                          OR length(icebreaker_custom_text) BETWEEN 1 AND 200),
  icebreaker_asked_at         TEXT,
  icebreaker_answers_revealed INTEGER NOT NULL DEFAULT 0 CHECK (icebreaker_answers_revealed IN (0, 1)),
  action_review               INTEGER NOT NULL DEFAULT 1 CHECK (action_review IN (0, 1)),
  review_focus_action_id      TEXT REFERENCES actions(id) ON DELETE SET NULL,
  CHECK (icebreaker_question_id IS NULL OR icebreaker_custom_text IS NULL)
);

INSERT INTO retros_new (id, org_id, team_id, title, phase, created_by, facilitator_id, max_votes,
                        timer_ends_at, timer_remaining_ms, created_at, timer_total_ms,
                        template_id, template_name, default_timer_seconds)
SELECT id, org_id, team_id, title, phase, created_by, facilitator_id, max_votes,
       timer_ends_at, timer_remaining_ms, created_at, timer_total_ms,
       template_id, template_name, default_timer_seconds
FROM retros;

DROP TABLE retros;
ALTER TABLE retros_new RENAME TO retros;
CREATE INDEX retros_team ON retros(team_id, created_at DESC);
CREATE INDEX retros_org ON retros(org_id);
