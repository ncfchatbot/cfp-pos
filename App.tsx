
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Minus, Trash2, Edit, LayoutDashboard, Settings, 
  Package, ClipboardList, BarChart3, Tag, X, Search,
  ShoppingCart, Coffee, TrendingUp, CheckCircle2, Save, Send, Bot, 
  User, Download, Upload, AlertCircle, FileText, Smartphone, Truck, CreditCard, Building2, MapPin, Image as ImageIcon, FileUp, FileDown, ShieldAlert, Wifi, WifiOff, DollarSign, PieChart, ArrowRight, BarChart2, Users, ChevronRight, List, Phone, Printer, Database, RotateCcw, Filter
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AppMode, Product, CartItem, SaleRecord, StoreProfile, Language, Promotion, PromoTier, Role, Message, LogisticsProvider, OrderStatus, PaymentMethod } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { streamResponse } from './services/gemini';
import { db, collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc } from './services/firebase';

// --- SHARED COMPONENTS ---
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-white rounded-[1.2rem] md:rounded-[2.5rem] border border-slate-200 shadow-sm p-4 md:p-8 ${className}`}>{children}</div>
);

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');

  // Core Data
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : { name: "Coffee Please", address: "", phone: "", logoUrl: null };
  });

  // Transaction State
  const [billItems, setBillItems] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [shippingCarrier, setShippingCarrier] = useState<LogisticsProvider>('None');
  const [shippingBranch, setShippingBranch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<OrderStatus>('Paid');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Transfer');
  const [skuSearch, setSkuSearch] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState('All');

  // Editing state for Orders
  const [editingBill, setEditingBill] = useState<SaleRecord | null>(null);

  // AI State
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Printing State
  const [printType, setPrintType] = useState<'stock' | 'bill' | null>(null);
  const [activePrintBill, setActivePrintBill] = useState<SaleRecord | null>(null);

  // Mobile specific for New Bill Modal
  const [newBillTab, setNewBillTab] = useState<'items' | 'checkout'>('items');

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [promoSkusInput, setPromoSkusInput] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = translations[language];

  // Logic: Real-time Sync
  useEffect(() => {
    if (!db) return;
    const unsubP = onSnapshot(collection(db, 'products'), s => setProducts(s.docs.map(d => ({ ...d.data(), id: d.id } as Product))), err => console.error("Product Sync Error:", err));
    const unsubS = onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), s => setRecentSales(s.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord))));
    const unsubPr = onSnapshot(collection(db, 'promotions'), s => setPromotions(s.docs.map(d => ({ ...d.data(), id: d.id } as Promotion))));
    return () => { unsubP(); unsubS(); unsubPr(); };
  }, []);

  // Logic: Persistence
  useEffect(() => { localStorage.setItem('pos_language', language); }, [language]);
  useEffect(() => { localStorage.setItem('pos_profile', JSON.stringify(storeProfile)); }, [storeProfile]);

  // Derived Categories
  const productCategories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category || 'General')));
    return ['All', ...cats.sort()];
  }, [products]);

  // Logic: Price Calculation with Promotion
  const getProductPrice = (product: Product, quantity: number) => {
    const promo = promotions.find(p => p.targetProductIds.includes(product.id) && p.isActive);
    if (!promo || !promo.tiers || !promo.tiers.length) return Number(product.price || 0);
    const sortedTiers = [...promo.tiers].sort((a, b) => b.minQty - a.minQty);
    const tier = sortedTiers.find(t => quantity >= t.minQty);
    return tier ? Number(tier.unitPrice) : Number(product.price || 0);
  };

  const updateCartQuantity = (id: string, qty: number) => {
    const safeQty = isNaN(qty) ? 0 : Math.max(0, qty);
    setBillItems(prev => prev.map(it => {
      if (it.id === id) {
        const nPrice = getProductPrice(it, safeQty);
        return { ...it, quantity: safeQty, price: nPrice };
      }
      return it;
    }));
  };

  const addToCart = (p: Product, quantity: number = 1) => {
    const safeQty = isNaN(quantity) || quantity <= 0 ? 1 : quantity;
    setBillItems(prev => {
      const exist = prev.find(i => i.id === p.id);
      const nQty = exist ? exist.quantity + safeQty : safeQty;
      const nPrice = getProductPrice(p, nQty);
      if (exist) return prev.map(i => i.id === p.id ? { ...i, quantity: nQty, price: nPrice } : i);
      return [...prev, { ...p, quantity: safeQty, price: nPrice }];
    });
  };

  const handlePrintBill = (order: SaleRecord) => {
    setActivePrintBill(order);
    setPrintType('bill');
    setTimeout(() => window.print(), 250);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => callback(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Logic: Clear Functions
  const handleClearSales = async () => {
    if (!confirm(t.confirm_clear)) return;
    try {
      for (const sale of recentSales) {
        await deleteDoc(doc(db, 'sales', sale.id));
      }
      alert("ล้างประวัติการขายสำเร็จ!");
    } catch (err: any) { alert("Error: " + err.message); }
  };

  const handleClearStock = async () => {
    if (!confirm(t.confirm_clear)) return;
    try {
      for (const p of products) {
        await deleteDoc(doc(db, 'products', p.id));
      }
      alert("ล้างคลังสินค้าสำเร็จ!");
    } catch (err: any) { alert("Error: " + err.message); }
  };

  const handleFullBackup = () => {
    const data = { products, sales: recentSales, promotions, store: storeProfile };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `FullBackup_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
  };

  const downloadSkuTemplate = () => {
    const headers = ["Code", "Name", "Price", "Cost", "Stock", "Category"];
    const csvContent = "\ufeff" + headers.join(",") + "\nCF001,Example Item,25000,15000,100,Coffee";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `SKU_Template.csv`;
    link.click();
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result as string;
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length <= 1) return;
      try {
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length < 5) continue;
          const [code, name, price, cost, stock, category] = cols;
          const id = products.find(p => p.code === code)?.id || uuidv4();
          await setDoc(doc(db, 'products', id), { id, code, name, price: Number(price), cost: Number(cost), stock: Number(stock), category: category || "General", color: "bg-sky-500" });
        }
        alert("นำเข้าข้อมูลสำเร็จ!");
      } catch (err: any) { alert("Import Error: " + err.message); }
    };
    reader.readAsText(file);
  };

  const handleOpenNewBill = () => {
    setEditingBill(null); setBillItems([]); setCustomerName(''); setCustomerPhone(''); setCustomerAddress('');
    setShippingCarrier('None'); setPaymentMethod('Transfer'); setPaymentStatus('Paid');
    setNewBillTab('items'); setIsBillModalOpen(true);
  };

  const handleOpenEditBill = (order: SaleRecord) => {
    setEditingBill(order); setBillItems([...order.items]); setCustomerName(order.customerName || '');
    setCustomerPhone(order.customerPhone || ''); setCustomerAddress(order.customerAddress || '');
    setShippingCarrier(order.shippingCarrier || 'None'); setPaymentMethod(order.paymentMethod);
    setPaymentStatus(order.status); setNewBillTab('checkout'); setIsBillModalOpen(true);
  };

  const handleCheckout = async () => {
    if (billItems.length === 0) { alert("กรุณาเลือกสินค้าก่อนเช็คบิล"); return; }
    const total = billItems.reduce((s, i) => s + (Number(i.price || 0) * i.quantity), 0);
    const orderId = editingBill ? editingBill.id : uuidv4();
    const order: SaleRecord = {
      id: orderId, items: [...billItems], subtotal: total, discount: 0, total, 
      date: editingBill ? editingBill.date : new Date().toLocaleString(), 
      timestamp: editingBill ? editingBill.timestamp : Date.now(), 
      status: paymentStatus, paymentMethod, customerName, customerPhone, customerAddress, shippingCarrier, shippingBranch
    };
    try {
      await setDoc(doc(db, 'sales', order.id), order);
      if (!editingBill) {
        for (const item of billItems) {
          const p = products.find(x => x.id === item.id);
          if (p) await setDoc(doc(db, 'products', p.id), { ...p, stock: Math.max(0, (Number(p.stock) || 0) - item.quantity) });
        }
      }
      setIsBillModalOpen(false); setBillItems([]); alert("บันทึกบิลสำเร็จ!");
    } catch (err: any) { alert("Error: " + err.message); }
  };

  const formatMoney = (amount: number) => {
    const locale = language === 'th' ? 'th-TH' : (language === 'en' ? 'en-US' : 'lo-LA');
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'LAK', maximumFractionDigits: 0 }).format(amount || 0);
  };

  // AI Chat Logic
  const handleSendMessage = async () => {
    if (!chatInput.trim() || isTyping) return;
    const userMsg: Message = { id: uuidv4(), role: Role.USER, text: chatInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);
    const modelMsgId = uuidv4();
    setMessages(prev => [...prev, { id: modelMsgId, role: Role.MODEL, text: '...', timestamp: Date.now() }]);
    try {
      const history = messages.map(m => ({ role: m.role === Role.USER ? 'user' : 'model', parts: [{ text: m.text }] }));
      const stream = await streamResponse(chatInput, AppMode.AI, history);
      if (stream) {
        let fullText = '';
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) {
            fullText = fullText === '...' ? text : fullText + text;
            setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, text: fullText } : m));
          }
        }
      }
    } catch (error) {
      setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, text: "ขออภัย เกิดข้อผิดพลาด", isError: true } : m));
    } finally { setIsTyping(false); }
  };

  // Data Stats
  const reportStats = useMemo(() => {
    const validSales = recentSales.filter(s => s.status !== 'Cancelled');
    const totalRevenue = validSales.reduce((a, b) => a + Number(b.total || 0), 0);
    const stockValue = products.reduce((a, b) => a + (Number(b.cost || 0) * Number(b.stock || 0)), 0);
    const monthlyData: Record<string, number> = {};
    validSales.forEach(s => {
      const parts = s.date.split('/');
      if (parts.length >= 3) {
        const monthStr = parts[0] + '/' + parts[2].split(' ')[0];
        monthlyData[monthStr] = (monthlyData[monthStr] || 0) + Number(s.total);
      }
    });
    return { totalRevenue, stockValue, monthlyData };
  }, [recentSales, products]);

  const filteredAndSortedProducts = useMemo(() => {
    let list = [...products];
    if (stockCategoryFilter !== 'All') {
      list = list.filter(p => (p.category || 'General') === stockCategoryFilter);
    }
    return list.sort((a,b) => a.code.localeCompare(b.code));
  }, [products, stockCategoryFilter]);

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} language={language} setLanguage={setLanguage} onExport={()=>{}} onImport={()=>{}} />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="bg-white border-b px-4 md:px-8 py-3 md:py-4 flex items-center justify-between shadow-sm z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-400"><List size={20} /></button>
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-100 rounded-lg flex items-center justify-center border overflow-hidden">
                {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : < Coffee size={18} className="text-slate-400"/>}
             </div>
             <h2 className="font-black text-slate-800 uppercase tracking-tight text-xs md:text-base">{t[`menu_${mode}`] || mode}</h2>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black text-slate-400 uppercase">{storeProfile.name}</p>
                <div className="flex items-center gap-1 justify-end"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div><p className="text-[8px] text-emerald-600 font-bold uppercase">Active</p></div>
             </div>
             <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm overflow-hidden">
                <img src={storeProfile.logoUrl || `https://ui-avatars.com/api/?name=${storeProfile.name}&background=0ea5e9&color=fff`} alt="store" />
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 md:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {mode === AppMode.DASHBOARD && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 animate-in fade-in">
                 {[
                   { label: t.dash_sales, val: reportStats.totalRevenue, icon: TrendingUp, color: "sky" },
                   { label: t.dash_stock_cost, val: reportStats.stockValue, icon: Package, color: "amber" },
                   { label: t.menu_orders, val: recentSales.length, icon: ClipboardList, color: "purple", unit: "Bills" },
                   { label: t.dash_low_stock, val: products.filter(p => Number(p.stock) <= 5).length, icon: AlertCircle, color: "rose", unit: "Alert" }
                 ].map((card, i) => (
                   <Card key={i} className="group hover:border-sky-500 transition-all flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.label}</span>
                        <div className={`p-2 rounded-xl bg-${card.color}-50 text-${card.color}-600`}><card.icon size={16}/></div>
                      </div>
                      <h3 className="text-sm md:text-2xl font-black text-slate-900">{card.unit ? `${card.val} ${card.unit}` : formatMoney(card.val)}</h3>
                   </Card>
                 ))}
              </div>
            )}

            {mode === AppMode.ORDERS && (
              <div className="space-y-4 animate-in slide-in-from-bottom-5">
                 <div className="flex justify-between items-center">
                    <h2 className="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2"><ClipboardList className="text-sky-500" size={24}/> {t.menu_orders}</h2>
                    <div className="flex gap-2">
                      <button onClick={handleClearSales} className="p-3 bg-rose-50 text-rose-600 rounded-xl font-black hover:bg-rose-100 flex items-center gap-2 transition-all active:scale-95"><RotateCcw size={16}/> {t.clear_sales}</button>
                      <button onClick={handleOpenNewBill} className="bg-sky-600 text-white px-6 py-3 rounded-xl font-black hover:bg-sky-700 shadow-lg flex items-center gap-2 transition-all active:scale-95"><Plus size={20}/> {t.order_create_bill}</button>
                    </div>
                 </div>
                 <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
                   <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[700px]">
                       <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
                          <tr><th className="px-6 py-4">Bill Info</th><th className="px-4 py-4 text-center">Payment</th><th className="px-4 py-4 text-right">Total</th><th className="px-4 py-4 text-center">Status</th><th className="px-4 py-4 text-center">Action</th></tr>
                       </thead>
                       <tbody className="divide-y text-sm font-bold">
                          {recentSales.map(s => (
                            <tr key={s.id} className="hover:bg-slate-50">
                               <td className="px-6 py-4"><div className="text-slate-800">#{s.id.slice(0,8).toUpperCase()} | {s.customerName || '-'}</div><div className="text-[10px] text-slate-300">{s.date}</div></td>
                               <td className="px-4 py-4 text-center"><span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-black uppercase">{s.paymentMethod}</span></td>
                               <td className="px-4 py-4 text-right text-sky-600 font-black">{formatMoney(s.total)}</td>
                               <td className="px-4 py-4 text-center"><span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${s.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{s.status}</span></td>
                               <td className="px-4 py-4 text-center flex justify-center gap-2">
                                 <button onClick={() => handlePrintBill(s)} className="p-2 text-sky-500 hover:bg-sky-50 rounded-lg"><Printer size={16}/></button>
                                 <button onClick={() => handleOpenEditBill(s)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg"><Edit size={16}/></button>
                               </td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                   </div>
                 </div>
              </div>
            )}

            {mode === AppMode.STOCK && (
              <div className="space-y-4 animate-in slide-in-from-bottom-5">
                 <div className="flex flex-wrap justify-between items-center gap-4">
                    <h2 className="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2"><Package className="text-sky-500" size={24}/> {t.stock_title}</h2>
                    <div className="flex flex-wrap gap-2">
                       <button onClick={handleClearStock} className="p-3 bg-rose-50 text-rose-600 rounded-xl font-black hover:bg-rose-100 flex items-center gap-2 transition-all active:scale-95"><RotateCcw size={16}/> {t.clear_stock}</button>
                       <button onClick={downloadSkuTemplate} className="p-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 flex items-center gap-2 transition-all"><FileDown size={16}/> {t.stock_download_template}</button>
                       <label className="p-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
                          <FileUp size={16}/> {t.stock_import_csv}
                          <input type="file" accept=".csv" className="hidden" onChange={handleBulkImport} />
                       </label>
                       <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-sky-600 text-white px-6 py-3 rounded-xl font-black hover:bg-sky-700 active:scale-95 shadow-lg">
                          {t.stock_add}
                       </button>
                    </div>
                 </div>

                 {/* CATEGORY BAR IN STOCK PAGE */}
                 <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                    {productCategories.map(cat => (
                      <button 
                        key={cat} 
                        onClick={() => setStockCategoryFilter(cat)}
                        className={`px-6 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${stockCategoryFilter === cat ? 'bg-sky-600 text-white shadow-lg' : 'bg-white border text-slate-500 hover:bg-slate-50'}`}
                      >
                        {cat}
                      </button>
                    ))}
                 </div>

                 <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
                   <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[650px]">
                       <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
                          <tr><th className="px-6 py-4">Item</th><th className="px-4 py-4 text-right">Cost</th><th className="px-4 py-4 text-right">Price</th><th className="px-4 py-4 text-center">Stock</th><th className="px-4 py-4 text-center">Edit</th></tr>
                       </thead>
                       <tbody className="divide-y text-sm font-bold">
                          {filteredAndSortedProducts.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50">
                               <td className="px-6 py-4 flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-slate-100 border overflow-hidden">
                                    {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${p.color} text-white flex items-center justify-center font-black`}>{p.name.charAt(0)}</div>}
                                  </div>
                                  <div><div className="text-slate-800">{p.name}</div><div className="text-[10px] text-slate-300">SKU: {p.code}</div></div>
                               </td>
                               <td className="px-4 py-4 text-right text-slate-400">{formatMoney(p.cost)}</td>
                               <td className="px-4 py-4 text-right text-sky-600 font-black">{formatMoney(p.price)}</td>
                               <td className="px-4 py-4 text-center"><span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${Number(p.stock) <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-50 text-emerald-600'}`}>{p.stock}</span></td>
                               <td className="px-4 py-4 text-center"><button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-2 text-slate-300 hover:text-sky-600"><Edit size={16}/></button></td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                   </div>
                 </div>
              </div>
            )}

            {mode === AppMode.PROMOTIONS && (
              <PromotionView 
                promotions={promotions} 
                products={products} 
                setEditingPromo={setEditingPromo} 
                setPromoSkusInput={setPromoSkusInput} 
                setIsPromoModalOpen={setIsPromoModalOpen} 
                formatMoney={formatMoney} 
                db={db} 
              />
            )}

            {mode === AppMode.REPORTS && <ReportsView reportStats={reportStats} formatMoney={formatMoney} />}

            {mode === AppMode.AI && (
               <div className="flex flex-col h-[calc(100vh-250px)] animate-in fade-in">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {messages.map((m: any) => <ChatMessage key={m.id} message={m} />)}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="p-4 bg-white border-t rounded-b-[2rem] flex gap-2">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="พิมพ์คำถามที่นี่..." className="flex-1 p-4 bg-slate-100 rounded-xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-sky-500" />
                    <button onClick={handleSendMessage} disabled={!chatInput.trim() || isTyping} className="p-4 bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-all shadow-lg active:scale-95"><Send size={20}/></button>
                  </div>
               </div>
            )}

            {mode === AppMode.SETTINGS && (
              <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in">
                <Card className="space-y-6 shadow-xl border-sky-50">
                  <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Settings className="text-sky-500" size={24}/> ตั้งค่าร้านค้า</h3>
                  <div className="flex justify-center mb-6">
                      <div className="relative group">
                        <div className="w-32 h-32 rounded-[2.5rem] bg-slate-50 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center">
                            {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <ImageIcon size={32} className="text-slate-300"/>}
                        </div>
                        <label className="absolute bottom-0 right-0 p-3 bg-sky-600 text-white rounded-xl shadow-lg cursor-pointer hover:bg-sky-700 active:scale-90 transition-all">
                            <Upload size={16}/><input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, (url:string) => setStoreProfile({...storeProfile, logoUrl: url}))} />
                        </label>
                      </div>
                  </div>
                  <div className="space-y-4">
                    <input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} placeholder="ชื่อร้านค้า" className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none text-sm focus:border-sky-500" />
                    <input value={storeProfile.phone} onChange={e=>setStoreProfile({...storeProfile, phone: e.target.value})} placeholder="เบอร์โทรศัพท์" className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none text-sm focus:border-sky-500" />
                    <textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} placeholder="ที่อยู่ร้าน" className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none text-sm h-24 focus:border-sky-500" />
                  </div>
                  <button onClick={()=>{ alert('บันทึกสำเร็จ!'); }} className="w-full py-4 bg-sky-600 text-white rounded-xl font-black shadow-lg hover:bg-sky-700 flex items-center justify-center gap-2 active:scale-95"><Save size={18}/> บันทึกข้อมูล</button>
                </Card>

                <div className="mt-8">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Database className="text-sky-500" size={20}/> {t.data_management}</h3>
                  <Card className="border-emerald-50 shadow-sm space-y-4">
                    <button onClick={handleFullBackup} className="w-full py-4 bg-emerald-50 text-emerald-600 rounded-xl font-black border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center justify-center gap-3 active:scale-[0.98]">
                      <Download size={18}/> {t.backup_all}
                    </button>
                    <p className="text-[10px] text-slate-400 font-bold text-center italic">*{t.backup_reminder}</p>
                  </Card>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- MODALS --- */}
      <BillModal isOpen={isBillModalOpen} setIsOpen={setIsBillModalOpen} newBillTab={newBillTab} setNewBillTab={setNewBillTab} billItems={billItems} setBillItems={setBillItems} products={products} productCategories={productCategories} addToCart={addToCart} updateCartQuantity={updateCartQuantity} customerName={customerName} setCustomerName={setCustomerName} customerPhone={customerPhone} setCustomerPhone={setCustomerPhone} customerAddress={customerAddress} setCustomerAddress={setCustomerAddress} shippingCarrier={shippingCarrier} setShippingCarrier={setShippingCarrier} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} handleCheckout={handleCheckout} formatMoney={formatMoney} cartTotal={billItems.reduce((s,i)=>s+(Number(i.price || 0)*i.quantity),0)} t={t} skuSearch={skuSearch} setSkuSearch={setSkuSearch} isEditing={!!editingBill} />
      
      {isProductModalOpen && <ProductModal editingProduct={editingProduct} setIsProductModalOpen={setIsProductModalOpen} handleImageUpload={handleImageUpload} db={db} setEditingProduct={setEditingProduct} />}
      
      {isPromoModalOpen && <PromoModal editingPromo={editingPromo} setIsPromoModalOpen={setIsPromoModalOpen} products={products} promoSkusInput={promoSkusInput} setPromoSkusInput={setPromoSkusInput} db={db} t={t} />}

      {/* --- PRINT AREA --- */}
      <PrintArea activePrintBill={activePrintBill} storeProfile={storeProfile} formatMoney={formatMoney} printType={printType} />
    </div>
  );
};

