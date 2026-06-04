'use strict';

/**
 * Script de migración one-shot: mueve todas las imágenes base64 de la BD a Cloudflare R2.
 * Uso:
 *   node scripts/migrate_images_to_r2.js
 *
 * Requiere en .env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 * Requiere en .env: DATABASE_URL o las variables individuales de conexión a PG.
 */

require('dotenv').config();

const { Pool } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});
const BUCKET = process.env.R2_BUCKET_NAME;

function mimeFromBase64(dataUrl) {
    const m = String(dataUrl).match(/^data:(image\/[a-z]+);base64,/);
    return m ? m[1] : 'image/jpeg';
}

function extFromMime(mime) {
    const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    return map[mime] || 'jpg';
}

async function main() {
    console.log('[migrate] Buscando imágenes base64 en la BD...');
    const { rows } = await pool.query(
        `SELECT id_imagen, id_medicamento, imagen_base64, tenant_id
         FROM medicamento_imagenes
         WHERE imagen_base64 IS NOT NULL AND r2_key IS NULL
         ORDER BY id_imagen`
    );
    console.log(`[migrate] ${rows.length} imágenes a migrar.`);

    let ok = 0, err = 0;
    for (const row of rows) {
        try {
            const mime = mimeFromBase64(row.imagen_base64);
            const ext = extFromMime(mime);
            const rawBase64 = row.imagen_base64.replace(/^data:[^;]+;base64,/, '');
            const buffer = Buffer.from(rawBase64, 'base64');
            const key = `medicamentos/${row.tenant_id}/${row.id_medicamento}/${row.id_imagen}.${ext}`;

            await client.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: mime,
                CacheControl: 'public, max-age=31536000',
            }));

            await pool.query(
                `UPDATE medicamento_imagenes SET r2_key = $1, imagen_base64 = NULL WHERE id_imagen = $2`,
                [key, row.id_imagen]
            );
            ok++;
            if (ok % 10 === 0) console.log(`[migrate] ${ok}/${rows.length} completadas...`);
        } catch (e) {
            console.error(`[migrate] ERROR imagen ${row.id_imagen}:`, e.message);
            err++;
        }
    }

    console.log(`[migrate] Finalizado. OK: ${ok} | Errores: ${err}`);
    await pool.end();
}

main().catch(e => { console.error('[migrate] FATAL:', e); process.exit(1); });
