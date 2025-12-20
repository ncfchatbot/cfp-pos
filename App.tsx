
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Minus, Trash2, Edit, LayoutDashboard, Settings, 
  Package, ClipboardList, BarChart3, Tag, X, Search,
  ShoppingCart, Coffee, TrendingUp, CheckCircle2, Save, Send, Bot, 
  User, Download, Upload, AlertCircle, FileText, Smartphone, Truck, CreditCard, Building2, MapPin, Image as ImageIcon, FileUp, FileDown, ShieldAlert, Wifi, WifiOff, DollarSign, PieChart, ArrowRight, BarChart2, Users
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AppMode, Product, CartItem, SaleRecord, StoreProfile, Language, Promotion, PromoTier, Role, Message, LogisticsProvider, OrderStatus, PaymentMethod } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import { db, collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc } from './services/firebase';
import { streamResponse } from './services/gemini';
import ChatMessage from './components/ChatMessage';

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 ${className}`}>{children}</div>
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

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [promoSkusInput, setPromoSkusInput] = useState('');

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
      alert("Checkout Successful!");
    } catch (err: any) { alert("Error: " + err.message); }
  };

  const exportRawData = () => {
    // แก้ไขคอลัมน์ CSV ให้ถูกต้องตามลำดับความเป็นจริง
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

  // --- REPORT CALCULATIONS ---
  const reportStats = useMemo(() => {
    const validSales = recentSales.filter(s => s.status !== 'Cancelled');
    const totalRevenue = validSales.reduce((a, b) => a + Number(b.total || 0), 0);
    
    // Fix Stock Asset calculation
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

    // กราฟรายเดือน (Mock logic: ดึงจาก string date "12/20/2025")
    const monthlyData: Record<string, number> = {};
    validSales.forEach(s => {
      const monthStr = s.date.split('/')[0] + '/' + s.date.split('/')[2].split(' ')[0];
      monthlyData[monthStr] = (monthlyData[monthStr] || 0) + Number(s.total);
    });
    
    // Top 10 SKUs
    const productCounts: Record<string, {name: string, qty: number}> = {};
    validSales.forEach(s => s.items.forEach(i => {
      if (!productCounts[i.id]) productCounts[i.id] = {name: i.name, qty: 0};
      productCounts[i.id].qty += i.quantity;
    }));
    const topProducts = Object.values(productCounts).sort((a,b) => b.qty - a.qty).slice(0, 10);

    // Top 10 Customers
    const customerCounts: Record<string, {name: string, total: number}> = {};
    validSales.forEach(s => {
      const cName = s.customerName || "Anonymous";
      if (!customerCounts[cName]) customerCounts[cName] = {name: cName, total: 0};
      customerCounts[cName].total += Number(s.total);
    });
    const topCustomers = Object.values(customerCounts).sort((a,b) => b.total - a.total).slice(0, 10);

    return { totalRevenue, totalCost, profit: totalRevenue - totalCost, stockValue, topProducts, topCustomers, monthlyData };
  }, [recentSales, products]);

  return (
    <div className={`flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar 
        currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} 
        onExport={()=>{}} onImport={()=>{}} language={language} setLanguage={setLanguage} 
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between shadow-sm z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-400"><LayoutDashboard /></button>
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center border overflow-hidden">
                {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <Coffee size={20} className="text-slate-400"/>}
             </div>
             <h2 className="font-black text-slate-800 uppercase tracking-tight">{t[`menu_${mode}`] || mode}</h2>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{storeProfile.name}</p>
                <div className="flex items-center gap-1 justify-end">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                   <p className="text-[9px] text-emerald-600 font-bold uppercase">Online</p>
                </div>
             </div>
             <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm overflow-hidden">
                <img src={storeProfile.logoUrl || `https://ui-avatars.com/api/?name=${storeProfile.name}&background=0ea5e9&color=fff`} alt="store" />
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-8">
            
            {mode === AppMode.DASHBOARD && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in">
                 {[
                   { label: t.dash_sales, val: reportStats.totalRevenue, icon: TrendingUp, color: "sky" },
                   { label: t.dash_stock_cost, val: reportStats.stockValue, icon: Package, color: "amber" },
                   { label: t.menu_orders, val: recentSales.filter(s=>s.status!=='Cancelled').length, icon: ClipboardList, color: "purple", unit: "Bills" },
                   { label: t.dash_low_stock, val: products.filter(p => Number(p.stock) <= 5).length, icon: AlertCircle, color: "rose", unit: "Alert" }
                 ].map((card, i) => (
                   <Card key={i} className="group hover:border-sky-500 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.label}</span>
                        <div className={`p-3 rounded-2xl bg-${card.color}-50 text-${card.color}-600 group-hover:scale-110 transition-transform`}><card.icon size={20}/></div>
                      </div>
                      <h3 className="text-3xl font-black text-slate-900">{card.unit ? `${card.val} ${card.unit}` : formatMoney(card.val)}</h3>
                   </Card>
                 ))}
              </div>
            )}

            {mode === AppMode.ORDERS && (
              <div className="space-y-6 animate-in slide-in-from-bottom-5">
                 <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><ClipboardList className="text-sky-500"/> {t.menu_orders}</h2>
                    <button onClick={() => setIsBillModalOpen(true)} className="bg-sky-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-sky-700 transition-all shadow-xl active:scale-95 flex items-center gap-2">
                       <Plus size={20}/> {t.order_create_bill}
                    </button>
                 </div>
                 <div className="bg-white rounded-[2.5rem] border overflow-hidden shadow-sm overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                       <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-8 py-5">Bill / Customer</th><th className="px-8 py-5 text-center">Payment</th><th className="px-8 py-5 text-right">Total</th><th className="px-8 py-5 text-center">Status</th><th className="px-8 py-5 text-center">Action</th></tr>
                       </thead>
                       <tbody className="divide-y text-sm font-bold">
                          {recentSales.map(s => (
                            <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${s.status === 'Cancelled' ? 'opacity-40' : ''}`}>
                               <td className="px-8 py-5">
                                 <div className="text-slate-800">#{s.id.slice(0,8)} | {s.customerName || '-'}</div>
                                 <div className="text-[10px] text-slate-300 font-medium">{s.date}</div>
                               </td>
                               <td className="px-8 py-5 text-center"><span className="px-2 py-1 bg-slate-100 rounded text-[10px] uppercase font-black">{s.paymentMethod}</span></td>
                               <td className="px-8 py-5 text-right text-sky-600 font-black">{formatMoney(s.total)}</td>
                               <td className="px-8 py-5 text-center">
                                 <span className={`px-3 py-1 rounded-lg text-[10px] uppercase font-black ${s.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : s.status === 'Cancelled' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>{s.status}</span>
                               </td>
                               <td className="px-8 py-5 text-center">
                                 {s.status !== 'Cancelled' && <button onClick={async () => { if(confirm('Cancel Order?')) await setDoc(doc(db, 'sales', s.id), {...s, status: 'Cancelled'}); }} className="p-2 text-rose-300 hover:text-rose-600"><Trash2 size={18}/></button>}
                               </td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
            )}

            {mode === AppMode.STOCK && (
              <div className="space-y-6 animate-in slide-in-from-bottom-5">
                 <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Package className="text-sky-500"/> {t.stock_title}</h2>
                    <button onClick={()=>{setEditingProduct(null); setIsProductModalOpen(true);}} className="bg-sky-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-sky-700 transition-all">
                       {t.stock_add}
                    </button>
                 </div>
                 <div className="bg-white rounded-[2.5rem] border overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-8 py-5">Item</th><th className="px-8 py-5 text-right">Cost</th><th className="px-8 py-5 text-right">Price</th><th className="px-8 py-5 text-center">In Stock</th><th className="px-8 py-5 text-center">Edit</th></tr>
                       </thead>
                       <tbody className="divide-y text-sm font-bold">
                          {products.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-8 py-5 flex items-center gap-4">
                                  <div className="w-12 h-12 rounded-xl bg-slate-100 border overflow-hidden flex items-center justify-center">
                                    {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${p.color} text-white flex items-center justify-center font-black`}>{p.name.charAt(0)}</div>}
                                  </div>
                                  <div><div className="text-slate-800">{p.name}</div><div className="text-[10px] text-slate-300">SKU: {p.code}</div></div>
                               </td>
                               <td className="px-8 py-5 text-right text-slate-400">{formatMoney(p.cost)}</td>
                               <td className="px-8 py-5 text-right text-sky-600 font-black">{formatMoney(p.price)}</td>
                               <td className="px-8 py-5 text-center"><span className={`px-4 py-1 rounded-xl text-[10px] font-black ${Number(p.stock) <= 5 ? 'bg-rose-500 text-white' : 'bg-emerald-50 text-emerald-600'}`}>{p.stock}</span></td>
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
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Tag className="text-sky-500"/> {t.menu_promotions}</h2>
                    <button onClick={()=>{setEditingPromo(null); setPromoSkusInput(''); setIsPromoModalOpen(true);}} className="bg-sky-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-sky-700 transition-all flex items-center gap-2">
                       <Plus size={20}/> {t.promo_add}
                    </button>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {promotions.map(promo => (
                      <div key={promo.id} className="bg-white p-8 rounded-[2.5rem] border shadow-sm relative group hover:border-sky-500 transition-all">
                          <button onClick={async () => { if(confirm('Delete?')) await deleteDoc(doc(db, 'promotions', promo.id)); }} className="absolute top-6 right-6 p-2 text-slate-200 hover:text-rose-500"><Trash2 size={18}/></button>
                          <h4 className="font-black text-slate-800 mb-2">{promo.name}</h4>
                          <div className="flex flex-wrap gap-1 mb-6">
                            {promo.targetProductIds.map(id => {
                              const p = products.find(x=>x.id===id);
                              return p ? <span key={id} className="text-[10px] px-2 py-1 bg-sky-50 text-sky-600 rounded font-bold">#{p.code}</span> : null;
                            })}
                          </div>
                          <button onClick={()=>{setEditingPromo(promo); setPromoSkusInput(promo.targetProductIds.map(id=>products.find(x=>x.id===id)?.code).join(', ')); setIsPromoModalOpen(true);}} className="w-full py-4 bg-slate-50 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-sky-600 hover:text-white transition-all">Edit</button>
                      </div>
                    ))}
                 </div>
              </div>
            )}

            {mode === AppMode.REPORTS && (
              <div className="space-y-8 animate-in fade-in">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-sky-600 text-white border-0 shadow-xl">
                       <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">TOTAL REVENUE</p>
                       <h3 className="text-4xl font-black">{formatMoney(reportStats.totalRevenue)}</h3>
                    </Card>
                    <Card className="bg-white border-slate-200">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PROFIT</p>
                       <h3 className="text-4xl font-black text-emerald-600">{formatMoney(reportStats.profit)}</h3>
                    </Card>
                    <Card className="bg-white border-slate-200">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">STOCK ASSET</p>
                       <h3 className="text-4xl font-black text-slate-800">{formatMoney(reportStats.stockValue)}</h3>
                    </Card>
                 </div>

                 {/* กราฟรายเดือน */}
                 <Card>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2"><BarChart2 size={18} className="text-sky-500"/> Monthly Sales Performance</h4>
                    <div className="flex items-end gap-2 h-40">
                      {Object.entries(reportStats.monthlyData).map(([month, val], i) => {
                        // Fix: Explicitly cast 'unknown' values and Object.values to 'number' types to resolve errors on lines 379, 380, and 383.
                        const allValues = Object.values(reportStats.monthlyData) as number[];
                        const maxVal = Math.max(...allValues, 1);
                        const currentVal = val as number;
                        const height = (currentVal / maxVal) * 100;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-2">
                             <div className="text-[8px] font-black text-slate-400">{formatMoney(currentVal)}</div>
                             <div className="w-full bg-sky-500 rounded-t-xl transition-all duration-1000" style={{ height: `${height}%` }}></div>
                             <div className="text-[10px] font-black text-slate-800">{month}</div>
                          </div>
                        )
                      })}
                    </div>
                 </Card>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Top 10 SKUs */}
                    <Card>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2"><PieChart size={18} className="text-sky-500"/> TOP 10 BEST SELLERS</h4>
                        <div className="space-y-4">
                          {reportStats.topProducts.map((p, idx) => (
                             <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-50 pb-2">
                               <div className="flex items-center gap-3">
                                  <span className="w-5 h-5 bg-slate-100 rounded text-[10px] flex items-center justify-center font-black text-slate-400">{idx+1}</span>
                                  <span className="font-bold text-slate-700">{p.name}</span>
                               </div>
                               <span className="font-black text-sky-600">{p.qty} Units</span>
                             </div>
                          ))}
                        </div>
                    </Card>

                    {/* Top 10 Customers */}
                    <Card>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2"><Users size={18} className="text-sky-500"/> TOP 10 VALUABLE CUSTOMERS</h4>
                        <div className="space-y-4">
                          {reportStats.topCustomers.map((c, idx) => (
                             <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-50 pb-2">
                               <div className="flex items-center gap-3">
                                  <span className="w-5 h-5 bg-slate-100 rounded text-[10px] flex items-center justify-center font-black text-slate-400">{idx+1}</span>
                                  <span className="font-bold text-slate-700">{c.name}</span>
                               </div>
                               <span className="font-black text-emerald-600">{formatMoney(c.total)}</span>
                             </div>
                          ))}
                        </div>
                    </Card>
                 </div>

                 <div className="flex justify-end">
                    <button onClick={exportRawData} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-xl">
                       <FileDown size={20}/> {t.report_export_raw}
                    </button>
                 </div>
              </div>
            )}

            {mode === AppMode.SETTINGS && (
              <div className="animate-in fade-in">
                <Card className="max-w-2xl">
                  <h3 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-3"><Settings className="text-sky-500"/> {t.menu_settings}</h3>
                  <div className="space-y-6">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t.setting_shop_name}</label><input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" /></div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Store Logo</label>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="w-20 h-20 rounded-2xl bg-slate-100 border overflow-hidden flex items-center justify-center">
                           {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <ImageIcon className="text-slate-300" />}
                        </div>
                        <label className="cursor-pointer px-4 py-2 bg-white border rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50">
                          Upload Logo
                          <input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, (url) => setStoreProfile({...storeProfile, logoUrl: url}))} />
                        </label>
                      </div>
                    </div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t.setting_address}</label><textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold h-24" /></div>
                    <button onClick={()=>{localStorage.setItem('pos_profile', JSON.stringify(storeProfile)); alert('Saved');}} className="w-full py-5 bg-sky-600 text-white rounded-2xl font-black uppercase shadow-xl hover:bg-sky-700 active:scale-95 transition-all">Save Changes</button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODALS */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[500] flex items-center justify-center p-4 backdrop-blur-xl animate-in zoom-in-95">
          <div className="bg-white w-full max-w-[95vw] h-[95vh] rounded-[4rem] shadow-2xl flex flex-col md:flex-row overflow-hidden">
             <div className="w-full md:w-[40%] bg-slate-50 border-r flex flex-col h-full p-8">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><ShoppingCart className="text-sky-500"/> {t.order_create_bill}</h3>
                   <button onClick={()=>setIsBillModalOpen(false)} className="p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20}/></button>
                </div>
                
                <div className="space-y-4 mb-6">
                   <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder={t.order_cust_name} className="w-full p-3 bg-white border rounded-xl font-bold outline-none shadow-sm" />
                   <div className="grid grid-cols-2 gap-3">
                      <input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder={t.order_cust_phone} className="p-3 bg-white border rounded-xl font-bold outline-none shadow-sm" />
                      <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)} className="p-3 bg-white border rounded-xl font-bold shadow-sm">
                         <option value="Transfer">โอนเงิน</option>
                         <option value="COD">COD</option>
                      </select>
                   </div>
                   <textarea value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} placeholder={t.order_cust_addr} className="w-full p-3 bg-white border rounded-xl font-bold h-20 outline-none shadow-sm" />
                   <select value={shippingCarrier} onChange={e=>setShippingCarrier(e.target.value as any)} className="w-full p-3 bg-white border rounded-xl font-bold shadow-sm">
                      <option value="None">หน้าร้าน (Takeaway)</option>
                      <option value="Anuchit">Anuchit</option>
                      <option value="Meexai">Meexai</option>
                      <option value="Rungarun">Rungarun</option>
                   </select>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                   {billItems.map(it => (
                      <div key={it.id} className="flex items-center gap-4 p-4 bg-white rounded-3xl border shadow-sm">
                         <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center font-black">
                            {it.imageUrl ? <img src={it.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${it.color} text-white flex items-center justify-center`}>{it.name.charAt(0)}</div>}
                         </div>
                         <div className="flex-1 min-w-0"><div className="text-xs font-black text-slate-800 truncate">{it.name}</div><div className="text-xs font-bold text-sky-600">{formatMoney(it.price)}</div></div>
                         <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl">
                            <button onClick={()=>updateCartQuantity(it.id, it.quantity - 1)} className="p-2 hover:text-sky-600"><Minus size={14}/></button>
                            <input type="number" value={it.quantity} onChange={(e)=>updateCartQuantity(it.id, parseInt(e.target.value)||1)} className="w-12 text-center bg-transparent font-black" />
                            <button onClick={()=>updateCartQuantity(it.id, it.quantity + 1)} className="p-2 hover:text-sky-600"><Plus size={14}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter(x=>x.id!==it.id))} className="p-2 text-rose-300 hover:text-rose-600"><Trash2 size={16}/></button>
                      </div>
                   ))}
                </div>
                
                <div className="mt-4 p-6 bg-white rounded-[2.5rem] shadow-xl">
                   <div className="flex justify-between items-center mb-4"><span className="text-xs font-black text-slate-400">TOTAL</span><span className="text-3xl font-black text-sky-600">{formatMoney(billItems.reduce((s,i)=>s+(Number(i.price || 0)*i.quantity),0))}</span></div>
                   <button onClick={handleCheckout} className="w-full py-5 bg-sky-600 text-white rounded-2xl font-black text-xl hover:bg-sky-700 shadow-xl active:scale-95 transition-all">CHECKOUT</button>
                </div>
             </div>
             
             <div className="flex-1 p-8 overflow-hidden flex flex-col bg-white">
                <div className="relative mb-6"><Search className="absolute left-4 top-4 text-slate-300" size={20}/><input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="w-full p-4 pl-12 bg-slate-50 border rounded-2xl font-bold outline-none shadow-sm" /></div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 overflow-y-auto custom-scrollbar">
                   {products.filter(p => !skuSearch || p.name.includes(skuSearch) || p.code.includes(skuSearch)).map(p => (
                      <button key={p.id} onClick={()=>addToCart(p)} className="bg-white p-4 rounded-[2.5rem] border shadow-sm hover:border-sky-600 transition-all text-left group relative">
                         <div className="w-full aspect-square rounded-[2rem] bg-slate-100 mb-3 overflow-hidden shadow border relative">
                            {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : <div className={`w-full h-full ${p.color} flex items-center justify-center text-4xl font-black text-white`}>{p.name.charAt(0)}</div>}
                            <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-lg font-black">{p.stock}</div>
                         </div>
                         <h4 className="font-black text-slate-800 text-xs truncate mb-1">{p.name}</h4>
                         <span className="text-sky-600 font-black">{formatMoney(p.price)}</span>
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-xl animate-in zoom-in-95">
          <Card className="w-full max-w-3xl p-10 relative max-h-[90vh] overflow-y-auto">
             <button onClick={()=>setIsPromoModalOpen(false)} className="absolute top-6 right-6 p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white"><X size={20}/></button>
             <h3 className="text-2xl font-black mb-8 text-slate-800 flex items-center gap-3"><Tag className="text-sky-500"/> Promotion Settings</h3>
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
                const promo = { id: editingPromo?.id || uuidv4(), name: fd.get('name') as string, targetProductIds: selectedIds, isActive: true, tiers };
                await setDoc(doc(db, 'promotions', promo.id), promo);
                setIsPromoModalOpen(false);
             }} className="space-y-6">
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Promotion Name</label><input name="name" required defaultValue={editingPromo?.name} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" /></div>
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Apply to SKUs (Separate by commas)</label>
                   <textarea value={promoSkusInput} onChange={e=>setPromoSkusInput(e.target.value)} placeholder={t.promo_sku_placeholder} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold h-24 outline-none" />
                   <p className="text-[10px] text-slate-400 mt-2 italic font-bold">Paste SKUs here: e.g. 001, 002, 005</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({length: 7}).map((_, i) => (
                    <div key={i} className="flex gap-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <input name={`qty_${i+1}`} type="number" placeholder="Qty" defaultValue={editingPromo?.tiers?.[i]?.minQty} className="w-16 p-2 bg-white border rounded text-center font-bold outline-none" />
                      <ArrowRight size={14} className="text-slate-300"/>
                      <input name={`price_${i+1}`} type="number" placeholder="Price" defaultValue={editingPromo?.tiers?.[i]?.unitPrice} className="flex-1 p-2 bg-white border rounded font-black text-sky-600 text-center outline-none" />
                    </div>
                  ))}
                </div>
                <button type="submit" className="w-full py-5 bg-sky-600 text-white rounded-2xl font-black shadow-xl active:scale-95 transition-all">SAVE PROMOTION</button>
             </form>
          </Card>
        </div>
      )}

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-xl animate-in zoom-in-95">
          <Card className="w-full max-w-xl p-10 relative">
             <button onClick={()=>setIsProductModalOpen(false)} className="absolute top-6 right-6 p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white"><X size={20}/></button>
             <h3 className="text-2xl font-black mb-8 text-slate-800 flex items-center gap-3"><Package className="text-sky-500"/> Product Info</h3>
             <form onSubmit={async (e) => {
                e.preventDefault(); 
                const fd = new FormData(e.currentTarget);
                const p = {
                  id: editingProduct?.id || uuidv4(), 
                  name: fd.get('name') as string, code: fd.get('code') as string,
                  cost: Number(fd.get('cost')), price: Number(fd.get('price')), stock: Number(fd.get('stock')),
                  imageUrl: editingProduct?.imageUrl || "",
                  color: editingProduct?.color || "bg-sky-500", category: "General"
                };
                await setDoc(doc(db, 'products', p.id), p);
                setIsProductModalOpen(false);
             }} className="space-y-4">
                <div className="flex justify-center mb-6">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-[2.5rem] bg-slate-100 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center">
                       {editingProduct?.imageUrl ? <img src={editingProduct.imageUrl} className="w-full h-full object-cover" /> : <ImageIcon size={40} className="text-slate-300"/>}
                    </div>
                    <label className="absolute bottom-0 right-0 p-3 bg-sky-600 text-white rounded-2xl shadow-lg cursor-pointer hover:bg-sky-700">
                       <Upload size={18}/>
                       <input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, (url) => setEditingProduct(prev => prev ? {...prev, imageUrl: url} : {id: '', name: '', code: '', price: 0, cost: 0, category: '', stock: 0, color: 'bg-sky-500', imageUrl: url}))} />
                    </label>
                  </div>
                </div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">SKU Code</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" /></div>
                <div className="grid grid-cols-2 gap-4">
                   <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cost</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" /></div>
                   <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Retail Price</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-4 bg-sky-50 border-sky-100 rounded-xl font-black text-sky-600 outline-none" /></div>
                </div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">In Stock</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none" /></div>
                <button type="submit" className="w-full py-5 bg-sky-600 text-white rounded-2xl font-black shadow-xl active:scale-95 transition-all">SAVE PRODUCT</button>
             </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default App;
