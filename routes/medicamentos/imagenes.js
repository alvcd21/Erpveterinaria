'use strict';

const { pool, handleDbError } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');
const { uploadImage, deleteImage, getSignedImageUrl } = require('../../services/r2Storage');

const SIGNED_URL_TTL = Number(process.env.R2_SIGNED_URL_TTL_SECONDS || 3600);

function registerRoutes(router) {

    // GET /api/medicamentos/:id/imagenes
    // Devuelve la lista con signed_url para imágenes en R2 e imagen_base64 para las antiguas.
    router.get('/medicamentos/:id/imagenes', authenticateToken, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT id_imagen, id_medicamento, url_imagen, imagen_base64, r2_key, es_principal, descripcion, fecha_upload
                 FROM medicamento_imagenes WHERE id_medicamento = $1 AND tenant_id = $2 ORDER BY es_principal DESC`,
                [req.params.id, req.tenantId]
            );
            const rows = await Promise.all(r.rows.map(async (row) => {
                if (row.r2_key) {
                    const signed_url = await getSignedImageUrl(row.r2_key, SIGNED_URL_TTL).catch(() => null);
                    return { ...row, imagen_base64: null, signed_url };
                }
                return row;
            }));
            res.json(rows);
        } catch (e) { handleDbError(res, e); }
    });

    // GET /api/medicamentos/imagenes/:id/refresh-url
    // Genera una nueva URL firmada para una imagen R2 (por si expiró).
    router.get('/medicamentos/imagenes/:id/refresh-url', authenticateToken, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT r2_key FROM medicamento_imagenes WHERE id_imagen = $1 AND tenant_id = $2`,
                [req.params.id, req.tenantId]
            );
            if (r.rows.length === 0 || !r.rows[0].r2_key) {
                return res.status(404).json({ error: 'Imagen no encontrada o no está en R2' });
            }
            const signed_url = await getSignedImageUrl(r.rows[0].r2_key, SIGNED_URL_TTL);
            res.json({ signed_url, expires_in: SIGNED_URL_TTL });
        } catch (e) { handleDbError(res, e); }
    });

    // POST /api/medicamentos/:id/imagenes
    // Acepta imagen_base64 (data URL) y la sube a R2. Almacena solo la clave R2 en la BD.
    router.post('/medicamentos/:id/imagenes', authenticateToken, async (req, res) => {
        try {
            const { url_imagen, imagen_base64, es_principal, descripcion } = req.body;
            if (!url_imagen && !imagen_base64) {
                return res.status(400).json({ error: 'Se requiere url_imagen o imagen_base64' });
            }

            let r2_key = null;
            let storedBase64 = null;

            if (imagen_base64) {
                const mimeMatch = imagen_base64.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,/);
                if (!mimeMatch) {
                    return res.status(400).json({ error: 'La imagen debe ser JPEG, PNG, GIF o WebP' });
                }
                const mime = mimeMatch[1];
                const rawBase64 = imagen_base64.replace(/^data:[^;]+;base64,/, '');
                const sizeBytes = Math.ceil(rawBase64.length * 0.75);
                if (sizeBytes > 5 * 1024 * 1024) {
                    return res.status(400).json({ error: 'La imagen supera el límite de 5 MB' });
                }

                if (process.env.R2_ACCOUNT_ID) {
                    r2_key = await uploadImage({
                        base64: rawBase64,
                        mime,
                        tenantId: req.tenantId,
                        medicamentoId: req.params.id,
                        filename: descripcion || 'imagen.jpg',
                    });
                } else {
                    storedBase64 = imagen_base64;
                }
            }

            if (es_principal) {
                await pool.query(
                    `UPDATE medicamento_imagenes SET es_principal = FALSE WHERE id_medicamento = $1 AND tenant_id = $2`,
                    [req.params.id, req.tenantId]
                );
            }
            const r = await pool.query(
                `INSERT INTO medicamento_imagenes (id_medicamento, url_imagen, imagen_base64, r2_key, es_principal, descripcion, tenant_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_imagen`,
                [req.params.id, url_imagen || null, storedBase64, r2_key, es_principal || false, descripcion || null, req.tenantId]
            );

            let signed_url = null;
            if (r2_key) {
                signed_url = await getSignedImageUrl(r2_key, SIGNED_URL_TTL).catch(() => null);
            }
            res.status(201).json({ message: 'Imagen guardada', id_imagen: r.rows[0].id_imagen, signed_url });
        } catch (e) { handleDbError(res, e); }
    });

    // PATCH /api/medicamentos/imagenes/:id/set-principal
    router.patch('/medicamentos/imagenes/:id/set-principal', authenticateToken, async (req, res) => {
        try {
            const img = await pool.query(
                'SELECT id_medicamento FROM medicamento_imagenes WHERE id_imagen = $1 AND tenant_id = $2',
                [req.params.id, req.tenantId]
            );
            if (img.rows.length === 0) return res.status(404).json({ error: 'Imagen no encontrada' });
            const medId = img.rows[0].id_medicamento;
            await pool.query(
                'UPDATE medicamento_imagenes SET es_principal = FALSE WHERE id_medicamento = $1 AND tenant_id = $2',
                [medId, req.tenantId]
            );
            await pool.query(
                'UPDATE medicamento_imagenes SET es_principal = TRUE WHERE id_imagen = $1 AND tenant_id = $2',
                [req.params.id, req.tenantId]
            );
            res.json({ ok: true });
        } catch (e) { handleDbError(res, e); }
    });

    // DELETE /api/medicamentos/imagenes/:id
    router.delete('/medicamentos/imagenes/:id', authenticateToken, async (req, res) => {
        try {
            const r = await pool.query(
                `DELETE FROM medicamento_imagenes WHERE id_imagen = $1 AND tenant_id = $2 RETURNING r2_key`,
                [req.params.id, req.tenantId]
            );
            if (r.rows.length > 0 && r.rows[0].r2_key) {
                await deleteImage(r.rows[0].r2_key).catch(err =>
                    console.warn('[R2] No se pudo eliminar objeto:', r.rows[0].r2_key, err.message)
                );
            }
            res.json({ message: 'Imagen eliminada' });
        } catch (e) { handleDbError(res, e); }
    });

}

module.exports = { registerRoutes };
