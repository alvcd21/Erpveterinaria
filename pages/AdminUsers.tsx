
import React, { useState, useEffect } from 'react';
import { Usuario, Empleado, Rol, Caja, EstadoGeneral } from '../types';
import { AdminService } from '../services/api';
import { Users, Shield, Box, Briefcase, PlusCircle, X, Edit2, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

type Tab = 'USERS' | 'EMPLOYEES' | 'ROLES' | 'CAJAS';

interface AdminUsersProps {
  initialView: Tab;
}

const AdminUsers: React.FC<AdminUsersProps> = ({ initialView }) => {
  // El activeTab ahora se controla principalmente por la prop, aunque se mantiene el estado local
  const [activeTab, setActiveTab] = useState<Tab>(initialView);
  
  const [users, setUsers] = useState<Usuario[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<Tab>(initialView);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Forms State
  const [userForm, setUserForm] = useState({ usuario: '', password: '', identidad: '', idrol: '', idCaja: '', estado: 'Activo' });
  const [empForm, setEmpForm] = useState({ identidad: '', nombre: '', apellido: '', direccion: '', telefono: '', estado: 'Activo' });
  const [simpleForm, setSimpleForm] = useState({ nombre: '', estado: 'Activo' });

  useEffect(() => {
    setActiveTab(initialView);
    loadAllData();
  }, [initialView]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      // Cargamos todo para tener los selectores disponibles (e.g. Roles para crear Usuarios)
      const [u, e, r, c] = await Promise.all([
        AdminService.getUsers().catch(() => []),
        AdminService.getEmpleados().catch(() => []),
        AdminService.getRoles().catch(() => []),
        AdminService.getCajas().catch(() => [])
      ]);
      setUsers(u || []);
      setEmpleados(e || []);
      setRoles(r || []);
      setCajas(c || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch(activeTab) {
      case 'USERS': return 'Gestión de Usuarios';
      case 'EMPLOYEES': return 'Gestión de Empleados';
      case 'ROLES': return 'Roles y Permisos';
      case 'CAJAS': return 'Cajas Registradoras';
      default: return 'Administración';
    }
  };

  const openModal = (type: Tab, data?: any) => {
    setModalType(type);
    setIsEditing(!!data);
    setCurrentId(data ? (data.codUsuario || data.identidad || data.idrol || data.idCaja) : null);

    if (type === 'USERS') {
      setUserForm(data ? { 
        usuario: data.usuario, 
        password: '', // Password no se llena al editar por seguridad
        identidad: data.identidad, 
        idrol: data.idrol, 
        idCaja: data.idCaja,
        estado: data.estado 
      } : { usuario: '', password: '', identidad: '', idrol: '', idCaja: '', estado: 'Activo' });
    } else if (type === 'EMPLOYEES') {
      setEmpForm(data ? { 
        identidad: data.identidad, 
        nombre: data.nombre, 
        apellido: data.apellido, 
        direccion: data.direccion, 
        telefono: data.telefono,
        estado: data.estado
      } : { identidad: '', nombre: '', apellido: '', direccion: '', telefono: '', estado: 'Activo' });
    } else {
      setSimpleForm(data ? { nombre: data.nombre, estado: data.estado } : { nombre: '', estado: 'Activo' });
    }
    
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalType === 'USERS') {
        // Validación básica
        if (!userForm.identidad || !userForm.idrol || !userForm.idCaja) {
           return Swal.fire('Error', 'Seleccione Empleado, Rol y Caja', 'warning');
        }
        if(isEditing) await AdminService.updateUser(currentId!, userForm);
        else await AdminService.createUser(userForm);
      } else if (modalType === 'EMPLOYEES') {
        const empPayload = { ...empForm, estado: empForm.estado as EstadoGeneral };
        if (isEditing) await AdminService.updateEmpleado(currentId!, empPayload);
        else await AdminService.createEmpleado({ ...empPayload, estado: 'Activo' });
      } else if (modalType === 'ROLES') {
        const rolPayload = { ...simpleForm, estado: simpleForm.estado as EstadoGeneral };
        if (isEditing) await AdminService.updateRol(currentId!, rolPayload);
        else await AdminService.createRol(simpleForm.nombre);
      } else if (modalType === 'CAJAS') {
        const cajaPayload = { ...simpleForm, estado: simpleForm.estado as Caja['estado'] };
        if (isEditing) await AdminService.updateCaja(currentId!, cajaPayload);
        else await AdminService.createCaja(simpleForm.nombre);
      }
      
      Swal.fire({
        icon: 'success',
        title: isEditing ? 'Registro actualizado' : 'Registro creado',
        showConfirmButton: false,
        timer: 1500
      });

      setShowModal(false);
      loadAllData();
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Error desconocido'
      });
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{getTitle()}</h2>
          <p className="text-slate-500 mt-1 text-sm">Administración del sistema</p>
        </div>
        <button 
            onClick={() => openModal(activeTab)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all w-full md:w-auto justify-center"
          >
            <PlusCircle size={18} /> Nuevo
          </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col">
        {loading ? (
          <div className="p-10 text-center text-slate-500">Cargando datos...</div>
        ) : (
          <div className="overflow-x-auto w-full flex-1">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold sticky top-0">
                 <tr>
                    {activeTab === 'USERS' && (
                      <>
                        <th className="p-4">Usuario / Empleado</th>
                        <th className="p-4">Rol / Caja</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </>
                    )}
                    {activeTab === 'EMPLOYEES' && (
                      <>
                        <th className="p-4">Empleado</th>
                        <th className="p-4">Dirección</th>
                        <th className="p-4">Teléfono</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </>
                    )}
                    {(activeTab === 'ROLES' || activeTab === 'CAJAS') && (
                       <>
                        <th className="p-4">ID</th>
                        <th className="p-4">Nombre</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                       </>
                    )}
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeTab === 'USERS' && users.map(u => (
                  <tr key={u.codUsuario} className="hover:bg-slate-50">
                     <td className="p-4">
                        <div className="font-bold text-slate-700">{u.usuario}</div>
                        <div className="text-xs text-slate-400">{u.nombreEmpleado}</div>
                     </td>
                     <td className="p-4 text-xs">
                        <div className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded inline-block mb-1 font-bold">{u.nombreRol || u.idrol}</div>
                        <div className="text-slate-500">{cajas.find(c => c.idCaja === u.idCaja)?.nombre || u.idCaja}</div>
                     </td>
                     <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${u.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.estado}</span></td>
                     <td className="p-4 text-right">
                        <button onClick={() => openModal('USERS', u)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors"><Edit2 size={16}/></button>
                     </td>
                  </tr>
                ))}
                
                {activeTab === 'EMPLOYEES' && empleados.map(e => (
                   <tr key={e.identidad} className="hover:bg-slate-50">
                      <td className="p-4">
                         <div className="font-bold text-slate-800">{e.nombre} {e.apellido}</div>
                         <div className="text-xs font-mono text-slate-500">{e.identidad}</div>
                      </td>
                      <td className="p-4 text-xs text-slate-600">{e.direccion}</td>
                      <td className="p-4 text-xs font-mono">{e.telefono}</td>
                      <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${e.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{e.estado}</span></td>
                      <td className="p-4 text-right">
                         <button onClick={() => openModal('EMPLOYEES', e)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors"><Edit2 size={16}/></button>
                      </td>
                   </tr>
                ))}

                {(activeTab === 'ROLES' || activeTab === 'CAJAS') && (activeTab === 'ROLES' ? roles : cajas).map((item: any) => (
                    <tr key={item.idrol || item.idCaja} className="hover:bg-slate-50">
                        <td className="p-4 text-xs font-mono text-slate-500">{item.idrol || item.idCaja}</td>
                        <td className="p-4 font-bold text-slate-800">{item.nombre}</td>
                        <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${item.estado === 'Activo' || item.estado === 'Activa' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.estado}</span></td>
                        <td className="p-4 text-right">
                           <button onClick={() => openModal(activeTab, item)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors"><Edit2 size={16}/></button>
                        </td>
                    </tr>
                ))}

                {/* Fallback for empty */}
                {(
                    (activeTab === 'USERS' && users.length === 0) || 
                    (activeTab === 'EMPLOYEES' && empleados.length === 0) ||
                    (activeTab === 'ROLES' && roles.length === 0)
                 ) && <tr><td colSpan={4} className="p-8 text-center text-slate-400">No hay registros encontrados</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-xl font-bold text-slate-800">
                    {isEditing ? 'Editar' : 'Nuevo'} {modalType === 'USERS' ? 'Usuario' : modalType === 'EMPLOYEES' ? 'Empleado' : modalType === 'ROLES' ? 'Rol' : 'Caja'}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24}/></button>
             </div>
             
             <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* --- FORMULARIO USUARIOS --- */}
                {modalType === 'USERS' && (
                    <>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Usuario</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                value={userForm.usuario} onChange={e => setUserForm({...userForm, usuario: e.target.value})} placeholder="Ej: admin" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Contraseña {isEditing && '(Dejar en blanco para mantener)'}</label>
                            <input type="password" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} placeholder={isEditing ? "******" : "Contraseña"} required={!isEditing}/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Vincular a Empleado</label>
                            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                value={userForm.identidad} onChange={e => setUserForm({...userForm, identidad: e.target.value})} required>
                                <option value="">-- Seleccionar Empleado --</option>
                                {empleados.map(e => (
                                    <option key={e.identidad} value={e.identidad}>{e.nombre} {e.apellido}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Rol</label>
                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={userForm.idrol} onChange={e => setUserForm({...userForm, idrol: e.target.value})} required>
                                    <option value="">-- Rol --</option>
                                    {roles.map(r => <option key={r.idrol} value={r.idrol}>{r.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Caja Asignada</label>
                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={userForm.idCaja} onChange={e => setUserForm({...userForm, idCaja: e.target.value})} required>
                                    <option value="">-- Caja --</option>
                                    {cajas.map(c => <option key={c.idCaja} value={c.idCaja}>{c.nombre}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                             <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                             <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={userForm.estado} onChange={e => setUserForm({...userForm, estado: e.target.value})}>
                                <option value="Activo">Activo</option>
                                <option value="Inactivo">Inactivo</option>
                             </select>
                        </div>
                    </>
                )}

                {/* --- FORMULARIO EMPLEADOS --- */}
                {modalType === 'EMPLOYEES' && (
                    <>
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Número Identidad</label>
                            <input required disabled={isEditing} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 disabled:bg-slate-200" 
                                value={empForm.identidad} onChange={e => setEmpForm({...empForm, identidad: e.target.value})} placeholder="0000-0000-00000" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                                <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={empForm.nombre} onChange={e => setEmpForm({...empForm, nombre: e.target.value})} />
                             </div>
                             <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Apellido</label>
                                <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={empForm.apellido} onChange={e => setEmpForm({...empForm, apellido: e.target.value})} />
                             </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Dirección</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={empForm.direccion} onChange={e => setEmpForm({...empForm, direccion: e.target.value})} />
                        </div>
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Teléfono</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={empForm.telefono} onChange={e => setEmpForm({...empForm, telefono: e.target.value})} />
                        </div>
                    </>
                )}

                {/* --- FORMULARIO ROLES Y CAJAS --- */}
                {(modalType === 'ROLES' || modalType === 'CAJAS') && (
                    <>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Nombre / Descripción</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={simpleForm.nombre} onChange={e => setSimpleForm({...simpleForm, nombre: e.target.value})} />
                        </div>
                        <div>
                             <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                             <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={simpleForm.estado} onChange={e => setSimpleForm({...simpleForm, estado: e.target.value})}>
                                <option value="Activo">Activo</option>
                                <option value="Inactivo">Inactivo</option>
                             </select>
                        </div>
                    </>
                )}

                <div className="pt-4 flex gap-3">
                   <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                   <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all">Guardar</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
