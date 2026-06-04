-- Fixes global ai_process_settings rows where provider='gemini' was seeded by
-- an earlier migration but the application default is openai/anthropic.
-- Only touches global rows (tenant_id IS NULL) that still have the migration-seeded
-- value — never overwrites tenant-specific or admin-modified rows.
-- Safe to run multiple times (updated_by guard).

UPDATE ai_process_settings
SET
    provider   = COALESCE(NULLIF(current_setting('app.ai_default_provider', true), ''), 'openai'),
    model      = COALESCE(NULLIF(current_setting('app.ai_default_model',    true), ''), 'gpt-4o-mini'),
    updated_by = 'migration_008',
    updated_at = NOW()
WHERE
    tenant_id IS NULL
    AND provider = 'gemini'
    AND (updated_by IS NULL OR updated_by NOT IN ('admin', 'migration_008'));
