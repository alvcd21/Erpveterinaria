
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[]; // Deprecated, kept for compat if needed, but priority is permission
  requiredPermission?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission }) => {
  const { isAuthenticated, hasPermission } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to login while saving the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Nueva validación por permiso específico
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  // Validación Legacy por Rol (si no se pasa permission)
  if (!requiredPermission && allowedRoles && !allowedRoles.some(r => hasPermission(r.toUpperCase()) || hasPermission())) {
     // Nota: hasPermission sin args retorna true si es admin, pero aquí estamos probando lógica legacy
     // Simplemente, si se usan roles viejos, el hasPermission(roleName) fallará si no es ID.
     // Se recomienda actualizar App.tsx para usar requiredPermission.
     // Fallback simple: Si el usuario es Admin pasa, sino rebota si no cumple permiso.
     return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
