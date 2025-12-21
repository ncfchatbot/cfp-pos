
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

  // --- DATA MANAGEMENT FUNCTIONS ---

  const handleClearSales = async () => {
    if (!confirm(t.confirm_clear)) return;
    if (!confirm("Confirm AGAIN: ลบประวัติการขายทั้งหมด?")) return;
    
    try {
      for (const sale of recentSales) {
        await deleteDoc(doc(db, 'sales', sale.id));
      }
      alert("ล้างประวัติการขายสำเร็จ!");
    } catch (err: any) { alert("Error: " + err.message); }
  };

  const handleClearStock = async () => {
    if (!confirm(t.confirm_clear)) return;
    if (!confirm("Confirm AGAIN: ลบข้อมูลสินค้าทั้งหมดในสต็อก?")) return;
    
    try {
      for (const product of products) {
        await deleteDoc(doc(db, 'products', product.id));
      }
      alert("ล้างข้อมูลสต็อกสำเร็จ!");
    } catch (err: any) { alert("Error: " + err.message); }
  };

  const handleFullBackup = () => {
    const backupData = {
      store: storeProfile,
      products: products,
      sales: recentSales,
      promotions: promotions,
      backupDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `CoffeePOS_FullBackup_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
  };

  // --- PRINTING LOGIC ---
  const handlePrintStock = () => {
    setPrintType('stock');
    setTimeout(() => { 
      window.print(); 
      setPrintType(null); 
    }, 250);
  };

  const handlePrintBill = (order: SaleRecord) => {
    setActivePrintBill(order);
    setPrintType('bill');
    setTimeout(() => { 
      window.print(); 
      setPrintType(null); 
    }, 250);
  };

  const exportRawData = () => {
    const headers = ["OrderID", "Date", "Customer", "Phone", "Address", "Payment", "Status", "Item", "Qty", "Cost/Unit", "Price/Unit", "ItemTotal", "BillTotal"];
    const rows = recentSales.flatMap(s => s.items.map(i => {
      const p = products.find(x => x.id === i.id);
      const costPerUnit = Number(p?.cost || 0);
      const pricePerUnit = Number(i.price || 0);
      return [s.id, s.date, (s.customerName || "-").replace(/,/g, ''), s.customerPhone || "-", `"${(s.customerAddress || "-").replace(/"/g, '""')}"`, s.paymentMethod, s.status, i.name.replace(/,/g, ''), i.quantity, costPerUnit, pricePerUnit, pricePerUnit * i.quantity, s.total]
    }));
    const csvContent = "\ufeff" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `CoffeePOS_RawData_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => callback(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const downloadSkuTemplate = () => {
    const headers = ["Code", "Name", "Price", "Cost", "Stock", "Category"];
    const example = ["CF001", "Iced Espresso", "25000", "15000", "100", "Coffee"];
    const csvContent = "\ufeff" + [headers, example].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `SKU_Import_Template.csv`;
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
      const results = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 5) continue;
        const [code, name, price, cost, stock, category] = cols;
        if (!code || !name) continue;
        const existing = products.find(p => p.code === code);
        results.push({ id: existing?.id || uuidv4(), code, name, price: Number(price) || 0, cost: Number(cost) || 0, stock: Number(stock) || 0, category: category || "General", color: existing?.color || "bg-sky-500", imageUrl: existing?.imageUrl || "" });
      }
      if (results.length > 0) {
        if (confirm(`พบสินค้า ${results.length} รายการ ต้องการนำเข้าข้อมูลใช่หรือไม่?`)) {
          try { for (const p of results) { await setDoc(doc(db, 'products', p.id), p); } alert(`นำเข้าสินค้า ${results.length} รายการสำเร็จ!`); } catch (err: any) { alert("Error: " + err.message); }
        }
      } else { alert("ไม่พบข้อมูลที่ถูกต้องในไฟล์"); }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const reportStats = useMemo(() => {
    const validSales = recentSales.filter(s => s.status !== 'Cancelled');
    const totalRevenue = validSales.reduce((a, b) => a + Number(b.total || 0), 0);
    const stockValue = products.reduce((a, b) => a + (Number(b.cost || 0) * Number(b.stock || 0)), 0);
    const totalCost = validSales.reduce((acc, sale) => acc + sale.items.reduce((itemAcc, item) => {
      const original = products.find(p => p.id === item.id);
      return itemAcc + (Number(original?.cost || 0) * item.quantity);
    }, 0), 0);

    // Group sales by month
    const monthlyData: Record<string, number> = {};
    validSales.forEach(s => {
      const parts = s.date.split('/'); // Assumes MM/DD/YYYY or similar
      if (parts.length >= 3) {
        const monthStr = parts[0] + '/' + parts[2].split(' ')[0]; // MM/YYYY
        monthlyData[monthStr] = (monthlyData[monthStr] || 0) + Number(s.total);
      }
    });

    // Top Products
    const productCounts: Record<string, {name: string, qty: number, revenue: number}> = {};
    validSales.forEach(s => s.items.forEach(i => {
      if (!productCounts[i.id]) productCounts[i.id] = {name: i.name, qty: 0, revenue: 0};
      productCounts[i.id].qty += i.quantity;
      productCounts[i.id].revenue += i.quantity * Number(i.price);
    }));
    const topProducts = Object.values(productCounts).sort((a,b) => b.qty - a.qty).slice(0, 10);

    // Top Customers
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
        {/* Backup Reminder Banner */}
        {isEndOfMonth && (
          <div className="bg-sky-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-black animate-pulse cursor-pointer z-20" onClick={() => setMode(AppMode.SETTINGS)}>
            <AlertCircle size={14} /> {t.backup_reminder} <ChevronRight size={14} />
          </div>
        )}

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
                      <button onClick={handleClearSales} className="p-2 md:p-4 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-all shadow-sm flex items-center gap-2 text-xs font-black">
                         <RotateCcw size={16}/> {t.clear_sales}
                      </button>
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
                                 <button onClick={() => handlePrintBill(s)} className="p-2 text-sky-500 hover:bg-sky-50 rounded-lg" title="Print A4 Bill"><Printer size={16}/></button>
                                 <button onClick={() => handleOpenEditBill(s)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg" title="Edit Bill"><Edit size={16}/></button>
                                 {s.status !== 'Cancelled' && <button onClick={async () => { if(confirm('Cancel?')) await setDoc(doc(db, 'sales', s.id), {...s, status: 'Cancelled'}); }} className="p-2 text-rose-300 hover:text-rose-600 transition-colors"><Trash2 size={16}/></button>}
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
                    <div className="flex flex-wrap gap-2">
                       <button onClick={handleClearStock} className="flex-1 md:flex-none p-2 md:p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-all shadow-sm flex items-center justify-center gap-2 text-xs font-black">
                          <RotateCcw size={16}/> {t.clear_stock}
                       </button>
                       <button onClick={handlePrintStock} className="flex-1 md:flex-none px-4 py-2 md:py-3 bg-white border border-slate-200 rounded-xl font-bold text-sky-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-xs md:text-sm shadow-sm">
                          <Printer size={16}/> {t.stock_print_report}
                       </button>
                       <button onClick={downloadSkuTemplate} className="flex-1 md:flex-none px-4 py-2 md:py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-xs md:text-sm shadow-sm">
                          <FileDown size={16}/> {t.stock_download_template}
                       </button>
                       <label className="flex-1 md:flex-none px-4 py-2 md:py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-xs md:text-sm shadow-sm cursor-pointer">
                          <FileUp size={16}/> {t.stock_import_csv}
                          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleBulkImport} />
                       </label>
                       <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="flex-1 md:flex-none bg-sky-600 text-white px-4 py-2 md:py-4 rounded-xl font-black text-xs md:text-base shadow-lg hover:bg-sky-700 active:scale-95 transition-all">
                          {t.stock_add}
                       </button>
                    </div>
                 </div>

                 {/* Category Filter for Stock Screen */}
                 <div className="flex flex-wrap gap-2 mb-4 bg-white p-2 rounded-2xl border">
                    {productCategories.map(cat => (
                      <button 
                        key={cat} 
                        onClick={() => setStockCategoryFilter(cat)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${stockCategoryFilter === cat ? 'bg-sky-600 text-white shadow-lg shadow-sky-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {cat === 'All' ? 'รวมทุก SKUs' : cat}
                      </button>
                    ))}
                 </div>

                 <div className="bg-white rounded-[1.2rem] md:rounded-[2.5rem] border shadow-sm overflow-hidden">
                   <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[650px]">
                       <thead className="bg-slate-50 border-b text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-6 py-4">Item (Sorted by SKU)</th><th className="px-4 py-4">Category</th><th className="px-4 py-4 text-right">Cost</th><th className="px-4 py-4 text-right">Price</th><th className="px-4 py-4 text-center">Stock</th><th className="px-4 py-4 text-center">Edit</th></tr>
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
            
            {/* OTHER MODES */}
            {mode === AppMode.PROMOTIONS && <PromotionView promotions={promotions} products={products} setEditingPromo={setEditingPromo} setPromoSkusInput={setPromoSkusInput} setIsPromoModalOpen={setIsPromoModalOpen} formatMoney={formatMoney} deleteDoc={deleteDoc} db={db} />}
            {mode === AppMode.REPORTS && <ReportsView reportStats={reportStats} formatMoney={formatMoney} exportRawData={exportRawData} />}
            {mode === AppMode.AI && <AIView messages={messages} chatInput={chatInput} setChatInput={setChatInput} handleSendMessage={handleSendMessage} isTyping={isTyping} chatEndRef={chatEndRef} />}
            {mode === AppMode.SETTINGS && <SettingsView storeProfile={storeProfile} setStoreProfile={setStoreProfile} handleImageUpload={handleImageUpload} handleFullBackup={handleFullBackup} t={t} />}
          </div>
        </div>
      </main>

      {/* --- PRINT AREA (ONLY VISIBLE ON PRINT) --- */}
      <div className="print-area hidden">
        {printType === 'stock' && (
          <div className="p-8 bg-white min-h-screen text-black">
            <div className="text-center mb-10 border-b border-black pb-4">
              <h1 className="text-2xl font-black">{storeProfile.name}</h1>
              <h2 className="text-lg font-bold">ใบตรวจสอบสต็อกสินค้า (แบ่งกลุ่มและเรียงตาม SKU)</h2>
              <p className="text-[10px] mt-2 font-bold">พิมพ์เมื่อ: {new Date().toLocaleString('th-TH')}</p>
            </div>
            
            {groupedProductsForPrint.map((group) => (
              <div key={group.name} className="mb-10 break-inside-avoid">
                <h3 className="text-sm font-black mb-2 bg-slate-100 p-1 border border-black uppercase tracking-widest">{group.name}</h3>
                <table className="w-full border-collapse border border-black">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="p-2 text-[10px] font-black border border-black text-left w-32">รหัสสินค้า (SKU)</th>
                      <th className="p-2 text-[10px] font-black border border-black text-left">ชื่อสินค้า</th>
                      <th className="p-2 text-[10px] font-black border border-black text-center w-24">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((p) => (
                      <tr key={p.id}>
                        <td className="p-2 text-[10px] font-bold border border-black">{p.code}</td>
                        <td className="p-2 text-[10px] border border-black">{p.name}</td>
                        <td className="p-2 text-[10px] text-center font-black border border-black">{p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="mt-20 grid grid-cols-2 gap-20">
               <div className="text-center space-y-12">
                  <div className="border-b border-black w-full"></div>
                  <p className="text-[10px] font-bold">ผู้นับสต็อก</p>
               </div>
               <div className="text-center space-y-12">
                  <div className="border-b border-black w-full"></div>
                  <p className="text-[10px] font-bold">เจ้าของร้าน/พยาน</p>
               </div>
            </div>
          </div>
        )}

        {printType === 'bill' && activePrintBill && (
          <div className="p-10 bg-white min-h-screen">
            <div className="flex justify-between items-start border-b-2 border-black pb-6 mb-6">
               <div>
                  <h1 className="text-2xl font-black uppercase">{storeProfile.name}</h1>
                  <p className="text-[10px] font-bold">{storeProfile.address}</p>
                  <p className="text-[10px] font-bold">โทร: {storeProfile.phone}</p>
               </div>
               <div className="text-right">
                  <h2 className="text-2xl font-black uppercase">บิลขายสินค้า</h2>
                  <p className="text-[10px] font-black">เลขที่: #{activePrintBill.id.slice(0,10).toUpperCase()}</p>
                  <p className="text-[10px] font-bold">วันที่: {activePrintBill.date}</p>
               </div>
            </div>

            <div className="mb-6">
              <p className="text-[10px] font-black">ข้อมูลลูกค้า:</p>
              <p className="text-xs font-bold">{activePrintBill.customerName || 'ลูกค้าทั่วไป'}</p>
              <p className="text-[10px] font-bold">{activePrintBill.customerPhone}</p>
              <p className="text-[10px] italic">{activePrintBill.customerAddress}</p>
            </div>

            <table className="w-full border-collapse border border-black mb-6">
               <thead>
                  <tr className="bg-slate-50">
                     <th className="p-2 text-left text-[10px] font-black border border-black">รายการ</th>
                     <th className="p-2 text-center text-[10px] font-black w-20 border border-black">จำนวน</th>
                     <th className="p-2 text-right text-[10px] font-black w-28 border border-black">ราคา</th>
                     <th className="p-2 text-right text-[10px] font-black w-32 border border-black">รวม</th>
                  </tr>
               </thead>
               <tbody>
                  {activePrintBill.items.map((item, i) => (
                    <tr key={i}>
                       <td className="p-2 text-[10px] border border-black">{item.name}</td>
                       <td className="p-2 text-[10px] text-center border border-black">{item.quantity}</td>
                       <td className="p-2 text-[10px] text-right border border-black">{formatMoney(item.price)}</td>
                       <td className="p-2 text-[10px] text-right font-black border border-black">{formatMoney(item.price * item.quantity)}</td>
                    </tr>
                  ))}
               </tbody>
            </table>

            <div className="flex justify-end mb-10">
               <div className="w-64 space-y-1">
                  <div className="flex justify-between text-xs font-bold"><span>รวมเงิน</span><span>{formatMoney(activePrintBill.subtotal)}</span></div>
                  <div className="flex justify-between text-xs text-rose-500 font-black"><span>ส่วนลด</span><span>-{formatMoney(activePrintBill.discount)}</span></div>
                  <div className="flex justify-between border-t border-black pt-2">
                    <span className="text-sm font-black">ยอดเงินสุทธิ</span>
                    <span className="text-lg font-black">{formatMoney(activePrintBill.total)}</span>
                  </div>
               </div>
            </div>

            <div className="mt-20 grid grid-cols-2 gap-20">
               <div className="text-center space-y-12">
                  <div className="border-b border-black w-full"></div>
                  <p className="text-[10px] font-black">ผู้รับของ</p>
               </div>
               <div className="text-center space-y-12">
                  <div className="border-b border-black w-full"></div>
                  <p className="text-[10px] font-black">ผู้ออกบิล</p>
               </div>
            </div>
          </div>
        )}
      </div>

      <BillModal isOpen={isBillModalOpen} setIsOpen={setIsBillModalOpen} newBillTab={newBillTab} setNewBillTab={setNewBillTab} billItems={billItems} setBillItems={setBillItems} products={products} addToCart={addToCart} updateCartQuantity={updateCartQuantity} customerName={customerName} setCustomerName={setCustomerName} customerPhone={customerPhone} setCustomerPhone={setCustomerPhone} customerAddress={customerAddress} setCustomerAddress={setCustomerAddress} shippingCarrier={shippingCarrier} setShippingCarrier={setShippingCarrier} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} handleCheckout={handleCheckout} formatMoney={formatMoney} cartTotal={cartTotal} t={t} skuSearch={skuSearch} setSkuSearch={setSkuSearch} isEditing={!!editingBill} />
      {isProductModalOpen && <ProductModal editingProduct={editingProduct} setIsProductModalOpen={setIsProductModalOpen} handleImageUpload={handleImageUpload} db={db} setEditingProduct={setEditingProduct} />}
      {isPromoModalOpen && <PromoModal editingPromo={editingPromo} setIsPromoModalOpen={setIsPromoModalOpen} products={products} promoSkusInput={promoSkusInput} setPromoSkusInput={setPromoSkusInput} db={db} t={t} />}
    </div>
  );
};

// ... HELPER COMPONENTS ...

const ReportsView = ({ reportStats, formatMoney, exportRawData }: any) => {
  const maxMonthly = Math.max(...Object.values(reportStats.monthlyData as Record<string, number>), 100000);
  
  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Sales Chart (Left Box) */}
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
                  <div className="w-full h-full flex items-center justify-center text-slate-300 font-bold italic">ยังไม่มีข้อมูลการขายสำหรับกราฟ</div>
                ) : (
                  Object.entries(reportStats.monthlyData as Record<string, number>).map(([month, value]) => (
                    <div key={month} className="flex flex-col items-center flex-1 max-w-[60px] group">
                        <div 
                          className="w-full bg-sky-500 rounded-t-xl transition-all duration-700 hover:bg-sky-600 relative cursor-help"
                          style={{ height: `${(value / maxMonthly) * 200}px` }}
                        >
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg">
                            {formatMoney(value)}
                          </div>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 mt-4 rotate-45 origin-left">{month}</span>
                    </div>
                  ))
                )}
              </div>
          </Card>

          {/* Quick Stats Column */}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Selling Products */}
          <Card className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
               <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Package size={18}/></div>
               <h3 className="text-lg font-black text-slate-800">สินค้าขายดี (Top 10)</h3>
            </div>
            <div className="space-y-3">
               {reportStats.topProducts.map((p, i) => (
                 <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-transparent hover:border-slate-200 transition-all">
                    <div className="flex items-center gap-3">
                       <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black ${i < 3 ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span>
                       <span className="text-sm font-bold text-slate-700">{p.name}</span>
                    </div>
                    <div className="text-right">
                       <div className="text-xs font-black text-sky-600">{p.qty} ชิ้น</div>
                       <div className="text-[9px] font-bold text-slate-400">{formatMoney(p.revenue)}</div>
                    </div>
                 </div>
               ))}
               {reportStats.topProducts.length === 0 && <p className="text-center text-slate-300 py-10 font-bold italic">ไม่มีข้อมูลการขาย</p>}
            </div>
          </Card>

          {/* Top Customers */}
          <Card className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
               <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Users size={18}/></div>
               <h3 className="text-lg font-black text-slate-800">ลูกค้าชั้นดี (Top 10)</h3>
            </div>
            <div className="space-y-3">
               {reportStats.topCustomers.map((c, i) => (
                 <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-transparent hover:border-slate-200 transition-all">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-black text-xs uppercase">{c.name.charAt(0)}</div>
                       <div>
                          <div className="text-sm font-bold text-slate-700 truncate max-w-[150px]">{c.name}</div>
                          <div className="text-[9px] font-bold text-slate-400">{c.bills} บิลที่ชำระแล้ว</div>
                       </div>
                    </div>
                    <div className="text-right text-sm font-black text-emerald-600">{formatMoney(c.total)}</div>
                 </div>
               ))}
               {reportStats.topCustomers.length === 0 && <p className="text-center text-slate-300 py-10 font-bold italic">ไม่มีข้อมูลลูกค้า</p>}
            </div>
          </Card>
        </div>

        <button onClick={exportRawData} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-sm md:text-base flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 active:scale-[0.98] mt-10">
           <FileDown size={20}/> Download Full Sales Report (CSV)
        </button>
    </div>
  );
};

const PromotionView = ({ promotions, products, setEditingPromo, setPromoSkusInput, setIsPromoModalOpen, formatMoney, deleteDoc, db }: any) => (
  <div className="space-y-4 animate-in slide-in-from-bottom-5">
      <div className="flex flex-row justify-between items-center">
        <h2 className="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2"><Tag className="text-sky-500" size={20}/> โปรโมชั่น</h2>
        <button onClick={()=>{setEditingPromo(null); setPromoSkusInput(''); setIsPromoModalOpen(true);}} className="bg-sky-600 text-white px-4 md:px-8 py-2 md:py-4 rounded-xl font-black text-xs md:text-base shadow-lg hover:bg-sky-700 active:scale-95 transition-all">เพิ่มโปรโมชั่น</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {promotions.map((promo: any) => (
          <Card key={promo.id} className="relative group p-4 md:p-6">
            <div className="flex justify-between items-start mb-4">
                <h4 className="font-black text-slate-800 text-base md:text-lg">{promo.name}</h4>
                <div className="flex gap-2">
                  <button onClick={()=>{ setEditingPromo(promo); setPromoSkusInput(products.filter((p:any) => promo.targetProductIds.includes(p.id)).map((p:any) => p.code).join(', ')); setIsPromoModalOpen(true); }} className="p-2 text-slate-300 hover:text-sky-600 transition-colors"><Edit size={16}/></button>
                  <button onClick={async ()=>{ if(confirm('ลบ?')) await deleteDoc(doc(db, 'promotions', promo.id)); }} className="p-2 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16}/></button>
                </div>
            </div>
            <div className="space-y-2">
                {promo.tiers.map((tier: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs font-bold bg-slate-50 p-2 rounded-lg border border-slate-100"><span>{tier.minQty}+ ชิ้น</span><span className="text-sky-600">{formatMoney(tier.unitPrice)}</span></div>
                ))}
            </div>
          </Card>
        ))}
      </div>
  </div>
);

const AIView = ({ messages, chatInput, setChatInput, handleSendMessage, isTyping, chatEndRef }: any) => (
  <div className="flex flex-col h-[calc(100vh-140px)] animate-in fade-in">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((m: any) => <ChatMessage key={m.id} message={m} />)}
        <div ref={chatEndRef} />
      </div>
      <div className="p-4 bg-white border-t rounded-b-[2rem]">
        <div className="relative max-w-4xl mx-auto flex gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="พิมพ์คำถามที่นี่..." className="flex-1 p-3 md:p-4 bg-slate-100 rounded-xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-sky-500 transition-all text-sm" />
            <button onClick={handleSendMessage} disabled={!chatInput.trim() || isTyping} className="p-3 md:p-4 bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 transition-all shadow-lg active:scale-95"><Send size={20}/></button>
        </div>
      </div>
  </div>
);

const SettingsView = ({ storeProfile, setStoreProfile, handleImageUpload, handleFullBackup, t }: any) => (
  <div className="space-y-6 animate-in fade-in max-w-2xl mx-auto">
      <h2 className="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2"><Settings className="text-sky-500" size={24}/> {t.menu_settings}</h2>
      <Card className="space-y-6 shadow-lg border-sky-50">
        <div className="flex justify-center mb-6">
            <div className="relative group">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl md:rounded-[2.5rem] bg-slate-50 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center border-dashed border-slate-200">
                  {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <ImageIcon size={32} className="text-slate-300"/>}
              </div>
              <label className="absolute bottom-0 right-0 p-2 md:p-3 bg-sky-600 text-white rounded-xl shadow-lg cursor-pointer hover:bg-sky-700 active:scale-90 transition-all">
                  <Upload size={16}/><input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, (url:string) => setStoreProfile({...storeProfile, logoUrl: url}))} />
              </label>
            </div>
        </div>
        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">ชื่อร้านค้า / Shop Name</label><input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-3 md:p-4 bg-slate-50 border rounded-xl font-bold outline-none text-sm focus:border-sky-500 focus:bg-white transition-colors" /></div>
        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">เบอร์โทรศัพท์ร้าน / Phone</label><input value={storeProfile.phone} onChange={e=>setStoreProfile({...storeProfile, phone: e.target.value})} className="w-full p-3 md:p-4 bg-slate-50 border rounded-xl font-bold outline-none text-sm focus:border-sky-500 focus:bg-white transition-colors" /></div>
        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">ที่อยู่ร้าน / Address</label><textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-3 md:p-4 bg-slate-50 border rounded-xl font-bold outline-none text-sm h-24 focus:border-sky-500 focus:bg-white transition-colors" /></div>
        <button onClick={()=>{ alert('บันทึกข้อมูลสำเร็จ!'); window.location.reload(); }} className="w-full py-4 bg-sky-600 text-white rounded-xl font-black shadow-lg hover:bg-sky-700 transition-all flex items-center justify-center gap-2 active:scale-95"><Save size={18}/> {t.save}</button>
      </Card>

      <div className="mt-8">
        <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Database className="text-sky-500" size={20}/> {t.data_management}</h3>
        <Card className="border-rose-50 shadow-sm space-y-4">
          <p className="text-xs text-slate-500 font-bold mb-4 italic">* {t.backup_reminder}</p>
          <button onClick={handleFullBackup} className="w-full py-4 bg-emerald-50 text-emerald-600 rounded-xl font-black border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center justify-center gap-3">
            <Download size={18}/> {t.backup_all}
          </button>
        </Card>
      </div>
  </div>
);

const BillModal = ({ isOpen, setNewBillTab, newBillTab, billItems, setBillItems, products, addToCart, updateCartQuantity, customerName, setCustomerName, customerPhone, setCustomerPhone, customerAddress, setCustomerAddress, shippingCarrier, setShippingCarrier, paymentMethod, setPaymentMethod, handleCheckout, formatMoney, cartTotal, t, skuSearch, setSkuSearch, setIsOpen, isEditing }: any) => {
  const [qtyToFill, setQtyToFill] = useState(1);
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center backdrop-blur-xl animate-in zoom-in-95">
      <div className="bg-white w-full h-full md:max-w-[95vw] md:h-[90vh] md:rounded-[3rem] shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
          <div className="flex items-center border-b md:hidden bg-white z-20">
            <button onClick={()=>setNewBillTab('items')} className={`flex-1 py-4 text-xs font-black border-b-2 ${newBillTab === 'items' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-400'}`}>1. เลือกสินค้า</button>
            <button onClick={()=>setNewBillTab('checkout')} className={`flex-1 py-4 text-xs font-black border-b-2 ${newBillTab === 'checkout' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-400'}`}>2. ข้อมูลบิล ({billItems.length})</button>
            <button onClick={()=>setIsOpen(false)} className="px-4 text-slate-400"><X size={20}/></button>
          </div>
          <div className={`flex-1 flex flex-col p-4 md:p-8 overflow-hidden bg-white ${newBillTab === 'items' ? 'flex' : 'hidden md:flex'}`}>
            <div className="hidden md:flex justify-between items-center mb-6"><h3 className="text-2xl font-black text-slate-800">{isEditing ? 'ปรับปรุงรายการสินค้า' : 'เลือกสินค้า'}</h3></div>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/>
                    <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="w-full p-4 pl-12 bg-slate-50 border rounded-xl font-bold outline-none" />
                </div>
                <div className="w-full sm:w-48 bg-slate-50 border rounded-xl flex items-center p-1">
                    <span className="px-3 text-[10px] font-black text-slate-400 uppercase leading-none">ระบุจำนวน</span>
                    <input 
                      type="number" 
                      min="1" 
                      value={qtyToFill} 
                      onChange={e => setQtyToFill(Math.max(1, parseInt(e.target.value) || 1))} 
                      className="flex-1 bg-transparent p-3 font-black text-sky-600 outline-none text-right"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto flex-1 custom-scrollbar pb-32 md:pb-0">
                {products.filter((p:any) => !skuSearch || p.name.includes(skuSearch) || p.code.includes(skuSearch)).map((p:any) => (
                  <button key={p.id} onClick={()=>addToCart(p, qtyToFill)} className="bg-white p-4 rounded-[2rem] border shadow-sm hover:border-sky-600 transition-all text-left group active:scale-95">
                      <div className="w-full aspect-square rounded-[1.5rem] bg-slate-50 mb-2 overflow-hidden border relative">
                        {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${p.color} flex items-center justify-center text-4xl font-black text-white`}>{p.name.charAt(0)}</div>}
                        <div className="absolute top-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-lg font-black">สต็อก: {p.stock}</div>
                      </div>
                      <h4 className="font-black text-slate-800 text-xs truncate">{p.name}</h4>
                      <p className="text-sky-600 font-black text-sm">{formatMoney(p.price)}</p>
                  </button>
                ))}
            </div>
          </div>
          <div className={`w-full md:w-[40%] bg-slate-50 border-l flex flex-col h-full p-4 md:p-8 overflow-hidden ${newBillTab === 'checkout' ? 'flex' : 'hidden md:flex'}`}>
            <div className="hidden md:flex justify-between items-center mb-6"><h3 className="text-2xl font-black text-slate-800">{isEditing ? 'แก้ไขข้อมูลบิล' : 'ตะกร้าสินค้า'}</h3><button onClick={()=>setIsOpen(false)} className="p-2 bg-white border rounded-full"><X size={20}/></button></div>
            <div className="space-y-3 mb-4 overflow-y-auto max-h-[30%] md:max-h-none pr-1">
                <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="ชื่อลูกค้า" className="w-full p-3 bg-white border rounded-xl font-bold text-xs outline-none" />
                <input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="เบอร์โทรศัพท์" className="w-full p-3 bg-white border rounded-xl font-bold text-xs outline-none" />
                <textarea value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} placeholder="ที่อยู่จัดส่ง" className="w-full p-3 bg-white border rounded-xl font-bold h-20 text-xs resize-none outline-none" />
                <div className="grid grid-cols-2 gap-2">
                    <select value={shippingCarrier} onChange={e=>setShippingCarrier(e.target.value as any)} className="w-full p-3 bg-white border rounded-xl font-bold text-[10px] outline-none"><option value="None">รับเองหน้าร้าน</option><option value="Anuchit">Anuchit</option><option value="Meexai">Meexai</option><option value="Rungarun">Rungarun</option></select>
                    <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)} className="w-full p-3 bg-white border rounded-xl font-bold text-[10px] outline-none"><option value="Transfer">โอนเงิน</option><option value="COD">เก็บเงินปลายทาง</option></select>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 mt-4">
                {billItems.map((it:any) => (
                  <div key={it.id} className="flex items-center gap-3 p-2 bg-white rounded-xl border">
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">{it.imageUrl ? <img src={it.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${it.color} text-white flex items-center justify-center text-[10px] font-black`}>{it.name.charAt(0)}</div>}</div>
                      <div className="flex-1 min-w-0"><div className="text-[10px] font-black truncate">{it.name}</div><div className="text-[9px] font-bold text-sky-600">{formatMoney(it.price)}</div></div>
                      
                      <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg">
                        <button onClick={()=>updateCartQuantity(it.id, it.quantity - 1)} className="p-1 text-slate-400 hover:text-sky-600 transition-colors"><Minus size={14}/></button>
                        <input 
                          type="number" 
                          min="1"
                          value={it.quantity}
                          onChange={(e) => updateCartQuantity(it.id, parseInt(e.target.value))}
                          className="w-12 text-center text-xs font-black bg-transparent outline-none focus:text-sky-600"
                        />
                        <button onClick={()=>updateCartQuantity(it.id, it.quantity + 1)} className="p-1 text-slate-400 hover:text-sky-600 transition-colors"><Plus size={14}/></button>
                      </div>

                      <button onClick={()=>setBillItems((p:any)=>p.filter((x:any)=>x.id!==it.id))} className="p-1.5 text-rose-300 hover:text-rose-600"><Trash2 size={16}/></button>
                  </div>
                ))}
            </div>
            <div className="mt-auto bg-white p-4 md:p-6 rounded-[2rem] border-t shadow-sm">
                <div className="flex justify-between items-center mb-4"><div><span className="text-[10px] font-black text-slate-400 uppercase">ยอดรวมสุทธิ</span><p className="text-xl md:text-3xl font-black text-sky-600">{formatMoney(cartTotal)}</p></div></div>
                <button disabled={billItems.length === 0} onClick={handleCheckout} className="w-full py-4 md:py-5 bg-sky-600 disabled:bg-slate-200 text-white rounded-2xl font-black text-base md:text-xl shadow-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98]"><CheckCircle2 size={24}/> {isEditing ? 'บันทึกการแก้ไข' : 'ยืนยันการสั่งซื้อ'}</button>
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
          <input name="name" required defaultValue={editingPromo?.name} placeholder="ชื่อโปรโมชั่น" className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none" />
          <textarea value={promoSkusInput} onChange={e=>setPromoSkusInput(e.target.value)} placeholder={t.promo_sku_placeholder} className="w-full p-3 bg-slate-50 border rounded-xl font-bold h-24 text-xs outline-none resize-none" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({length: 6}).map((_, i) => (
              <div key={i} className="flex gap-2 items-center bg-slate-50 p-2 rounded-xl border">
                <input name={`qty_${i+1}`} type="number" placeholder="ชิ้น" defaultValue={editingPromo?.tiers?.[i]?.minQty} className="w-12 p-2 bg-white border rounded-lg font-bold text-center text-xs outline-none" />
                <ArrowRight size={12} className="text-slate-300"/><input name={`price_${i+1}`} type="number" placeholder="ราคา" defaultValue={editingPromo?.tiers?.[i]?.unitPrice} className="flex-1 p-2 bg-white border rounded-lg font-black text-sky-600 text-center text-xs outline-none" />
              </div>
            ))}
          </div>
          <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-xl font-black shadow-xl mt-4">บันทึกโปรโมชั่น</button>
        </form>
    </Card>
  </div>
);

export default App;
