
import React, { useState, useEffect } from 'react';
import { ConfigService } from '../services/api';
import { EmpresaConfig } from '../types';
import { Settings, Save, Building2, FileText, AlertCircle } from 'lucide-react';
import Swal from 'sweetalert2';

const CompanyConfig: React.FC = () => {
  const [config, setConfig] = useState<EmpresaConfig>({
    nombreEmpresa: '',
    rtn: '',
    direccion: '',
    telefono: '',
    correo: '',
    cai: '',
    rangoInicial: '',
    rangoFinal: '',
    fechaLimite: '',
    isv: 15,
    mensajeFinal: 'LA FACTURA ES BENEFICIO DE TODOS, EXIJALA'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await ConfigService.get();
      if(data) setConfig(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ConfigService.update(config);
      Swal.fire({
        icon: 'success',
        title: 'Configuración Guardada',
        text: 'Los datos de la empresa han sido actualizados.',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando configuración...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
            <Settings className="text-white" size={24}/>
        </div>
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Configuración de Empresa</h2>
            <p className="text-slate-500 text-sm">Gestiona la información legal y parámetros del SAR.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6">
        {/* SECCION 1: DATOS GENERALES */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Building2 className="text-indigo-600"/> Datos Generales
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nombre de la Empresa</label>
                    <input required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.nombreEmpresa} onChange={e => setConfig({...config, nombreEmpresa: e.target.value})} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">R.T.N.</label>
                    <input required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.rtn} onChange={e => setConfig({...config, rtn: e.target.value})} placeholder="00000000000000" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Teléfono</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.telefono} onChange={e => setConfig({...config, telefono: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Dirección</label>
                    <textarea required rows={2} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.direccion} onChange={e => setConfig({...config, direccion: e.target.value})} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Correo Electrónico</label>
                    <input type="email" className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.correo} onChange={e => setConfig({...config, correo: e.target.value})} />
                </div>
            </div>
        </div>

        {/* SECCION 2: DATOS SAR */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                <FileText className="text-indigo-600"/> Normativa de Facturación (SAR)
            </h3>
            
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-blue-800 text-sm mb-4 flex gap-2">
                <AlertCircle size={18} className="shrink-0"/>
                Estos datos aparecerán impresos en la factura. Asegúrate que coincidan con tu resolución vigente.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">CAI (Clave de Autorización)</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono" 
                        value={config.cai} onChange={e => setConfig({...config, cai: e.target.value})} placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Rango Inicial</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono" 
                        value={config.rangoInicial} onChange={e => setConfig({...config, rangoInicial: e.target.value})} placeholder="000-001-01-00000001" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Rango Final</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono" 
                        value={config.rangoFinal} onChange={e => setConfig({...config, rangoFinal: e.target.value})} placeholder="000-001-01-00002000" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Fecha Límite de Emisión</label>
                    <input type="date" required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.fechaLimite} onChange={e => setConfig({...config, fechaLimite: e.target.value})} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Porcentaje ISV (%)</label>
                    <input type="number" required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.isv} onChange={e => setConfig({...config, isv: Number(e.target.value)})} />
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Mensaje / Leyenda Final</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.mensajeFinal} onChange={e => setConfig({...config, mensajeFinal: e.target.value})} />
                </div>
            </div>
        </div>

        <div className="flex justify-end pt-4">
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2">
                <Save size={20}/> Guardar Cambios
            </button>
        </div>
      </form>
    </div>
  );
};

export default CompanyConfig;
