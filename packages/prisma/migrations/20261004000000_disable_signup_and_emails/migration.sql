INSERT INTO
  "Feature" (slug, enabled, description, "type")
VALUES
  (
    'disable-signup',
    true,
    'Enable to prevent users from signing up',
    'OPERATIONAL'
  ),
  (
    'emails',
    true,
    'Enable to prevent any emails being send',
    'KILL_SWITCH'
  ) ON CONFLICT (slug) DO UPDATE SET "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP;
