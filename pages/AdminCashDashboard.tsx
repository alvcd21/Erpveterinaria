
import React, { useEffect, useState } from 'react';
import { CashService } from '../services/api';
import { Activity, Lock, Unlock, RefreshCw, AlertTriangle } from 'lucide-react';
import Swal from 'sweetalert2';

const AdminCashDashboard: React.FC = () => {
  const [boxes, setBoxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await CashService.getAdminBoxesStatus();
      setBoxes(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleReopenBox = async (idArqueo: string) => {
      const result = await Swal.fire({
          title: '¿Reabrir Caja?',
          text: 'Esta acción revertirá el cierre y permitirá nuevas transacciones en esa sesión. Úselo con precaución.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#f59e0b',
          confirmButtonText: 'Sí, reabrir'
      });

      if (result.isConfirmed) {
          try {
              await CashService.reopenBox(idArqueo);
              Swal.fire('Éxito', 'La caja ha sido reabierta.', 'success');
              loadData();
          } catch (error: any) {
              Swal.fire('Error', error.message, 'error');
          }
      }
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Activity className="text-indigo-600"/> Panel de Control de Cajas
            </h2>
            <p className="text-slate-500 text-sm">Monitoreo en tiempo real y gestión de cierres</p>
          </div>
          <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg bg-white border border-slate-200">
            <RefreshCw size={20} />
          </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {boxes.map((box) => (
              <div key={box.idCaja} className={`bg-white rounded-2xl p-6 shadow-sm border-l-4 ${box.estadoArqueo === 'Activo' ? 'border-l-emerald-500' : 'border-l-slate-300'}`}>
                  <div className="flex justify-between items-start mb-4">
                      <div>
                          <h3 className="font-bold text-lg text-slate-800">{box.nombreCaja}</h3>
                          <p className="text-xs text-slate-500">{box.idCaja}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${box.estadoArqueo === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {box.estadoArqueo === 'Activo' ? <Unlock size={12}/> : <Lock size={12}/>}
                          {box.estadoArqueo || 'Cerrada'}
                      </span>
                  </div>

                  <div className="space-y-3 mb-6">
                      <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Usuario Actual:</span>
                          <span className="font-medium text-slate-700">{box.usuario || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Apertura:</span>
                          <span className="font-mono text-slate-600">{box.fechaApertura ? new Date(box.fechaApertura).toLocaleString() : '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Monto Inicial:</span>
                          <span className="font-bold text-slate-700">L. {Number(box.montoInicial || 0).toFixed(2)}</span>
                      </div>
                      {box.ganancia !== null && (
                          <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                              <span className="text-slate-500 font-bold">Ganancia (Est.):</span>
                              <span className="font-bold text-indigo-600">L. {Number(box.ganancia).toFixed(2)}</span>
                          </div>
                      )}
                  </div>

                  {box.estadoArqueo === 'Cerrada' && box.idArqueo && (
                      <button 
                        onClick={() => handleReopenBox(box.idArqueo)}
                        className="w-full py-2 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg text-sm font-bold hover:bg-amber-100 transition-colors flex items-center justify-center gap-2"
                      >
                          <AlertTriangle size={16}/> Reabrir Caja
                      </button>
                  )}
                  
                  {box.estadoArqueo === 'Activo' && (
                      <div className="w-full py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg text-sm font-bold text-center">
                          Operando
                      </div>
                  )}
              </div>
          ))}
       </div>
    </div>
  );
};

export default AdminCashDashboard;
