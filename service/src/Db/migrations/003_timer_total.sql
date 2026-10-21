-- The board shows how much of the round is left, which needs the round's length.
-- Without it the client can only count down, never draw a bar.
ALTER TABLE retros ADD COLUMN timer_total_ms INTEGER;
