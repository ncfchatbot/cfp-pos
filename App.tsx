
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, ShoppingCart, Plus, Minus, Trash2, Edit, Loader2, Store, Check, 
  LayoutDashboard, Settings, UploadCloud, ImagePlus, DollarSign, Package, 
  Eraser, Cloud, FileSpreadsheet, Send, Bot, ClipboardList, BarChart3, Tag, 
  Search, X
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Message, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, Language, Role } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { streamResponse } from './services/gemini';
import { db, collection, doc, setDoc, onSnapshot, query, orderBy } from './services/firebase';

const processImage = (file: File, maxWidth = 400): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

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

const checkIsLowStock = (product: Product): boolean => (product.stock || 0) <= 5;

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
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : INITIAL_PROFILE;
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingCSV, setIsProcessingCSV] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<SaleRecord | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const t = translations[language];

  useEffect(() => {
    localStorage.setItem('pos_language', language);
  }, [language]);

  useEffect(() => {
    let unsubscribes: (() => void)[] = [];
    if (isCloudActive && db) {
      unsubscribes.push(onSnapshot(collection(db, 'products'), (s) => setProducts(s.docs.map(d => ({ ...d.data(), id: d.id } as Product)))));
      unsubscribes.push(onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), (s) => setRecentSales(s.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord)))));
      unsubscribes.push(onSnapshot(doc(db, 'settings', 'profile'), (d) => {
        if (d.exists()) {
          const cloudProfile = d.data() as StoreProfile;
          setStoreProfile(cloudProfile);
          localStorage.setItem('pos_profile', JSON.stringify(cloudProfile));
        }
      }));
      setIsDataLoaded(true);
    } else {
      setProducts(JSON.parse(localStorage.getItem('pos_products') || '[]'));
      setRecentSales(JSON.parse(localStorage.getItem('pos_sales') || '[]'));
      setIsDataLoaded(true);
    }
    return () => unsubscribes.forEach(u => u());
  }, [isCloudActive]);

  useEffect(() => {
    if (!isCloudActive && isDataLoaded) {
      localStorage.setItem('pos_products', JSON.stringify(products));
      localStorage.setItem('pos_sales', JSON.stringify(recentSales));
      localStorage.setItem('pos_profile', JSON.stringify(storeProfile));
    }
  }, [products, recentSales, storeProfile, isDataLoaded, isCloudActive]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveStoreProfile = async () => {
    localStorage.setItem('pos_profile', JSON.stringify(storeProfile));
    if (isCloudActive && db) {
      try { await setDoc(doc(db, 'settings', 'profile'), storeProfile); } catch (e) { console.error(e); }
    }
    alert(t.success);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const b64 = await processImage(file);
      const updated = { ...storeProfile, logoUrl: b64 };
      setStoreProfile(updated);
      localStorage.setItem('pos_profile', JSON.stringify(updated));
    } catch(e) { alert("Upload failed"); }
    finally { setIsUploading(false); }
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
      setMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: 'Gemini Error', timestamp: Date.now(), isError: true }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className={`flex h-screen bg-slate-100 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <input type="file" ref={csvInputRef} className="hidden" accept=".csv" />
      <Sidebar 
        currentMode={mode} 
        onModeChange={setMode} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} 
        onImport={() => {}} 
        language={language} 
        setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 bg-white border-b md:hidden">
          <button onClick={()=>setIsSidebarOpen(true)} className="p-2"><Menu /></button>
          <span className="font-bold text-sky-600">{storeProfile.name}</span>
          <div className="w-8"/>
        </header>
        
        <div className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0 overflow-y-auto pb-20">
            {mode === AppMode.DASHBOARD && (
              <div className="p-4 md:p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
                  <div className={`px-4 py-1 rounded-full text-[10px] font-bold border ${isCloudActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {isCloudActive ? 'CLOUD ONLINE' : 'LOCAL MODE'}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                  <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase mb-1">{t.dash_sales}</p><h3 className="text-2xl font-bold text-sky-600">{formatCurrency(recentSales.reduce((s,o)=>s+o.total,0), language)}</h3></div>
                  <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase mb-1">{t.dash_stock_cost}</p><h3 className="text-2xl font-bold text-amber-600">{formatCurrency(products.reduce((s,p)=>s+(p.cost*p.stock),0), language)}</h3></div>
                  <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase mb-1">{t.dash_profit}</p><h3 className="text-2xl font-bold text-emerald-600">{formatCurrency(products.reduce((s,p)=>s+((p.price-p.cost)*p.stock),0), language)}</h3></div>
                  <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase mb-1">{t.dash_low_stock}</p><h3 className="text-2xl font-bold text-rose-500">{products.filter(checkIsLowStock).length}</h3></div>
                </div>
              </div>
            )}

            {mode === AppMode.ORDERS && (
              <div className="p-4 md:p-8">
                <h2 className="text-2xl font-bold mb-8 flex items-center gap-3"><ClipboardList className="text-sky-600" /> {t.menu_orders}</h2>
                <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b">
                      <tr><th className="px-6 py-4">{t.order_id}</th><th className="px-6 py-4">{t.order_date}</th><th className="px-6 py-4 text-right">{t.order_total}</th><th className="px-6 py-4 text-center">{t.order_status}</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {recentSales.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 font-mono text-[10px] text-slate-500">{s.id.substr(0,8)}</td>
                          <td className="px-6 py-4 text-xs">{s.date}</td>
                          <td className="px-6 py-4 text-right font-bold text-sky-600">{formatCurrency(s.total, language)}</td>
                          <td className="px-6 py-4 text-center"><span className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full text-[10px] font-bold uppercase">{s.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {recentSales.length === 0 && <div className="p-20 text-center text-slate-300">No Orders History</div>}
                </div>
              </div>
            )}

            {mode === AppMode.REPORTS && (
              <div className="p-4 md:p-8">
                 <h2 className="text-2xl font-bold mb-8 flex items-center gap-3"><BarChart3 className="text-sky-600" /> {t.menu_reports}</h2>
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white p-10 rounded-[3rem] border shadow-sm">
                       <h3 className="text-lg font-bold mb-6">{t.report_sales_summary}</h3>
                       <div className="h-64 flex items-end justify-between gap-2">
                          {[40, 70, 50, 90, 60, 80, 100].map((v, i) => (
                            <div key={i} className="w-full bg-sky-100 rounded-t-xl relative group" style={{height: `${v}%`}} />
                          ))}
                       </div>
                    </div>
                    <div className="bg-white p-10 rounded-[3rem] border shadow-sm">
                       <h3 className="text-lg font-bold mb-6">{t.report_top_products}</h3>
                       <div className="space-y-4">
                          {products.slice(0, 5).map((p, i) => (
                            <div key={i} className="flex items-center justify-between">
                               <span className="text-sm font-bold">{p.name}</span>
                               <span className="text-xs text-slate-400 font-mono">{(100 - (i*15)).toFixed(0)} Sold</span>
                            </div>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>
            )}

            {mode === AppMode.PROMOTIONS && (
              <div className="p-4 md:p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3"><Tag className="text-sky-600" /> {t.promo_title}</h2>
                  <button className="bg-sky-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg flex items-center gap-2"><Plus size={18}/> New Promo</button>
                </div>
                <div className="bg-white p-12 rounded-[3rem] border border-dashed text-center text-slate-300">
                  <Tag className="mx-auto mb-4" size={40} />
                  <p>{t.promo_no_data}</p>
                </div>
              </div>
            )}

            {mode === AppMode.AI && (
              <div className="h-full flex flex-col bg-slate-50/50 p-4 md:p-8 max-h-[calc(100vh-64px)] overflow-hidden">
                 <div className="flex-1 overflow-y-auto mb-4 space-y-6">
                    {messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                         <div className="w-20 h-20 bg-sky-100 text-sky-600 rounded-[2.5rem] flex items-center justify-center mb-6"><Bot size={40}/></div>
                         <h3 className="text-xl font-bold mb-2">AI Assistant</h3>
                         <p className="max-w-xs">{t.ai_placeholder}</p>
                      </div>
                    )}
                    {messages.map(m => <ChatMessage key={m.id} message={m} />)}
                    <div ref={chatEndRef} />
                 </div>
                 <div className="bg-white p-4 rounded-[2.5rem] border shadow-lg flex gap-4">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} placeholder={t.ai_placeholder} className="flex-1 bg-transparent px-4 outline-none font-bold"/>
                    <button onClick={handleSendMessage} disabled={isChatLoading} className="w-12 h-12 bg-sky-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-30">
                       {isChatLoading ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
                    </button>
                 </div>
              </div>
            )}

            {mode === AppMode.STOCK && (
              <div className="p-4 md:p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3"><Package className="text-sky-600" /> {t.stock_title}</h2>
                  <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-sky-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg flex items-center gap-2"><Plus size={18}/> {t.stock_add}</button>
                </div>
                <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-x-auto">
                   <table className="w-full text-left min-w-[600px]">
                     <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold border-b">
                       <tr><th className="px-6 py-5">Product</th><th className="px-6 py-5">SKU</th><th className="px-6 py-5 text-right">Cost</th><th className="px-6 py-5 text-right">Price</th><th className="px-6 py-5 text-center">Stock</th><th className="px-6 py-5 text-center">Action</th></tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                       {products.map(p => (
                         <tr key={p.id} className="hover:bg-slate-50/50">
                           <td className="px-6 py-5 font-bold">{p.name}</td>
                           <td className="px-6 py-5 font-mono text-[10px] text-slate-400">{p.code}</td>
                           <td className="px-6 py-5 text-right">{formatCurrency(p.cost, language)}</td>
                           <td className="px-6 py-5 text-right font-bold text-sky-600">{formatCurrency(p.price, language)}</td>
                           <td className="px-6 py-5 text-center"><span className={`px-3 py-1 rounded-full text-[10px] font-bold ${checkIsLowStock(p) ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>{p.stock}</span></td>
                           <td className="px-6 py-5 text-center"><button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-2 text-slate-300 hover:text-sky-600"><Edit size={16}/></button></td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                </div>
              </div>
            )}

            {mode === AppMode.SETTINGS && (
              <div className="p-4 md:p-8 max-w-4xl mx-auto pb-20">
                <h2 className="text-2xl font-bold mb-10 flex items-center gap-3"><Settings className="text-sky-600" /> {t.setting_title}</h2>
                <div className="bg-white p-10 rounded-[3rem] border shadow-sm mb-10">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-8">{t.store_name}</h3>
                  <div className="flex flex-col md:flex-row gap-12">
                    <div className="flex flex-col items-center gap-4">
                      <div onClick={() => logoInputRef.current?.click()} className="w-40 h-40 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] flex items-center justify-center cursor-pointer overflow-hidden relative group hover:border-sky-500">
                        {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <div className="text-slate-300"><ImagePlus size={32}/></div>}
                        {isUploading && <div className="absolute inset-0 bg-white/50 flex items-center justify-center"><Loader2 className="animate-spin text-sky-600"/></div>}
                      </div>
                      <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </div>
                    <div className="flex-1 space-y-6">
                      <input value={storeProfile.name} onChange={e => setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" placeholder={t.store_name}/>
                      <textarea value={storeProfile.address} onChange={e => setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none h-24" placeholder={t.store_address}/>
                      <button onClick={saveStoreProfile} className="bg-sky-600 text-white px-10 py-4 rounded-2xl font-bold shadow-xl">{t.save_store}</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {mode === AppMode.POS && (
              <div className="flex h-full flex-col md:flex-row overflow-hidden bg-slate-50/50">
                <div className="flex-1 p-4 md:p-6 overflow-y-auto pb-24">
                   <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                     {products.map(p => (
                       <button key={p.id} onClick={() => setCart(prev => {
                         const exist = prev.find(i => i.id === p.id);
                         return exist ? prev.map(i => i.id === p.id ? {...i, quantity: i.quantity + 1} : i) : [...prev, {...p, quantity: 1}];
                       })} className="bg-white p-5 rounded-[2rem] border shadow-sm hover:border-sky-300 transition-all text-left flex flex-col active:scale-95">
                         <div className={`w-full aspect-square rounded-2xl ${p.color} mb-4 flex items-center justify-center text-3xl font-bold overflow-hidden`}>
                           {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : p.name.charAt(0)}
                         </div>
                         <h4 className="font-bold text-slate-800 text-sm mb-1 truncate">{p.name}</h4>
                         <p className="text-sky-600 font-bold text-sm">{formatCurrency(p.price, language)}</p>
                       </button>
                     ))}
                   </div>
                </div>
                <div className="w-full md:w-96 bg-white border-l shadow-2xl flex flex-col">
                   <div className="p-6 border-b font-bold flex justify-between"><h2>{t.pos_cart_title}</h2><button onClick={()=>setCart([])} className="text-xs text-rose-500 uppercase">{t.pos_clear_cart}</button></div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-3">{cart.map((item, idx) => (<div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border"><div className="flex-1 font-bold text-xs truncate">{item.name}</div><div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border"><button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))}><Minus size={12}/></button><span className="text-xs font-bold w-4 text-center">{item.quantity}</span><button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))}><Plus size={12}/></button></div></div>))}</div>
                   <div className="p-8 border-t space-y-4">
                      <div className="flex justify-between items-center font-bold"><span>{t.pos_net_total}</span><span className="text-3xl text-sky-600">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span></div>
                      <button onClick={()=>setIsPaymentModalOpen(true)} disabled={cart.length === 0} className="w-full bg-sky-600 text-white py-5 rounded-[2rem] font-bold shadow-xl">{t.pos_pay}</button>
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[4rem] w-full max-w-sm p-12 text-center shadow-2xl">
             <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-[3rem] flex items-center justify-center mx-auto mb-8"><DollarSign size={40}/></div>
             <h3 className="text-5xl font-bold mb-12 text-slate-800 tracking-tighter">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</h3>
             <button onClick={() => {
                const total = cart.reduce((s,i)=>s+(i.price*i.quantity),0);
                const order = { id: uuidv4(), items: [...cart], total, date: new Date().toLocaleString(), timestamp: Date.now(), paymentMethod: 'cash', status: 'Paid' as OrderStatus };
                if (isCloudActive && db) try { setDoc(doc(db, 'sales', order.id), order); } catch(e){}
                setRecentSales(prev => [order, ...prev]); setCurrentOrder(order); setCart([]); setIsPaymentModalOpen(false); setShowReceipt(true);
             }} className="w-full bg-sky-600 text-white py-6 rounded-[2.5rem] font-bold shadow-xl">{t.pos_pay}</button>
             <button onClick={()=>setIsPaymentModalOpen(false)} className="mt-4 text-slate-300 text-[10px] font-bold uppercase">{t.cancel}</button>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl">
            <div className="flex justify-between items-center mb-8"><h3 className="text-2xl font-bold">{editingProduct ? t.save : t.stock_add}</h3><button onClick={()=>setIsProductModalOpen(false)}><X/></button></div>
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
              setProducts(prev => [...prev.filter(x => x.id !== p.id), p]); setIsProductModalOpen(false);
            }} className="space-y-4">
              <input name="name" placeholder="Name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
              <input name="code" placeholder="SKU" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
              <div className="grid grid-cols-2 gap-4">
                <input name="cost" type="number" placeholder="Cost" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
                <input name="price" type="number" placeholder="Price" required defaultValue={editingProduct?.price} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none text-sky-600" />
              </div>
              <input name="stock" type="number" placeholder="Stock" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
              <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-2xl font-bold shadow-lg">{t.save}</button>
            </form>
          </div>
        </div>
      )}

      {showReceipt && currentOrder && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-xl">
            <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden p-10 flex flex-col shadow-2xl text-center">
              <div className="mb-8 pb-8 border-b-2 border-dashed">
                <h2 className="text-lg font-bold">{storeProfile.name}</h2>
                <p className="text-xs text-slate-400">{storeProfile.address}</p>
              </div>
              <div className="space-y-3 mb-8 text-left">{currentOrder.items.map((it, i) => (<div key={i} className="flex justify-between"><span>{it.name} x{it.quantity}</span><span className="font-bold">{formatCurrency(it.price * it.quantity, language)}</span></div>))}</div>
              <div className="text-3xl font-bold mb-8">{formatCurrency(currentOrder.total, language)}</div>
              <button onClick={()=>setShowReceipt(false)} className="w-full py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold">CLOSE</button>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
