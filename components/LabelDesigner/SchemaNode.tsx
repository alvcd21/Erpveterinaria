import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Table, Key } from 'lucide-react';
import { TABLE_CONTEXT_MAP, toContextColName } from './constants';

interface Props {
  table: string;
  contextPath?: string;
  schema: Record<string, any>;
  onSelect: (varPath: string) => void;
  level?: number;
}

const SchemaNode: React.FC<Props> = ({ table, contextPath, schema, onSelect, level = 0 }) => {
    const [expanded, setExpanded] = useState(false);
    const tableDef = schema[table];
    if (!tableDef) return null;
    const displayPath = contextPath || TABLE_CONTEXT_MAP[table] || table;

    return (
        <div style={{ marginLeft: level * 12 }} className="border-l border-slate-200 pl-1 mt-1">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 p-2 w-full hover:bg-slate-100 rounded text-left"
            >
                {expanded ? <ChevronDown size={14} className="text-slate-400"/> : <ChevronRight size={14} className="text-slate-400"/>}
                <span className="font-bold text-slate-700 text-xs uppercase flex items-center gap-1">
                    {level === 0 ? <Table size={14} className="text-indigo-500"/> : <Key size={12} className="text-amber-500"/>}
                    <span>{table}</span>
                    {level === 0 && TABLE_CONTEXT_MAP[table] && (
                        <span className="ml-1 text-[9px] font-normal text-slate-400 normal-case">→ {'{{'}{TABLE_CONTEXT_MAP[table]}{'}}'}...</span>
                    )}
                </span>
            </button>

            {expanded && (
                <div className="pl-4">
                    <div className="grid grid-cols-2 gap-1 mb-2">
                        {tableDef.columns.map((col: any) => {
                            const mapped = toContextColName(col.name);
                            const varPath = `${displayPath}.${mapped}`;
                            return (
                                <button
                                    key={col.name}
                                    onClick={() => onSelect(varPath)}
                                    title={`Insertar {{${varPath}}}`}
                                    className="flex items-center gap-2 p-1.5 hover:bg-indigo-50 rounded text-left group transition-all"
                                >
                                    <div className="w-4 h-4 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-[8px] font-bold group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                        {col.type === 'integer' || col.type === 'numeric' ? '#' : 'T'}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-medium text-slate-600 group-hover:text-indigo-700 truncate">{col.name}</div>
                                        {mapped !== col.name && <div className="text-[9px] text-slate-400 truncate">{mapped}</div>}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {tableDef.relations.length > 0 && (
                        <div className="mb-2">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wide px-1 mb-1">Relaciones (JOIN)</div>
                            {tableDef.relations.map((rel: any) => (
                                <SchemaNode
                                    key={`${rel.foreignTable}-${rel.column}`}
                                    table={rel.foreignTable}
                                    contextPath={TABLE_CONTEXT_MAP[rel.foreignTable] || rel.foreignTable}
                                    schema={schema}
                                    onSelect={onSelect}
                                    level={level + 1}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SchemaNode;
