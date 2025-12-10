const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smartcloud_secret_key_change_in_prod';

// Middleware
app.use(express.json());

// --- DATABASE CONFIG ---
const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
  if (err) return console.error('❌ Error fatal conectando a BD:', err.stack);
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) return console.error('❌ Error ejecutando query de prueba', err.stack);
    console.log('✅ Conexión exitosa a PostgreSQL:', result.rows[0]);
  });
});

// --- HELPER: GENERADOR DE IDs ---
async function generateNextId(table, column, prefix) {
  try {
    // Buscar el último ID que coincida con el prefijo
    // Se ordena por longitud primero y luego por valor para manejar TELF-9 vs TELF-10 correctamente
    const query = `
      SELECT ${column} as id 
      FROM ${table} 
      WHERE ${column} LIKE '${prefix}-%' 
      ORDER BY LENGTH(${column}) DESC, ${column} DESC 
      LIMIT 1
    `;
    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      return `${prefix}-0001`;
    }

    const lastId = result.rows[0].id; 
    // Extraer la parte numérica asumiendo formato PREFIJO-NUMERO
    const parts = lastId.split('-');
    
    // Si el ID no tiene guión o formato esperado, reiniciar
    if (parts.length < 2) return `${prefix}-0001`;

    const numberPart = parts[parts.length - 1]; 
    const nextNumber = parseInt(numberPart, 10) + 1; 
    
    const paddedNumber = nextNumber.toString().padStart(4, '0'); 
    return `${prefix}-${paddedNumber}`;
  } catch (err) {
    console.error(`Error generando ID para ${table}:`, err);
    throw err;
  }
}

const handleDbError = (res, err) => {
  console.error(err);
  if (err.code === '23503') return res.status(409).json({ error: 'Registro en uso por otra entidad.' });
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe (duplicado).' });
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

// --- AUTH ENDPOINTS ---
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const query = `
      SELECT u.codUsuario, u.usuario, u.password, u.estado, r.nombre as rol_nombre, e.nombre as emp_nombre, e.apellido as emp_apellido
      FROM usuarios u
      JOIN roles r ON u.idrol = r.idrol
      JOIN empleado e ON u.identidad = e.identidad
      WHERE u.usuario = $1
    `;
    const result = await pool.query(query, [usuario]);
    const userRaw = result.rows[0];

    if (!userRaw || userRaw.estado !== 'Activo') return res.status(401).json({ error: 'Usuario no válido' });
    
    let validPassword = false;
    if (userRaw.password.startsWith('$2a$')) validPassword = await bcrypt.compare(password, userRaw.password);
    else validPassword = (userRaw.password === password);

    if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });

    const userData = { codUsuario: userRaw.codusuario, usuario: userRaw.usuario, rol: userRaw.rol_nombre, nombreEmpleado: `${userRaw.emp_nombre} ${userRaw.emp_apellido}` };
    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: userData });
  } catch (err) { handleDbError(res, err); }
});

// --- INVENTORY ENDPOINTS ---

