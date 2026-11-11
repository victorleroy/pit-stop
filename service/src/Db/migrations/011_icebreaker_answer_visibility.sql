-- Icebreaker answers become post-its that their author shares or hides, like a note: the
-- facilitator no longer reveals them all at once. A post-it is hidden until its author shares it.
-- retros.icebreaker_answers_revealed and retros.icebreaker_custom_text are left unused.
ALTER TABLE icebreaker_answers ADD COLUMN revealed INTEGER NOT NULL DEFAULT 0 CHECK (revealed IN (0, 1));

-- Answers the facilitator had already revealed stay readable.
UPDATE icebreaker_answers SET revealed = 1
WHERE retro_id IN (SELECT id FROM retros WHERE icebreaker_answers_revealed = 1);

-- A custom question is no longer read, and would make the CHECK refuse the bank question drawn
-- on entering ICEBREAKER.
UPDATE retros SET icebreaker_custom_text = NULL WHERE icebreaker_custom_text IS NOT NULL;
