export type ApiEnvelope<T> = {
  data: T;
  message?: string;
  pagination?: Pagination;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
};

export type SaasUser = {
  id: string;
  email: string;
  nombre: string;
  role: string;
  roleName?: string;
  permisos: string[];
};

export type Tenant = {
  id: string;
  slug: string;
  nombre_empresa: string;
  plan: string;
  estado: string;
  max_sucursales: number;
  max_usuarios: number;
  max_medicamentos: number;
  fecha_vencimiento?: string | null;
  created_at?: string;
  usuarios_count?: number;
  ventas_count?: number;
  medicamentos_count?: number;
  subscription_status?: string;
};

export type Plan = {
  slug: string;
  nombre: string;
  descripcion?: string;
  estado: string;
  moneda: string;
  precio_mensual: string | number;
  precio_anual: string | number;
  max_sucursales: number;
  max_usuarios: number;
  max_medicamentos: number;
  ai_tokens_mensual: number;
  ai_requests_mensual: number;
  ai_requests_diario: number;
  trial_dias: number;
  orden: number;
  features?: PlanFeature[];
};

export type Feature = {
  feature_key: string;
  nombre: string;
  modulo: string;
  tipo: string;
  descripcion?: string;
  estado: string;
  orden: number;
};

export type PlanFeature = Feature & {
  enabled: boolean;
  limits?: Record<string, unknown>;
};

export type Entitlement = {
  tenant: Tenant;
  planFeatures: PlanFeature[];
  overrides: TenantOverride[];
  effectiveFeatures: string[];
};

export type TenantOverride = {
  id: string;
  tenant_id: string;
  feature_key: string;
  enabled: boolean;
  reason?: string;
  valid_until?: string | null;
};

export type Subscription = {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  nombre_empresa: string;
  plan_slug: string;
  plan_nombre: string;
  status: string;
  billing_cycle: string;
  current_period_start: string;
  current_period_end?: string | null;
  is_current: boolean;
};

export type AdminRole = {
  id: string;
  role_key: string;
  nombre: string;
  permisos: string[];
};

export type AdminUser = {
  id: string;
  email: string;
  nombre: string;
  estado: string;
  role_key?: string;
  role_name?: string;
  created_at?: string;
  last_login_at?: string | null;
};

export type AuditLog = {
  id: number;
  actor_email?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  tenant_id?: string;
  created_at: string;
};

export type Overview = {
  tenants: Array<{ estado: string; total: number }>;
  subscriptions: { activas?: number; riesgo?: number; mrr_estimado?: string | number };
  proximos_vencimientos: Subscription[];
  catalogo: { planes?: number; features?: number };
};
