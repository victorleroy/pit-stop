-- One short, signed answer per person to the retro's icebreaker question. A child of the retro
-- like notes and votes: no org_id, reached only through a retro already checked, and deleted
-- with it.
CREATE TABLE icebreaker_answers (
  retro_id   TEXT NOT NULL REFERENCES retros(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 140),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (retro_id, user_id)
);
