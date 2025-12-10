
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smartcloud_secret_key';

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

// --- HELPER: GENERADOR DE IDs ---
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

// Inicialización de tablas nuevas si no existen
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS paquetes (
                idPaquete varchar(100) PRIMARY KEY,
                red varchar(20) NOT NULL,
                nombre varchar(100) NOT NULL,
                precio numeric(10,2) NOT NULL,
                costo numeric(10,2) NOT NULL,
                estado varchar(20) NOT NULL DEFAULT 'Activo'
            );
        `);
    } catch (err) {
        console.error("Error init DB:", err);
    }
};
initDB();

const handleDbError = (res, err) => {
  console.error('DB Error:', err); 
  if (err.code === '23503') return res.status(409).json({ error: 'Registro en uso por otra entidad.' });
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe.' });
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- AUTH ---
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const query = `
      SELECT 
        u.codUsuario as "codUsuario",
        u.usuario,
        u.password,
        u.identidad,
        u.idCaja as "idCaja",
        u.idrol,
        u.estado,
        r.nombre as "rol_nombre",
        e.nombre as "emp_nombre",
        e.apellido as "emp_apellido"
      FROM usuarios u
      LEFT JOIN roles r ON u.idrol = r.idrol
      LEFT JOIN empleado e ON u.identidad = e.identidad
      WHERE u.usuario = $1
    `;
    const result = await pool.query(query, [usuario]);
    const userRaw = result.rows[0];

    if (!userRaw) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (userRaw.estado && userRaw.estado.toLowerCase() !== 'activo') return res.status(401).json({ error: 'El usuario está inactivo' });
    
    let validPassword = false;
    if (userRaw.password && (userRaw.password.startsWith('$2a$') || userRaw.password.startsWith('$2b$') || userRaw.password.startsWith('$2y$'))) {
        validPassword = await bcrypt.compare(password, userRaw.password);
    } else {
        const dbPass = userRaw.password ? userRaw.password.trim() : '';
        const inputPass = password ? password.trim() : '';
        validPassword = (dbPass === inputPass);
    }

    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const permQuery = `SELECT idPermiso FROM rol_permisos WHERE idRol = $1`;
    const permResult = await pool.query(permQuery, [userRaw.idrol]);
    const permisos = permResult.rows.map(r => r.idpermiso);

    const userData = { 
      codUsuario: userRaw.codUsuario, 
      usuario: userRaw.usuario, 
      rol: userRaw.rol_nombre || 'Sin Rol', 
      idCaja: userRaw.idCaja || 'Sin Caja',
      nombreEmpleado: userRaw.emp_nombre ? `${userRaw.emp_nombre} ${userRaw.emp_apellido}` : 'Empleado Desconocido',
      permisos: permisos
    };

    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: userData });

  } catch (err) { 
    res.status(500).json({ error: 'Error interno en login' }); 
  }
});

// ... (Endpoints de Roles, Usuarios, Empleados, Clientes, Proveedores, Costos se mantienen igual, omitidos por brevedad pero asumiendo existen) ...
// ... Incluyo aquí los endpoints clave modificados ...

// ==========================================
// PAQUETES (NUEVO)
// ==========================================
app.get('/api/paquetes', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT idPaquete as "idPaquete", red, nombre, precio, costo, estado FROM paquetes ORDER BY red, precio');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

app.post('/api/paquetes', authenticateToken, async (req, res) => {
    try {
        const { red, nombre, precio, costo } = req.body;
        const id = await generateNextId('paquetes', 'idPaquete', 'PAQ');
        await pool.query('INSERT INTO paquetes (idPaquete, red, nombre, precio, costo, estado) VALUES ($1,$2,$3,$4,$5,$6)',
            [id, red, nombre, precio, costo, 'Activo']);
        res.status(201).json({ message: 'Paquete creado', id });
    } catch(e) { handleDbError(res, e); }
});

app.put('/api/paquetes/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, precio, costo, estado } = req.body;
        await pool.query('UPDATE paquetes SET nombre=$1, precio=$2, costo=$3, estado=$4 WHERE idPaquete=$5',
            [nombre, precio, costo, estado, req.params.id]);
        res.json({ message: 'Actualizado' });
    } catch(e) { handleDbError(res, e); }
});

app.delete('/api/paquetes/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM paquetes WHERE idPaquete=$1', [req.params.id]);
        res.json({ message: 'Eliminado' });
    } catch(e) { handleDbError(res, e); }
});


// ==========================================
// CAJA Y ARQUEO
// ==========================================

// Obtener Arqueo Activo
app.get('/api/arqueo/active', authenticateToken, async (req, res) => {
  try {
    const { idCaja } = req.user;
    const result = await pool.query(
      `SELECT 
        idArqueo as "idArqueo", 
        idCaja as "idCaja", 
        idUsuario as "idUsuario", 
        fechaApertura as "fechaApertura", 
        montoInicial as "montoInicial", 
        estado 
       FROM arqueo 
       WHERE idCaja = $1 AND estado = 'Activo' 
       ORDER BY fechaApertura DESC LIMIT 1`,
      [idCaja]
    );
    res.json(result.rows[0] || null);
  } catch(err) { handleDbError(res, err); }
});

// Admin: Obtener Todas las Cajas con su estado actual
app.get('/api/admin/cajas-status', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.idCaja as "idCaja",
                c.nombre as "nombreCaja",
                a.idArqueo as "idArqueo",
                a.estado as "estadoArqueo",
                a.fechaApertura as "fechaApertura",
                a.fechaCierre as "fechaCierre",
                a.montoInicial as "montoInicial",
                a.ganancia,
                u.usuario as "usuario"
            FROM caja c
            LEFT JOIN arqueo a ON c.idCaja = a.idCaja AND a.fechaApertura = (
                SELECT MAX(fechaApertura) FROM arqueo WHERE idCaja = c.idCaja
            )
            LEFT JOIN usuarios u ON a.idUsuario = u.codUsuario
            ORDER BY c.idCaja
        `);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// Admin: Reabrir Caja
