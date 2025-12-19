
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Minus, Trash2, Edit, LayoutDashboard, Settings, 
  Package, ClipboardList, BarChart3, Tag, X, Search,
  ShoppingCart, Coffee, TrendingUp, CheckCircle2, Save, Send, Bot
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AppMode, Product, CartItem, SaleRecord, StoreProfile, Language, Promotion, PromoTier, Role, Message } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { db, collection, doc, setDoc, onSnapshot, query, orderBy } from './services/firebase';
import { streamResponse } from './services/gemini';

// --- Utility Functions ---
const formatCurrency = (amount: number, lang: Language) => {
  return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : (lang === 'en' ? 'en-US' : 'lo-LA'), { 
    style: 'currency', currency: 'LAK', maximumFractionDigits: 0 
  }).format(amount);
};

const COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-purple-500'];

const App: React.FC = () => {
  // Navigation
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');
  const [isCloudActive] = useState(true);

  // Core Data
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>({
    name: "Coffee Please", address: "Vientiane", phone: "020-5555-9999", logoUrl: null
  });

  // Transaction State
  const [billItems, setBillItems] = useState<CartItem[]>([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [skuSearch, setSkuSearch] = useState('');

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);

  const t = translations[language];

  // --- Real-time Sync ---
  useEffect(() => {
    if (db) {
      const unsubP = onSnapshot(collection(db, 'products'), s => setProducts(s.docs.map(d => ({...d.data(), id: d.id} as Product))));
      const unsubS = onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), s => setRecentSales(s.docs.map(d => ({...d.data(), id: d.id} as SaleRecord))));
      const unsubPr = onSnapshot(collection(db, 'promotions'), s => setPromotions(s.docs.map(d => ({...d.data(), id: d.id} as Promotion))));
      return () => { unsubP(); unsubS(); unsubPr(); };
    }
  }, []);

  // --- Logic Helpers ---
  const getDynamicPrice = (product: Product, quantity: number) => {
    const promo = promotions.find(p => p.targetProductId === product.id && p.isActive);
    if (!promo || !promo.tiers.length) return product.price;
    const sortedTiers = [...promo.tiers].sort((a, b) => b.minQty - a.minQty);
    const tier = sortedTiers.find(t => quantity >= t.minQty);
    return tier ? tier.unitPrice : product.price;
  };

  const updateItemQty = (id: string, qty: number) => {
    const safeQty = Math.max(1, qty);
    setBillItems(prev => prev.map(it => {
      if (it.id === id) {
        return { ...it, quantity: safeQty, price: getDynamicPrice(it, safeQty) };
      }
      return it;
    }));
  };

  const addToCart = (p: Product) => {
    setBillItems(prev => {
      const exist = prev.find(i => i.id === p.id);
      const nQty = exist ? exist.quantity + 1 : 1;
      const nPrice = getDynamicPrice(p, nQty);
      if (exist) return prev.map(i => i.id === p.id ? {...i, quantity: nQty, price: nPrice} : i);
      return [...prev, {...p, quantity: 1, price: nPrice}];
    });
  };

  const saveOrder = async () => {
    const orderTotal = billItems.reduce((s, i) => s + (i.price * i.quantity), 0) - billDiscount;
    const order: SaleRecord = {
      id: uuidv4(), items: [...billItems], subtotal: orderTotal + billDiscount, 
      discount: billDiscount, total: orderTotal, date: new Date().toLocaleString(),
      timestamp: Date.now(), status: 'Paid', customerName: customerName || 'Walk-in'
    };
    if (db) await setDoc(doc(db, 'sales', order.id), order);
    setIsBillModalOpen(false);
    setBillItems([]);
    setBillDiscount(0);
    setCustomerName('');
  };

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={()=>{}} language={language} setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between shadow-sm">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2"><LayoutDashboard /></button>
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center text-white"><Coffee size={22}/></div>
             <h2 className="font-black text-slate-800 uppercase tracking-tight">{mode}</h2>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{storeProfile.name}</p>
                <p className="text-[9px] text-emerald-500 font-bold uppercase">System Online</p>
             </div>
             <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm overflow-hidden">
                <img src={`https://ui-avatars.com/api/?name=${storeProfile.name}&background=0ea5e9&color=fff`} alt="store" />
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {/* RENDER CURRENT VIEW */}
          <div className="max-w-7xl mx-auto space-y-6">
            
            {mode === AppMode.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in">
                 {[
                   { label: t.dash_sales, val: recentSales.reduce((a,b)=>a+b.total,0), color: 'sky', icon: TrendingUp },
                   { label: t.menu_orders, val: recentSales.length, color: 'purple', icon: ClipboardList, unit: 'Bills' },
                   { label: t.stock_title, val: products.length, color: 'emerald', icon: Package, unit: 'Items' },
                   { label: t.dash_low_stock, val: products.filter(p=>p.stock <= 5).length, color: 'rose', icon: CheckCircle2, unit: 'Alerts' }
                 ].map((card, i) => (
                   <div key={i} className="bg-white p-8 rounded-[2.5rem] border shadow-sm group hover:border-sky-500 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.label}</span>
                        <div className={`p-3 rounded-2xl bg-${card.color}-50 text-${card.color}-500 group-hover:scale-110 transition-transform`}><card.icon size={20}/></div>
                      </div>
                      <h3 className="text-3xl font-black text-slate-900">{card.unit ? `${card.val} ${card.unit}` : formatCurrency(card.val, language)}</h3>
                   </div>
                 ))}
              </div>
            )}

            {mode === AppMode.ORDERS && (
              <div className="space-y-6 animate-in slide-in-from-bottom-5">
                 <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><ClipboardList className="text-sky-500"/> {t.menu_orders}</h2>
                    <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-sky-700 transition-all flex items-center gap-2">
                       <Plus size={20}/> {t.order_create_bill}
                    </button>
                 </div>
                 <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-8 py-5">Date/Bill</th><th className="px-8 py-5">Customer</th><th className="px-8 py-5 text-right">Amount</th><th className="px-8 py-5 text-center">Status</th></tr>
                       </thead>
                       <tbody className="divide-y text-sm font-bold">
                          {recentSales.map(s => (
                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-8 py-5"><div className="text-slate-800">{s.date}</div><div className="text-[10px] text-slate-300 font-mono">#{s.id.slice(0,8)}</div></td>
                               <td className="px-8 py-5 text-slate-600">{s.customerName}</td>
                               <td className="px-8 py-5 text-right text-sky-600 font-black">{formatCurrency(s.total, language)}</td>
                               <td className="px-8 py-5 text-center"><span className="bg-emerald-100 text-emerald-600 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider">{t.pay_paid}</span></td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
            )}

            {mode === AppMode.STOCK && (
              <div className="space-y-6 animate-in slide-in-from-bottom-5">
                 <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Package className="text-sky-500"/> {t.stock_title}</h2>
                    <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black hover:bg-black transition-all">
                       {t.stock_add}
                    </button>
                 </div>
                 <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-8 py-5">Product Info</th><th className="px-8 py-5 text-right">Cost</th><th className="px-8 py-5 text-right">Retail</th><th className="px-8 py-5 text-center">In Stock</th><th className="px-8 py-5 text-center">Edit</th></tr>
                       </thead>
                       <tbody className="divide-y text-sm font-bold">
                          {products.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-8 py-5 flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-xl ${p.color || 'bg-slate-200'} flex items-center justify-center text-white font-black shadow-sm`}>{p.name.charAt(0)}</div>
                                  <div><div className="text-slate-800">{p.name}</div><div className="text-[10px] text-slate-300 font-mono">SKU: {p.code}</div></div>
                               </td>
                               <td className="px-8 py-5 text-right text-slate-400">{formatCurrency(p.cost, language)}</td>
                               <td className="px-8 py-5 text-right text-sky-600 font-black">{formatCurrency(p.price, language)}</td>
                               <td className="px-8 py-5 text-center"><span className={`px-4 py-1 rounded-xl text-[10px] font-black ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-50 text-emerald-600'}`}>{p.stock}</span></td>
                               <td className="px-8 py-5 text-center"><button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-2 text-slate-300 hover:text-sky-600 transition-colors"><Edit size={18}/></button></td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
            )}

            {mode === AppMode.PROMOTIONS && (
              <div className="space-y-6 animate-in slide-in-from-bottom-5">
                 <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Tag className="text-sky-500"/> {t.menu_promotions}</h2>
                    <button onClick={()=>{setEditingPromo(null); setIsPromoModalOpen(true);}} className="bg-sky-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-sky-700 transition-all flex items-center gap-2">
                       <Plus size={20}/> {t.promo_add}
                    </button>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {promotions.map(promo => {
                       const target = products.find(p => p.id === promo.targetProductId);
                       return (
                          <div key={promo.id} className="bg-white p-8 rounded-[2.5rem] border shadow-sm relative group hover:border-sky-500 transition-all border-b-8 border-b-sky-500">
                             <button onClick={() => setPromotions(prev => prev.filter(x=>x.id!==promo.id))} className="absolute top-6 right-6 p-2 text-slate-200 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
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
          </div>
        </div>
      </main>

      {/* --- MODALS --- */}

      {/* BILLING MODAL (THE MAIN FIX) */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[500] flex items-center justify-center p-4 backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-[4rem] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/20">
             
             {/* Left: Cart Area */}
             <div className="w-full md:w-[40%] bg-slate-50 border-r flex flex-col h-full">
                <div className="p-8 border-b bg-white">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><ShoppingCart className="text-sky-500"/> Current Cart</h3>
                      <button onClick={()=>setIsBillModalOpen(false)} className="p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20}/></button>
                   </div>
                   <input value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none focus:border-sky-500 transition-all" placeholder={t.order_cust_name} />
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                   {billItems.map((it, idx) => (
                      <div key={it.id} className="flex items-center gap-4 p-4 bg-white rounded-[2rem] border shadow-sm group">
                         <div className={`w-12 h-12 rounded-xl ${it.color || 'bg-slate-200'} flex items-center justify-center font-black text-white`}>{it.name.charAt(0)}</div>
                         <div className="flex-1 min-w-0">
                            <div className="text-sm font-black text-slate-800 truncate">{it.name}</div>
                            <div className="text-xs font-bold text-sky-600">{formatCurrency(it.price, language)}</div>
                         </div>
                         <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border">
                            <button onClick={()=>updateItemQty(it.id, it.quantity - 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-400 hover:text-sky-600"><Minus size={14}/></button>
                            
                            {/* FIX: INPUT BOX FOR QUANTITY - Supports 1, 50, 5000 units easily */}
                            <input 
                              type="number"
                              className="w-16 text-center font-black text-lg bg-transparent border-none outline-none focus:text-sky-600"
                              value={it.quantity}
                              onChange={(e) => updateItemQty(it.id, parseInt(e.target.value) || 0)}
                            />

                            <button onClick={()=>updateItemQty(it.id, it.quantity + 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-400 hover:text-sky-600"><Plus size={14}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter(x=>x.id!==it.id))} className="p-2 text-rose-300 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
                      </div>
                   ))}
                   {billItems.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-20 font-black text-xs uppercase">Your cart is empty</div>}
                </div>

                <div className="p-8 border-t bg-white space-y-6">
                   <div className="flex justify-between items-center text-sm font-black text-slate-400">
                      <span>Subtotal</span>
                      <span className="text-slate-800 font-bold">{formatCurrency(billItems.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span>
                   </div>
                   <div className="flex justify-between items-end border-t pt-6">
                      <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Net Payable</div>
                      <div className="text-5xl font-black text-sky-600 tracking-tighter">
                         {formatCurrency(Math.max(0, billItems.reduce((s,i)=>s+(i.price*i.quantity),0) - billDiscount), language).split(" ")[0]}
                      </div>
                   </div>
                   <button onClick={saveOrder} disabled={billItems.length === 0} className="w-full py-6 bg-sky-600 text-white rounded-[2rem] font-black text-xl shadow-xl hover:bg-sky-700 disabled:opacity-20 active:scale-95 transition-all">CHECKOUT NOW</button>
                </div>
             </div>

             {/* Right: Picker Area */}
             <div className="flex-1 p-8 flex flex-col bg-white overflow-hidden">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                   <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Browse Products</h4>
                   <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border-2 w-full max-w-md focus-within:border-sky-500 transition-all">
                      <Search className="text-slate-300" size={20} />
                      <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="bg-transparent outline-none flex-1 font-bold" />
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pr-4 custom-scrollbar">
                   {products.filter(p => !skuSearch || p.code.toLowerCase().includes(skuSearch.toLowerCase()) || p.name.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => addToCart(p)} className="bg-white p-5 rounded-[2.5rem] border shadow-sm hover:border-sky-500 hover:shadow-xl transition-all flex flex-col group active:scale-95 text-left">
                         <div className={`w-full aspect-square rounded-[2rem] ${p.color || 'bg-slate-200'} mb-4 flex items-center justify-center text-4xl font-black text-white shadow-lg group-hover:scale-105 transition-all`}>{p.name.charAt(0)}</div>
                         <h4 className="font-black text-slate-800 text-sm leading-tight mb-1 truncate">{p.name}</h4>
                         <div className="mt-auto flex justify-between items-end pt-2">
                            <span className="text-sky-600 font-black text-xl">{formatCurrency(p.price, language).split(" ")[0]}</span>
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${p.stock <= 5 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{p.stock}</span>
                         </div>
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* OTHER MODALS (PRODUCT, PROMO) WITH EXPLICIT CLOSE BUTTONS */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-xl animate-in zoom-in-95">
          <div className="bg-white rounded-[3rem] w-full max-w-xl p-10 shadow-2xl relative border border-white/20">
             <button onClick={()=>setIsProductModalOpen(false)} className="absolute top-6 right-6 p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20} /></button>
             <h3 className="text-2xl font-black mb-10 text-slate-800 flex items-center gap-4">
                <div className="p-2 bg-sky-500 text-white rounded-lg shadow-lg"><Package size={20} /></div> 
                {editingProduct ? 'Edit Product' : 'New Item'}
             </h3>
             <form onSubmit={async (e) => {
               e.preventDefault(); const fd = new FormData(e.currentTarget);
               const p = { 
                 id: editingProduct?.id || uuidv4(), name: fd.get('name') as string, code: fd.get('code') as string,
                 cost: parseFloat(fd.get('cost') as string) || 0, price: parseFloat(fd.get('price') as string) || 0,
                 stock: parseInt(fd.get('stock') as string) || 0, category: 'General',
                 color: editingProduct?.color || COLORS[Math.floor(Math.random()*COLORS.length)] + " text-white"
               };
               if (db) await setDoc(doc(db, 'products', p.id), p);
               setIsProductModalOpen(false);
             }} className="space-y-6">
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none focus:border-sky-500" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SKU Code</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none focus:border-sky-500" /></div>
                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cost</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none focus:border-sky-500" /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Retail Price</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-4 bg-sky-50 border-2 border-sky-100 rounded-xl font-black text-sky-600 text-xl outline-none" /></div>
                </div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Opening Stock</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none focus:border-sky-500" /></div>
                <div className="flex gap-4 pt-4">
                   <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest">Cancel</button>
                   <button type="submit" className="flex-[2] py-5 bg-sky-600 text-white rounded-2xl font-black text-lg shadow-xl uppercase tracking-widest">Save Product</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* PROMO MODAL - WITH 7 TIERS SETUP */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-xl animate-in zoom-in-95">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl p-10 shadow-2xl relative border border-white/20 max-h-[90vh] overflow-y-auto custom-scrollbar">
             <button onClick={()=>setIsPromoModalOpen(false)} className="absolute top-6 right-6 p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20} /></button>
             <h3 className="text-2xl font-black mb-8 text-slate-800 flex items-center gap-4">
                <div className="p-2 bg-sky-500 text-white rounded-lg shadow-lg"><Tag size={20} /></div> Wholesale Setup
             </h3>
             <form onSubmit={async (e) => {
               e.preventDefault(); const fd = new FormData(e.currentTarget);
               const tiers: PromoTier[] = [];
               for(let i=1; i<=7; i++) {
                 const q = fd.get(`qty_${i}`); const pr = fd.get(`price_${i}`);
                 if (q && pr && Number(q) > 0) tiers.push({ minQty: Number(q), unitPrice: Number(pr) });
               }
               const promo: Promotion = {
                 id: editingPromo?.id || uuidv4(), name: fd.get('name') as string,
                 targetProductId: fd.get('productId') as string, isActive: true, tiers
               };
               if (db) await setDoc(doc(db, 'promotions', promo.id), promo);
               setIsPromoModalOpen(false);
             }} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Target Product</label>
                      <select name="productId" required defaultValue={editingPromo?.targetProductId} className="w-full p-4 bg-slate-50 border rounded-xl font-bold">
                         {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                   </div>
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Promo Label</label>
                      <input name="name" required defaultValue={editingPromo?.name} className="w-full p-4 bg-slate-50 border rounded-xl font-bold" placeholder="Gold Pricing" />
                   </div>
                </div>
                <div className="space-y-3 pt-4 border-t">
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Configure 7 Tiers</p>
                   <div className="grid grid-cols-1 gap-2">
                      {[1,2,3,4,5,6,7].map(n => (
                        <div key={n} className="flex gap-4 items-center bg-slate-50 p-3 rounded-2xl border">
                           <span className="w-8 text-[9px] font-black text-slate-300 tracking-tighter">Tier {n}</span>
                           <input name={`qty_${n}`} type="number" placeholder="Min Qty" defaultValue={editingPromo?.tiers[n-1]?.minQty} className="flex-1 p-3 bg-white border rounded-xl font-bold text-center" />
                           <span className="text-slate-300">→</span>
                           <input name={`price_${n}`} type="number" placeholder="Unit Price" defaultValue={editingPromo?.tiers[n-1]?.unitPrice} className="flex-1 p-3 bg-sky-50 border border-sky-100 rounded-xl font-black text-sky-600 text-center" />
                        </div>
                      ))}
                   </div>
                </div>
                <div className="flex gap-4 pt-6">
                   <button type="button" onClick={()=>setIsPromoModalOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest">Cancel</button>
                   <button type="submit" className="flex-[2] py-5 bg-sky-600 text-white rounded-2xl font-black text-lg shadow-xl uppercase tracking-widest">Save Promotion</button>
                </div>
             </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
