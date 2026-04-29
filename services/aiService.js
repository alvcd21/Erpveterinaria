
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

async function callClaude(systemPrompt, userPrompt) {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return response.content[0].text;
}

function parseJson(text, fallback) {
  try {
    const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    const raw = match ? (match[1] || match[0]) : text;
    return JSON.parse(raw.trim());
  } catch {
    return fallback;
  }
}

async function diagnoseRepair(deviceDesc, issueDescription, repairHistory = []) {
  try {
    const systemPrompt =
      'Eres un asistente experto en técnica de teléfonos móviles para un taller de reparación en Honduras. Responde en español. Sé conciso y práctico.';

    const historyText = repairHistory.length > 0
      ? `\nHistorial de reparaciones similares:\n${repairHistory.map(r =>
          `- ${r.marca || ''} ${r.modelo || ''}: ${r.descripcion_falla || ''} — ${r.estado_reparacion || ''}`
        ).join('\n')}`
      : '';

    const userPrompt = `Diagnóstica el siguiente problema de reparación y responde ÚNICAMENTE con un objeto JSON válido sin bloques de código markdown.

Equipo: ${deviceDesc}
Problema reportado: ${issueDescription}${historyText}

Responde con este JSON exacto:
{
  "causasProbables": ["causa1", "causa2"],
  "partesNecesarias": ["parte1", "parte2"],
  "tiempoEstimado": "X horas/días",
  "precioSugerido": { "min": 0, "max": 0 },
  "observaciones": "texto"
}`;

    const text = await callClaude(systemPrompt, userPrompt);
    const result = parseJson(text, null);
    if (!result) {
      return {
        causasProbables: ['No se pudo analizar'],
        partesNecesarias: [],
        tiempoEstimado: 'Indeterminado',
        precioSugerido: { min: 0, max: 0 },
        observaciones: text,
      };
    }
    return result;
  } catch (err) {
    return { error: 'AI no disponible', details: err.message };
  }
}

async function analyzeClient(clientData) {
  try {
    const systemPrompt =
      'Eres un analista CRM experto para una tienda de teléfonos hondureña. Responde en español. Sé amigable y orientado a la acción.';

    const userPrompt = `Analiza este cliente y responde ÚNICAMENTE con un objeto JSON válido sin bloques de código markdown.

Cliente: ${clientData.nombre}
Total gastado: L ${clientData.totalGastado || 0}
Promedio por compra: L ${clientData.promedioCompra || 0}
Frecuencia: ${clientData.frecuencia || 'desconocida'}
Compras recientes: ${JSON.stringify(clientData.compras || [])}
Reparaciones: ${JSON.stringify(clientData.reparaciones || [])}

Responde con este JSON exacto:
{
  "resumen": "texto",
  "perfilCliente": "texto",
  "sugerenciaAccion": "texto",
  "valorEstimadoFuturo": "texto"
}`;

    const text = await callClaude(systemPrompt, userPrompt);
    const result = parseJson(text, null);
    if (!result) {
      return {
        resumen: text,
        perfilCliente: 'No determinado',
        sugerenciaAccion: 'Revisar manualmente',
        valorEstimadoFuturo: 'No determinado',
      };
    }
    return result;
  } catch (err) {
    return { error: 'AI no disponible', details: err.message };
  }
}

async function suggestPrice(deviceModel, purchasePrice, historicalSales = []) {
  try {
    const systemPrompt =
      'Eres un experto en pricing de teléfonos móviles para el mercado hondureño. Responde en español.';

    const salesText = historicalSales.length > 0
      ? historicalSales.map(s => `${s.modelo}: L${s.precioVenta} (${s.fecha})`).join(', ')
      : 'Sin historial disponible';

    const userPrompt = `Sugiere un precio de venta y responde ÚNICAMENTE con un objeto JSON válido sin bloques de código markdown.

Modelo: ${deviceModel}
Precio de compra: L ${purchasePrice}
Ventas históricas de modelos similares: ${salesText}

Responde con este JSON exacto:
{
  "precioSugerido": 0,
  "margenEsperado": 0,
  "justificacion": "texto",
  "rangoRecomendado": { "min": 0, "max": 0 }
}`;

    const text = await callClaude(systemPrompt, userPrompt);
    const result = parseJson(text, null);
    if (!result) {
      return {
        precioSugerido: purchasePrice * 1.25,
        margenEsperado: 25,
        justificacion: text,
        rangoRecomendado: { min: purchasePrice * 1.15, max: purchasePrice * 1.35 },
      };
    }
    return result;
  } catch (err) {
    return { error: 'AI no disponible', details: err.message };
  }
}

async function detectCashAnomaly(arqueoData, historicalArqueos = []) {
  try {
    const systemPrompt =
      'Eres un auditor financiero experto en detección de anomalías para tiendas minoristas hondureñas. Responde en español.';

    const userPrompt = `Analiza este arqueo de caja y detecta anomalías. Responde ÚNICAMENTE con un objeto JSON válido sin bloques de código markdown.

Arqueo actual:
- Fecha: ${arqueoData.fecha}
- Monto inicial: L ${arqueoData.montoInicial}
- Total ventas: L ${arqueoData.totalVentas}
- Total egresos: L ${arqueoData.totalEgresos}
- Ganancia: L ${arqueoData.ganancia}

Resumen histórico (últimos ${historicalArqueos.length} arqueos):
${historicalArqueos.slice(0, 5).map(a =>
  `- ${a.fecha}: ventas L${a.totalventas || a.totalVentas || 0}, ganancia L${a.ganancia || 0}`
).join('\n')}

Responde con este JSON exacto:
{
  "esAnomal": false,
  "nivelRiesgo": "bajo",
  "observaciones": "texto",
  "recomendacion": "texto"
}`;

    const text = await callClaude(systemPrompt, userPrompt);
    const result = parseJson(text, null);
    if (!result) {
      return {
        esAnomal: false,
        nivelRiesgo: 'bajo',
        observaciones: text,
        recomendacion: 'Revisar manualmente',
      };
    }
    return result;
  } catch (err) {
    return { error: 'AI no disponible', details: err.message };
  }
}

async function predictRechargeNeeds(red, historicalData = []) {
  try {
    const systemPrompt =
      'Eres un experto en gestión de saldos de recargas telefónicas en Honduras (Tigo y Claro). Responde en español.';

    const userPrompt = `Predice las necesidades de recarga y responde ÚNICAMENTE con un objeto JSON válido sin bloques de código markdown.

Red: ${red}
Datos de consumo diario (últimos ${historicalData.length} días):
${historicalData.map(d => `- ${d.fecha}: consumo L${d.consumo || 0}`).join('\n')}

Responde con este JSON exacto:
{
  "cantidadSugerida": 0,
  "justificacion": "texto",
  "diasAltoConsumo": ["lunes", "viernes"],
  "alertas": ["alerta1"]
}`;

    const text = await callClaude(systemPrompt, userPrompt);
    const result = parseJson(text, null);
    if (!result) {
      return {
        cantidadSugerida: 0,
        justificacion: text,
        diasAltoConsumo: [],
        alertas: [],
      };
    }
    return result;
  } catch (err) {
    return { error: 'AI no disponible', details: err.message };
  }
}

module.exports = { diagnoseRepair, analyzeClient, suggestPrice, detectCashAnomaly, predictRechargeNeeds };
