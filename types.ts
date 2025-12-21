
export type EstadoGeneral = 'Activo' | 'Inactivo' | 'Disponible' | 'Vendido' | 'Completada' | 'Anulada' | 'Cerrada' | 'Registrado';

// Nuevos Tipos para Clasificación Profesional
export type SubtipoIngreso = 'Venta Inventario' | 'Venta Prestado' | 'Reparacion' | 'Recarga' | 'KrediYa_Prima' | 'KrediYa_Deposito' | 'Cobro Consignacion' | 'Ajuste';
export type SubtipoEgreso = 'Gasto Operativo' | 'Gasto Personal Socio' | 'Pago a Tecnico' | 'Pago a Tienda Externa' | 'Nomina' | 'Compra Saldo' | 'Compra Inventario';

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
  permisos?: string[];
}

export interface UserSession extends Usuario {
  rol: string;
}

export interface LoginCredentials {
  usuario: string;
  password?: string;
}

export interface AuthResponse {
  token: string;
  user: UserSession;
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

export interface Rol {
  idrol: string;
  nombre: string;
  estado: EstadoGeneral;
  permisos?: string[];
}

export interface Permiso {
  idPermiso: string;
  nombre: string;
  modulo: string;
}

export interface Caja {
  idCaja: string;
  nombre: string;
  estado: 'Activo' | 'Inactivo';
}

export interface Cliente {
  identidad: string;
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  correo?: string;
  fechaCreacion?: string;
}

export interface Proveedor {
  codProveedor: string;
  nombre: string;
  telefono: string;
  direccion: string;
}

export interface Categoria {
  codCategoria: string;
  tipo: string;
}

export interface Ubicacion {
  idUbicacion: string;
  nombre: string;
  descripcion: string;
  estante: string;
  nivel: string;
  estado: EstadoGeneral;
}

export interface Telefono {
  codigo: string;
  imei1: string;
  imei2?: string;
  marca: string;
  modelo: string;
  precioCompra: number;
  precioVenta: number;
  codProveedor: string;
  idubicacion: string;
  estado: EstadoGeneral;
  fecha: string;
  nombreUbicacion?: string;
}

export interface Accesorio {
  codAccesorio: string;
  codCategoria: string;
  descripcion: string;
  nombreCategoria?: string;
}

export interface Inventario {
  codInventario: string;
  codAccesorio: string;
  cantidad: number;
  precioCompra: number;
  precioVenta: number;
  codProveedor: string;
  idubicacion: string;
  estado: EstadoGeneral;
  fecha: string;
  descripcionAccesorio?: string;
  categoriaAccesorio?: string;
  nombreUbicacion?: string;
}

export interface ProductoUnified {
  id: string;
  tipo: 'TELEFONO' | 'ACCESORIO';
  nombre: string;
  codigo: string;
  precioVenta: number;
  stock: number;
  imei?: string;
  ubicacion: string;
  marca?: string;       
  categoria?: string;   
}

export interface DetalleVenta {
  codDetalleVenta?: string;
  idVenta?: string;
  idAccesorio?: string;
  idTelefono?: string;
  idInventario?: string; 
  idIngreso?: string;
  cantidad: number;
  precioVenta: number;
  descripcionProducto?: string;
  tipoProducto?: 'TELEFONO' | 'ACCESORIO' | 'SERVICIO';
  estado?: EstadoGeneral;
}

export interface Venta {
  codVenta: string;
  fecha: string;
  codVendedor?: string;
  identidadCliente: string;
  nombreCliente?: string;
  total: number;
  estado: EstadoGeneral;
  tipoCompra: 'Contado' | 'Credito';
  isv?: number;
  descuento?: number;
  detalles?: DetalleVenta[];
  nombreVendedor?: string; 
  direccionCliente?: string;
}

export interface VentaPayload {
  identidadCliente: string;
  tipoCompra: 'Contado' | 'Credito'; 
  total: number;
  isv?: number;
  descuento?: number;
  detalles: Partial<DetalleVenta>[];
  fecha?: string;
}

export interface Arqueo {
  idArqueo: string;
  idCaja: string;
  idUsuario: string;
  fechaApertura: string;
  fechaCierre?: string;
  montoInicial: number;
  montoFinal?: number;
  estado: 'Activo' | 'Cerrada';
  totalVentas?: number;
  ganancia?: number;
}

export interface Ingreso {
  idIngreso: string;
  idCaja: string;
  descripcion: string;
  monto: number;
  costo: number;
  fechaCreacion?: string;
  estado: string;
  subtipo_movimiento?: SubtipoIngreso;
}

export interface Egreso {
  idegresos: string;
  idCaja: string;
  descripcion: string;
  monto: number;
  fechaCreacion?: string;
  estado: string;
  categoria?: string;
  subtipo_egreso?: SubtipoEgreso;
  id_socio_asignado?: number | null;
}

export interface Saldo {
  idsaldos: string;
  red: 'TIGO' | 'CLARO';
  saldoInicio: number;
  saldoComprado: number;
  saldoFinal: number;
  fecha: string;
}

export interface Paquete {
  idPaquete: string;
  red: 'TIGO' | 'CLARO';
  nombre: string;
  precio: number;
  costo: number;
  estado: EstadoGeneral;
}

export interface Socio {
  idSocio: number;
  nombre: string;
  porcentajeParticipacion: number;
  estado: EstadoGeneral;
  fechaIngreso?: string;
}

// --- NUEVOS TIPOS PARA CONFIGURACIÓN Y COSTOS ---

/* fix: Added EmpresaConfig interface for company settings */
export interface EmpresaConfig {
  nombreEmpresa: string;
  rtn: string;
  direccion: string;
  telefono: string;
  correo: string;
  cai: string;
  rangoInicial: string;
  rangoFinal: string;
  fechaLimite: string;
  isv: number;
  mensajeFinal: string;
}

/* fix: Added TipoCosto union type */
export type TipoCosto = 'Costo Directo' | 'Costo Indirecto';

/* fix: Added Costo interface */
export interface Costo {
  codCostos: string;
  tipo: TipoCosto;
  descripcion: string;
  monto: number;
  estado: EstadoGeneral;
}

// --- NUEVOS TIPOS PARA DISEÑADOR DE ETIQUETAS ---

/* fix: Added LabelElement interface for designer elements */
export interface LabelElement {
  id: string;
  type: 'TEXT' | 'BARCODE' | 'QR' | 'IMAGE' | 'SHAPE' | 'DETAIL_TABLE';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  content: string;
  fontSize?: number;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontFamily?: string;
  barcodeFormat?: string;
  displayValue?: boolean;
  shapeType?: 'RECTANGLE' | 'CIRCLE' | 'LINE';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  isMultiline?: boolean;
  isStretchWithOverflow?: boolean;
}

/* fix: Added LabelTemplate interface */
export interface LabelTemplate {
  id: string;
  name: string;
  category?: string;
  type?: 'LABEL' | 'DOCUMENT';
  dataSource?: string;
  isDefault: boolean;
  width: number;
  height: number;
  elements: LabelElement[];
}

// --- TIPOS ADICIONALES PARA CONTABILIDAD ---

/* fix: Added missing accounting interfaces used in api service */
export interface GastoContable {
  idGasto: string;
  descripcion: string;
  monto: number;
  fecha: string;
  categoria: string;
}

export interface ReporteFinanciero {
  ventasBrutas: number;
  costoVentas: number;
  utilidadBruta: number;
  gastosOperativos: number;
  utilidadNeta: number;
}

export interface ComponenteCosto {
  id: string;
  nombre: string;
  monto: number;
}

export interface CostoProducto {
  codProducto: string;
  costoUnitario: number;
  margenUtilidad: number;
}

export interface PresupuestoMensual {
  mes: string;
  anio: number;
  montoEstimado: number;
  montoReal: number;
}

export interface DailyTrackingRow {
  fecha: string;
  ingresos: number;
  egresos: number;
  balance: number;
}

export interface PnLRow {
  concepto: string;
  monto: number;
  porcentaje: number;
}
