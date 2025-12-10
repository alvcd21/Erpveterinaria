import React, { useState, useEffect } from 'react';
import { Usuario, Empleado, Rol, Caja, EstadoGeneral } from '../types';
import { AdminService } from '../services/api';
import { Users, Shield, Box, Briefcase, PlusCircle, X, Edit2, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

type Tab = 'USERS' | 'EMPLOYEES' | 'ROLES' | 'CAJAS';

const AdminUsers: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('USERS');
  
  // Data State
  const [users, setUsers] = useState<Usuario[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal & Edit State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<Tab>('USERS');
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Form States
  const [userForm, setUserForm] = useState({ usuario: '', password: '', identidad: '', idrol: '', idCaja: '', estado: 'Activo' });
  const [empForm, setEmpForm] = useState({ identidad: '', nombre: '', apellido: '', direccion: '', telefono: '', estado: 'Activo' });
  const [simpleForm, setSimpleForm] = useState({ nombre: '', estado: 'Activo' });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [u, e, r, c] = await Promise.all([
        AdminService.getUsers(),
        AdminService.getEmpleados(),
        AdminService.getRoles(),
        AdminService.getCajas()
      ]);
      setUsers(u);
      setEmpleados(e);
      setRoles(r);
      setCajas(c);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (type: Tab, data?: any) => {
    setModalType(type);
    setIsEditing(!!data);
    setCurrentId(data ? (data.codUsuario || data.identidad || data.idrol || data.idCaja) : null);

    // Reset or Fill Forms
    if (type === 'USERS') {
      setUserForm(data ? { 
        usuario: data.usuario, 
        password: '', 
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
        if (isEditing) await AdminService.updateUser(currentId!, userForm);
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

  const handleDelete = async (type: Tab, id: string) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: "No podrás revertir esto. Si el registro está en uso, no se podrá eliminar.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        if (type === 'USERS') await AdminService.deleteUser(id);
        else if (type === 'EMPLOYEES') await AdminService.deleteEmpleado(id);
        else if (type === 'ROLES') await AdminService.deleteRol(id);
        else if (type === 'CAJAS') await AdminService.deleteCaja(id);
        
        Swal.fire('Eliminado', 'El registro ha sido eliminado.', 'success');
        loadAllData();
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Panel de Administración</h2>
          <p className="text-slate-500 mt-1">Gestión de Empleados, Usuarios y Permisos</p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {[
          { id: 'USERS', icon: <Users size={18}/>, label: 'Usuarios' },
          { id: 'EMPLOYEES', icon: <Briefcase size={18}/>, label: 'Empleados' },
          { id: 'ROLES', icon: <Shield size={18}/>, label: 'Roles' },
          { id: 'CAJAS', icon: <Box size={18}/>, label: 'Cajas' }
        ].map((tab) => (
           <button 
             key={tab.id}
             onClick={() => setActiveTab(tab.id as Tab)}
             className={`px-5 py-2.5 rounded-t-xl font-bold text-sm flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
           >
             {tab.icon} {tab.label}
           </button>
        ))}
      </div>

      {/* CONTENIDO */}
      <div className="bg-white rounded-b-2xl rounded-tr-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-end">
          <button 
            onClick={() => openModal(activeTab)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold text-sm shadow-sm transition-all"
          >
            <PlusCircle size={18} /> Nuevo Registro
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">Cargando datos...</div>
        ) : (
          <div className="overflow-x-auto">
            
            {/* TABLA USUARIOS */}
            {activeTab === 'USERS' && (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="p-4">Usuario</th>
                    <th className="p-4">Empleado</th>
                    <th className="p-4">Rol / Caja</th>
                    <th className="p-4 text-center">Estado</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(u => (
                    <tr key={u.codUsuario} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="font-bold text-slate-700">{u.usuario}</div>
                        <div className="text-xs text-slate-400 font-mono">{u.codUsuario}</div>
                      </td>
                      <td className="p-4 text-sm">{u.nombreEmpleado}</td>
                      <td className="p-4 text-xs">
                        <div className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded inline-block mb-1">{u.nombreRol}</div>
                        <div className="text-slate-500">{u.nombreCaja}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.estado}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button onClick={() => openModal('USERS', u)} className="text-blue-500 hover:bg-blue-50 p-2 rounded mr-1"><Edit2 size={16}/></button>
                        <button onClick={() => handleDelete('USERS', u.codUsuario)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* TABLA EMPLEADOS */}
            {activeTab === 'EMPLOYEES' && (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="p-4">Identidad</th>
                    <th className="p-4">Nombre Completo</th>
                    <th className="p-4">Contacto</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {empleados.map(e => (
                    <tr key={e.identidad} className="hover:bg-slate-50">
                      <td className="p-4 font-mono font-bold text-slate-600">{e.identidad}</td>
                      <td className="p-4 text-slate-800 font-medium">{e.nombre} {e.apellido}</td>
                      <td className="p-4 text-sm text-slate-500">
                        <div>{e.telefono}</div>
                        <div className="text-xs">{e.direccion}</div>
                      </td>
                      <td className="p-4 text-sm">{e.estado}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => openModal('EMPLOYEES', e)} className="text-blue-500 hover:bg-blue-50 p-2 rounded mr-1"><Edit2 size={16}/></button>
                        <button onClick={() => handleDelete('EMPLOYEES', e.identidad)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* TABLA ROLES */}
            {activeTab === 'ROLES' && (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="p-4">ID</th>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roles.map(r => (
                    <tr key={r.idrol} className="hover:bg-slate-50">
                      <td className="p-4 font-mono text-slate-500 text-xs">{r.idrol}</td>
                      <td className="p-4 font-bold text-slate-700">{r.nombre}</td>
                      <td className="p-4 text-sm">{r.estado}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => openModal('ROLES', r)} className="text-blue-500 hover:bg-blue-50 p-2 rounded mr-1"><Edit2 size={16}/></button>
                        <button onClick={() => handleDelete('ROLES', r.idrol)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

             {/* TABLA CAJAS */}
             {activeTab === 'CAJAS' && (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="p-4">ID</th>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cajas.map(c => (
                    <tr key={c.idCaja} className="hover:bg-slate-50">
                      <td className="p-4 font-mono text-slate-500 text-xs">{c.idCaja}</td>
                      <td className="p-4 font-bold text-slate-700">{c.nombre}</td>
                      <td className="p-4 text-sm">{c.estado}</td>
                      <td className="p-4 text-right">
                         <button onClick={() => openModal('CAJAS', c)} className="text-blue-500 hover:bg-blue-50 p-2 rounded mr-1"><Edit2 size={16}/></button>
                         <button onClick={() => handleDelete('CAJAS', c.idCaja)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* MODAL UNIVERSAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">
                {isEditing ? 'Editar Registro' : 'Nuevo Registro'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* FORMULARIO USUARIOS */}
              {modalType === 'USERS' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500">Usuario</label>
                      <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.usuario} onChange={e => setUserForm({...userForm, usuario: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">Contraseña {isEditing && '(Dejar vacío para no cambiar)'}</label>
                      <input type="password" className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} required={!isEditing} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Empleado</label>
                    <select required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.identidad} onChange={e => setUserForm({...userForm, identidad: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {empleados.map(e => <option key={e.identidad} value={e.identidad}>{e.nombre} {e.apellido}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500">Rol</label>
                      <select required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.idrol} onChange={e => setUserForm({...userForm, idrol: e.target.value})}>
                        <option value="">Seleccione...</option>
                        {roles.map(r => <option key={r.idrol} value={r.idrol}>{r.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">Caja</label>
                      <select required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.idCaja} onChange={e => setUserForm({...userForm, idCaja: e.target.value})}>
                        <option value="">Seleccione...</option>
                        {cajas.map(c => <option key={c.idCaja} value={c.idCaja}>{c.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  {isEditing && (
                     <div>
                       <label className="text-xs font-bold text-slate-500">Estado</label>
                       <select className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.estado} onChange={e => setUserForm({...userForm, estado: e.target.value})}>
                          <option value="Activo">Activo</option>
                          <option value="Inactivo">Inactivo</option>
                       </select>
                     </div>
                  )}
                </>
              )}

              {/* FORMULARIO EMPLEADOS */}
              {modalType === 'EMPLOYEES' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Identidad (DNI)</label>
                    <input disabled={isEditing} required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1 disabled:bg-slate-200" value={empForm.identidad} onChange={e => setEmpForm({...empForm, identidad: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500">Nombre</label>
                      <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={empForm.nombre} onChange={e => setEmpForm({...empForm, nombre: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">Apellido</label>
                      <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={empForm.apellido} onChange={e => setEmpForm({...empForm, apellido: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-xs font-bold text-slate-500">Teléfono</label>
                       <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={empForm.telefono} onChange={e => setEmpForm({...empForm, telefono: e.target.value})} />
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-500">Dirección</label>
                       <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={empForm.direccion} onChange={e => setEmpForm({...empForm, direccion: e.target.value})} />
                    </div>
                  </div>
                  {isEditing && (
                     <div>
                       <label className="text-xs font-bold text-slate-500">Estado</label>
                       <select className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={empForm.estado} onChange={e => setEmpForm({...empForm, estado: e.target.value})}>
                          <option value="Activo">Activo</option>
                          <option value="Inactivo">Inactivo</option>
                       </select>
                     </div>
                  )}
                </>
              )}

              {/* FORMULARIO SIMPLE (Roles y Cajas) */}
              {(modalType === 'ROLES' || modalType === 'CAJAS') && (
                <>
                  <div>
                     <label className="text-xs font-bold text-slate-500">Nombre</label>
                     <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={simpleForm.nombre} onChange={e => setSimpleForm({...simpleForm, nombre: e.target.value})} />
                  </div>
                  {isEditing && (
                     <div>
                       <label className="text-xs font-bold text-slate-500">Estado</label>
                       <select className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={simpleForm.estado} onChange={e => setSimpleForm({...simpleForm, estado: e.target.value})}>
                          <option value="Activo">Activo</option>
                          <option value="Inactivo">Inactivo</option>
                          {modalType === 'CAJAS' && <option value="Activa">Activa</option>}
                       </select>
                     </div>
                  )}
                </>
              )}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20">{isEditing ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;