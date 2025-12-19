
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, ShoppingCart, Plus, Minus, Trash2, Edit, Loader2, Store, Check, 
  LayoutDashboard, Settings, UploadCloud, ImagePlus, DollarSign, Package, 
  Send, Bot, ClipboardList, BarChart3, Tag, X, Truck, User, MapPin, Search,
  Download, Upload, LogOut, ChevronRight, CreditCard, Clock, CheckCircle2
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Message, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, Language, Role, Promotion, LogisticsProvider } from './types';
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

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<SaleRecord | null>(null);

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

  const saveOrder = async (order: SaleRecord) => {
    const updated = [order, ...recentSales];
    setRecentSales(updated);
    if (!isCloudActive) localStorage.setItem('pos_sales', JSON.stringify(updated));
    if (isCloudActive && db) try { await setDoc(doc(db, 'sales', order.id), order); } catch(e){}
    setCurrentOrder(order);
    setShowReceipt(true);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg: Message = { id: uuidv4(), role: Role.USER, text: chatInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const response = await streamResponse(chatInput, AppMode.AI, history);
      if (response) {
        let fullText = '';
        const modelMsgId = uuidv4();
        for await (const chunk of response) {
          fullText += (chunk as any).text || '';
          setMessages(prev => {
            const others = prev.filter(m => m.id !== modelMsgId);
            return [...others, { id: modelMsgId, role: Role.MODEL, text: fullText, timestamp: Date.now() }];
          });
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: 'AI Error', timestamp: Date.now(), isError: true }]);
    } finally { setIsChatLoading(false); }
  };

  // Metrics Calculations
  const totalSales = useMemo(() => recentSales.reduce((sum, s) => sum + s.total, 0), [recentSales]);
  const inventoryValue = useMemo(() => products.reduce((sum, p) => sum + (p.cost * p.stock), 0), [products]);
  const theoreticalProfit = useMemo(() => {
    return recentSales.reduce((profit, sale) => {
      const saleCost = sale.items.reduce((c, it) => c + (it.cost * it.quantity), 0);
      return profit + (sale.total - saleCost);
    }, 0);
  }, [recentSales]);

  return (
    <div className={`flex h-screen bg-slate-100 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={() => {}} language={language} setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 bg-white border-b md:hidden no-print">
          <button onClick={()=>setIsSidebarOpen(true)} className="p-2 text-slate-600"><Menu /></button>
          <span className="font-bold text-sky-600 truncate">{storeProfile.name}</span>
          <div className="w-8"></div>
        </header>
        
        <div className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0 overflow-y-auto pb-20 no-print-area">
            {mode === AppMode.DASHBOARD && (
              <div className="p-4 md:p-8">
                <h2 className="text-2xl font-bold flex items-center gap-3 mb-8 text-slate-800"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-6 rounded-[2rem] border shadow-sm border-slate-100">
                    <p className="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">{t.dash_sales}</p>
                    <h3 className="text-2xl font-bold text-sky-600">{formatCurrency(totalSales, language)}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-[2rem] border shadow-sm border-slate-100">
                    <p className="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">{t.dash_stock_cost}</p>
                    <h3 className="text-2xl font-bold text-amber-500">{formatCurrency(inventoryValue, language)}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-[2rem] border shadow-sm border-slate-100">
                    <p className="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">{t.dash_profit}</p>
                    <h3 className="text-2xl font-bold text-emerald-500">{formatCurrency(theoreticalProfit, language)}</h3>
                  </div>
                  <div className="bg-white p-6 rounded-[2rem] border shadow-sm border-slate-100">
                    <p className="text-slate-400 text-[10px] font-bold uppercase mb-2 tracking-widest">{t.dash_low_stock}</p>
                    <h3 className="text-2xl font-bold text-rose-500">{products.filter(p => p.stock <= 5).length} Items</h3>
                  </div>
                </div>
              </div>
            )}

            {mode === AppMode.ORDERS && (
              <div className="p-4 md:p-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800"><ClipboardList className="text-sky-600" /> {t.menu_orders}</h2>
                  <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all flex items-center gap-2 active:scale-95">
                    <Plus size={18}/> {t.order_create_bill}
                  </button>
                </div>
                <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[950px]">
                      <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b">
                        <tr>
                          <th className="px-6 py-5">{t.order_id}</th>
                          <th className="px-6 py-5">{t.order_customer}</th>
                          <th className="px-6 py-5">{t.order_logistics}</th>
                          <th className="px-6 py-5 text-right">{t.order_total}</th>
                          <th className="px-6 py-5 text-center">{t.order_payment}</th>
                          <th className="px-6 py-5 text-center">{t.order_status}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recentSales.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-5">
                              <div className="font-mono text-[10px] text-slate-400">#{s.id.substr(0,8)}</div>
                              <div className="text-[10px] text-slate-300 font-medium">{s.date}</div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="font-bold text-slate-700 text-sm">{s.customerName || '-'}</div>
                              <div className="text-[10px] text-slate-400">{s.customerPhone || '-'}</div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                <Truck size={14} className="text-sky-500" />
                                {s.shippingCarrier || '-'}
                              </div>
                              {s.shippingBranch && <div className="text-[10px] text-sky-600 font-bold ml-5">{s.shippingBranch}</div>}
                            </td>
                            <td className="px-6 py-5 text-right font-bold text-sky-600">{formatCurrency(s.total, language)}</td>
                            <td className="px-6 py-5 text-center">
                              <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight ${s.status === 'Pending' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {s.status === 'Pending' ? t.pay_pending : t.pay_paid}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <span className="px-3 py-1 bg-slate-100 rounded-lg text-[9px] font-bold text-slate-500 uppercase">{s.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {recentSales.length === 0 && <div className="p-24 text-center text-slate-300 flex flex-col items-center gap-4"><ClipboardList size={64} className="opacity-20"/><p className="font-medium">No Sales Records Found</p></div>}
                </div>
              </div>
            )}

            {mode === AppMode.STOCK && (
              <div className="p-4 md:p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800"><Package className="text-sky-600" /> {t.stock_title}</h2>
                  <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-sky-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-sky-100 flex items-center gap-2 hover:bg-sky-700 transition-all">
                    <Plus size={18}/> {t.stock_add}
                  </button>
                </div>
                <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold border-b">
                      <tr><th className="px-6 py-5">Product Details</th><th className="px-6 py-5 text-right">Cost</th><th className="px-6 py-5 text-right">Price</th><th className="px-6 py-5 text-center">Stock</th><th className="px-6 py-5 text-center">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-5">
                             <div className="font-bold text-slate-800">{p.name}</div>
                             <div className="text-[10px] font-mono text-slate-300">{p.code}</div>
                          </td>
                          <td className="px-6 py-5 text-right text-xs text-slate-400">{formatCurrency(p.cost, language)}</td>
                          <td className="px-6 py-5 text-right font-bold text-sky-600">{formatCurrency(p.price, language)}</td>
                          <td className="px-6 py-5 text-center">
                            <span className={`px-4 py-1 rounded-full text-[10px] font-bold ${p.stock <= 5 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                               {p.stock}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <div className="flex items-center justify-center gap-2">
                               <button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-2 text-slate-300 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-all"><Edit size={16}/></button>
                               <button onClick={()=>setProducts(prev=>prev.filter(x=>x.id!==p.id))} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16}/></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {mode === AppMode.REPORTS && (
              <div className="p-4 md:p-8">
                <h2 className="text-2xl font-bold flex items-center gap-3 mb-8 text-slate-800"><BarChart3 className="text-sky-600" /> {t.menu_reports}</h2>
                <div className="bg-white p-8 rounded-[2rem] border shadow-sm text-center text-slate-300 h-96 flex flex-col items-center justify-center">
                   <BarChart3 size={64} className="opacity-10 mb-4" />
                   <p className="font-medium">Summary & Advanced Analytics Coming Soon</p>
                </div>
              </div>
            )}

            {mode === AppMode.PROMOTIONS && (
              <div className="p-4 md:p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800"><Tag className="text-sky-600" /> {t.promo_title}</h2>
                  <button onClick={()=>setIsPromoModalOpen(true)} className="bg-sky-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg flex items-center gap-2 hover:bg-sky-700 transition-all">
                    <Plus size={18}/> {t.promo_add}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {promotions.map(p => (
                    <div key={p.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative group hover:border-sky-200 transition-all">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 bg-sky-50 text-sky-600 rounded-[1.5rem] flex items-center justify-center shadow-inner"><Tag size={28}/></div>
                        <div>
                           <h4 className="font-bold text-slate-800">{p.name}</h4>
                           <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{p.type}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${p.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {p.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button onClick={()=>setPromotions(prev=>prev.filter(x=>x.id!==p.id))} className="text-rose-200 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18}/></button>
                      </div>
                    </div>
                  ))}
                  {promotions.length === 0 && <div className="col-span-full py-24 bg-white rounded-[2rem] border border-dashed border-slate-200 text-center text-slate-300 flex flex-col items-center gap-4"><Tag size={48} className="opacity-10"/><p>{t.promo_no_data}</p></div>}
                </div>
              </div>
            )}

            {mode === AppMode.POS && (
              <div className="flex h-full flex-col md:flex-row overflow-hidden bg-white/50">
                <div className="flex-1 p-4 md:p-6 overflow-y-auto">
                   <div className="flex items-center gap-4 mb-6 bg-white p-4 rounded-[1.5rem] border border-slate-100 shadow-sm">
                      <Search className="text-slate-400" size={20} />
                      <input placeholder="Search products..." className="bg-transparent outline-none flex-1 font-medium text-sm" />
                   </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-10">
                    {products.map(p => (
                      <button key={p.id} onClick={() => setCart(prev => {
                        const exist = prev.find(i => i.id === p.id);
                        return exist ? prev.map(i => i.id === p.id ? {...i, quantity: i.quantity + 1} : i) : [...prev, {...p, quantity: 1}];
                      })} className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm hover:border-sky-400 text-left flex flex-col group active:scale-95 transition-all">
                        <div className={`w-full aspect-square rounded-[1.5rem] ${p.color} mb-4 flex items-center justify-center text-4xl font-bold shadow-inner group-hover:scale-105 transition-transform`}>{p.name.charAt(0)}</div>
                        <h4 className="font-bold text-slate-800 text-xs mb-1 truncate">{p.name}</h4>
                        <div className="flex justify-between items-center mt-auto">
                           <p className="text-sky-600 font-bold text-sm">{formatCurrency(p.price, language)}</p>
                           <span className="text-[9px] font-bold text-slate-300">QTY: {p.stock}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-full md:w-80 bg-white border-l border-slate-100 shadow-2xl flex flex-col">
                  <div className="p-6 border-b border-slate-50 font-bold flex justify-between items-center text-slate-700"><h3>{t.pos_cart_title}</h3><button onClick={()=>setCart([])} className="text-[10px] text-rose-500 font-bold uppercase hover:bg-rose-50 px-2 py-1 rounded transition-colors">{t.pos_clear_cart}</button></div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {cart.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm animate-in slide-in-from-right-4 duration-200">
                        <div className="flex-1 text-xs font-bold text-slate-700 truncate">{it.name}</div>
                        <div className="flex items-center gap-3 bg-white px-2 py-1.5 rounded-xl border border-slate-100 shadow-sm">
                          <button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))} className="p-1 text-slate-400 hover:text-sky-600"><Minus size={12}/></button>
                          <span className="text-xs font-bold min-w-[1rem] text-center">{it.quantity}</span>
                          <button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))} className="p-1 text-slate-400 hover:text-sky-600"><Plus size={12}/></button>
                        </div>
                        <button onClick={()=>setCart(prev=>prev.filter((_,i)=>i!==idx))} className="text-slate-300 hover:text-rose-500"><Trash2 size={14}/></button>
                      </div>
                    ))}
                    {cart.length === 0 && <div className="h-full flex flex-col items-center justify-center text-slate-200"><ShoppingCart size={48} className="mb-2 opacity-50" /><p className="text-xs font-bold uppercase">Empty Cart</p></div>}
                  </div>
                  <div className="p-8 border-t bg-slate-50 space-y-4">
                    <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-widest"><span>Total</span></div>
                    <div className="text-3xl font-bold text-sky-600 tracking-tighter">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</div>
                    <button onClick={()=>setIsPaymentModalOpen(true)} disabled={cart.length === 0} className="w-full bg-sky-600 text-white py-5 rounded-[1.5rem] font-bold shadow-xl shadow-sky-100 disabled:opacity-20 hover:bg-sky-700 active:scale-95 transition-all mt-4">{t.pos_pay}</button>
                  </div>
                </div>
              </div>
            )}

            {mode === AppMode.AI && (
              <div className="h-full flex flex-col p-4 md:p-8">
                 <div className="flex-1 overflow-y-auto space-y-6 mb-4 pr-2 custom-scrollbar">
                    {messages.length === 0 && (
                       <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-30">
                          <Bot size={80} className="mb-4 text-sky-600" />
                          <h3 className="text-xl font-bold">POS AI Assistant</h3>
                          <p className="max-w-xs text-sm mt-2">I can help with inventory insights, sales summaries, and business advice.</p>
                       </div>
                    )}
                    {messages.map(m => <ChatMessage key={m.id} message={m} />)}
                    <div ref={chatEndRef} />
                 </div>
                 <div className="bg-white p-3 rounded-[2.5rem] border shadow-2xl shadow-sky-100 flex gap-3 border-slate-100">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} placeholder={t.ai_placeholder} className="flex-1 px-6 outline-none font-medium text-sm"/>
                    <button onClick={handleSendMessage} disabled={isChatLoading} className="w-12 h-12 bg-sky-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg disabled:opacity-30 hover:bg-sky-700 transition-colors">
                       {isChatLoading ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
                    </button>
                 </div>
              </div>
            )}

            {mode === AppMode.SETTINGS && (
              <div className="p-4 md:p-8">
                <h2 className="text-2xl font-bold flex items-center gap-3 mb-8 text-slate-800"><Settings className="text-sky-600" /> {t.menu_settings}</h2>
                <div className="max-w-2xl bg-white p-10 rounded-[2.5rem] border shadow-sm space-y-8">
                   <div className="space-y-4">
                      <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest border-b pb-2">Store Identity</h4>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-500 ml-2">Store Name</label><input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-sky-300" /></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-500 ml-2">Address</label><textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-sky-300 h-24" /></div>
                   </div>
                   <button onClick={()=>{localStorage.setItem('pos_profile', JSON.stringify(storeProfile)); alert(t.success);}} className="w-full py-4 bg-sky-600 text-white rounded-2xl font-bold shadow-lg shadow-sky-50">{t.save_store}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Manual Bill Modal */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-lg p-10 shadow-2xl overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8"><h3 className="text-2xl font-bold text-slate-800">{t.order_create_bill}</h3><button onClick={()=>setIsBillModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X/></button></div>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const order: SaleRecord = {
                id: uuidv4(), date: new Date().toLocaleString(), timestamp: Date.now(), items: [],
                total: parseFloat(fd.get('total') as string) || 0,
                customerName: fd.get('cust_name') as string,
                customerPhone: fd.get('cust_phone') as string,
                customerAddress: fd.get('cust_addr') as string,
                shippingCarrier: fd.get('logistic') as LogisticsProvider,
                shippingBranch: fd.get('branch') as string,
                paymentMethod: 'transfer',
                status: (fd.get('paid') === 'on' ? 'Paid' : 'Pending') as OrderStatus
              };
              saveOrder(order); setIsBillModalOpen(false);
            }} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 ml-2"><User size={10}/> {t.order_customer}</label><input name="cust_name" placeholder="Name" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 focus:border-sky-400 transition-all font-medium" required /></div>
                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">Phone</label><input name="cust_phone" placeholder="020-..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 focus:border-sky-400 transition-all font-medium" required /></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 ml-2"><MapPin size={10}/> Full Address</label><textarea name="cust_addr" className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none h-24 focus:border-sky-400 transition-all font-medium" required /></div>
              <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">{t.order_logistics}</label>
                   <select name="logistic" className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:border-sky-400 appearance-none font-semibold">
                     <option value="None">None</option>
                     <option value="Anuchit">{t.logistic_anuchit}</option>
                     <option value="Meexai">{t.logistic_meexai}</option>
                     <option value="Rungarun">{t.logistic_rungarun}</option>
                     <option value="Other">{t.logistic_self}</option>
                   </select>
                 </div>
                 <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">{t.order_branch}</label><input name="branch" placeholder="Dest. Branch" className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 focus:border-sky-400 font-semibold" /></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">{t.order_total} (LAK)</label><input name="total" type="number" className="w-full p-6 bg-sky-50 rounded-[1.5rem] border-2 border-sky-100 font-bold text-sky-600 text-3xl outline-none focus:border-sky-500 text-center tracking-tighter" required /></div>
              <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-3xl border border-slate-100">
                <input type="checkbox" name="paid" id="paid_check_new" className="w-6 h-6 accent-sky-600 rounded-lg cursor-pointer" />
                <label htmlFor="paid_check_new" className="font-bold text-slate-700 cursor-pointer">{t.pay_paid}</label>
              </div>
              <button type="submit" className="w-full bg-sky-600 text-white py-6 rounded-[1.5rem] font-bold shadow-2xl shadow-sky-100 hover:bg-sky-700 active:scale-[0.98] transition-all text-lg">{t.save}</button>
            </form>
          </div>
        </div>
      )}

      {/* Promotion Modal (Functional) */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-2xl font-bold mb-8 text-slate-800">{t.promo_add}</h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const p: Promotion = { 
                id: uuidv4(), 
                name: fd.get('name') as string, 
                type: fd.get('type') as any || 'tiered_price', 
                isActive: true, 
                targetSkus: [] 
              };
              setPromotions(prev => [...prev, p]); 
              setIsPromoModalOpen(false);
            }} className="space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 ml-2">{t.promo_name}</label>
                <input name="name" placeholder="Promotion Name (e.g. New Year Sale)" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-sky-400" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 ml-2">Promo Type</label>
                <select name="type" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-400 font-semibold">
                   <option value="tiered_price">Discount Price / Tiered</option>
                   <option value="buy_x_get_y">Buy X Get Y (Freebie)</option>
                </select>
              </div>
              <button type="submit" className="w-full py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold shadow-xl shadow-sky-100 hover:bg-sky-700 transition-all">{t.save}</button>
            </form>
          </div>
        </div>
      )}

      {/* Standard Product Modal (Fix restoration) */}
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
                category: "General", 
                cost: parseFloat(fd.get('cost') as string) || 0, 
                price: parseFloat(fd.get('price') as string) || 0, 
                stock: parseInt(fd.get('stock') as string) || 0, 
                color: editingProduct?.color || COLORS[Math.floor(Math.random()*COLORS.length)] 
              };
              setProducts(prev => [...prev.filter(x => x.id !== p.id), p]); 
              setIsProductModalOpen(false);
            }} className="space-y-4">
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">Name</label><input name="name" placeholder="Product Name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-sky-300" /></div>
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">SKU / Code</label><input name="code" placeholder="SKU001" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-sky-300" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">Cost Price</label><input name="cost" type="number" placeholder="Cost" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-300" /></div>
                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">Selling Price</label><input name="price" type="number" placeholder="Price" required defaultValue={editingProduct?.price} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sky-600 focus:border-sky-300" /></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">Quantity in Stock</label><input name="stock" type="number" placeholder="Stock" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-300" /></div>
              <button type="submit" className="w-full py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold shadow-lg mt-4">{t.save}</button>
            </form>
          </div>
        </div>
      )}

      {/* POS Payment Confirmation */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-[150] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[4rem] w-full max-w-sm p-12 text-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-sky-400 to-indigo-500"></div>
             <div className="w-24 h-24 bg-sky-50 text-sky-600 rounded-[3rem] flex items-center justify-center mx-auto mb-10 shadow-inner"><DollarSign size={48}/></div>
             <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Checkout Total</p>
             <h3 className="text-5xl font-bold mb-12 text-slate-800 tracking-tighter">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</h3>
             <button onClick={() => {
                const total = cart.reduce((s,i)=>s+(i.price*i.quantity),0);
                const order: SaleRecord = { id: uuidv4(), items: [...cart], total, date: new Date().toLocaleString(), timestamp: Date.now(), paymentMethod: 'cash', status: 'Paid' };
                saveOrder(order); setCart([]); setIsPaymentModalOpen(false);
             }} className="w-full bg-sky-600 text-white py-6 rounded-[2.5rem] font-bold shadow-2xl shadow-sky-100 hover:bg-sky-700 active:scale-95 transition-all text-xl">{t.pos_pay}</button>
             <button onClick={()=>setIsPaymentModalOpen(false)} className="mt-6 text-slate-300 text-[10px] font-bold uppercase tracking-widest hover:text-slate-500 transition-colors">{t.cancel}</button>
          </div>
        </div>
      )}

      {/* POS Receipt (Restore quality) */}
      {showReceipt && currentOrder && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-2xl">
            <div id="receipt-content" className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden p-10 flex flex-col shadow-2xl animate-in slide-in-from-bottom-10">
              <div className="mb-8 pb-8 border-b-2 border-dashed border-slate-100 text-center">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">{storeProfile.name}</h2>
                <p className="text-[10px] text-slate-400 font-medium max-w-[150px] mx-auto mt-2 leading-relaxed">{storeProfile.address}</p>
              </div>
              <div className="space-y-4 mb-8 text-sm">
                {currentOrder.customerName && <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-400">Cust:</span> <span className="font-bold text-slate-700">{currentOrder.customerName}</span></div>}
                {currentOrder.shippingCarrier && <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-400">Ship:</span> <span className="font-bold text-sky-600">{currentOrder.shippingCarrier} {currentOrder.shippingBranch ? `(${currentOrder.shippingBranch})` : ''}</span></div>}
                <div className="pt-2">
                  <div className="text-[10px] font-bold text-slate-300 uppercase mb-3 tracking-widest">Order Details</div>
                  {currentOrder.items.length > 0 ? currentOrder.items.map((it, i) => (<div key={i} className="flex justify-between text-xs mb-2"><span>{it.name} x{it.quantity}</span><span className="font-bold">{formatCurrency(it.price * it.quantity, language)}</span></div>)) : <div className="text-xs italic text-slate-300 text-center py-4 bg-slate-50 rounded-xl">Manual Entry / Custom Service</div>}
                </div>
              </div>
              <div className="text-4xl font-black mb-2 text-center text-sky-600 tracking-tighter">{formatCurrency(currentOrder.total, language)}</div>
              <div className="text-center mb-10"><span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase ${currentOrder.status === 'Paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{currentOrder.status === 'Paid' ? t.pay_paid : t.pay_pending}</span></div>
              <button onClick={()=>{setShowReceipt(false); setCurrentOrder(null);}} className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-bold shadow-xl hover:bg-black transition-all">DISMISS</button>
              <button onClick={()=>window.print()} className="mt-4 text-[10px] font-bold text-slate-400 uppercase hover:underline no-print">Print Receipt</button>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