// 1. TELEFONOS
app.get('/api/inventory/telefonos', authenticateToken, async (req, res) => {
  try {
    // IMPORTANT: Postgres returns lowercase columns. We use Aliases to match React types.
    const result = await pool.query(`
      SELECT 
        t.codigo, t.imei1, t.imei2, t.marca, t.modelo, 
        t.preciocompra as "precioCompra", t.precioventa as "precioVenta", 
        t.codproveedor as "codProveedor", t.fecha, t.idubicacion, t.estado,
        u.nombre as "nombreUbicacion", u.estante, u.nivel
      FROM telefonos t
      LEFT JOIN ubicacion u ON t.idubicacion = u.idUbicacion
      ORDER BY t.codigo DESC
    `);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/telefonos', authenticateToken, async (req, res) => {
  try {
    const { imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, idubicacion } = req.body;
    const codigo = await generateNextId('telefonos', 'codigo', 'TELF');
    const fecha = new Date();
    
    await pool.query(
      `INSERT INTO telefonos (codigo, imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Disponible')`,
      [codigo, imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion]
    );
    res.status(201).json({ message: 'Teléfono registrado', id: codigo });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/telefonos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, idubicacion } = req.body;
    await pool.query(
      `UPDATE telefonos SET imei1=$1, imei2=$2, marca=$3, modelo=$4, precioCompra=$5, precioVenta=$6, codProveedor=$7, idubicacion=$8 
       WHERE codigo=$9`,
      [imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, idubicacion, id]
    );
    res.json({ message: 'Teléfono actualizado' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/telefonos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM telefonos WHERE codigo=$1', [id]);
    res.json({ message: 'Teléfono eliminado' });
  } catch (err) { handleDbError(res, err); }
});

// 2. CATEGORIAS
app.get('/api/inventory/categorias', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT codcategoria as "codCategoria", tipo FROM categoria ORDER BY codCategoria ASC');
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/categorias', authenticateToken, async (req, res) => {
  try {
    const { tipo } = req.body;
    const codCategoria = await generateNextId('categoria', 'codCategoria', 'CATG');
    await pool.query("INSERT INTO categoria (codCategoria, tipo) VALUES ($1, $2)", [codCategoria, tipo]);
    res.status(201).json({ message: 'Categoría creada', id: codCategoria });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo } = req.body;
    await pool.query('UPDATE categoria SET tipo=$1 WHERE codCategoria=$2', [tipo, id]);
    res.json({ message: 'Categoría actualizada' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM categoria WHERE codCategoria=$1', [id]);
    res.json({ message: 'Categoría eliminada' });
  } catch (err) { handleDbError(res, err); }
});

// 3. ACCESORIOS (MASTER)
app.get('/api/inventory/accesorios-master', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.codaccesorio as "codAccesorio", a.codcategoria as "codCategoria", a.descripcion,
        c.tipo as "nombreCategoria"
      FROM accesorios a
      JOIN categoria c ON a.codCategoria = c.codCategoria
      ORDER BY a.codAccesorio ASC
    `);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/accesorios-master', authenticateToken, async (req, res) => {
  try {
    const { codCategoria, descripcion } = req.body;
    
    // Obtener nombre categoria para prefijo
    const catResult = await pool.query("SELECT tipo FROM categoria WHERE codCategoria = $1", [codCategoria]);
    if (catResult.rows.length === 0) return res.status(404).json({ error: 'Categoría no encontrada' });

    const nombreCategoria = catResult.rows[0].tipo;
    // Prefijo: Primeras 4 letras
    let prefix = nombreCategoria.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, 'X');
    if (prefix.length < 3) prefix = 'ITEM';

    const id = await generateNextId('accesorios', 'codAccesorio', prefix);
    
    await pool.query("INSERT INTO accesorios (codAccesorio, codCategoria, descripcion) VALUES ($1, $2, $3)", [id, codCategoria, descripcion]);
    res.status(201).json({ message: 'Accesorio creado', id });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/accesorios-master/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { codCategoria, descripcion } = req.body;
    await pool.query('UPDATE accesorios SET codCategoria=$1, descripcion=$2 WHERE codAccesorio=$3', [codCategoria, descripcion, id]);
    res.json({ message: 'Accesorio actualizado' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/accesorios-master/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM accesorios WHERE codAccesorio=$1', [id]);
    res.json({ message: 'Accesorio eliminado' });
  } catch (err) { handleDbError(res, err); }
});

// 4. INVENTARIO (STOCK)
app.get('/api/inventory/stock', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.codinventario as "codInventario", i.codaccesorio as "codAccesorio", i.cantidad, 
        i.preciocompra as "precioCompra", i.precioventa as "precioVenta", 
        i.codproveedor as "codProveedor", i.fecha, i.idubicacion, i.estado,
        a.descripcion, c.tipo as categoria, 
        u.nombre as "nombreUbicacion", u.estante, u.nivel
      FROM inventario i
      JOIN accesorios a ON i.codAccesorio = a.codAccesorio
      JOIN categoria c ON a.codCategoria = c.codCategoria
      JOIN ubicacion u ON i.idubicacion = u.idUbicacion
      ORDER BY i.codInventario DESC
    `);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/stock', authenticateToken, async (req, res) => {
  try {
    const { codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, idubicacion } = req.body;
    const codInventario = await generateNextId('inventario', 'codInventario', 'ACCS'); 
    const fecha = new Date();
    
    await pool.query(
      `INSERT INTO inventario (codInventario, codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, fecha, idubicacion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Disponible')`,
      [codInventario, codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, fecha, idubicacion]
    );
    res.status(201).json({ message: 'Stock agregado', id: codInventario });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/stock/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad, precioCompra, precioVenta, codProveedor, idubicacion } = req.body;
    await pool.query(
      `UPDATE inventario SET cantidad=$1, precioCompra=$2, precioVenta=$3, codProveedor=$4, idubicacion=$5 
       WHERE codInventario=$6`,
      [cantidad, precioCompra, precioVenta, codProveedor, idubicacion, id]
    );
    res.json({ message: 'Stock actualizado' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/stock/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM inventario WHERE codInventario=$1', [id]);
    res.json({ message: 'Registro de stock eliminado' });
  } catch (err) { handleDbError(res, err); }
});

// 5. UBICACIONES
app.get('/api/inventory/ubicaciones', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT idubicacion as "idUbicacion", nombre, descripcion, estante, nivel, estado FROM ubicacion ORDER BY idUbicacion ASC');
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/ubicaciones', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion, estante, nivel } = req.body;
    const idUbicacion = await generateNextId('ubicacion', 'idUbicacion', 'UBIC');
    await pool.query(
      "INSERT INTO ubicacion (idUbicacion, nombre, descripcion, estante, nivel, estado) VALUES ($1, $2, $3, $4, $5, 'Activo')",
      [idUbicacion, nombre, descripcion, estante, nivel]
    );
    res.status(201).json({ message: 'Ubicación creada', id: idUbicacion });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/ubicaciones/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estante, nivel } = req.body;
    await pool.query(
      'UPDATE ubicacion SET nombre=$1, descripcion=$2, estante=$3, nivel=$4 WHERE idUbicacion=$5',
      [nombre, descripcion, estante, nivel, id]
    );
    res.json({ message: 'Ubicación actualizada' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/ubicaciones/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM ubicacion WHERE idUbicacion=$1', [id]);
    res.json({ message: 'Ubicación eliminada' });
  } catch (err) { handleDbError(res, err); }
});

