
import React from 'react';
// Fix: Added ChevronRight to the lucide-react imports
import { Store, Package, Bot, Menu, X, LogOut, Download, Upload, LayoutDashboard, Settings, ClipboardList, BarChart2, Tag, Globe, ChevronRight } from 'lucide-react';
import { AppMode, Language } from '../types';
import { translations } from '../translations';

interface SidebarProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onExport: () => void;
  onImport: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentMode, onModeChange, isOpen, setIsOpen, onExport, onImport, language, setLanguage }) => {
  const t = translations[language];

  const menuItems = [
    { mode: AppMode.DASHBOARD, label: t.menu_dashboard, icon: LayoutDashboard },
    { mode: AppMode.ORDERS, label: t.menu_orders, icon: ClipboardList },
    { mode: AppMode.STOCK, label: t.menu_stock, icon: Package },
    { mode: AppMode.REPORTS, label: t.menu_reports, icon: BarChart2 },
    { mode: AppMode.PROMOTIONS, label: t.menu_promotions, icon: Tag },
    { mode: AppMode.AI, label: t.menu_ai, icon: Bot },
    { mode: AppMode.SETTINGS, label: t.menu_settings, icon: Settings },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[100] md:hidden no-print"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed md:relative z-[110] no-print
        w-72 h-full bg-slate-900 text-white flex flex-col
        transition-transform duration-300 ease-in-out shadow-2xl
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-8 border-b border-slate-800/50 flex justify-between items-center bg-gradient-to-br from-slate-900 to-black">
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-sky-500 uppercase">Coffee Please</h1>
            <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-1">System V2.0 PRO</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-white hover:bg-white/10 p-2 rounded-xl">
            <X size={24} />
          </button>
        </div>

        {/* Language Switcher */}
        <div className="px-6 py-5 bg-slate-800/30 border-b border-slate-800 flex gap-2 justify-center">
            {['lo', 'th', 'en'].map((l) => (
              <button 
                key={l}
                onClick={() => setLanguage(l as Language)} 
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${language === l ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/40' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
              >
                {l === 'lo' ? 'ລາວ' : l === 'th' ? 'ไทย' : 'ENG'}
              </button>
            ))}
        </div>

        <nav className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.mode}
              onClick={() => {
                onModeChange(item.mode);
                setIsOpen(false);
              }}
              className={`
                w-full flex items-center p-4 rounded-2xl transition-all duration-300 group
                ${currentMode === item.mode 
                  ? 'bg-sky-600 text-white shadow-xl shadow-sky-900/20' 
                  : 'hover:bg-slate-800/50 text-slate-500 hover:text-slate-200'}
              `}
            >
              <item.icon className={`mr-4 transition-transform duration-300 ${currentMode === item.mode ? 'scale-110' : 'group-hover:scale-110 opacity-50'}`} size={20} />
              <span className="font-bold text-sm tracking-tight">{item.label}</span>
              {currentMode === item.mode && <ChevronRight className="ml-auto opacity-40" size={16} />}
            </button>
          ))}
        </nav>

        <div className="p-8 border-t border-slate-800/50 bg-black/20">
          <button 
            className="w-full py-4 px-6 rounded-2xl bg-slate-800 text-slate-500 hover:bg-rose-900/40 hover:text-rose-400 transition-all text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3"
          >
            <LogOut size={16} />
            {t.menu_logout}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
