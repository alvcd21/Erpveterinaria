import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  ClipboardList,
  CreditCard,
  Layers3,
  LogOut,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { ApiClient, ApiError } from './api';
import type { SaasUser } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { TenantsPage } from './pages/TenantsPage';
import { PlansPage } from './pages/PlansPage';
import { FeaturesPage } from './pages/FeaturesPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AuditPage } from './pages/AuditPage';

type Section = 'dashboard' | 'tenants' | 'plans' | 'features' | 'subscriptions' | 'users' | 'audit';

const sections = [
  { key: 'dashboard', label: 'Dashboard', icon: Activity },
  { key: 'tenants', label: 'Tenants', icon: Building2 },
  { key: 'plans', label: 'Plan Builder', icon: Layers3 },
  { key: 'features', label: 'Features', icon: Sparkles },
  { key: 'subscriptions', label: 'Suscripciones', icon: CreditCard },
  { key: 'users', label: 'Usuarios SaaS', icon: Users },
  { key: 'audit', label: 'Auditoria', icon: ClipboardList }
] as const;

function LoginView({ api, onLogin }: { api: ApiClient; onLogin: (user: SaasUser) => void }) {
  const [useSecret, setUseSecret] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await api.login(useSecret ? { secret } : { email, password });
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ color: '#172033', marginBottom: 20 }}>
          <span className="brand-mark"><ShieldCheck size={22} /></span>
          <div>
            <div>ERP Veterinaria SaaS</div>
            <small className="muted">Consola administrativa</small>
          </div>
        </div>

        {error && <div className="notice">{error}</div>}

        {!useSecret ? (
          <div className="grid">
            <div className="field">
              <label>Correo del equipo SaaS</label>
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@tuempresa.com" />
            </div>
            <div className="field">
              <label>Contrasena</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </div>
        ) : (
          <div className="field">
            <label>Clave de emergencia</label>
            <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} />
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 22 }}>
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar al panel'}
          </button>
          <button className="btn ghost" type="button" onClick={() => setUseSecret(!useSecret)}>
            {useSecret ? 'Usar usuario SaaS' : 'Acceso emergencia'}
          </button>
        </div>
      </form>
    </main>
  );
}

function App() {
  const api = useMemo(() => new ApiClient(), []);
  const [user, setUser] = useState<SaasUser | null>(null);
  const [section, setSection] = useState<Section>('dashboard');
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api.getToken()) {
      setBooting(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => api.setToken(null))
      .finally(() => setBooting(false));
  }, [api]);

  async function logout() {
    await api.logout();
    setUser(null);
  }

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3200);
  }

  if (booting) return <main className="login-screen"><div className="login-card">Validando sesion...</div></main>;
  if (!user) return <LoginView api={api} onLogin={setUser} />;

  const pageProps = { api, notify };
  const page = {
    dashboard: <DashboardPage {...pageProps} />,
    tenants: <TenantsPage {...pageProps} />,
    plans: <PlansPage {...pageProps} />,
    features: <FeaturesPage {...pageProps} />,
    subscriptions: <SubscriptionsPage {...pageProps} />,
    users: <AdminUsersPage {...pageProps} />,
    audit: <AuditPage {...pageProps} />
  }[section];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={22} /></span>
          <div>
            <div>ERP Vet Admin</div>
            <small>{user.roleName || user.role}</small>
          </div>
        </div>

        <nav className="nav">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={section === item.key ? 'active' : ''}
                onClick={() => setSection(item.key)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <div className="muted" style={{ marginBottom: 10 }}>{user.email}</div>
          <button className="btn ghost" onClick={logout}><LogOut size={16} /> Salir</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{sections.find((item) => item.key === section)?.label}</h1>
            <span className="muted">Gestion centralizada de tenants, planes y suscripciones</span>
          </div>
          {notice && <span className="badge">{notice}</span>}
        </header>
        <ErrorBoundary>{page}</ErrorBoundary>
      </main>
    </div>
  );
}

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState('');
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof ApiError) setError(`${reason.status}: ${reason.message}`);
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);
  return (
    <>
      {error && <div className="notice">{error}</div>}
      {children}
    </>
  );
}

export default App;