// 6. UNIFIED PRODUCTS
app.get('/api/productos/unificados', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT codigo as id, 'TELEFONO' as tipo, (marca || ' ' || modelo) as nombre, codigo, precioventa as "precioVenta", 1 as stock, imei1 as imei, idubicacion as ubicacion
      FROM telefonos WHERE estado = 'Disponible'
      UNION ALL
      SELECT i.codinventario as id, 'ACCESORIO' as tipo, a.descripcion as nombre, i.codinventario as codigo, i.precioventa as "precioVenta", i.cantidad as stock, NULL as imei, i.idubicacion as ubicacion
      FROM inventario i
      JOIN accesorios a ON i.codAccesorio = a.codAccesorio
      WHERE i.estado = 'Disponible' AND i.cantidad > 0
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
     const result = await pool.query('SELECT codproveedor as "codProveedor", nombre FROM proveedores'); 
     res.json(result.rows);
  } catch (e) {
     res.json([{codProveedor: 'PROV-001', nombre: 'Proveedor General'}]);
  }
});

// --- SETUP ---
app.get('/api/setup/install', async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS roles (idrol varchar(100) PRIMARY KEY, nombre varchar(50) NOT NULL, estado varchar(20) NOT NULL DEFAULT 'Activo');`);
    await pool.query(`CREATE TABLE IF NOT EXISTS caja (idCaja varchar(100) PRIMARY KEY, nombre varchar(50) NOT NULL, estado varchar(50) NOT NULL DEFAULT 'Activa');`);
    await pool.query(`CREATE TABLE IF NOT EXISTS empleado (identidad varchar(20) PRIMARY KEY, nombre varchar(30) NOT NULL, apellido varchar(30) NOT NULL, direccion varchar(100) NOT NULL, telefono varchar(20) NOT NULL, estado varchar(20) NOT NULL DEFAULT 'Activo', fechaCreacion timestamp NOT NULL DEFAULT NOW(), fechaModificacion timestamp);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (codUsuario varchar(100) PRIMARY KEY, usuario varchar(100) NOT NULL, password varchar(100) NOT NULL, identidad varchar(20) NOT NULL, idCaja varchar(100) NOT NULL, idrol varchar(100) NOT NULL, foto bytea, fechaCreacion timestamp NOT NULL DEFAULT NOW(), fechaModificacion timestamp, estado varchar(20) NOT NULL DEFAULT 'Activo');`);
    
    await pool.query(`CREATE TABLE IF NOT EXISTS ubicacion (idUbicacion varchar(100) PRIMARY KEY, nombre varchar(50) NOT NULL, descripcion varchar(100) NOT NULL, estante varchar(50) NOT NULL, nivel varchar(50) NOT NULL, estado varchar(20) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS categoria (codCategoria varchar(50) PRIMARY KEY, tipo varchar(30) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS accesorios (codAccesorio varchar(100) PRIMARY KEY, codCategoria varchar(50) NOT NULL, descripcion varchar(100) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS telefonos (codigo varchar(100) PRIMARY KEY, imei1 varchar(50) NOT NULL, imei2 varchar(50) NOT NULL, marca varchar(50) NOT NULL, modelo varchar(50) NOT NULL, precioCompra numeric(10,2) NOT NULL, precioVenta numeric(10,2) NOT NULL, codProveedor varchar(50) NOT NULL, fecha date NOT NULL, idubicacion varchar(100) NOT NULL, estado varchar(20) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS inventario (codInventario varchar(100) PRIMARY KEY, codAccesorio varchar(100), cantidad integer NOT NULL, precioCompra numeric(10,2) NOT NULL, precioVenta numeric(10,2) NOT NULL, codProveedor varchar(50) NOT NULL, fecha date NOT NULL, idubicacion varchar(100) NOT NULL, estado varchar(100) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS proveedores (codProveedor varchar(50) PRIMARY KEY, nombre varchar(100) NOT NULL);`);
    
    await pool.query("INSERT INTO proveedores (codProveedor, nombre) VALUES ('PROV-GEN', 'General') ON CONFLICT DO NOTHING");
    await pool.query("INSERT INTO ubicacion (idUbicacion, nombre, descripcion, estante, nivel, estado) VALUES ('UBIC-0001', 'Vitrina Principal', 'Entrada', '1', '1', 'Activo') ON CONFLICT DO NOTHING");
    
    res.send('✅ Tablas de Inventario Actualizadas Correctamente');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error Setup: ' + err.message);
  }
});

app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port}`);
});