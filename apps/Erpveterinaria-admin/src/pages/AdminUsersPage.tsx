import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { ApiClient } from '../api';
import type { AdminRole, AdminUser } from '../types';

type Props = { api: ApiClient; notify: (message: string) => void };

const emptyForm = {
  email: '',
  nombre: '',
  password: '',
  role_key: 'soporte',
  estado: 'activo'
};

export function AdminUsersPage({ api, notify }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [error, setError] = useState('');

  async function load() {
    const [usersResult, rolesResult] = await Promise.all([
      api.request<AdminUser[]>('/api/saas/admin-users'),
      api.request<AdminRole[]>('/api/saas/admin-roles')
    ]);
    setUsers(usersResult.data);
    setRoles(rolesResult.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(user: AdminUser) {
    setSelected(user);
    setForm({
      email: user.email,
      nombre: user.nombre,
      password: '',
      role_key: user.role_key || 'soporte',
      estado: user.estado
    });
  }

  function clear() {
    setSelected(null);
    setForm(emptyForm);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    const path = selected ? `/api/saas/admin-users/${selected.id}` : '/api/saas/admin-users';
    const method = selected ? 'PUT' : 'POST';
    try {
      await api.request(path, { method, body: JSON.stringify(payload) });
      notify('Usuario SaaS guardado');
      clear();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el usuario');
    }
  }

  return (
    <div className="split">
      <section className="table-card">
        <div className="toolbar">
          <h3 style={{ flex: 1 }}>Equipo SaaS</h3>
          <button className="btn ghost" onClick={clear}>Nuevo usuario</button>
        </div>
        {error && <div className="notice">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Ultimo acceso</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} onClick={() => edit(user)} style={{ cursor: 'pointer' }}>
                  <td><strong>{user.nombre}</strong><br /><span className="muted">{user.email}</span></td>
                  <td>{user.role_name || user.role_key}</td>
                  <td><span className="badge">{user.estado}</span></td>
                  <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Sin acceso'}</td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={4}>No hay usuarios SaaS.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <form className="form-card grid" onSubmit={save}>
        <h3>{selected ? 'Editar usuario SaaS' : 'Nuevo usuario SaaS'}</h3>
        <div className="field"><label>Nombre</label><input value={form.nombre} onChange={(e) => update('nombre', e.target.value)} /></div>
        <div className="field"><label>Correo</label><input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></div>
        <div className="field"><label>Contrasena {selected ? '(opcional)' : ''}</label><input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} /></div>
        <div className="grid cols-2">
          <div className="field">
            <label>Rol</label>
            <select value={form.role_key} onChange={(e) => update('role_key', e.target.value)}>
              {roles.map((role) => <option key={role.role_key} value={role.role_key}>{role.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Estado</label>
            <select value={form.estado} onChange={(e) => update('estado', e.target.value)}>
              <option value="activo">Activo</option>
              <option value="bloqueado">Bloqueado</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
        </div>
        <button className="btn primary" type="submit"><Save size={16} /> Guardar usuario</button>
      </form>
    </div>
  );
}
