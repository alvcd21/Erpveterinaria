import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';

export type SearchableOption<T = any> = {
  id: string | number;
  label: string;
  description?: string;
  raw?: T;
};

type SearchableSelectProps<T = any> = {
  value?: SearchableOption<T> | null;
  placeholder?: string;
  emptyText?: string;
  onSearch: (term: string) => Promise<SearchableOption<T>[]>;
  onChange: (option: SearchableOption<T>) => void;
  onCreate?: () => void;
  createLabel?: string;
};

export function SearchableSelect<T = any>({
  value,
  placeholder = 'Buscar y seleccionar',
  emptyText = 'Sin resultados',
  onSearch,
  onChange,
  onCreate,
  createLabel = 'Registrar nuevo',
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<SearchableOption<T>[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = useMemo(() => value?.label || '', [value]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const next = await onSearch(term);
        if (alive) setOptions(next);
      } finally {
        if (alive) setLoading(false);
      }
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, term, onSearch]);

  const pick = (option: SearchableOption<T>) => {
    onChange(option);
    setTerm('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-normal text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
      >
        <span className={selectedLabel ? 'truncate text-slate-800' : 'truncate text-slate-400'}>{selectedLabel || placeholder}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input
              autoFocus
              value={term}
              onChange={event => setTerm(event.target.value)}
              placeholder={placeholder}
              className="w-full border-0 bg-transparent py-2 text-sm outline-none"
            />
            {loading && <Loader2 size={15} className="animate-spin text-indigo-500" />}
          </div>
          {onCreate && (
            <button type="button" onClick={onCreate} className="w-full border-b border-slate-100 px-4 py-2.5 text-left text-sm font-medium text-indigo-600 hover:bg-indigo-50">
              + {createLabel}
            </button>
          )}
          <div className="max-h-64 overflow-auto py-1">
            {options.map(option => (
              <button key={option.id} type="button" onClick={() => pick(option)} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                <span className="block font-medium text-slate-800">{option.label}</span>
                {option.description && <span className="mt-0.5 block text-xs text-slate-400">{option.description}</span>}
              </button>
            ))}
            {!loading && options.length === 0 && <div className="px-4 py-5 text-sm text-slate-400">{emptyText}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
