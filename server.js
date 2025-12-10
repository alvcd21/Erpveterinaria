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

// --- MIDDLEWARE DE SEGURIDAD ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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
  console.log(`🔹 Intento de login para usuario: ${usuario}`);

  try {
    // NOTA: Postgres devuelve nombres de columnas en minúsculas por defecto.
    // Usamos alias (AS) o mapeamos manualmente abajo.
    const query = `
      SELECT 
        u."codUsuario", u.usuario, u.password, u.estado,
        r.nombre as rol_nombre, 
        e.nombre as emp_nombre, e.apellido as emp_apellido
      FROM usuarios u
      JOIN roles r ON u.idrol = r.idrol
      JOIN empleado e ON u.identidad = e.identidad
      WHERE u.usuario = $1
    `;
    
    const result = await pool.query(query, [usuario]);
    
    // Postgres devuelve las claves en minúsculas si no se citaron en el CREATE TABLE, 
    // pero aquí las manejamos con cuidado.
    const userRaw = result.rows[0];

    if (!userRaw) {
      console.warn('⚠️ Usuario no encontrado en BD');
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    if (userRaw.estado !== 'Activo') {
       console.warn('⚠️ Usuario inactivo');
       return res.status(401).json({ error: 'Usuario inactivo' });
    }

    // Verificar password (soporta legacy texto plano y nuevo bcrypt)
    let validPassword = false;
    // Postgres keys are lowercase: userRaw.password
    const storedPass = userRaw.password;

    if (storedPass.startsWith('$2a$')) {
      validPassword = await bcrypt.compare(password, storedPass);
    } else {
      // Fallback para contraseñas viejas sin encriptar (Migración)
      console.log('ℹ️ Verificando contraseña en texto plano (Legacy)');
      validPassword = (storedPass === password);
    }

    if (!validPassword) {
      console.warn('⚠️ Contraseña incorrecta');
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Mapeo seguro de datos para el Frontend (CamelCase)
    // Postgres: userRaw.codusuario vs Frontend: user.codUsuario
    const userData = {
        codUsuario: userRaw.codUsuario || userRaw.codusuario, // Fallback por casing
        usuario: userRaw.usuario,
        rol: userRaw.rol_nombre,
        nombreEmpleado: `${userRaw.emp_nombre} ${userRaw.emp_apellido}`
    };

    console.log('✅ Login exitoso:', userData.usuario, userData.rol);

    // Generar Token JWT
    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      token,
      user: userData
    });

  } catch (err) {
    console.error('❌ Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- ADMIN USERS ENDPOINTS ---

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT u."codUsuario", u.usuario, u.identidad, u."idCaja", u.idrol, u.estado,
             e.nombre || ' ' || e.apellido as "nombreEmpleado",
             r.nombre as "nombreRol"
      FROM usuarios u
      JOIN empleado e ON u.identidad = e.identidad
      JOIN roles r ON u.idrol = r.idrol
      ORDER BY u.usuario ASC
    `;
    const result = await pool.query(query);
    res.json(result.rows.map(row => ({
        // Mapper manual para asegurar camelCase hacia el frontend
        codUsuario: row.codUsuario || row.codusuario,
        usuario: row.usuario,
        identidad: row.identidad,
        idCaja: row.idCaja || row.idcaja,
        idrol: row.idrol,
        estado: row.estado,
        nombreEmpleado: row.nombreEmpleado || row.nombreempleado,
        nombreRol: row.nombreRol || row.nombrerol
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    const { codUsuario, usuario, password, identidad, idCaja, idrol } = req.body;
    
    // Hash password antes de guardar
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Asumimos fechas actuales
    const fecha = new Date();

    const query = `
      INSERT INTO usuarios ("codUsuario", usuario, password, identidad, "idCaja", idrol, "fechaCreacion", estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Activo')
    `;
    
    await pool.query(query, [codUsuario, usuario, hashedPassword, identidad, idCaja, idrol, fecha]);
    res.status(201).json({ message: 'Usuario creado exitosamente' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando usuario' });
  }
});

app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM roles WHERE estado = 'Activo'");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo roles' });
  }
});

app.get('/api/empleados', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM empleado WHERE estado = 'Activo'");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo empleados' });
  }
});

app.get('/api/cajas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM caja WHERE estado = 'Activa'");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo cajas' });
  }
});

// --- CORE ENDPOINTS (Protected) ---

app.get('/api/productos/unificados', authenticateToken, async (req, res) => {
  try {
    // Nota: Ajustar nombres de columnas si es necesario
    const query = `
      SELECT 
        t.codigo as id, 'TELEFONO' as tipo, CONCAT(t.marca, ' ', t.modelo) as nombre,
        t.codigo, t."precioVenta" as "precioVenta", CASE WHEN t.estado = 'Disponible' THEN 1 ELSE 0 END as stock,
        t.imei1 as imei, u.nombre as ubicacion
      FROM telefonos t
      LEFT JOIN ubicacion u ON t.idubicacion = u."idUbicacion"
      WHERE t.estado = 'Disponible'
      UNION ALL
      SELECT 
        a."codAccesorio" as id, 'ACCESORIO' as tipo, a.descripcion as nombre,
        a."codAccesorio" as codigo, i."precioVenta" as "precioVenta", i.cantidad as stock,
        NULL as imei, u.nombre as ubicacion
      FROM inventario i
      JOIN accesorios a ON i."codAccesorio" = a."codAccesorio"
      LEFT JOIN ubicacion u ON i.idubicacion = u."idUbicacion"
      WHERE i.estado = 'Activo'
    `;
    const result = await pool.query(query);
    res.json(result.rows.map(r => ({
      ...r,
      precioVenta: parseFloat(r.precioVenta) // Postgres numeric returns as string
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
});

app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

app.post('/api/ventas', authenticateToken, async (req, res) => {
  res.status(200).json({ message: 'Simulated success' });
});

// --- SERVIR FRONTEND ---
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port}`);
});