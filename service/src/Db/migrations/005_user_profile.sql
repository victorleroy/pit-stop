-- Profile editing: a user-chosen name and avatar must survive the next SSO sign-in, while an
-- untouched SSO profile keeps following the identity provider. users.name and picture_url stay
-- the values every join reads; the columns below say where they come from.

ALTER TABLE users ADD COLUMN name_source TEXT NOT NULL DEFAULT 'user'
  CHECK (name_source IN ('sso', 'user'));
ALTER TABLE users ADD COLUMN sso_name TEXT;
ALTER TABLE users ADD COLUMN sso_picture_url TEXT;
ALTER TABLE users ADD COLUMN avatar_source TEXT NOT NULL DEFAULT 'auto'
  CHECK (avatar_source IN ('auto', 'upload', 'initials', 'preset'));

-- Every picture stored so far came from Google sign-in.
UPDATE users SET sso_picture_url = picture_url WHERE picture_url IS NOT NULL;

-- A name came from Google when the account signs in with Google and never chose a password.
-- Google accounts that later set a password are marked 'user' and stop following Google:
-- accepted, they can use "Use my Google name".
UPDATE users SET name_source = 'sso'
WHERE EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = users.id AND c.kind = 'google')
  AND NOT EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = users.id AND c.kind = 'password');