// --- SUB-COMPONENTS ---

const PromotionView = ({ promotions, products, setEditingPromo, setPromoSkusInput, setIsPromoModalOpen, formatMoney, db }: any) => (
  <div className="space-y-6 animate-in slide-in-from-bottom-5">
    <div className="flex justify-between items-center">
      <h2 className="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2"><Tag className="text-sky-500" size={24}/> โปรโมชั่น</h2>
      <button onClick={()=>{setEditingPromo(null); setPromoSkusInput(''); setIsPromoModalOpen(true);}} className="bg-sky-600 text-white px-6 py-3 rounded-xl font-black hover:bg-sky-700 shadow-lg transition-all active:scale-95">เพิ่มโปรโมชั่นใหม่</button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {promotions.map((promo: any) => (
        <Card key={promo.id} className="relative group border-2 hover:border-sky-500 transition-all">
          <div className="flex justify-between items-start mb-4">
              <h4 className="font-black text-slate-800 text-lg">{promo.name}</h4>
              <div className="flex gap-2">
                <button onClick={()=>{ setEditingPromo(promo); setPromoSkusInput(products.filter((p:any) => promo.targetProductIds.includes(p.id)).map((p:any) => p.code).join(', ')); setIsPromoModalOpen(true); }} className="p-2 text-slate-300 hover:text-sky-600"><Edit size={16}/></button>
                <button onClick={async ()=>{ if(confirm('ลบ?')) await deleteDoc(doc(db, 'promotions', promo.id)); }} className="p-2 text-slate-300 hover:text-rose-600"><Trash2 size={16}/></button>
              </div>
          </div>
          <div className="space-y-2">
              {promo.tiers.map((tier: any, i: number) => (
                <div key={i} className="flex justify-between text-xs font-bold bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <span>{tier.minQty}+ ชิ้น</span><span className="text-sky-600">{formatMoney(tier.unitPrice)}</span>
                </div>
              ))}
          </div>
        </Card>
      ))}
    </div>
  </div>
);

