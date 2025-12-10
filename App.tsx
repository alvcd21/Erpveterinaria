import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import CashRegister from './pages/CashRegister';
import Login from './pages/Login';
import AdminUsers from './pages/AdminUsers';

// Placeholder components
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-96 text-slate-400">
    <h2 className="text-2xl font-bold mb-2">{title}</h2>
    <p>Módulo en construcción o migración</p>
  </div>
);

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Wrapper Route for all protected pages */}
          <Route path="/*" element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  
                  <Route 
                    path="/pos" 
                    element={
                      <ProtectedRoute allowedRoles={['Administrador', 'Vendedor']}>
                        <POS />
                      </ProtectedRoute>
                    } 
                  />
                  
                  <Route 
                    path="/clients" 
                    element={
                      <ProtectedRoute allowedRoles={['Administrador', 'Vendedor']}>
                        <Placeholder title="Gestión de Clientes" />
                      </ProtectedRoute>
                    } 
                  />

                  <Route 
                    path="/inventory" 
                    element={
                      <ProtectedRoute allowedRoles={['Administrador', 'Inventario']}>
                        <Inventory />
                      </ProtectedRoute>
                    } 
                  />

                  <Route 
                    path="/cash" 
                    element={
                      <ProtectedRoute allowedRoles={['Administrador', 'Cajero']}>
                        <CashRegister />
                      </ProtectedRoute>
                    } 
                  />

                  <Route 
                    path="/reports" 
                    element={
                      <ProtectedRoute allowedRoles={['Administrador']}>
                        <Placeholder title="Reportes" />
                      </ProtectedRoute>
                    } 
                  />
                  
                  <Route 
                    path="/admin/users" 
                    element={
                      <ProtectedRoute allowedRoles={['Administrador']}>
                        <AdminUsers />
                      </ProtectedRoute>
                    } 
                  />

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