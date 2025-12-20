
import React from 'react';
import { Package, X, LogOut, LayoutDashboard, Settings, ClipboardList, BarChart2, Tag, ChevronRight, Coffee } from 'lucide-react';
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
        <div className="p-8 md:p-10 border-b border-slate-800 flex justify-between items-center bg-[#081021]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-sky-500 rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Coffee size={24} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black tracking-tight text-white">Coffee Please</h1>
              <p className="text-[8px] md:text-[10px] font-bold text-slate-500 tracking-[0.3em] uppercase">POS SYSTEM</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-white p-2">
            <X size={24} />
          </button>
        </div>

        <div className="px-6 py-6 flex gap-2">
            {['lo', 'th', 'en'].map((l) => (
              <button 
                key={l}
                onClick={() => setLanguage(l as Language)} 
                className={`flex-1 py-2 md:py-3 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase transition-all duration-300 ${language === l ? 'bg-sky-600 text-white shadow-xl' : 'bg-slate-800/50 text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
              >
                {l === 'lo' ? 'ລາວ' : l === 'th' ? 'ไทย' : 'EN'}
              </button>
            ))}
        </div>

        <nav className="flex-1 overflow-y-auto p-4 md:p-6 space-y-1 md:space-y-2 custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.mode}
              onClick={() => {
                onModeChange(item.mode);
                setIsOpen(false);
              }}
              className={`
                w-full flex items-center p-4 md:p-5 rounded-xl md:rounded-[1.5rem] transition-all duration-200
                ${currentMode === item.mode 
                  ? 'bg-sky-600 text-white shadow-2xl translate-x-1' 
                  : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-200'}
              `}
            >
              <item.icon className="mr-4 md:mr-5 flex-shrink-0" size={20} />
              <span className="font-bold text-sm md:text-base tracking-tight truncate">{item.label}</span>
              {currentMode === item.mode && <ChevronRight className="ml-auto opacity-50 flex-shrink-0" size={16} />}
            </button>
          ))}
        </nav>

        <div className="p-6 md:p-8 border-t border-slate-800 bg-[#081021]/30">
          <button 
            className="w-full py-4 md:py-5 px-4 md:px-6 rounded-xl md:rounded-2xl bg-slate-800/30 text-slate-600 hover:bg-rose-600 hover:text-white transition-all text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.4em] flex items-center justify-center gap-3 md:gap-4"
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
