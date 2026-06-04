'use strict';

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../../config/db');
const { recordAIUsage } = require('../../middleware/aiQuota');

const PROCESS_MEDICATION_INTAKE      = 'medication_intake';
const PROCESS_SYMPTOM_RECOMMENDATION = 'symptom_recommendation';
const PROCESS_INTERACTIONS           = 'drug_interactions';
const PROCESS_CLIENT_ANALYSIS        = 'client_analysis';
const PROCESS_CASH_ANOMALY           = 'cash_anomaly';
const PROCESS_RESTOCK_PREDICTION     = 'restock_prediction';

const DEFAULTS = {
    openai: {
        model: process.env.AI_DEFAULT_MEDICATION_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 1800,
    },
    anthropic: {
        model: process.env.AI_DEFAULT_MEDICATION_MODEL || 'claude-3-5-sonnet-latest',
        temperature: 0.2,
        max_tokens: 1800,
    },
    gemini: {
        model: process.env.AI_DEFAULT_MEDICATION_MODEL || 'gemini-1.5-pro',
        temperature: 0.2,
        max_tokens: 1800,
    },
};

let openaiClient = null;
let anthropicClient = null;

function getOpenAI() {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no esta configurada');
    if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openaiClient;
}

function getAnthropic() {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no esta configurada');
    if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropicClient;
}

async function getProcessSettings(processKey, tenantId = null) {
    const _rawProvider = processKey === PROCESS_SYMPTOM_RECOMMENDATION
        ? (process.env.AI_DEFAULT_SYMPTOM_PROVIDER || process.env.AI_DEFAULT_MEDICATION_PROVIDER)
        : process.env.AI_DEFAULT_MEDICATION_PROVIDER;
    const defaultProvider = (_rawProvider || 'openai').toLowerCase();
    const provider = ['openai', 'anthropic', 'gemini'].includes(defaultProvider) ? defaultProvider : 'openai';
    const defaultModel = processKey === PROCESS_SYMPTOM_RECOMMENDATION
        ? process.env.AI_DEFAULT_SYMPTOM_MODEL || process.env.AI_DEFAULT_MEDICATION_MODEL
        : process.env.AI_DEFAULT_MEDICATION_MODEL;
    const fallback = {
        process_key: processKey,
        provider,
        ...DEFAULTS[provider],
        model: defaultModel || DEFAULTS[provider].model,
        enabled: true,
    };

    try {
        const { rows } = await pool.query(`
            SELECT process_key, provider, model, enabled, temperature, max_tokens, tenant_id
            FROM ai_process_settings
            WHERE process_key = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
            ORDER BY tenant_id NULLS LAST
            LIMIT 1
        `, [processKey, tenantId]);

        const row = rows[0];
        if (!row) return fallback;
        return {
            process_key: row.process_key,
            provider: row.provider,
            model: row.model || DEFAULTS[row.provider]?.model || fallback.model,
            enabled: row.enabled !== false,
            temperature: Number(row.temperature ?? DEFAULTS[row.provider]?.temperature ?? fallback.temperature),
            max_tokens: Number(row.max_tokens ?? DEFAULTS[row.provider]?.max_tokens ?? fallback.max_tokens),
        };
    } catch (err) {
        if (err.code === '42P01') return fallback;
        throw err;
    }
}

function imageToOpenAIContent(image) {
    return {
        type: 'image_url',
        image_url: {
            url: `data:${image.mime};base64,${image.base64}`,
            // 'low' forces a 512×512 rescale (~2833 tokens flat) instead of per-tile
            // billing that can exceed 60k tokens for a single phone photo.
            detail: process.env.AI_IMAGE_DETAIL || 'low',
        },
    };
}

function imageToAnthropicContent(image) {
    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type: image.mime,
            data: image.base64,
        },
    };
}

function imageToGeminiPart(image) {
    return {
        inline_data: {
            mime_type: image.mime,
            data: image.base64,
        },
    };
}

async function callOpenAI({ settings, systemPrompt, userPrompt, images = [] }) {
    const client = getOpenAI();
    const response = await client.chat.completions.create({
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: [
                    { type: 'text', text: userPrompt },
                    ...images.map(imageToOpenAIContent),
                ],
            },
        ],
    });
    return {
        text: response.choices?.[0]?.message?.content || '{}',
        usage: response.usage || null,
    };
}

async function callAnthropic({ settings, systemPrompt, userPrompt, images = [] }) {
    const client = getAnthropic();
    const response = await client.messages.create({
        model: settings.model,
        max_tokens: settings.max_tokens,
        temperature: settings.temperature,
        system: systemPrompt,
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: userPrompt },
                ...images.map(imageToAnthropicContent),
            ],
        }],
    });
    const text = (response.content || [])
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n');
    return { text: text || '{}', usage: response.usage || null };
}

async function callGemini({ settings, systemPrompt, userPrompt, images = [] }) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no esta configurada');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                temperature: settings.temperature,
                maxOutputTokens: settings.max_tokens,
                responseMimeType: 'application/json',
            },
            contents: [{
                role: 'user',
                parts: [{ text: userPrompt }, ...images.map(imageToGeminiPart)],
            }],
        }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(json?.error?.message || `Gemini error ${response.status}`);
    }
    const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '{}';
    return { text, usage: json?.usageMetadata || null };
}

async function callProvider({ settings, systemPrompt, userPrompt, images = [], tenantId = null }) {
    if (!settings.enabled) throw new Error(`Proceso de IA deshabilitado: ${settings.process_key}`);
    let result;
    if (settings.provider === 'openai') result = await callOpenAI({ settings, systemPrompt, userPrompt, images });
    else if (settings.provider === 'anthropic') result = await callAnthropic({ settings, systemPrompt, userPrompt, images });
    else if (settings.provider === 'gemini') result = await callGemini({ settings, systemPrompt, userPrompt, images });
    else throw new Error(`Proveedor de IA no soportado: ${settings.provider}`);

    if (tenantId && result.usage) {
        recordAIUsage(tenantId, result.usage, settings.process_key).catch(err =>
            console.error('[providerRegistry] Error registrando uso IA:', err.message)
        );
    }
    return result;
}

module.exports = {
    PROCESS_MEDICATION_INTAKE,
    PROCESS_SYMPTOM_RECOMMENDATION,
    PROCESS_INTERACTIONS,
    PROCESS_CLIENT_ANALYSIS,
    PROCESS_CASH_ANOMALY,
    PROCESS_RESTOCK_PREDICTION,
    getProcessSettings,
    callProvider,
};