const ReportsView = ({ reportStats, formatMoney }: any) => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
    <Card className="lg:col-span-2 min-h-[400px] flex flex-col">
       <div className="flex justify-between mb-10"><h3 className="text-xl font-black text-slate-800">Sales Trend</h3><TrendingUp className="text-sky-500"/></div>
       <div className="flex-1 flex items-end justify-around gap-2">
          {Object.entries(reportStats.monthlyData as Record<string, number>).map(([month, val]) => (
             <div key={month} className="flex flex-col items-center flex-1 max-w-[50px] group">
                <div className="w-full bg-sky-500 rounded-t-xl transition-all hover:bg-sky-600 cursor-help" style={{ height: `${Math.min(200, (val/1000000)*100)}px` }} />
                <span className="text-[9px] font-black text-slate-400 mt-4 rotate-45 origin-left">{month}</span>
             </div>
          ))}
       </div>
    </Card>
    <div className="space-y-6">
       <Card className="bg-sky-600 text-white h-1/2 flex flex-col justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Revenue</p>
          <h3 className="text-3xl font-black">{formatMoney(reportStats.totalRevenue)}</h3>
       </Card>
       <Card className="bg-emerald-600 text-white h-1/2 flex flex-col justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Stock Value</p>
          <h3 className="text-3xl font-black">{formatMoney(reportStats.stockValue)}</h3>
       </Card>
    </div>
  </div>
);

