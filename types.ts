
// Mapped strictly from PostgreSQL Schema

// --- ENUMS & CONSTANTS ---
export type EstadoGeneral = 'Activo' | 'Inactivo';
export type EstadoInventario = 'Disponible' | 'Vendido' | 'Garantia' | 'Malo';

// --- AUTH & PERMISSIONS ---
export interface AuthResponse {
  token: string;
  user: UserSession;
}

export interface UserSession {
  codUsuario: string;
  usuario: string;
  rol: string;
  nombreEmpleado: string;
}

export interface LoginCredentials {
  usuario: string;
  password: string; 
}

// --- CORE ENTITIES ---
export interface Cliente {
  identidad: string; // PK
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  correo?: string;
  fechaCreacion?: string;
}

export interface Empleado {
  identidad: string; 
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  estado: EstadoGeneral;
  fechaCreacion?: string;
}

export interface Usuario {
  codUsuario: string; 
  usuario: string;
  password?: string; 
  identidad: string; 
  idCaja: string; 
  idrol: string; 
  estado: EstadoGeneral;
  nombreEmpleado?: string;
  nombreRol?: string;
  nombreCaja?: string;
}

export interface Rol {
  idrol: string;
  nombre: string;
  estado: EstadoGeneral;
}

export interface Proveedor {
  codProveedor: string;
  nombre: string;
  telefono: string;
  direccion: string;
}

// --- INVENTORY SCHEMA (STRICT) ---

export interface Ubicacion {
  idUbicacion: string; // PK
  nombre: string;
  descripcion: string;
  estante: string;
  nivel: string;
  estado: string;
}

export interface Categoria {
  codCategoria: string; // PK
  tipo: string;
}

export interface AccesorioMaster {
  codAccesorio: string; // PK
  codCategoria: string; // FK
  descripcion: string; // The name of the product
  // UI Helper
  nombreCategoria?: string;
}

export interface InventarioAccesorio {
  codInventario: string; // PK
  codAccesorio: string; // FK
  cantidad: number;
  precioCompra: number;
  precioVenta: number;
  codProveedor: string;
  fecha: string; // date
  idubicacion: string; // FK
  estado: string;
  // UI Helpers (Joined fields)
  descripcion?: string; 
  categoria?: string;
  nombreUbicacion?: string;
}

export interface Telefono {
  codigo: string; // PK (TELF-XXXX)
  imei1: string;
  imei2: string;
  marca: string;
  modelo: string;
  precioCompra: number;
  precioVenta: number;
  codProveedor: string;
  fecha: string;
  idubicacion: string;
  estado: string;
  // UI Helper
  nombreUbicacion?: string;
}

// Helper Type for POS Unified Search
export interface ProductoUnified {
  id: string; // codInventario OR codigo
  tipo: 'TELEFONO' | 'ACCESORIO';
  nombre: string; 
  codigo: string; // Display Code
  precioVenta: number;
  stock: number;
  imei?: string; 
  ubicacion?: string;
}

// --- SALES / POS ---

export interface VentaPayload {
  identidadCliente: string;
  tipoCompra: 'Contado' | 'Credito';
  total: number;
  isv: number;
  descuento: number;
  detalles: DetalleVenta[];
}

export interface Venta {
  codVenta: string;
  fecha: string;
  codUsuario: string;
  identidadCliente: string;
  tipoCompra: string;
  total: number;
  isv: number;
  descuento: number;
  estado: string;
  // UI Helpers
  nombreCliente?: string;
  usuario?: string;
}

export interface DetalleVenta {
  codDetalleVenta?: string; // Optional for new items
  idVenta?: string;
  idTelefono?: string; // If it's a phone
  idInventario?: string; // If it's an accessory (maps to codInventario)
  cantidad: number;
  precioVenta: number;
  descripcionProducto?: string; // UI Helper
  tipoProducto?: 'TELEFONO' | 'ACCESORIO'; // UI Helper
}

// --- CASH REGISTER ---

export interface Caja {
  idCaja: string;
  nombre: string;
  estado: string;
}

export interface Arqueo {
  idArqueo: string;
  idCaja: string;
  idUsuario: string;
  fechaApertura: string;
  montoInicial: number;
  estado: 'Abierta' | 'Cerrada';
  totalVentas?: number;
  totalGastos?: number;
}

export interface Ingreso {
  idIngreso: string;
  idCaja: string;
  descripcion: string;
  monto: number;
  costo: number;
  fechaCreacion: string;
  estado: string;
}

export interface Egreso {
  idegresos: string;
  idCaja: string;
  descripcion: string;
  monto: number;
  fechaCreacion: string;
  estado: string;
}