app.post('/api/admin/reopen-box', authenticateToken, async (req, res) => {
    try {
        const { idArqueo } = req.body;
        await pool.query(`
            UPDATE arqueo 
            SET estado = 'Activo', fechaCierre = NULL, montoFinal = NULL 
            WHERE idArqueo = $1
        `, [idArqueo]);
        res.json({ message: 'Caja reabierta exitosamente' });
    } catch(e) { handleDbError(res, e); }
});

// Obtener Saldos Hoy
app.get('/api/saldos/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha 
      FROM saldos 
      WHERE fecha = $1
    `, [today]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

// Apertura de Caja
app.post('/api/arqueo/open', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { montoInicial, saldoTigoInicial, saldoClaroInicial } = req.body;
    const { codUsuario, idCaja } = req.user;
    
    const check = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if (check.rows.length > 0) return res.status(400).json({ error: 'Caja ya abierta.' });

    await client.query('BEGIN');
    const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
    await client.query(
      `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, estado)
       VALUES ($1, $2, $3, NOW(), $4, 'Activo')`,
      [idArqueo, idCaja, codUsuario, montoInicial]
    );

    const today = new Date().toISOString().split('T')[0];
    const checkSaldos = await client.query('SELECT * FROM saldos WHERE fecha = $1', [today]);
    
    if (checkSaldos.rows.length === 0) {
      const idSaldoTigo = await generateNextId('saldos', 'idsaldos', 'SAL', client);
      // Hack simple para ID consecutivo en misma transacción
      const parts = idSaldoTigo.split('-');
      const nextNum = parseInt(parts[1]) + 1;
      const idSaldoClaro = `${parts[0]}-${nextNum.toString().padStart(4,'0')}`;

      await client.query(
        `INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'TIGO', $2, 0, $2, $3)`,
        [idSaldoTigo, saldoTigoInicial || 0, today]
      );
      await client.query(
        `INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'CLARO', $2, 0, $2, $3)`,
        [idSaldoClaro, saldoClaroInicial || 0, today]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Caja Aperturada', idArqueo });
  } catch(err) { 
    await client.query('ROLLBACK');
    handleDbError(res, err); 
  } finally {
    client.release();
  }
});

// Cierre de Caja (Calculo de Ganancias)
app.post('/api/arqueo/close', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
     const { idArqueo } = req.body;
     const { idCaja } = req.user;

     await client.query('BEGIN');

     // 1. Calcular Ventas Totales y Costo Ventas (Inventario)
     const ventasRes = await client.query(`
        SELECT 
            COALESCE(SUM(v.total), 0) as total_ventas,
            COALESCE(SUM(dv.cantidad * 
                CASE 
                    WHEN dv.idTelefono IS NOT NULL THEN t.precioCompra 
                    WHEN dv.idAccesorio IS NOT NULL THEN i.precioCompra
                    ELSE 0 
                END
            ), 0) as costo_ventas
        FROM ventas v
        JOIN detalleventa dv ON v.codVenta = dv.idVenta
        LEFT JOIN telefonos t ON dv.idTelefono = t.codigo
        LEFT JOIN inventario i ON dv.idInventario = i.codInventario -- Usamos idInventario para linkear al stock exacto y su precio compra
        WHERE v.codVendedor = (SELECT idUsuario FROM arqueo WHERE idArqueo = $1)
          AND v.fecha = CURRENT_DATE
          AND v.estado != 'Anulada'
     `, [idArqueo]);

     // 2. Calcular Ingresos Manuales y Recargas (Excluyendo Ventas automáticas que ya se sumaron, o sumando todo de ingresos y no de ventas?
     // Estrategia: Ventas (POS) genera Ingresos. Recargas genera Ingresos. 
     // Es mejor sumar TODO desde la tabla INGRESOS para el arqueo de efectivo, y usar la tabla VENTAS solo para reporte detallado.
     // Pero necesitamos Costos. La tabla Ingresos tiene columna 'costo'.
     
     // Sumar TODOS los ingresos asociados a la caja HOY (o desde la apertura)
     const ingresosRes = await client.query(`
        SELECT COALESCE(SUM(monto), 0) as total_ingresos, COALESCE(SUM(costo), 0) as costo_ingresos
        FROM ingresos 
        WHERE idCaja = $1 AND fechaCreacion >= (SELECT fechaApertura FROM arqueo WHERE idArqueo = $2)
     `, [idCaja, idArqueo]);
     
     // Sumar Egresos
     const egresosRes = await client.query(`
        SELECT COALESCE(SUM(monto), 0) as total_egresos
        FROM egresos 
        WHERE idCaja = $1 AND fechaCreacion >= (SELECT fechaApertura FROM arqueo WHERE idArqueo = $2)
     `, [idCaja, idArqueo]);

     const totalIngresos = parseFloat(ingresosRes.rows[0].total_ingresos);
     const totalCostos = parseFloat(ingresosRes.rows[0].costo_ingresos);
     const totalEgresos = parseFloat(egresosRes.rows[0].total_egresos);
     
     // Ganancia = Ingresos - Costos - Egresos (Gastos Operativos)
     // Nota: Si la compra de saldo se registra como Egreso, reduce la ganancia del día (Cash Flow) o se considera inversión?
     // En este modelo simple: Egreso reduce efectivo en caja. 
     // Ganancia del dia = (Ingresos - Costos) - Gastos(Egresos que son Gasto, no compra saldo)
     // Pero aqui simplificamos: Ganancia = (Ingresos - Costos). Los egresos afectan el 'Monto Final' en caja pero no necesariamente la ganancia bruta.
     // Asumiremos Ganancia Bruta = Total Ingresos - Total Costos.
     const ganancia = totalIngresos - totalCostos;

     // Arqueo Final (Efectivo Esperado)
     const arqueoInfo = await client.query(`SELECT montoInicial FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
     const montoInicial = parseFloat(arqueoInfo.rows[0].montoInicial || 0);
     const montoFinal = montoInicial + totalIngresos - totalEgresos;

     await client.query(`
        UPDATE arqueo 
        SET estado = 'Cerrada', fechaCierre = NOW(), 
            montoFinal = $1, totalVentas = $2, totalCostos = $3, TotalGastos = $4, ganancia = $5
        WHERE idArqueo = $6
     `, [montoFinal, totalIngresos, totalCostos, totalEgresos, ganancia, idArqueo]);

     await client.query('COMMIT');
     res.json({ message: 'Caja Cerrada', resumen: { montoFinal, totalIngresos, totalCostos, totalEgresos, ganancia } });

  } catch(err) { 
      await client.query('ROLLBACK');
      handleDbError(res, err); 
  } finally {
      client.release();
  }
});

