
import React, { useState } from 'react';
// Fix: Use namespace import to bypass missing named export errors in certain environments
import * as ReactRouterDOM from 'react-router-dom';
const { Navigate, useLocation } = ReactRouterDOM as any;
import { useAuth } from '../context/AuthContext';
import { AuthService } from '../services/api';
import { KeyRound, Eye, EyeOff, ShieldCheck } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredPermission?: string;
  requiredFeature?: string;
}

const ForceChangePassword: React.FC = () => {
  const { clearPasswordChangeFlag, logout } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.next !== form.confirm) { setError('Las contraseñas nuevas no coinciden'); return; }
    if (form.next.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true);
    try {
      await AuthService.changePassword(form.current, form.next);
      clearPasswordChangeFlag();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-center">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="text-white" size={28} />
          </div>
          <h2 className="text-xl font-bold text-white">Actualiza tu contraseña</h2>
          <p className="text-indigo-200 text-sm mt-1">Tu cuenta tiene una contraseña temporal. Crea una nueva para continuar.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Contraseña Temporal</label>
            <div className="relative mt-1">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                className="w-full p-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                value={form.current}
                onChange={e => setForm({...form, current: e.target.value})}
                placeholder="La contraseña que te dieron"
              />
              <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600">
                {showCurrent ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Nueva Contraseña</label>
            <div className="relative mt-1">
              <input
                type={showNext ? 'text' : 'password'}
                required
                className="w-full p-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                value={form.next}
                onChange={e => setForm({...form, next: e.target.value})}
                placeholder="Mínimo 6 caracteres"
              />
              <button type="button" onClick={() => setShowNext(v => !v)} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600">
                {showNext ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Confirmar Contraseña</label>
            <input
              type="password"
              required
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={form.confirm}
              onChange={e => setForm({...form, confirm: e.target.value})}
              placeholder="Repetir contraseña"
            />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <KeyRound size={16}/>}
            {loading ? 'Guardando...' : 'Actualizar Contraseña'}
          </button>
          <button type="button" onClick={logout} className="w-full py-2 text-slate-400 hover:text-slate-600 text-sm transition-colors">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission, requiredFeature }) => {
  const { user, isAuthenticated, hasPermission, hasPlanFeature, isInitializing, requiresPasswordChange } = useAuth();
  const location = useLocation();

  // Esperar a que AuthContext termine de restaurar la sesión desde localStorage
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Forzar cambio de contraseña antes de acceder a cualquier ruta
  if (requiresPasswordChange) {
    return <ForceChangePassword />;
  }

  // Validar feature del plan (módulo no disponible en el plan contratado)
  if (requiredFeature && !hasPlanFeature(requiredFeature)) {
    return <Navigate to="/" replace />;
  }

  // Nueva validación por permiso específico
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  // Validación Legacy por Rol
  if (
    !requiredPermission &&
    allowedRoles &&
    !allowedRoles.some(r => r.toLowerCase() === (user?.rol || '').toLowerCase())
  ) {
     return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
