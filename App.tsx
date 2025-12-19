
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, ShoppingCart, Plus, Minus, Trash2, Edit, Loader2, Store, Check, 
  LayoutDashboard, Settings, UploadCloud, ImagePlus, DollarSign, Package, 
  Send, Bot, ClipboardList, BarChart3, Tag, X, Truck, User, MapPin, Search,
  Download, Upload, LogOut, ChevronRight, CreditCard, Clock, CheckCircle2, Calendar
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Message, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, Language, Role, Promotion, LogisticsProvider, PromoTier } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { streamResponse } from './services/gemini';
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

const COLORS = ['bg-sky-100 text-sky-600', 'bg-amber-100 text-amber-600', 'bg-emerald-100 text-emerald-600', 'bg-rose-100 text-rose-600', 'bg-purple-100 text-purple-600'];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');
  const [isCloudActive, setIsCloudActive] = useState<boolean>(() => localStorage.getItem('pos_force_local') !== 'true');

  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>(() => JSON.parse(localStorage.getItem('pos_promos') || '[]'));
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : INITIAL_PROFILE;
  });

  // Filters
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportType, setReportType] = useState<'customer' | 'product' | 'profit' | 'top_qty' | 'top_val'>('product');

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  
  // New Bill State
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

  const filteredSales = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return recentSales;
    const start = new Date(dateRange.start).getTime();
    const end = new Date(dateRange.end).getTime() + 86400000;
    return recentSales.filter(s => s.timestamp >= start && s.timestamp <= end);
  }, [recentSales, dateRange]);

  // Dash Metrics
  const dashMetrics = useMemo(() => {
    const sales = filteredSales.reduce((acc, s) => acc + s.total, 0);
    const collected = filteredSales.filter(s => s.status === 'Paid').reduce((acc, s) => acc + s.total, 0);
    const pending = filteredSales.filter(s => s.status === 'Pending').reduce((acc, s) => acc + s.total, 0);
    const stockValue = products.reduce((acc, p) => acc + (p.cost * p.stock), 0);
    const lowStock = products.filter(p => p.stock <= 5);
    return { sales, collected, pending, stockValue, lowStock };
  }, [filteredSales, products]);

  const saveOrder = async (order: SaleRecord) => {
    const updated = [order, ...recentSales];
    setRecentSales(updated);
    if (!isCloudActive) localStorage.setItem('pos_sales', JSON.stringify(updated));
    if (isCloudActive && db) try { await setDoc(doc(db, 'sales', order.id), order); } catch(e){}
    setIsBillModalOpen(false);
    setBillItems([]);
    setBillDiscount(0);
  };

  const handleDownloadTemplate = () => {
    const headers = "SKU,Name,Cost,Price,Stock,Category\nSKU001,Latte,10000,15000,50,Coffee";
    const blob = new Blob([headers], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pos_template.csv';
    a.click();
  };

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={() => {}} language={language} setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header - Date Picker for Dashboard/Reports */}
        {(mode === AppMode.DASHBOARD || mode === AppMode.REPORTS) && (
          <header className="h-16 bg-white border-b px-8 flex items-center justify-between no-print">
            <div className="flex items-center gap-4">
              <Calendar size={20} className="text-slate-400" />
              <input type="date" className="bg-slate-50 border rounded-lg px-3 py-1 text-sm outline-none" onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
              <span className="text-slate-300">to</span>
              <input type="date" className="bg-slate-50 border rounded-lg px-3 py-1 text-sm outline-none" onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
            </div>
            <div className="md:hidden">
              <button onClick={()=>setIsSidebarOpen(true)} className="p-2 text-slate-600"><Menu /></button>
            </div>
          </header>
        )}

        <div className="flex-1 overflow-y-auto pb-10">
          {mode === AppMode.DASHBOARD && (
            <div className="p-8 space-y-8">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">{t.dash_sales}</p><h3 className="text-2xl font-bold text-sky-600">{formatCurrency(dashMetrics.sales, language)}</h3></div>
                <div className="bg-white p-6 rounded-[2rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">{t.dash_collected}</p><h3 className="text-2xl font-bold text-emerald-500">{formatCurrency(dashMetrics.collected, language)}</h3></div>
                <div className="bg-white p-6 rounded-[2rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">{t.dash_pending}</p><h3 className="text-2xl font-bold text-rose-500">{formatCurrency(dashMetrics.pending, language)}</h3></div>
                <div className="bg-white p-6 rounded-[2rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">{t.dash_stock_cost}</p><h3 className="text-2xl font-bold text-amber-500">{formatCurrency(dashMetrics.stockValue, language)}</h3></div>
              </div>
              <div className="bg-white p-8 rounded-[2rem] border shadow-sm">
                <h4 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><Package size={18} className="text-rose-500" /> {t.dash_low_stock}</h4>
                <div className="space-y-3">
                  {dashMetrics.lowStock.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-4 bg-rose-50 rounded-2xl border border-rose-100">
                      <div><span className="font-bold text-slate-700">{p.name}</span> <span className="text-[10px] text-slate-400 ml-2">SKU: {p.code}</span></div>
                      <span className="text-rose-600 font-bold">{p.stock} left</span>
                    </div>
                  ))}
                  {dashMetrics.lowStock.length === 0 && <p className="text-center text-slate-300 py-10">Inventory is healthy</p>}
                </div>
              </div>
            </div>
          )}

          {mode === AppMode.ORDERS && (
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800"><ClipboardList className="text-sky-600" /> {t.menu_orders}</h2>
                <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-8 py-4 rounded-[1.5rem] font-bold shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center gap-2">
                  <Plus size={20}/> {t.order_create_bill}
                </button>
              </div>
              <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b">
                    <tr><th className="px-6 py-5"># Order ID</th><th className="px-6 py-5">Customer</th><th className="px-6 py-5">Logistics</th><th className="px-6 py-5 text-right">Total</th><th className="px-6 py-5 text-center">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentSales.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-5 font-mono text-[10px] text-slate-400">#{s.id.substr(0,8)}<div className="mt-1 text-slate-300 font-medium">{s.date}</div></td>
                        <td className="px-6 py-5">
                          <div className="font-bold text-slate-700">{s.customerName || 'Anonymous'}</div>
                          <div className="text-[10px] text-slate-400">{s.customerPhone}</div>
                        </td>
                        <td className="px-6 py-5">
                           <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Truck size={14} className="text-sky-500" /> {s.shippingCarrier}</div>
                           <div className="text-[10px] text-sky-600 font-bold ml-5">{s.shippingBranch}</div>
                        </td>
                        <td className="px-6 py-5 text-right font-bold text-sky-600">{formatCurrency(s.total, language)}</td>
                        <td className="px-6 py-5 text-center">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase ${s.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                            {s.status === 'Paid' ? t.pay_paid : t.pay_pending}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mode === AppMode.REPORTS && (
            <div className="p-8">
               <h2 className="text-2xl font-bold flex items-center gap-3 mb-8 text-slate-800"><BarChart3 className="text-sky-600" /> {t.menu_reports}</h2>
               <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
                  <button onClick={()=>setReportType('product')} className={`px-6 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${reportType === 'product' ? 'bg-sky-600 text-white shadow-lg' : 'bg-white text-slate-400 border'}`}>{t.report_by_product}</button>
                  <button onClick={()=>setReportType('customer')} className={`px-6 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${reportType === 'customer' ? 'bg-sky-600 text-white shadow-lg' : 'bg-white text-slate-400 border'}`}>{t.report_by_customer}</button>
                  <button onClick={()=>setReportType('profit')} className={`px-6 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${reportType === 'profit' ? 'bg-sky-600 text-white shadow-lg' : 'bg-white text-slate-400 border'}`}>{t.report_profit}</button>
                  <button onClick={()=>setReportType('top_qty')} className={`px-6 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${reportType === 'top_qty' ? 'bg-sky-600 text-white shadow-lg' : 'bg-white text-slate-400 border'}`}>{t.report_top_qty}</button>
                  <button onClick={()=>setReportType('top_val')} className={`px-6 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${reportType === 'top_val' ? 'bg-sky-600 text-white shadow-lg' : 'bg-white text-slate-400 border'}`}>{t.report_top_value}</button>
               </div>
               <div className="bg-white p-10 rounded-[2.5rem] border shadow-sm min-h-[400px]">
                  {/* Report Logic would go here based on reportType state */}
                  <div className="text-center py-20 text-slate-200">
                     <BarChart3 size={80} className="mx-auto mb-4 opacity-10" />
                     <p className="font-bold uppercase tracking-widest">{reportType} Report Loaded</p>
                  </div>
               </div>
            </div>
          )}

          {mode === AppMode.STOCK && (
             <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800"><Package className="text-sky-600" /> {t.stock_title}</h2>
                  <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-sky-600 text-white px-8 py-4 rounded-[1.5rem] font-bold shadow-xl shadow-sky-100 flex items-center gap-2 hover:bg-sky-700 transition-all">
                    <Plus size={20}/> {t.stock_add}
                  </button>
                </div>
                <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
                   <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold border-b">
                         <tr><th className="px-6 py-5">Item Details</th><th className="px-6 py-5 text-right">Cost</th><th className="px-6 py-5 text-right">Selling Price</th><th className="px-6 py-5 text-center">In Stock</th><th className="px-6 py-5 text-center">Action</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-5 flex items-center gap-4">
                               <div className={`w-12 h-12 rounded-xl ${p.color} flex items-center justify-center font-bold text-lg text-white`}>{p.name.charAt(0)}</div>
                               <div><div className="font-bold text-slate-800">{p.name}</div><div className="text-[10px] font-mono text-slate-300">{p.code}</div></div>
                            </td>
                            <td className="px-6 py-5 text-right font-medium text-slate-400 text-sm">{formatCurrency(p.cost, language)}</td>
                            <td className="px-6 py-5 text-right font-bold text-sky-600">{formatCurrency(p.price, language)}</td>
                            <td className="px-6 py-5 text-center"><span className={`px-4 py-1.5 rounded-full text-[10px] font-bold ${p.stock <= 5 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.stock} Units</span></td>
                            <td className="px-6 py-5 text-center">
                               <button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-3 text-slate-300 hover:text-sky-600 hover:bg-sky-50 rounded-2xl transition-all"><Edit size={18}/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {mode === AppMode.PROMOTIONS && (
             <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800"><Tag className="text-sky-600" /> {t.menu_promotions}</h2>
                  <button onClick={()=>setIsPromoModalOpen(true)} className="bg-sky-600 text-white px-8 py-4 rounded-[1.5rem] font-bold shadow-xl shadow-sky-100 flex items-center gap-2 hover:bg-sky-700 transition-all">
                    <Plus size={20}/> {t.promo_add}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {promotions.map(p => (
                      <div key={p.id} className="bg-white p-10 rounded-[3rem] border shadow-sm relative group overflow-hidden">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-sky-50 -mr-16 -mt-16 rounded-full group-hover:scale-110 transition-transform"></div>
                         <h4 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3"><Tag size={24} className="text-sky-500"/> {p.name}</h4>
                         <div className="space-y-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">7-Step Tier Pricing</p>
                            <div className="grid grid-cols-1 gap-2">
                               {p.tiers.map((tier, idx) => (
                                  <div key={idx} className="flex justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-semibold">
                                     <span>Qty: {tier.minQty}+</span>
                                     <span className="text-sky-600">{formatCurrency(tier.unitPrice, language)} / unit</span>
                                  </div>
                               ))}
                            </div>
                         </div>
                         <button onClick={()=>setPromotions(prev => prev.filter(x => x.id !== p.id))} className="mt-8 text-rose-500 text-xs font-bold hover:underline flex items-center gap-2"><Trash2 size={14}/> Remove Promo</button>
                      </div>
                   ))}
                </div>
             </div>
          )}

          {mode === AppMode.SETTINGS && (
            <div className="p-8">
              <h2 className="text-2xl font-bold flex items-center gap-3 mb-8 text-slate-800"><Settings className="text-sky-600" /> {t.menu_settings}</h2>
              <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <div className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-8">
                    <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest border-b pb-4">Store Identity</h4>
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-100 rounded-[2rem] bg-slate-50 cursor-pointer hover:border-sky-300 transition-all">
                       <ImagePlus size={40} className="text-slate-300 mb-2"/>
                       <span className="text-xs font-bold text-slate-400 uppercase">Upload Logo</span>
                    </div>
                    <div className="space-y-6">
                       <div className="space-y-1"><label className="text-xs font-bold text-slate-500 ml-2">Shop Name</label><input defaultValue={storeProfile.name} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-400 font-bold" /></div>
                       <div className="space-y-1"><label className="text-xs font-bold text-slate-500 ml-2">Address</label><textarea defaultValue={storeProfile.address} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-400 h-24 text-sm font-medium" /></div>
                    </div>
                    <button className="w-full py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold shadow-xl shadow-sky-100 hover:bg-sky-700">{t.save}</button>
                 </div>
                 <div className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-8">
                    <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest border-b pb-4">Bulk Management</h4>
                    <div className="space-y-4">
                       <p className="text-sm text-slate-400">Download the template to prepare your SKU data for bulk import.</p>
                       <button onClick={handleDownloadTemplate} className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-bold flex items-center justify-center gap-3 hover:bg-black transition-all">
                          <Download size={20}/> {t.setting_download_temp}
                       </button>
                       <div className="pt-8 space-y-4 border-t border-slate-50">
                          <p className="text-sm text-slate-400">Import your prepared CSV file to populate inventory instantly.</p>
                          <label className="w-full py-5 bg-emerald-600 text-white rounded-[1.5rem] font-bold flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all cursor-pointer">
                             <Upload size={20}/> {t.setting_upload}
                             <input type="file" className="hidden" />
                          </label>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* DETAILED BILL MODAL (The key request) */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-6xl p-0 shadow-2xl overflow-hidden flex h-[90vh] animate-in zoom-in-95 duration-200">
             {/* Left Side: Order Builder */}
             <div className="w-full lg:w-96 bg-slate-50 flex flex-col border-r">
                <div className="p-8 border-b bg-white">
                   <h3 className="text-2xl font-black text-slate-800 tracking-tight uppercase mb-6">{t.order_create_bill}</h3>
                   <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                         <User size={18} className="text-slate-400" />
                         <input placeholder="Customer Name" name="cust_name" className="bg-transparent outline-none flex-1 font-bold text-sm" />
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                         <MapPin size={18} className="text-slate-400" />
                         <textarea placeholder="Delivery Address" className="bg-transparent outline-none flex-1 font-medium text-xs h-16" />
                      </div>
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                   {billItems.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                         <div className="flex-1">
                            <div className="text-xs font-bold text-slate-800 truncate">{it.name}</div>
                            <div className="text-[10px] text-sky-600 font-bold">{formatCurrency(it.price, language)}</div>
                         </div>
                         <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-xl">
                            <button onClick={()=>setBillItems(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))} className="p-1 text-slate-400 hover:text-sky-600"><Minus size={12}/></button>
                            <span className="text-xs font-bold min-w-[1rem] text-center">{it.quantity}</span>
                            <button onClick={()=>setBillItems(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))} className="p-1 text-slate-400 hover:text-sky-600"><Plus size={12}/></button>
                         </div>
                         <button onClick={()=>setBillItems(prev => prev.filter((_, i) => i !== idx))} className="text-rose-200 hover:text-rose-600"><Trash2 size={16}/></button>
                      </div>
                   ))}
                   {billItems.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-10 py-20"><ShoppingCart size={64}/></div>}
                </div>
                <div className="p-8 border-t bg-white space-y-4">
                   <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-400 uppercase">Subtotal</span><span className="font-bold text-slate-700">{formatCurrency(billItems.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span></div>
                   <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-400 uppercase">{t.order_discount}</span><input type="number" className="w-24 text-right bg-slate-50 border rounded-lg px-2 py-1 text-xs font-bold text-rose-500" value={billDiscount} onChange={e=>setBillDiscount(Number(e.target.value))} /></div>
                   <div className="pt-4 border-t-2 border-dashed flex justify-between items-center">
                      <span className="font-black text-slate-800 uppercase tracking-tighter">Total</span>
                      <span className="text-3xl font-black text-sky-600 tracking-tighter">{formatCurrency(Math.max(0, billItems.reduce((s,i)=>s+(i.price*i.quantity),0) - billDiscount), language)}</span>
                   </div>
                   <button onClick={() => {
                      const total = billItems.reduce((s,i)=>s+(i.price*i.quantity),0) - billDiscount;
                      saveOrder({ id: uuidv4(), items: [...billItems], subtotal: total+billDiscount, discount: billDiscount, total, date: new Date().toLocaleString(), timestamp: Date.now(), status: 'Paid', paymentMethod: 'cash' } as any);
                   }} disabled={billItems.length === 0} className="w-full py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-30 uppercase tracking-widest">{t.save}</button>
                </div>
             </div>

             {/* Right Side: Product Picker */}
             <div className="flex-1 p-10 flex flex-col relative overflow-hidden">
                <button onClick={()=>setIsBillModalOpen(false)} className="absolute top-8 right-8 p-3 bg-slate-100 rounded-full hover:bg-slate-200 transition-all"><X size={20}/></button>
                <div className="flex items-center gap-4 mb-10 bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-inner max-w-lg">
                   <Search className="text-slate-400" size={24} />
                   <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="bg-transparent outline-none flex-1 font-bold text-lg" />
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 pr-2">
                   {products.filter(p => !skuSearch || p.code.toLowerCase().includes(skuSearch.toLowerCase()) || p.name.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => setBillItems(prev => {
                        const exist = prev.find(i => i.id === p.id);
                        return exist ? prev.map(i => i.id === p.id ? {...i, quantity: i.quantity + 1} : i) : [...prev, {...p, quantity: 1}];
                      })} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:border-sky-400 hover:shadow-xl hover:shadow-sky-50 transition-all flex flex-col group active:scale-95 text-left">
                        <div className={`w-full aspect-square rounded-[1.5rem] ${p.color} mb-4 flex items-center justify-center text-4xl font-black text-white shadow-inner group-hover:scale-105 transition-transform`}>{p.name.charAt(0)}</div>
                        <h4 className="font-extrabold text-slate-800 text-sm mb-1 truncate leading-tight">{p.name}</h4>
                        <div className="mt-auto flex justify-between items-center">
                           <span className="text-sky-600 font-black text-sm">{formatCurrency(p.price, language)}</span>
                           <span className="text-[9px] font-bold text-slate-300">QTY: {p.stock}</span>
                        </div>
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Product Modal (Fixed) */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-6 text-slate-800">{editingProduct ? t.save : t.stock_add}</h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const p = { 
                id: editingProduct?.id || uuidv4(), 
                name: fd.get('name') as string, 
                code: fd.get('code') as string, 
                category: fd.get('cat') as string || "General", 
                cost: parseFloat(fd.get('cost') as string) || 0, 
                price: parseFloat(fd.get('price') as string) || 0, 
                stock: parseInt(fd.get('stock') as string) || 0, 
                color: editingProduct?.color || COLORS[Math.floor(Math.random()*COLORS.length)] 
              };
              setProducts(prev => [...prev.filter(x => x.id !== p.id), p]); 
              setIsProductModalOpen(false);
            }} className="space-y-4">
              <input name="name" placeholder="Product Name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none focus:border-sky-300" />
              <input name="code" placeholder="SKU001" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none focus:border-sky-300" />
              <div className="grid grid-cols-2 gap-4">
                <input name="cost" type="number" placeholder="Cost" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-sky-300" />
                <input name="price" type="number" placeholder="Selling Price" required defaultValue={editingProduct?.price} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold text-sky-600" />
              </div>
              <input name="stock" type="number" placeholder="In-Stock Qty" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-sky-300" />
              <button type="submit" className="w-full py-5 bg-sky-600 text-white rounded-2xl font-bold shadow-lg shadow-sky-100">{t.save}</button>
            </form>
          </div>
        </div>
      )}

      {/* Promotion Modal (7 Tiers) */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] w-full max-w-xl p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-2xl font-bold mb-8 text-slate-800">{t.promo_tier_title}</h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const tiers: PromoTier[] = [];
              for(let i=1; i<=7; i++) {
                tiers.push({ minQty: Number(fd.get(`qty_${i}`)), unitPrice: Number(fd.get(`price_${i}`)) });
              }
              const p: Promotion = { 
                id: uuidv4(), 
                name: fd.get('name') as string, 
                targetProductId: fd.get('target') as string,
                isActive: true, 
                tiers 
              };
              setPromotions(prev => [...prev, p]); 
              setIsPromoModalOpen(false);
            }} className="space-y-6">
              <input name="name" placeholder="Promotion Label (e.g. Bulk Discounts)" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-sky-300" />
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Set 7 Tiers (Min Qty & Price Per Unit)</p>
                {[1,2,3,4,5,6,7].map(n => (
                  <div key={n} className="grid grid-cols-2 gap-4">
                    <input name={`qty_${n}`} type="number" placeholder={`Min Qty (Tier ${n})`} required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm" />
                    <input name={`price_${n}`} type="number" placeholder={`Unit Price (Tier ${n})`} required className="w-full p-4 bg-sky-50 border border-sky-100 rounded-2xl text-sm font-bold text-sky-600" />
                  </div>
                ))}
              </div>
              <button type="submit" className="w-full py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold shadow-xl shadow-sky-100 hover:bg-sky-700">{t.save}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
