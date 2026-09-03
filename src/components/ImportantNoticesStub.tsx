/**
 * Panel de campanillas: maqueta sin datos (misma forma que CRM, sin Supabase).
 */

import React from 'react';
import type { Workshop } from '../types';
import { Bell, Megaphone } from 'lucide-react';

export type ImportantNoticesStubProps = {
  workshop: Workshop;
  isDarkMode: boolean;
  onClose: () => void;
  onGoToMarketing?: () => void;
  rootClassName?: string;
  rootStyle?: React.CSSProperties;
};

export default function ImportantNoticesStub({
  workshop,
  isDarkMode,
  onClose,
  rootClassName = '',
  rootStyle,
}: ImportantNoticesStubProps) {
  const panelCls = isDarkMode
    ? 'bg-[#0b1121] border-slate-800 text-slate-200'
    : 'bg-white border-slate-200 text-slate-800';

  return (
    <div
      className={`w-[min(100vw-2rem,380px)] rounded-2xl border shadow-2xl overflow-hidden animate-fade-in-down ${panelCls} ${rootClassName}`}
      style={rootStyle}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-teal-500 shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-wider">Bandeja</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`text-[10px] font-bold uppercase ${isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
        >
          Cerrar
        </button>
      </div>
      <div className={`p-8 text-center ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
          <Megaphone size={22} />
        </div>
        <p className="text-sm font-semibold">Sin integración de datos</p>
        <p className="mt-2 text-[11px] leading-relaxed">
          Aquí aparecerían avisos conectados al taller <span className="font-mono text-teal-600 dark:text-teal-400">{workshop.name}</span>.
          En esta plantilla el panel solo conserva la estructura visual.
        </p>
      </div>
    </div>
  );
}
