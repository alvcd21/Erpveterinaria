
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserSession, LoginCredentials, AuthResponse } from '../types';

interface AuthContextType {
  user: UserSession | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  hasPermission: (requiredPermission?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Restaurar sesión al recargar página
    const storedToken = localStorage.getItem('smartcloud_token');
    const storedUser = localStorage.getItem('smartcloud_user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error de autenticación');
    }

    const data: AuthResponse = await response.json();
    setToken(data.token);
    setUser(data.user);

    localStorage.setItem('smartcloud_token', data.token);
    localStorage.setItem('smartcloud_user', JSON.stringify(data.user));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('smartcloud_token');
    localStorage.removeItem('smartcloud_user');
  };

  // Validar si el usuario tiene el permiso específico
  const hasPermission = (requiredPermission?: string) => {
    if (!user) return false;
    
    // El Administrador (por nombre de rol) siempre tiene acceso a todo como fallback de seguridad
    if (user.rol === 'Administrador' || user.rol === 'Admin') return true;

    // Si no se requiere permiso específico (ruta pública dentro del layout), permitir
    if (!requiredPermission) return true;

    // Verificar si el ID del permiso está en el array de permisos del usuario
    return user.permisos?.includes(requiredPermission) || false;
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
