-- Configuracion inicial para el proceso IA de recomendacion por sintomas.
INSERT INTO ai_process_settings
    (process_key, provider, model, enabled, temperature, max_tokens, tenant_id, updated_by, updated_at)
VALUES (
    'symptom_recommendation',
    COALESCE(NULLIF(current_setting('app.ai_default_symptom_provider', true), ''), NULLIF(current_setting('app.ai_default_provider', true), ''), 'openai'),
    COALESCE(NULLIF(current_setting('app.ai_default_symptom_model', true), ''), NULLIF(current_setting('app.ai_default_model', true), ''), 'gpt-4o-mini'),
    TRUE,
    0.2,
    1600,
    NULL,
    'migration',
    NOW()
)
ON CONFLICT DO NOTHING;
