-- A template can say whether its retros open with an icebreaker and with the action review.
-- NULL means it does not say: the defaults of the new retro dialog apply.
ALTER TABLE retro_templates ADD COLUMN icebreaker INTEGER CHECK (icebreaker IN (0, 1));
ALTER TABLE retro_templates ADD COLUMN action_review INTEGER CHECK (action_review IN (0, 1));
