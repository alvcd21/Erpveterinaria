
import { 
  Telefono, 
  InventarioAccesorio, 
  AccesorioMaster, 
  Cliente, 
  VentaPayload, 
  Arqueo, 
  Ingreso, 
  Egreso,
  Usuario,
  Empleado,
  Rol,
  Caja,
  Categoria,
  Ubicacion,
  Proveedor
} from '../types';

const API_URL = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('smartcloud_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('smartcloud_token');
      localStorage.removeItem('smartcloud_user');
      window.location.href = '#/login';
      throw new Error('Sesión expirada');
    }

    if (!response.ok) {
        try {
            const errData = await response.json();
            throw new Error(errData.error || `Error ${response.status}`);
        } catch (e) {
             throw new Error(`API Error: ${response.status}`);
        }
    }
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
    } else {
        return {} as T;
    }

  } catch (error) {
    console.error(`Error en API ${endpoint}`, error);
    throw error;
  }
}

export const AdminService = {
  getUsers: () => request<Usuario[]>('/users'),
  createUser: (data: any) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
  getEmpleados: () => request<Empleado[]>('/empleados'),
  createEmpleado: (data: Empleado) => request('/empleados', { method: 'POST', body: JSON.stringify(data) }),
  updateEmpleado: (id: string, data: Partial<Empleado>) => request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmpleado: (id: string) => request(`/empleados/${id}`, { method: 'DELETE' }),
  getRoles: () => request<Rol[]>('/roles'),
  createRol: (nombre: string) => request('/roles', { method: 'POST', body: JSON.stringify({ nombre }) }),
  updateRol: (id: string, data: Partial<Rol>) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRol: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),
  getCajas: () => request<Caja[]>('/cajas'),
  createCaja: (nombre: string) => request('/cajas', { method: 'POST', body: JSON.stringify({ nombre }) }),
  updateCaja: (id: string, data: Partial<Caja>) => request(`/cajas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCaja: (id: string) => request(`/cajas/${id}`, { method: 'DELETE' }),
};

export const InventoryService = {
  getUnifiedProducts: () => request<any[]>('/productos/unificados'), 
  
  // Specific Endpoints
  getTelefonos: () => request<Telefono[]>('/inventory/telefonos'),
  createTelefono: (data: Partial<Telefono>) => request('/inventory/telefonos', { method: 'POST', body: JSON.stringify(data) }),
  updateTelefono: (id: string, data: Partial<Telefono>) => request(`/inventory/telefonos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTelefono: (id: string) => request(`/inventory/telefonos/${id}`, { method: 'DELETE' }),

  getStockAccesorios: () => request<InventarioAccesorio[]>('/inventory/stock'),
  createStock: (data: Partial<InventarioAccesorio>) => request('/inventory/stock', { method: 'POST', body: JSON.stringify(data) }),
  updateStock: (id: string, data: Partial<InventarioAccesorio>) => request(`/inventory/stock/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStock: (id: string) => request(`/inventory/stock/${id}`, { method: 'DELETE' }),

  getAccesoriosMaster: () => request<AccesorioMaster[]>('/inventory/accesorios-master'),
  createAccesorioMaster: (data: Partial<AccesorioMaster>) => request('/inventory/accesorios-master', { method: 'POST', body: JSON.stringify(data) }),
  updateAccesorioMaster: (id: string, data: Partial<AccesorioMaster>) => request(`/inventory/accesorios-master/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
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

export const ClientService = {
  getAll: () => request<Cliente[]>('/clientes'),
  create: (data: Cliente) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Cliente>) => request(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/clientes/${id}`, { method: 'DELETE' }),
};

export const SalesService = {
  createVenta: (venta: VentaPayload) => request('/ventas', { method: 'POST', body: JSON.stringify(venta) }),
};

export const CashService = {
  getActiveArqueo: (idUsuario: string) => request<Arqueo>(`/arqueo/active?usuario=${idUsuario}`),
  getIngresos: (idCaja: string) => request<Ingreso[]>(`/ingresos?caja=${idCaja}`),
  getEgresos: (idCaja: string) => request<Egreso[]>(`/egresos?caja=${idCaja}`),
  createIngreso: (data: Ingreso) => request<Ingreso>('/ingresos', { method: 'POST', body: JSON.stringify(data) }),
  createEgreso: (data: Egreso) => request<Egreso>('/egresos', { method: 'POST', body: JSON.stringify(data) }),
};
