
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Minus, Trash2, Edit, LayoutDashboard, Settings, 
  Package, ClipboardList, BarChart3, Tag, X, Search,
  ShoppingCart, Coffee, TrendingUp, CheckCircle2, Save, Send, Bot, 
  User, Download, Upload, AlertCircle, FileText, Smartphone
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AppMode, Product, CartItem, SaleRecord, StoreProfile, Language, Promotion, PromoTier, Role, Message } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { db, collection, doc, setDoc, onSnapshot, query, orderBy } from './services/firebase';
import { streamResponse } from './services/gemini';

// --- Shared Components ---
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 ${className}`}>{children}</div>
);

const IconButton: React.FC<{ icon: any; onClick: () => void; color?: string }> = ({ icon: Icon, onClick, color = "sky" }) => (
  <button onClick={onClick} className={`p-3 rounded-2xl bg-${color}-50 text-${color}-600 hover:bg-${color}-600 hover:text-white transition-all active:scale-95`}>
    <Icon size={20} />
  </button>
);

// --- Main App ---
const App: React.FC = () => {
  // Navigation
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');

  // Core Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : { name: "Coffee Please", address: "Vientiane", phone: "020-5555-9999", logoUrl: null };
  });

  // Active Transaction State
  const [billItems, setBillItems] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [skuSearch, setSkuSearch] = useState('');

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);

  const t = translations[language];

  // --- Real-time Firebase Sync ---
  useEffect(() => {
    if (!db) return;
    const unsubP = onSnapshot(collection(db, 'products'), s => setProducts(s.docs.map(d => ({ ...d.data(), id: d.id } as Product))));
    const unsubS = onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), s => setRecentSales(s.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord))));
    const unsubPr = onSnapshot(collection(db, 'promotions'), s => setPromotions(s.docs.map(d => ({ ...d.data(), id: d.id } as Promotion))));
    return () => { unsubP(); unsubS(); unsubPr(); };
  }, []);

  // --- Calculations ---
  const getProductPrice = (product: Product, quantity: number) => {
    const promo = promotions.find(p => p.targetProductId === product.id && p.isActive);
    if (!promo || !promo.tiers.length) return product.price;
    const sortedTiers = [...promo.tiers].sort((a, b) => b.minQty - a.minQty);
    const tier = sortedTiers.find(t => quantity >= t.minQty);
    return tier ? tier.unitPrice : product.price;
  };

  const updateCartQuantity = (id: string, qty: number) => {
    const safeQty = Math.max(1, qty);
    setBillItems(prev => prev.map(it => {
      if (it.id === id) {
        return { ...it, quantity: safeQty, price: getProductPrice(it, safeQty) };
      }
      return it;
    }));
  };

  const addToCart = (p: Product) => {
    setBillItems(prev => {
      const exist = prev.find(i => i.id === p.id);
      const nQty = exist ? exist.quantity + 1 : 1;
      const nPrice = getProductPrice(p, nQty);
      if (exist) return prev.map(i => i.id === p.id ? { ...i, quantity: nQty, price: nPrice } : i);
      return [...prev, { ...p, quantity: 1, price: nPrice }];
    });
  };

  const handleCheckout = async () => {
    const total = billItems.reduce((s, i) => s + (i.price * i.quantity), 0);
    const order: SaleRecord = {
      id: uuidv4(), items: [...billItems], subtotal: total, discount: 0, total, 
      date: new Date().toLocaleString(), timestamp: Date.now(), status: 'Paid', customerName: customerName || 'Walk-in'
    };
    if (db) await setDoc(doc(db, 'sales', order.id), order);
    setIsBillModalOpen(false); setBillItems([]); setCustomerName('');
  };

  // --- UI Render Parts ---
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(language === 'th' ? 'th-TH' : 'lo-LA', { style: 'currency', currency: 'LAK', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={()=>{}} language={language} setLanguage={setLanguage} 
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between no-print shadow-sm z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-400"><LayoutDashboard /></button>
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center text-white"><Coffee size={20}/></div>
             <h2 className="font-black text-slate-800 uppercase tracking-tight">{mode}</h2>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{storeProfile.name}</p>
                <div className="flex items-center gap-1 justify-end">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                   <p className="text-[9px] text-emerald-600 font-bold uppercase">Online</p>
                </div>
             </div>
             <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm overflow-hidden">
                <img src={`https://ui-avatars.com/api/?name=${storeProfile.name}&background=0ea5e9&color=fff`} alt="store" />
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-8">

            {/* DASHBOARD VIEW */}
            {mode === AppMode.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in">
                 {[
                   { label: t.dash_sales, val: recentSales.reduce((a, b) => a + b.total, 0), icon: TrendingUp, color: "sky" },
                   { label: t.menu_orders, val: recentSales.length, icon: ClipboardList, color: "purple", unit: "Bills" },
                   { label: t.stock_title, val: products.length, icon: Package, color: "emerald", unit: "Items" },
                   { label: t.dash_low_stock, val: products.filter(p => p.stock <= 5).length, icon: AlertCircle, color: "rose", unit: "Alert" }
                 ].map((card, i) => (
                   <Card key={i} className="group hover:border-sky-500 transition-all cursor-default">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.label}</span>
                        <div className={`p-3 rounded-2xl bg-${card.color}-50 text-${card.color}-600 group-hover:scale-110 transition-transform`}><card.icon size={20}/></div>
                      </div>
                      <h3 className="text-3xl font-black text-slate-900">{card.unit ? `${card.val} ${card.unit}` : formatMoney(card.val)}</h3>
                   </Card>
                 ))}
                 <Card className="md:col-span-2 lg:col-span-4 border-dashed bg-slate-50/50">
                    <div className="flex items-center gap-6">
                       <div className="p-5 bg-sky-500 text-white rounded-[2rem] shadow-lg shadow-sky-500/20"><Coffee size={40}/></div>
                       <div className="flex-1">
                          <h4 className="text-xl font-black text-slate-800">ยินดีต้อนรับกลับมา, {storeProfile.name}!</h4>
                          <p className="text-slate-500 font-medium">คุณมีการขาย {recentSales.length} รายการในวันนี้ เริ่มเปิดบิลใหม่ได้เลย</p>
                       </div>
                       <button onClick={() => setIsBillModalOpen(true)} className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-black hover:bg-black transition-all shadow-xl">
                          {t.order_create_bill}
                       </button>
                    </div>
                 </Card>
              </div>
            )}

            {/* ORDERS VIEW */}
            {mode === AppMode.ORDERS && (
              <div className="space-y-6 animate-in slide-in-from-bottom-5">
                 <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><ClipboardList className="text-sky-500"/> {t.menu_orders}</h2>
                    <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-sky-700 transition-all flex items-center gap-2">
                       <Plus size={20}/> {t.order_create_bill}
                    </button>
                 </div>
                 <div className="bg-white rounded-[2.5rem] border overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-8 py-5">Date / ID</th><th className="px-8 py-5">Customer</th><th className="px-8 py-5 text-right">Total</th><th className="px-8 py-5 text-center">Status</th></tr>
                       </thead>
                       <tbody className="divide-y text-sm font-bold">
                          {recentSales.map(s => (
                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-8 py-5"><div className="text-slate-800">{s.date}</div><div className="text-[10px] text-slate-300 font-mono tracking-tighter uppercase">#{s.id.slice(0,8)}</div></td>
                               <td className="px-8 py-5 text-slate-600">{s.customerName}</td>
                               <td className="px-8 py-5 text-right text-sky-600 font-black">{formatMoney(s.total)}</td>
                               <td className="px-8 py-5 text-center"><span className="bg-emerald-100 text-emerald-600 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase">{t.pay_paid}</span></td>
                            </tr>
                          ))}
                          {recentSales.length === 0 && <tr><td colSpan={4} className="p-20 text-center text-slate-300 uppercase font-black tracking-widest italic">No orders recorded</td></tr>}
                       </tbody>
                    </table>
                 </div>
              </div>
            )}

            {/* STOCK VIEW */}
            {mode === AppMode.STOCK && (
              <div className="space-y-6 animate-in slide-in-from-bottom-5">
                 <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Package className="text-sky-500"/> {t.stock_title}</h2>
                    <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black hover:bg-black transition-all">
                       {t.stock_add}
                    </button>
                 </div>
                 <div className="bg-white rounded-[2.5rem] border overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-8 py-5">Item</th><th className="px-8 py-5 text-right">Cost</th><th className="px-8 py-5 text-right">Retail</th><th className="px-8 py-5 text-center">In Stock</th><th className="px-8 py-5 text-center">Edit</th></tr>
                       </thead>
                       <tbody className="divide-y text-sm font-bold">
                          {products.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-8 py-5 flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-xl ${p.color || 'bg-slate-200'} flex items-center justify-center text-white font-black shadow-sm`}>{p.name.charAt(0)}</div>
                                  <div><div className="text-slate-800">{p.name}</div><div className="text-[10px] text-slate-300 font-mono uppercase tracking-tighter">{p.code}</div></div>
                               </td>
                               <td className="px-8 py-5 text-right text-slate-400 font-medium">{formatMoney(p.cost)}</td>
                               <td className="px-8 py-5 text-right text-sky-600 font-black">{formatMoney(p.price)}</td>
                               <td className="px-8 py-5 text-center"><span className={`px-4 py-1 rounded-xl text-[10px] font-black uppercase ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-50 text-emerald-600'}`}>{p.stock}</span></td>
                               <td className="px-8 py-5 text-center">
                                  <button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-2 text-slate-300 hover:text-sky-600 transition-colors"><Edit size={18}/></button>
                               </td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
            )}

            {/* REPORTS VIEW - NEW IMPLEMENTATION */}
            {mode === AppMode.REPORTS && (
              <div className="space-y-8 animate-in fade-in">
                 <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><BarChart3 className="text-sky-500"/> {t.menu_reports}</h2>
                    <div className="flex gap-2 bg-white p-1.5 rounded-2xl border">
                       <button className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest">Daily</button>
                       <button className="px-6 py-2 text-slate-400 hover:text-slate-800 rounded-xl text-xs font-black uppercase tracking-widest">Monthly</button>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-sky-600 text-white border-0 shadow-xl shadow-sky-600/20">
                       <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Total Net Income</p>
                       <h3 className="text-3xl font-black">{formatMoney(recentSales.reduce((a,b)=>a+b.total, 0))}</h3>
                    </Card>
                    <Card>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Item Cost</p>
                       <h3 className="text-3xl font-black text-slate-800">{formatMoney(recentSales.reduce((a,b)=>a+(b.items.reduce((s,i)=>s+(i.cost*i.quantity),0)), 0))}</h3>
                    </Card>
                    <Card>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross Profit</p>
                       <h3 className="text-3xl font-black text-emerald-500">{formatMoney(recentSales.reduce((a,b)=>a+b.total,0) - recentSales.reduce((a,b)=>a+(b.items.reduce((s,i)=>s+(i.cost*i.quantity),0)), 0))}</h3>
                    </Card>
                 </div>
                 <Card className="p-0 overflow-hidden">
                    <div className="p-8 border-b flex justify-between items-center">
                       <h4 className="font-black text-slate-800 uppercase tracking-tight">Best Selling Items</h4>
                       <FileText className="text-slate-200" />
                    </div>
                    <div className="divide-y">
                       {products.sort((a,b)=>b.stock-a.stock).slice(0, 5).map((p, i)=>(
                         <div key={i} className="px-8 py-5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                               <div className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg text-xs font-black text-slate-400">0{i+1}</div>
                               <span className="font-bold text-slate-700">{p.name}</span>
                            </div>
                            <span className="font-black text-sky-600">{formatMoney(p.price)}</span>
                         </div>
                       ))}
                    </div>
                 </Card>
              </div>
            )}

            {/* SETTINGS VIEW - NEW IMPLEMENTATION */}
            {mode === AppMode.SETTINGS && (
              <div className="space-y-8 animate-in fade-in">
                 <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Settings className="text-sky-500"/> {t.menu_settings}</h2>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card>
                       <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-8 flex items-center gap-2 border-b pb-4"><Coffee size={16}/> Store Profile</h4>
                       <div className="space-y-5">
                          <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Store Name</label><input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-xl font-bold" /></div>
                          <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Address</label><textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-xl font-bold h-24" /></div>
                          <button onClick={()=>{localStorage.setItem('pos_profile', JSON.stringify(storeProfile)); alert('Saved!');}} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2"><Save size={16}/> Save Profile</button>
                       </div>
                    </Card>
                    <Card className="bg-slate-900 text-white border-0">
                       <h4 className="font-black uppercase tracking-widest text-xs mb-8 flex items-center gap-2 border-b border-slate-800 pb-4 text-sky-400"><Smartphone size={16}/> App Options</h4>
                       <div className="space-y-4">
                          <div className="flex justify-between items-center p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                             <div><p className="font-bold text-sm">Offline Mode</p><p className="text-[10px] text-slate-500">Enable local data persistence</p></div>
                             <div className="w-12 h-6 bg-sky-500 rounded-full relative"><div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div></div>
                          </div>
                          <div className="p-8 border-2 border-dashed border-slate-700 rounded-[2rem] flex flex-col items-center justify-center gap-4 text-center">
                             <div className="p-4 bg-slate-800 rounded-full text-slate-500"><Download /></div>
                             <p className="text-xs font-bold text-slate-400">Backup your data regularly to prevent accidental loss</p>
                             <button className="px-8 py-3 bg-white text-slate-900 rounded-xl font-black uppercase text-[10px] tracking-widest">Download JSON</button>
                          </div>
                       </div>
                    </Card>
                 </div>
              </div>
            )}

            {/* AI VIEW */}
            {mode === AppMode.AI && (
              <div className="max-w-4xl mx-auto h-[75vh] flex flex-col bg-white rounded-[3rem] border shadow-2xl overflow-hidden animate-in zoom-in-95">
                 <div className="p-6 bg-slate-900 text-white flex items-center gap-4">
                    <div className="w-12 h-12 bg-sky-500 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-900/40"><Bot size={28}/></div>
                    <div><h3 className="font-black text-lg">AI Assistant</h3><p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">Powered by Gemini 3 Flash</p></div>
                 </div>
                 <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-slate-50/30">
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-10 font-black uppercase tracking-[0.2em]"><Bot size={100} /><p className="mt-4">Ask about your sales</p></div>
                 </div>
                 <div className="p-6 bg-white border-t">
                    <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border-2 focus-within:border-sky-500 transition-all">
                       <input placeholder="Ex: How many coffees did I sell today?" className="flex-1 bg-transparent outline-none px-4 font-bold" />
                       <button className="p-3 bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-all shadow-lg shadow-sky-600/20"><Send size={20}/></button>
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- MODALS --- */}

      {/* NEW BILL MODAL - FIXED QUANTITY ISSUE */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[500] flex items-center justify-center p-4 backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-[4rem] shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
             <div className="w-full md:w-[40%] bg-slate-50 border-r flex flex-col h-full">
                <div className="p-8 border-b bg-white">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><ShoppingCart className="text-sky-500"/> Current Cart</h3>
                      <button onClick={()=>setIsBillModalOpen(false)} className="p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20}/></button>
                   </div>
                   <input value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none focus:border-sky-500 transition-all" placeholder={t.order_cust_name} />
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                   {billItems.map(it => (
                      <div key={it.id} className="flex items-center gap-4 p-4 bg-white rounded-[2rem] border shadow-sm">
                         <div className={`w-12 h-12 rounded-xl ${it.color || 'bg-slate-200'} flex items-center justify-center font-black text-white`}>{it.name.charAt(0)}</div>
                         <div className="flex-1 min-w-0">
                            <div className="text-sm font-black text-slate-800 truncate">{it.name}</div>
                            <div className="text-xs font-bold text-sky-600">{formatMoney(it.price)}</div>
                         </div>
                         <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border">
                            <button onClick={()=>updateCartQuantity(it.id, it.quantity - 1)} className="p-1 hover:text-sky-600"><Minus size={16}/></button>
                            
                            {/* FIX: INPUT NUMBER FOR QUANTITY - TYPE 5000 EASILY */}
                            <input 
                              type="number"
                              className="w-16 text-center font-black bg-transparent border-none outline-none focus:text-sky-600"
                              value={it.quantity}
                              onChange={(e) => updateCartQuantity(it.id, parseInt(e.target.value) || 0)}
                            />

                            <button onClick={()=>updateCartQuantity(it.id, it.quantity + 1)} className="p-1 hover:text-sky-600"><Plus size={16}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter(x=>x.id!==it.id))} className="p-2 text-rose-300 hover:text-rose-500"><Trash2 size={18}/></button>
                      </div>
                   ))}
                   {billItems.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-20 font-black text-xs uppercase italic">Cart is empty</div>}
                </div>
                <div className="p-8 border-t bg-white space-y-6">
                   <div className="flex justify-between items-center text-sm font-black text-slate-400"><span>Subtotal</span><span>{formatMoney(billItems.reduce((s,i)=>s+(i.price*i.quantity),0))}</span></div>
                   <div className="flex justify-between items-end">
                      <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Total Payable</div>
                      <div className="text-5xl font-black text-sky-600 tracking-tighter">{formatMoney(billItems.reduce((s,i)=>s+(i.price*i.quantity),0)).split(" ")[0]}</div>
                   </div>
                   <button onClick={handleCheckout} disabled={billItems.length === 0} className="w-full py-6 bg-sky-600 text-white rounded-[2rem] font-black text-xl shadow-xl hover:bg-sky-700 transition-all uppercase active:scale-95">CHECKOUT</button>
                </div>
             </div>
             <div className="flex-1 p-8 flex flex-col bg-white">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                   <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Select Products</h4>
                   <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border-2 w-full max-w-md focus-within:border-sky-500 transition-all">
                      <Search className="text-slate-300" size={20} />
                      <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="bg-transparent outline-none flex-1 font-bold" />
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-4 gap-4 pr-2 custom-scrollbar">
                   {products.filter(p => !skuSearch || p.name.toLowerCase().includes(skuSearch.toLowerCase()) || p.code.includes(skuSearch)).map(p => (
                      <button key={p.id} onClick={()=>addToCart(p)} className="bg-white p-4 rounded-[2rem] border shadow-sm hover:border-sky-500 transition-all flex flex-col group active:scale-95 text-left h-fit">
                         <div className={`w-full aspect-square rounded-[1.5rem] ${p.color || 'bg-slate-100'} mb-3 flex items-center justify-center text-3xl font-black text-white shadow-lg group-hover:scale-105 transition-all`}>{p.name.charAt(0)}</div>
                         <h4 className="font-black text-slate-800 text-xs truncate mb-1">{p.name}</h4>
                         <div className="flex justify-between items-center mt-auto">
                            <span className="text-sky-600 font-black">{formatMoney(p.price).split(" ")[0]}</span>
                            <span className="text-[9px] font-black uppercase text-slate-300">Stock: {p.stock}</span>
                         </div>
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-xl animate-in zoom-in-95">
          <Card className="w-full max-w-xl p-10 relative">
             <button onClick={()=>setIsProductModalOpen(false)} className="absolute top-6 right-6 p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20}/></button>
             <h3 className="text-2xl font-black mb-10 text-slate-800 flex items-center gap-4"><Package className="text-sky-500"/> {editingProduct ? 'Edit Item' : 'New Item'}</h3>
             <form onSubmit={async (e) => {
                e.preventDefault(); const fd = new FormData(e.currentTarget);
                const p = {
                  id: editingProduct?.id || uuidv4(), name: fd.get('name') as string, code: fd.get('code') as string,
                  cost: Number(fd.get('cost')), price: Number(fd.get('price')), stock: Number(fd.get('stock')),
                  color: editingProduct?.color || "bg-sky-500", category: "General"
                };
                if (db) await setDoc(doc(db, 'products', p.id), p);
                setIsProductModalOpen(false);
             }} className="space-y-6">
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-xl font-bold" /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SKU Code</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border rounded-xl font-bold" /></div>
                <div className="grid grid-cols-2 gap-4">
                   <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cost</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border rounded-xl font-bold" /></div>
                   <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Retail Price</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-4 bg-sky-50 border-2 border-sky-100 rounded-xl font-black text-sky-600 text-xl" /></div>
                </div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Initial Stock</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-xl font-bold" /></div>
                <div className="flex gap-4 pt-4">
                   <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest">Cancel</button>
                   <button type="submit" className="flex-[2] py-5 bg-sky-600 text-white rounded-2xl font-black text-lg shadow-xl uppercase tracking-widest">Save Product</button>
                </div>
             </form>
          </Card>
        </div>
      )}

    </div>
  );
};

export default App;
