
import React, { useState, useEffect, useMemo } from 'react';
// Added Calendar to the lucide-react imports to resolve the "Cannot find name 'Calendar'" error.
import { 
  Menu, ShoppingCart, Plus, Minus, Trash2, Edit, LayoutDashboard, Settings, 
  Package, ClipboardList, BarChart3, Tag, X, User, MapPin, Search,
  Download, Upload, CheckCircle2, Phone, Bot, Calendar
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
    return amount.toString();
  }
};

const INITIAL_PROFILE: StoreProfile = {
  name: "Coffee Please POS",
  address: "Vientiane, Laos",
  phone: "020-5555-9999",
  logoUrl: null
};

const COLORS = ['bg-sky-500 text-white', 'bg-emerald-500 text-white', 'bg-amber-500 text-white', 'bg-rose-500 text-white', 'bg-purple-500 text-white'];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');
  const [isCloudActive] = useState<boolean>(() => localStorage.getItem('pos_force_local') !== 'true');

  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>(() => JSON.parse(localStorage.getItem('pos_promos') || '[]'));
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : INITIAL_PROFILE;
  });

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const [reportDateRange, setReportDateRange] = useState({ start: currentMonthStart, end: currentMonthEnd });

  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  
  const [billItems, setBillItems] = useState<CartItem[]>([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [skuSearch, setSkuSearch] = useState('');

  const t = translations[language];

  useEffect(() => {
    localStorage.setItem('pos_language', language);
    localStorage.setItem('pos_promos', JSON.stringify(promotions));
  }, [language, promotions]);

  useEffect(() => {
    let unsubscribes: (() => void)[] = [];
    if (isCloudActive && db) {
      unsubscribes.push(onSnapshot(collection(db, 'products'), (s) => setProducts(s.docs.map(d => ({ ...d.data(), id: d.id } as Product)))));
      unsubscribes.push(onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), (s) => setRecentSales(s.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord)))));
      unsubscribes.push(onSnapshot(doc(db, 'settings', 'profile'), (d) => { if (d.exists()) setStoreProfile(d.data() as StoreProfile); }));
    } else {
      setProducts(JSON.parse(localStorage.getItem('pos_products') || '[]'));
      setRecentSales(JSON.parse(localStorage.getItem('pos_sales') || '[]'));
    }
    return () => unsubscribes.forEach(u => u());
  }, [isCloudActive]);

  const dashMetrics = useMemo(() => {
    const start = new Date(currentMonthStart).getTime();
    const end = new Date(currentMonthEnd).getTime() + 86400000;
    const sales = recentSales.filter(s => s.timestamp >= start && s.timestamp <= end);
    return {
      sales: sales.reduce((acc, s) => acc + s.total, 0),
      collected: sales.filter(s => s.status === 'Paid').reduce((acc, s) => acc + s.total, 0),
      pending: sales.filter(s => s.status === 'Pending').reduce((acc, s) => acc + s.total, 0),
      stockValue: products.reduce((acc, p) => acc + (p.cost * p.stock), 0),
      lowStock: products.filter(p => p.stock <= 5)
    };
  }, [recentSales, products, currentMonthStart, currentMonthEnd]);

  const saveOrder = async (order: any) => {
    const updated = [order, ...recentSales];
    setRecentSales(updated);
    if (!isCloudActive) localStorage.setItem('pos_sales', JSON.stringify(updated));
    if (isCloudActive && db) try { await setDoc(doc(db, 'sales', order.id), order); } catch(e){}
    setIsBillModalOpen(false);
    setBillItems([]);
    setBillDiscount(0);
  };

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''} text-lg`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={() => {}} language={language} setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          
          {/* DASHBOARD */}
          {mode === AppMode.DASHBOARD && (
            <div className="p-12 space-y-12 animate-in fade-in duration-500">
              <div className="flex justify-between items-center bg-white p-10 rounded-[3rem] border shadow-sm">
                <div>
                  <h2 className="text-5xl font-black text-slate-800 tracking-tighter">{t.dash_title}</h2>
                  <p className="text-sky-600 font-black mt-2 uppercase tracking-widest text-sm">{now.toLocaleString(language, { month: 'long', year: 'numeric' })}</p>
                </div>
                <LayoutDashboard size={64} className="text-sky-500 opacity-20" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                <div className="bg-white p-10 rounded-[3rem] border shadow-sm flex flex-col justify-between h-56 border-b-[12px] border-b-sky-500">
                  <p className="text-slate-400 font-black uppercase text-xs tracking-[0.2em]">{t.dash_sales}</p>
                  <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{formatCurrency(dashMetrics.sales, language)}</h3>
                </div>
                <div className="bg-white p-10 rounded-[3rem] border shadow-sm flex flex-col justify-between h-56 border-b-[12px] border-b-emerald-500">
                  <p className="text-slate-400 font-black uppercase text-xs tracking-[0.2em]">{t.dash_collected}</p>
                  <h3 className="text-4xl font-black text-emerald-600 tracking-tighter">{formatCurrency(dashMetrics.collected, language)}</h3>
                </div>
                <div className="bg-white p-10 rounded-[3rem] border shadow-sm flex flex-col justify-between h-56 border-b-[12px] border-b-rose-500">
                  <p className="text-slate-400 font-black uppercase text-xs tracking-[0.2em]">{t.dash_pending}</p>
                  <h3 className="text-4xl font-black text-rose-600 tracking-tighter">{formatCurrency(dashMetrics.pending, language)}</h3>
                </div>
                <div className="bg-white p-10 rounded-[3rem] border shadow-sm flex flex-col justify-between h-56 border-b-[12px] border-b-amber-500">
                  <p className="text-slate-400 font-black uppercase text-xs tracking-[0.2em]">{t.dash_stock_cost}</p>
                  <h3 className="text-4xl font-black text-amber-600 tracking-tighter">{formatCurrency(dashMetrics.stockValue, language)}</h3>
                </div>
              </div>

              <div className="bg-white p-12 rounded-[4rem] border shadow-sm">
                 <h4 className="text-3xl font-black text-rose-500 mb-10 flex items-center gap-6 uppercase tracking-tight"><Package size={40} /> {t.dash_low_stock}</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {dashMetrics.lowStock.map(p => (
                       <div key={p.id} className="p-8 bg-rose-50 rounded-[2.5rem] border-2 border-rose-100 flex justify-between items-center group hover:scale-[1.02] transition-transform">
                          <div><div className="font-black text-slate-800 text-2xl leading-tight">{p.name}</div><div className="text-xs font-bold text-slate-400 mt-1 uppercase">SKU: {p.code}</div></div>
                          <div className="bg-rose-500 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shadow-rose-200">{p.stock}</div>
                       </div>
                    ))}
                    {dashMetrics.lowStock.length === 0 && <div className="col-span-full py-20 text-center text-slate-200 font-black text-3xl uppercase tracking-widest">{t.pay_paid}</div>}
                 </div>
              </div>
            </div>
          )}

          {/* ORDERS */}
          {mode === AppMode.ORDERS && (
            <div className="p-12 animate-in slide-in-from-bottom-5 duration-500">
              <div className="flex justify-between items-center mb-12">
                <h2 className="text-5xl font-black text-slate-800 flex items-center gap-6"><ClipboardList size={56} className="text-sky-600" /> {t.menu_orders}</h2>
                <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-14 py-7 rounded-[3rem] font-black text-3xl shadow-2xl shadow-sky-200 hover:bg-sky-700 transition-all active:scale-95 flex items-center gap-6">
                  <Plus size={40} strokeWidth={4} /> {t.order_create_bill}
                </button>
              </div>
              <div className="bg-white rounded-[4rem] border shadow-sm overflow-hidden">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b text-xs font-black uppercase text-slate-400 tracking-[0.2em]">
                       <tr><th className="px-12 py-8">Bill ID / Time</th><th className="px-12 py-8">Customer Detail</th><th className="px-12 py-8 text-right">Total Net</th><th className="px-12 py-8 text-center">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {recentSales.map(s => (
                         <tr key={s.id} className="hover:bg-slate-50 transition-all">
                            <td className="px-12 py-12 font-mono text-[10px] text-slate-300">#{s.id.substr(0,12)}<div className="mt-2 text-slate-800 font-black text-lg">{s.date}</div></td>
                            <td className="px-12 py-12">
                               <div className="font-black text-slate-800 text-2xl mb-1">{s.customerName || 'Walking-in'}</div>
                               <div className="text-base font-bold text-sky-600">{s.customerPhone || '---'}</div>
                            </td>
                            <td className="px-12 py-12 text-right font-black text-4xl text-sky-600 tracking-tighter">{formatCurrency(s.total, language)}</td>
                            <td className="px-12 py-12 text-center">
                               <span className={`px-10 py-4 rounded-full text-xs font-black uppercase tracking-widest ${s.status === 'Paid' ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-100' : 'bg-amber-500 text-white shadow-xl shadow-amber-100'}`}>{s.status === 'Paid' ? t.pay_paid : t.pay_pending}</span>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* STOCK */}
          {mode === AppMode.STOCK && (
             <div className="p-12">
                <div className="flex justify-between items-center mb-12">
                   <h2 className="text-5xl font-black text-slate-800 flex items-center gap-6"><Package size={56} className="text-sky-600" /> {t.stock_title}</h2>
                   <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-slate-900 text-white px-14 py-7 rounded-[3rem] font-black text-3xl shadow-2xl flex items-center gap-6 hover:bg-black transition-all">
                      <Plus size={40} strokeWidth={4} /> {t.stock_add}
                   </button>
                </div>
                <div className="bg-white rounded-[4rem] border shadow-sm overflow-hidden">
                   <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b text-xs font-black uppercase text-slate-400 tracking-[0.2em]">
                         <tr><th className="px-12 py-8">Product Details</th><th className="px-12 py-8 text-right">Cost</th><th className="px-12 py-8 text-right">Retail Price</th><th className="px-12 py-8 text-center">Stock</th><th className="px-12 py-8 text-center">Action</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50 group">
                            <td className="px-12 py-10 flex items-center gap-8">
                               <div className={`w-24 h-24 rounded-[2rem] ${p.color} flex items-center justify-center font-black text-4xl text-white shadow-2xl`}>{p.name.charAt(0)}</div>
                               <div><div className="font-black text-slate-800 text-3xl leading-none mb-2">{p.name}</div><div className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest">SKU: {p.code}</div></div>
                            </td>
                            <td className="px-12 py-10 text-right text-slate-400 font-black text-xl">{formatCurrency(p.cost, language)}</td>
                            <td className="px-12 py-10 text-right text-sky-600 font-black text-4xl tracking-tighter">{formatCurrency(p.price, language)}</td>
                            <td className="px-12 py-10 text-center"><span className={`px-8 py-3 rounded-2xl text-sm font-black uppercase ${p.stock <= 5 ? 'bg-rose-500 text-white shadow-lg' : 'bg-emerald-500 text-white shadow-lg'}`}>{p.stock} Unit</span></td>
                            <td className="px-12 py-10 text-center"><button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-6 bg-slate-100 rounded-3xl text-slate-400 hover:text-sky-600 transition-all shadow-sm"><Edit size={32}/></button></td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {/* REPORTS */}
          {mode === AppMode.REPORTS && (
             <div className="p-12 space-y-12">
                <div className="flex justify-between items-center">
                   <h2 className="text-5xl font-black text-slate-800 flex items-center gap-6"><BarChart3 size={56} className="text-sky-600" /> {t.menu_reports}</h2>
                   <div className="flex items-center gap-6 bg-white p-6 rounded-[2.5rem] border shadow-sm">
                      <Calendar size={28} className="text-slate-400" />
                      <input type="date" value={reportDateRange.start} className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 font-black outline-none focus:border-sky-500" onChange={e=>setReportDateRange(p=>({...p, start: e.target.value}))} />
                      <span className="font-black text-slate-300">to</span>
                      <input type="date" value={reportDateRange.end} className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 font-black outline-none focus:border-sky-500" onChange={e=>setReportDateRange(p=>({...p, end: e.target.value}))} />
                   </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
                   {['product', 'customer', 'profit', 'top_qty'].map(btn => (
                      <button key={btn} className={`py-8 rounded-[2.5rem] font-black uppercase text-base tracking-widest transition-all ${btn === 'product' ? 'bg-slate-900 text-white shadow-2xl' : 'bg-white text-slate-400 border shadow-sm hover:border-slate-300'}`}>{t[`report_by_${btn}`] || btn}</button>
                   ))}
                </div>
                <div className="bg-white p-20 rounded-[4rem] border shadow-sm text-center flex flex-col items-center justify-center min-h-[500px]">
                   <BarChart3 size={160} strokeWidth={1} className="text-slate-100 mb-10" />
                   <p className="font-black text-slate-200 text-4xl uppercase tracking-[0.5em]">{t.menu_reports}</p>
                </div>
             </div>
          )}

          {/* SETTINGS */}
          {mode === AppMode.SETTINGS && (
            <div className="p-12 max-w-6xl space-y-12">
               <h2 className="text-5xl font-black text-slate-800 flex items-center gap-6"><Settings size={56} className="text-sky-600" /> {t.menu_settings}</h2>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="bg-white p-12 rounded-[4rem] border shadow-sm space-y-10">
                     <h4 className="text-xs font-black text-slate-300 uppercase tracking-[0.5em] border-b pb-6 ml-6">{t.setting_shop_name} & {t.setting_address}</h4>
                     <div className="space-y-8">
                        <div className="space-y-3"><label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-6">Shop Name</label><input defaultValue={storeProfile.name} className="w-full p-8 bg-slate-50 border-4 border-slate-100 rounded-[2.5rem] font-black text-2xl outline-none focus:border-sky-500 transition-all" /></div>
                        <div className="space-y-3"><label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-6">Store Address</label><textarea defaultValue={storeProfile.address} className="w-full p-8 bg-slate-50 border-4 border-slate-100 rounded-[2.5rem] font-bold text-xl outline-none h-48 focus:border-sky-500 resize-none" /></div>
                        <button className="w-full py-10 bg-sky-600 text-white rounded-[3rem] font-black text-3xl shadow-2xl shadow-sky-100 uppercase tracking-widest">{t.save}</button>
                     </div>
                  </div>
                  <div className="bg-white p-12 rounded-[4rem] border shadow-sm space-y-10">
                     <h4 className="text-xs font-black text-slate-300 uppercase tracking-[0.5em] border-b pb-6 ml-6">{t.setting_bulk}</h4>
                     <div className="space-y-8">
                        <p className="text-lg font-bold text-slate-400 leading-relaxed">Manage your catalog in bulk using CSV files. Download the template to structure your data correctly.</p>
                        <button className="w-full py-10 bg-slate-900 text-white rounded-[3rem] font-black text-2xl flex items-center justify-center gap-6 hover:bg-black transition-all">
                           <Download size={36}/> {t.setting_download_temp}
                        </button>
                        <label className="w-full py-10 bg-emerald-600 text-white rounded-[3rem] font-black text-2xl flex items-center justify-center gap-6 hover:bg-emerald-700 transition-all cursor-pointer">
                           <Upload size={36}/> {t.setting_upload}
                           <input type="file" className="hidden" />
                        </label>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* OVERHAULED BILL MODAL - 40/60 Split & MANUAL QTY INPUT */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 z-[200] flex items-center justify-center p-0 md:p-12 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-[95vw] h-full md:h-[95vh] rounded-none md:rounded-[5rem] shadow-[0_50px_100px_rgba(0,0,0,0.6)] flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-500">
             
             {/* LEFT SECTION (CART) - 40% */}
             <div className="w-full md:w-[42%] lg:w-[40%] bg-slate-50 border-r-4 border-slate-100 flex flex-col h-full overflow-hidden shadow-2xl">
                <div className="p-12 border-b-4 bg-white space-y-12">
                   <div className="flex justify-between items-center">
                      <h3 className="text-6xl font-black text-slate-800 tracking-tighter uppercase flex items-center gap-8"><ShoppingCart size={64} className="text-sky-500" /> {t.order_create_bill}</h3>
                      <button onClick={()=>setIsBillModalOpen(false)} className="md:hidden p-6 bg-slate-100 rounded-full"><X size={48}/></button>
                   </div>
                   
                   <div className="space-y-8">
                      <div className="grid grid-cols-2 gap-8">
                         <div className="space-y-3"><label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-8">{t.order_cust_name}</label><input className="w-full p-8 bg-slate-100 border-4 border-slate-200 rounded-[2.5rem] font-black text-3xl focus:ring-12 ring-sky-100 outline-none transition-all placeholder:text-slate-200" placeholder="---" /></div>
                         <div className="space-y-3"><label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-8">{t.order_cust_phone}</label><input className="w-full p-8 bg-slate-100 border-4 border-slate-200 rounded-[2.5rem] font-black text-3xl focus:ring-12 ring-sky-100 outline-none transition-all placeholder:text-slate-200" placeholder="---" /></div>
                      </div>
                      <div className="space-y-3"><label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-8">{t.order_cust_addr}</label><textarea className="w-full p-8 bg-slate-100 border-4 border-slate-200 rounded-[2.5rem] font-bold text-2xl h-40 outline-none focus:ring-12 ring-sky-100 transition-all resize-none placeholder:text-slate-200" placeholder="---" /></div>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-12 space-y-10 bg-slate-50/50 custom-scrollbar">
                   {billItems.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-10 p-10 bg-white rounded-[4rem] border-4 border-slate-100 shadow-2xl group animate-in slide-in-from-right-10">
                         <div className={`w-28 h-28 rounded-3xl ${it.color} flex items-center justify-center font-black text-5xl text-white shadow-2xl`}>{it.name.charAt(0)}</div>
                         <div className="flex-1 min-w-0">
                            <div className="text-3xl font-black text-slate-800 leading-tight mb-2 truncate">{it.name}</div>
                            <div className="text-xl font-black text-sky-600 tracking-widest">{formatCurrency(it.price, language)}</div>
                         </div>
                         <div className="flex items-center gap-6 bg-slate-100 p-3 rounded-[2.5rem] border-4 border-slate-200 shadow-inner">
                            <button onClick={()=>setBillItems(p=>p.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))} className="p-4 text-slate-400 hover:text-sky-600"><Minus size={36} strokeWidth={4}/></button>
                            {/* LARGE MANUAL QUANTITY INPUT */}
                            <input 
                              type="number" 
                              className="w-28 py-6 bg-white border-4 border-slate-200 rounded-[1.5rem] text-center font-black text-5xl outline-none focus:ring-12 ring-sky-100 transition-all shadow-xl"
                              value={it.quantity}
                              onChange={(e) => {
                                const v = parseInt(e.target.value) || 1;
                                setBillItems(prev => prev.map((i, ix) => ix === idx ? { ...i, quantity: Math.max(1, v) } : i));
                              }}
                            />
                            <button onClick={()=>setBillItems(p=>p.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))} className="p-4 text-slate-400 hover:text-sky-600"><Plus size={36} strokeWidth={4}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter((_, i)=>i!==idx))} className="p-5 text-rose-200 hover:text-rose-600 transition-all"><Trash2 size={56}/></button>
                      </div>
                   ))}
                   {billItems.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-10 py-48"><ShoppingCart size={240} strokeWidth={1}/><p className="font-black text-5xl uppercase tracking-[0.5em] mt-12">Empty Cart</p></div>}
                </div>

                <div className="p-12 border-t-8 border-slate-100 bg-white space-y-12 shadow-[0_-30px_80px_rgba(0,0,0,0.08)]">
                   <div className="flex justify-between items-center px-10"><span className="text-lg font-black text-slate-300 uppercase tracking-widest">{t.order_subtotal}</span><span className="text-5xl font-black text-slate-800 tracking-tighter">{formatCurrency(billItems.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span></div>
                   <div className="flex justify-between items-center px-10 py-8 bg-rose-50 rounded-[3rem] border-4 border-rose-100 shadow-inner">
                      <span className="text-sm font-black text-rose-400 uppercase tracking-widest">{t.order_discount} (LAK)</span>
                      <input type="number" className="w-56 bg-white border-4 border-rose-200 rounded-3xl px-8 py-6 text-right font-black text-5xl text-rose-600 outline-none focus:ring-12 ring-rose-100 transition-all shadow-2xl" value={billDiscount} onChange={e=>setBillDiscount(Number(e.target.value))} />
                   </div>
                   <div className="pt-12 border-t-8 border-double border-slate-50 flex justify-between items-end px-10">
                      <span className="font-black text-slate-800 uppercase tracking-tighter text-4xl mb-4">NET TOTAL</span>
                      <span className="text-[10rem] font-black text-sky-600 tracking-tighter leading-none drop-shadow-2xl">{formatCurrency(Math.max(0, billItems.reduce((s,i)=>s+(i.price*i.quantity),0) - billDiscount), language)}</span>
                   </div>
                   <button onClick={() => {
                      const total = billItems.reduce((s,i)=>s+(i.price*i.quantity),0) - billDiscount;
                      saveOrder({ id: uuidv4(), items: [...billItems], subtotal: total+billDiscount, discount: billDiscount, total, date: new Date().toLocaleString(), timestamp: Date.now(), status: 'Paid' });
                   }} disabled={billItems.length === 0} className="w-full py-12 bg-sky-600 text-white rounded-[4rem] font-black text-5xl shadow-[0_40px_80px_-20px_rgba(14,165,233,0.7)] hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-20 uppercase tracking-[0.2em]">{t.save}</button>
                </div>
             </div>

             {/* RIGHT SECTION (CATALOG) - 60% */}
             <div className="flex-1 p-20 flex flex-col relative bg-white overflow-hidden h-full">
                <button onClick={()=>setIsBillModalOpen(false)} className="absolute top-20 right-20 p-10 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all z-30 shadow-[0_20px_50px_rgba(0,0,0,0.2)] group"><X size={64} strokeWidth={5} className="group-hover:rotate-90 transition-transform" /></button>
                
                <div className="mb-20">
                   <h4 className="text-3xl font-black text-slate-300 uppercase tracking-[0.6em] mb-12 ml-10">{t.menu_stock} Selection</h4>
                   <div className="flex items-center gap-10 bg-slate-50 p-10 rounded-[5rem] border-8 border-slate-200 shadow-inner w-full max-w-5xl focus-within:ring-[20px] ring-sky-100 transition-all">
                      <Search className="text-slate-400" size={64} strokeWidth={4} />
                      <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="bg-transparent outline-none flex-1 font-black text-6xl placeholder:text-slate-200" />
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-16 pr-10 custom-scrollbar">
                   {products.filter(p => !skuSearch || p.code.toLowerCase().includes(skuSearch.toLowerCase()) || p.name.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => setBillItems(prev => {
                        const exist = prev.find(i => i.id === p.id);
                        return exist ? prev.map(i => i.id === p.id ? {...i, quantity: i.quantity + 1} : i) : [...prev, {...p, quantity: 1}];
                      })} className="bg-white p-10 rounded-[6rem] border-8 border-slate-100 shadow-[0_30px_60px_rgba(0,0,0,0.1)] hover:border-sky-500 hover:shadow-[0_40px_100px_rgba(14,165,233,0.3)] hover:translate-y-[-20px] transition-all flex flex-col group active:scale-95 text-left relative overflow-hidden h-full">
                        <div className={`w-full aspect-square rounded-[4.5rem] ${p.color} mb-12 flex items-center justify-center text-[10rem] font-black text-white shadow-2xl group-hover:scale-105 transition-transform overflow-hidden relative`}>
                           {p.name.charAt(0)}
                           <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                        <h4 className="font-black text-slate-800 text-5xl mb-4 leading-tight pr-10 break-words">{p.name}</h4>
                        <div className="text-base font-black text-slate-300 uppercase tracking-[0.4em] mb-12">SKU: {p.code}</div>
                        <div className="mt-auto flex justify-between items-end border-t-8 border-slate-50 pt-10">
                           <div className="flex flex-col">
                              <span className="text-sky-600 font-black text-6xl tracking-tighter leading-none mb-2">{formatCurrency(p.price, language)}</span>
                              <span className="text-xs font-black text-slate-300 uppercase tracking-widest">Retail Price</span>
                           </div>
                           <span className={`px-8 py-3 rounded-3xl text-sm font-black uppercase tracking-widest shadow-2xl ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}>{p.stock} Units</span>
                        </div>
                      </button>
                   ))}
                   {products.length === 0 && <div className="col-span-full py-64 text-center opacity-10"><Package size={400} strokeWidth={1}/><p className="font-black text-7xl uppercase tracking-[1em] mt-16">Stock Empty</p></div>}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 z-[300] flex items-center justify-center p-12 backdrop-blur-2xl">
          <div className="bg-white rounded-[6rem] w-full max-w-3xl p-20 shadow-[0_60px_120px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-500">
            <h3 className="text-6xl font-black mb-16 text-slate-800 flex items-center gap-10 uppercase tracking-tighter border-b-[16px] border-sky-500 pb-10 w-fit"><Package className="text-sky-500" size={80} /> {editingProduct ? t.save : t.stock_add}</h3>
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
                color: editingProduct?.color || COLORS[Math.floor(Math.random()*COLORS.length)] 
              };
              setProducts(prev => [...prev.filter(x => x.id !== p.id), p]); 
              setIsProductModalOpen(false);
            }} className="space-y-12">
              <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-12">Product Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-10 bg-slate-50 border-[6px] border-slate-200 rounded-[3.5rem] font-black text-4xl outline-none focus:ring-[24px] ring-sky-100 transition-all shadow-inner" /></div>
              <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-12">SKU / BARCODE</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-10 bg-slate-50 border-[6px] border-slate-200 rounded-[3.5rem] font-black text-4xl outline-none focus:ring-[24px] ring-sky-100 transition-all shadow-inner" /></div>
              <div className="grid grid-cols-2 gap-12">
                <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-12">Cost Price</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-10 bg-slate-50 border-[6px] border-slate-200 rounded-[3.5rem] font-black text-4xl outline-none" /></div>
                <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-12">Retail Price</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-10 bg-sky-50 border-[6px] border-sky-200 rounded-[3.5rem] font-black text-sky-600 text-6xl outline-none shadow-inner" /></div>
              </div>
              <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-12">Initial Stock</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-10 bg-slate-50 border-[6px] border-slate-200 rounded-[3.5rem] font-black text-4xl outline-none shadow-inner" /></div>
              <div className="flex gap-12 pt-16">
                 <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-12 bg-slate-100 text-slate-500 rounded-[4rem] font-black uppercase text-3xl tracking-widest">{t.cancel}</button>
                 <button type="submit" className="flex-[2] py-12 bg-sky-600 text-white rounded-[4rem] font-black text-4xl shadow-[0_30px_80px_rgba(14,165,233,0.5)] uppercase tracking-widest">{t.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROMOTIONS MODAL */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 z-[300] flex items-center justify-center p-12 backdrop-blur-2xl">
          <div className="bg-white rounded-[6rem] w-full max-w-4xl p-20 shadow-[0_60px_120px_rgba(0,0,0,0.6)] overflow-y-auto max-h-[90vh]">
            <h3 className="text-6xl font-black mb-16 text-slate-800 uppercase tracking-tighter border-b-[16px] border-sky-500 pb-10 w-fit">{t.promo_tier_title}</h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const tiers: PromoTier[] = [];
              for(let i=1; i<=7; i++) {
                const qty = fd.get(`qty_${i}`);
                const price = fd.get(`price_${i}`);
                if (qty && price && Number(qty) > 0) {
                  tiers.push({ minQty: Number(qty), unitPrice: Number(price) });
                }
              }
              const p: Promotion = { id: uuidv4(), name: fd.get('name') as string, targetProductId: '', isActive: true, tiers };
              setPromotions(prev => [...prev, p]); 
              setIsPromoModalOpen(false);
            }} className="space-y-16">
              <input name="name" placeholder={t.promo_name} required className="w-full p-12 bg-slate-50 border-[8px] border-slate-200 rounded-[4rem] font-black text-5xl outline-none focus:ring-[32px] ring-sky-100 transition-all shadow-inner" />
              <div className="space-y-10">
                <p className="text-base font-black text-slate-400 uppercase tracking-[0.6em] border-b-8 border-slate-50 pb-8 ml-16">Wholesale Step-Prices (Set 1 to 7 Steps)</p>
                <div className="space-y-8">
                  {[1,2,3,4,5,6,7].map(n => (
                    <div key={n} className="grid grid-cols-2 gap-12 items-center">
                      <div className="relative"><span className="absolute left-12 top-1/2 -translate-y-1/2 text-sm font-black text-slate-300 tracking-widest">MIN QTY {n}</span><input name={`qty_${n}`} type="number" placeholder="---" className="w-full pl-44 pr-12 py-10 bg-slate-50 border-[6px] border-slate-100 rounded-[2.5rem] font-black text-4xl shadow-inner" /></div>
                      <div className="relative"><span className="absolute left-12 top-1/2 -translate-y-1/2 text-sm font-black text-sky-300 tracking-widest">PRICE {n}</span><input name={`price_${n}`} type="number" placeholder="---" className="w-full pl-44 pr-12 py-10 bg-sky-50 border-[6px] border-sky-100 rounded-[2.5rem] font-black text-5xl text-sky-600 shadow-xl" /></div>
                    </div>
                  ))}
                </div>
              </div>
              <button type="submit" className="w-full py-12 bg-sky-600 text-white rounded-[4.5rem] font-black text-5xl shadow-[0_40px_100px_rgba(14,165,233,0.7)] uppercase tracking-widest">{t.save}</button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
