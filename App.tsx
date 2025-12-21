
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

// Responsive Card Component
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

  // Backup Reminder Check (End of month: 28th-31st)
  const isEndOfMonth = useMemo(() => {
    const today = new Date();
    return today.getDate() >= 28;
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem('pos_language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('pos_profile', JSON.stringify(storeProfile));
  }, [storeProfile]);

  // Real-time Sync
  useEffect(() => {
    if (!db) return;
    const unsubP = onSnapshot(collection(db, 'products'), s => setProducts(s.docs.map(d => ({ ...d.data(), id: d.id } as Product))), err => console.error("Firestore sync error:", err));
    const unsubS = onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), s => setRecentSales(s.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord))));
    const unsubPr = onSnapshot(collection(db, 'promotions'), s => setPromotions(s.docs.map(d => ({ ...d.data(), id: d.id } as Promotion))));
    return () => { unsubP(); unsubS(); unsubPr(); };
  }, []);

  // Filter and Sort Products for UI
  const productCategories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category || 'General')));
    return ['All', ...cats.sort()];
  }, [products]);

  const sortedAndFilteredProducts = useMemo(() => {
    let list = [...products];
    if (stockCategoryFilter !== 'All') {
      list = list.filter(p => (p.category || 'General') === stockCategoryFilter);
    }
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }, [products, stockCategoryFilter]);

  // Grouped products for Print Report
  const groupedProductsForPrint = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    products.forEach(p => {
      const cat = p.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return Object.keys(groups).sort().map(catName => ({
      name: catName,
      items: groups[catName].sort((a, b) => a.code.localeCompare(b.code))
    }));
  }, [products]);

  // AI Helpers
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (mode === AppMode.AI) scrollToBottom();
  }, [messages, mode]);

  // Fix: Added missing handlePrintBill function to resolve "Cannot find name 'handlePrintBill'" on line 388
  const handlePrintBill = (order: SaleRecord) => {
    setActivePrintBill(order);
    setPrintType('bill');
    setTimeout(() => window.print(), 200);
  };

  // Fix: Added missing handleImageUpload function for product image management
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        callback(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isTyping) return;

    const userMsg: Message = { id: uuidv4(), role: Role.USER, text: chatInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    const modelMsgId = uuidv4();
    const initialModelMsg: Message = { id: modelMsgId, role: Role.MODEL, text: '...', timestamp: Date.now() };
    setMessages(prev => [...prev, initialModelMsg]);

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
      setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, text: "ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อ", isError: true } : m));
    } finally {
      setIsTyping(false);
    }
  };

  const formatMoney = (amount: number) => {
    const locale = language === 'th' ? 'th-TH' : (language === 'en' ? 'en-US' : 'lo-LA');
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'LAK', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getProductPrice = (product: Product, quantity: number) => {
    const promo = promotions.find(p => p.targetProductIds.includes(product.id) && p.isActive);
    if (!promo || !promo.tiers || !promo.tiers.length) return Number(product.price || 0);
    const sortedTiers = [...promo.tiers].sort((a, b) => b.minQty - a.minQty);
    const tier = sortedTiers.find(t => quantity >= t.minQty);
    return tier ? Number(tier.unitPrice) : Number(product.price || 0);
  };

  const updateCartQuantity = (id: string, qty: number) => {
    const safeQty = isNaN(qty) ? 0 : Math.max(1, qty);
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

  const handleOpenNewBill = () => {
    setEditingBill(null);
    setBillItems([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setShippingCarrier('None');
    setPaymentMethod('Transfer');
    setPaymentStatus('Paid');
    setNewBillTab('items');
    setIsBillModalOpen(true);
  };

  const handleOpenEditBill = (order: SaleRecord) => {
    setEditingBill(order);
    setBillItems([...order.items]);
    setCustomerName(order.customerName || '');
    setCustomerPhone(order.customerPhone || '');
    setCustomerAddress(order.customerAddress || '');
    setShippingCarrier(order.shippingCarrier || 'None');
    setPaymentMethod(order.paymentMethod);
    setPaymentStatus(order.status);
    setNewBillTab('checkout');
    setIsBillModalOpen(true);
  };

  const handleCheckout = async () => {
    if (billItems.length === 0) { alert("กรุณาเลือกสินค้าก่อนเช็คบิล"); return; }
    const total = billItems.reduce((s, i) => s + (Number(i.price || 0) * i.quantity), 0);
    
    const isEditing = !!editingBill;
    const orderId = isEditing ? editingBill.id : uuidv4();

    const order: SaleRecord = {
      id: orderId, 
      items: [...billItems], 
      subtotal: total, 
      discount: 0, 
      total, 
      date: isEditing ? editingBill.date : new Date().toLocaleString(), 
      timestamp: isEditing ? editingBill.timestamp : Date.now(), 
      status: paymentStatus, 
      paymentMethod, 
      customerName, 
      customerPhone, 
      customerAddress, 
      shippingCarrier, 
      shippingBranch
    };
    
    try {
      if (!db) throw new Error("Database not connected");
      await setDoc(doc(db, 'sales', order.id), order);
      
      // Update stock only for NEW bills (Simplified logic)
      if (!isEditing) {
        for (const item of billItems) {
          const p = products.find(x => x.id === item.id);
          if (p) await setDoc(doc(db, 'products', p.id), { ...p, stock: Math.max(0, (Number(p.stock) || 0) - item.quantity) });
        }
      }
      
      setIsBillModalOpen(false); 
      setEditingBill(null);
      setBillItems([]); 
      setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setShippingBranch('');
      alert(isEditing ? "ปรับปรุงข้อมูลบิลสำเร็จ!" : "เช็คบิลสำเร็จ!");
    } catch (err: any) { alert("Error: " + err.message); }
  };

  const reportStats = useMemo(() => {
    const validSales = recentSales.filter(s => s.status !== 'Cancelled');
    const totalRevenue = validSales.reduce((a, b) => a + Number(b.total || 0), 0);
    const stockValue = products.reduce((a, b) => a + (Number(b.cost || 0) * Number(b.stock || 0)), 0);
    const totalCost = validSales.reduce((acc, sale) => acc + sale.items.reduce((itemAcc, item) => {
      const original = products.find(p => p.id === item.id);
      return itemAcc + (Number(original?.cost || 0) * item.quantity);
    }, 0), 0);

    const monthlyData: Record<string, number> = {};
    validSales.forEach(s => {
      const parts = s.date.split('/');
      if (parts.length >= 3) {
        const monthStr = parts[0] + '/' + parts[2].split(' ')[0];
        monthlyData[monthStr] = (monthlyData[monthStr] || 0) + Number(s.total);
      }
    });

    const productCounts: Record<string, {name: string, qty: number, revenue: number}> = {};
    validSales.forEach(s => s.items.forEach(i => {
      if (!productCounts[i.id]) productCounts[i.id] = {name: i.name, qty: 0, revenue: 0};
      productCounts[i.id].qty += i.quantity;
      productCounts[i.id].revenue += i.quantity * Number(i.price);
    }));
    const topProducts = Object.values(productCounts).sort((a,b) => b.qty - a.qty).slice(0, 10);

    const customerCounts: Record<string, {name: string, total: number, bills: number}> = {};
    validSales.forEach(s => {
      const cName = s.customerName || "ทั่วไป / Walk-in";
      if (!customerCounts[cName]) customerCounts[cName] = {name: cName, total: 0, bills: 0};
      customerCounts[cName].total += Number(s.total);
      customerCounts[cName].bills += 1;
    });
    const topCustomers = Object.values(customerCounts).sort((a,b) => b.total - a.total).slice(0, 10);

    return { totalRevenue, totalCost, profit: totalRevenue - totalCost, stockValue, topProducts, topCustomers, monthlyData };
  }, [recentSales, products]);

  const cartTotal = billItems.reduce((s,i)=>s+(Number(i.price || 0)*i.quantity),0);

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onExport={()=>{}} onImport={()=>{}} language={language} setLanguage={setLanguage} />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="bg-white border-b px-4 md:px-8 py-3 md:py-4 flex items-center justify-between shadow-sm z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-400"><List size={20} /></button>
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-100 rounded-lg flex items-center justify-center border overflow-hidden flex-shrink-0">
                {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : < Coffee size={18} className="text-slate-400"/>}
             </div>
             <h2 className="font-black text-slate-800 uppercase tracking-tight text-xs md:text-base truncate max-w-[120px] md:max-w-none">{t[`menu_${mode}`] || mode}</h2>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
             <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-0.5">{storeProfile.name}</p>
                <div className="flex items-center gap-1 justify-end"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div><p className="text-[8px] text-emerald-600 font-bold uppercase tracking-widest">Active</p></div>
             </div>
             <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm overflow-hidden flex-shrink-0">
                <img src={storeProfile.logoUrl || `https://ui-avatars.com/api/?name=${storeProfile.name}&background=0ea5e9&color=fff`} alt="store" />
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 md:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-4 md:space-y-8 pb-10">
            {mode === AppMode.DASHBOARD && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 animate-in fade-in">
                 {[
                   { label: t.dash_sales, val: reportStats.totalRevenue, icon: TrendingUp, color: "sky" },
                   { label: t.dash_stock_cost, val: reportStats.stockValue, icon: Package, color: "amber" },
                   { label: t.menu_orders, val: recentSales.filter(s=>s.status!=='Cancelled').length, icon: ClipboardList, color: "purple", unit: "Bills" },
                   { label: t.dash_low_stock, val: products.filter(p => Number(p.stock) <= 5).length, icon: AlertCircle, color: "rose", unit: "Alert" }
                 ].map((card, i) => (
                   <Card key={i} className="group hover:border-sky-500 transition-all flex flex-col justify-between p-3 md:p-6">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{card.label}</span>
                        <div className={`p-1 md:p-3 rounded-lg md:rounded-2xl bg-${card.color}-50 text-${card.color}-600`}><card.icon size={14} className="md:w-5 md:h-5"/></div>
                      </div>
                      <h3 className="text-sm md:text-2xl font-black text-slate-900 break-all">{card.unit ? `${card.val} ${card.unit}` : formatMoney(card.val)}</h3>
                   </Card>
                 ))}
              </div>
            )}

            {mode === AppMode.ORDERS && (
              <div className="space-y-4 animate-in slide-in-from-bottom-5">
                 <div className="flex flex-row justify-between items-center">
                    <h2 className="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2"><ClipboardList className="text-sky-500" size={20}/> {t.menu_orders}</h2>
                    <div className="flex gap-2">
                      <button onClick={handleOpenNewBill} className="bg-sky-600 text-white px-4 md:px-8 py-2 md:py-4 rounded-xl font-black hover:bg-sky-700 shadow-lg flex items-center gap-2 text-xs md:text-base">
                         <Plus size={16}/> {t.order_create_bill}
                      </button>
                    </div>
                 </div>
                 <div className="bg-white rounded-[1.2rem] md:rounded-[2.5rem] border shadow-sm overflow-hidden">
                   <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[700px]">
                       <thead className="bg-slate-50 border-b text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-6 py-4">Bill Info</th><th className="px-4 py-4 text-center">Payment</th><th className="px-4 py-4 text-right">Total</th><th className="px-4 py-4 text-center">Status</th><th className="px-4 py-4 text-center">Action</th></tr>
                       </thead>
                       <tbody className="divide-y text-xs md:text-sm font-bold">
                          {recentSales.map(s => (
                            <tr key={s.id} className={`hover:bg-slate-50 ${s.status === 'Cancelled' ? 'opacity-40' : ''}`}>
                               <td className="px-6 py-4">
                                 <div className="text-slate-800 truncate max-w-[150px]">#{s.id.slice(0,8).toUpperCase()} | {s.customerName || '-'}</div>
                                 <div className="text-[9px] text-slate-300 font-medium">{s.date}</div>
                               </td>
                               <td className="px-4 py-4 text-center"><span className="px-2 py-0.5 bg-slate-100 rounded text-[8px] uppercase font-black">{s.paymentMethod}</span></td>
                               <td className="px-4 py-4 text-right text-sky-600 font-black whitespace-nowrap">{formatMoney(s.total)}</td>
                               <td className="px-4 py-4 text-center whitespace-nowrap">
                                 <span className={`px-2 py-0.5 rounded-lg text-[8px] md:text-[10px] uppercase font-black ${s.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : s.status === 'Cancelled' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>{s.status}</span>
                               </td>
                               <td className="px-4 py-4 text-center flex items-center justify-center gap-2">
                                 <button onClick={() => handlePrintBill(s)} className="p-2 text-sky-500 hover:bg-sky-50 rounded-lg" title="Print Bill"><Printer size={16}/></button>
                                 <button onClick={() => handleOpenEditBill(s)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg" title="Edit Bill"><Edit size={16}/></button>
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
                 <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                    <h2 className="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2"><Package className="text-sky-500" size={20}/> {t.stock_title}</h2>
                    <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-sky-600 text-white px-4 md:px-8 py-2 md:py-4 rounded-xl font-black text-xs md:text-base shadow-lg hover:bg-sky-700 active:scale-95 transition-all">
                       {t.stock_add}
                    </button>
                 </div>
                 <div className="bg-white rounded-[1.2rem] md:rounded-[2.5rem] border shadow-sm overflow-hidden">
                   <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[650px]">
                       <thead className="bg-slate-50 border-b text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-6 py-4">Item</th><th className="px-4 py-4">Category</th><th className="px-4 py-4 text-right">Cost</th><th className="px-4 py-4 text-right">Price</th><th className="px-4 py-4 text-center">Stock</th><th className="px-4 py-4 text-center">Edit</th></tr>
                       </thead>
                       <tbody className="divide-y text-xs md:text-sm font-bold">
                          {sortedAndFilteredProducts.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-6 py-4 flex items-center gap-3">
                                  <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-slate-100 border overflow-hidden flex-shrink-0 flex items-center justify-center font-black">
                                    {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${p.color} text-white flex items-center justify-center`}>{p.name.charAt(0)}</div>}
                                  </div>
                                  <div className="truncate"><div className="text-slate-800 truncate max-w-[120px]">{p.name}</div><div className="text-[9px] text-slate-300">SKU: {p.code}</div></div>
                               </td>
                               <td className="px-4 py-4"><span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase">{p.category || 'General'}</span></td>
                               <td className="px-4 py-4 text-right text-slate-400 whitespace-nowrap">{formatMoney(p.cost)}</td>
                               <td className="px-4 py-4 text-right text-sky-600 font-black whitespace-nowrap">{formatMoney(p.price)}</td>
                               <td className="px-4 py-4 text-center"><span className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${Number(p.stock) <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-50 text-emerald-600'}`}>{p.stock}</span></td>
                               <td className="px-4 py-4 text-center"><button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-2 text-slate-300 hover:text-sky-600 transition-colors"><Edit size={16}/></button></td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                   </div>
                 </div>
              </div>
            )}
            
            {mode === AppMode.REPORTS && <ReportsView reportStats={reportStats} formatMoney={formatMoney} />}
          </div>
        </div>
      </main>

      <BillModal isOpen={isBillModalOpen} setIsOpen={setIsBillModalOpen} newBillTab={newBillTab} setNewBillTab={setNewBillTab} billItems={billItems} setBillItems={setBillItems} products={products} addToCart={addToCart} updateCartQuantity={updateCartQuantity} customerName={customerName} setCustomerName={setCustomerName} customerPhone={customerPhone} setCustomerPhone={setCustomerPhone} customerAddress={customerAddress} setCustomerAddress={setCustomerAddress} shippingCarrier={shippingCarrier} setShippingCarrier={setShippingCarrier} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} handleCheckout={handleCheckout} formatMoney={formatMoney} cartTotal={cartTotal} t={translations[language]} skuSearch={skuSearch} setSkuSearch={setSkuSearch} isEditing={!!editingBill} />
      
      {/* Fix: Included missing ProductModal in the render tree */}
      {isProductModalOpen && (
        <ProductModal 
          editingProduct={editingProduct} 
          setIsProductModalOpen={setIsProductModalOpen} 
          handleImageUpload={handleImageUpload} 
          db={db} 
          setEditingProduct={setEditingProduct} 
        />
      )}
    </div>
  );
};

const BillModal = ({ isOpen, setNewBillTab, newBillTab, billItems, setBillItems, products, addToCart, updateCartQuantity, customerName, setCustomerName, customerPhone, setCustomerPhone, customerAddress, setCustomerAddress, shippingCarrier, setShippingCarrier, paymentMethod, setPaymentMethod, handleCheckout, formatMoney, cartTotal, t, skuSearch, setSkuSearch, setIsOpen, isEditing }: any) => {
  // State for batch adding quantity
  const [batchQty, setBatchQty] = useState<number>(1);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center backdrop-blur-xl animate-in zoom-in-95">
      <div className="bg-white w-full h-full md:max-w-[98vw] md:h-[95vh] md:rounded-[3rem] shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
          
          {/* Mobile Tabs */}
          <div className="flex items-center border-b md:hidden bg-white z-20">
            <button onClick={()=>setNewBillTab('items')} className={`flex-1 py-4 text-xs font-black border-b-2 ${newBillTab === 'items' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-400'}`}>1. เลือกสินค้า</button>
            <button onClick={()=>setNewBillTab('checkout')} className={`flex-1 py-4 text-xs font-black border-b-2 ${newBillTab === 'checkout' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-400'}`}>2. ข้อมูลบิล ({billItems.length})</button>
            <button onClick={()=>setIsOpen(false)} className="px-4 text-slate-400"><X size={20}/></button>
          </div>

          {/* Left Side: Product Selection */}
          <div className={`flex-1 flex flex-col p-4 md:p-8 overflow-hidden bg-white ${newBillTab === 'items' ? 'flex' : 'hidden md:flex'}`}>
            <div className="hidden md:flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-slate-800">{isEditing ? 'ปรับปรุงรายการสินค้า' : 'เลือกสินค้า'}</h3>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/>
                    <input 
                      value={skuSearch} 
                      onChange={e=>setSkuSearch(e.target.value)} 
                      placeholder="ค้นหา SKU หรือ ชื่อสินค้า..." 
                      className="w-full p-4 pl-12 bg-slate-50 border-2 border-transparent focus:border-sky-500 rounded-2xl font-bold outline-none transition-all shadow-inner" 
                    />
                </div>
                
                {/* Batch Quantity Selector */}
                <div className="flex items-center bg-sky-50 p-1.5 rounded-2xl border-2 border-sky-100 shadow-sm min-w-[200px]">
                    <span className="px-3 text-[10px] font-black text-sky-600 uppercase whitespace-nowrap">ระบุจำนวนที่จะสั่ง</span>
                    <input 
                        type="number"
                        min="1"
                        value={batchQty}
                        onChange={(e) => setBatchQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="flex-1 bg-white p-3 rounded-xl font-black text-sky-700 outline-none text-right border border-sky-200"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 overflow-y-auto flex-1 custom-scrollbar pb-32 md:pb-0 pr-1">
                {products.filter((p:any) => !skuSearch || p.name.includes(skuSearch) || p.code.includes(skuSearch)).map((p:any) => (
                  <button 
                    key={p.id} 
                    onClick={() => addToCart(p, batchQty)} 
                    className="bg-white p-4 rounded-[2.5rem] border-2 border-slate-100 shadow-sm hover:border-sky-500 hover:shadow-xl hover:shadow-sky-100 transition-all text-left group active:scale-95 relative overflow-hidden"
                  >
                      <div className="w-full aspect-square rounded-[2rem] bg-slate-50 mb-3 overflow-hidden border relative">
                        {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110" /> : <div className={`w-full h-full ${p.color} flex items-center justify-center text-4xl font-black text-white`}>{p.name.charAt(0)}</div>}
                        <div className="absolute top-2 right-2 bg-black/70 text-white text-[9px] px-2 py-1 rounded-lg font-black backdrop-blur-md">สต็อก: {p.stock}</div>
                      </div>
                      <h4 className="font-black text-slate-800 text-xs truncate mb-1">{p.name}</h4>
                      <p className="text-sky-600 font-black text-sm">{formatMoney(p.price)}</p>
                      
                      {/* Hover Indicator */}
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-sky-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </button>
                ))}
            </div>
          </div>

          {/* Right Side: Bill Info & Cart */}
          <div className={`w-full md:w-[450px] lg:w-[500px] bg-slate-50 border-l flex flex-col h-full p-4 md:p-8 overflow-hidden ${newBillTab === 'checkout' ? 'flex' : 'hidden md:flex'}`}>
            <div className="hidden md:flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-slate-800">ตะกร้าสินค้า</h3>
                <button onClick={()=>setIsOpen(false)} className="p-3 bg-white border shadow-sm rounded-2xl hover:bg-slate-50 transition-all"><X size={20}/></button>
            </div>

            {/* Customer Info Form */}
            <div className="space-y-3 mb-6 overflow-y-auto max-h-[30%] pr-1">
                <div className="relative group">
                    <User className="absolute left-3 top-3 text-slate-400" size={16}/>
                    <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="ชื่อลูกค้า" className="w-full p-3 pl-10 bg-white border-2 border-transparent focus:border-sky-500 rounded-xl font-bold text-xs outline-none shadow-sm transition-all" />
                </div>
                <div className="relative">
                    <Phone className="absolute left-3 top-3 text-slate-400" size={16}/>
                    <input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="เบอร์โทรศัพท์" className="w-full p-3 pl-10 bg-white border-2 border-transparent focus:border-sky-500 rounded-xl font-bold text-xs outline-none shadow-sm transition-all" />
                </div>
                <textarea value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} placeholder="ที่อยู่จัดส่ง / รายละเอียดเพิ่มเติม" className="w-full p-3 bg-white border-2 border-transparent focus:border-sky-500 rounded-xl font-bold h-20 text-xs resize-none outline-none shadow-sm transition-all" />
                
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">การจัดส่ง</label>
                        <select value={shippingCarrier} onChange={e=>setShippingCarrier(e.target.value as any)} className="w-full p-3 bg-white border rounded-xl font-bold text-[10px] outline-none shadow-sm"><option value="None">รับเองหน้าร้าน</option><option value="Anuchit">Anuchit</option><option value="Meexai">Meexai</option><option value="Rungarun">Rungarun</option></select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">การชำระเงิน</label>
                        <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)} className="w-full p-3 bg-white border rounded-xl font-bold text-[10px] outline-none shadow-sm"><option value="Transfer">โอนเงิน</option><option value="COD">เก็บเงินปลายทาง</option></select>
                    </div>
                </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 mt-2 pr-1 custom-scrollbar">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">รายการในบิล ({billItems.length})</span>
                    {billItems.length > 0 && <button onClick={()=>setBillItems([])} className="text-[9px] font-bold text-rose-400 hover:text-rose-600">ล้างตะกร้า</button>}
                </div>
                {billItems.map((it:any) => (
                  <div key={it.id} className="flex items-center gap-3 p-3 bg-white rounded-2xl border-2 border-slate-100 shadow-sm animate-in slide-in-from-right-2">
                      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border">
                        {it.imageUrl ? <img src={it.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${it.color} text-white flex items-center justify-center text-xs font-black`}>{it.name.charAt(0)}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-black truncate text-slate-700">{it.name}</div>
                        <div className="text-[10px] font-bold text-sky-600">{formatMoney(it.price)}</div>
                      </div>
                      
                      {/* Direct Editable Quantity in Cart */}
                      <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                        <button onClick={()=>updateCartQuantity(it.id, it.quantity - 1)} className="p-1 text-slate-400 hover:text-sky-600 transition-colors"><Minus size={14}/></button>
                        <input 
                          type="number" 
                          min="1"
                          value={it.quantity}
                          onChange={(e) => updateCartQuantity(it.id, parseInt(e.target.value) || 0)}
                          onBlur={(e) => { if(parseInt(e.target.value) < 1 || isNaN(parseInt(e.target.value))) updateCartQuantity(it.id, 1); }}
                          className="w-16 text-center text-xs font-black bg-white rounded-md border border-slate-100 py-1 outline-none text-sky-700 focus:border-sky-500 shadow-inner"
                        />
                        <button onClick={()=>updateCartQuantity(it.id, it.quantity + 1)} className="p-1 text-slate-400 hover:text-sky-600 transition-colors"><Plus size={14}/></button>
                      </div>

                      <button onClick={()=>setBillItems((p:any)=>p.filter((x:any)=>x.id!==it.id))} className="p-2 text-rose-200 hover:text-rose-500 transition-colors"><Trash2 size={16}/></button>
                  </div>
                ))}
                {billItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 opacity-30">
                        <ShoppingCart size={48} className="mb-4 text-slate-300"/>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">ยังไม่มีสินค้าในตะกร้า</p>
                    </div>
                )}
            </div>

            {/* Total & Checkout Button */}
            <div className="mt-auto bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <div className="flex justify-between items-end mb-5">
                    <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ยอดรวมสุทธิ</span>
                        <p className="text-3xl font-black text-sky-600">{formatMoney(cartTotal)}</p>
                    </div>
                    <div className="text-right">
                        <span className="text-[9px] font-bold text-slate-400">{billItems.reduce((acc:any, it:any) => acc + it.quantity, 0)} ชิ้น</span>
                    </div>
                </div>
                <button 
                    disabled={billItems.length === 0} 
                    onClick={handleCheckout} 
                    className="w-full py-5 bg-sky-600 disabled:bg-slate-200 disabled:shadow-none text-white rounded-[1.5rem] font-black text-xl shadow-xl shadow-sky-200 flex items-center justify-center gap-3 transition-all hover:bg-sky-700 active:scale-[0.98]"
                >
                    <CheckCircle2 size={24}/> {isEditing ? 'บันทึกการแก้ไข' : 'ยืนยันการสั่งซื้อ'}
                </button>
            </div>
          </div>
      </div>
    </div>
  );
};

const ReportsView = ({ reportStats, formatMoney }: any) => {
  const maxMonthly = Math.max(...Object.values(reportStats.monthlyData as Record<string, number>), 100000);
  
  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 md:p-8 flex flex-col min-h-[400px]">
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h3 className="text-lg md:text-xl font-black text-slate-800">Sales Trend</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revenue by Month</p>
                </div>
                <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl"><TrendingUp size={20}/></div>
              </div>
              
              <div className="flex-1 flex items-end justify-around gap-2 px-4">
                {Object.keys(reportStats.monthlyData).length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-slate-300 font-bold italic">ยังไม่มีข้อมูลการขาย</div>
                ) : (
                  Object.entries(reportStats.monthlyData as Record<string, number>).map(([month, value]) => (
                    <div key={month} className="flex flex-col items-center flex-1 max-w-[60px] group">
                        <div 
                          className="w-full bg-sky-500 rounded-t-xl transition-all duration-700 hover:bg-sky-600 relative cursor-help"
                          style={{ height: `${(value / maxMonthly) * 200}px` }}
                        >
                        </div>
                        <span className="text-[9px] font-black text-slate-400 mt-4 rotate-45 origin-left">{month}</span>
                    </div>
                  ))
                )}
              </div>
          </Card>
          <div className="space-y-6">
            <Card className="bg-sky-600 border-sky-500 p-6 md:p-8 text-white shadow-xl shadow-sky-100 flex flex-col justify-between h-1/2">
                <div className="flex justify-between items-start"><p className="text-[10px] font-black uppercase tracking-widest text-sky-100">Total Revenue</p><TrendingUp size={20} className="text-sky-200" /></div>
                <h3 className="text-2xl md:text-3xl font-black mt-4">{formatMoney(reportStats.totalRevenue)}</h3>
            </Card>
            <Card className="p-6 md:p-8 flex flex-col justify-between shadow-sm border-emerald-50 h-1/2">
                <div className="flex justify-between items-start"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profit (Est.)</p><DollarSign size={20} className="text-emerald-500" /></div>
                <h3 className="text-2xl md:text-3xl font-black text-emerald-600 mt-4">{formatMoney(reportStats.profit)}</h3>
            </Card>
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
          <div className="flex justify-center mb-6"><div className="relative"><div className="w-32 h-32 rounded-[2rem] bg-slate-50 border-4 border-white shadow-xl flex items-center justify-center border-dashed border-slate-200 overflow-hidden">{editingProduct?.imageUrl ? <img src={editingProduct.imageUrl} className="w-full h-full object-cover" /> : <ImageIcon size={32} className="text-slate-300"/>}</div><label className="absolute bottom-0 right-0 p-3 bg-sky-600 text-white rounded-xl shadow-lg cursor-pointer"><Upload size={16}/><input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, (url:string) => setEditingProduct((prev:any) => prev ? {...prev, imageUrl: url} : {id: '', name: '', code: '', price: 0, cost: 0, category: '', stock: 0, color: 'bg-sky-500', imageUrl: url}))} /></label></div></div>
          <input name="name" required defaultValue={editingProduct?.name} placeholder="ชื่อสินค้า" className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none" />
          <input name="code" required defaultValue={editingProduct?.code} placeholder="รหัส SKU" className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none" />
          <div className="grid grid-cols-2 gap-4"><input name="cost" type="number" required defaultValue={editingProduct?.cost} placeholder="ราคาทุน" className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none" /><input name="price" type="number" required defaultValue={editingProduct?.price} placeholder="ราคาขาย" className="w-full p-3 bg-sky-50 border-sky-100 rounded-xl font-black text-sky-600 text-sm outline-none" /></div>
          <div className="grid grid-cols-2 gap-4">
            <input name="stock" type="number" required defaultValue={editingProduct?.stock} placeholder="จำนวนคงเหลือ" className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none" />
            <input name="category" defaultValue={editingProduct?.category} placeholder="กลุ่มสินค้า (Category)" className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none" />
          </div>
          <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-xl font-black shadow-xl mt-4">บันทึกสินค้า</button>
        </form>
    </Card>
  </div>
);

export default App;
