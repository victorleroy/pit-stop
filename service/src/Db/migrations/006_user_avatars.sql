-- One uploaded avatar per user, in the database so Litestream backs it up with everything else.
CREATE TABLE user_avatars (
  id         TEXT PRIMARY KEY,                -- av_<uuid>, new on every upload: the URL busts caches
  user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL CHECK (mime IN ('image/webp', 'image/jpeg')),
  bytes      BLOB NOT NULL,
  size       INTEGER NOT NULL CHECK (size <= 262144),
  created_at TEXT NOT NULL
);
