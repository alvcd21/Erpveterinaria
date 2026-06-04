-- Seeds ai_process_settings for the four additional AI processes.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
INSERT INTO ai_process_settings (process_key, provider, model, enabled, temperature, max_tokens, tenant_id, updated_by, updated_at)
VALUES
    ('drug_interactions',   COALESCE(NULLIF(current_setting('app.ai_default_provider', true),''),'openai'), COALESCE(NULLIF(current_setting('app.ai_default_model', true),''),'gpt-4o-mini'), TRUE, 0.10, 900, NULL, 'migration', NOW()),
    ('client_analysis',     COALESCE(NULLIF(current_setting('app.ai_default_provider', true),''),'openai'), COALESCE(NULLIF(current_setting('app.ai_default_model', true),''),'gpt-4o-mini'), TRUE, 0.30, 900, NULL, 'migration', NOW()),
    ('cash_anomaly',        COALESCE(NULLIF(current_setting('app.ai_default_provider', true),''),'openai'), COALESCE(NULLIF(current_setting('app.ai_default_model', true),''),'gpt-4o-mini'), TRUE, 0.10, 600, NULL, 'migration', NOW()),
    ('restock_prediction',  COALESCE(NULLIF(current_setting('app.ai_default_provider', true),''),'openai'), COALESCE(NULLIF(current_setting('app.ai_default_model', true),''),'gpt-4o-mini'), TRUE, 0.20, 700, NULL, 'migration', NOW())
ON CONFLICT DO NOTHING;
