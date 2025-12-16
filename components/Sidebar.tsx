import React from 'react';
import { Store, Package, Bot, Menu, X, LogOut, Download, Upload, LayoutDashboard, Settings, ClipboardList, BarChart2, Tag, Globe } from 'lucide-react';
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
    { mode: AppMode.POS, label: t.menu_pos, icon: Store },
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
          className="fixed inset-0 bg-black/50 z-20 md:hidden no-print"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed md:relative z-30 no-print
        w-64 h-full bg-slate-900 text-white flex flex-col
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-gradient-to-r from-sky-600 to-sky-900">
          <div>
            <h1 className="text-xl font-bold">Sabaidee POS</h1>
            <p className="text-xs text-white/70">System V1.2</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-white hover:bg-white/20 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Language Switcher */}
        <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-800 flex gap-2 justify-center">
            <button 
              onClick={() => setLanguage('lo')} 
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${language === 'lo' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
            >
              ລາວ
            </button>
            <button 
              onClick={() => setLanguage('th')} 
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${language === 'th' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
            >
              ไทย
            </button>
            <button 
              onClick={() => setLanguage('en')} 
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${language === 'en' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
            >
              ENG
            </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.mode}
              onClick={() => {
                onModeChange(item.mode);
                setIsOpen(false);
              }}
              className={`
                w-full flex items-center p-3 rounded-lg transition-all duration-200
                ${currentMode === item.mode 
                  ? 'bg-sky-600 text-white shadow-lg' 
                  : 'hover:bg-slate-800 text-slate-400 hover:text-white'}
              `}
            >
              <item.icon className="mr-3 flex-shrink-0" size={20} />
              <div className="text-left">
                <span className="block font-medium">{item.label}</span>
              </div>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
           <div className="grid grid-cols-2 gap-2 mb-2">
             <button 
                onClick={onExport}
                className="flex flex-col items-center justify-center p-2 bg-slate-800 rounded hover:bg-slate-700 text-xs text-slate-400 hover:text-white transition-colors"
                title={t.setting_backup}
             >
                <Download size={16} className="mb-1"/>
                <span>{language === 'en' ? 'Backup' : 'Backup'}</span>
             </button>
             <button 
                onClick={onImport}
                className="flex flex-col items-center justify-center p-2 bg-slate-800 rounded hover:bg-slate-700 text-xs text-slate-400 hover:text-white transition-colors"
                title={t.setting_restore}
             >
                <Upload size={16} className="mb-1"/>
                <span>{language === 'en' ? 'Restore' : 'Restore'}</span>
             </button>
           </div>
          <button 
            className="w-full py-2 px-4 rounded-lg bg-slate-800 text-slate-400 hover:bg-red-900/50 hover:text-red-400 transition-colors text-sm font-medium flex items-center justify-center gap-2"
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