// Registrar Compra de Saldo (Egreso + Update Saldo)
app.post('/api/saldos/buy', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, montoPagado, montoRecibido } = req.body; // montoPagado (Lempiras), montoRecibido (Saldo)
        const { idCaja } = req.user;

        await client.query('BEGIN');

        // 1. Registrar Egreso de Caja
        const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, NOW(), 'Registrado')`,
            [idegresos, idCaja, `COMPRA SALDO ${red}`, montoPagado]
        );

        // 2. Actualizar Saldos
        const today = new Date().toISOString().split('T')[0];
        // Verificar si existe registro de saldo hoy
        const check = await client.query('SELECT idsaldos FROM saldos WHERE red=$1 AND fecha=$2', [red, today]);
        
        if (check.rows.length === 0) {
            // Si no existe (raro si se abrió caja, pero posible), crear
             const idSaldo = await generateNextId('saldos', 'idsaldos', 'SAL', client);
             await client.query(
                `INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) 
                 VALUES ($1, $2, 0, $3, $3, $4)`,
                [idSaldo, red, montoRecibido, today]
             );
        } else {
            await client.query(`
                UPDATE saldos 
                SET saldoComprado = COALESCE(saldoComprado, 0) + $1,
                    saldoFinal = COALESCE(saldoFinal, 0) + $1
                WHERE red = $2 AND fecha = $3
            `, [montoRecibido, red, today]);
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Saldo comprado registrado' });
    } catch(err) {
        await client.query('ROLLBACK');
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

app.post('/api/recargas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { red, tipo, descripcion, precioCobrado, precioPagado } = req.body;
    const { idCaja } = req.user;

    await client.query('BEGIN');

    // 1. Registrar Ingreso (Venta)
    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) 
       VALUES ($1, $2, $3, $4, $5, NOW(), 'Registrado')`,
      [idIngreso, idCaja, `RECARGA ${red}: ${descripcion}`, precioCobrado, precioPagado]
    );

    // 2. Log en Recargas
    const idRecargas = await generateNextId('recargas', 'idRecargas', 'REC', client);
    await client.query(
      `INSERT INTO recargas (idRecargas, red, tipo, descripcion, precioCobrado, precioPagado, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'Completada')`,
      [idRecargas, red, tipo, descripcion, precioCobrado, precioPagado]
    );

    // 3. Descontar Saldo
    const today = new Date().toISOString().split('T')[0];
    await client.query(`
      UPDATE saldos 
      SET saldoFinal = COALESCE(saldoFinal, saldoInicio) - $1 
      WHERE red = $2 AND fecha = $3
    `, [precioPagado, red, today]);

    await client.query('COMMIT');
    res.status(201).json({ message: 'Recarga exitosa' });
  } catch(err) {
    await client.query('ROLLBACK');
    handleDbError(res, err);
  } finally {
    client.release();
  }
});

