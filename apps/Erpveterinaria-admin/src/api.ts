import type { ApiEnvelope, SaasUser } from './types';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'erpvet_saas_admin_token';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class ApiClient {
  private token: string | null;

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  getToken() {
    return this.token;
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) this.setToken(null);
      throw new ApiError(payload.error || payload.message || 'Error de API', response.status);
    }
    return payload;
  }

  async login(input: { email?: string; password?: string; secret?: string }) {
    const result = await this.request<{ token: string; user: SaasUser }>('/api/saas/auth/login', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    this.setToken(result.data.token);
    return result.data.user;
  }

  async me() {
    const result = await this.request<SaasUser>('/api/saas/auth/me');
    return result.data;
  }

  async logout() {
    try {
      await this.request('/api/saas/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }
}

export function queryString(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}
