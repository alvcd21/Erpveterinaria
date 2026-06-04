import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserSession, LoginCredentials, AuthResponse } from '../types';
import { clearClientSession, getStoredUser, setAccessToken, setStoredUser } from '../services/authSession';
import { offlineDB } from '../services/offlineDB';

interface AuthContextType {
  user: UserSession | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  requiresPasswordChange: boolean;
  login: (credentials: LoginCredentials | string, password?: string, tenantSlug?: string) => Promise<void>;
  logout: () => void;
  hasPermission: (requiredPermission?: string) => boolean;
  hasPlanFeature: (featureKey: string) => boolean;
  clearPasswordChangeFlag: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeJWTPayload(token: string): { exp?: number; [key: string]: any } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
}

const KEYS = {
  tenantSlug: 'last_tenant_slug',
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  const clearSession = useCallback(() => {
    const tenantId = user?.tenantId;
    setUser(null);
    setToken(null);
    clearClientSession();
    if (tenantId) offlineDB.clearTenantData(tenantId).catch(() => {});
  }, [user?.tenantId]);

  const applySession = useCallback((accessToken: string, userData: UserSession) => {
    let nextUser = userData;
    if (!nextUser.tenantId || !nextUser.tenantSlug) {
      try {
        const payload = decodeJWTPayload(accessToken);
        if (payload?.tenantId) nextUser = { ...nextUser, tenantId: payload.tenantId };
        if (payload?.tenantSlug) nextUser = { ...nextUser, tenantSlug: payload.tenantSlug };
        if (payload?.isSuperAdmin) nextUser = { ...nextUser, isSuperAdmin: payload.isSuperAdmin };
      } catch {
        // ignore decode errors; server remains source of truth
      }
    }

    setToken(accessToken);
    setUser(nextUser);
    setAccessToken(accessToken);
    setStoredUser(nextUser);
    setRequiresPasswordChange(!!(nextUser as any).requiresPasswordChange);
    if (nextUser.tenantSlug) localStorage.setItem(KEYS.tenantSlug, nextUser.tenantSlug);
  }, []);

  const clearPasswordChangeFlag = () => {
    setRequiresPasswordChange(false);
    if (user) {
      const updated = { ...user, requiresPasswordChange: false };
      setUser(updated as any);
      setStoredUser(updated as any);
    }
  };

  const silentRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = await res.json();
      applySession(data.token, data.user);
      return true;
    } catch {
      return false;
    }
  }, [applySession]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { token: newToken, user: newUser } = (e as CustomEvent).detail;
      if (newToken && newUser) applySession(newToken, newUser);
    };
    window.addEventListener('smartcloud:token-refreshed', handler);
    return () => window.removeEventListener('smartcloud:token-refreshed', handler);
  }, [applySession]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!token) return;
      const payload = decodeJWTPayload(token);
      if (!payload?.exp) return;
      const minutesLeft = (payload.exp * 1000 - Date.now()) / 60000;
      if (minutesLeft < 60) await silentRefresh();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [silentRefresh, token]);

  useEffect(() => {
    const restore = async () => {
      const storedUser = getStoredUser();
      const ok = await silentRefresh();
      if (!ok && storedUser) clearSession();
      setIsInitializing(false);
    };
    restore();
  }, [silentRefresh]);

  const login = async (
    credentialsOrUsuario: LoginCredentials | string,
    password?: string,
    tenantSlug?: string
  ) => {
    const body = typeof credentialsOrUsuario === 'string'
      ? { usuario: credentialsOrUsuario, password, tenantSlug }
      : { ...credentialsOrUsuario };
    const cleanBody = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(cleanBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error de autenticacion');
    }

    const data: AuthResponse = await response.json();
    applySession(data.token, data.user);
  };

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearSession();
  };

  const hasPermission = (requiredPermission?: string) => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    const rolLower = user.rol?.toLowerCase();
    if (rolLower === 'administrador' || rolLower === 'admin' || rolLower === 'superadmin') return true;
    if (!requiredPermission) return true;
    return user.permisos?.includes(requiredPermission) || false;
  };

  const hasPlanFeature = useCallback((featureKey: string): boolean => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    const rolLower = user.rol?.toLowerCase();
    // Admins del tenant acceden a todo lo disponible en el plan
    if (rolLower === 'administrador' || rolLower === 'admin' || rolLower === 'superadmin') {
      return user.planFeatures?.includes(featureKey) ?? true;
    }
    return user.planFeatures?.includes(featureKey) ?? false;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, isInitializing, requiresPasswordChange, login, logout, hasPermission, hasPlanFeature, clearPasswordChangeFlag }}>
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
