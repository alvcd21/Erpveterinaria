-- Agrega columna r2_key a medicamento_imagenes para almacenar la clave del objeto
-- en Cloudflare R2. La columna imagen_base64 se preserva para compatibilidad con
-- imagenes existentes hasta que sea migrada y eliminada.
ALTER TABLE medicamento_imagenes
    ADD COLUMN IF NOT EXISTS r2_key VARCHAR(512);

-- Indice para buscar/limpiar rapido por clave R2
CREATE INDEX IF NOT EXISTS idx_med_imagenes_r2_key
    ON medicamento_imagenes(r2_key)
    WHERE r2_key IS NOT NULL;
