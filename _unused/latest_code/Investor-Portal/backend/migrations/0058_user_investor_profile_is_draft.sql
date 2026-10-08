-- Incomplete add-profile wizard rows (debounced autosave), cleared on final Save.
ALTER TABLE user_investor_profiles
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_investor_profiles.is_draft IS
  'True while the add-profile wizard is in progress (autosave); false after explicit Save.';
