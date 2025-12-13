
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configs y Middleware
const { pool } = require('./config/db');
const { authenticateToken, JWT_SECRET } = require('./middleware/auth');

// Rutas Modulares
const adminRoutes = require('./routes/adminRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const salesRoutes = require('./routes/salesRoutes');
const financeRoutes = require('./routes/financeRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const labelRoutes = require('./routes/labelRoutes'); 

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- INICIALIZACIÓN BD ---
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

            CREATE TABLE IF NOT EXISTS label_templates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50) DEFAULT 'GENERAL', 
                type VARCHAR(50) DEFAULT 'LABEL', 
                data_source VARCHAR(50) DEFAULT 'NONE', 
                is_default BOOLEAN DEFAULT FALSE,
                width NUMERIC(10,2) NOT NULL,
                height NUMERIC(10,2) NOT NULL,
                elements JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            -- TABLA DE CONFIGURACIÓN EMPRESA (SAR HONDURAS)
            CREATE TABLE IF NOT EXISTS configuracion (
                id SERIAL PRIMARY KEY,
                nombreEmpresa VARCHAR(200) NOT NULL,
                rtn VARCHAR(50),
                direccion TEXT,
                telefono VARCHAR(50),
                correo VARCHAR(100),
                cai VARCHAR(100),
                rangoInicial VARCHAR(50),
                rangoFinal VARCHAR(50),
                fechaLimite DATE,
                isv INTEGER DEFAULT 15,
                mensajeFinal TEXT DEFAULT 'LA FACTURA ES BENEFICIO DE TODOS, EXIJALA'
            );
            
            -- Migraciones seguras y Seed Inicial
            DO $$ 
            BEGIN 
                -- Verificar si existe configuración, sino crear default
                IF NOT EXISTS (SELECT 1 FROM configuracion LIMIT 1) THEN
                    INSERT INTO configuracion (nombreEmpresa, rtn, direccion, telefono, isv)
                    VALUES ('SMARTCLOUD', '00000000000000', 'Mercado Nuevo-Avenida Valle', '+504-00000000', 15);
                END IF;

                BEGIN
                    ALTER TABLE label_templates ADD COLUMN category VARCHAR(50) DEFAULT 'GENERAL';
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE label_templates ADD COLUMN type VARCHAR(50) DEFAULT 'LABEL';
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE label_templates ADD COLUMN data_source VARCHAR(50) DEFAULT 'NONE';
                EXCEPTION WHEN duplicate_column THEN NULL; END;
            END $$;

            -- INSERCIÓN DE NUEVOS PERMISOS
            INSERT INTO permisos (idPermiso, nombre, modulo)
            VALUES 
            ('DISEÑAR_ETIQUETAS', 'Diseñar Etiquetas y Reportes', 'Logística'),
            ('GESTIONAR_PANEL_CAJAS', 'Gestionar y Auditar Cajas', 'Finanzas'),
            ('ANULAR_VENTA', 'Anular Facturas', 'Ventas'),
            ('CONFIGURAR_EMPRESA', 'Configurar Empresa/SAR', 'Administración')
            ON CONFLICT (idPermiso) DO NOTHING;
        `);
    } catch (err) { console.error("Error init DB:", err); }
};
initDB();

// --- AUTH ROUTE (Login) ---
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const query = `
      SELECT u.codUsuario as "codUsuario", u.usuario, u.password, u.identidad, u.idCaja as "idCaja", u.idrol, u.estado,
        r.nombre as "rol_nombre", e.nombre as "emp_nombre", e.apellido as "emp_apellido"
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
    if (userRaw.password && userRaw.password.startsWith('$2a$')) {
        validPassword = await bcrypt.compare(password, userRaw.password);
    } else {
        validPassword = (userRaw.password === password);
    }

    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const permResult = await pool.query(`SELECT idPermiso FROM rol_permisos WHERE idRol = $1`, [userRaw.idrol]);
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
    console.error(err);
    res.status(500).json({ error: 'Error interno en login' }); 
  }
});

// --- MONTAJE DE RUTAS ---
app.use('/api', adminRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', salesRoutes);
app.use('/api', financeRoutes);
app.use('/api', reportsRoutes);
app.use('/api', labelRoutes); 

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'build', 'index.html')); });

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port} (Modular Mode)`);
});
