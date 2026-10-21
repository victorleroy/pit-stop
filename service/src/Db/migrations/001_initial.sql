-- Pit Stop initial schema.
-- Multi-tenant from the start (ADR D5, D6): every tenant-scoped table carries org_id.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- identity

CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  picture_url       TEXT,
  email_verified_at TEXT,
  created_at        TEXT NOT NULL
);

-- One user, N ways to sign in (D4). Signing in with Google using an already
-- verified email attaches a credential instead of creating a second account.
CREATE TABLE credentials (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('google', 'password')),
  provider_id   TEXT,
  password_hash TEXT,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, kind)
);

CREATE UNIQUE INDEX credentials_provider ON credentials(kind, provider_id)
  WHERE provider_id IS NOT NULL;

-- Opaque, revocable sessions (D7). Only the hash is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX sessions_user ON sessions(user_id);

-- ------------------------------------------------------------ organizations

CREATE TABLE organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'demo'
             CHECK (status IN ('demo', 'active', 'suspended')),
  created_at TEXT NOT NULL
);

-- A domain grants auto-join only once verified (D5, D12).
CREATE TABLE org_domains (
  domain      TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  verified_at TEXT
);

CREATE INDEX org_domains_org ON org_domains(org_id);

-- Modelled many-to-many even though v1 enforces one org per user (D5).
CREATE TABLE org_members (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX org_members_user ON org_members(user_id);

-- Single use, expiring, revocable. Only the token hash is stored (D12).
CREATE TABLE invitations (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  token_hash  TEXT NOT NULL UNIQUE,
  invited_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX invitations_org ON invitations(org_id);
CREATE INDEX invitations_email ON invitations(email);

-- -------------------------------------------------------------------- teams

CREATE TABLE teams (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX teams_org ON teams(org_id);

-- No member_count column: it is derived with COUNT(*), so it cannot fall out of date.
CREATE TABLE memberships (
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_admin   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX memberships_user ON memberships(user_id);

-- ------------------------------------------------------------------- retros

CREATE TABLE retros (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id            TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  phase              TEXT NOT NULL DEFAULT 'BRAINSTORM'
                     CHECK (phase IN ('BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED')),
  created_by         TEXT NOT NULL,
  facilitator_id     TEXT NOT NULL,
  max_votes          INTEGER NOT NULL DEFAULT 5,
  timer_ends_at      TEXT,
  timer_remaining_ms INTEGER,
  created_at         TEXT NOT NULL
);

CREATE INDEX retros_team ON retros(team_id, created_at DESC);
CREATE INDEX retros_org ON retros(org_id);

CREATE TABLE columns (
  id       TEXT PRIMARY KEY,
  retro_id TEXT NOT NULL REFERENCES retros(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX columns_retro ON columns(retro_id, position);

CREATE TABLE clusters (
  id        TEXT PRIMARY KEY,
  retro_id  TEXT NOT NULL REFERENCES retros(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title     TEXT
);

CREATE INDEX clusters_retro ON clusters(retro_id);

-- author_name is NOT stored: it is joined from users (see BEHAVIOUR.md section 2).
CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  retro_id   TEXT NOT NULL REFERENCES retros(id) ON DELETE CASCADE,
  column_id  TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  cluster_id TEXT REFERENCES clusters(id) ON DELETE SET NULL,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  revealed   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX notes_retro ON notes(retro_id, created_at);
CREATE INDEX notes_cluster ON notes(cluster_id);

-- target_id is a note id or a cluster id: no foreign key, the check is in the domain.
CREATE TABLE votes (
  retro_id  TEXT NOT NULL REFERENCES retros(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  count     INTEGER NOT NULL,
  PRIMARY KEY (retro_id, user_id, target_id)
);

CREATE INDEX votes_target ON votes(retro_id, target_id);

-- ------------------------------------------------------------------ actions

-- Actions belong to the team, not the retro: they outlive the retro that produced them,
-- so deleting a retro nulls the link instead of cascading.
-- retro_title and assignee_name are NOT stored: both are joined, so a rename propagates.
-- The trade-off is that retro_title is absent once the originating retro is deleted.
CREATE TABLE actions (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  retro_id    TEXT REFERENCES retros(id) ON DELETE SET NULL,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'OPEN'
              CHECK (status IN ('OPEN', 'DONE', 'DROPPED')),
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX actions_team ON actions(team_id, created_at DESC);
CREATE INDEX actions_retro ON actions(retro_id);
