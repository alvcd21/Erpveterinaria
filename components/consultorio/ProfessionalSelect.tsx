import React, { useCallback } from 'react';
import { ConsultorioService } from '../../services/api';
import { SearchableOption, SearchableSelect } from './SearchableSelect';

export type ProfessionalValue = {
  id?: string | number;
  nombre?: string;
  usuario?: string;
  rol?: string;
};

type ProfessionalSelectProps = {
  value?: ProfessionalValue | string | null;
  onChange: (value: ProfessionalValue) => void;
};

export function ProfessionalSelect({ value, onChange }: ProfessionalSelectProps) {
  const selected = normalizeProfessionalValue(value);
  const search = useCallback(async (term: string): Promise<SearchableOption<ProfessionalValue>[]> => {
    const rows = await ConsultorioService.getProfesionales({ q: term, limit: 30 });
    return rows.map((row: any) => ({
      id: row.id,
      label: row.nombre || row.usuario || row.identidad,
      description: [row.rol, row.usuario, row.telefono].filter(Boolean).join(' - '),
      raw: row,
    }));
  }, []);

  return (
    <SearchableSelect
      value={selected}
      placeholder="Selecciona un profesional"
      emptyText="No hay empleados que coincidan"
      onSearch={search}
      onChange={option => onChange({
        id: option.id,
        nombre: option.label,
        usuario: option.raw?.usuario,
        rol: option.raw?.rol,
      })}
    />
  );
}

function normalizeProfessionalValue(value?: ProfessionalValue | string | null): SearchableOption<ProfessionalValue> | null {
  if (!value) return null;
  if (typeof value === 'string') return value ? { id: value, label: value } : null;
  const label = value.nombre || value.usuario || '';
  return label ? { id: value.id || label, label, raw: value } : null;
}
