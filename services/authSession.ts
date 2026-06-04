import { UserSession } from '../types';

const USER_KEY = 'sc_user';
const LEGACY_KEYS = ['sc_token', 'sc_refresh', 'smartcloud_token', 'smartcloud_user'];

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setStoredUser(user: UserSession | null): void {
  if (!user) {
    sessionStorage.removeItem(USER_KEY);
    return;
  }
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): UserSession | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearClientSession(): void {
  accessToken = null;
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_KEY);
  LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
}

export function getCurrentTenantId(): string | null {
  return getStoredUser()?.tenantId ?? null;
}

export function getCurrentSucursalId(): number | null {
  const id = getStoredUser()?.id_sucursal;
  return id ? Number(id) : null;
}
