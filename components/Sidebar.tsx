
import React from 'react';
import { Package, X, LogOut, LayoutDashboard, Settings, ClipboardList, BarChart2, Tag, ChevronRight, Coffee, Bot } from 'lucide-react';
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

const Sidebar: React.FC<SidebarProps> = ({ currentMode, onModeChange, isOpen, setIsOpen, language, setLanguage }) => {
  const t = translations[language];

  const menuItems = [
    { mode: AppMode.DASHBOARD, label: t.menu_dashboard, icon: LayoutDashboard },
    { mode: AppMode.ORDERS, label: t.menu_orders, icon: ClipboardList },
    { mode: AppMode.STOCK, label: t.menu_stock, icon: Package },
    { mode: AppMode.PROMOTIONS, label: t.menu_promotions, icon: Tag },
    { mode: AppMode.REPORTS, label: t.menu_reports, icon: BarChart2 },
    { mode: AppMode.AI, label: t.menu_ai, icon: Bot },
    { mode: AppMode.SETTINGS, label: t.menu_settings, icon: Settings },
  ];

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[100] md:hidden no-print backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed md:relative z-[110] no-print
        w-80 h-full bg-[#0c162d] text-white flex flex-col
        transition-transform duration-300 ease-in-out shadow-2xl
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-10 border-b border-slate-800 flex justify-between items-center bg-[#081021]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-sky-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Coffee size={28} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white">Coffee Please</h1>
              <p className="text-[10px] font-bold text-slate-500 tracking-[0.3em] uppercase">POS SYSTEM</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-white p-2">
            <X size={28} />
          </button>
        </div>

        <div className="px-8 py-8 flex gap-2">
            {['lo', 'th', 'en'].map((l) => (
              <button 
                key={l}
                onClick={() => setLanguage(l as Language)} 
                className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase transition-all duration-300 ${language === l ? 'bg-sky-600 text-white shadow-xl' : 'bg-slate-800/50 text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
              >
                {l === 'lo' ? 'ລາວ' : l === 'th' ? 'ไทย' : 'EN'}
              </button>
            ))}
        </div>

        <nav className="flex-1 overflow-y-auto p-6 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.mode}
              onClick={() => {
                onModeChange(item.mode);
                setIsOpen(false);
              }}
              className={`
                w-full flex items-center p-5 rounded-[1.5rem] transition-all duration-200
                ${currentMode === item.mode 
                  ? 'bg-sky-600 text-white shadow-2xl translate-x-1' 
                  : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-200'}
              `}
            >
              <item.icon className="mr-5" size={22} />
              <span className="font-bold text-base tracking-tight">{item.label}</span>
              {currentMode === item.mode && <ChevronRight className="ml-auto opacity-50" size={18} />}
            </button>
          ))}
        </nav>

        <div className="p-8 border-t border-slate-800 bg-[#081021]/30">
          <button 
            className="w-full py-5 px-6 rounded-2xl bg-slate-800/30 text-slate-600 hover:bg-rose-600 hover:text-white transition-all text-[10px] font-black uppercase tracking-[0.4em] flex items-center justify-center gap-4"
          >
            <LogOut size={18} />
            {t.menu_logout}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
