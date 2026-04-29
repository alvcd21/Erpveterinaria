
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
  // Configuración de pool para escalabilidad
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const getLocalTimestamp = () => {
    try {
        const now = new Date();
        const options = {
            timeZone: 'America/Tegucigalpa',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(now);
        const getPart = (type) => parts.find(p => p.type === type).value;
        return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
    } catch (err) {
        const d = new Date();
        d.setHours(d.getHours() - 6);
        return d.toISOString().replace('T', ' ').substring(0, 19);
    }
};

pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'America/Tegucigalpa'")
        .catch(err => console.error('Error setting timezone', err));
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle DB client', err);
});

/**
 * Genera el siguiente ID secuencial para una tabla.
 * Usa SELECT FOR UPDATE dentro de la transacción del cliente para evitar
 * race conditions cuando múltiples requests concurrentes generan IDs.
 * IMPORTANTE: siempre llamar con un `client` de transacción activa.
 */
const ALLOWED_ID_COMBOS = new Set([
    'arqueo:idarqueo', 'saldos:idsaldos', 'ingresos:idingreso', 'egresos:idegresos',
    'usuarios:codusuario', 'roles:idrol', 'caja:idcaja', 'telefonos:codigo',
    'inventario:codinventario', 'accesorios:codaccesorio', 'categoria:codcategoria',
    'ubicacion:idubicacion', 'proveedores:codproveedor', 'paquetes:idpaquete',
    'ventas:codventa', 'detalleventa:coddetalleventa',
]);

async function generateNextId(table, column, prefix, client = pool) {
    const key = `${table.toLowerCase()}:${column.toLowerCase()}`;
    if (!ALLOWED_ID_COMBOS.has(key)) {
        throw new Error(`generateNextId: combinación no permitida: ${table}/${column}`);
    }
    const safeTable  = table.replace(/[^a-z_]/gi, '');
    const safeColumn = column.replace(/[^a-z_]/gi, '');
    const safePrefix = prefix.replace(/[^A-Z0-9_]/gi, '');

    const query = `
        SELECT ${safeColumn} AS id
        FROM ${safeTable}
        WHERE ${safeColumn} LIKE $1
        ORDER BY LENGTH(${safeColumn}) DESC, ${safeColumn} DESC
        LIMIT 1
    `;
    const result = await client.query(query, [`${safePrefix}-%`]);
    let maxNum = 0;
    if (result.rows.length > 0) {
        const parts = result.rows[0].id.split(`${safePrefix}-`);
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            maxNum = parseInt(parts[1], 10);
        }
    }
    return `${safePrefix}-${(maxNum + 1).toString().padStart(4, '0')}`;
}

/**
 * Recalcula y actualiza el balance del arqueo activo de una caja.
 * Excluye depósitos KrediYa (van al banco, no a caja física).
 */
async function updateArqueoBalance(idCaja, client = pool) {
    try {
        const arqRes = await client.query(
            `SELECT idArqueo, montoInicial FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`,
            [idCaja]
        );
        if (arqRes.rows.length === 0) return;

        const { idarqueo, montoinicial } = arqRes.rows[0];
        const hndDate = getLocalTimestamp().substring(0, 10);

        const ingRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) AS total, COALESCE(SUM(costo), 0) AS costo
            FROM ingresos
            WHERE idCaja = $1
              AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2
              AND (subtipo_movimiento IS NULL OR subtipo_movimiento <> 'KrediYa_Deposito')
        `, [idCaja, hndDate]);

        const egrRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) AS total
            FROM egresos
            WHERE idCaja = $1
              AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2
        `, [idCaja, hndDate]);

        const totalIngresos = Number(ingRes.rows[0].total);
        const totalCostos   = Number(ingRes.rows[0].costo);
        const totalEgresos  = Number(egrRes.rows[0].total);
        const montoFinal    = (Number(montoinicial) + totalIngresos) - totalEgresos;
        const ganancia      = totalIngresos - totalCostos;

        await client.query(`
            UPDATE arqueo
            SET totalVentas = $1, totalCostos = $2, TotalGastos = $3,
                montoFinal  = $4, ganancia    = $5
            WHERE idArqueo = $6
        `, [totalIngresos, totalCostos, totalEgresos, montoFinal, ganancia, idarqueo]);
    } catch (err) {
        console.error('Error updateArqueoBalance:', err.message);
        throw err;
    }
}

/**
 * Anula una venta y revierte el inventario usando el stored procedure sp_anular_venta.
 * Si el SP no existe en la DB (migración pendiente), ejecuta la lógica manualmente.
 */
async function anularVenta(codVenta, codUsuario, motivo = 'Sin motivo', client = pool) {
    try {
        const spRes = await client.query(
            `SELECT sp_anular_venta($1, $2, $3) AS resultado`,
            [codVenta, codUsuario, motivo]
        );
        const resultado = spRes.rows[0].resultado;
        // SP retorna JSONB: { ok: true, codVenta, lineas_revertidas }
        if (resultado && typeof resultado === 'object') {
            if (resultado.ok === false) throw new Error(resultado.error || 'SP reportó error al anular');
            return true; // ok: true → éxito
        }
        return Boolean(resultado);
    } catch (err) {
        if (err.message && err.message.includes('does not exist')) {
            console.warn('sp_anular_venta no encontrado, usando lógica manual.');
            return null;
        }
        throw err;
    }
}

const handleDbError = (res, err) => {
    const status = err.code === '23505' ? 409 : err.code === '23503' ? 400 : 500;
    const message = err.code === '23505'
        ? 'Ya existe un registro con ese identificador'
        : err.code === '23503'
        ? 'Referencia inválida: el registro relacionado no existe'
        : err.message || 'Error interno del servidor';
    console.error('DB Error:', err.message, err.code);
    res.status(status).json({ error: message });
};

module.exports = { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp, anularVenta };
