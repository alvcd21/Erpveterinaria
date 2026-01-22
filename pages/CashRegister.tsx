
import React, { useState, useEffect } from 'react';
import { CashService, SalesService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Saldo, Venta } from '../types';
import { 
  Lock, Unlock, RefreshCw, Printer, CheckCircle, Edit2, Ban 
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const CashRegister: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeArqueo, setActiveArqueo] = useState<Arqueo | null>(null);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'RESUMEN' | 'VENTAS' | 'INGRESOS' | 'EGRESOS' | 'SALDOS'>('RESUMEN');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!user?.idCaja) return;
    setLoading(true);
    try {
      const arqueo = await CashService.getActiveArqueo();
      setActiveArqueo(arqueo);
      if (arqueo) {
        const fecha = new Date().toISOString().split('T')[0];
        const [ing, egr, vnt, sld] = await Promise.all([
          CashService.getIngresos(user.idCaja, fecha),
          CashService.getEgresos(user.idCaja, fecha),
          SalesService.getVentasDiDaily(fecha),
          CashService.getSaldosToday(fecha)
        ]);
        setIngresos(ing);
        setEgresos(egr);
        setVentas(vnt);
        setSaldos(sld);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnularVenta = async (id: string) => {
    const result = await Swal.fire({ 
      title: '¿Anular Venta?', 
      text: 'Se eliminará el ingreso asociado y devolverá stock.', 
      icon: 'warning', 
      showCancelButton: true, 
      confirmButtonColor: '#d33' 
    });
    if(result.isConfirmed) { 
      try { 
        await SalesService.anularVenta(id); 
        loadData(); 
        Swal.fire('Éxito', 'Venta anulada e ingreso eliminado', 'success'); 
      } catch(e:any) { 
        Swal.fire('Error', e.message, 'error'); 
      } 
    }
  };

  const handleConfirmarDeposito = async (id: string) => {
    const result = await Swal.fire({ 
        title: '¿Confirmar Depósito?', 
        text: 'Se registrará el ingreso de la financiera en la contabilidad actual.', 
        icon: 'question', 
        showCancelButton: true, 
        confirmButtonText: 'Sí, Depositar',
        confirmButtonColor: '#10b981'
    });
    if(result.isConfirmed) { 
        try { 
            await SalesService.confirmKrediYaDeposit(id); 
            loadData(); 
            Swal.fire('Éxito', 'Depósito conciliado correctamente', 'success'); 
        } catch(e:any) { 
            Swal.fire('Error', e.message, 'error'); 
        } 
    }
  };

  const handleReprintInvoice = (id: string) => {
    Swal.fire('Imprimiendo...', `Reimpresión de factura ${id}`, 'info');
  };

  if (!activeArqueo && !loading) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-3xl shadow-sm border border-slate-200">
        <Lock size={64} className="text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Caja Cerrada</h2>
        <p className="text-slate-500 mb-6">Debe realizar la apertura de caja para operar.</p>
        <button 
          onClick={() => navigate('/pos')} 
          className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold"
        >
          Ir al Punto de Venta
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Unlock className="text-emerald-500" /> Caja Activa: {user?.idCaja}
        </h2>
        <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {['RESUMEN', 'VENTAS', 'INGRESOS', 'EGRESOS', 'SALDOS'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
         {activeTab === 'RESUMEN' && (
           <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <p className="text-slate-500 text-xs font-bold uppercase">Monto Inicial</p>
                <h3 className="text-2xl font-bold text-slate-800">L. {Number(activeArqueo?.montoInicial || 0).toFixed(2)}</h3>
              </div>
              <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                <p className="text-emerald-600 text-xs font-bold uppercase">Ventas Totales</p>
                <h3 className="text-2xl font-bold text-emerald-700">L. {Number(activeArqueo?.totalVentas || 0).toFixed(2)}</h3>
              </div>
              <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
                <p className="text-red-600 text-xs font-bold uppercase">Gastos Totales</p>
                <h3 className="text-2xl font-bold text-red-700">L. {Number(activeArqueo?.TotalGastos || 0).toFixed(2)}</h3>
              </div>
           </div>
         )}

         {activeTab === 'VENTAS' && (
           <div className="p-4 space-y-4 animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-bold">
                    <tr>
                      <th className="p-3">Factura</th>
                      <th className="p-3">Cliente</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3">Tipo/Estado</th>
                      <th className="p-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                  {ventas.length === 0 ? (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic">No hay ventas registradas hoy.</td></tr>
                  ) : ventas.map(v => (
                    <tr key={v.codVenta} className={`border-b hover:bg-slate-50 transition-colors ${v.estado === 'Anulada' ? 'opacity-40 bg-slate-50' : ''}`}>
                      <td className="p-3 font-mono text-xs">{v.codVenta}</td>
                      <td className="p-3">{v.nombreCliente}</td>
                      <td className={`p-3 font-bold text-right ${v.estado === 'Anulada' ? 'line-through text-slate-400' : ''}`}>L. {Number(v.total).toFixed(2)}</td>
                      <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold w-fit ${v.estado === 'Anulada' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{v.estado}</span>
                            <span className={`text-[9px] font-black uppercase ${v.tipoCompra === 'KrediYa' ? 'text-blue-600' : 'text-slate-400'}`}>{v.tipoCompra} {(v as any).estado_pago_financiera ? `(${ (v as any).estado_pago_financiera })` : ''}</span>
                          </div>
                      </td>
                      <td className="p-3 text-right flex justify-end gap-1">
                          <button onClick={() => handleReprintInvoice(v.codVenta)} className="p-1.5 text-slate-500 hover:text-indigo-600 transition-colors" title="Reimprimir"><Printer size={16}/></button>
                          {v.estado !== 'Anulada' && (
                            <>
                                {v.tipoCompra === 'KrediYa' && (v as any).estado_pago_financiera === 'Pendiente' && (
                                    <button onClick={() => handleConfirmarDeposito(v.codVenta)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Confirmar Depósito"><CheckCircle size={16}/></button>
                                )}
                                <button onClick={() => navigate('/pos', { state: { editSaleId: v.codVenta } })} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="Editar"><Edit2 size={16}/></button>
                                <button onClick={() => handleAnularVenta(v.codVenta)} className="p-1.5 text-red-400 hover:text-red-600" title="Anular"><Ban size={16}/></button>
                            </>
                          )}
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
           </div>
         )}
         
         {activeTab === 'INGRESOS' && (
            <div className="p-4">
               <div className="text-center p-10 text-slate-400">Detalle de ingresos adicionales...</div>
            </div>
         )}
         
         {activeTab === 'EGRESOS' && (
            <div className="p-4">
               <div className="text-center p-10 text-slate-400">Detalle de egresos y salidas...</div>
            </div>
         )}
         
         {activeTab === 'SALDOS' && (
            <div className="p-4">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {saldos.map(s => (
                    <div key={s.idsaldos} className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="font-black text-xs text-slate-400 uppercase mb-2">{s.red}</p>
                      <div className="flex justify-between items-end">
                        <span className="text-3xl font-black text-slate-700">L. {Number(s.saldoFinal).toLocaleString()}</span>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Inicio: L. {Number(s.saldoInicio).toLocaleString()}</p>
                          <p className="text-[10px] text-emerald-600 font-bold uppercase">Compra: L. {Number(s.saldoComprado).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
         )}
      </div>
    </div>
  );
};

export default CashRegister;
