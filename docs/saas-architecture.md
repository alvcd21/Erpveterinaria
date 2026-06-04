# Farmacia ERP — Arquitectura SaaS Multi-Tenancy

**Versión:** 1.0.0  
**Fecha:** 2026-05-06  
**Estado:** Diseño aprobado — listo para implementación en fases

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estrategia de Aislamiento de Datos](#2-estrategia-de-aislamiento-de-datos)
3. [Resolución de Tenant](#3-resolución-de-tenant)
4. [Tiers de Suscripción](#4-tiers-de-suscripción)
5. [Flujo de Autenticación](#5-flujo-de-autenticación)
6. [Arquitectura de Base de Datos](#6-arquitectura-de-base-de-datos)
7. [Infraestructura en Render.com](#7-infraestructura-en-rendercom)
8. [Fases de Migración](#8-fases-de-migración)
9. [Seguridad](#9-seguridad)
10. [Operaciones y Monitoreo](#10-operaciones-y-monitoreo)

---

## 1. Resumen Ejecutivo

El sistema Farmacia ERP se convierte en una plataforma SaaS donde distintas cadenas de farmacias (tenants) comparten la misma aplicación y base de datos, con aislamiento completo de datos garantizado a nivel de base de datos mediante Row-Level Security (RLS) de PostgreSQL.

Cada tenant paga una suscripción mensual según su plan (Básico / Profesional / Enterprise) y obtiene:

- Instancia lógica completamente aislada dentro de la aplicación compartida
- Subdominios dedicados (`mifarma.erpfarmacia.com`)
- Datos que nunca son visibles por otros tenants, incluso si ocurre un error en la capa de aplicación
- Límites de uso configurables por plan (sucursales, usuarios, medicamentos)

---

## 2. Estrategia de Aislamiento de Datos

### Modelos considerados

| Modelo | Descripción | Costo infra | Aislamiento | Complejidad ops |
|--------|-------------|-------------|-------------|-----------------|
| Base de datos por tenant | Cada tenant tiene su propia DB | Muy alto | Máximo | Alta |
| Schema por tenant | Una DB, un schema por tenant | Alto | Alto | Media |
| **Shared schema + RLS** | Una DB, una schema, RLS en cada tabla | **Bajo** | **Alto** | **Baja** |

### Por qué Shared Schema + RLS

**Razón 1: Costo operativo.** Render.com cobra por instancia de PostgreSQL. Con database-per-tenant, 20 farmacias = 20 bases de datos = costo prohibitivo para un producto que arranca en Honduras con precios en Lempiras.

**Razón 2: RLS es aislamiento real en la base de datos.** A diferencia de filtrar solo en la capa de aplicación, el RLS de PostgreSQL garantiza que una query sin `app.current_tenant_id` configurado retorna cero filas. Es imposible para un bug en Node.js filtrar datos del tenant incorrecto si el contexto no está configurado.

**Razón 3: Mantenimiento de esquema centralizado.** Una sola migración SQL actualiza todos los tenants simultáneamente. Con schema-per-tenant habría que ejecutar migraciones N veces (una por schema).

**Razón 4: Escala natural hasta 200-500 tenants** sin cambios de arquitectura. Por encima de ese número se evalúa sharding por tenant_id o database-per-tenant solo para los enterprise más grandes.

### Implementación RLS

Cada tabla con datos de negocio tiene:

```sql
-- Columna discriminadora
tenant_id UUID NOT NULL REFERENCES tenants(id)

-- RLS habilitado y forzado (forzado = aplica también al owner de la tabla)
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas FORCE ROW LEVEL SECURITY;

-- Política que cubre todos los comandos DML
CREATE POLICY policy_ventas ON ventas
    FOR ALL
    USING (rls_bypass_active() OR tenant_id = current_tenant_id())
    WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id());
```

La función `current_tenant_id()` lee la variable de sesión `app.current_tenant_id`, que el backend configura al inicio de cada transacción:

```sql
SELECT set_tenant_context('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
```

La función `rls_bypass_active()` permite a los endpoints de super-admin operar sobre todos los tenants:

```sql
SELECT set_tenant_context(NULL, TRUE);  -- bypass = true
```

### Tablas globales (sin RLS de tenant)

Las siguientes tablas son catálogos que pueden ser compartidos entre todos los tenants o que están fuera del scope de datos de negocio:

- `tenants` — la propia tabla maestra (RLS especial: un tenant solo se ve a sí mismo)
- `permisos` — catálogo global de permisos del sistema (tenant_id = NULL = global)
- `saas_audit_log` — log de auditoría SaaS (solo accesible por super-admin)
- `login_intentos` — log de seguridad (acceso solo por el sistema)
- `principios_activos` — catálogo farmacológico global (sin tenant_id)

---

## 3. Resolución de Tenant

El backend necesita saber a qué tenant pertenece cada request antes de configurar el contexto RLS. Se usan tres mecanismos en cascada:

### Mecanismo 1: JWT (principal, para usuarios autenticados)

Después del login, el JWT contiene el `tenantId` (UUID). Todos los requests autenticados llevan este token. El middleware extrae el `tenantId` del payload sin necesidad de otro header.

```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

Payload JWT:
```json
{
  "codUsuario": 5,
  "usuario": "maria.garcia",
  "rol": "Farmaceutico",
  "idCaja": "CAJA-001",
  "tenantId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  "tenantSlug": "farmacia-norte",
  "permisos": ["perm_ventas_crear", "perm_recetas_dispensar"],
  "iat": 1746518400,
  "exp": 1746519300
}
```

### Mecanismo 2: Header X-Tenant-ID (para integraciones API)

Clientes de API que no tienen JWT activo (webhooks de Stripe, integraciones externas) envían el slug del tenant:

```
X-Tenant-ID: farmacia-norte
```

El backend resuelve el UUID desde el slug con una query a `tenants`.

### Mecanismo 3: Subdominio (para rutas del frontend)

Cuando el usuario accede desde `farmacia-norte.erpfarmacia.com`, el backend extrae el slug del header `Host`:

```javascript
// middleware/tenant.js
const host = req.headers['host'] || '';
const subdomain = host.split('.')[0];
if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
    tenantSlug = subdomain;
}
```

### Orden de precedencia

```
1. JWT payload.tenantId     (más confiable, firmado criptográficamente)
2. X-Tenant-ID header       (para API keys / integraciones)
3. Subdominio del Host      (para páginas de login antes de autenticarse)
```

### Flujo completo de resolución

```
Request llega
     |
     v
¿Tiene Authorization Bearer?
     |-- SI --> Verificar JWT
     |               |-- Válido: usar tenantId del payload
     |               |-- Inválido: 401 Unauthorized
     |
     |-- NO --> ¿Tiene X-Tenant-ID header?
                    |-- SI --> Buscar tenant por slug en DB
                    |-- NO --> Extraer subdominio del Host
                                    |-- Encontrado: buscar por slug
                                    |-- No encontrado: 400 Bad Request
     |
     v
¿Tenant activo y plan vigente?
     |-- NO --> 402 Payment Required / 403 Suspended
     |-- SI --> SET LOCAL app.current_tenant_id = tenantId
                     |
                     v
                 Ejecutar request
```

---

## 4. Tiers de Suscripción

### Plan Básico — L. 1,500/mes

Orientado a farmacias independientes con una sola ubicación.

| Límite | Valor |
|--------|-------|
| Sucursales activas | 1 |
| Usuarios simultáneos | 5 |
| Medicamentos en catálogo | 500 |
| Soporte | Email, 48h respuesta |
| Módulos incluidos | POS, Inventario, Clientes, Reportes básicos |
| Módulos excluidos | IA/Predictor, Backup Drive automático, Branding custom |

### Plan Profesional — L. 3,500/mes

Para cadenas pequeñas y medianas con varias sucursales.

| Límite | Valor |
|--------|-------|
| Sucursales activas | 3 |
| Usuarios simultáneos | 15 |
| Medicamentos en catálogo | 2,000 |
| Soporte | Email + WhatsApp, 24h respuesta |
| Módulos incluidos | Todo el Básico + Predictor IA de reabastecimiento, Transferencias entre sucursales, Recetas controladas (Libro JNCD), Órdenes de compra PDF |
| Módulos excluidos | Backup Drive automático, Branding custom |

### Plan Enterprise — L. 7,500/mes

Para cadenas grandes, hospitales, distribuidoras.

| Límite | Valor |
|--------|-------|
| Sucursales activas | Sin límite (999 en DB) |
| Usuarios simultáneos | Sin límite |
| Medicamentos en catálogo | Sin límite |
| Soporte | Prioridad máxima, línea directa, SLA 4h |
| Módulos incluidos | Todo lo anterior + Backup automático Google Drive, Branding custom (logo, colores), API acceso directo, Integraciones Stripe, Reportes financieros avanzados, Multi-regente (múltiples directores técnicos) |

### Validación de límites en tiempo real

El backend valida antes de crear recursos:

```javascript
// En el route de crear sucursal:
const limite = await pool.query(
    'SELECT check_tenant_limit($1, $2)',
    [req.user.tenantId, 'sucursales']
);
if (!limite.rows[0].check_tenant_limit.ok) {
    return res.status(402).json({
        error: 'Límite de sucursales alcanzado',
        plan: req.user.plan,
        limite: limite.rows[0].check_tenant_limit
    });
}
```

La función `check_tenant_limit()` vive en la DB (creada en la migración) y verifica también si el plan está vigente.

---

## 5. Flujo de Autenticación

### Login con tenant

El request de login ahora incluye el slug del tenant para resolver el contexto antes de validar credenciales:

```http
POST /api/auth/login
Content-Type: application/json

{
  "tenantSlug": "farmacia-norte",
  "usuario": "maria.garcia",
  "password": "SuperSecure123!"
}
```

### Flujo backend del login

```
1. Resolver tenant por slug:
   SELECT id, estado, plan, fecha_vencimiento
   FROM tenants WHERE slug = $1

2. Validar que el tenant esté activo:
   IF estado != 'activo' OR fecha_vencimiento < today → 402

3. SET LOCAL app.current_tenant_id = tenant.id
   (el RLS ya filtra usuarios solo del tenant correcto)

4. Buscar usuario:
   SELECT * FROM usuarios
   WHERE usuario = $1 AND estado = 'Activo'
   -- RLS filtra automáticamente por tenant_id

5. Verificar bcrypt(password, usuarios.password)

6. Generar JWT con payload:
   {
     codUsuario, usuario, rol, idCaja,
     tenantId: tenant.id,
     tenantSlug: tenant.slug,
     plan: tenant.plan,
     permisos: [...],
     iat, exp (15 min)
   }

7. Generar Refresh Token (7 días):
   {
     codUsuario,
     tenantId: tenant.id,
     type: 'refresh'
   }

8. Retornar { token, refreshToken, user, tenant }
```

### Refresh de token

```http
POST /api/auth/refresh
Authorization: Bearer <refresh_token>

Respuesta: { token: <nuevo_jwt_15min> }
```

El refresh token no necesita `tenantSlug` porque el `tenantId` ya está en el payload del refresh token.

### Super-Admin JWT

El super-admin tiene un token especial con:

```json
{
  "codUsuario": 1,
  "usuario": "superadmin",
  "isSuperAdmin": true,
  "tenantId": null,
  "tenantSlug": null
}
```

El middleware detecta `isSuperAdmin: true` y llama `set_tenant_context(NULL, TRUE)` para activar el bypass de RLS.

---

## 6. Arquitectura de Base de Datos

### Esquema de tabla maestra

```
tenants
├── id          UUID PK
├── slug        VARCHAR(50) UNIQUE — "farmacia-norte"
├── nombre_empresa
├── plan        'basico' | 'profesional' | 'enterprise'
├── estado      'activo' | 'suspendido' | 'cancelado' | 'prueba'
├── max_sucursales / max_usuarios / max_medicamentos
├── fecha_vencimiento
├── stripe_customer_id / stripe_subscription_id
└── configuracion_extra  JSONB
```

### Patrón de tenant_id en tablas de negocio

Todas las tablas de negocio siguen el mismo patrón:

```
ventas
├── codVenta         VARCHAR(20) PK  (formato VNT-0001, único dentro del tenant)
├── tenant_id        UUID NOT NULL FK → tenants(id)
├── fecha            TIMESTAMPTZ
├── total            NUMERIC
└── ...
```

### Unicidades compuestas

Las PKs originales (VARCHAR(20), SERIAL) se mantienen para compatibilidad con el código existente. Se agregan constraints de unicidad compuesta donde es necesario:

| Tabla | Constraint original | Constraint multi-tenant |
|-------|---------------------|------------------------|
| `usuarios` | `UNIQUE(usuario)` | `UNIQUE(tenant_id, usuario)` |
| `sucursales` | `UNIQUE(codigo)` | `UNIQUE(tenant_id, codigo)` |
| `medicamentos` | PK `codigo` | `UNIQUE(tenant_id, codigo)` |
| `clientes` | PK `identidad` | `UNIQUE(tenant_id, identidad)` |

### Tablas excluidas de tenant_id (catálogos globales)

| Tabla | Razón |
|-------|-------|
| `principios_activos` | Catálogo DCI global, igual en todos los tenants |
| `ubicacion` | No referenciada en código activo |
| `login_intentos` | Log de seguridad, no tiene datos de negocio por tenant |
| `configuracion_cai_historial` | Historial fiscal, migrado a tenant scope indirectamente |
| `libro_psicofarmacos` | Requiere análisis regulatorio antes de agregar tenant_id |
| `recetas_retenidas` | Idem |

### Funciones de contexto

```sql
-- Configurar tenant al inicio de cada transacción
set_tenant_context(tenant_id TEXT, bypass_rls BOOLEAN DEFAULT FALSE)

-- Leer tenant activo
current_tenant_id() → UUID

-- Verificar límites de plan
check_tenant_limit(tenant_id UUID, recurso TEXT) → JSONB

-- Leer estado bypass
rls_bypass_active() → BOOLEAN
```

### Vistas de administración

```sql
tenant_plan_limits  -- Plan, fechas, si está activo
tenant_usage        -- Uso actual vs límites, porcentajes
```

---

## 7. Infraestructura en Render.com

### Configuración recomendada por componente

#### PostgreSQL

| Recurso | Actual | Recomendado SaaS |
|---------|--------|------------------|
| Plan | Free / Starter | Standard ($20/mes mínimo) |
| Almacenamiento | 1 GB | 20+ GB con auto-scale |
| Conexiones | 25 | 100+ (usar PgBouncer) |
| Backups | Manual | Automático diario + PITR |

El plan Standard de Render incluye backups diarios automáticos con retención de 7 días y Point-in-Time Recovery. Esto es requisito mínimo para datos de clientes de pago.

#### Web Service (Node.js)

| Configuración | Valor |
|---------------|-------|
| Plan | Starter ($7/mes) → Standard ($25/mes) |
| Auto-scaling | Activar en Standard |
| Health check path | `/api/health` |
| Variables de entorno | Ver sección 9 |

Se recomienda escalar horizontalmente (múltiples instancias) antes que verticalmente. Node.js con Express puede manejar ~200 req/s por instancia con el pool de 20 conexiones configurado.

#### Redis (opcional pero recomendado)

Usar Redis para:

- Cache de resolución de tenant por slug (evita query a DB en cada request)
- Blacklist de tokens revocados
- Rate limiting distribuido entre instancias

Render ofrece Redis como add-on ($10/mes por instancia mínima).

```javascript
// Cache de tenant resolution (TTL 5 minutos)
const cacheKey = `tenant:slug:${slug}`;
let tenant = await redis.get(cacheKey);
if (!tenant) {
    tenant = await pool.query('SELECT * FROM tenants WHERE slug = $1', [slug]);
    await redis.set(cacheKey, JSON.stringify(tenant.rows[0]), 'EX', 300);
}
```

#### CDN (Cloudflare)

Configurar Cloudflare en frente del dominio `erpfarmacia.com`:

- Free tier es suficiente para el tráfico inicial
- Wildcard DNS: `*.erpfarmacia.com` → Render Web Service
- Cache de assets estáticos (imágenes, JS, CSS)
- DDoS protection gratuita
- SSL automático

#### Arquitectura de red

```
Usuario
  |
  v
Cloudflare (CDN + DDoS + SSL)
  |
  v
*.erpfarmacia.com → Render Web Service (Node.js)
                              |
                    +---------+---------+
                    |                   |
              Render PostgreSQL    Render Redis
              (primary + replica   (session cache)
               para reportes)
```

### Variables de entorno requeridas

```bash
# Seguridad
JWT_SECRET=<mínimo 64 bytes aleatorios>
REFRESH_SECRET=<mínimo 64 bytes aleatorios>
SAAS_ADMIN_SECRET=<para endpoints de super-admin>

# Base de datos
DATABASE_URL=<connection string Render PostgreSQL>
DB_INTERNAL_URL=<connection string internal Render>

# Redis (opcional)
REDIS_URL=<connection string Render Redis>

# Stripe (fase 4)
STRIPE_SECRET_KEY=<sk_live_...>
STRIPE_WEBHOOK_SECRET=<whsec_...>

# Email
RESEND_API_KEY=<re_...>

# CORS
ALLOWED_ORIGINS=https://app.erpfarmacia.com,https://*.erpfarmacia.com

# Feature flags
ENABLE_AI_FEATURES=true
ENABLE_DRIVE_BACKUP=true
```

---

## 8. Fases de Migración

La migración se divide en cuatro fases independientes, cada una desplegable sin downtime.

### Fase 1: DB + Middleware (no-breaking)

**Duración estimada:** 1-2 días de desarrollo + 1 hora de deployment

**Alcance:**
- Ejecutar `scripts/saas_migration.sql` sobre la DB de producción existente
- Crear `middleware/tenant.js` con resolución de tenant y set_tenant_context
- Agregar `tenantId` al payload del JWT (backward-compatible: si no existe, asumir tenant default)
- El tenant default (UUID `00000000-...`) mapea a los datos existentes
- El frontend no cambia

**Criterio de éxito:** La aplicación funciona exactamente igual que antes para el tenant actual. Los logs muestran `app.current_tenant_id` configurado en cada request.

**Rollback:** Ejecutar `ALTER TABLE ventas DISABLE ROW LEVEL SECURITY` en las tablas afectadas. No hay pérdida de datos.

---

### Fase 2: Rutas tenant-scoped + Auth actualizado

**Duración estimada:** 3-5 días de desarrollo

**Alcance:**
- Actualizar el endpoint `/api/auth/login` para aceptar `tenantSlug`
- Agregar `tenantId` y `tenantSlug` al JWT
- Agregar `tenantId` a todos los `INSERT` del backend (para WITH CHECK del RLS)
- Actualizar `generateNextId()` para incluir `tenant_id` en la query (evitar colisiones de IDs entre tenants)
- Agregar validación de límites de plan antes de crear sucursales, usuarios, medicamentos
- Actualizar el frontend de login para mostrar campo de "Código de empresa" o usar subdominio

**Cambios clave en el backend:**

```javascript
// middleware/tenant.js
module.exports = async function tenantMiddleware(req, res, next) {
    const client = await pool.connect();
    try {
        // Extraer tenantId del JWT (preferido) o header
        const tenantId = req.user?.tenantId
            || await resolveTenantFromHeader(req.headers['x-tenant-id'])
            || await resolveTenantFromHost(req.headers['host']);

        if (!tenantId) return res.status(400).json({ error: 'Tenant no identificado' });

        await client.query('BEGIN');
        await client.query('SELECT set_tenant_context($1)', [tenantId]);

        req.tenantId = tenantId;
        req.dbClient = client;  // pasar cliente con transacción ya iniciada

        res.on('finish', async () => {
            await client.query('COMMIT');
            client.release();
        });
        res.on('close', () => client.release());

        next();
    } catch (err) {
        await client.query('ROLLBACK');
        client.release();
        next(err);
    }
};
```

**Criterio de éxito:** Un usuario de "Farmacia Norte" no puede ver datos de "Farmacia Sur", incluso si modifica el JWT manualmente (el RLS lo bloquea a nivel de DB).

---

### Fase 3: Portal de gestión de tenants

**Duración estimada:** 1 semana de desarrollo

**Alcance:**
- Página de registro de nueva farmacia (crear tenant en `tenants`)
- Dashboard de super-admin:
  - Lista de todos los tenants con estado, plan, uso
  - Activar / suspender / cambiar plan de un tenant
  - Ver métricas desde la vista `tenant_usage`
- Portal de onboarding para nuevos tenants:
  - Configuración inicial (nombre empresa, CAI, logo)
  - Creación del primer usuario administrador
  - Creación de la primera sucursal
- Email de bienvenida vía Resend

**Criterio de éxito:** Un nuevo cliente puede registrarse, pagar (si hay tarjeta de crédito habilitada) y estar operativo en menos de 10 minutos sin intervención manual.

---

### Fase 4: Stripe + Aprovisionamiento automático

**Duración estimada:** 1-2 semanas de desarrollo

**Alcance:**
- Integrar Stripe Checkout para cobro de suscripciones
- Webhook de Stripe para:
  - `customer.subscription.created` → activar tenant, email bienvenida
  - `customer.subscription.deleted` → suspender tenant, email aviso
  - `invoice.payment_failed` → notificar administrador del tenant
  - `customer.subscription.updated` → actualizar plan, ajustar límites
- Página de gestión de suscripción para el administrador del tenant (ver plan, cambiar plan, descargar facturas)
- Facturación automática en Lempiras con conversión de tipo de cambio del BCH

**Criterio de éxito:** Un cliente puede suscribirse, ser cobrado automáticamente cada mes, y el sistema se suspende automáticamente si el pago falla después de 3 intentos.

---

## 9. Seguridad

### Aislamiento entre tenants

El principal riesgo en un sistema multi-tenant compartido es la fuga de datos cross-tenant. Las capas de defensa son:

**Capa 1 — RLS en PostgreSQL (más robusta):** Aunque el código de aplicación tenga un bug y no filtre por `tenant_id`, el RLS bloquea la consulta. Si `app.current_tenant_id` no coincide con el `tenant_id` de una fila, esa fila simplemente no existe para la query.

**Capa 2 — `set_tenant_context()` obligatorio:** El middleware llama a `set_tenant_context()` antes de cualquier query. Si la función no se llama, `current_tenant_id()` retorna NULL y el RLS no deja pasar ninguna fila (la política `tenant_id = NULL` nunca es verdadera para una fila que tiene UUID).

**Capa 3 — Validación en la capa de aplicación:** Todos los INSERT incluyen `tenant_id = $tenantId` explícitamente. El `WITH CHECK` del RLS los rechazaría de todos modos, pero la validación en app sirve para mensajes de error claros.

**Capa 4 — JWT firmado con HS256:** El `tenantId` en el payload del JWT es firmado. Un usuario no puede cambiar su `tenantId` sin invalidar la firma.

**Capa 5 — `saas_audit_log`:** Cualquier operación crítica (cambio de plan, acceso cross-tenant por super-admin, suspensión) se registra con IP, usuario y datos relevantes.

### Prevención de bypass de RLS

El RLS está configurado con `FORCE ROW LEVEL SECURITY`, que significa que aplica incluso al owner de la tabla (el rol con el que corre la aplicación). Esto previene que un error en la gestión de roles de DB elimine el aislamiento.

El rol de la aplicación no debe tener `SUPERUSER` ni `BYPASSRLS`:

```sql
-- Al crear el rol de la aplicación:
CREATE ROLE erp_saas_app LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE farmacia_erp TO erp_saas_app;
GRANT USAGE ON SCHEMA public TO erp_saas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_saas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_saas_app;
-- NO GRANT SUPERUSER
-- NO GRANT BYPASSRLS
```

### Rate limiting por tenant

El rate limiter de Express actual es global. Se debe agregar rate limiting por tenant:

```javascript
const tenantLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: (req) => {
        // Enterprise tiene límite más alto
        const plan = req.user?.plan || 'basico';
        return { basico: 100, profesional: 300, enterprise: 1000 }[plan] || 100;
    },
    keyGenerator: (req) => req.user?.tenantId || req.ip,
    message: { error: 'Límite de requests alcanzado para este tenant' }
});
```

### Auditoría de acciones críticas

Se debe registrar en `saas_audit_log`:

- Cambios de plan de suscripción
- Acceso de super-admin a datos de un tenant
- Intentos de acceso con tenant suspendido
- Creación y eliminación de tenants
- Exportaciones masivas de datos

```javascript
async function auditLog(tenantId, tenantSlug, actor, accion, recurso, extras = {}) {
    await pool.query(`
        INSERT INTO saas_audit_log
            (tenant_id, tenant_slug, actor_usuario, actor_ip, accion, recurso_tabla, datos_extra)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [tenantId, tenantSlug, actor.usuario, actor.ip, accion, recurso, JSON.stringify(extras)]);
}
```

### Variables sensibles

- NUNCA hardcodear `JWT_SECRET`, `STRIPE_SECRET_KEY` ni `DATABASE_URL` en el código
- Usar variables de entorno de Render (cifradas en reposo)
- Rotar `JWT_SECRET` requiere invalidar todos los tokens activos — planificar con ventana de mantenimiento
- Los `stripe_customer_id` y `stripe_subscription_id` en `tenants` no son secretos (son IDs públicos de Stripe)

### HTTPS y TLS

- Cloudflare fuerza HTTPS en el edge (Free tier incluye SSL)
- Render fuerza HTTPS en su routing
- La cabecera `Strict-Transport-Security` ya está configurada en `server.js`
- La conexión interna entre Render Web Service y Render PostgreSQL es por red interna (sin SSL necesario, usando `DB_INTERNAL_URL`)

---

## 10. Operaciones y Monitoreo

### Health check endpoint

```javascript
// GET /api/health
app.get('/api/health', async (req, res) => {
    try {
        const dbCheck = await pool.query('SELECT 1');
        const tenantCount = await pool.query(
            'SELECT COUNT(*) FROM tenants WHERE estado = $1', ['activo']
        );
        res.json({
            status: 'ok',
            db: 'connected',
            tenants_activos: tenantCount.rows[0].count,
            uptime: process.uptime()
        });
    } catch (err) {
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});
```

### Métricas de negocio a monitorear

Desde la vista `tenant_usage` (ejecutar diariamente):

- Tenants que superan el 80% de uso de cualquier límite → alertar para upsell
- Tenants con `fecha_vencimiento` en los próximos 7 días → email de renovación
- Tenants sin ventas en 30 días → email de re-engagement

### Alertas operativas

| Alerta | Umbral | Acción |
|--------|--------|--------|
| Pool de conexiones DB > 80% | 16 de 20 conexiones | Escalar instancias o aumentar pool |
| Latencia P95 API > 500ms | Promedio móvil 5min | Revisar slow queries, escalar DB |
| Error rate > 1% | Por ruta en 5 min | PagerDuty / alerta Slack |
| Tenant con 0 sucursales activas | Al detectar | Verificar onboarding completado |

### Proceso de onboarding de un nuevo tenant

```
1. Cliente llena formulario en landing page
2. POST /api/admin/tenants  (autenticado como super-admin)
   {
     slug: "farmacia-centro",
     nombre_empresa: "Farmacia El Centro",
     email_contacto: "gerente@farmacentro.com",
     plan: "profesional"
   }
3. Sistema crea tenant en DB con estado = 'prueba'
4. Sistema crea usuario admin con contraseña temporal
5. Sistema crea configuración inicial (una fila en `configuracion`)
6. Sistema crea sucursal principal (una fila en `sucursales`)
7. Email de bienvenida a email_contacto con:
   - URL: farmacia-centro.erpfarmacia.com
   - Credenciales temporales
   - Enlace para completar onboarding
8. Tenant activo y listo para usar
```

### Proceso de suspensión

```
1. Stripe webhook: invoice.payment_failed (tercer intento)
   O super-admin llama: PATCH /api/admin/tenants/:id { estado: 'suspendido' }

2. UPDATE tenants SET estado = 'suspendido' WHERE id = ...

3. En el siguiente request del tenant, el middleware detecta:
   tenant.estado != 'activo' → 402 Payment Required

4. Los datos NO se eliminan (retención por 90 días)

5. Email al administrador del tenant con instrucciones de reactivación

6. Si pasa a 'cancelado', los datos se eliminan según política de retención (GDPR)
```

---

*Documento generado por el Architecture Agent del sistema Farmacia ERP SaaS.*  
*Revisar y actualizar con cada cambio de arquitectura relevante.*
