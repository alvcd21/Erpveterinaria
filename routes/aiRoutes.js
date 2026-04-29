
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/db');
const aiService = require('../services/aiService');

// POST /ai/repair-diagnosis
router.post('/ai/repair-diagnosis', authenticateToken, async (req, res) => {
  try {
    const { repairId, deviceDesc, issueDescription } = req.body;
    if (!deviceDesc || !issueDescription) {
      return res.status(400).json({ error: 'deviceDesc e issueDescription son requeridos' });
    }

    // Fetch last 10 completed repairs for context (similar device keyword)
    const keyword = deviceDesc.split(' ')[0] || '';
    const histResult = await pool.query(
      `SELECT marca, modelo, descripcion_falla, estado_reparacion
       FROM reparaciones
       WHERE estado_reparacion = 'Entregado'
         AND (LOWER(marca) LIKE LOWER($1) OR LOWER(modelo) LIKE LOWER($1))
       ORDER BY fecha_ingreso DESC
       LIMIT 10`,
      [`%${keyword}%`]
    );

    const result = await aiService.diagnoseRepair(deviceDesc, issueDescription, histResult.rows);
    res.json(result);
  } catch (err) {
    console.error('AI repair-diagnosis error:', err.message);
    res.status(500).json({ error: 'Error interno', details: err.message });
  }
});

// POST /ai/client-analysis
router.post('/ai/client-analysis', authenticateToken, async (req, res) => {
  try {
    const { idCliente } = req.body;
    if (!idCliente) {
      return res.status(400).json({ error: 'idCliente es requerido' });
    }

    const clientResult = await pool.query(
      `SELECT identidad, nombre, apellido FROM clientes WHERE identidad = $1`,
      [idCliente]
    );
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const cliente = clientResult.rows[0];

    const [purchasesResult, repairsResult, totalResult] = await Promise.all([
      pool.query(
        `SELECT v.fecha, dv.descripcion AS producto, dv.precioUnitario AS monto
         FROM ventas v
         JOIN detalleventa dv ON v.codVenta = dv.idVenta
         WHERE v.identidadCliente = $1
         ORDER BY v.fecha DESC
         LIMIT 20`,
        [idCliente]
      ),
      pool.query(
        `SELECT fecha_ingreso AS fecha, marca || ' ' || modelo AS equipo,
                estado_reparacion AS estado, precio_cliente AS costo
         FROM reparaciones
         WHERE identidad_cliente = $1
         ORDER BY fecha_ingreso DESC
         LIMIT 10`,
        [idCliente]
      ),
      pool.query(
        `SELECT COALESCE(SUM(dv.precioUnitario * dv.cantidad), 0) AS totalGastado,
                COALESCE(AVG(v.totalVenta), 0) AS promedioCompra,
                COUNT(DISTINCT v.codVenta) AS frecuencia
         FROM ventas v
         JOIN detalleventa dv ON v.codVenta = dv.idVenta
         WHERE v.identidadCliente = $1`,
        [idCliente]
      ),
    ]);

    const clientData = {
      nombre: `${cliente.nombre} ${cliente.apellido}`,
      compras: purchasesResult.rows,
      reparaciones: repairsResult.rows,
      totalGastado: totalResult.rows[0].totalgastado,
      promedioCompra: totalResult.rows[0].promediocompra,
      frecuencia: totalResult.rows[0].frecuencia,
    };

    const result = await aiService.analyzeClient(clientData);
    res.json(result);
  } catch (err) {
    console.error('AI client-analysis error:', err.message);
    res.status(500).json({ error: 'Error interno', details: err.message });
  }
});

// POST /ai/price-suggestion
router.post('/ai/price-suggestion', authenticateToken, async (req, res) => {
  try {
    const { modelo, precioCompra } = req.body;
    if (!modelo || precioCompra === undefined) {
      return res.status(400).json({ error: 'modelo y precioCompra son requeridos' });
    }

    const salesResult = await pool.query(
      `SELECT t.modelo, dv.precioUnitario AS "precioVenta", v.fecha
       FROM detalleventa dv
       JOIN ventas v ON dv.idVenta = v.codVenta
       JOIN telefonos t ON dv.idProducto = t.codTelefono
       WHERE LOWER(t.modelo) LIKE LOWER($1)
         AND v.estado != 'Anulada'
       ORDER BY v.fecha DESC
       LIMIT 20`,
      [`%${modelo}%`]
    );

    const result = await aiService.suggestPrice(modelo, precioCompra, salesResult.rows);
    res.json(result);
  } catch (err) {
    console.error('AI price-suggestion error:', err.message);
    res.status(500).json({ error: 'Error interno', details: err.message });
  }
});

// GET /ai/anomaly-check/:idArqueo
router.get('/ai/anomaly-check/:idArqueo', authenticateToken, async (req, res) => {
  try {
    const { idArqueo } = req.params;

    const arqueoResult = await pool.query(
      `SELECT idArqueo, idCaja, fecha, montoInicial, totalVentas, TotalGastos AS "totalEgresos", ganancia
       FROM arqueo
       WHERE idArqueo = $1`,
      [idArqueo]
    );
    if (arqueoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Arqueo no encontrado' });
    }
    const arqueo = arqueoResult.rows[0];

    const historicalResult = await pool.query(
      `SELECT fecha, montoInicial, totalVentas, TotalGastos AS totalegresos, ganancia
       FROM arqueo
       WHERE idCaja = $1
         AND idArqueo != $2
         AND estado = 'Cerrado'
       ORDER BY fecha DESC
       LIMIT 30`,
      [arqueo.idcaja || arqueo.idCaja, idArqueo]
    );

    const result = await aiService.detectCashAnomaly(arqueo, historicalResult.rows);
    res.json(result);
  } catch (err) {
    console.error('AI anomaly-check error:', err.message);
    res.status(500).json({ error: 'Error interno', details: err.message });
  }
});

// GET /ai/recharge-prediction/:red
router.get('/ai/recharge-prediction/:red', authenticateToken, async (req, res) => {
  try {
    const { red } = req.params;
    if (!['TIGO', 'CLARO'].includes(red.toUpperCase())) {
      return res.status(400).json({ error: 'red debe ser TIGO o CLARO' });
    }
    const redUpper = red.toUpperCase();

    // Fetch last 30 days of saldo entries for the given red
    const saldosResult = await pool.query(
      `SELECT DATE(fechaCreacion) AS fecha, saldoFinal
       FROM saldos
       WHERE UPPER(red) = $1
       ORDER BY fechaCreacion DESC
       LIMIT 30`,
      [redUpper]
    );

    // Calculate daily consumption from saldoFinal differences
    const rows = saldosResult.rows;
    const dailyConsumption = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const diff = Number(rows[i].saldofinal || rows[i].saldoFinal || 0) -
                   Number(rows[i + 1].saldofinal || rows[i + 1].saldoFinal || 0);
      dailyConsumption.push({
        fecha: rows[i].fecha,
        consumo: diff > 0 ? diff : 0,
      });
    }

    const result = await aiService.predictRechargeNeeds(redUpper, dailyConsumption);
    res.json(result);
  } catch (err) {
    console.error('AI recharge-prediction error:', err.message);
    res.status(500).json({ error: 'Error interno', details: err.message });
  }
});

module.exports = router;
