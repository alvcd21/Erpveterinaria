import React from 'react';
import { Lock } from 'lucide-react';

interface Props {
  name: string;
  icon: React.ReactNode;
  minimumPlan?: string;
}

const PLAN_LABELS: Record<string, string> = {
  profesional: 'Profesional',
  enterprise: 'Enterprise',
};

const PlanLockedItem: React.FC<Props> = ({ name, icon, minimumPlan = 'profesional' }) => (
  <div className="relative group mb-1">
    <div className="flex items-center gap-3 px-4 py-2 rounded-lg opacity-40 cursor-not-allowed select-none">
      <span className="text-slate-500">{icon}</span>
      <span className="text-sm text-slate-500 flex-1">{name}</span>
      <Lock size={12} className="text-slate-500 shrink-0" />
    </div>
    {/* Tooltip upgrade */}
    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity shadow-lg border border-slate-700">
      <span className="text-amber-400">Plan {PLAN_LABELS[minimumPlan] ?? minimumPlan}</span> requerido
      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
    </div>
  </div>
);

export default PlanLockedItem;
