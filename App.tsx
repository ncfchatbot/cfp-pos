
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

  // Core Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : INITIAL_PROFILE;
  });

  // AI Chat States
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reporting/Date Range
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const [reportDateRange, setReportDateRange] = useState({ start: currentMonthStart, end: currentMonthEnd });

  // UI Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  
  // Cart State
  const [billItems, setBillItems] = useState<CartItem[]>([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [skuSearch, setSkuSearch] = useState('');
  const [customerName, setCustomerName] = useState('');

  const t = translations[language];

  // Logic: Sync with LocalStorage/Cloud
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

  // Calculations: Pricing with 7-Tier wholesale support
  const getProductEffectivePrice = (product: Product, quantity: number) => {
    const promo = promotions.find(p => p.targetProductId === product.id && p.isActive);
    if (!promo || !promo.tiers || promo.tiers.length === 0) return product.price;
    
    // Find the highest applicable tier
    const sortedTiers = [...promo.tiers].sort((a, b) => b.minQty - a.minQty);
    const applicableTier = sortedTiers.find(t => quantity >= t.minQty);
    
    return applicableTier ? applicableTier.unitPrice : product.price;
  };

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

  // Bulk Tools: CSV Import/Export
  const handleDownloadTemplate = () => {
    const headers = ["SKU", "ProductName", "CostPrice", "RetailPrice", "Stock"];
    const example = ["COF-001", "Hot Latte", "12000", "25000", "50"];
    const csvContent = "\uFEFF" + [headers, example].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "CoffeePlease_Inventory_Template.csv";
    link.click();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          category: "Imported",
          color: COLORS[Math.floor(Math.random() * COLORS.length)] + " text-white"
        };
      }).filter(p => p !== null) as Product[];
      setProducts(prev => [...prev, ...newItems]);
      alert(`Successfully imported ${newItems.length} products!`);
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
      customerName: customerName || 'General Customer'
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

  // AI Chat Logic
  const handleAiChat = async () => {
    if (!chatInput.trim() || isAiTyping) return;
    const userMsg: Message = { id: uuidv4(), role: Role.USER, text: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsAiTyping(true);

    try {
      const history = chatMessages.map(m => ({
        role: m.role === Role.USER ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));
      
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
      setChatMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: 'ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI', timestamp: Date.now(), isError: true }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [chatMessages]);

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={() => {}} language={language} setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          
          {/* 1. DASHBOARD */}
          {mode === AppMode.DASHBOARD && (
            <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
              <div className="bg-white p-12 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute -bottom-10 -left-10 opacity-[0.03] scale-150"><Coffee size={300} /></div>
                <div className="w-24 h-24 bg-sky-500 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-sky-200 mb-8 animate-bounce-slow">
                  <Coffee size={48} />
                </div>
                <h2 className="text-5xl font-black text-slate-800 tracking-tighter">Coffee Please</h2>
                <div className="mt-4 px-8 py-2.5 bg-slate-100 rounded-full text-slate-400 font-black uppercase tracking-[0.3em] text-[10px]">
                  {t.dash_title} • {now.toLocaleDateString(language, { month: 'long', year: 'numeric' })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: t.dash_sales, val: metrics.sales, color: 'sky', icon: TrendingUp },
                  { label: t.report_profit, val: metrics.profit, color: 'emerald', icon: CheckCircle2 },
                  { label: t.dash_pending, val: metrics.count, unit: 'Bills', color: 'rose', icon: ClipboardList },
                  { label: t.dash_stock_cost, val: metrics.stockValue, color: 'amber', icon: Package },
                ].map((item, i) => (
                  <div key={i} className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 border-b-[12px] border-b-slate-100 flex flex-col justify-between h-60 hover:border-b-sky-500 hover:-translate-y-2 transition-all duration-300 group">
                    <div className="flex justify-between items-start">
                      <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.2em]">{item.label}</p>
                      <div className={`p-4 rounded-2xl bg-${item.color}-50 text-${item.color}-500 group-hover:scale-110 transition-transform`}><item.icon size={24} /></div>
                    </div>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
                      {item.unit ? `${item.val} ${item.unit}` : formatCurrency(item.val, language)}
                    </h3>
                  </div>
                ))}
              </div>

              <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                 <h4 className="text-2xl font-black text-slate-800 mb-10 flex items-center gap-5 border-b pb-8">
                   <div className="p-4 bg-rose-100 text-rose-500 rounded-3xl"><Package size={28} /></div>
                   {t.dash_low_stock}
                 </h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {metrics.lowStock.map(p => (
                       <div key={p.id} className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 flex justify-between items-center group hover:bg-white hover:shadow-2xl transition-all">
                          <div>
                            <div className="font-black text-slate-800 text-2xl leading-tight">{p.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">SKU: {p.code}</div>
                          </div>
                          <div className="bg-rose-500 text-white w-16 h-16 rounded-2xl flex items-center justify-center font-black text-3xl shadow-xl shadow-rose-100">{p.stock}</div>
                       </div>
                    ))}
                    {metrics.lowStock.length === 0 && <div className="col-span-full py-20 text-center text-slate-200 font-black uppercase tracking-[0.5em] text-xl">สต็อกสินค้าปกติ</div>}
                 </div>
              </div>
            </div>
          )}

          {/* 2. ORDERS */}
          {mode === AppMode.ORDERS && (
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
              <div className="flex justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                <h2 className="text-4xl font-black text-slate-800 flex items-center gap-6">
                   <div className="p-5 bg-sky-100 text-sky-600 rounded-3xl"><ClipboardList size={32} /></div>
                   {t.menu_orders}
                </h2>
                <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-12 py-6 rounded-[2rem] font-black text-2xl shadow-2xl shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 flex items-center gap-4">
                  <Plus size={28} /> {t.order_create_bill}
                </button>
              </div>

              <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                       <tr><th className="px-12 py-8">ORDER ID / TIME</th><th className="px-12 py-8">CUSTOMER</th><th className="px-12 py-8 text-right">TOTAL AMOUNT</th><th className="px-12 py-8 text-center">STATUS</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {recentSales.map(s => (
                         <tr key={s.id} className="hover:bg-slate-50/50 transition-all group">
                            <td className="px-12 py-10 font-mono text-[10px] text-slate-300 group-hover:text-sky-500 transition-colors">#{s.id.substr(0,12)}<div className="mt-2 text-slate-800 font-black text-xl">{s.date}</div></td>
                            <td className="px-12 py-10 font-black text-slate-700 text-2xl">{s.customerName}</td>
                            <td className="px-12 py-10 text-right font-black text-3xl text-sky-600">{formatCurrency(s.total, language)}</td>
                            <td className="px-12 py-10 text-center">
                               <span className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] bg-emerald-500 text-white shadow-lg shadow-emerald-100">{t.pay_paid}</span>
                            </td>
                         </tr>
                       ))}
                       {recentSales.length === 0 && <tr><td colSpan={4} className="py-40 text-center text-slate-200 font-black uppercase tracking-[0.5em] text-2xl">ยังไม่มีรายการขาย</td></tr>}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* 3. STOCK */}
          {mode === AppMode.STOCK && (
             <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
                <div className="flex justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                   <h2 className="text-4xl font-black text-slate-800 flex items-center gap-6">
                      <div className="p-5 bg-sky-100 text-sky-600 rounded-3xl"><Package size={32} /></div>
                      {t.stock_title}
                   </h2>
                   <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-slate-900 text-white px-12 py-6 rounded-[2rem] font-black text-2xl shadow-2xl hover:bg-black transition-all active:scale-95">
                      {t.stock_add}
                   </button>
                </div>
                <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                   <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                         <tr><th className="px-12 py-8">PRODUCT DETAILS</th><th className="px-12 py-8 text-right">COST</th><th className="px-12 py-8 text-right">RETAIL PRICE</th><th className="px-12 py-8 text-center">STOCK</th><th className="px-12 py-8 text-center">ACTIONS</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-12 py-10 flex items-center gap-10">
                               <div className={`w-20 h-20 rounded-[1.5rem] ${p.color || 'bg-slate-200'} flex items-center justify-center font-black text-3xl text-white shadow-2xl shadow-slate-200`}>{p.name.charAt(0)}</div>
                               <div><div className="font-black text-slate-800 text-2xl leading-tight">{p.name}</div><div className="text-[10px] font-mono text-slate-400 uppercase tracking-[0.4em] mt-3">CODE: {p.code}</div></div>
                            </td>
                            <td className="px-12 py-10 text-right text-slate-400 font-black text-xl">{formatCurrency(p.cost, language)}</td>
                            <td className="px-12 py-10 text-right text-sky-600 font-black text-3xl">{formatCurrency(p.price, language)}</td>
                            <td className="px-12 py-10 text-center"><span className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] ${p.stock <= 5 ? 'bg-rose-500 text-white shadow-rose-100' : 'bg-emerald-500 text-white shadow-emerald-100'} shadow-xl`}>{p.stock} Unit</span></td>
                            <td className="px-12 py-10 text-center">
                              <button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-5 bg-slate-100 rounded-3xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-all"><Edit size={28}/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {/* 4. PROMOTIONS - THE MISSING SECTION */}
          {mode === AppMode.PROMOTIONS && (
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
              <div className="flex justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                <h2 className="text-4xl font-black text-slate-800 flex items-center gap-6">
                   <div className="p-5 bg-sky-100 text-sky-600 rounded-3xl"><Tag size={32} /></div>
                   {t.menu_promotions}
                </h2>
                <button onClick={()=>{setEditingPromo(null); setIsPromoModalOpen(true);}} className="bg-sky-600 text-white px-12 py-6 rounded-[2rem] font-black text-2xl shadow-2xl shadow-sky-100 hover:bg-sky-700 transition-all flex items-center gap-4">
                  <Plus size={28} /> {t.promo_add}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {promotions.map(promo => {
                  const targetProduct = products.find(p => p.id === promo.targetProductId);
                  return (
                    <div key={promo.id} className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-2xl transition-all border-b-[15px] border-b-sky-500">
                       <button onClick={() => setPromotions(prev => prev.filter(p => p.id !== promo.id))} className="absolute top-8 right-8 p-3 text-slate-200 hover:text-rose-500 transition-colors"><Trash2 size={24}/></button>
                       <div className="flex items-center gap-6 mb-8">
                         <div className={`w-16 h-16 rounded-2xl ${targetProduct?.color || 'bg-slate-100'} flex items-center justify-center font-black text-white text-2xl`}>{targetProduct?.name.charAt(0) || '!'}</div>
                         <div>
                            <h4 className="text-2xl font-black text-slate-800">{promo.name}</h4>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{targetProduct?.name || 'Unknown Product'}</p>
                         </div>
                       </div>
                       <div className="space-y-3">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">7 Tiers Wholesale Pricing</p>
                          {promo.tiers.map((tier, idx) => (
                             <div key={idx} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
                                <span className="font-bold text-slate-500 text-sm">{tier.minQty}+ ชิ้น</span>
                                <span className="font-black text-sky-600 text-lg">{formatCurrency(tier.unitPrice, language)}</span>
                             </div>
                          ))}
                       </div>
                    </div>
                  );
                })}
                {promotions.length === 0 && (
                   <div className="col-span-full py-40 bg-white rounded-[3rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center opacity-50">
                      <Tag size={120} strokeWidth={0.5} className="mb-8" />
                      <p className="text-2xl font-black uppercase tracking-[0.5em]">ยังไม่มีโปรโมชั่นขายส่ง</p>
                   </div>
                )}
              </div>
            </div>
          )}

          {/* 5. REPORTS */}
          {mode === AppMode.REPORTS && (
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                 <h2 className="text-4xl font-black text-slate-800 flex items-center gap-6">
                   <div className="p-5 bg-sky-100 text-sky-600 rounded-3xl"><BarChart3 size={32} /></div>
                   {t.menu_reports}
                 </h2>
                 <div className="flex items-center gap-6 bg-slate-50 p-5 rounded-[2rem] border border-slate-200">
                    <Calendar size={24} className="text-slate-400" />
                    <input type="date" value={reportDateRange.start} onChange={e=>setReportDateRange(p=>({...p, start: e.target.value}))} className="bg-transparent font-black outline-none text-xl" />
                    <span className="text-slate-300 font-black">→</span>
                    <input type="date" value={reportDateRange.end} onChange={e=>setReportDateRange(p=>({...p, end: e.target.value}))} className="bg-transparent font-black outline-none text-xl" />
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="bg-sky-600 text-white p-12 rounded-[3.5rem] shadow-2xl flex flex-col justify-between h-64">
                  <p className="font-black uppercase tracking-[0.4em] text-[10px] opacity-70">Total Revenue</p>
                  <h3 className="text-6xl font-black tracking-tighter">{formatCurrency(metrics.sales, language)}</h3>
                </div>
                <div className="bg-emerald-600 text-white p-12 rounded-[3.5rem] shadow-2xl flex flex-col justify-between h-64">
                  <p className="font-black uppercase tracking-[0.4em] text-[10px] opacity-70">Gross Profit</p>
                  <h3 className="text-6xl font-black tracking-tighter">{formatCurrency(metrics.profit, language)}</h3>
                </div>
                <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-200 flex flex-col justify-between h-64">
                  <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px]">Total Orders</p>
                  <h3 className="text-6xl font-black text-slate-800 tracking-tighter">{metrics.count} <span className="text-2xl">BILLS</span></h3>
                </div>
              </div>

              <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                 <div className="p-12 border-b flex items-center justify-between">
                    <h4 className="font-black text-slate-800 uppercase tracking-[0.3em] text-xl flex items-center gap-5">
                      <TrendingUp size={28} className="text-sky-500" /> 10 อันดับสินค้าขายดีที่สุด
                    </h4>
                 </div>
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                       <tr><th className="px-12 py-8">PRODUCT NAME</th><th className="px-12 py-8 text-center">QTY SOLD</th><th className="px-12 py-8 text-right">TOTAL REVENUE</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold">
                       {metrics.topProducts.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-12 py-10 text-slate-700 text-2xl">{p.name}</td>
                             <td className="px-12 py-10 text-center text-slate-400">{p.qty.toLocaleString()} <span className="text-xs uppercase ml-2 tracking-widest">Units</span></td>
                             <td className="px-12 py-10 text-right text-sky-600 text-3xl">{formatCurrency(p.revenue, language)}</td>
                          </tr>
                       ))}
                       {metrics.topProducts.length === 0 && <tr><td colSpan={3} className="py-40 text-center text-slate-200 uppercase font-black tracking-[0.5em] text-2xl">ไม่มีข้อมูล</td></tr>}
                    </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* 6. AI ASSISTANT */}
          {mode === AppMode.AI && (
            <div className="p-8 h-full max-w-5xl mx-auto flex flex-col animate-in fade-in">
              <div className="bg-white p-10 rounded-t-[3rem] border border-slate-200 flex items-center gap-6 shadow-sm">
                 <div className="w-16 h-16 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-sky-100">
                    <Bot size={32} />
                 </div>
                 <div>
                    <h2 className="text-3xl font-black text-slate-800">ผู้ช่วย AI อัจฉริยะ</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Coffee Please Smart Business Assistant</p>
                 </div>
              </div>
              <div className="flex-1 bg-white border-x border-slate-200 overflow-y-auto p-10 space-y-2 custom-scrollbar">
                 {chatMessages.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-20">
                      <Bot size={120} strokeWidth={0.5} className="mb-8" />
                      <p className="text-2xl font-black uppercase tracking-[0.3em]">ถาม AI เกี่ยวกับการขายและสต็อกสิ!</p>
                   </div>
                 )}
                 {chatMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
                 {isAiTyping && (
                   <div className="flex items-center gap-4 text-slate-400 animate-pulse font-black text-xs uppercase tracking-widest ml-12">
                      <Bot size={16} /> AI กำลังวิเคราะห์ข้อมูล...
                   </div>
                 )}
                 <div ref={chatEndRef} />
              </div>
              <div className="bg-white p-10 rounded-b-[3rem] border border-slate-200 shadow-xl">
                 <div className="flex gap-6 bg-slate-50 p-4 rounded-[2rem] border-2 border-slate-100 focus-within:border-sky-500 transition-all">
                    <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAiChat()} placeholder="ถามคำถามที่นี่..." className="flex-1 bg-transparent outline-none font-black text-xl px-4" />
                    <button onClick={handleAiChat} disabled={!chatInput.trim() || isAiTyping} className="p-5 bg-sky-600 text-white rounded-[1.5rem] shadow-xl hover:bg-sky-700 disabled:opacity-20 active:scale-95 transition-all"><Send size={24}/></button>
                 </div>
              </div>
            </div>
          )}

          {/* 7. SETTINGS */}
          {mode === AppMode.SETTINGS && (
            <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in">
               <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 flex items-center gap-8">
                  <div className="p-6 bg-sky-100 text-sky-600 rounded-[2rem] shadow-inner"><Settings size={40} /></div>
                  <h2 className="text-4xl font-black text-slate-800 uppercase tracking-tighter">{t.menu_settings}</h2>
               </div>
               
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-200 space-y-12">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] border-b pb-8 flex items-center gap-4"><Users size={20} /> Store Profile Information</h4>
                     <div className="space-y-8">
                        <div className="space-y-3"><label className="text-[11px] font-black text-slate-400 uppercase ml-6 tracking-widest">Shop Branding Name</label><input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[2rem] font-black text-2xl outline-none focus:border-sky-500 focus:ring-8 ring-sky-50 transition-all shadow-inner" /></div>
                        <div className="space-y-3"><label className="text-[11px] font-black text-slate-400 uppercase ml-6 tracking-widest">Full Business Address</label><textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-8 bg-slate-50 border border-slate-200 rounded-[2rem] font-bold text-xl outline-none h-48 focus:border-sky-500 transition-all resize-none shadow-inner" /></div>
                        <button onClick={() => alert("บันทึกข้อมูลสำเร็จ!")} className="w-full py-8 bg-sky-600 text-white rounded-[2rem] font-black shadow-2xl shadow-sky-100 uppercase text-xs tracking-[0.4em] flex items-center justify-center gap-4 active:scale-95 transition-all"><Save size={24}/> {t.save}</button>
                     </div>
                  </div>
                  <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-200 space-y-12">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] border-b pb-8 flex items-center gap-4"><PieChart size={20} /> Bulk Management Tools</h4>
                     <div className="space-y-8">
                        <p className="text-xl font-bold text-slate-500 leading-relaxed">ใช้ระบบจัดการสินค้าจำนวนมากด้วยไฟล์ CSV เพื่อความรวดเร็วในการตั้งค่าสต็อก</p>
                        <button onClick={handleDownloadTemplate} className="w-full py-8 bg-slate-900 text-white rounded-[2rem] font-black flex items-center justify-center gap-6 hover:bg-black transition-all shadow-2xl active:scale-95">
                           <Download size={28}/> {t.setting_download_temp}
                        </button>
                        <label className="w-full py-8 bg-emerald-600 text-white rounded-[2rem] font-black flex items-center justify-center gap-6 hover:bg-emerald-700 transition-all cursor-pointer shadow-2xl active:scale-95">
                           <Upload size={28}/> {t.setting_upload}
                           <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
                        </label>
                        <div className="pt-10 border-t border-slate-100">
                           <p className="text-[10px] text-slate-300 font-black uppercase text-center tracking-[0.5em]">V3.0 Final Stable Production</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MODALS --- */}

      {/* BILL MODAL (CREATE ORDER) */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center p-4 md:p-12 backdrop-blur-3xl animate-in zoom-in-95 duration-500">
          <div className="bg-white w-full max-w-7xl h-full rounded-[4rem] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/20">
             <div className="w-full md:w-[45%] bg-slate-50/50 border-r border-slate-200 flex flex-col h-full overflow-hidden">
                <div className="p-12 border-b bg-white">
                   <div className="flex justify-between items-center mb-12">
                      <h3 className="text-4xl font-black text-slate-800 flex items-center gap-5">
                        <div className="p-4 bg-sky-500 text-white rounded-3xl shadow-2xl shadow-sky-200"><ShoppingCart size={32} /></div>
                        {t.order_create_bill}
                      </h3>
                      <button onClick={()=>setIsBillModalOpen(false)} className="p-5 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={32}/></button>
                   </div>
                   <input value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full p-7 bg-slate-50 border-2 border-slate-200 rounded-[2rem] font-black text-2xl outline-none focus:ring-12 ring-sky-50 transition-all" placeholder={t.order_cust_name} />
                </div>
                <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                   {billItems.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-8 p-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm animate-in slide-in-from-left-20">
                         <div className={`w-20 h-20 rounded-2xl ${it.color || 'bg-slate-200'} flex items-center justify-center font-black text-3xl text-white shadow-xl`}>{it.name.charAt(0)}</div>
                         <div className="flex-1 min-w-0">
                            <div className="text-2xl font-black text-slate-800 truncate">{it.name}</div>
                            <div className="text-lg font-black text-sky-600 mt-2">{formatCurrency(it.price, language)}</div>
                         </div>
                         <div className="flex items-center gap-6 bg-slate-50 p-3 rounded-[1.5rem] border border-slate-200">
                            <button onClick={()=>setBillItems(p=>p.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))} className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-md hover:text-sky-600 transition-all active:scale-90"><Minus size={24}/></button>
                            <input type="number" className="w-16 bg-transparent text-center font-black text-3xl outline-none" value={it.quantity} onChange={(e) => {
                                const v = parseInt(e.target.value) || 1;
                                setBillItems(prev => prev.map((i, ix) => ix === idx ? { ...i, quantity: Math.max(1, v) } : i));
                              }}
                            />
                            <button onClick={()=>setBillItems(p=>p.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))} className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-md hover:text-sky-600 transition-all active:scale-90"><Plus size={24}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter((_, i)=>i!==idx))} className="p-4 text-rose-300 hover:text-rose-600 transition-all"><Trash2 size={28}/></button>
                      </div>
                   ))}
                </div>
                <div className="p-12 border-t bg-white space-y-10">
                   <div className="flex justify-between items-center px-8 font-black text-slate-400 uppercase text-[12px] tracking-[0.4em]"><span>Subtotal</span><span className="text-4xl font-black text-slate-800 tracking-tighter">{formatCurrency(billItems.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span></div>
                   <div className="flex justify-between items-center px-10 py-8 bg-rose-50 rounded-[2.5rem] border border-rose-100 shadow-inner">
                      <span className="text-sm font-black text-rose-500 uppercase tracking-widest flex items-center gap-3"><Tag size={20}/> DISCOUNT</span>
                      <input type="number" className="w-48 bg-white border-4 border-rose-100 rounded-3xl px-8 py-5 text-right font-black text-4xl text-rose-600 outline-none focus:border-rose-500 transition-all" value={billDiscount} onChange={e=>setBillDiscount(Number(e.target.value))} />
                   </div>
                   <div className="flex justify-between items-end px-8">
                      <span className="font-black text-slate-800 text-3xl uppercase tracking-[0.2em] mb-6">Total Net</span>
                      <div className="text-right">
                         <span className="text-[11px] font-black text-slate-300 uppercase tracking-[0.4em] block mb-2">AMOUNT TO PAY</span>
                         <span className="text-[9rem] font-black text-sky-600 leading-[0.8] tracking-tighter drop-shadow-2xl">{formatCurrency(Math.max(0, billItems.reduce((s,i)=>s+(i.price*i.quantity),0) - billDiscount), language).split(" ")[0]}</span>
                      </div>
                   </div>
                   <button onClick={saveOrder} disabled={billItems.length === 0} className="w-full py-10 bg-sky-600 text-white rounded-[3rem] font-black text-4xl shadow-2xl shadow-sky-200 hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-10 uppercase tracking-[0.5em]">Finish Sale</button>
                </div>
             </div>
             <div className="flex-1 p-12 flex flex-col relative bg-white overflow-hidden h-full">
                <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-10">
                   <div>
                      <h4 className="text-3xl font-black text-slate-800 uppercase tracking-tight mb-3">Product Menu</h4>
                      <p className="text-slate-400 font-black uppercase text-[11px] tracking-[0.4em]">Browse and select items to sell</p>
                   </div>
                   <div className="flex items-center gap-8 bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-inner w-full max-w-xl focus-within:border-sky-500 focus-within:ring-12 ring-sky-50 transition-all">
                      <Search className="text-slate-300" size={32} />
                      <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="bg-transparent outline-none flex-1 font-black text-3xl" />
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10 pr-6 custom-scrollbar">
                   {products.filter(p => !skuSearch || p.code.toLowerCase().includes(skuSearch.toLowerCase()) || p.name.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => setBillItems(prev => {
                        const exist = prev.find(i => i.id === p.id);
                        const newQty = exist ? exist.quantity + 1 : 1;
                        const price = getProductEffectivePrice(p, newQty);
                        return exist ? prev.map(i => i.id === p.id ? {...i, quantity: newQty, price} : i) : [...prev, {...p, quantity: 1, price}];
                      })} className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm hover:border-sky-500 hover:shadow-2xl hover:-translate-y-4 transition-all flex flex-col group text-left h-full active:scale-95">
                        <div className={`w-full aspect-square rounded-[2.5rem] ${p.color || 'bg-slate-200'} mb-8 flex items-center justify-center text-8xl font-black text-white shadow-2xl shadow-slate-200 group-hover:scale-105 transition-all duration-500`}>
                           {p.name.charAt(0)}
                        </div>
                        <h4 className="font-black text-slate-800 text-2xl leading-tight mb-3 truncate">{p.name}</h4>
                        <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] mb-8">SKU: {p.code}</div>
                        <div className="mt-auto pt-8 border-t border-slate-50 flex justify-between items-center">
                            <span className="text-sky-600 font-black text-4xl tracking-tighter">{formatCurrency(p.price, language).split(" ")[0]}</span>
                            <span className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-50 text-emerald-600'}`}>{p.stock}</span>
                        </div>
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* PROMOTION EDIT MODAL */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-in zoom-in-95">
          <div className="bg-white rounded-[4rem] w-full max-w-2xl p-16 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-4xl font-black mb-12 text-slate-800 uppercase tracking-tighter flex items-center gap-6 border-b pb-12">
               <div className="p-4 bg-sky-500 text-white rounded-3xl shadow-xl"><Tag size={32} /></div>
               {t.promo_tier_title}
            </h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const tiers: PromoTier[] = [];
              for(let i=1; i<=7; i++) {
                const qty = fd.get(`qty_${i}`); const price = fd.get(`price_${i}`);
                if (qty && price && Number(qty) > 0) tiers.push({ minQty: Number(qty), unitPrice: Number(price) });
              }
              const p: Promotion = { 
                id: editingPromo?.id || uuidv4(), 
                name: fd.get('name') as string, 
                targetProductId: fd.get('productId') as string, 
                isActive: true, 
                tiers 
              };
              setPromotions(prev => [...prev.filter(x => x.id !== p.id), p]); 
              if (isCloudActive && db) setDoc(doc(db, 'promotions', p.id), p);
              setIsPromoModalOpen(false);
            }} className="space-y-12">
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] ml-6">เลือกสินค้าสำหรับโปรโมชั่น</label>
                 <select name="productId" required defaultValue={editingPromo?.targetProductId} className="w-full p-7 bg-slate-50 border-2 border-slate-200 rounded-[2rem] font-black text-2xl outline-none focus:border-sky-500 transition-all">
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} (SKU: {p.code})</option>)}
                 </select>
              </div>
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] ml-6">ชื่อโปรโมชั่น</label>
                 <input name="name" placeholder="เช่น โปรโมชั่นกาแฟยกลัง" required defaultValue={editingPromo?.name} className="w-full p-7 bg-slate-50 border-2 border-slate-200 rounded-[2rem] font-black text-2xl outline-none focus:border-sky-500 transition-all shadow-inner" />
              </div>
              <div className="space-y-8">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] border-b pb-4 ml-6">กำหนดราคาขายส่ง 7 ระดับ</p>
                <div className="grid grid-cols-1 gap-5">
                  {[1,2,3,4,5,6,7].map(n => (
                    <div key={n} className="grid grid-cols-2 gap-6 items-center bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100">
                      <div className="relative"><span className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase">QTY {n}</span><input name={`qty_${n}`} type="number" placeholder="ชิ้นขึ้นไป" defaultValue={editingPromo?.tiers[n-1]?.minQty} className="w-full pl-24 pr-6 py-5 bg-white border-2 border-slate-200 rounded-2xl font-black text-2xl outline-none focus:border-sky-500" /></div>
                      <div className="relative"><span className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-sky-400 uppercase">PRICE</span><input name={`price_${n}`} type="number" placeholder="ราคา/หน่วย" defaultValue={editingPromo?.tiers[n-1]?.unitPrice} className="w-full pl-24 pr-6 py-5 bg-sky-50 border-2 border-sky-100 rounded-2xl font-black text-3xl text-sky-600 outline-none focus:border-sky-500" /></div>
                    </div>
                  ))}
                </div>
              </div>
              <button type="submit" className="w-full py-10 bg-sky-600 text-white rounded-[3rem] font-black text-4xl shadow-2xl uppercase tracking-[0.5em] active:scale-95 transition-all">Save Promotion</button>
            </form>
          </div>
        </div>
      )}

      {/* PRODUCT EDIT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-in zoom-in-95">
          <div className="bg-white rounded-[4rem] w-full max-w-2xl p-16 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-4xl font-black mb-12 text-slate-800 flex items-center gap-6 border-b pb-12">
              <div className="p-4 bg-sky-500 text-white rounded-3xl shadow-xl"><Package size={32} /></div> 
              {editingProduct ? 'Edit Inventory Item' : 'Register New Item'}
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
            }} className="space-y-10">
              <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-6">Product Display Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-7 bg-slate-50 border-2 border-slate-200 rounded-[2rem] font-black text-3xl outline-none focus:border-sky-500 transition-all" /></div>
              <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-6">Unique SKU / Product Code</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-7 bg-slate-50 border-2 border-slate-200 rounded-[2rem] font-black text-3xl outline-none focus:border-sky-500 transition-all" /></div>
              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-6">Cost Price</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-7 bg-slate-50 border-2 border-slate-200 rounded-[2rem] font-black text-3xl outline-none" /></div>
                <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-6">Retail Price</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-7 bg-sky-50 border-4 border-sky-100 rounded-[2rem] font-black text-sky-600 text-4xl outline-none" /></div>
              </div>
              <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-6">Inventory Balance (Units)</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-7 bg-slate-50 border-2 border-slate-200 rounded-[2rem] font-black text-3xl outline-none" /></div>
              <div className="flex gap-8 pt-12">
                 <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-8 bg-slate-100 text-slate-500 rounded-[2rem] font-black uppercase text-sm tracking-[0.5em] active:scale-95 transition-all">Cancel</button>
                 <button type="submit" className="flex-[2] py-8 bg-sky-600 text-white rounded-[2rem] font-black text-4xl shadow-2xl uppercase tracking-[0.5em] active:scale-95 transition-all">Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