// VENTAS (POS) - ACTUALIZADO para registrar INGRESO AUTOMÁTICO
app.post('/api/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { identidadCliente, total, detalles } = req.body;
    const { codUsuario, idCaja } = req.user;
    
    // Validar Caja Abierta
    const openBox = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if(openBox.rows.length === 0) throw new Error("Caja cerrada o no asignada.");

    await client.query('BEGIN');
    
    // 1. Crear Venta
    const codVenta = await generateNextId('ventas', 'codVenta', 'FAC', client);
    const fecha = new Date().toISOString().split('T')[0];
    await client.query(
      `INSERT INTO ventas (codVenta, fecha, codVendedor, identidadCliente, total, estado) VALUES ($1, $2, $3, $4, $5, 'Completada')`,
      [codVenta, fecha, codUsuario, identidadCliente, total]
    );

    let totalCostoVenta = 0;
    const startIdStr = await generateNextId('detalleventa', 'codDetalleVenta', 'DET', client);
    let currentDetailIdNum = parseInt(startIdStr.split('-')[1]);

    // 2. Procesar Detalles y Calcular Costo Total
    for (const item of detalles) {
      const codDetalle = `DET-${currentDetailIdNum.toString().padStart(4, '0')}`;
      currentDetailIdNum++;
      
      let idAccesorio = null;
      let idTelefono = null;
      let itemCosto = 0;

      if (item.tipoProducto === 'TELEFONO') {
        idTelefono = item.idTelefono;
        // Obtener costo
        const telRes = await client.query("SELECT precioCompra FROM telefonos WHERE codigo = $1", [idTelefono]);
        itemCosto = telRes.rows[0]?.preciocompra || 0;
        await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [idTelefono]);

      } else if (item.tipoProducto === 'ACCESORIO') {
        // Obtener costo
        const invRes = await client.query('SELECT codAccesorio, precioCompra FROM inventario WHERE codInventario = $1', [item.idInventario]);
        if(invRes.rows.length > 0) {
            idAccesorio = invRes.rows[0].codaccesorio;
            itemCosto = invRes.rows[0].preciocompra || 0;
        }
        await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad, item.idInventario]);
      } else {
        // Servicios o items manuales
        itemCosto = 0; // Asumimos costo 0 para servicios puros a menos que se especifique en otra lógica
      }

      totalCostoVenta += (Number(itemCosto) * Number(item.cantidad));

      await client.query(
        `INSERT INTO detalleventa (codDetalleVenta, idVenta, idAccesorio, idTelefono, cantidad, precioVenta, estado) 
         VALUES ($1, $2, $3, $4, $5, $6, 'Activo')`,
        [codDetalle, codVenta, idAccesorio, idTelefono, item.cantidad, item.precioVenta]
      );
    }

    // 3. REGISTRAR EL INGRESO AUTOMÁTICO EN CAJA
    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) 
       VALUES ($1, $2, $3, $4, $5, NOW(), 'Venta POS')`,
      [idIngreso, idCaja, `Venta Factura #${codVenta}`, total, totalCostoVenta]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Venta OK', codVenta });
  } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

