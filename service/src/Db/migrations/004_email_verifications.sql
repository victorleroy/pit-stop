-- Registering by a verified domain proves nothing about the mailbox until this link is used.
CREATE TABLE email_verifications (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX email_verifications_user ON email_verifications(user_id);
