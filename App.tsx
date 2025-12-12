
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Clients from './pages/Clients';
import Providers from './pages/Providers';
import CashRegister from './pages/CashRegister';
import Costs from './pages/Costs';
import Login from './pages/Login';
import AdminUsers from './pages/AdminUsers';
import Packages from './pages/Packages';
import AdminCashDashboard from './pages/AdminCashDashboard';
import Reports from './pages/Reports';
import LabelDesigner from './pages/LabelDesigner';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Rutas Protegidas Envueltas en Layout */}
          <Route path="/*" element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route index element={<Dashboard />} />
                  
                  {/* Rutas Operativas */}
                  <Route path="pos" element={<ProtectedRoute requiredPermission="VER_POS"><POS /></ProtectedRoute>} />
                  <Route path="clients" element={<ProtectedRoute requiredPermission="VER_CLIENTES"><Clients /></ProtectedRoute>} />
                  <Route path="packages" element={<ProtectedRoute requiredPermission="GESTIONAR_INVENTARIO"><Packages /></ProtectedRoute>} />
                  
                  {/* Rutas Logísticas */}
                  <Route path="providers" element={<ProtectedRoute requiredPermission="VER_PROVEEDORES"><Providers /></ProtectedRoute>} />
                  <Route path="inventory" element={<ProtectedRoute requiredPermission="VER_INVENTARIO"><Inventory /></ProtectedRoute>} />
                  <Route path="label-designer" element={<ProtectedRoute requiredPermission="DISEÑAR_ETIQUETAS"><LabelDesigner /></ProtectedRoute>} />
                  
                  {/* Rutas Financieras */}
                  <Route path="cash" element={<ProtectedRoute requiredPermission="VER_CAJA"><CashRegister /></ProtectedRoute>} />
                  <Route path="costs" element={<ProtectedRoute requiredPermission="VER_COSTOS"><Costs /></ProtectedRoute>} />
                  <Route path="reports" element={<ProtectedRoute requiredPermission="VER_REPORTES"><Reports /></ProtectedRoute>} />
                  
                  {/* Rutas Administrativas */}
                  <Route path="admin/cash-dashboard" element={<ProtectedRoute requiredPermission="GESTIONAR_PANEL_CAJAS"><AdminCashDashboard /></ProtectedRoute>} />
                  <Route path="admin/users" element={<ProtectedRoute requiredPermission="GESTIONAR_USUARIOS"><AdminUsers initialView="USERS" /></ProtectedRoute>} />
                  <Route path="admin/employees" element={<ProtectedRoute requiredPermission="GESTIONAR_USUARIOS"><AdminUsers initialView="EMPLOYEES" /></ProtectedRoute>} />
                  <Route path="admin/roles" element={<ProtectedRoute requiredPermission="GESTIONAR_ROLES"><AdminUsers initialView="ROLES" /></ProtectedRoute>} />
                  <Route path="admin/boxes" element={<ProtectedRoute requiredPermission="GESTIONAR_ROLES"><AdminUsers initialView="CAJAS" /></ProtectedRoute>} />

                  {/* Redirección Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;
