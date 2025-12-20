
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Minus, Trash2, Edit, LayoutDashboard, Settings, 
  Package, ClipboardList, BarChart3, Tag, X, Search,
  ShoppingCart, Coffee, TrendingUp, CheckCircle2, Save, Send, Bot, 
  User, Download, Upload, AlertCircle, FileText, Smartphone, Truck, CreditCard, Building2, MapPin, Image as ImageIcon, FileUp, FileDown, ShieldAlert, Wifi, WifiOff, DollarSign, PieChart, ArrowRight, BarChart2, Users, ChevronRight, List, Phone, Printer
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

  // AI State
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // AI Helpers
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (mode === AppMode.AI) scrollToBottom();
  }, [messages, mode]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isTyping) return;

    const userMsg: Message = {
      id: uuidv4(),
      role: Role.USER,
      text: chatInput,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    const modelMsgId = uuidv4();
    const initialModelMsg: Message = {
      id: modelMsgId,
      role: Role.MODEL,
      text: '...',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, initialModelMsg]);

    try {
      const history = messages.map(m => ({
        role: m.role === Role.USER ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const stream = await streamResponse(chatInput, AppMode.AI, history);
      
      if (stream) {
        let fullText = '';
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) {
            fullText = fullText === '...' ? text : fullText + text;
            setMessages(prev => prev.map(m => 
              m.id === modelMsgId ? { ...m, text: fullText } : m
            ));
          }
        }
      }
    } catch (error) {
      setMessages(prev => prev.map(m => 
        m.id === modelMsgId ? { ...m, text: "ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อ", isError: true } : m
      ));
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
    const safeQty = Math.max(1, qty);
    setBillItems(prev => prev.map(it => {
      if (it.id === id) {
        const nPrice = getProductPrice(it, safeQty);
        return { ...it, quantity: safeQty, price: nPrice };
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
    if (billItems.length === 0) {
        alert("กรุณาเลือกสินค้าก่อนเช็คบิล");
        return;
    }
    const total = billItems.reduce((s, i) => s + (Number(i.price || 0) * i.quantity), 0);
    const order: SaleRecord = {
      id: uuidv4(), items: [...billItems], subtotal: total, discount: 0, total, 
      date: new Date().toLocaleString(), timestamp: Date.now(), 
      status: paymentStatus, paymentMethod, 
      customerName, customerPhone, customerAddress, 
      shippingCarrier, shippingBranch
    };
    
    try {
      if (!db) throw new Error("Database not connected");
      await setDoc(doc(db, 'sales', order.id), order);
      for (const item of billItems) {
        const p = products.find(x => x.id === item.id);
        if (p) await setDoc(doc(db, 'products', p.id), { ...p, stock: Math.max(0, (Number(p.stock) || 0) - item.quantity) });
      }
      setIsBillModalOpen(false); setBillItems([]); 
      setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setShippingBranch('');
      alert("เช็คบิลสำเร็จ!");
    } catch (err: any) { alert("Error: " + err.message); }
  };

  const exportRawData = () => {
    const headers = ["OrderID", "Date", "Customer", "Phone", "Address", "Payment", "Status", "Item", "Qty", "Cost/Unit", "Price/Unit", "ItemTotal", "BillTotal"];
    const rows = recentSales.flatMap(s => 
      s.items.map(i => {
        const p = products.find(x => x.id === i.id);
        const costPerUnit = Number(p?.cost || 0);
        const pricePerUnit = Number(i.price || 0);
        const itemTotal = pricePerUnit * i.quantity;
        return [
          s.id, s.date, (s.customerName || "-").replace(/,/g, ''), s.customerPhone || "-", `"${(s.customerAddress || "-").replace(/"/g, '""')}"`,
          s.paymentMethod, s.status, i.name.replace(/,/g, ''), i.quantity, costPerUnit, pricePerUnit, itemTotal, s.total
        ]
      })
    );
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

  // --- BULK SKU UPLOAD/DOWNLOAD ---
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
      // Skip headers
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 5) continue;

        const [code, name, price, cost, stock, category] = cols;
        if (!code || !name) continue;

        const existing = products.find(p => p.code === code);
        const productData: Product = {
          id: existing?.id || uuidv4(),
          code,
          name,
          price: Number(price) || 0,
          cost: Number(cost) || 0,
          stock: Number(stock) || 0,
          category: category || "General",
          color: existing?.color || "bg-sky-500", 
          imageUrl: existing?.imageUrl || ""
        };
        results.push(productData);
      }

      if (results.length > 0) {
        if (confirm(`พบสินค้า ${results.length} รายการ ต้องการนำเข้าข้อมูลใช่หรือไม่?`)) {
          try {
            for (const p of results) {
              await setDoc(doc(db, 'products', p.id), p);
            }
            alert(`นำเข้าสินค้า ${results.length} รายการสำเร็จ!`);
          } catch (err: any) {
            alert("Error: " + err.message);
          }
        }
      } else {
        alert("ไม่พบข้อมูลที่ถูกต้องในไฟล์");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  // --- PRINT STOCK REPORT ---
  const printStockReport = () => {
    window.print();
  };

  // --- REPORT CALCULATIONS ---
  const reportStats = useMemo(() => {
    const validSales = recentSales.filter(s => s.status !== 'Cancelled');
    const totalRevenue = validSales.reduce((a, b) => a + Number(b.total || 0), 0);
    const stockValue = products.reduce((a, b) => {
       const cost = Number(b.cost);
       const stock = Number(b.stock);
       return a + (isNaN(cost) || isNaN(stock) ? 0 : cost * stock);
    }, 0);
    const totalCost = validSales.reduce((acc, sale) => {
      return acc + sale.items.reduce((itemAcc, item) => {
        const original = products.find(p => p.id === item.id);
        const cost = Number(original?.cost || 0);
        return itemAcc + (cost * item.quantity);
      }, 0);
    }, 0);

    const monthlyData: Record<string, number> = {};
    validSales.forEach(s => {
      const parts = s.date.split('/');
      if (parts.length >= 3) {
        const monthStr = parts[0] + '/' + parts[2].split(' ')[0];
        monthlyData[monthStr] = (monthlyData[monthStr] || 0) + Number(s.total);
      }
    });
    
    const productCounts: Record<string, {name: string, qty: number}> = {};
    validSales.forEach(s => s.items.forEach(i => {
      if (!productCounts[i.id]) productCounts[i.id] = {name: i.name, qty: 0};
      productCounts[i.id].qty += i.quantity;
    }));
    const topProducts = Object.values(productCounts).sort((a,b) => b.qty - a.qty).slice(0, 10);

    const customerCounts: Record<string, {name: string, total: number}> = {};
    validSales.forEach(s => {
      const cName = s.customerName || "Anonymous";
      if (!customerCounts[cName]) customerCounts[cName] = {name: cName, total: 0};
      customerCounts[cName].total += Number(s.total);
    });
    const topCustomers = Object.values(customerCounts).sort((a,b) => b.total - a.total).slice(0, 10);

    return { totalRevenue, totalCost, profit: totalRevenue - totalCost, stockValue, topProducts, topCustomers, monthlyData };
  }, [recentSales, products]);

  const cartTotal = billItems.reduce((s,i)=>s+(Number(i.price || 0)*i.quantity),0);

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={()=>{}} language={language} setLanguage={setLanguage} 
      />

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
                <div className="flex items-center gap-1 justify-end">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                   <p className="text-[8px] text-emerald-600 font-bold uppercase tracking-widest">Active</p>
                </div>
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
                    <button onClick={() => { setNewBillTab('items'); setIsBillModalOpen(true); }} className="bg-sky-600 text-white px-4 md:px-8 py-2 md:py-4 rounded-xl font-black hover:bg-sky-700 shadow-lg flex items-center gap-2 text-xs md:text-base">
                       <Plus size={16}/> {t.order_create_bill}
                    </button>
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
                                 <div className="text-slate-800 truncate max-w-[150px]">#{s.id.slice(0,8)} | {s.customerName || '-'}</div>
                                 <div className="text-[9px] text-slate-300 font-medium">{s.date}</div>
                               </td>
                               <td className="px-4 py-4 text-center"><span className="px-2 py-0.5 bg-slate-100 rounded text-[8px] uppercase font-black">{s.paymentMethod}</span></td>
                               <td className="px-4 py-4 text-right text-sky-600 font-black whitespace-nowrap">{formatMoney(s.total)}</td>
                               <td className="px-4 py-4 text-center whitespace-nowrap">
                                 <span className={`px-2 py-0.5 rounded-lg text-[8px] md:text-[10px] uppercase font-black ${s.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : s.status === 'Cancelled' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>{s.status}</span>
                               </td>
                               <td className="px-4 py-4 text-center">
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
                       <button onClick={printStockReport} className="flex-1 md:flex-none px-4 py-2 md:py-3 bg-white border border-slate-200 rounded-xl font-bold text-sky-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-xs md:text-sm shadow-sm">
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
                 <div className="bg-white rounded-[1.2rem] md:rounded-[2.5rem] border shadow-sm overflow-hidden">
                   <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[650px]">
                       <thead className="bg-slate-50 border-b text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-6 py-4">Item</th><th className="px-4 py-4 text-right">Cost</th><th className="px-4 py-4 text-right">Price</th><th className="px-4 py-4 text-center">Stock</th><th className="px-4 py-4 text-center">Edit</th></tr>
                       </thead>
                       <tbody className="divide-y text-xs md:text-sm font-bold">
                          {products.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-6 py-4 flex items-center gap-3">
                                  <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-slate-100 border overflow-hidden flex-shrink-0 flex items-center justify-center font-black">
                                    {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${p.color} text-white flex items-center justify-center`}>{p.name.charAt(0)}</div>}
                                  </div>
                                  <div className="truncate"><div className="text-slate-800 truncate max-w-[120px]">{p.name}</div><div className="text-[9px] text-slate-300">SKU: {p.code}</div></div>
                               </td>
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

            {mode === AppMode.PROMOTIONS && (
              <div className="space-y-4 animate-in slide-in-from-bottom-5">
                 <div className="flex flex-row justify-between items-center">
                    <h2 className="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2"><Tag className="text-sky-500" size={20}/> {t.menu_promotions}</h2>
                    <button onClick={()=>{setEditingPromo(null); setPromoSkusInput(''); setIsPromoModalOpen(true);}} className="bg-sky-600 text-white px-4 md:px-8 py-2 md:py-4 rounded-xl font-black text-xs md:text-base shadow-lg hover:bg-sky-700 active:scale-95 transition-all">
                       เพิ่มโปรโมชั่น
                    </button>
                 </div>
                 {promotions.length === 0 ? (
                    <div className="bg-white rounded-[2.5rem] p-20 flex flex-col items-center justify-center text-center opacity-40 border-2 border-dashed border-slate-200">
                       <Tag size={64} className="mb-4" />
                       <h3 className="text-xl font-black">ยังไม่มีโปรโมชั่น</h3>
                       <p className="font-bold">กดปุ่ม "เพิ่มโปรโมชั่น" เพื่อสร้างโปรโมชั่นแรกของคุณ</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {promotions.map(promo => (
                        <Card key={promo.id} className="relative group p-4 md:p-6">
                          <div className="flex justify-between items-start mb-4">
                             <h4 className="font-black text-slate-800 text-base md:text-lg">{promo.name}</h4>
                             <div className="flex gap-2">
                               <button onClick={()=>{
                                 setEditingPromo(promo);
                                 const skus = products.filter(p => promo.targetProductIds.includes(p.id)).map(p => p.code).join(', ');
                                 setPromoSkusInput(skus);
                                 setIsPromoModalOpen(true);
                               }} className="p-2 text-slate-300 hover:text-sky-600 transition-colors"><Edit size={16}/></button>
                               <button onClick={async ()=>{ if(confirm('ลบโปรโมชั่นนี้?')) await deleteDoc(doc(db, 'promotions', promo.id)); }} className="p-2 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16}/></button>
                             </div>
                          </div>
                          <div className="space-y-2">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pricing Tiers</p>
                             {promo.tiers.sort((a,b)=>a.minQty-b.minQty).map((tier, i) => (
                               <div key={i} className="flex justify-between text-xs font-bold bg-slate-50 p-2 rounded-lg border border-slate-100">
                                  <span>{tier.minQty}+ ชิ้น</span>
                                  <span className="text-sky-600">{formatMoney(tier.unitPrice)}</span>
                               </div>
                             ))}
                          </div>
                          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                             <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${promo.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                               {promo.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                             </span>
                             <p className="text-[10px] text-slate-400 font-bold">{promo.targetProductIds.length} สินค้า</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                 )}
              </div>
            )}

            {mode === AppMode.REPORTS && (
              <div className="space-y-4 md:space-y-8 animate-in fade-in">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                    <Card className="bg-sky-600 border-sky-500 p-4 md:p-8 flex flex-col justify-between shadow-xl text-white">
                       <div className="flex justify-between items-start mb-2">
                          <p className="text-[10px] md:text-xs font-black text-sky-100 uppercase tracking-widest">TOTAL REVENUE</p>
                          <TrendingUp size={24} className="text-sky-200" />
                       </div>
                       <h3 className="text-xl md:text-4xl font-black break-all">{formatMoney(reportStats.totalRevenue)}</h3>
                    </Card>

                    <Card className="bg-white border-slate-200 p-4 md:p-8 flex flex-col justify-between shadow-sm">
                       <div className="flex justify-between items-start mb-2">
                          <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">ESTIMATE PROFIT</p>
                          <DollarSign size={20} className="text-emerald-500" />
                       </div>
                       <h3 className="text-lg md:text-3xl font-black text-emerald-600 break-all">{formatMoney(reportStats.profit)}</h3>
                    </Card>

                    <Card className="bg-white border-slate-200 p-4 md:p-8 flex flex-col justify-between shadow-sm">
                       <div className="flex justify-between items-start mb-2">
                          <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">STOCK ASSET</p>
                          <Package size={20} className="text-sky-500" />
                       </div>
                       <h3 className="text-lg md:text-3xl font-black text-slate-900 break-all">{formatMoney(reportStats.stockValue)}</h3>
                    </Card>
                 </div>

                 <Card className="overflow-hidden">
                    <h4 className="text-[10px] md:text-sm font-black text-slate-800 uppercase mb-6 flex items-center gap-2"><BarChart2 size={16} className="text-sky-500"/> Monthly Trend</h4>
                    <div className="flex items-end gap-1 md:gap-2 h-32 md:h-48 overflow-x-auto pb-4 custom-scrollbar">
                      {Object.entries(reportStats.monthlyData).map(([month, val], i) => {
                        const allValues = Object.values(reportStats.monthlyData) as number[];
                        const maxVal = Math.max(...allValues, 1);
                        const height = (val / maxVal) * 100;
                        return (
                          <div key={i} className="flex-1 min-w-[45px] md:min-w-[65px] flex flex-col items-center gap-1 group">
                             <div className="text-[6px] md:text-[8px] font-black text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">{formatMoney(val).replace('LAK','')}</div>
                             <div className="w-full bg-sky-500 rounded-t-lg transition-all duration-700 hover:bg-sky-600" style={{ height: `${Math.max(8, height)}%` }}></div>
                             <div className="text-[7px] md:text-[10px] font-black text-slate-800 whitespace-nowrap mt-1">{month}</div>
                          </div>
                        )
                      })}
                    </div>
                 </Card>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                        <h4 className="text-[10px] md:text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2"><PieChart size={16} className="text-sky-500"/> TOP SELLERS</h4>
                        <div className="space-y-3">
                          {reportStats.topProducts.map((p, idx) => (
                             <div key={idx} className="flex justify-between items-center text-[10px] md:text-sm border-b border-slate-50 pb-2 last:border-0">
                               <div className="flex items-center gap-2 truncate">
                                  <span className="w-4 h-4 md:w-6 md:h-6 bg-slate-100 rounded text-[8px] md:text-xs flex items-center justify-center font-black text-slate-400">{idx+1}</span>
                                  <span className="font-bold text-slate-700 truncate">{p.name}</span>
                               </div>
                               <span className="font-black text-sky-600 whitespace-nowrap">{p.qty} ชิ้น</span>
                             </div>
                          ))}
                        </div>
                    </Card>
                    <Card>
                        <h4 className="text-[10px] md:text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2"><Users size={16} className="text-sky-500"/> VALUABLE CUSTOMERS</h4>
                        <div className="space-y-3">
                          {reportStats.topCustomers.map((c, idx) => (
                             <div key={idx} className="flex justify-between items-center text-[10px] md:text-sm border-b border-slate-50 pb-2 last:border-0">
                               <div className="flex items-center gap-2 truncate">
                                  <span className="w-4 h-4 md:w-6 md:h-6 bg-slate-100 rounded text-[8px] md:text-xs flex items-center justify-center font-black text-slate-400">{idx+1}</span>
                                  <span className="font-bold text-slate-700 truncate">{c.name}</span>
                               </div>
                               <span className="font-black text-emerald-600 whitespace-nowrap">{formatMoney(c.total)}</span>
                             </div>
                          ))}
                        </div>
                    </Card>
                 </div>

                 <button onClick={exportRawData} className="w-full bg-emerald-600 text-white p-4 rounded-xl font-black text-xs md:text-base flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200">
                    <FileDown size={18}/> {t.report_export_raw}
                 </button>
              </div>
            )}

            {mode === AppMode.AI && (
              <div className="flex flex-col h-[calc(100vh-140px)] animate-in fade-in">
                 <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {messages.length === 0 ? (
                       <div className="flex flex-col items-center justify-center h-full opacity-20 text-center gap-4">
                          <Bot size={80} />
                          <div>
                             <h3 className="text-2xl font-black uppercase">Coffee Please AI</h3>
                             <p className="font-bold">ถามเกี่ยวกับสต็อก ยอดขาย หรือการจัดการร้านได้เลย</p>
                          </div>
                       </div>
                    ) : (
                       messages.map(m => <ChatMessage key={m.id} message={m} />)
                    )}
                    <div ref={chatEndRef} />
                 </div>
                 
                 <div className="p-4 bg-white border-t rounded-b-[2rem]">
                    <div className="relative max-w-4xl mx-auto flex gap-2">
                       <input 
                         value={chatInput}
                         onChange={e => setChatInput(e.target.value)}
                         onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                         placeholder="พิมพ์คำถามที่นี่..."
                         className="flex-1 p-3 md:p-4 bg-slate-100 rounded-xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-sky-500 transition-all text-sm"
                       />
                       <button 
                         onClick={handleSendMessage}
                         disabled={!chatInput.trim() || isTyping}
                         className="p-3 md:p-4 bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 transition-all shadow-lg active:scale-95"
                       >
                          <Send size={20}/>
                       </button>
                    </div>
                 </div>
              </div>
            )}

            {mode === AppMode.SETTINGS && (
              <div className="space-y-6 animate-in fade-in max-w-2xl mx-auto">
                 <h2 className="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2"><Settings className="text-sky-500" size={24}/> {t.menu_settings}</h2>
                 <Card className="space-y-6 shadow-lg border-sky-50">
                    <div className="flex justify-center mb-6">
                      <div className="relative group">
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl md:rounded-[2.5rem] bg-slate-50 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center border-dashed border-slate-200">
                           {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <ImageIcon size={32} className="text-slate-300"/>}
                        </div>
                        <label className="absolute bottom-0 right-0 p-2 md:p-3 bg-sky-600 text-white rounded-xl shadow-lg cursor-pointer hover:bg-sky-700 active:scale-90 transition-all">
                           <Upload size={16}/>
                           <input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, (url) => setStoreProfile({...storeProfile, logoUrl: url}))} />
                        </label>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">ชื่อร้านค้า / Shop Name</label>
                        <input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-3 md:p-4 bg-slate-50 border rounded-xl font-bold outline-none text-sm focus:border-sky-500 focus:bg-white transition-colors" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">เบอร์โทรศัพท์ร้าน / Phone</label>
                        <input value={storeProfile.phone} onChange={e=>setStoreProfile({...storeProfile, phone: e.target.value})} className="w-full p-3 md:p-4 bg-slate-50 border rounded-xl font-bold outline-none text-sm focus:border-sky-500 focus:bg-white transition-colors" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">ที่อยู่ร้าน / Address</label>
                        <textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-3 md:p-4 bg-slate-50 border rounded-xl font-bold outline-none text-sm h-24 focus:border-sky-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                       <p className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-2"><ShieldAlert size={12}/> Firebase Configuration (Advanced)</p>
                       <textarea 
                          placeholder="Firebase JSON Config"
                          value={localStorage.getItem('pos_firebase_config') || ''} 
                          onChange={e => {
                            localStorage.setItem('pos_firebase_config', e.target.value);
                          }}
                          className="w-full p-3 bg-slate-100 border rounded-xl font-mono text-[10px] h-32 outline-none focus:bg-white transition-all"
                       />
                    </div>

                    <button onClick={()=>{ alert('บันทึกข้อมูลสำเร็จ!'); window.location.reload(); }} className="w-full py-4 bg-sky-600 text-white rounded-xl font-black shadow-lg hover:bg-sky-700 transition-all flex items-center justify-center gap-2 active:scale-95">
                       <Save size={18}/> {t.save}
                    </button>
                 </Card>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* INVENTORY AUDIT PRINT TEMPLATE (Hidden in UI) */}
      <div id="stock-print-content" className="hidden p-10 bg-white min-h-screen text-slate-900">
         <div className="text-center mb-10 border-b-2 border-slate-900 pb-6">
            <h1 className="text-3xl font-black uppercase mb-2">{storeProfile.name}</h1>
            <h2 className="text-xl font-bold uppercase tracking-widest">{t.stock_print_report}</h2>
            <p className="text-sm mt-2">พิมพ์เมื่อ: {new Date().toLocaleString('th-TH')}</p>
         </div>
         <table className="w-full border-collapse border border-slate-900">
            <thead>
               <tr className="bg-slate-100">
                  <th className="border border-slate-900 p-2 text-xs font-black w-10">ลำดับ</th>
                  <th className="border border-slate-900 p-2 text-xs font-black text-left w-24">SKU</th>
                  <th className="border border-slate-900 p-2 text-xs font-black text-left">รายการสินค้า</th>
                  <th className="border border-slate-900 p-2 text-xs font-black w-24">ระบบ (System)</th>
                  <th className="border border-slate-900 p-2 text-xs font-black w-24">นับได้จริง (Actual)</th>
                  <th className="border border-slate-900 p-2 text-xs font-black w-20">ส่วนต่าง</th>
               </tr>
            </thead>
            <tbody>
               {products.map((p, idx) => (
                  <tr key={p.id}>
                     <td className="border border-slate-900 p-2 text-xs text-center">{idx + 1}</td>
                     <td className="border border-slate-900 p-2 text-xs font-bold">{p.code}</td>
                     <td className="border border-slate-900 p-2 text-xs">{p.name}</td>
                     <td className="border border-slate-900 p-2 text-xs text-center font-black">{p.stock}</td>
                     <td className="border border-slate-900 p-2 text-xs"></td>
                     <td className="border border-slate-900 p-2 text-xs"></td>
                  </tr>
               ))}
            </tbody>
         </table>
         <div className="mt-20 grid grid-cols-2 gap-20">
            <div className="text-center">
               <div className="border-b border-slate-900 w-full mb-2"></div>
               <p className="text-xs font-bold">ลายเซ็นผู้นับสต็อก</p>
               <p className="text-[10px] text-slate-400">(........................................................)</p>
            </div>
            <div className="text-center">
               <div className="border-b border-slate-900 w-full mb-2"></div>
               <p className="text-xs font-bold">ลายเซ็นผู้จัดการ/เจ้าของร้าน</p>
               <p className="text-[10px] text-slate-400">(........................................................)</p>
            </div>
         </div>
      </div>

      {/* NEW BILL MODAL - FULLY OPTIMIZED */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center p-0 md:p-6 backdrop-blur-xl animate-in zoom-in-95">
          <div className="bg-white w-full h-full md:max-w-[95vw] md:h-[90vh] md:rounded-[3rem] shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
             
             {/* Mobile Header Tabs */}
             <div className="flex items-center border-b md:hidden bg-white z-20">
                <button 
                   onClick={()=>setNewBillTab('items')}
                   className={`flex-1 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${newBillTab === 'items' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-400'}`}
                >
                   1. เลือกสินค้า
                </button>
                <button 
                   onClick={()=>setNewBillTab('checkout')}
                   className={`flex-1 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${newBillTab === 'checkout' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-400'}`}
                >
                   2. เช็คบิล ({billItems.length})
                </button>
                <button onClick={()=>setIsBillModalOpen(false)} className="px-4 text-slate-400"><X size={20}/></button>
             </div>

             {/* Tab Content: Item Selection */}
             <div className={`flex-1 flex flex-col p-4 md:p-8 overflow-hidden bg-white ${newBillTab === 'items' ? 'flex' : 'hidden md:flex'}`}>
                <div className="hidden md:flex justify-between items-center mb-6">
                   <h3 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-3"><Package className="text-sky-500" size={24}/> เลือกสินค้า</h3>
                   <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl">
                      <ShoppingCart className="text-slate-400" size={18}/>
                      <span className="font-black text-slate-600">{billItems.reduce((s,i)=>s+i.quantity, 0)} Items</span>
                   </div>
                </div>

                <div className="relative mb-4 md:mb-6">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/>
                   <input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="w-full p-3 md:p-4 pl-12 bg-slate-50 border rounded-xl font-bold text-xs md:text-sm outline-none shadow-inner" />
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 overflow-y-auto flex-1 custom-scrollbar pb-32 md:pb-0">
                   {products.filter(p => !skuSearch || p.name.includes(skuSearch) || p.code.includes(skuSearch)).map(p => (
                      <button key={p.id} onClick={()=>addToCart(p)} className="bg-white p-2.5 md:p-4 rounded-xl md:rounded-[2rem] border shadow-sm hover:border-sky-600 transition-all text-left active:scale-95 group relative">
                         <div className="w-full aspect-square rounded-lg md:rounded-[1.5rem] bg-slate-50 mb-2 overflow-hidden border border-slate-100 relative">
                            {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : <div className={`w-full h-full ${p.color} flex items-center justify-center text-2xl md:text-4xl font-black text-white`}>{p.name.charAt(0)}</div>}
                            <div className="absolute top-1 right-1 bg-black/60 text-white text-[7px] md:text-[9px] px-1.5 py-0.5 rounded-lg font-black backdrop-blur-sm">Stock: {p.stock}</div>
                         </div>
                         <h4 className="font-black text-slate-800 text-[10px] md:text-xs truncate">{p.name}</h4>
                         <p className="text-sky-600 font-black text-[10px] md:text-sm">{formatMoney(p.price)}</p>
                      </button>
                   ))}
                </div>

                {/* Mobile Floating Total Bar */}
                <div className="md:hidden fixed bottom-6 left-4 right-4 bg-sky-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between z-30 animate-in slide-in-from-bottom-10">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center font-black">{billItems.reduce((s,i)=>s+i.quantity,0)}</div>
                      <div>
                         <p className="text-[9px] font-black uppercase opacity-70">ยอดรวม</p>
                         <p className="text-lg font-black">{formatMoney(cartTotal)}</p>
                      </div>
                   </div>
                   <button onClick={() => setNewBillTab('checkout')} className="bg-white text-sky-600 px-4 py-2 rounded-xl font-black text-sm flex items-center gap-1 shadow-lg active:scale-90 transition-all">
                      ชำระเงิน <ChevronRight size={16}/>
                   </button>
                </div>
             </div>

             {/* Tab Content: Checkout & Customer Info */}
             <div className={`w-full md:w-[40%] bg-slate-50 border-l flex flex-col h-full p-4 md:p-8 overflow-hidden ${newBillTab === 'checkout' ? 'flex' : 'hidden md:flex'}`}>
                <div className="hidden md:flex justify-between items-center mb-6">
                   <h3 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-3"><ShoppingCart className="text-sky-500" size={24}/> ตะกร้าสินค้า</h3>
                   <button onClick={()=>setIsBillModalOpen(false)} className="p-2 bg-white border rounded-full hover:bg-rose-500 hover:text-white transition-colors"><X size={20}/></button>
                </div>

                {/* Form Fields */}
                <div className="space-y-3 mb-4 flex-shrink-0 overflow-y-auto max-h-[40%] md:max-h-none custom-scrollbar pr-1">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                         <label className="text-[8px] font-black text-slate-400 uppercase ml-1">ชื่อลูกค้า</label>
                         <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder={t.order_cust_name} className="w-full p-3 bg-white border rounded-xl font-bold text-xs md:text-sm outline-none shadow-sm focus:border-sky-500" />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[8px] font-black text-slate-400 uppercase ml-1">เบอร์โทรศัพท์</label>
                         <input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder={t.order_cust_phone} className="w-full p-3 bg-white border rounded-xl font-bold text-xs md:text-sm outline-none shadow-sm focus:border-sky-500" />
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase ml-1">ที่อยู่/สาขาจัดส่ง</label>
                      <textarea value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} placeholder={t.order_cust_addr} className="w-full p-3 bg-white border rounded-xl font-bold h-16 md:h-24 text-xs resize-none shadow-sm outline-none focus:border-sky-500" />
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                         <label className="text-[8px] font-black text-slate-400 uppercase ml-1">ขนส่ง</label>
                         <select value={shippingCarrier} onChange={e=>setShippingCarrier(e.target.value as any)} className="w-full p-3 bg-white border rounded-xl font-bold text-xs shadow-sm outline-none">
                            <option value="None">รับเองหน้าร้าน</option>
                            <option value="Anuchit">Anuchit</option>
                            <option value="Meexai">Meexai</option>
                            <option value="Rungarun">Rungarun</option>
                         </select>
                      </div>
                      <div className="space-y-1">
                         <label className="text-[8px] font-black text-slate-400 uppercase ml-1">ชำระเงิน</label>
                         <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)} className="w-full p-3 bg-white border rounded-xl font-bold text-xs shadow-sm outline-none">
                            <option value="Transfer">โอนเงิน</option>
                            <option value="COD">เก็บเงินปลายทาง</option>
                         </select>
                      </div>
                   </div>
                </div>

                {/* Items in Cart */}
                <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1 mb-4 border-t border-slate-100 pt-4">
                   {billItems.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center opacity-30 gap-2">
                         <ShoppingCart size={40} className="text-slate-300"/>
                         <p className="text-[10px] font-black uppercase text-center">ยังไม่มีสินค้าในตะกร้า<br/>กลับไปเลือกสินค้าหน้าแรก</p>
                      </div>
                   ) : billItems.map(it => (
                      <div key={it.id} className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-right-2">
                         <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-50 border border-slate-100">
                            {it.imageUrl ? <img src={it.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${it.color} text-white flex items-center justify-center text-[10px] font-black`}>{it.name.charAt(0)}</div>}
                         </div>
                         <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-black text-slate-800 truncate">{it.name}</div>
                            <div className="text-[9px] font-bold text-sky-600">{formatMoney(it.price)}</div>
                         </div>
                         <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100">
                            <button onClick={()=>updateCartQuantity(it.id, it.quantity - 1)} className="p-1 text-slate-400 hover:text-sky-600 transition-colors"><Minus size={14}/></button>
                            <span className="w-6 text-center text-xs font-black">{it.quantity}</span>
                            <button onClick={()=>updateCartQuantity(it.id, it.quantity + 1)} className="p-1 text-slate-400 hover:text-sky-600 transition-colors"><Plus size={14}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter(x=>x.id!==it.id))} className="p-1.5 text-rose-300 hover:text-rose-600 transition-colors"><Trash2 size={16}/></button>
                      </div>
                   ))}
                </div>

                {/* Checkout Footer */}
                <div className="mt-auto bg-white p-4 md:p-6 rounded-[2rem] shadow-2xl border-t border-slate-50">
                   <div className="flex justify-between items-center mb-4">
                      <div className="flex flex-col">
                         <span className="text-[10px] font-black text-slate-400 uppercase leading-tight">ยอดรวมสุทธิ</span>
                         <span className="text-2xl md:text-3xl font-black text-sky-600">{formatMoney(cartTotal)}</span>
                      </div>
                      <div className="flex flex-col items-end">
                         <span className="text-[9px] font-bold text-slate-400 leading-tight">รายการ</span>
                         <span className="font-black text-slate-800 text-lg">{billItems.reduce((s,i)=>s+i.quantity, 0)}</span>
                      </div>
                   </div>
                   <button 
                      disabled={billItems.length === 0}
                      onClick={handleCheckout} 
                      className="w-full py-4 md:py-5 bg-sky-600 disabled:bg-slate-200 text-white rounded-2xl font-black text-lg md:text-xl shadow-xl hover:bg-sky-700 active:scale-95 transition-all flex items-center justify-center gap-3"
                   >
                      <CheckCircle2 size={24}/> ยืนยันการสั่งซื้อ
                   </button>
                </div>
             </div>

          </div>
        </div>
      )}

      {/* Product Edit Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-in zoom-in-95">
          <Card className="w-full max-w-xl p-6 md:p-10 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
             <button onClick={()=>setIsProductModalOpen(false)} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20}/></button>
             <h3 className="text-lg md:text-2xl font-black mb-6 text-slate-800 flex items-center gap-3"><Package className="text-sky-500" size={24}/> {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
             <form onSubmit={async (e) => {
                e.preventDefault(); 
                const fd = new FormData(e.currentTarget);
                const p = {
                  id: editingProduct?.id || uuidv4(), 
                  name: fd.get('name') as string, code: fd.get('code') as string,
                  cost: Number(fd.get('cost')), price: Number(fd.get('price')), stock: Number(fd.get('stock')),
                  imageUrl: editingProduct?.imageUrl || "",
                  color: editingProduct?.color || "bg-sky-500", category: fd.get('category') as string || "General"
                };
                await setDoc(doc(db, 'products', p.id), p);
                setIsProductModalOpen(false);
             }} className="space-y-4">
                <div className="flex justify-center mb-6">
                  <div className="relative group">
                    <div className="w-24 h-24 md:w-32 md:h-32 rounded-[2rem] bg-slate-50 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center border-dashed border-slate-200">
                       {editingProduct?.imageUrl ? <img src={editingProduct.imageUrl} className="w-full h-full object-cover" /> : <ImageIcon size={32} className="text-slate-300"/>}
                    </div>
                    <label className="absolute bottom-0 right-0 p-2 md:p-3 bg-sky-600 text-white rounded-xl shadow-lg cursor-pointer hover:bg-sky-700 active:scale-90 transition-all">
                       <Upload size={16}/>
                       <input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, (url) => setEditingProduct(prev => prev ? {...prev, imageUrl: url} : {id: '', name: '', code: '', price: 0, cost: 0, category: '', stock: 0, color: 'bg-sky-500', imageUrl: url}))} />
                    </label>
                  </div>
                </div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">ชื่อสินค้า</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-xs md:text-sm outline-none focus:border-sky-500" /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">รหัส SKU</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-xs md:text-sm outline-none focus:border-sky-500" /></div>
                <div className="grid grid-cols-2 gap-4">
                   <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">ราคาทุน</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-xs md:text-sm outline-none focus:border-sky-500" /></div>
                   <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">ราคาขาย</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-3 bg-sky-50 border-sky-100 rounded-xl font-black text-sky-600 text-xs md:text-sm outline-none focus:border-sky-500" /></div>
                </div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">จำนวนในสต็อก</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-xs md:text-sm outline-none focus:border-sky-500" /></div>
                <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-xl font-black shadow-xl hover:bg-sky-700 active:scale-95 transition-all mt-4">บันทึกสินค้า</button>
             </form>
          </Card>
        </div>
      )}

      {/* Promotions Edit Modal */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-in zoom-in-95">
          <Card className="w-full max-w-2xl p-6 md:p-10 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
             <button onClick={()=>setIsPromoModalOpen(false)} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20}/></button>
             <h3 className="text-lg md:text-2xl font-black mb-6 text-slate-800 flex items-center gap-3"><Tag className="text-sky-500" size={24}/> ตั้งค่าโปรโมชั่น</h3>
             <form onSubmit={async (e) => {
                e.preventDefault(); 
                const fd = new FormData(e.currentTarget);
                const tiers: PromoTier[] = [];
                for(let i=1; i<=7; i++) {
                   const q = fd.get(`qty_${i}`); const pr = fd.get(`price_${i}`);
                   if(q && pr) tiers.push({ minQty: Number(q), unitPrice: Number(pr) });
                }
                const skuList = promoSkusInput.split(',').map(s => s.trim()).filter(Boolean);
                const selectedIds = products.filter(p => skuList.includes(p.code)).map(p => p.id);
                if (selectedIds.length === 0) {
                    alert("กรุณาระบุ SKU สินค้าอย่างน้อย 1 รายการ");
                    return;
                }
                const promo = { id: editingPromo?.id || uuidv4(), name: fd.get('name') as string, targetProductIds: selectedIds, isActive: true, tiers };
                await setDoc(doc(db, 'promotions', promo.id), promo);
                setIsPromoModalOpen(false);
             }} className="space-y-4">
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">ชื่อโปรโมชั่น</label><input name="name" required defaultValue={editingPromo?.name} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-xs md:text-sm outline-none focus:border-sky-500" /></div>
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center justify-between">
                     SKUs สินค้าที่เข้าร่วม (คั่นด้วยคอมม่า)
                     <span className="text-[8px] text-sky-500 lowercase font-bold">{products.filter(p => promoSkusInput.split(',').map(s=>s.trim()).includes(p.code)).length} found</span>
                   </label>
                   <textarea value={promoSkusInput} onChange={e=>setPromoSkusInput(e.target.value)} placeholder={t.promo_sku_placeholder} className="w-full p-3 bg-slate-50 border rounded-xl font-bold h-24 text-xs outline-none focus:border-sky-500 resize-none shadow-inner" />
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] font-black text-slate-400 uppercase ml-1">ขั้นบันไดราคา (Price Tiers)</p>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                     {Array.from({length: 6}).map((_, i) => (
                       <div key={i} className="flex gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                         <div className="flex-shrink-0 text-[10px] font-black text-slate-300 w-4">{i+1}</div>
                         <input name={`qty_${i+1}`} type="number" placeholder="ชิ้น" defaultValue={editingPromo?.tiers?.[i]?.minQty} className="w-12 p-2 bg-white border rounded-lg font-bold text-center text-xs outline-none focus:border-sky-500" />
                         <ArrowRight size={12} className="text-slate-300"/>
                         <input name={`price_${i+1}`} type="number" placeholder="ราคา/ชิ้น" defaultValue={editingPromo?.tiers?.[i]?.unitPrice} className="flex-1 p-2 bg-white border rounded-lg font-black text-sky-600 text-center text-xs outline-none focus:border-sky-500" />
                       </div>
                     ))}
                   </div>
                </div>
                <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-xl font-black shadow-xl hover:bg-sky-700 active:scale-95 transition-all mt-4">บันทึกโปรโมชั่น</button>
             </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default App;
