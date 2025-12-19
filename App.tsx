
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

// --- Helpers ---
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

const COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-purple-500', 'bg-indigo-500'];

const INITIAL_PROFILE: StoreProfile = {
  name: "Coffee Please",
  address: "Vientiane, Laos",
  phone: "020-5555-9999",
  logoUrl: null
};

// --- Main App ---
const App: React.FC = () => {
  // Navigation & Global State
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');
  const [isCloudActive] = useState<boolean>(() => localStorage.getItem('pos_force_local') !== 'true');

  // Core Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : INITIAL_PROFILE;
  });

  // Transaction State
  const [billItems, setBillItems] = useState<CartItem[]>([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [skuSearch, setSkuSearch] = useState('');

  // UI Modals State
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);

  // AI & Reports State
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [reportDateRange, setReportDateRange] = useState({ 
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], 
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0] 
  });

  const t = translations[language];

  // --- Core Pricing Logic ---
  const getProductPrice = (product: Product, quantity: number) => {
    const promo = promotions.find(p => p.targetProductId === product.id && p.isActive);
    if (!promo || !promo.tiers || promo.tiers.length === 0) return product.price;
    const sortedTiers = [...promo.tiers].sort((a, b) => b.minQty - a.minQty);
    const applicableTier = sortedTiers.find(t => quantity >= t.minQty);
    return applicableTier ? applicableTier.unitPrice : product.price;
  };

  // --- Sync Effects ---
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

  useEffect(() => {
    localStorage.setItem('pos_language', language);
    localStorage.setItem('pos_profile', JSON.stringify(storeProfile));
    if (!isCloudActive) {
      localStorage.setItem('pos_products', JSON.stringify(products));
      localStorage.setItem('pos_sales', JSON.stringify(recentSales));
      localStorage.setItem('pos_promos', JSON.stringify(promotions));
    }
  }, [language, storeProfile, products, recentSales, promotions, isCloudActive]);

  // --- Handlers ---
  const updateCartItemQuantity = (idx: number, newQty: number) => {
    const qty = Math.max(1, isNaN(newQty) ? 1 : newQty);
    setBillItems(prev => prev.map((it, i) => {
      if (i === idx) {
        const nPrice = getProductPrice(it, qty);
        return { ...it, quantity: qty, price: nPrice };
      }
      return it;
    }));
  };

  const addToCart = (p: Product) => {
    setBillItems(prev => {
      const exist = prev.find(i => i.id === p.id);
      const nQty = exist ? exist.quantity + 1 : 1;
      const nPrice = getProductPrice(p, nQty);
      if (exist) {
        return prev.map(i => i.id === p.id ? { ...i, quantity: nQty, price: nPrice } : i);
      }
      return [...prev, { ...p, quantity: 1, price: nPrice }];
    });
  };

  const finalizeSale = async () => {
    const total = billItems.reduce((s, i) => s + (i.price * i.quantity), 0) - billDiscount;
    const order: SaleRecord = { 
      id: uuidv4(), items: [...billItems], subtotal: total + billDiscount, discount: billDiscount, total, 
      date: new Date().toLocaleString(), timestamp: Date.now(), status: 'Paid', 
      customerName: customerName || 'Walk-in'
    };
    
    // Update local stock
    setProducts(prev => prev.map(p => {
      const cartItem = billItems.find(it => it.id === p.id);
      return cartItem ? { ...p, stock: Math.max(0, p.stock - cartItem.quantity) } : p;
    }));
    
    setRecentSales(prev => [order, ...prev]);
    if (isCloudActive && db) await setDoc(doc(db, 'sales', order.id), order);
    
    setIsBillModalOpen(false);
    setBillItems([]);
    setBillDiscount(0);
    setCustomerName('');
  };

  // handleAiChat handles processing user queries through the Gemini API and updates the UI state.
  const handleAiChat = async () => {
    if (!chatInput.trim() || isAiTyping) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: Role.USER,
      text: chatInput,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, userMessage]);
    const currentInput = chatInput;
    setChatInput('');
    setIsAiTyping(true);

    try {
      const history = chatMessages.map(msg => ({
        role: msg.role === Role.USER ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const stream = await streamResponse(currentInput, mode, history);
      
      if (stream) {
        const assistantId = uuidv4();
        let assistantText = '';
        
        // Add an initial empty model message to be updated as chunks arrive.
        setChatMessages(prev => [...prev, {
          id: assistantId,
          role: Role.MODEL,
          text: '',
          timestamp: Date.now()
        }]);

        // Consume the streaming response.
        for await (const chunk of stream) {
          // Direct access to .text property on GenerateContentResponse as per guidelines.
          const textChunk = chunk.text;
          if (textChunk) {
            assistantText += textChunk;
            setChatMessages(prev => prev.map(msg => 
              msg.id === assistantId ? { ...msg, text: assistantText } : msg
            ));
          }
        }
      }
    } catch (error) {
      console.error("AI Error:", error);
      setChatMessages(prev => [...prev, {
        id: uuidv4(),
        role: Role.MODEL,
        text: "Sorry, I encountered an error. Please check your connection or API key.",
        timestamp: Date.now(),
        isError: true
      }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const metrics = useMemo(() => {
    const filtered = recentSales.filter(s => s.timestamp >= new Date(reportDateRange.start).getTime() && s.timestamp <= new Date(reportDateRange.end).getTime() + 86400000);
    const totalSales = filtered.reduce((acc, s) => acc + s.total, 0);
    const totalCost = filtered.reduce((acc, s) => acc + s.items.reduce((c, i) => c + (i.cost * i.quantity), 0), 0);
    return {
      sales: totalSales,
      profit: totalSales - totalCost,
      count: filtered.length,
      lowStock: products.filter(p => p.stock <= 5)
    };
  }, [recentSales, products, reportDateRange]);

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={() => {}} language={language} setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between no-print">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-400"><LayoutDashboard /></button>
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center text-white"><Coffee size={20}/></div>
             <h2 className="font-black text-slate-800 uppercase tracking-tight">{mode}</h2>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden md:flex flex-col text-right">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{storeProfile.name}</span>
                <span className="text-[10px] text-emerald-500 font-bold uppercase">{isCloudActive ? 'Cloud Sync Active' : 'Offline Mode'}</span>
             </div>
             <div className="w-10 h-10 bg-slate-100 rounded-full border border-slate-200"></div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
          
          {/* DASHBOARD VIEW */}
          {mode === AppMode.DASHBOARD && (
            <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: t.dash_sales, val: metrics.sales, color: 'sky', icon: TrendingUp },
                    { label: t.report_profit, val: metrics.profit, color: 'emerald', icon: CheckCircle2 },
                    { label: t.dash_pending, val: metrics.count, unit: 'Bills', color: 'rose', icon: ClipboardList },
                    { label: t.dash_stock_cost, val: products.reduce((acc, p) => acc + (p.cost * p.stock), 0), color: 'amber', icon: Package },
                  ].map((item, i) => (
                    <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 group hover:border-sky-500 transition-all">
                       <div className="flex justify-between items-start mb-4">
                          <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">{item.label}</p>
                          <div className={`p-3 rounded-xl bg-${item.color}-50 text-${item.color}-500`}><item.icon size={20} /></div>
                       </div>
                       <h3 className="text-2xl font-black text-slate-900">
                         {item.unit ? `${item.val} ${item.unit}` : formatCurrency(item.val, language)}
                       </h3>
                    </div>
                  ))}
               </div>
               
               <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                  <h4 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-4">
                    <div className="p-3 bg-rose-100 text-rose-500 rounded-2xl"><Package size={20} /></div>
                    {t.dash_low_stock}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {metrics.lowStock.slice(0, 6).map(p => (
                      <div key={p.id} className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 flex justify-between items-center">
                        <div className="font-black text-slate-700">{p.name}</div>
                        <div className="bg-rose-500 text-white px-3 py-1 rounded-xl font-black">{p.stock}</div>
                      </div>
                    ))}
                    {metrics.lowStock.length === 0 && <p className="col-span-full py-10 text-center text-slate-300 font-black italic">Inventory levels are healthy.</p>}
                  </div>
               </div>
            </div>
          )}

          {/* ORDERS VIEW */}
          {mode === AppMode.ORDERS && (
            <div className="max-w-7xl mx-auto space-y-8 animate-in slide-in-from-bottom-5">
              <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                <h2 className="text-3xl font-black text-slate-800 flex items-center gap-4">
                  <ClipboardList className="text-sky-500" /> {t.menu_orders}
                </h2>
                <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:bg-sky-700 transition-all flex items-center gap-2">
                  <Plus size={20} /> {t.order_create_bill}
                </button>
              </div>
              <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                   <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">
                      <tr><th className="px-8 py-5">Bill Details</th><th className="px-8 py-5">Customer</th><th className="px-8 py-5 text-right">Total</th><th className="px-8 py-5 text-center">Status</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 font-bold">
                      {recentSales.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                           <td className="px-8 py-6"><div className="text-slate-800">{s.date}</div><div className="text-[9px] font-mono text-slate-300 uppercase">#{s.id.slice(0,8)}</div></td>
                           <td className="px-8 py-6 text-slate-600">{s.customerName}</td>
                           <td className="px-8 py-6 text-right text-sky-600 font-black">{formatCurrency(s.total, language)}</td>
                           <td className="px-8 py-6 text-center"><span className="bg-emerald-100 text-emerald-600 px-4 py-1.5 rounded-xl text-[9px] uppercase font-black">{t.pay_paid}</span></td>
                        </tr>
                      ))}
                      {recentSales.length === 0 && <p className="col-span-full py-10 text-center text-slate-300 font-black italic">Inventory levels are healthy.</p>}
                   </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STOCK VIEW */}
          {mode === AppMode.STOCK && (
             <div className="max-w-7xl mx-auto space-y-8 animate-in slide-in-from-bottom-5">
                <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                   <h2 className="text-3xl font-black text-slate-800 flex items-center gap-4">
                     <Package className="text-sky-500" /> {t.stock_title}
                   </h2>
                   <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black hover:bg-black transition-all">
                      {t.stock_add}
                   </button>
                </div>
                <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
                   <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">
                         <tr><th className="px-8 py-5">Product Info</th><th className="px-8 py-5 text-right">Cost</th><th className="px-8 py-5 text-right">Retail</th><th className="px-8 py-5 text-center">In Stock</th><th className="px-8 py-5 text-center">Edit</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-8 py-6 flex items-center gap-4">
                               <div className={`w-10 h-10 rounded-xl ${p.color || 'bg-slate-200'} flex items-center justify-center font-black text-white`}>{p.name.charAt(0)}</div>
                               <div><div className="text-slate-800">{p.name}</div><div className="text-[9px] font-mono text-slate-300 uppercase">SKU: {p.code}</div></div>
                            </td>
                            <td className="px-8 py-6 text-right text-slate-400 font-medium">{formatCurrency(p.cost, language)}</td>
                            <td className="px-8 py-6 text-right text-sky-600 font-black">{formatCurrency(p.price, language)}</td>
                            <td className="px-8 py-6 text-center"><span className={`px-4 py-1 rounded-xl text-[10px] font-black uppercase ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}>{p.stock}</span></td>
                            <td className="px-8 py-6 text-center"><button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-2 text-slate-300 hover:text-sky-500 transition-colors"><Edit size={18}/></button></td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {/* PROMOTIONS VIEW */}
          {mode === AppMode.PROMOTIONS && (
            <div className="max-w-7xl mx-auto space-y-8 animate-in slide-in-from-bottom-5">
              <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                <h2 className="text-3xl font-black text-slate-800 flex items-center gap-4">
                  <Tag className="text-sky-500" /> {t.menu_promotions}
                </h2>
                <button onClick={()=>{setEditingPromo(null); setIsPromoModalOpen(true);}} className="bg-sky-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:bg-sky-700 transition-all flex items-center gap-2">
                  <Plus size={20} /> {t.promo_add}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {promotions.map(promo => {
                  const target = products.find(p => p.id === promo.targetProductId);
                  return (
                    <div key={promo.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative group hover:border-sky-500 transition-all border-b-8 border-b-sky-500">
                       <button onClick={() => setPromotions(prev => prev.filter(p => p.id !== promo.id))} className="absolute top-6 right-6 p-2 text-slate-200 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
                       <div className="flex items-center gap-4 mb-6">
                         <div className={`w-12 h-12 rounded-xl ${target?.color || 'bg-slate-100'} flex items-center justify-center font-black text-white text-lg`}>{target?.name.charAt(0) || '!'}</div>
                         <div><h4 className="font-black text-slate-800 leading-tight">{promo.name}</h4><p className="text-[10px] font-bold text-slate-400 uppercase">{target?.name || 'Unknown'}</p></div>
                       </div>
                       <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl">
                          {promo.tiers.map((tier, idx) => (
                             <div key={idx} className="flex justify-between items-center text-sm py-1 border-b border-slate-200 last:border-0">
                                <span className="font-bold text-slate-400">{tier.minQty}+ ชิ้น</span>
                                <span className="font-black text-sky-600">{formatCurrency(tier.unitPrice, language)}</span>
                             </div>
                          ))}
                       </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI VIEW */}
          {mode === AppMode.AI && (
            <div className="max-w-4xl mx-auto h-[70vh] flex flex-col bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden animate-in fade-in">
              <div className="p-6 border-b flex items-center gap-4 bg-slate-900 text-white">
                 <div className="w-12 h-12 bg-sky-500 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-900/40"><Bot size={28} /></div>
                 <div><h2 className="text-lg font-black tracking-tight">AI Assistant</h2><p className="text-[9px] font-bold text-sky-400 uppercase tracking-widest">Powered by Gemini 3 Flash</p></div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar">
                 {chatMessages.length === 0 && <div className="h-full flex flex-col items-center justify-center text-center opacity-20"><Bot size={80}/><p className="mt-4 font-black uppercase tracking-[0.2em] text-xs">Ask me about your sales analysis</p></div>}
                 {chatMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
                 {isAiTyping && <div className="flex gap-2 items-center text-slate-300 font-black text-[10px] uppercase ml-12 animate-pulse">Assistant is thinking...</div>}
              </div>
              <div className="p-6 bg-slate-50 border-t">
                 <div className="flex gap-3 bg-white p-3 rounded-2xl border-2 border-slate-100 focus-within:border-sky-500 transition-all">
                    <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAiChat()} placeholder="How many coffees did I sell today?" className="flex-1 bg-transparent outline-none font-bold px-4" />
                    <button onClick={handleAiChat} disabled={!chatInput.trim() || isAiTyping} className="p-3 bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-20 transition-all"><Send size={20}/></button>
                 </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MODALS --- */}

      {/* NEW BILL MODAL - THE CORE FIX */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[500] flex items-center justify-center p-4 backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-[4rem] shadow-2xl flex flex-col md:flex-row overflow-hidden relative border border-white/20">
             
             {/* Modal Header for Mobile */}
             <div className="md:hidden p-6 border-b flex justify-between items-center">
                <h3 className="font-black">Create Order</h3>
                <button onClick={()=>setIsBillModalOpen(false)} className="p-2 bg-slate-100 rounded-full"><X/></button>
             </div>

             {/* Cart Section */}
             <div className="w-full md:w-[40%] bg-slate-50/50 border-r border-slate-200 flex flex-col h-full overflow-hidden">
                <div className="p-8 border-b bg-white hidden md:block">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><ShoppingCart size={24} className="text-sky-500"/> Current Cart</h3>
                      <button onClick={()=>setIsBillModalOpen(false)} className="p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20}/></button>
                   </div>
                   <input value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-sky-500 transition-all" placeholder={t.order_cust_name} />
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                   {billItems.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-4 p-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
                         <div className={`w-12 h-12 rounded-xl ${it.color || 'bg-slate-200'} flex items-center justify-center font-black text-white`}>{it.name.charAt(0)}</div>
                         <div className="flex-1 min-w-0">
                            <div className="text-sm font-black text-slate-800 truncate">{it.name}</div>
                            <div className="text-xs font-bold text-sky-600">{formatCurrency(it.price, language)}</div>
                         </div>
                         <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border">
                            <button onClick={()=>updateCartItemQuantity(idx, it.quantity - 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-400 hover:text-sky-600"><Minus size={14}/></button>
                            
                            {/* FIX: INPUT FOR LARGE QUANTITIES (e.g. 5000) */}
                            <input 
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) => updateCartItemQuantity(idx, parseInt(e.target.value))}
                              className="w-16 text-center font-black text-lg bg-transparent border-none outline-none"
                            />

                            <button onClick={()=>updateCartItemQuantity(idx, it.quantity + 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-400 hover:text-sky-600"><Plus size={14}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter((_, i)=>i!==idx))} className="p-2 text-rose-300 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
                      </div>
                   ))}
                   {billItems.length === 0 && <div className="h-40 flex flex-col items-center justify-center opacity-20 font-black uppercase text-xs">Cart is empty</div>}
                </div>
                <div className="p-8 border-t bg-white space-y-6">
                   <div className="flex justify-between items-center text-sm font-black text-slate-400">
                      <span>Subtotal</span>
                      <span className="text-slate-800">{formatCurrency(billItems.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span>
                   </div>
                   <div className="flex justify-between items-end">
                      <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-2">Total Payable</div>
                      <div className="text-5xl font-black text-sky-600 tracking-tighter">{formatCurrency(Math.max(0, billItems.reduce((s,i)=>s+(i.price*i.quantity),0) - billDiscount), language).split(" ")[0]}</div>
                   </div>
                   <button onClick={finalizeSale} disabled={billItems.length === 0} className="w-full py-6 bg-sky-600 text-white rounded-[2rem] font-black text-xl shadow-xl hover:bg-sky-700 disabled:opacity-20 active:scale-95 transition-all">PAY NOW</button>
                </div>
             </div>

             {/* Inventory Picker */}
             <div className="flex-1 p-8 flex flex-col bg-white overflow-hidden h-full">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                   <div><h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Select Products</h4></div>
                   <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border-2 border-slate-100 w-full max-w-md focus-within:border-sky-500 transition-all">
                      <Search className="text-slate-300" size={20} />
                      <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="bg-transparent outline-none flex-1 font-bold" />
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pr-4 custom-scrollbar">
                   {products.filter(p => !skuSearch || p.code.toLowerCase().includes(skuSearch.toLowerCase()) || p.name.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => addToCart(p)} className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm hover:border-sky-500 hover:shadow-lg transition-all flex flex-col text-left group active:scale-95">
                        <div className={`w-full aspect-square rounded-[1.5rem] ${p.color || 'bg-slate-200'} mb-4 flex items-center justify-center text-4xl font-black text-white shadow-lg group-hover:scale-105 transition-all`}>{p.name.charAt(0)}</div>
                        <h4 className="font-black text-slate-800 text-sm leading-tight mb-1 truncate">{p.name}</h4>
                        <div className="mt-auto flex justify-between items-center pt-2">
                            <span className="text-sky-600 font-black text-lg">{formatCurrency(p.price, language).split(" ")[0]}</span>
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{p.stock}</span>
                        </div>
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* PROMOTION MODAL - WITH CLOSE & CANCEL */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-xl animate-in zoom-in-95">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl p-10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar relative border border-white/20">
            <div className="flex justify-between items-center mb-8 border-b pb-8">
               <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                  <div className="p-2 bg-sky-500 text-white rounded-lg shadow-lg"><Tag size={20} /></div>
                  Wholesale Setup
               </h3>
               <button onClick={() => setIsPromoModalOpen(false)} className="p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20} /></button>
            </div>

            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const tiers: PromoTier[] = [];
              for(let i=1; i<=7; i++) {
                const q = fd.get(`qty_${i}`); const pr = fd.get(`price_${i}`);
                if (q && pr && Number(q) > 0) tiers.push({ minQty: Number(q), unitPrice: Number(pr) });
              }
              const p: Promotion = { 
                id: editingPromo?.id || uuidv4(), name: fd.get('name') as string, 
                targetProductId: fd.get('productId') as string, isActive: true, tiers 
              };
              setPromotions(prev => [...prev.filter(x => x.id !== p.id), p]); 
              if (isCloudActive && db) setDoc(doc(db, 'promotions', p.id), p);
              setIsPromoModalOpen(false);
            }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Product</label>
                   <select name="productId" required defaultValue={editingPromo?.targetProductId} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-sky-500">
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                   </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Promo Label</label>
                   <input name="name" required defaultValue={editingPromo?.name} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-sky-500" placeholder="e.g., Bulk Discount Gold" />
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Define 7 Pricing Tiers</p>
                <div className="grid grid-cols-1 gap-3">
                  {[1,2,3,4,5,6,7].map(n => (
                    <div key={n} className="flex gap-4 items-center bg-slate-50/50 p-3 rounded-2xl border">
                      <div className="text-[9px] font-black text-slate-300 w-8">#0{n}</div>
                      <input name={`qty_${n}`} type="number" placeholder="Min Qty" defaultValue={editingPromo?.tiers[n-1]?.minQty} className="flex-1 p-3 bg-white border border-slate-200 rounded-xl font-bold text-center" />
                      <div className="text-slate-200">→</div>
                      <input name={`price_${n}`} type="number" placeholder="Price" defaultValue={editingPromo?.tiers[n-1]?.unitPrice} className="flex-1 p-3 bg-sky-50 border border-sky-100 rounded-xl font-black text-sky-600 text-center" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-4 pt-6">
                 <button type="button" onClick={() => setIsPromoModalOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest">Cancel</button>
                 <button type="submit" className="flex-[2] py-5 bg-sky-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-sky-700 transition-all uppercase tracking-widest">Save Promotion</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL - WITH CLOSE & CANCEL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-xl animate-in zoom-in-95">
          <div className="bg-white rounded-[3rem] w-full max-w-xl p-10 shadow-2xl border border-white/20 relative">
            <button onClick={()=>setIsProductModalOpen(false)} className="absolute top-6 right-6 p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20} /></button>
            <h3 className="text-2xl font-black mb-10 text-slate-800 flex items-center gap-4">
              <div className="p-2 bg-sky-500 text-white rounded-lg shadow-lg"><Package size={20} /></div> 
              {editingProduct ? 'Update Product' : 'New Inventory Item'}
            </h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const p = { 
                id: editingProduct?.id || uuidv4(), name: fd.get('name') as string, code: fd.get('code') as string, category: "General", 
                cost: parseFloat(fd.get('cost') as string) || 0, price: parseFloat(fd.get('price') as string) || 0, stock: parseInt(fd.get('stock') as string) || 0, 
                color: editingProduct?.color || COLORS[Math.floor(Math.random()*COLORS.length)] + " text-white"
              };
              setProducts(prev => [...prev.filter(x => x.id !== p.id), p]); 
              if (isCloudActive && db) setDoc(doc(db, 'products', p.id), p);
              setIsProductModalOpen(false);
            }} className="space-y-6">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SKU Code</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" /></div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cost Price</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Retail Price</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-4 bg-sky-50 border-2 border-sky-100 rounded-xl font-black text-sky-600 text-xl outline-none" /></div>
              </div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Opening Stock</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" /></div>
              <div className="flex gap-4 pt-4">
                 <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest">Cancel</button>
                 <button type="submit" className="flex-[2] py-5 bg-sky-600 text-white rounded-2xl font-black text-lg shadow-xl uppercase tracking-widest">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
