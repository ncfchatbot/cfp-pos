
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Minus, Trash2, Edit, LayoutDashboard, Settings, 
  Package, ClipboardList, BarChart3, Tag, X, Search,
  Download, Upload, ShoppingCart, Calendar, Coffee, 
  TrendingUp, Users, PieChart, CheckCircle2, Printer, Save
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AppMode, Product, CartItem, SaleRecord, StoreProfile, Language, Promotion, PromoTier } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import { db, collection, doc, setDoc, onSnapshot, query, orderBy } from './services/firebase';

const formatCurrency = (amount: number, lang: Language) => {
  try {
    return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : (lang === 'en' ? 'en-US' : 'lo-LA'), { 
      style: 'currency', 
      currency: 'LAK', 
      maximumFractionDigits: 0 
    }).format(amount);
  } catch (e) {
    return amount.toLocaleString() + " LAK";
  }
};

const INITIAL_PROFILE: StoreProfile = {
  name: "Coffee Please",
  address: "Vientiane, Laos",
  phone: "020-5555-9999",
  logoUrl: null
};

const COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-purple-500', 'bg-indigo-500'];

const App: React.FC = () => {
  // State Management
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');
  const [isCloudActive] = useState<boolean>(() => localStorage.getItem('pos_force_local') !== 'true');

  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : INITIAL_PROFILE;
  });

  // Reporting State
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const [reportDateRange, setReportDateRange] = useState({ start: currentMonthStart, end: currentMonthEnd });

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  
  // Transaction State
  const [billItems, setBillItems] = useState<CartItem[]>([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [skuSearch, setSkuSearch] = useState('');
  const [customerName, setCustomerName] = useState('');

  const t = translations[language];

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('pos_language', language);
    localStorage.setItem('pos_profile', JSON.stringify(storeProfile));
    if (!isCloudActive) {
      localStorage.setItem('pos_products', JSON.stringify(products));
      localStorage.setItem('pos_sales', JSON.stringify(recentSales));
      localStorage.setItem('pos_promos', JSON.stringify(promotions));
    }
  }, [language, storeProfile, products, recentSales, promotions, isCloudActive]);

  // Data Sync (Firebase or Local)
  useEffect(() => {
    let unsubscribes: (() => void)[] = [];
    if (isCloudActive && db) {
      unsubscribes.push(onSnapshot(collection(db, 'products'), (s) => setProducts(s.docs.map(d => ({ ...d.data(), id: d.id } as Product)))));
      unsubscribes.push(onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), (s) => setRecentSales(s.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord)))));
      unsubscribes.push(onSnapshot(collection(db, 'promotions'), (s) => setPromotions(s.docs.map(d => ({ ...d.data(), id: d.id } as Promotion)))));
    } else {
      setProducts(JSON.parse(localStorage.getItem('pos_products') || '[]'));
      setRecentSales(JSON.parse(localStorage.getItem('pos_sales') || '[]'));
      setPromotions(JSON.parse(localStorage.getItem('pos_promos') || '[]'));
    }
    return () => unsubscribes.forEach(u => u());
  }, [isCloudActive]);

  // Calculations for Reports & Dashboard
  const metrics = useMemo(() => {
    const start = new Date(reportDateRange.start).getTime();
    const end = new Date(reportDateRange.end).getTime() + 86400000;
    const filteredSales = recentSales.filter(s => s.timestamp >= start && s.timestamp <= end);
    
    const productStats: Record<string, { name: string, qty: number, revenue: number }> = {};
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        if (!productStats[item.id]) productStats[item.id] = { name: item.name, qty: 0, revenue: 0 };
        productStats[item.id].qty += item.quantity;
        productStats[item.id].revenue += (item.quantity * item.price);
      });
    });

    const totalSales = filteredSales.reduce((acc, s) => acc + s.total, 0);
    const totalCost = filteredSales.reduce((acc, s) => acc + s.items.reduce((c, i) => c + (i.cost * i.quantity), 0), 0);

    return {
      sales: totalSales,
      profit: totalSales - totalCost,
      count: filteredSales.length,
      topProducts: Object.values(productStats).sort((a, b) => b.qty - a.qty).slice(0, 10),
      stockValue: products.reduce((acc, p) => acc + (p.cost * p.stock), 0),
      lowStock: products.filter(p => p.stock <= 5)
    };
  }, [recentSales, products, reportDateRange]);

  // Bulk Tools
  const handleDownloadTemplate = () => {
    const headers = ["รหัสสินค้า(SKU)", "ชื่อสินค้า", "ต้นทุน", "ราคาขาย", "สต็อก"];
    const example = ["COF-001", "Espresso Hot", "10000", "20000", "100"];
    const csvContent = "\uFEFF" + [headers, example].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "CoffeePlease_Template.csv";
    link.click();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = text.split("\n").filter(r => r.trim() !== "");
      const newProducts: Product[] = rows.slice(1).map(row => {
        const cols = row.split(",");
        if (cols.length < 5) return null;
        return {
          id: uuidv4(),
          code: cols[0].trim(),
          name: cols[1].trim(),
          cost: Number(cols[2]) || 0,
          price: Number(cols[3]) || 0,
          stock: Number(cols[4]) || 0,
          category: "General",
          color: COLORS[Math.floor(Math.random() * COLORS.length)] + " text-white"
        };
      }).filter(p => p !== null) as Product[];
      
      setProducts(prev => [...prev, ...newProducts]);
      alert(`นำเข้าสำเร็จ ${newProducts.length} รายการ`);
    };
    reader.readAsText(file);
  };

  const saveOrder = async () => {
    const total = billItems.reduce((s, i) => s + (i.price * i.quantity), 0) - billDiscount;
    const order = { 
      id: uuidv4(), 
      items: [...billItems], 
      subtotal: total + billDiscount, 
      discount: billDiscount, 
      total, 
      date: new Date().toLocaleString(), 
      timestamp: Date.now(), 
      status: 'Paid',
      customerName
    };

    // Update Stocks locally first for immediate UI update
    setProducts(prev => prev.map(p => {
      const cartItem = billItems.find(it => it.id === p.id);
      return cartItem ? { ...p, stock: Math.max(0, p.stock - cartItem.quantity) } : p;
    }));

    setRecentSales(prev => [order, ...prev]);
    
    if (isCloudActive && db) {
      try { await setDoc(doc(db, 'sales', order.id), order); } catch(e) {}
    }

    setIsBillModalOpen(false);
    setBillItems([]);
    setBillDiscount(0);
    setCustomerName('');
  };

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={() => {}} language={language} setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          
          {/* DASHBOARD */}
          {mode === AppMode.DASHBOARD && (
            <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
              {/* Header Card */}
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col items-center text-center relative overflow-hidden group">
                <div className="absolute -top-10 -right-10 p-4 opacity-[0.03] group-hover:scale-110 transition-transform duration-700"><Coffee size={300} /></div>
                <div className="w-24 h-24 bg-sky-500 rounded-[2rem] flex items-center justify-center text-white shadow-xl shadow-sky-200 mb-6">
                  <Coffee size={48} />
                </div>
                <h2 className="text-5xl font-black text-slate-800 tracking-tight">Coffee Please</h2>
                <div className="mt-4 px-6 py-2 bg-slate-100 rounded-full text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                  {t.dash_title} • {now.toLocaleDateString(language, { month: 'long', year: 'numeric' })}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: t.dash_sales, val: metrics.sales, color: 'sky', icon: TrendingUp },
                  { label: t.report_profit, val: metrics.profit, color: 'emerald', icon: CheckCircle2 },
                  { label: t.dash_pending, val: metrics.count, unit: 'Bills', color: 'rose', icon: ClipboardList },
                  { label: t.dash_stock_cost, val: metrics.stockValue, color: 'amber', icon: Package },
                ].map((item, i) => (
                  <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 border-b-[12px] border-b-slate-100 flex flex-col justify-between h-56 hover:border-b-sky-500 transition-all duration-300">
                    <div className="flex justify-between items-start">
                      <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">{item.label}</p>
                      <div className={`p-3 rounded-2xl bg-${item.color}-50 text-${item.color}-500`}><item.icon size={20} /></div>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                      {item.unit ? `${item.val} ${item.unit}` : formatCurrency(item.val, language)}
                    </h3>
                  </div>
                ))}
              </div>

              {/* Alerts Area */}
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200">
                 <h4 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4 border-b pb-6">
                   <div className="p-3 bg-rose-100 text-rose-500 rounded-2xl"><Package size={24} /></div>
                   {t.dash_low_stock}
                 </h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {metrics.lowStock.map(p => (
                       <div key={p.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:shadow-xl transition-all">
                          <div>
                            <div className="font-bold text-slate-800 text-xl leading-tight">{p.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">SKU: {p.code}</div>
                          </div>
                          <div className="bg-rose-500 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shadow-rose-100">{p.stock}</div>
                       </div>
                    ))}
                    {metrics.lowStock.length === 0 && (
                      <div className="col-span-full py-16 text-center text-slate-300 font-bold uppercase tracking-widest text-lg">
                        คลังสินค้าอยู่ในเกณฑ์ดีเยี่ยม
                      </div>
                    )}
                 </div>
              </div>
            </div>
          )}

          {/* REPORTS */}
          {mode === AppMode.REPORTS && (
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                 <h2 className="text-4xl font-black text-slate-800 flex items-center gap-5">
                   <div className="p-4 bg-sky-100 text-sky-600 rounded-3xl"><BarChart3 size={32} /></div>
                   {t.menu_reports}
                 </h2>
                 <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-200">
                    <Calendar size={20} className="text-slate-400" />
                    <input type="date" value={reportDateRange.start} onChange={e=>setReportDateRange(p=>({...p, start: e.target.value}))} className="bg-transparent font-bold outline-none" />
                    <span className="text-slate-300 font-black">→</span>
                    <input type="date" value={reportDateRange.end} onChange={e=>setReportDateRange(p=>({...p, end: e.target.value}))} className="bg-transparent font-bold outline-none" />
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-sky-600 text-white p-10 rounded-[2.5rem] shadow-xl flex flex-col justify-between h-56">
                  <p className="font-bold uppercase tracking-widest text-xs opacity-70">รายได้จากการขาย</p>
                  <h3 className="text-5xl font-black tracking-tighter">{formatCurrency(metrics.sales, language)}</h3>
                </div>
                <div className="bg-emerald-600 text-white p-10 rounded-[2.5rem] shadow-xl flex flex-col justify-between h-56">
                  <p className="font-bold uppercase tracking-widest text-xs opacity-70">กำไรสุทธิ</p>
                  <h3 className="text-5xl font-black tracking-tighter">{formatCurrency(metrics.profit, language)}</h3>
                </div>
                <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col justify-between h-56">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">จำนวนออเดอร์</p>
                  <h3 className="text-5xl font-black text-slate-800 tracking-tighter">{metrics.count} <span className="text-xl">รายการ</span></h3>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                 <div className="p-10 border-b flex items-center justify-between">
                    <h4 className="font-black text-slate-800 uppercase tracking-widest text-lg flex items-center gap-4">
                      <TrendingUp size={24} className="text-sky-500" /> 10 อันดับสินค้าขายดีที่สุด
                    </h4>
                 </div>
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                       <tr>
                         <th className="px-10 py-6">ชื่อสินค้า</th>
                         <th className="px-10 py-6 text-center">จำนวนที่ขาย</th>
                         <th className="px-10 py-6 text-right">รายรับรวม</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold">
                       {metrics.topProducts.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-10 py-6 text-slate-700 text-lg">{p.name}</td>
                             <td className="px-10 py-6 text-center text-slate-400">{p.qty.toLocaleString()} <span className="text-xs uppercase ml-1">Units</span></td>
                             <td className="px-10 py-6 text-right text-sky-600 text-xl">{formatCurrency(p.revenue, language)}</td>
                          </tr>
                       ))}
                       {metrics.topProducts.length === 0 && (
                         <tr><td colSpan={3} className="py-32 text-center text-slate-200 uppercase font-black tracking-widest text-xl">ไม่มีข้อมูลในช่วงเวลาที่เลือก</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* ORDERS LIST */}
          {mode === AppMode.ORDERS && (
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
              <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                <h2 className="text-4xl font-black text-slate-800 flex items-center gap-5">
                   <div className="p-4 bg-sky-100 text-sky-600 rounded-3xl"><ClipboardList size={32} /></div>
                   {t.menu_orders}
                </h2>
                <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-10 py-5 rounded-3xl font-black text-xl shadow-2xl shadow-sky-100 hover:bg-sky-700 transition-all flex items-center gap-4 group active:scale-95">
                  <Plus size={24} className="group-hover:rotate-90 transition-transform" /> {t.order_create_bill}
                </button>
              </div>

              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                       <tr><th className="px-10 py-6">Order ID / Time</th><th className="px-10 py-6">Customer</th><th className="px-10 py-6 text-right">Amount</th><th className="px-10 py-6 text-center">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {recentSales.map(s => (
                         <tr key={s.id} className="hover:bg-slate-50/50 transition-all">
                            <td className="px-10 py-8 font-mono text-[10px] text-slate-400">#{s.id.substr(0,8)}<div className="mt-2 text-slate-700 font-bold text-lg">{s.date}</div></td>
                            <td className="px-10 py-8 font-bold text-slate-800 text-lg">{s.customerName || 'Walk-in Customer'}</td>
                            <td className="px-10 py-8 text-right font-black text-2xl text-sky-600">{formatCurrency(s.total, language)}</td>
                            <td className="px-10 py-8 text-center">
                               <span className={`px-6 py-2 rounded-2xl text-xs font-black uppercase tracking-widest ${s.status === 'Paid' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>{s.status === 'Paid' ? t.pay_paid : t.pay_pending}</span>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* STOCK MANAGEMENT */}
          {mode === AppMode.STOCK && (
             <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
                <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                   <h2 className="text-4xl font-black text-slate-800 flex items-center gap-5">
                      <div className="p-4 bg-sky-100 text-sky-600 rounded-3xl"><Package size={32} /></div>
                      {t.stock_title}
                   </h2>
                   <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-slate-900 text-white px-10 py-5 rounded-3xl font-black text-xl shadow-2xl hover:bg-black transition-all flex items-center gap-4 active:scale-95">
                      <Plus size={24} /> {t.stock_add}
                   </button>
                </div>
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                   <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                         <tr><th className="px-10 py-6">Product Details</th><th className="px-10 py-6 text-right">Cost</th><th className="px-10 py-6 text-right">Retail Price</th><th className="px-10 py-6 text-center">Inventory</th><th className="px-10 py-6 text-center">Actions</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-10 py-8 flex items-center gap-8">
                               <div className={`w-16 h-16 rounded-[1.5rem] ${p.color || 'bg-slate-200'} flex items-center justify-center font-black text-2xl text-white shadow-lg`}>{p.name.charAt(0)}</div>
                               <div><div className="font-bold text-slate-800 text-xl leading-tight">{p.name}</div><div className="text-[10px] font-mono text-slate-400 uppercase tracking-[0.3em] mt-2">CODE: {p.code}</div></div>
                            </td>
                            <td className="px-10 py-8 text-right text-slate-400 font-bold text-lg">{formatCurrency(p.cost, language)}</td>
                            <td className="px-10 py-8 text-right text-sky-600 font-black text-2xl">{formatCurrency(p.price, language)}</td>
                            <td className="px-10 py-8 text-center"><span className={`px-6 py-2 rounded-2xl text-xs font-black uppercase ${p.stock <= 5 ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-emerald-500 text-white shadow-emerald-200'} shadow-lg`}>{p.stock} Unit</span></td>
                            <td className="px-10 py-8 text-center">
                              <button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-4 bg-slate-100 rounded-2xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-all"><Edit size={24}/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {/* SETTINGS AREA */}
          {mode === AppMode.SETTINGS && (
            <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in">
               <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 flex items-center gap-8">
                  <div className="p-5 bg-sky-100 text-sky-600 rounded-3xl shadow-inner"><Settings size={40} /></div>
                  <h2 className="text-4xl font-black text-slate-800 uppercase tracking-tighter">{t.menu_settings}</h2>
               </div>
               
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 space-y-10">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] border-b pb-6 flex items-center gap-3"><Users size={18} /> Store Profile Information</h4>
                     <div className="space-y-8">
                        <div className="space-y-2"><label className="text-[11px] font-black text-slate-400 uppercase ml-4">Shop Branding Name</label><input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] font-bold text-xl outline-none focus:border-sky-500 focus:ring-4 ring-sky-50 transition-all" /></div>
                        <div className="space-y-2"><label className="text-[11px] font-black text-slate-400 uppercase ml-4">Full Business Address</label><textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] font-medium text-lg outline-none h-40 focus:border-sky-500 focus:ring-4 ring-sky-50 transition-all resize-none" /></div>
                        <button onClick={() => alert("Settings Saved!")} className="w-full py-6 bg-sky-600 text-white rounded-[1.5rem] font-black shadow-2xl shadow-sky-100 uppercase text-xs tracking-[0.3em] flex items-center justify-center gap-4 active:scale-95 transition-all"><Save size={20}/> {t.save}</button>
                     </div>
                  </div>
                  <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 space-y-10">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] border-b pb-6 flex items-center gap-3"><PieChart size={18} /> Data Management Tools</h4>
                     <div className="space-y-8">
                        <p className="text-lg font-medium text-slate-500 leading-relaxed">ใช้ระบบนำเข้าเพื่อเพิ่มสินค้าจำนวนมากจากตาราง Excel หรือ CSV ของคุณได้ทันที</p>
                        <button onClick={handleDownloadTemplate} className="w-full py-6 bg-slate-900 text-white rounded-[1.5rem] font-black flex items-center justify-center gap-5 hover:bg-black transition-all shadow-xl active:scale-95">
                           <Download size={24}/> {t.setting_download_temp}
                        </button>
                        <label className="w-full py-6 bg-emerald-600 text-white rounded-[1.5rem] font-black flex items-center justify-center gap-5 hover:bg-emerald-700 transition-all cursor-pointer shadow-xl active:scale-95">
                           <Upload size={24}/> {t.setting_upload}
                           <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
                        </label>
                        <div className="pt-6 border-t border-slate-100">
                           <p className="text-[10px] text-slate-300 font-bold uppercase text-center">V2.5 Stable Production Build</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* BILL MODAL - TOUCH OPTIMIZED 40/60 */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[200] flex items-center justify-center p-4 md:p-10 backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-white w-full max-w-7xl h-full rounded-[3.5rem] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/20">
             
             {/* Left Column (Cart & Totals) */}
             <div className="w-full md:w-[42%] bg-slate-50/50 border-r border-slate-200 flex flex-col h-full overflow-hidden">
                <div className="p-10 border-b bg-white">
                   <div className="flex justify-between items-center mb-10">
                      <h3 className="text-3xl font-black text-slate-800 flex items-center gap-4">
                        <div className="p-3 bg-sky-500 text-white rounded-2xl shadow-lg shadow-sky-100"><ShoppingCart size={28} /></div>
                        Cart Summary
                      </h3>
                      <button onClick={()=>setIsBillModalOpen(false)} className="p-4 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={28}/></button>
                   </div>
                   <div className="space-y-6">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Customer Details</label>
                        <input value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl font-bold text-xl outline-none focus:ring-4 ring-sky-50 transition-all" placeholder={t.order_cust_name} />
                      </div>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                   {billItems.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-6 p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm animate-in slide-in-from-left-10">
                         <div className={`w-16 h-16 rounded-2xl ${it.color || 'bg-slate-200'} flex items-center justify-center font-black text-2xl text-white shadow-md`}>{it.name.charAt(0)}</div>
                         <div className="flex-1 min-w-0">
                            <div className="text-xl font-black text-slate-800 truncate">{it.name}</div>
                            <div className="text-sm font-bold text-sky-600 mt-1">{formatCurrency(it.price, language)}</div>
                         </div>
                         <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                            <button onClick={()=>setBillItems(p=>p.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))} className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm hover:text-sky-600 transition-all"><Minus size={20}/></button>
                            <input type="number" className="w-14 bg-transparent text-center font-black text-2xl outline-none" value={it.quantity} onChange={(e) => {
                                const v = parseInt(e.target.value) || 1;
                                setBillItems(prev => prev.map((i, ix) => ix === idx ? { ...i, quantity: Math.max(1, v) } : i));
                              }}
                            />
                            <button onClick={()=>setBillItems(p=>p.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))} className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm hover:text-sky-600 transition-all"><Plus size={20}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter((_, i)=>i!==idx))} className="p-3 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={24}/></button>
                      </div>
                   ))}
                   {billItems.length === 0 && (
                     <div className="h-full flex flex-col items-center justify-center opacity-10 py-32">
                       <ShoppingCart size={160} strokeWidth={0.5}/>
                       <p className="font-black uppercase tracking-[0.5em] mt-10">No items in cart</p>
                     </div>
                   )}
                </div>

                <div className="p-10 border-t bg-white space-y-8">
                   <div className="flex justify-between items-center px-6 font-black text-slate-400 uppercase text-[10px] tracking-[0.3em]">
                      <span>SUBTOTAL</span>
                      <span className="text-3xl font-black text-slate-800 tracking-tighter">{formatCurrency(billItems.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span>
                   </div>
                   <div className="flex justify-between items-center px-8 py-6 bg-rose-50 rounded-[2rem] border border-rose-100 shadow-inner">
                      <span className="text-xs font-black text-rose-500 uppercase tracking-widest flex items-center gap-2"><Tag size={18}/> DISCOUNT</span>
                      <input type="number" className="w-40 bg-white border-2 border-rose-200 rounded-2xl px-6 py-3 text-right font-black text-3xl text-rose-600 outline-none focus:border-rose-500 transition-all" value={billDiscount} onChange={e=>setBillDiscount(Number(e.target.value))} />
                   </div>
                   <div className="pt-4 flex justify-between items-end px-6">
                      <span className="font-black text-slate-800 text-2xl uppercase tracking-[0.2em] mb-4">TOTAL</span>
                      <div className="text-right">
                         <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-2 text-right">PAYABLE AMOUNT</span>
                         <span className="text-8xl font-black text-sky-600 tracking-tighter drop-shadow-xl">{formatCurrency(Math.max(0, billItems.reduce((s,i)=>s+(i.price*i.quantity),0) - billDiscount), language).split(" ")[0]}</span>
                      </div>
                   </div>
                   <button onClick={saveOrder} disabled={billItems.length === 0} className="w-full py-8 bg-sky-600 text-white rounded-[2.5rem] font-black text-3xl shadow-2xl shadow-sky-200 hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-10 uppercase tracking-[0.3em]">Complete Payment</button>
                </div>
             </div>

             {/* Right Column (Catalog) */}
             <div className="flex-1 p-10 flex flex-col relative bg-white overflow-hidden h-full">
                <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                   <div>
                      <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Inventory Browser</h4>
                      <p className="text-slate-400 font-bold text-sm">Tap on products to add to current order</p>
                   </div>
                   <div className="flex items-center gap-6 bg-slate-50 p-5 rounded-[2rem] border border-slate-200 shadow-inner w-full max-w-lg focus-within:border-sky-500 focus-within:ring-4 ring-sky-50 transition-all">
                      <Search className="text-slate-400" size={28} />
                      <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="bg-transparent outline-none flex-1 font-bold text-2xl" />
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pr-4 custom-scrollbar">
                   {products.filter(p => !skuSearch || p.code.toLowerCase().includes(skuSearch.toLowerCase()) || p.name.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => setBillItems(prev => {
                        const exist = prev.find(i => i.id === p.id);
                        return exist ? prev.map(i => i.id === p.id ? {...i, quantity: i.quantity + 1} : i) : [...prev, {...p, quantity: 1}];
                      })} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:border-sky-500 hover:shadow-2xl hover:-translate-y-2 transition-all flex flex-col group text-left h-full active:scale-95">
                        <div className={`w-full aspect-square rounded-[2rem] ${p.color || 'bg-slate-200'} mb-6 flex items-center justify-center text-7xl font-black text-white shadow-lg group-hover:rotate-3 transition-all duration-500`}>
                           {p.name.charAt(0)}
                        </div>
                        <h4 className="font-black text-slate-800 text-xl leading-tight mb-2 truncate">{p.name}</h4>
                        <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-6">CODE: {p.code}</div>
                        <div className="mt-auto pt-6 border-t border-slate-50 flex justify-between items-center">
                            <span className="text-sky-600 font-black text-3xl tracking-tighter">{formatCurrency(p.price, language).split(" ")[0]}</span>
                            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-100 text-emerald-600'}`}>{p.stock}</span>
                        </div>
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* PRODUCT ADD/EDIT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 z-[300] flex items-center justify-center p-6 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white rounded-[3.5rem] w-full max-w-2xl p-12 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-4xl font-black mb-12 text-slate-800 flex items-center gap-6 border-b pb-10">
              <div className="p-4 bg-sky-500 text-white rounded-3xl shadow-xl shadow-sky-100"><Package size={32} /></div> 
              {editingProduct ? 'Edit Inventory Product' : 'Register New Product'}
            </h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const p = { 
                id: editingProduct?.id || uuidv4(), 
                name: fd.get('name') as string, 
                code: fd.get('code') as string, 
                category: "General", 
                cost: parseFloat(fd.get('cost') as string) || 0, 
                price: parseFloat(fd.get('price') as string) || 0, 
                stock: parseInt(fd.get('stock') as string) || 0, 
                color: editingProduct?.color || COLORS[Math.floor(Math.random()*COLORS.length)] + " text-white"
              };
              setProducts(prev => [...prev.filter(x => x.id !== p.id), p]); 
              if (isCloudActive && db) setDoc(doc(db, 'products', p.id), p);
              setIsProductModalOpen(false);
            }} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2 col-span-full"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Product Display Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[1.5rem] font-bold text-2xl outline-none focus:border-sky-500 transition-all" /></div>
                <div className="space-y-2 col-span-full"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Unique Identifier (SKU / รหัสสินค้า)</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[1.5rem] font-bold text-2xl outline-none focus:border-sky-500 transition-all" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Cost Price (ต้นทุน)</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[1.5rem] font-bold text-2xl outline-none" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Selling Price (ราคาขาย)</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-6 bg-sky-50 border-2 border-sky-100 rounded-[1.5rem] font-black text-sky-600 text-3xl outline-none" /></div>
                <div className="space-y-2 col-span-full"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Current Stock Inventory (สต็อกเริ่มต้น)</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[1.5rem] font-bold text-2xl outline-none" /></div>
              </div>
              <div className="flex gap-6 pt-10">
                 <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-6 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black uppercase text-xs tracking-[0.4em] active:scale-95 transition-all">Cancel</button>
                 <button type="submit" className="flex-[2] py-6 bg-sky-600 text-white rounded-[1.5rem] font-black text-2xl shadow-2xl shadow-sky-100 uppercase tracking-[0.3em] active:scale-95 transition-all">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
