-- Records when an action was closed and which retro reviewed it, so a team can see whether
-- its retros lead anywhere (done since last retro, completion trend). Actions closed before
-- this migration keep a NULL closed_at: an invented date would skew "done since last retro".
ALTER TABLE actions ADD COLUMN closed_at TEXT;

CREATE TABLE action_reviews (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  action_id   TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  retro_id    TEXT NOT NULL REFERENCES retros(id) ON DELETE CASCADE,
  outcome     TEXT NOT NULL CHECK (outcome IN ('DONE', 'DROPPED', 'KEPT')),
  comment     TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT NOT NULL,
  UNIQUE (action_id, retro_id)
);
CREATE INDEX action_reviews_retro ON action_reviews(retro_id);
CREATE INDEX action_reviews_team ON action_reviews(team_id, reviewed_at);
CREATE INDEX actions_closed ON actions(team_id, closed_at);
