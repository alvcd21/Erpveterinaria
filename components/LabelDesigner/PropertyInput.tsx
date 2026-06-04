import React, { memo, useState, useEffect } from 'react';

interface Props {
    label?: string;
    value: any;
    onChange: (v: any) => void;
    type?: string;
    step?: number | string;
    min?: number | string;
    className?: string;
    disabled?: boolean;
    placeholder?: string;
}

const PropertyInput = memo(({ label, value, onChange, type = 'text', step, min, className, disabled, placeholder }: Props) => {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => { setLocalValue(value); }, [value]);

    const handleBlur = () => {
        let finalVal = localValue;
        if (type === 'number') {
            finalVal = parseFloat(localValue);
            if (isNaN(finalVal)) finalVal = 0;
        }
        if (finalVal !== value) onChange(finalVal);
    };

    return (
        <div className={`flex flex-col gap-1 ${className || ''}`}>
            {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</label>}
            <div className={`flex items-center gap-1 bg-white border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all overflow-hidden h-9 ${disabled ? 'bg-slate-100' : ''}`}>
                <input
                    type={type} step={step} min={min} disabled={disabled} placeholder={placeholder}
                    className="w-full px-2 text-sm font-medium outline-none bg-transparent h-full text-slate-700"
                    value={localValue}
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                />
            </div>
        </div>
    );
});

export default PropertyInput;