const BillModal = ({ isOpen, setNewBillTab, newBillTab, billItems, setBillItems, products, productCategories, addToCart, updateCartQuantity, customerName, setCustomerName, customerPhone, setCustomerPhone, customerAddress, setCustomerAddress, shippingCarrier, setShippingCarrier, paymentMethod, setPaymentMethod, handleCheckout, formatMoney, cartTotal, skuSearch, setSkuSearch, setIsOpen, isEditing }: any) => {
  const [batchQty, setBatchQty] = useState<number>(1);
  const [modalCatFilter, setModalCatFilter] = useState('All');

  if (!isOpen) return null;

  const modalFilteredProducts = products.filter((p: any) => {
    const matchSearch = !skuSearch || p.name.includes(skuSearch) || p.code.includes(skuSearch);
    const matchCat = modalCatFilter === 'All' || (p.category || 'General') === modalCatFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center backdrop-blur-xl animate-in zoom-in-95">
      <div className="bg-white w-full h-full md:max-w-[98vw] md:h-[95vh] md:rounded-[3rem] shadow-2xl flex flex-col md:flex-row overflow-hidden">
          <div className="flex items-center border-b md:hidden bg-white z-20">
            <button onClick={()=>setNewBillTab('items')} className={`flex-1 py-4 text-xs font-black border-b-2 ${newBillTab === 'items' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-400'}`}>1. เลือกสินค้า</button>
            <button onClick={()=>setNewBillTab('checkout')} className={`flex-1 py-4 text-xs font-black border-b-2 ${newBillTab === 'checkout' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-400'}`}>2. ข้อมูลบิล ({billItems.length})</button>
            <button onClick={()=>setIsOpen(false)} className="px-4 text-slate-400"><X size={20}/></button>
          </div>
          <div className={`flex-1 flex flex-col p-4 md:p-8 overflow-hidden bg-white ${newBillTab === 'items' ? 'flex' : 'hidden md:flex'}`}>
            <div className="flex flex-col gap-4 mb-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"/><input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder="ค้นหา SKU หรือ ชื่อสินค้า..." className="w-full p-4 pl-12 bg-slate-50 border-2 border-transparent focus:border-sky-500 rounded-2xl font-bold outline-none transition-all shadow-inner" /></div>
                  <div className="flex items-center bg-sky-50 p-1.5 rounded-2xl border-2 border-sky-100 min-w-[200px]"><span className="px-3 text-[10px] font-black text-sky-600 uppercase">จำนวนที่จะสั่ง</span><input type="number" min="1" value={batchQty} onChange={(e) => setBatchQty(Math.max(1, parseInt(e.target.value) || 1))} className="flex-1 bg-white p-3 rounded-xl font-black text-sky-700 outline-none text-right border border-sky-200" /></div>
                </div>
                
                {/* CATEGORY BAR IN BILL MODAL */}
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                  {productCategories.map((cat: string) => (
                    <button 
                      key={cat} 
                      onClick={() => setModalCatFilter(cat)}
                      className={`px-6 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${modalCatFilter === cat ? 'bg-sky-600 text-white shadow-lg' : 'bg-slate-50 border text-slate-400 hover:bg-slate-100'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 overflow-y-auto flex-1 custom-scrollbar pr-1">
                {modalFilteredProducts.map((p:any) => (
                  <button key={p.id} onClick={() => addToCart(p, batchQty)} className="bg-white p-4 rounded-[2.5rem] border-2 border-slate-100 shadow-sm hover:border-sky-500 hover:shadow-xl transition-all text-left group active:scale-95 relative">
                      <div className="w-full aspect-square rounded-[2rem] bg-slate-50 mb-3 overflow-hidden border">
                        {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110" /> : <div className={`w-full h-full ${p.color} flex items-center justify-center text-4xl font-black text-white`}>{p.name.charAt(0)}</div>}
                        <div className="absolute top-2 right-2 bg-black/70 text-white text-[9px] px-2 py-1 rounded-lg font-black backdrop-blur-md">สต็อก: {p.stock}</div>
                      </div>
                      <h4 className="font-black text-slate-800 text-xs truncate mb-1">{p.name}</h4>
                      <p className="text-sky-600 font-black text-sm">{formatMoney(p.price)}</p>
                  </button>
                ))}
            </div>
          </div>
          <div className={`w-full md:w-[450px] bg-slate-50 border-l flex flex-col h-full p-4 md:p-8 overflow-hidden ${newBillTab === 'checkout' ? 'flex' : 'hidden md:flex'}`}>
            <div className="hidden md:flex justify-between items-center mb-6"><h3 className="text-2xl font-black text-slate-800">ตะกร้าสินค้า</h3><button onClick={()=>setIsOpen(false)} className="p-3 bg-white border rounded-2xl"><X size={20}/></button></div>
            <div className="space-y-3 mb-6 overflow-y-auto max-h-[30%] pr-1">
                <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="ชื่อลูกค้า" className="w-full p-3 bg-white border-2 border-transparent focus:border-sky-500 rounded-xl font-bold text-xs outline-none" />
                <input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="เบอร์โทรศัพท์" className="w-full p-3 bg-white border-2 border-transparent focus:border-sky-500 rounded-xl font-bold text-xs outline-none" />
                <textarea value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} placeholder="ที่อยู่จัดส่ง" className="w-full p-3 bg-white border-2 border-transparent focus:border-sky-500 rounded-xl font-bold h-20 text-xs resize-none outline-none" />
                <div className="grid grid-cols-2 gap-2">
                    <select value={shippingCarrier} onChange={e=>setShippingCarrier(e.target.value as any)} className="p-3 bg-white border rounded-xl font-bold text-[10px]"><option value="None">รับเองหน้าร้าน</option><option value="Anuchit">Anuchit</option><option value="Meexai">Meexai</option></select>
                    <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)} className="p-3 bg-white border rounded-xl font-bold text-[10px]"><option value="Transfer">โอนเงิน</option><option value="COD">COD</option></select>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 mt-2 pr-1 custom-scrollbar">
                {billItems.length > 0 && <div className="text-right mb-2"><button onClick={()=>setBillItems([])} className="text-[9px] font-bold text-rose-400 hover:text-rose-600">ล้างตะกร้า</button></div>}
                {billItems.map((it:any) => (
                  <div key={it.id} className="flex items-center gap-3 p-3 bg-white rounded-2xl border-2 border-slate-100 shadow-sm animate-in slide-in-from-right-2">
                      <div className="w-12 h-12 rounded-xl overflow-hidden border flex-shrink-0">{it.imageUrl ? <img src={it.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${it.color} text-white flex items-center justify-center text-xs font-black`}>{it.name.charAt(0)}</div>}</div>
                      <div className="flex-1 min-w-0"><div className="text-[11px] font-black truncate">{it.name}</div><div className="text-[10px] font-bold text-sky-600">{formatMoney(it.price)}</div></div>
                      <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border">
                        <button onClick={()=>updateCartQuantity(it.id, it.quantity - 1)} className="p-1 text-slate-400 hover:text-sky-600"><Minus size={14}/></button>
                        <input type="number" min="0" value={it.quantity} onChange={(e) => updateCartQuantity(it.id, parseInt(e.target.value) || 0)} className="w-14 text-center text-xs font-black bg-white rounded-md border py-1 outline-none text-sky-700" />
                        <button onClick={()=>updateCartQuantity(it.id, it.quantity + 1)} className="p-1 text-slate-400 hover:text-sky-600"><Plus size={14}/></button>
                      </div>
                      <button onClick={()=>setBillItems((p:any)=>p.filter((x:any)=>x.id!==it.id))} className="p-2 text-rose-200 hover:text-rose-500"><Trash2 size={16}/></button>
                  </div>
                ))}
            </div>
            <div className="mt-auto bg-white p-6 rounded-[2.5rem] border-t shadow-xl">
                <div className="flex justify-between items-end mb-5"><div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ยอดรวมสุทธิ</span><p className="text-3xl font-black text-sky-600">{formatMoney(cartTotal)}</p></div></div>
                <button disabled={billItems.length === 0} onClick={handleCheckout} className="w-full py-5 bg-sky-600 disabled:bg-slate-200 text-white rounded-[1.5rem] font-black text-xl shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all"><CheckCircle2 size={24}/> {isEditing ? 'บันทึกแก้ไข' : 'ยืนยันสั่งซื้อ'}</button>
            </div>
          </div>
      </div>
    </div>
  );
};

