
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

// --- HELPER TIMEZONE HONDURAS (ROBUSTO) ---
const getLocalTimestamp = () => {
    try {
        const now = new Date();
        const options = {
            timeZone: 'America/Tegucigalpa',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(now);
        
        const getPart = (type) => parts.find(p => p.type === type).value;
        return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
    } catch (err) {
        console.error("Error generando fecha local:", err);
        const d = new Date();
        d.setHours(d.getHours() - 6);
        return d.toISOString().replace('T', ' ').substring(0, 19);
    }
};

pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'America/Tegucigalpa'")
        .catch(err => console.error('Error setting timezone', err));
});

async function generateNextId(table, column, prefix, client = pool) {
  try {
    const query = `
      SELECT ${column} as id 
      FROM ${table} 
      WHERE ${column} LIKE '${prefix}-%' 
      ORDER BY LENGTH(${column}) DESC, ${column} DESC 
      LIMIT 1
    `;
    const result = await client.query(query);
    
    let maxNum = 0;
    if(result.rows.length > 0) {
      const parts = result.rows[0].id.split(`${prefix}-`);
      if (parts.length === 2 && /^\d+$/.test(parts[1])) {
        maxNum = parseInt(parts[1], 10);
      }
    }
    const nextNum = maxNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  } catch (err) {
    console.error(`Error generando ID para ${table}:`, err);
    throw err;
  }
}

// Función CRÍTICA: Actualizar balance en tiempo real
async function updateArqueoBalance(idCaja, client = pool) {
    try {
        const arqRes = await client.query(
            `SELECT idArqueo as "idArqueo", montoInicial as "montoInicial", 
             TO_CHAR(fechaApertura, 'YYYY-MM-DD HH24:MI:SS') as "fechaAperturaStr"
             FROM arqueo 
             WHERE idCaja = $1 AND estado = 'Activo'`, 
            [idCaja]
        );
        
        if (arqRes.rows.length === 0) {
            return; 
        }

        const { idArqueo, montoInicial, fechaAperturaStr } = arqRes.rows[0];
        
        // CORRECCIÓN DE ZONA HORARIA: Se añade un buffer de 12 horas al inicio de la sesión
        // para capturar movimientos que pudieran tener desajuste de hora servidor vs local.
        const ingRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) as total, COALESCE(SUM(costo), 0) as costo
            FROM ingresos 
            WHERE idCaja = $1 
            AND fechaCreacion >= ($2::timestamp - interval '12 hours')
            AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = TO_CHAR($2::timestamp, 'YYYY-MM-DD')
        `, [idCaja, fechaAperturaStr]);

        const egrRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) as total
            FROM egresos 
            WHERE idCaja = $1 
            AND fechaCreacion >= ($2::timestamp - interval '12 hours')
            AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = TO_CHAR($2::timestamp, 'YYYY-MM-DD')
        `, [idCaja, fechaAperturaStr]);

        const totalIngresos = Number(ingRes.rows[0].total);
        const totalCostos = Number(ingRes.rows[0].costo);
        const totalEgresos = Number(egrRes.rows[0].total);
        const baseInicial = Number(montoInicial);

        const montoFinal = (baseInicial + totalIngresos) - totalEgresos;
        const ganancia = totalIngresos - totalCostos;

        await client.query(`
            UPDATE arqueo 
            SET 
                totalVentas = $1,
                totalCostos = $2,
                TotalGastos = $3,
                montoFinal = $4,
                ganancia = $5
            WHERE idArqueo = $6
        `, [totalIngresos, totalCostos, totalEgresos, montoFinal, ganancia, idArqueo]);
        
    } catch (err) {
        console.error("[CRITICAL ERROR] Fallo actualizando balance:", err);
        throw err;
    }
}

const handleDbError = (res, err) => {
  console.error('[DB ERROR HANDLER]:', err); 
  if (err.code === '23503') return res.status(409).json({ error: 'No se puede eliminar/crear: Registro relacionado a otra entidad.' });
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe (Duplicado).' });
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
};

module.exports = { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp };
