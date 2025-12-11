
import { 
  Telefono, 
  Inventario, 
  Accesorio, 
  Categoria, 
  Ubicacion, 
  Proveedor, 
  ProductoUnified, 
  Cliente, 
  Venta, 
  VentaPayload, 
  DetalleVenta, 
  Arqueo, 
  Ingreso, 
  Egreso, 
  Saldo, 
  Paquete, 
  Costo, 
  Usuario, 
  Empleado, 
  Rol, 
  Caja, 
  Permiso, 
  LabelTemplate 
} from '../types';

const API_URL = '/api';

export const request = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem('smartcloud_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
  }

  // Some endpoints might return empty body (like DELETE)
  if (response.status === 204) return {} as T;

  return response.json();
};

export const InventoryService = {
  getUnifiedProducts: () => request<ProductoUnified[]>('/productos/unificados'),
  
  getTelefonos: () => request<Telefono[]>('/inventory/telefonos'),
  createTelefono: (data: Partial<Telefono>) => request('/inventory/telefonos', { method: 'POST', body: JSON.stringify(data) }),
  updateTelefono: (id: string, data: Partial<Telefono>) => request(`/inventory/telefonos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTelefono: (id: string) => request(`/inventory/telefonos/${id}`, { method: 'DELETE' }),

  getStockAccesorios: () => request<Inventario[]>('/inventory/stock'),
  createStock: (data: Partial<Inventario>) => request('/inventory/stock', { method: 'POST', body: JSON.stringify(data) }),
  updateStock: (id: string, data: Partial<Inventario>) => request(`/inventory/stock/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStock: (id: string) => request(`/inventory/stock/${id}`, { method: 'DELETE' }),

  getAccesoriosMaster: () => request<Accesorio[]>('/inventory/accesorios-master'),
  createAccesorioMaster: (data: Partial<Accesorio>) => request('/inventory/accesorios-master', { method: 'POST', body: JSON.stringify(data) }),
  updateAccesorioMaster: (id: string, data: Partial<Accesorio>) => request(`/inventory/accesorios-master/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccesorioMaster: (id: string) => request(`/inventory/accesorios-master/${id}`, { method: 'DELETE' }),

  getCategorias: () => request<Categoria[]>('/inventory/categorias'),
  createCategoria: (data: Partial<Categoria>) => request('/inventory/categorias', { method: 'POST', body: JSON.stringify(data) }),
  updateCategoria: (id: string, data: Partial<Categoria>) => request(`/inventory/categorias/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategoria: (id: string) => request(`/inventory/categorias/${id}`, { method: 'DELETE' }),

  getUbicaciones: () => request<Ubicacion[]>('/inventory/ubicaciones'),
  createUbicacion: (data: Partial<Ubicacion>) => request('/inventory/ubicaciones', { method: 'POST', body: JSON.stringify(data) }),
  updateUbicacion: (id: string, data: Partial<Ubicacion>) => request(`/inventory/ubicaciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUbicacion: (id: string) => request(`/inventory/ubicaciones/${id}`, { method: 'DELETE' }),

  getProveedores: () => request<Proveedor[]>('/proveedores'),
  createProveedor: (data: Partial<Proveedor>) => request('/proveedores', { method: 'POST', body: JSON.stringify(data) }),
  updateProveedor: (id: string, data: Partial<Proveedor>) => request(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProveedor: (id: string) => request(`/proveedores/${id}`, { method: 'DELETE' }),
};

export const SalesService = {
  getVentasDiarias: (fecha: string) => request<Venta[]>(`/ventas/historial?fecha=${fecha}`),
  createVenta: (data: VentaPayload) => request<{message: string, codVenta: string}>('/ventas', { method: 'POST', body: JSON.stringify(data) }),
  getVenta: (id: string) => request<Venta>(`/ventas/${id}`),
  updateVenta: (id: string, data: VentaPayload) => request<{message: string, codVenta: string}>(`/ventas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getDetallesVenta: (id: string) => request<DetalleVenta[]>(`/ventas/${id}/detalles`),
  anularVenta: (id: string) => request(`/ventas/${id}/anular`, { method: 'PUT' }),
};

export const ClientService = {
  getAll: () => request<Cliente[]>('/clientes'),
  create: (data: Cliente) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Cliente>) => request(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/clientes/${id}`, { method: 'DELETE' }),
};

export const CashService = {
  getActiveArqueo: () => request<Arqueo | null>('/arqueo/active'),
  openCaja: (data: { montoInicial: number; saldoTigoInicial: number; saldoClaroInicial: number; fechaLocal: string }) => request('/arqueo/open', { method: 'POST', body: JSON.stringify(data) }),
  closeCaja: (idArqueo: string) => request<{message: string, resumen: any}>('/arqueo/close', { method: 'POST', body: JSON.stringify({ idArqueo }) }),
  getSaldosStatus: (fecha: string) => request<{ tigo: boolean; claro: boolean }>(`/saldos/status?fecha=${fecha}`),
  getSaldosToday: (fecha: string) => request<Saldo[]>(`/saldos/today?fecha=${fecha}`),
  buySaldo: (data: { red: string; montoPagado: number; montoRecibido: number; fechaLocal: string }) => request('/saldos/buy', { method: 'POST', body: JSON.stringify(data) }),
  
  getIngresos: (idCaja: string, fecha?: string) => request<Ingreso[]>(`/ingresos?idCaja=${idCaja}${fecha ? `&fecha=${fecha}` : ''}`),
  createIngreso: (data: Partial<Ingreso>) => request('/ingresos', { method: 'POST', body: JSON.stringify(data) }),
  updateIngreso: (id: string, data: Partial<Ingreso>) => request(`/ingresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIngreso: (id: string) => request(`/ingresos/${id}`, { method: 'DELETE' }),

  getEgresos: (idCaja: string, fecha?: string) => request<Egreso[]>(`/egresos?idCaja=${idCaja}${fecha ? `&fecha=${fecha}` : ''}`),
  createEgreso: (data: Partial<Egreso>) => request('/egresos', { method: 'POST', body: JSON.stringify(data) }),
  updateEgreso: (id: string, data: Partial<Egreso>) => request(`/egresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEgreso: (id: string) => request(`/egresos/${id}`, { method: 'DELETE' }),

  createRecarga: (data: { red: string; tipo: string; descripcion: string; precioCobrado: number; precioPagado: number; fechaLocal: string }) => request('/recargas', { method: 'POST', body: JSON.stringify(data) }),

  getAdminBoxesStatus: () => request<any[]>('/api/admin/boxes/status'), 
  reopenBox: (idArqueo: string) => request(`/arqueo/${idArqueo}/reopen`, { method: 'PUT' }),
};

export const AdminService = {
  getSchema: () => request<Record<string, {name: string, type: string}[]>>('/schema'),
  
  getUsers: () => request<Usuario[]>('/users'),
  createUser: (data: Partial<Usuario>) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<Usuario>) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),

  getEmpleados: () => request<Empleado[]>('/empleados'),
  createEmpleado: (data: Partial<Empleado>) => request('/empleados', { method: 'POST', body: JSON.stringify(data) }),
  updateEmpleado: (id: string, data: Partial<Empleado>) => request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmpleado: (id: string) => request(`/empleados/${id}`, { method: 'DELETE' }),

  getRoles: () => request<Rol[]>('/roles'),
  createRol: (data: Partial<Rol>) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRol: (id: string, data: Partial<Rol>) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRol: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),

  getPermisos: () => request<Permiso[]>('/permisos'),

  getCajas: () => request<Caja[]>('/cajas'),
  createCaja: (nombre: string) => request('/cajas', { method: 'POST', body: JSON.stringify({ nombre }) }),
  updateCaja: (id: string, data: Partial<Caja>) => request(`/cajas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCaja: (id: string) => request(`/cajas/${id}`, { method: 'DELETE' }),
};

export const CostsService = {
  getAll: () => request<Costo[]>('/costos'), 
  create: (data: Partial<Costo>) => request('/costos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Costo>) => request(`/costos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/costos/${id}`, { method: 'DELETE' }),
};

export const PackagesService = {
  getAll: () => request<Paquete[]>('/paquetes'),
  create: (data: Partial<Paquete>) => request('/paquetes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Paquete>) => request(`/paquetes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/paquetes/${id}`, { method: 'DELETE' }),
};

export const ReportsService = {
  getSalesTrend: (year: number) => request<any[]>(`/reports/sales-trend?year=${year}`),
  getTopProducts: (start: string, end: string) => request<any[]>(`/reports/top-products?startDate=${start}&endDate=${end}`),
  getRechargesProfit: (year: number) => request<any[]>(`/reports/recharges-profit?year=${year}`),
  getInventoryValuation: () => request<any[]>('/reports/inventory-valuation'),
  getTopClients: (start: string, end: string) => request<any[]>(`/reports/top-clients?startDate=${start}&endDate=${end}`),
  getDailySales: (start: string, end: string) => request<any[]>(`/reports/daily-sales?startDate=${start}&endDate=${end}`),
};

export const LabelService = {
  getAll: () => request<LabelTemplate[]>('/labels'),
  getDefault: () => request<LabelTemplate | null>('/labels/default'),
  create: (data: Partial<LabelTemplate>) => request('/labels', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<LabelTemplate>) => request(`/labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/labels/${id}`, { method: 'DELETE' }),
};