const ProductModal = ({ editingProduct, setIsProductModalOpen, handleImageUpload, db, setEditingProduct }: any) => (
  <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-in zoom-in-95">
    <Card className="w-full max-w-xl p-10 relative">
        <button onClick={()=>setIsProductModalOpen(false)} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full"><X size={20}/></button>
        <h3 className="text-2xl font-black mb-6 text-slate-800 flex items-center gap-3"><Package className="text-sky-500" size={24}/> {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
        <form onSubmit={async (e) => {
          e.preventDefault(); const fd = new FormData(e.currentTarget);
          const p = { id: editingProduct?.id || uuidv4(), name: fd.get('name') as string, code: fd.get('code') as string, cost: Number(fd.get('cost')), price: Number(fd.get('price')), stock: Number(fd.get('stock')), imageUrl: editingProduct?.imageUrl || "", color: editingProduct?.color || "bg-sky-500", category: fd.get('category') as string || "General" };
          await setDoc(doc(db, 'products', p.id), p); setIsProductModalOpen(false);
        }} className="space-y-4">
          <div className="flex justify-center mb-6"><div className="relative"><div className="w-32 h-32 rounded-[2rem] bg-slate-50 border-4 border-white shadow-xl flex items-center justify-center border-dashed border-slate-200 overflow-hidden">{editingProduct?.imageUrl ? <img src={editingProduct.imageUrl} className="w-full h-full object-cover" /> : <ImageIcon size={32} className="text-slate-300"/>}</div><label className="absolute bottom-0 right-0 p-3 bg-sky-600 text-white rounded-xl shadow-lg cursor-pointer"><Upload size={16}/><input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, (url:string) => setEditingProduct((prev:any) => ({...prev, imageUrl: url})))} /></label></div></div>
          <input name="name" required defaultValue={editingProduct?.name} placeholder="ชื่อสินค้า" className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" />
          <input name="code" required defaultValue={editingProduct?.code} placeholder="รหัส SKU" className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" />
          <div className="grid grid-cols-2 gap-4"><input name="cost" type="number" required defaultValue={editingProduct?.cost} placeholder="ราคาทุน" className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" /><input name="price" type="number" required defaultValue={editingProduct?.price} placeholder="ราคาขาย" className="w-full p-4 bg-sky-50 border-sky-100 rounded-xl font-black text-sky-600 outline-none" /></div>
          <div className="grid grid-cols-2 gap-4"><input name="stock" type="number" required defaultValue={editingProduct?.stock} placeholder="สต็อก" className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" /><input name="category" defaultValue={editingProduct?.category} placeholder="กลุ่มสินค้า" className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" /></div>
          <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-xl font-black shadow-xl mt-4 active:scale-95 transition-all">บันทึกสินค้า</button>
        </form>
    </Card>
  </div>
);

