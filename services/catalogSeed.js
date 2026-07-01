'use strict';

// Catálogos base de inventario clínico que se siembran por clínica (tenant).
// Se usan al crear una clínica nueva (onboarding). Los tenants ya existentes se
// siembran vía scripts/migrations/026_seed_catalogos_inventario.sql — mantener
// AMBAS listas sincronizadas.

// [nombre, unidad_base] — unidad_base es NOT NULL en formas_farmaceuticas.
const DEFAULT_FORMAS = [
    ['Tableta', 'tableta'],
    ['Comprimido', 'comprimido'],
    ['Cápsula', 'cápsula'],
    ['Jarabe', 'ml'],
    ['Suspensión', 'ml'],
    ['Solución inyectable', 'ml'],
    ['Gotas', 'ml'],
    ['Crema', 'g'],
    ['Ungüento', 'g'],
    ['Gel', 'g'],
    ['Polvo', 'g'],
    ['Spray', 'ml'],
    ['Pipeta', 'pipeta'],
    ['Shampoo', 'ml'],
    ['Collar', 'unidad'],
];

const DEFAULT_CATEGORIAS = [
    'Antibióticos',
    'Antiinflamatorios (AINEs)',
    'Analgésicos',
    'Antiparasitarios internos',
    'Antiparasitarios externos',
    'Antifúngicos',
    'Antihistamínicos',
    'Corticosteroides',
    'Vitaminas y suplementos',
    'Vacunas',
    'Anestésicos y sedantes',
    'Dermatológicos',
    'Oftálmicos',
    'Óticos',
    'Gastrointestinales',
    'Cardiológicos',
    'Hormonales',
    'Fluidoterapia',
    'Otros',
];

/**
 * Siembra las formas farmacéuticas y categorías terapéuticas por defecto para un
 * tenant. Idempotente (ON CONFLICT sobre el índice único (tenant_id, nombre)).
 * @param {import('pg').PoolClient} client - cliente dentro de la transacción de onboarding
 * @param {string} tenantId
 */
async function seedCatalogosForTenant(client, tenantId) {
    for (const [nombre, unidad] of DEFAULT_FORMAS) {
        await client.query(
            `INSERT INTO formas_farmaceuticas (nombre, unidad_base, tenant_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (tenant_id, nombre) DO NOTHING`,
            [nombre, unidad, tenantId]
        );
    }
    for (const nombre of DEFAULT_CATEGORIAS) {
        await client.query(
            `INSERT INTO categorias_terapeuticas (nombre, tenant_id)
             VALUES ($1, $2)
             ON CONFLICT (tenant_id, nombre) DO NOTHING`,
            [nombre, tenantId]
        );
    }
}

module.exports = { DEFAULT_FORMAS, DEFAULT_CATEGORIAS, seedCatalogosForTenant };