// Endpoints básicos de Ingresos/Egresos (Lectura/Creación simple)
app.get('/api/ingresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.query;
  try {
    const result = await pool.query(`SELECT idIngreso as "idIngreso", idCaja as "idCaja", descripcion, monto, costo, fechaCreacion as "fechaCreacion", estado FROM ingresos WHERE idCaja = $1 ORDER BY fechaCreacion DESC LIMIT 100`, [idCaja]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/ingresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto, costo } = req.body;
    const { idCaja } = req.user;
    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR');
    await pool.query(`INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, NOW(), 'Registrado')`,
      [idIngreso, idCaja, descripcion, monto, costo || 0]);
    res.status(201).json({ message: 'Ingreso registrado', idIngreso });
  } catch(err) { handleDbError(res, err); }
});

app.get('/api/egresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.query;
  try {
    const result = await pool.query(`SELECT idegresos as "idegresos", idCaja as "idCaja", descripcion, monto, fechaCreacion as "fechaCreacion", estado FROM egresos WHERE idCaja = $1 ORDER BY fechaCreacion DESC LIMIT 100`, [idCaja]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/egresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto } = req.body;
    const { idCaja } = req.user;
    const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE');
    await pool.query(`INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1, $2, $3, $4, NOW(), 'Registrado')`,
      [idegresos, idCaja, descripcion, monto]);
    res.status(201).json({ message: 'Egreso registrado', idegresos });
  } catch(err) { handleDbError(res, err); }
});

app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'build', 'index.html')); });

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port}`);
});