const PromoModal = ({ editingPromo, setIsPromoModalOpen, products, promoSkusInput, setPromoSkusInput, db, t }: any) => (
  <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-in zoom-in-95">
    <Card className="w-full max-w-2xl p-10 relative">
        <button onClick={()=>setIsPromoModalOpen(false)} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full"><X size={20}/></button>
        <h3 className="text-2xl font-black mb-6 text-slate-800 flex items-center gap-3"><Tag className="text-sky-500" size={24}/> ตั้งค่าโปรโมชั่น</h3>
        <form onSubmit={async (e) => {
          e.preventDefault(); const fd = new FormData(e.currentTarget); const tiers: PromoTier[] = [];
          for(let i=1; i<=6; i++) { const q = fd.get(`qty_${i}`); const pr = fd.get(`price_${i}`); if(q && pr) tiers.push({ minQty: Number(q), unitPrice: Number(pr) }); }
          const skuList = promoSkusInput.split(',').map((s:any) => s.trim()).filter(Boolean);
          const selectedIds = products.filter((p:any) => skuList.includes(p.code)).map((p:any) => p.id);
          const promo = { id: editingPromo?.id || uuidv4(), name: fd.get('name') as string, targetProductIds: selectedIds, isActive: true, tiers };
          await setDoc(doc(db, 'promotions', promo.id), promo); setIsPromoModalOpen(false);
        }} className="space-y-4">
          <input name="name" required defaultValue={editingPromo?.name} placeholder="ชื่อโปรโมชั่น" className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" />
          <textarea value={promoSkusInput} onChange={e=>setPromoSkusInput(e.target.value)} placeholder={t.promo_sku_placeholder} className="w-full p-4 bg-slate-50 border rounded-xl font-bold h-24 text-xs outline-none resize-none" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({length: 6}).map((_, i) => (
              <div key={i} className="flex gap-2 items-center bg-slate-50 p-2 rounded-xl border">
                <input name={`qty_${i+1}`} type="number" placeholder="ชิ้น" defaultValue={editingPromo?.tiers?.[i]?.minQty} className="w-16 p-2 bg-white border rounded-lg font-bold text-center text-xs" />
                <ArrowRight size={12} className="text-slate-300"/><input name={`price_${i+1}`} type="number" placeholder="ราคา" defaultValue={editingPromo?.tiers?.[i]?.unitPrice} className="flex-1 p-2 bg-white border rounded-lg font-black text-sky-600 text-center text-xs" />
              </div>
            ))}
          </div>
          <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-xl font-black shadow-xl mt-4 active:scale-95 transition-all">บันทึกโปรโมชั่น</button>
        </form>
    </Card>
  </div>
);

