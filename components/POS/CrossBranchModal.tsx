import React from 'react';
import { X, Building2, ArrowRightLeft, RefreshCw, Pill, MapPin } from 'lucide-react';
import { ProductoFarmacia } from '../../types';
import { CrossBranchModalState } from './types';
import Swal from 'sweetalert2';

interface Props {
  modal: CrossBranchModalState;
  onClose: () => void;
  onBillFromBranch: (product: ProductoFarmacia, branch: any) => void;
}

export default function CrossBranchModal({ modal, onClose, onBillFromBranch }: Props) {
  if (!modal.visible || !modal.product) return null;

  const availableBranches = modal.branches.filter(b => Number(b.stock_disponible) > 0);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Building2 size={11} /> Sin stock en esta sucursal
            </p>
            <h3 className="font-black text-slate-800 text-sm leading-snug">
              {modal.product.nombreGenerico}{modal.product.concentracion ? ` ${modal.product.concentracion}` : ''}
            </h3>
            {modal.product.nombreComercial && <p className="text-xs text-slate-500 mt-0.5">{modal.product.nombreComercial}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
        </div>

        <div className="p-4">
          {modal.loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <RefreshCw size={24} className="animate-spin" />
            </div>
          ) : availableBranches.length === 0 ? (
            <div className="text-center py-8">
              <Pill size={36} className="mx-auto text-slate-300 mb-2" strokeWidth={1.5} />
              <p className="text-sm font-bold text-slate-500">Sin stock en ninguna sucursal</p>
              <p className="text-xs text-slate-400 mt-1">Este medicamento no está disponible actualmente.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Disponibilidad por sucursal</p>
              {availableBranches.map((branch: any) => (
                <div key={branch.id_sucursal} className="border border-slate-200 rounded-2xl p-3 bg-slate-50">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-black text-slate-800 text-xs">{branch.sucursal_nombre}</p>
                      {branch.ciudad && <p className="text-[10px] text-slate-400">{branch.ciudad}</p>}
                      {branch.direccion && (
                        <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin size={9} className="shrink-0" /> {branch.direccion}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      {branch.stock_disponible} uds
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onClose();
                        Swal.fire({
                          toast: true, position: 'top-end', icon: 'info',
                          title: `Disponible en ${branch.sucursal_nombre}`,
                          html: branch.telefono ? `Tel: ${branch.telefono}` : '',
                          showConfirmButton: false, timer: 4000,
                        });
                      }}
                      className="flex-1 py-1.5 text-[10px] font-bold rounded-xl border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      Solo informar
                    </button>
                    <button
                      onClick={() => onBillFromBranch(modal.product!, branch)}
                      className="flex-1 py-1.5 text-[10px] font-bold rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors flex items-center justify-center gap-1"
                    >
                      <ArrowRightLeft size={11} /> Facturar aquí
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
