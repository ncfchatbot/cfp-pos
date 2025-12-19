
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, ShoppingCart, Plus, Minus, Trash2, Edit, Loader2, Store, Check, 
  LayoutDashboard, Settings, UploadCloud, ImagePlus, DollarSign, Package, 
  Eraser, Cloud, FileSpreadsheet, Send, Bot, ClipboardList, BarChart3, Tag, 
  Search, X, Truck, CreditCard, Clock, UserPlus
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Message, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, Language, Role, Promotion } from './types';
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
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
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

  return (
    <div className={`flex h-screen bg-slate-100 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={() => {}} language={language} setLanguage={setLanguage} 
      />
      
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 bg-white border-b md:hidden">
          <button onClick={()=>setIsSidebarOpen(true)} className="p-2"><Menu /></button>
          <span className="font-bold text-sky-600 truncate">{storeProfile.name}</span>
        </header>
        
        <div className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0 overflow-y-auto pb-20">
            {mode === AppMode.DASHBOARD && (
              <div className="p-4 md:p-8">
                <h2 className="text-2xl font-bold flex items-center gap-3 mb-8"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-6 rounded-[2rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase">{t.dash_sales}</p><h3 className="text-2xl font-bold text-sky-600">{formatCurrency(recentSales.reduce((s,o)=>s+o.total,0), language)}</h3></div>
                  <div className="bg-white p-6 rounded-[2rem] border shadow-sm"><p className="text-slate-400 text-[10px] font-bold uppercase">{t.dash_low_stock}</p><h3 className="text-2xl font-bold text-rose-500">{products.filter(p => p.stock <= 5).length}</h3></div>
                </div>
              </div>
            )}

            {mode === AppMode.ORDERS && (
              <div className="p-4 md:p-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3"><ClipboardList className="text-sky-600" /> {t.menu_orders}</h2>
                  <button onClick={()=>setIsBillModalOpen(true)} className="bg-sky-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg flex items-center gap-2"><Plus size={18}/> {t.order_create_bill}</button>
                </div>
                <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                      <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b">
                        <tr>
                          <th className="px-6 py-4">{t.order_id}</th>
                          <th className="px-6 py-4">{t.order_customer}</th>
                          <th className="px-6 py-4">{t.order_logistics}</th>
                          <th className="px-6 py-4 text-right">{t.order_total}</th>
                          <th className="px-6 py-4 text-center">{t.order_payment}</th>
                          <th className="px-6 py-4 text-center">{t.order_status}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {recentSales.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-mono text-[10px] text-slate-500">{s.id.substr(0,8)}<div className="text-[9px] text-slate-300">{s.date}</div></td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-700">{s.customerName || '-'}<div className="text-[10px] font-normal text-slate-400">{s.customerPhone}</div></td>
                            <td className="px-6 py-4 text-xs">{s.shippingCarrier || '-'}<div className="text-[10px] text-sky-600 font-bold">{s.shippingBranch}</div></td>
                            <td className="px-6 py-4 text-right font-bold text-sky-600">{formatCurrency(s.total, language)}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${s.status === 'Pending' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {s.status === 'Pending' ? t.pay_pending : t.pay_paid}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-xs text-slate-500 font-bold">{s.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {recentSales.length === 0 && <div className="p-20 text-center text-slate-300">No Sales History</div>}
                </div>
              </div>
            )}

            {mode === AppMode.PROMOTIONS && (
              <div className="p-4 md:p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3"><Tag className="text-sky-600" /> {t.promo_title}</h2>
                  <button onClick={()=>setIsPromoModalOpen(true)} className="bg-sky-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg flex items-center gap-2"><Plus size={18}/> {t.promo_add}</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {promotions.map(p => (
                    <div key={p.id} className="bg-white p-6 rounded-[2rem] border shadow-sm relative group">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center"><Tag size={24}/></div>
                        <h4 className="font-bold">{p.name}</h4>
                      </div>
                      <p className="text-xs text-slate-400">Type: {p.type}</p>
                      <button onClick={()=>setPromotions(prev=>prev.filter(x=>x.id!==p.id))} className="absolute top-4 right-4 text-rose-300 hover:text-rose-600 p-2"><Trash2 size={16}/></button>
                    </div>
                  ))}
                  {promotions.length === 0 && <div className="col-span-full py-20 bg-white rounded-[2rem] border border-dashed text-center text-slate-300">{t.promo_no_data}</div>}
                </div>
              </div>
            )}

            {mode === AppMode.STOCK && (
              <div className="p-4 md:p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3"><Package className="text-sky-600" /> {t.stock_title}</h2>
                  <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-sky-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg flex items-center gap-2"><Plus size={18}/> {t.stock_add}</button>
                </div>
                <div className="bg-white rounded-[2rem] border shadow-sm overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold border-b">
                      <tr><th className="px-6 py-5">Product</th><th className="px-6 py-5 text-right">Cost</th><th className="px-6 py-5 text-right">Price</th><th className="px-6 py-5 text-center">Stock</th><th className="px-6 py-5 text-center">Action</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {products.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-6 py-5 font-bold">{p.name} <div className="text-[10px] font-mono text-slate-300">{p.code}</div></td>
                          <td className="px-6 py-5 text-right text-xs text-slate-400">{formatCurrency(p.cost, language)}</td>
                          <td className="px-6 py-5 text-right font-bold text-sky-600">{formatCurrency(p.price, language)}</td>
                          <td className="px-6 py-5 text-center"><span className={`px-3 py-1 rounded-full text-[10px] font-bold ${p.stock <= 5 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>{p.stock}</span></td>
                          <td className="px-6 py-5 text-center"><button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-2 text-slate-300 hover:text-sky-600"><Edit size={16}/></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {mode === AppMode.POS && (
              <div className="flex h-full flex-col md:flex-row overflow-hidden">
                <div className="flex-1 p-4 md:p-6 overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {products.map(p => (
                      <button key={p.id} onClick={() => setCart(prev => {
                        const exist = prev.find(i => i.id === p.id);
                        return exist ? prev.map(i => i.id === p.id ? {...i, quantity: i.quantity + 1} : i) : [...prev, {...p, quantity: 1}];
                      })} className="bg-white p-4 rounded-[1.5rem] border shadow-sm hover:border-sky-300 text-left flex flex-col active:scale-95">
                        <div className={`w-full aspect-square rounded-xl ${p.color} mb-3 flex items-center justify-center text-2xl font-bold`}>{p.name.charAt(0)}</div>
                        <h4 className="font-bold text-slate-800 text-xs mb-1 truncate">{p.name}</h4>
                        <p className="text-sky-600 font-bold text-xs">{formatCurrency(p.price, language)}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-full md:w-80 bg-white border-l flex flex-col">
                  <div className="p-6 border-b font-bold flex justify-between"><h3>{t.pos_cart_title}</h3><button onClick={()=>setCart([])} className="text-[10px] text-rose-500 uppercase">{t.pos_clear_cart}</button></div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border">
                        <div className="flex-1 text-xs font-bold truncate">{it.name}</div>
                        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border">
                          <button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))}><Minus size={10}/></button>
                          <span className="text-xs font-bold">{it.quantity}</span>
                          <button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))}><Plus size={10}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-6 border-t space-y-4">
                    <div className="flex justify-between items-center font-bold"><span>Total</span><span className="text-2xl text-sky-600">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span></div>
                    <button onClick={()=>setIsPaymentModalOpen(true)} disabled={cart.length === 0} className="w-full bg-sky-600 text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-30">{t.pos_pay}</button>
                  </div>
                </div>
              </div>
            )}

            {mode === AppMode.AI && (
              <div className="h-full flex flex-col p-4 md:p-8">
                 <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                    {messages.map(m => <ChatMessage key={m.id} message={m} />)}
                    <div ref={chatEndRef} />
                 </div>
                 <div className="bg-white p-3 rounded-[2rem] border shadow-lg flex gap-3">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} placeholder={t.ai_placeholder} className="flex-1 px-4 outline-none font-bold text-sm"/>
                    <button onClick={handleSendMessage} disabled={isChatLoading} className="w-12 h-12 bg-sky-600 text-white rounded-2xl flex items-center justify-center shadow-md disabled:opacity-30">
                       {isChatLoading ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
                    </button>
                 </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bill Modal (Manual Entry) */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] w-full max-w-lg p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">{t.order_create_bill}</h3><button onClick={()=>setIsBillModalOpen(false)}><X/></button></div>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const order: SaleRecord = {
                id: uuidv4(), date: new Date().toLocaleString(), timestamp: Date.now(), items: [],
                total: parseFloat(fd.get('total') as string) || 0,
                customerName: fd.get('cust_name') as string,
                customerPhone: fd.get('cust_phone') as string,
                customerAddress: fd.get('cust_addr') as string,
                shippingCarrier: fd.get('logistic') as any,
                shippingBranch: fd.get('branch') as string,
                paymentMethod: 'cash',
                status: (fd.get('paid') === 'on' ? 'Paid' : 'Pending') as OrderStatus
              };
              saveOrder(order); setIsBillModalOpen(false);
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">{t.order_customer}</label><input name="cust_name" placeholder="Name" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border" required /></div>
                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">Phone</label><input name="cust_phone" placeholder="020-..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none border" required /></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">Address</label><textarea name="cust_addr" className="w-full p-4 bg-slate-50 rounded-2xl border outline-none h-20" required /></div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">{t.order_logistics}</label>
                   <select name="logistic" className="w-full p-4 bg-slate-50 rounded-2xl border outline-none">
                     <option value="None">None</option>
                     <option value="Anuchit">{t.logistic_anuchit}</option>
                     <option value="Meexai">{t.logistic_meexai}</option>
                     <option value="Rungarun">{t.logistic_rungarun}</option>
                     <option value="Other">{t.logistic_self}</option>
                   </select>
                 </div>
                 <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">{t.order_branch}</label><input name="branch" placeholder="Branch Name" className="w-full p-4 bg-slate-50 rounded-2xl border" /></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-400 ml-2">{t.order_total} (LAK)</label><input name="total" type="number" className="w-full p-4 bg-slate-50 rounded-2xl border font-bold text-sky-600 text-xl" required /></div>
              <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-2xl"><input type="checkbox" name="paid" id="paid_check" className="w-5 h-5" /><label htmlFor="paid_check" className="font-bold">{t.pay_paid}</label></div>
              <button type="submit" className="w-full bg-sky-600 text-white py-5 rounded-[1.5rem] font-bold shadow-lg">{t.save}</button>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal (from POS) */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[4rem] w-full max-w-sm p-12 text-center shadow-2xl">
             <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-[3rem] flex items-center justify-center mx-auto mb-8"><DollarSign size={40}/></div>
             <h3 className="text-4xl font-bold mb-10">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</h3>
             <button onClick={() => {
                const order: SaleRecord = { id: uuidv4(), items: [...cart], total: cart.reduce((s,i)=>s+(i.price*i.quantity),0), date: new Date().toLocaleString(), timestamp: Date.now(), paymentMethod: 'cash', status: 'Paid' };
                saveOrder(order); setCart([]); setIsPaymentModalOpen(false);
             }} className="w-full bg-sky-600 text-white py-6 rounded-[2.5rem] font-bold shadow-xl">{t.pos_pay}</button>
             <button onClick={()=>setIsPaymentModalOpen(false)} className="mt-4 text-slate-300 text-[10px] font-bold uppercase">{t.cancel}</button>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{editingProduct ? t.save : t.stock_add}</h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const p = { id: editingProduct?.id || uuidv4(), name: fd.get('name') as string, code: fd.get('code') as string, category: "General", cost: parseFloat(fd.get('cost') as string) || 0, price: parseFloat(fd.get('price') as string) || 0, stock: parseInt(fd.get('stock') as string) || 0, color: COLORS[Math.floor(Math.random()*COLORS.length)] };
              setProducts(prev => [...prev.filter(x => x.id !== p.id), p]); setIsProductModalOpen(false);
            }} className="space-y-4">
              <input name="name" placeholder="Name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
              <input name="code" placeholder="SKU" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
              <div className="grid grid-cols-2 gap-4">
                <input name="cost" type="number" placeholder="Cost" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" />
                <input name="price" type="number" placeholder="Price" required defaultValue={editingProduct?.price} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold text-sky-600" />
              </div>
              <input name="stock" type="number" placeholder="Stock" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" />
              <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-2xl font-bold">{t.save}</button>
            </form>
          </div>
        </div>
      )}

      {/* Promo Modal */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl">
            <h3 className="text-xl font-bold mb-6">{t.promo_add}</h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const p: Promotion = { id: uuidv4(), name: fd.get('name') as string, type: 'tiered_price', isActive: true, targetSkus: [] };
              setPromotions(prev => [...prev, p]); setIsPromoModalOpen(false);
            }} className="space-y-4">
              <input name="name" placeholder={t.promo_name} required className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
              <select className="w-full p-4 bg-slate-50 border rounded-2xl outline-none">
                 <option>Standard Discount</option>
                 <option>Buy X Get Y</option>
              </select>
              <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-2xl font-bold">{t.save}</button>
            </form>
          </div>
        </div>
      )}

      {showReceipt && currentOrder && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-xl">
            <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden p-10 flex flex-col shadow-2xl text-center">
              <div className="mb-6 pb-6 border-b-2 border-dashed">
                <h2 className="text-lg font-bold">{storeProfile.name}</h2>
                <p className="text-xs text-slate-400">{storeProfile.address}</p>
              </div>
              <div className="space-y-3 mb-6 text-left">
                {currentOrder.customerName && <div className="text-xs">Customer: <b>{currentOrder.customerName}</b></div>}
                {currentOrder.shippingCarrier && <div className="text-xs">Ship: <b>{currentOrder.shippingCarrier}</b> / <b>{currentOrder.shippingBranch}</b></div>}
                <div className="border-t pt-3">
                  {currentOrder.items.length > 0 ? currentOrder.items.map((it, i) => (<div key={i} className="flex justify-between text-xs"><span>{it.name} x{it.quantity}</span><span className="font-bold">{formatCurrency(it.price * it.quantity, language)}</span></div>)) : <div className="text-xs italic text-slate-300">Manual Entry Order</div>}
                </div>
              </div>
              <div className="text-3xl font-bold mb-8 text-sky-600">{formatCurrency(currentOrder.total, language)}</div>
              <div className="text-[10px] font-bold uppercase mb-6 p-2 bg-emerald-50 text-emerald-600 rounded-lg">{currentOrder.status === 'Paid' ? t.pay_paid : t.pay_pending}</div>
              <button onClick={()=>setShowReceipt(false)} className="w-full py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold">CLOSE</button>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