const PrintArea = ({ activePrintBill, storeProfile, formatMoney, printType }: any) => {
  if (!activePrintBill || printType !== 'bill') return null;
  return (
    <div className="print-area hidden">
      <div className="p-10 bg-white min-h-screen text-black border-2 border-black">
        <div className="flex justify-between border-b-4 border-black pb-6 mb-6">
           <div><h1 className="text-3xl font-black uppercase">{storeProfile.name}</h1><p className="text-xs font-bold">{storeProfile.address}</p><p className="text-xs font-bold">โทร: {storeProfile.phone}</p></div>
           <div className="text-right"><h2 className="text-3xl font-black uppercase">บิลขายสินค้า</h2><p className="font-black">#{activePrintBill.id.slice(0,10).toUpperCase()}</p><p className="font-bold">{activePrintBill.date}</p></div>
        </div>
        <div className="mb-6"><p className="text-sm font-black uppercase">Customer Info:</p><p className="text-lg font-bold">{activePrintBill.customerName || 'Walk-in'}</p><p className="text-sm">{activePrintBill.customerPhone}</p><p className="text-sm italic">{activePrintBill.customerAddress}</p></div>
        <table className="w-full border-collapse border-2 border-black mb-6">
           <thead><tr className="bg-slate-200"><th className="p-2 border-2 border-black text-left">รายการ</th><th className="p-2 border-2 border-black text-center w-20">จำนวน</th><th className="p-2 border-2 border-black text-right w-32">ราคา/หน่วย</th><th className="p-2 border-2 border-black text-right w-40">รวม</th></tr></thead>
           <tbody>
              {activePrintBill.items.map((item:any, i:number) => (
                <tr key={i}><td className="p-2 border-2 border-black font-bold">{item.name}</td><td className="p-2 border-2 border-black text-center font-bold">{item.quantity}</td><td className="p-2 border-2 border-black text-right">{formatMoney(item.price)}</td><td className="p-2 border-2 border-black text-right font-black">{formatMoney(item.price * item.quantity)}</td></tr>
              ))}
           </tbody>
        </table>
        <div className="flex justify-end"><div className="w-72 space-y-2"><div className="flex justify-between border-t-2 border-black pt-4 font-black text-2xl"><span>ยอดเงินสุทธิ</span><span>{formatMoney(activePrintBill.total)}</span></div></div></div>
        <div className="mt-32 grid grid-cols-2 gap-20 text-center"><div className="border-t-2 border-black pt-2 font-black">ผู้รับของ</div><div className="border-t-2 border-black pt-2 font-black">ผู้ออกบิล</div></div>
      </div>
    </div>
  );
};

export default App;
