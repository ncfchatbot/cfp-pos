import React from 'react';
import { Store, Package, Bot, Menu, X, LogOut, Download, Upload, LayoutDashboard, Settings, ClipboardList, BarChart2, Tag } from 'lucide-react';
import { AppMode } from '../types';

interface SidebarProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onExport: () => void;
  onImport: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentMode, onModeChange, isOpen, setIsOpen, onExport, onImport }) => {
  const menuItems = [
    { mode: AppMode.DASHBOARD, label: 'ภาพรวม (Dashboard)', icon: LayoutDashboard, desc: 'สรุปยอดขาย' },
    { mode: AppMode.POS, label: 'หน้าขาย (POS)', icon: Store, desc: 'ขายหน้าร้าน' },
    { mode: AppMode.ORDERS, label: 'รายการขาย & ขนส่ง', icon: ClipboardList, desc: 'จัดการออเดอร์/ส่งของ' },
    { mode: AppMode.STOCK, label: 'คลังสินค้า (Stock)', icon: Package, desc: 'สินค้าคงเหลือ' },
    { mode: AppMode.REPORTS, label: 'รายงาน (Reports)', icon: BarChart2, desc: 'วิเคราะห์ยอดขาย/กำไร' },
    { mode: AppMode.PROMOTIONS, label: 'โปรโมชั่น', icon: Tag, desc: 'ตั้งค่าส่วนลด/ของแถม' },
    { mode: AppMode.AI, label: 'ผู้ช่วย AI', icon: Bot, desc: 'ปรึกษาธุรกิจ' },
    { mode: AppMode.SETTINGS, label: 'ตั้งค่าร้านค้า', icon: Settings, desc: 'ข้อมูลร้าน/โลโก้' },
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
            <p className="text-xs text-white/70">ระบบจัดการร้านค้า</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-white hover:bg-white/20 p-1 rounded">
            <X size={20} />
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
                <span className="block text-[10px] opacity-70">{item.desc}</span>
              </div>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
           <div className="grid grid-cols-2 gap-2 mb-2">
             <button 
                onClick={onExport}
                className="flex flex-col items-center justify-center p-2 bg-slate-800 rounded hover:bg-slate-700 text-xs text-slate-400 hover:text-white transition-colors"
                title="Save Full Backup"
             >
                <Download size={16} className="mb-1"/>
                <span>สำรองระบบ</span>
             </button>
             <button 
                onClick={onImport}
                className="flex flex-col items-center justify-center p-2 bg-slate-800 rounded hover:bg-slate-700 text-xs text-slate-400 hover:text-white transition-colors"
                title="Restore Full Backup"
             >
                <Upload size={16} className="mb-1"/>
                <span>กู้คืนระบบ</span>
             </button>
           </div>
          <button 
            className="w-full py-2 px-4 rounded-lg bg-slate-800 text-slate-400 hover:bg-red-900/50 hover:text-red-400 transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <LogOut size={16} />
            ออกจากระบบ
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;