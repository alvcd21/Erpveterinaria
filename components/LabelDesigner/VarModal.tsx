import React from 'react';
import { X, Database } from 'lucide-react';
import { CONTEXT_GROUPS, COLOR_MAP, TABLE_CONTEXT_MAP } from './constants';
import SchemaNode from './SchemaNode';

interface Props {
    selectedId: string | null;
    template: any;
    updateElement: (id: string, updates: any) => void;
    setShowVarModal: (v: boolean) => void;
    dbSchema: any;
    varTab: 'context' | 'schema';
    setVarTab: (v: 'context' | 'schema') => void;
    varSearch: string;
    setVarSearch: (v: string) => void;
}

const VarModal: React.FC<Props> = ({
    selectedId, template, updateElement, setShowVarModal, dbSchema,
    varTab, setVarTab, varSearch, setVarSearch,
}) => {
    const insertVar = (varKey: string) => {
        const inner = varKey.startsWith('{{') ? varKey.slice(2, -2) : varKey;
        if (selectedId) {
            const oldContent = template.elements.find((e: any) => e.id === selectedId)?.content || '';
            updateElement(selectedId, { content: oldContent + `{{${inner}}}` });
        }
        setShowVarModal(false);
    };
    const search = varSearch.toLowerCase();

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-lg h-[85vh] shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Database className="text-indigo-600" size={20}/> Explorador de Variables</h3>
                        <p className="text-[11px] text-slate-500">{selectedId ? 'Click en una variable para insertarla.' : 'Selecciona un elemento primero.'}</p>
                    </div>
                    <button onClick={() => setShowVarModal(false)} className="p-2 hover:bg-slate-200 rounded-full"><X size={18}/></button>
                </div>

                <div className="flex border-b bg-white">
                    <button onClick={() => setVarTab('context')} className={`flex-1 py-2 text-xs font-semibold transition-colors ${varTab === 'context' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
                        Variables Conocidas
                    </button>
                    <button onClick={() => setVarTab('schema')} className={`flex-1 py-2 text-xs font-semibold transition-colors ${varTab === 'schema' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
                        Explorador BD / JOINs
                    </button>
                </div>

                <div className="px-4 py-2 border-b bg-slate-50">
                    <input
                        value={varSearch}
                        onChange={e => setVarSearch(e.target.value)}
                        placeholder="Buscar variable..."
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {varTab === 'context' ? (
                        <div className="p-3 space-y-3">
                            {CONTEXT_GROUPS.map(group => {
                                const filtered = group.vars.filter(v =>
                                    !search || v.key.toLowerCase().includes(search) || v.label.toLowerCase().includes(search)
                                );
                                if (!filtered.length) return null;
                                const c = COLOR_MAP[group.color] || COLOR_MAP.indigo;
                                return (
                                    <div key={group.label} className={`rounded-xl border p-3 ${c.bg}`}>
                                        <div className={`text-xs font-bold mb-2 ${c.text}`}>{group.icon} {group.label}</div>
                                        <div className="grid grid-cols-1 gap-1">
                                            {filtered.map(v => (
                                                <button
                                                    key={v.key}
                                                    onClick={() => insertVar(v.key)}
                                                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/70 text-left transition-all group"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="text-[11px] font-medium text-slate-700 group-hover:text-indigo-700">{v.label}</div>
                                                        <code className={`text-[9px] px-1 rounded ${c.badge}`}>{`{{${v.key}}}`}</code>
                                                    </div>
                                                    {v.example && <span className="text-[9px] text-slate-400 flex-shrink-0 hidden sm:block">{v.example}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-3">
                            <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
                                Navega la base de datos. Las relaciones (FK) permiten hacer JOIN entre tablas.
                                El nombre de variable generado ya está mapeado al contexto correcto.
                            </p>
                            {Object.keys(dbSchema).filter(t => !search || t.includes(search)).map(tableName => (
                                <SchemaNode
                                    key={tableName}
                                    table={tableName}
                                    contextPath={TABLE_CONTEXT_MAP[tableName] || tableName}
                                    schema={dbSchema}
                                    onSelect={insertVar}
                                />
                            ))}
                            {Object.keys(dbSchema).length === 0 && (
                                <p className="text-xs text-slate-400 text-center py-8">Cargando esquema...</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VarModal;
