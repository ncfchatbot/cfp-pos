
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Minus, Trash2, Edit, LayoutDashboard, Settings, 
  Package, ClipboardList, BarChart3, Tag, X, Search,
  Download, Upload, ShoppingCart, Calendar, Coffee, 
  TrendingUp, Users, PieChart, CheckCircle2, Save, Send, Bot, User
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AppMode, Product, CartItem, SaleRecord, StoreProfile, Language, Promotion, PromoTier, Role, Message } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { db, collection, doc, setDoc, onSnapshot, query, orderBy } from './services/firebase';
import { streamResponse } from './services/gemini';

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
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');
  const [isCloudActive] = useState<boolean>(() => localStorage.getItem('pos_force_local') !== 'true');

  // Core Data
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : INITIAL_PROFILE;
  });

  // AI & Reports
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [reportDateRange, setReportDateRange] = useState({ 
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], 
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0] 
  });

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  
  // Transaction
  const [billItems, setBillItems] = useState<CartItem[]>([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [skuSearch, setSkuSearch] = useState('');
  const [customerName, setCustomerName] = useState('');

  const t = translations[language];

  // Persistence
  useEffect(() => {
    localStorage.setItem('pos_language', language);
    localStorage.setItem('pos_profile', JSON.stringify(storeProfile));
    if (!isCloudActive) {
      localStorage.setItem('pos_products', JSON.stringify(products));
      localStorage.setItem('pos_sales', JSON.stringify(recentSales));
      localStorage.setItem('pos_promos', JSON.stringify(promotions));
    }
  }, [language, storeProfile, products, recentSales, promotions, isCloudActive]);

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

  // Pricing Logic (7-Tier Support)
  const getProductPrice = (product: Product, quantity: number) => {
    const promo = promotions.find(p => p.targetProductId === product.id && p.isActive);
    if (!promo || !promo.tiers || promo.tiers.length === 0) return product.price;
    const sortedTiers = [...promo.tiers].sort((a, b) => b.minQty - a.minQty);
    const applicableTier = sortedTiers.find(t => quantity >= t.minQty);
    return applicableTier ? applicableTier.unitPrice : product.price;
  };

  const metrics = useMemo(() => {
    const start = new Date(reportDateRange.start).getTime();
    const end = new Date(reportDateRange.end).getTime() + 86400000;
    const filteredSales = recentSales.filter(s => s.timestamp >= start && s.timestamp <= end);
    
    const stats: Record<string, { name: string, qty: number, revenue: number }> = {};
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        if (!stats[item.id]) stats[item.id] = { name: item.name, qty: 0, revenue: 0 };
        stats[item.id].qty += item.quantity;
        stats[item.id].revenue += (item.quantity * item.price);
      });
    });

    const totalSales = filteredSales.reduce((acc, s) => acc + s.total, 0);
    const totalCost = filteredSales.reduce((acc, s) => acc + s.items.reduce((c, i) => c + (i.cost * i.quantity), 0), 0);

    return {
      sales: totalSales,
      profit: totalSales - totalCost,
      count: filteredSales.length,
      topProducts: Object.values(stats).sort((a, b) => b.qty - a.qty).slice(0, 10),
      stockValue: products.reduce((acc, p) => acc + (p.cost * p.stock), 0),
      lowStock: products.filter(p => p.stock <= 5)
    };
  }, [recentSales, products, reportDateRange]);

  // CSV Tools
  const downloadTemplate = () => {
    const headers = ["SKU", "ProductName", "CostPrice", "RetailPrice", "Stock"];
    const example = ["COF-001", "Espresso", "10000", "25000", "100"];
    const csv = "\uFEFF" + [headers, example].map(e => e.join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "POS_Template.csv";
    link.click();
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = text.split("\n").filter(r => r.trim() !== "");
      const newItems: Product[] = rows.slice(1).map(row => {
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
      setProducts(prev => [...prev, ...newItems]);
      alert(`Imported ${newItems.length} products`);
    };
    reader.readAsText(file);
  };

  const saveOrder = async () => {
    const total = billItems.reduce((s, i) => s + (i.price * i.quantity), 0) - billDiscount;
    const order: SaleRecord = { 
      id: uuidv4(), 
      items: [...billItems], 
      subtotal: total + billDiscount, 
      discount: billDiscount, 
      total, 
      date: new Date().toLocaleString(), 
      timestamp: Date.now(), 
      status: 'Paid',
      customerName: customerName || 'Walk-in'
    };
    setProducts(prev => prev.map(p => {
      const cartItem = billItems.find(it => it.id === p.id);
      return cartItem ? { ...p, stock: Math.max(0, p.stock - cartItem.quantity) } : p;
    }));
    setRecentSales(prev => [order, ...prev]);
    if (isCloudActive && db) try { await setDoc(doc(db, 'sales', order.id), order); } catch(e) {}
    setIsBillModalOpen(false);
    setBillItems([]);
    setBillDiscount(0);
    setCustomerName('');
  };

  const handleAiChat = async () => {
    if (!chatInput.trim() || isAiTyping) return;
    const userMsg: Message = { id: uuidv4(), role: Role.USER, text: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsAiTyping(true);
    try {
      const history = chatMessages.map(m => ({ role: m.role === Role.USER ? 'user' : 'model', parts: [{ text: m.text }] }));
      const stream = await streamResponse(userMsg.text, AppMode.AI, history);
      if (stream) {
        let fullText = '';
        const aiMsgId = uuidv4();
        setChatMessages(prev => [...prev, { id: aiMsgId, role: Role.MODEL, text: '', timestamp: Date.now() }]);
        for await (const chunk of stream) {
          fullText += chunk.text;
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText } : m));
        }
      }
    } catch (error) {
      setChatMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: 'Connection error.', timestamp: Date.now(), isError: true }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={() => {}} language={language} setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          
          {/* DASHBOARD */}
          {mode === AppMode.DASHBOARD && (
            <div className="p-8 space-y-8 animate-in fade-in max-w-7xl mx-auto">
              <div className="bg-white p-12 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute -bottom-10 -left-10 opacity-[0.02] scale-150"><Coffee size={300} /></div>
                <div className="w-24 h-24 bg-sky-500 rounded-[2rem] flex items-center justify-center text-white shadow-2xl mb-8">
                  <Coffee size={48} />
                </div>
                <h2 className="text-5xl font-black text-slate-800">Coffee Please</h2>
                <div className="mt-4 px-8 py-2 bg-slate-100 rounded-full text-slate-400 font-black uppercase tracking-[0.3em] text-[10px]">
                  {t.dash_title}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: t.dash_sales, val: metrics.sales, color: 'sky', icon: TrendingUp },
                  { label: t.report_profit, val: metrics.profit, color: 'emerald', icon: CheckCircle2 },
                  { label: t.dash_pending, val: metrics.count, unit: 'Bills', color: 'rose', icon: ClipboardList },
                  { label: t.dash_stock_cost, val: metrics.stockValue, color: 'amber', icon: Package },
                ].map((item, i) => (
                  <div key={i} className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 border-b-[10px] border-b-slate-100 flex flex-col justify-between h-56 hover:border-b-sky-500 transition-all group">
                    <div className="flex justify-between items-start">
                      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">{item.label}</p>
                      <div className={`p-4 rounded-2xl bg-${item.color}-50 text-${item.color}-500 group-hover:scale-110 transition-transform`}><item.icon size={24} /></div>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900">
                      {item.unit ? `${item.val} ${item.unit}` : formatCurrency(item.val, language)}
                    </h3>
                  </div>
                ))}
              </div>

              <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                 <h4 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
                   <div className="p-3 bg-rose-100 text-rose-500 rounded-2xl"><Package size={24} /></div>
                   {t.dash_low_stock}
                 </h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {metrics.lowStock.map(p => (
                       <div key={p.id} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex justify-between items-center hover:bg-white transition-all">
                          <div><div className="font-black text-slate-800 text-xl">{p.name}</div><div className="text-[10px] text-slate-400 mt-1 uppercase">SKU: {p.code}</div></div>
                          <div className="bg-rose-500 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shadow-rose-100">{p.stock}</div>
                       </div>
                    ))}
                    {metrics.lowStock.length === 0 && <p className="col-span-full py-10 text-center text-slate-300 font-black">STOCK IS NORMAL</p>}
                 </div>
              </div>
            </div>
          )}

          {/* ORDERS */}
          {mode === AppMode.ORDERS && (
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
              <div className="flex justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                <h2 className="text-4xl font-black text-slate-800 flex items-center gap-6">
                   <div className="p-4 bg-sky-100 text-sky-600 rounded-2xl"><ClipboardList size={32} /></div>
                   {t.menu_orders}
                </h2>
                <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-10 py-5 rounded-[1.5rem] font-black text-xl shadow-2xl hover:bg-sky-700 transition-all flex items-center gap-4">
                  <Plus size={24} /> {t.order_create_bill}
                </button>
              </div>
              <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                       <tr><th className="px-10 py-6">Order ID / Time</th><th className="px-10 py-6">Customer</th><th className="px-10 py-6 text-right">Total</th><th className="px-10 py-6 text-center">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {recentSales.map(s => (
                         <tr key={s.id} className="hover:bg-slate-50/50 transition-all">
                            <td className="px-10 py-8 font-mono text-[10px] text-slate-300">#{s.id.substr(0,8)}<div className="mt-1 text-slate-800 font-black text-lg">{s.date}</div></td>
                            <td className="px-10 py-8 font-black text-slate-700 text-xl">{s.customerName}</td>
                            <td className="px-10 py-8 text-right font-black text-2xl text-sky-600">{formatCurrency(s.total, language)}</td>
                            <td className="px-10 py-8 text-center"><span className="px-6 py-2 rounded-xl text-[10px] font-black uppercase bg-emerald-500 text-white">{t.pay_paid}</span></td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* STOCK */}
          {mode === AppMode.STOCK && (
             <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
                <div className="flex justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                   <h2 className="text-4xl font-black text-slate-800 flex items-center gap-6">
                      <div className="p-4 bg-sky-100 text-sky-600 rounded-2xl"><Package size={32} /></div>
                      {t.stock_title}
                   </h2>
                   <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-slate-900 text-white px-10 py-5 rounded-[1.5rem] font-black text-xl hover:bg-black transition-all">
                      {t.stock_add}
                   </button>
                </div>
                <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                   <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                         <tr><th className="px-10 py-6">Product</th><th className="px-10 py-6 text-right">Cost</th><th className="px-10 py-6 text-right">Retail</th><th className="px-10 py-6 text-center">In Stock</th><th className="px-10 py-6 text-center">Action</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-10 py-8 flex items-center gap-6">
                               <div className={`w-14 h-14 rounded-2xl ${p.color || 'bg-slate-200'} flex items-center justify-center font-black text-xl text-white`}>{p.name.charAt(0)}</div>
                               <div><div className="font-black text-slate-800 text-lg leading-tight">{p.name}</div><div className="text-[10px] font-mono text-slate-400 mt-1 uppercase">CODE: {p.code}</div></div>
                            </td>
                            <td className="px-10 py-8 text-right text-slate-400 font-bold">{formatCurrency(p.cost, language)}</td>
                            <td className="px-10 py-8 text-right text-sky-600 font-black text-xl">{formatCurrency(p.price, language)}</td>
                            <td className="px-10 py-8 text-center"><span className={`px-5 py-1.5 rounded-xl text-[10px] font-black uppercase ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}>{p.stock}</span></td>
                            <td className="px-10 py-8 text-center"><button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-3 bg-slate-100 rounded-xl text-slate-400 hover:text-sky-600 transition-all"><Edit size={20}/></button></td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {/* PROMOTIONS - ENSURING THIS IS NOT BLANK */}
          {mode === AppMode.PROMOTIONS && (
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
              <div className="flex justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                <h2 className="text-4xl font-black text-slate-800 flex items-center gap-6">
                   <div className="p-4 bg-sky-100 text-sky-600 rounded-2xl"><Tag size={32} /></div>
                   {t.menu_promotions}
                </h2>
                <button onClick={()=>{setEditingPromo(null); setIsPromoModalOpen(true);}} className="bg-sky-600 text-white px-10 py-5 rounded-[1.5rem] font-black text-xl shadow-xl hover:bg-sky-700 transition-all flex items-center gap-4">
                  <Plus size={24} /> {t.promo_add}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {promotions.map(promo => {
                  const target = products.find(p => p.id === promo.targetProductId);
                  return (
                    <div key={promo.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all border-b-8 border-b-sky-500">
                       <button onClick={() => setPromotions(prev => prev.filter(p => p.id !== promo.id))} className="absolute top-6 right-6 p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={20}/></button>
                       <div className="flex items-center gap-4 mb-6">
                         <div className={`w-14 h-14 rounded-xl ${target?.color || 'bg-slate-100'} flex items-center justify-center font-black text-white text-xl`}>{target?.name.charAt(0) || '!'}</div>
                         <div><h4 className="text-xl font-black text-slate-800">{promo.name}</h4><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{target?.name || 'Unknown'}</p></div>
                       </div>
                       <div className="space-y-2 bg-slate-50 p-4 rounded-2xl">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b pb-2">Wholesale Tiers</p>
                          {promo.tiers.map((tier, idx) => (
                             <div key={idx} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                                <span className="font-bold text-slate-500 text-xs">{tier.minQty}+ ชิ้น</span>
                                <span className="font-black text-sky-600">{formatCurrency(tier.unitPrice, language)}</span>
                             </div>
                          ))}
                       </div>
                    </div>
                  );
                })}
                {promotions.length === 0 && <div className="col-span-full py-24 bg-white rounded-[3rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center opacity-30"><Tag size={80} strokeWidth={1} /><p className="mt-4 font-black uppercase">NO PROMOTIONS ACTIVE</p></div>}
              </div>
            </div>
          )}

          {/* REPORTS */}
          {mode === AppMode.REPORTS && (
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                 <h2 className="text-4xl font-black text-slate-800 flex items-center gap-6">
                   <div className="p-4 bg-sky-100 text-sky-600 rounded-2xl"><BarChart3 size={32} /></div>
                   {t.menu_reports}
                 </h2>
                 <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <Calendar size={20} className="text-slate-400" />
                    <input type="date" value={reportDateRange.start} onChange={e=>setReportDateRange(p=>({...p, start: e.target.value}))} className="bg-transparent font-bold outline-none" />
                    <span className="text-slate-300">→</span>
                    <input type="date" value={reportDateRange.end} onChange={e=>setReportDateRange(p=>({...p, end: e.target.value}))} className="bg-transparent font-bold outline-none" />
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-sky-600 text-white p-10 rounded-[2.5rem] shadow-xl h-56 flex flex-col justify-between">
                  <p className="font-black uppercase tracking-widest text-[10px] opacity-70">Revenue</p>
                  <h3 className="text-5xl font-black">{formatCurrency(metrics.sales, language)}</h3>
                </div>
                <div className="bg-emerald-600 text-white p-10 rounded-[2.5rem] shadow-xl h-56 flex flex-col justify-between">
                  <p className="font-black uppercase tracking-widest text-[10px] opacity-70">Gross Profit</p>
                  <h3 className="text-5xl font-black">{formatCurrency(metrics.profit, language)}</h3>
                </div>
                <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 h-56 flex flex-col justify-between">
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Orders</p>
                  <h3 className="text-5xl font-black text-slate-800">{metrics.count} <span className="text-xl">BILLS</span></h3>
                </div>
              </div>

              <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                 <div className="p-8 border-b font-black text-slate-800 uppercase tracking-widest text-lg flex items-center gap-4">
                    <TrendingUp size={24} className="text-sky-500" /> Top Selling Items
                 </div>
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                       <tr><th className="px-10 py-6">Product Name</th><th className="px-10 py-6 text-center">Qty</th><th className="px-10 py-6 text-right">Revenue</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold">
                       {metrics.topProducts.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                             <td className="px-10 py-6 text-slate-700 text-xl">{p.name}</td>
                             <td className="px-10 py-6 text-center text-slate-400">{p.qty.toLocaleString()}</td>
                             <td className="px-10 py-6 text-right text-sky-600 text-2xl">{formatCurrency(p.revenue, language)}</td>
                          </tr>
                       ))}
                       {metrics.topProducts.length === 0 && <tr><td colSpan={3} className="py-32 text-center text-slate-200 uppercase font-black tracking-widest text-xl">No Data</td></tr>}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* AI */}
          {mode === AppMode.AI && (
            <div className="p-8 h-full max-w-5xl mx-auto flex flex-col animate-in fade-in">
              <div className="bg-white p-8 rounded-t-[2.5rem] border border-slate-200 flex items-center gap-6 shadow-sm">
                 <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl"><Bot size={32} /></div>
                 <div><h2 className="text-2xl font-black text-slate-800">Business Assistant</h2><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Coffee Please AI Power</p></div>
              </div>
              <div className="flex-1 bg-white border-x border-slate-200 overflow-y-auto p-8 space-y-2 custom-scrollbar">
                 {chatMessages.length === 0 && <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-20"><Bot size={100} strokeWidth={0.5}/><p className="mt-4 font-black">ASK ME ANYTHING ABOUT YOUR SALES</p></div>}
                 {chatMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
                 {isAiTyping && <div className="text-[10px] font-black text-slate-300 animate-pulse ml-12">AI IS ANALYZING...</div>}
                 <div ref={chatEndRef} />
              </div>
              <div className="bg-white p-8 rounded-b-[2.5rem] border border-slate-200 shadow-xl">
                 <div className="flex gap-4 bg-slate-50 p-4 rounded-[1.5rem] border-2 border-slate-100">
                    <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAiChat()} placeholder="Ask AI..." className="flex-1 bg-transparent outline-none font-bold text-xl px-4" />
                    <button onClick={handleAiChat} disabled={!chatInput.trim() || isAiTyping} className="p-4 bg-sky-600 text-white rounded-2xl shadow-xl hover:bg-sky-700 disabled:opacity-20 transition-all"><Send size={24}/></button>
                 </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {mode === AppMode.SETTINGS && (
            <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in">
               <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 flex items-center gap-8">
                  <div className="p-5 bg-sky-100 text-sky-600 rounded-2xl"><Settings size={32} /></div>
                  <h2 className="text-4xl font-black text-slate-800 uppercase tracking-tighter">{t.menu_settings}</h2>
               </div>
               
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 space-y-10">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b pb-6">Store Profile</h4>
                     <div className="space-y-6">
                        <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase ml-4">Shop Name</label><input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl outline-none focus:border-sky-500 transition-all" /></div>
                        <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase ml-4">Address</label><textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-lg outline-none h-40 focus:border-sky-500 transition-all resize-none" /></div>
                        <button onClick={() => alert("Saved!")} className="w-full py-6 bg-sky-600 text-white rounded-2xl font-black shadow-2xl shadow-sky-100 uppercase text-xs tracking-[0.3em] flex items-center justify-center gap-4 active:scale-95 transition-all"><Save size={20}/> {t.save}</button>
                     </div>
                  </div>
                  <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 space-y-10">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b pb-6">Bulk Data Tools</h4>
                     <div className="space-y-6">
                        <p className="text-lg font-bold text-slate-500">Manage large inventory data using CSV files.</p>
                        <button onClick={downloadTemplate} className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black flex items-center justify-center gap-5 hover:bg-black transition-all shadow-xl active:scale-95">
                           <Download size={24}/> {t.setting_download_temp}
                        </button>
                        <label className="w-full py-6 bg-emerald-600 text-white rounded-2xl font-black flex items-center justify-center gap-5 hover:bg-emerald-700 transition-all cursor-pointer shadow-xl active:scale-95">
                           <Upload size={24}/> {t.setting_upload}
                           <input type="file" accept=".csv" className="hidden" onChange={importCSV} />
                        </label>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MODALS (BILL / PRODUCT / PROMO) --- */}

      {/* BILL MODAL */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center p-4 backdrop-blur-3xl animate-in zoom-in-95 duration-300">
          <div className="bg-white w-full max-w-7xl h-full rounded-[4rem] shadow-2xl flex flex-col md:flex-row overflow-hidden">
             <div className="w-full md:w-[45%] bg-slate-50/50 border-r border-slate-200 flex flex-col h-full overflow-hidden">
                <div className="p-10 border-b bg-white">
                   <div className="flex justify-between items-center mb-10">
                      <h3 className="text-3xl font-black text-slate-800 flex items-center gap-4">
                        <div className="p-3 bg-sky-500 text-white rounded-2xl shadow-xl shadow-sky-200"><ShoppingCart size={28} /></div>
                        {t.order_create_bill}
                      </h3>
                      <button onClick={()=>setIsBillModalOpen(false)} className="p-4 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={28}/></button>
                   </div>
                   <input value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] font-black text-2xl outline-none focus:ring-8 ring-sky-50 transition-all" placeholder={t.order_cust_name} />
                </div>
                <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar">
                   {billItems.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-6 p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm animate-in slide-in-from-left-20">
                         <div className={`w-16 h-16 rounded-2xl ${it.color || 'bg-slate-200'} flex items-center justify-center font-black text-2xl text-white shadow-xl`}>{it.name.charAt(0)}</div>
                         <div className="flex-1 min-w-0">
                            <div className="text-xl font-black text-slate-800 truncate">{it.name}</div>
                            <div className="text-md font-black text-sky-600 mt-1">{formatCurrency(it.price, language)}</div>
                         </div>
                         <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-[1.2rem] border border-slate-200">
                            <button onClick={()=>setBillItems(p=>p.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))} className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow hover:text-sky-600 transition-all"><Minus size={18}/></button>
                            <span className="w-10 text-center font-black text-2xl">{it.quantity}</span>
                            <button onClick={()=>setBillItems(p=>p.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))} className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow hover:text-sky-600 transition-all"><Plus size={18}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter((_, i)=>i!==idx))} className="p-3 text-rose-300 hover:text-rose-600 transition-all"><Trash2 size={24}/></button>
                      </div>
                   ))}
                </div>
                <div className="p-10 border-t bg-white space-y-8">
                   <div className="flex justify-between items-center px-6">
                      <span className="font-black text-slate-400 uppercase text-[10px] tracking-widest">SUBTOTAL</span>
                      <span className="text-3xl font-black text-slate-800">{formatCurrency(billItems.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span>
                   </div>
                   <div className="flex justify-between items-center px-8 py-5 bg-rose-50 rounded-[2rem] border border-rose-100">
                      <span className="text-xs font-black text-rose-500 uppercase tracking-widest flex items-center gap-2"><Tag size={18}/> DISCOUNT</span>
                      <input type="number" className="w-32 bg-white border-2 border-rose-100 rounded-xl px-5 py-3 text-right font-black text-3xl text-rose-600 outline-none" value={billDiscount} onChange={e=>setBillDiscount(Number(e.target.value))} />
                   </div>
                   <div className="flex justify-between items-end px-6 pt-4">
                      <span className="font-black text-slate-800 text-2xl uppercase tracking-[0.2em] mb-4">NET</span>
                      <div className="text-right">
                         <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-1">TOTAL PAYABLE</span>
                         <span className="text-8xl font-black text-sky-600 leading-[0.8] tracking-tighter drop-shadow-2xl">{formatCurrency(Math.max(0, billItems.reduce((s,i)=>s+(i.price*i.quantity),0) - billDiscount), language).split(" ")[0]}</span>
                      </div>
                   </div>
                   <button onClick={saveOrder} disabled={billItems.length === 0} className="w-full py-8 bg-sky-600 text-white rounded-[2.5rem] font-black text-3xl shadow-2xl hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-10 uppercase tracking-[0.4em]">Pay Now</button>
                </div>
             </div>
             <div className="flex-1 p-10 flex flex-col bg-white overflow-hidden h-full">
                <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                   <div><h4 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Inventory</h4><p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Select products to add</p></div>
                   <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-[1.5rem] border-2 border-slate-100 w-full max-w-md focus-within:border-sky-500 transition-all">
                      <Search className="text-slate-300" size={24} />
                      <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="bg-transparent outline-none flex-1 font-black text-xl" />
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pr-4 custom-scrollbar">
                   {products.filter(p => !skuSearch || p.code.toLowerCase().includes(skuSearch.toLowerCase()) || p.name.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => setBillItems(prev => {
                        const exist = prev.find(i => i.id === p.id);
                        const nQty = exist ? exist.quantity + 1 : 1;
                        const nPrice = getProductPrice(p, nQty);
                        return exist ? prev.map(i => i.id === p.id ? {...i, quantity: nQty, price: nPrice} : i) : [...prev, {...p, quantity: 1, price: nPrice}];
                      })} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:border-sky-500 hover:shadow-2xl hover:-translate-y-2 transition-all flex flex-col group text-left h-full active:scale-95">
                        <div className={`w-full aspect-square rounded-[2rem] ${p.color || 'bg-slate-200'} mb-6 flex items-center justify-center text-6xl font-black text-white shadow-2xl group-hover:scale-105 transition-all duration-500`}>{p.name.charAt(0)}</div>
                        <h4 className="font-black text-slate-800 text-lg leading-tight mb-1 truncate">{p.name}</h4>
                        <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-6">SKU: {p.code}</div>
                        <div className="mt-auto pt-4 border-t border-slate-50 flex justify-between items-center">
                            <span className="text-sky-600 font-black text-2xl tracking-tighter">{formatCurrency(p.price, language).split(" ")[0]}</span>
                            <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-50 text-emerald-600'}`}>{p.stock}</span>
                        </div>
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* PROMOTION MODAL */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-in zoom-in-95">
          <div className="bg-white rounded-[4rem] w-full max-w-2xl p-12 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-3xl font-black mb-10 text-slate-800 uppercase tracking-tighter flex items-center gap-5 border-b pb-10">
               <div className="p-4 bg-sky-500 text-white rounded-2xl shadow-xl"><Tag size={28} /></div>
               {t.promo_tier_title}
            </h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const tiers: PromoTier[] = [];
              for(let i=1; i<=7; i++) {
                const q = fd.get(`qty_${i}`); const pr = fd.get(`price_${i}`);
                if (q && pr && Number(q) > 0) tiers.push({ minQty: Number(q), unitPrice: Number(pr) });
              }
              const p: Promotion = { 
                id: editingPromo?.id || uuidv4(), 
                name: fd.get('name') as string, 
                targetProductId: fd.get('productId') as string, 
                isActive: true, tiers 
              };
              setPromotions(prev => [...prev.filter(x => x.id !== p.id), p]); 
              if (isCloudActive && db) setDoc(doc(db, 'promotions', p.id), p);
              setIsPromoModalOpen(false);
            }} className="space-y-10">
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Select Product</label>
                 <select name="productId" required defaultValue={editingPromo?.targetProductId} className="w-full p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] font-black text-xl outline-none focus:border-sky-500 transition-all">
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} (SKU: {p.code})</option>)}
                 </select>
              </div>
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Promo Name</label>
                 <input name="name" required defaultValue={editingPromo?.name} className="w-full p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] font-black text-xl outline-none focus:border-sky-500 transition-all" />
              </div>
              <div className="space-y-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-4 ml-4">Pricing Tiers (Min Qty / Unit Price)</p>
                <div className="grid grid-cols-1 gap-4">
                  {[1,2,3,4,5,6,7].map(n => (
                    <div key={n} className="grid grid-cols-2 gap-4 items-center bg-slate-50/50 p-4 rounded-2xl">
                      <input name={`qty_${n}`} type="number" placeholder="Min Qty" defaultValue={editingPromo?.tiers[n-1]?.minQty} className="w-full p-4 bg-white border border-slate-200 rounded-xl font-black" />
                      <input name={`price_${n}`} type="number" placeholder="Unit Price" defaultValue={editingPromo?.tiers[n-1]?.unitPrice} className="w-full p-4 bg-sky-50 border border-sky-100 rounded-xl font-black text-sky-600" />
                    </div>
                  ))}
                </div>
              </div>
              <button type="submit" className="w-full py-8 bg-sky-600 text-white rounded-[2rem] font-black text-3xl shadow-2xl uppercase tracking-[0.4em] active:scale-95 transition-all">Save Promo</button>
            </form>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-in zoom-in-95">
          <div className="bg-white rounded-[4rem] w-full max-w-xl p-12 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-3xl font-black mb-10 text-slate-800 flex items-center gap-6 border-b pb-10">
              <div className="p-4 bg-sky-500 text-white rounded-2xl shadow-xl"><Package size={28} /></div> 
              {editingProduct ? 'Edit Product' : 'Add Product'}
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
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] font-black text-xl outline-none" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">SKU Code</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] font-black text-xl outline-none" /></div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Cost</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] font-black text-xl outline-none" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Retail</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-6 bg-sky-50 border-4 border-sky-100 rounded-[1.5rem] font-black text-sky-600 text-2xl outline-none" /></div>
              </div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Initial Stock</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-6 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] font-black text-xl outline-none" /></div>
              <div className="flex gap-6 pt-6">
                 <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-6 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black uppercase text-xs tracking-[0.3em] active:scale-95 transition-all">Cancel</button>
                 <button type="submit" className="flex-[2] py-6 bg-sky-600 text-white rounded-[1.5rem] font-black text-2xl shadow-2xl uppercase tracking-[0.3em] active:scale-95 transition-all">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
