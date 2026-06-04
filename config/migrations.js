const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../scripts/migrations');
const MIGRATION_LOCK_KEY = 'smartcloud:schema_migrations';

/**
 * Applies all pending SQL migrations from scripts/migrations/ in alphabetical order.
 * Tracks applied versions in schema_migrations.
 */
async function runMigrations(pool) {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.log('[migrations] Directory not found, skipping.');
        return;
    }

    const client = await pool.connect();
    let lockAcquired = false;
    try {
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
        lockAcquired = true;
        await applyPendingMigrations(client);
    } finally {
        try {
            if (lockAcquired) {
                await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY]);
            }
        } finally {
            client.release();
        }
    }
}

async function applyPendingMigrations(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    VARCHAR(100) PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    if (files.length === 0) {
        console.log('[migrations] No migration files found.');
        return;
    }

    const { rows: applied } = await client.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(applied.map(r => r.version));

    for (const file of files) {
        const version = path.basename(file, '.sql');
        if (appliedSet.has(version)) continue;

        console.log(`[migrations] Applying: ${file}`);
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        // Split on semicolons to avoid pg DeprecationWarning when a file has
        // multiple statements — pg.query() must receive one statement at a time.
        const statements = sql
            .split(';')
            .map(s => s.replace(/--[^\n]*/g, '').trim())
            .filter(s => s.length > 0);
        for (const stmt of statements) {
            await client.query(stmt);
        }
        await client.query(
            'INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING',
            [version]
        );
        console.log(`[migrations] Applied:  ${file}`);
        appliedSet.add(version);
    }

    console.log('[migrations] All migrations up to date.');
}

module.exports = { runMigrations };
