
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Minus, Trash2, Edit, LayoutDashboard, Settings, 
  Package, ClipboardList, BarChart3, Tag, X, Search,
  ShoppingCart, Coffee, TrendingUp, CheckCircle2, Save, Send, Bot, 
  User, Download, Upload, AlertCircle, FileText, Smartphone, Truck, CreditCard, Building2, MapPin, Image as ImageIcon, FileUp, FileDown, ShieldAlert, Wifi, WifiOff
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AppMode, Product, CartItem, SaleRecord, StoreProfile, Language, Promotion, PromoTier, Role, Message, LogisticsProvider, OrderStatus, PaymentMethod } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import { db, collection, doc, setDoc, onSnapshot, query, orderBy } from './services/firebase';

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
    const unsubP = onSnapshot(collection(db, 'products'), s => setProducts(s.docs.map(d => ({ ...d.data(), id: d.id } as Product))));
    const unsubS = onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), s => setRecentSales(s.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord))));
    const unsubPr = onSnapshot(collection(db, 'promotions'), s => setPromotions(s.docs.map(d => ({ ...d.data(), id: d.id } as Promotion))));
    return () => { unsubP(); unsubS(); unsubPr(); };
  }, []);

  const getProductPrice = (product: Product, quantity: number) => {
    const promo = promotions.find(p => p.targetProductId === product.id && p.isActive);
    if (!promo || !promo.tiers || !promo.tiers.length) return product.price;
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
      date: new Date().toLocaleString(), timestamp: Date.now(), 
      status: paymentStatus, paymentMethod, 
      customerName, customerPhone, customerAddress, 
      shippingCarrier, shippingBranch
    };
    if (db) await setDoc(doc(db, 'sales', order.id), order);
    
    // Auto-update stock
    for (const item of billItems) {
      const p = products.find(x => x.id === item.id);
      if (p && db) {
        await setDoc(doc(db, 'products', p.id), { ...p, stock: Math.max(0, p.stock - item.quantity) });
      }
    }

    setIsBillModalOpen(false); 
    setBillItems([]); 
    setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setShippingBranch('');
  };

  // --- DOWNLOAD CSV TEMPLATE ---
  const downloadTemplate = () => {
    const headers = "name,code,price,cost,stock,category";
    const example = "Espresso Coffee,E001,25000,15000,100,Coffee\nLatte Art,L002,30000,18000,50,Coffee";
    const csvContent = "\ufeff" + headers + "\n" + example;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "coffee_please_product_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- BULK FILE IMPORT (CSV/JSON) ---
  const handleBulkFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      let content = event.target?.result as string;
      try {
        if (content.startsWith('\ufeff')) {
          content = content.substring(1);
        }

        let importedProducts: any[] = [];
        
        if (file.name.toLowerCase().endsWith('.json')) {
          importedProducts = JSON.parse(content);
        } else if (file.name.toLowerCase().endsWith('.csv')) {
          const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
          if (lines.length < 2) {
            alert('File appears to be empty or missing data rows.');
            return;
          }

          const firstLine = lines[0];
          const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
          const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase());
          
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(delimiter);
            const p: any = {};
            headers.forEach((h, idx) => {
              const rawVal = values[idx]?.trim() || '';
              p[h] = rawVal.replace(/^["']|["']$/g, '');
            });
            importedProducts.push(p);
          }
        }

        if (Array.isArray(importedProducts) && db) {
          let count = 0;
          for (const p of importedProducts) {
            const name = p.name || p['item name'] || p['ชื่อสินค้า'];
            if (!name) continue; 

            const id = p.id || uuidv4();
            const parseNum = (v: any) => {
              if (v === undefined || v === null) return 0;
              const cleaned = String(v).replace(/[^0-9.]/g, '');
              return Number(cleaned) || 0;
            };

            const productData = {
              id,
              code: p.code || 'SKU-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
              name: String(name),
              price: parseNum(p.price),
              cost: parseNum(p.cost),
              stock: parseNum(p.stock),
              category: p.category || 'General',
              color: p.color || 'bg-sky-500'
            };

            await setDoc(doc(db, 'products', id), productData);
            count++;
          }
          alert(`Successfully imported ${count} items!`);
        } else if (!db) {
          alert('Database connection not available.');
        } else {
          alert('Invalid file format. Please use the provided template.');
        }
      } catch (err: any) {
        console.error("Import Error:", err);
        if (err.message && err.message.toLowerCase().includes('permission')) {
          alert('🔥 ERROR: Missing Permissions!\n\nโปรดเข้าไปที่ Firebase Console และตั้งค่า Firestore Rules ให้เป็น Public (allow read, write: if true;) เพื่ออนุญาตการนำเข้าข้อมูล');
        } else {
          alert('Error processing file: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // Limit 1MB
        alert('File size too large. Please use image under 1MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setStoreProfile(prev => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const formatMoney = (amount: number) => {
    const locale = language === 'th' ? 'th-TH' : (language === 'en' ? 'en-US' : 'lo-LA');
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'LAK', maximumFractionDigits: 0 }).format(amount);
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
             <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-white overflow-hidden border">
                {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <Coffee size={20} className="text-slate-400"/>}
             </div>
             <h2 className="font-black text-slate-800 uppercase tracking-tight">{t[`menu_${mode}`] || mode}</h2>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{storeProfile.name || 'Coffee Please'}</p>
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
                          <h4 className="text-xl font-black text-slate-800">Welcome, {storeProfile.name}!</h4>
                          <p className="text-slate-500 font-medium">จัดการรายการขายและสต็อกสินค้าของคุณได้ที่นี่</p>
                       </div>
                       <button onClick={() => setIsBillModalOpen(true)} className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-black hover:bg-black transition-all shadow-xl active:scale-95">
                          {t.order_create_bill}
                       </button>
                    </div>
                 </Card>
              </div>
            )}

            {mode === AppMode.ORDERS && (
              <div className="space-y-6 animate-in slide-in-from-bottom-5">
                 <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><ClipboardList className="text-sky-500"/> {t.menu_orders}</h2>
                 </div>
                 <div className="bg-white rounded-[2.5rem] border overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          <tr><th className="px-8 py-5">Date / Bill</th><th className="px-8 py-5">Customer</th><th className="px-8 py-5">Logistics</th><th className="px-8 py-5 text-right">Total</th><th className="px-8 py-5 text-center">Status</th></tr>
                       </thead>
                       <tbody className="divide-y text-sm font-bold">
                          {recentSales.map(s => (
                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-8 py-5"><div className="text-slate-800">{s.date}</div><div className="text-[10px] text-slate-300 font-mono">#{s.id.slice(0,8)}</div></td>
                               <td className="px-8 py-5 text-slate-600">{s.customerName}</td>
                               <td className="px-8 py-5 text-[10px] text-slate-400 font-black uppercase">
                                  {s.shippingCarrier !== 'None' ? `${s.shippingCarrier} ${s.shippingBranch ? '/ ' + s.shippingBranch : ''}` : '-'}
                               </td>
                               <td className="px-8 py-5 text-right text-sky-600 font-black">{formatMoney(s.total)}</td>
                               <td className="px-8 py-5 text-center"><span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase ${s.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{s.status === 'Paid' ? t.pay_paid : t.pay_pending}</span></td>
                            </tr>
                          ))}
                          {recentSales.length === 0 && <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-black uppercase italic tracking-widest">No order history</td></tr>}
                       </tbody>
                    </table>
                 </div>
              </div>
            )}

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
                                  <div className={`w-10 h-10 rounded-xl ${p.color || 'bg-slate-200'} flex items-center justify-center text-white font-black`}>{p.name.charAt(0)}</div>
                                  <div><div className="text-slate-800">{p.name}</div><div className="text-[10px] text-slate-300 font-mono">SKU: {p.code}</div></div>
                               </td>
                               <td className="px-8 py-5 text-right text-slate-400">{formatMoney(p.cost)}</td>
                               <td className="px-8 py-5 text-right text-sky-600 font-black">{formatMoney(p.price)}</td>
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
                 <div className="flex justify-between items-center">
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
                                <div className={`w-12 h-12 rounded-xl ${target?.color || 'bg-slate-100'} flex items-center justify-center font-black text-white text-lg shadow-md`}>{target?.name.charAt(0) || '!'}</div>
                                <div><h4 className="font-black text-slate-800 leading-tight">{promo.name}</h4><p className="text-[10px] font-bold text-slate-400 uppercase">{target?.name || 'Item Not Found'}</p></div>
                             </div>
                             <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl">
                                {promo.tiers?.map((tier, idx) => (
                                   <div key={idx} className="flex justify-between items-center text-sm py-1 border-b border-slate-200 last:border-0">
                                      <span className="font-bold text-slate-400">{tier.minQty}+ {t.stock_unit}</span>
                                      <span className="font-black text-sky-600">{formatMoney(tier.unitPrice)}</span>
                                   </div>
                                ))}
                                {(!promo.tiers || promo.tiers.length === 0) && <p className="text-xs italic text-slate-400 text-center">No tiers configured</p>}
                             </div>
                             <button onClick={()=>{setEditingPromo(promo); setIsPromoModalOpen(true);}} className="w-full mt-4 py-3 bg-slate-100 rounded-xl text-xs font-black text-slate-600 hover:bg-sky-600 hover:text-white transition-all">EDIT PROMO</button>
                          </div>
                       );
                    })}
                 </div>
              </div>
            )}

            {mode === AppMode.SETTINGS && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
                 {/* SHOP PROFILE */}
                 <Card>
                    <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-8 flex items-center gap-2 border-b pb-4"><Settings size={16}/> {t.menu_settings}</h4>
                    <div className="space-y-5">
                       {/* Connection Status Panel */}
                       <div className={`p-4 rounded-2xl border flex items-center gap-4 ${db ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                          <div className={`p-3 rounded-full ${db ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                             {db ? <Wifi size={20}/> : <WifiOff size={20}/>}
                          </div>
                          <div className="flex-1">
                             <p className={`text-[10px] font-black uppercase tracking-widest ${db ? 'text-emerald-600' : 'text-rose-600'}`}>
                                Database Status: {db ? 'CONNECTED' : 'NOT CONNECTED'}
                             </p>
                             <p className="text-[9px] font-bold text-slate-400">
                                {db ? 'Firestore is active and listening.' : 'Please check your FIREBASE_CONFIG env.'}
                             </p>
                          </div>
                       </div>

                       <div className="flex items-center gap-6 mb-4">
                          <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] border border-slate-200 overflow-hidden flex items-center justify-center text-slate-300 shadow-inner">
                             {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <ImageIcon size={40}/>}
                          </div>
                          <div className="flex-1 space-y-3">
                             <label className="inline-flex items-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase cursor-pointer hover:bg-black transition-all shadow-xl shadow-slate-900/10">
                                <Upload size={14}/> {t.setting_logo_url}
                                <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                             </label>
                             <p className="text-[9px] text-slate-400 font-bold uppercase leading-relaxed tracking-wider px-1">Supports PNG, JPG (Max 1MB)</p>
                          </div>
                       </div>
                       <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t.setting_shop_name}</label><input value={storeProfile.name} onChange={e=>setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold focus:border-sky-500 outline-none transition-all" /></div>
                       <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t.setting_address}</label><textarea value={storeProfile.address} onChange={e=>setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold h-24 focus:border-sky-500 outline-none transition-all" placeholder="Store Address..." /></div>
                       <button onClick={()=>{localStorage.setItem('pos_profile', JSON.stringify(storeProfile)); alert('Settings Saved Locally');}} className="w-full py-5 bg-sky-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-sky-600/20 active:scale-95 transition-all"><Save size={16}/> {t.save}</button>
                    </div>
                 </Card>

                 {/* BULK FILE UPLOAD */}
                 <Card>
                    <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-8 flex items-center gap-2 border-b pb-4"><FileUp size={16}/> {t.setting_bulk}</h4>
                    <div className="space-y-6">
                       <div className="p-10 border-2 border-dashed border-slate-200 rounded-[3rem] bg-slate-50/30 flex flex-col items-center justify-center text-center group hover:border-sky-400 hover:bg-sky-50/20 transition-all duration-300">
                          <div className="p-6 bg-white shadow-xl rounded-[2rem] mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300"><FileUp size={40} className="text-sky-500"/></div>
                          <p className="text-sm font-black text-slate-800 mb-2">Upload File to Import</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-10 tracking-widest">CSV (Excel) or JSON</p>
                          
                          <label className="px-12 py-5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] cursor-pointer hover:bg-black hover:shadow-2xl active:scale-95 transition-all">
                             SELECT FILE
                             <input type="file" className="hidden" accept=".csv,.json" onChange={handleBulkFileImport} />
                          </label>
                       </div>

                       <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform"><FileDown size={80}/></div>
                          <h5 className="text-xs font-black uppercase tracking-[0.2em] text-sky-400 mb-4 flex items-center gap-2"><AlertCircle size={14}/> Need Help?</h5>
                          <p className="text-xs text-slate-400 font-bold mb-8 leading-relaxed">Don't have a file? Download our standard template to fill your products easily.</p>
                          <button onClick={downloadTemplate} className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95">
                             <FileDown size={16}/> {t.setting_download_template}
                          </button>
                       </div>

                       <div className="bg-amber-50 border border-amber-100 p-6 rounded-[2rem] flex gap-4">
                          <ShieldAlert className="text-amber-600 shrink-0" size={24}/>
                          <div>
                             <h6 className="text-[10px] font-black uppercase text-amber-800 tracking-wider mb-1">Firestore Rules Help</h6>
                             <p className="text-[9px] font-bold text-amber-700 leading-relaxed">
                               หากพบข้อผิดพลาด "Insufficient Permissions" โปรดตรวจสอบที่หน้า Firebase Console -> Firestore -> Rules แล้วตั้งค่าให้ <code className="bg-white/50 px-1">allow read, write: if true;</code> เพื่ออนุญาตให้แอปเขียนข้อมูลได้ครับ
                             </p>
                          </div>
                       </div>

                       <div className="bg-slate-50 p-6 rounded-2xl space-y-3">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">CSV Header Format:</p>
                          <code className="block text-[10px] bg-white p-3 rounded-lg border font-mono text-slate-600 truncate">name, code, price, cost, stock, category</code>
                       </div>
                    </div>
                 </Card>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- MODALS --- */}

      {/* BILL MODAL */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[500] flex items-center justify-center p-4 backdrop-blur-xl animate-in zoom-in-95">
          <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-[4rem] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/20">
             {/* Cart Panel */}
             <div className="w-full md:w-[45%] bg-slate-50 border-r flex flex-col h-full overflow-hidden">
                <div className="p-8 border-b bg-white">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><ShoppingCart className="text-sky-500"/> {t.order_create_bill}</h3>
                      <button onClick={()=>setIsBillModalOpen(false)} className="p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20}/></button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="relative"><User size={16} className="absolute top-4 left-4 text-slate-300"/><input value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full p-4 pl-12 bg-slate-50 border rounded-2xl font-bold outline-none focus:border-sky-500 transition-all" placeholder={t.order_cust_name} /></div>
                      <div className="relative"><Smartphone size={16} className="absolute top-4 left-4 text-slate-300"/><input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} className="w-full p-4 pl-12 bg-slate-50 border rounded-2xl font-bold outline-none focus:border-sky-500 transition-all" placeholder={t.order_cust_phone} /></div>
                   </div>
                   <div className="relative mb-4"><MapPin size={16} className="absolute top-4 left-4 text-slate-300"/><textarea value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} className="w-full p-4 pl-12 bg-slate-50 border rounded-2xl font-bold outline-none focus:border-sky-500 h-20 transition-all" placeholder={t.order_cust_addr} /></div>
                   <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">{t.order_carrier}</label>
                        <select value={shippingCarrier} onChange={e=>setShippingCarrier(e.target.value as LogisticsProvider)} className="w-full p-3 bg-slate-100 border rounded-xl font-bold outline-none">
                           <option value="None">None (Local Pick)</option><option value="Anuchit">Anuchit</option><option value="Meexai">Meexai</option><option value="Rungarun">Rungarun</option><option value="Other">Other</option>
                        </select>
                      </div>
                      <div><label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">{t.order_branch}</label><input value={shippingBranch} onChange={e=>setShippingBranch(e.target.value)} className="w-full p-3 bg-slate-100 border rounded-xl font-bold outline-none" placeholder="สาขา/ปลายทาง" /></div>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                   {billItems.map(it => (
                      <div key={it.id} className="flex items-center gap-4 p-4 bg-white rounded-3xl border shadow-sm">
                         <div className={`w-10 h-10 rounded-xl ${it.color} flex items-center justify-center font-black text-white`}>{it.name.charAt(0)}</div>
                         <div className="flex-1 min-w-0"><div className="text-xs font-black text-slate-800 truncate">{it.name}</div><div className="text-xs font-bold text-sky-600">{formatMoney(it.price)}</div></div>
                         <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border">
                            <button onClick={()=>updateCartQuantity(it.id, it.quantity - 1)} className="p-1 hover:text-sky-600"><Minus size={14}/></button>
                            <input type="number" className="w-12 text-center font-black bg-transparent border-none outline-none" value={it.quantity} onChange={e=>updateCartQuantity(it.id, parseInt(e.target.value)||0)} />
                            <button onClick={()=>updateCartQuantity(it.id, it.quantity + 1)} className="p-1 hover:text-sky-600"><Plus size={14}/></button>
                         </div>
                         <button onClick={()=>setBillItems(p=>p.filter(x=>x.id!==it.id))} className="p-2 text-rose-300 hover:text-rose-600"><Trash2 size={16}/></button>
                      </div>
                   ))}
                   {billItems.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-10 font-black uppercase italic py-20 tracking-widest">{t.cart_empty}</div>}
                </div>

                <div className="p-8 border-t bg-white space-y-4 shadow-2xl">
                   <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">{t.order_payment}</label>
                        <div className="flex gap-2">
                           <button onClick={()=>setPaymentMethod('Transfer')} className={`flex-1 p-2 rounded-xl border text-[10px] font-black transition-all ${paymentMethod==='Transfer' ? 'bg-sky-600 text-white border-sky-600':'bg-white text-slate-400'}`}>TRANSFER</button>
                           <button onClick={()=>setPaymentMethod('COD')} className={`flex-1 p-2 rounded-xl border text-[10px] font-black transition-all ${paymentMethod==='COD' ? 'bg-amber-600 text-white border-amber-600':'bg-white text-slate-400'}`}>COD</button>
                        </div>
                      </div>
                      <div><label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">STATUS</label>
                        <div className="flex gap-2">
                           <button onClick={()=>setPaymentStatus('Paid')} className={`flex-1 p-2 rounded-xl border text-[10px] font-black transition-all ${paymentStatus==='Paid' ? 'bg-emerald-600 text-white border-emerald-600':'bg-white text-slate-400'}`}>PAID</button>
                           <button onClick={()=>setPaymentStatus('Pending')} className={`flex-1 p-2 rounded-xl border text-[10px] font-black transition-all ${paymentStatus==='Pending' ? 'bg-rose-600 text-white border-rose-600':'bg-white text-slate-400'}`}>PENDING</button>
                        </div>
                      </div>
                   </div>
                   <div className="flex justify-between items-end border-t pt-4">
                      <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">TOTAL PAYABLE</div>
                      <div className="text-5xl font-black text-sky-600 tracking-tighter">{formatMoney(billItems.reduce((s,i)=>s+(i.price*i.quantity),0)).split(" ")[0]}</div>
                   </div>
                   <button onClick={handleCheckout} disabled={billItems.length===0} className="w-full py-6 bg-sky-600 text-white rounded-[2rem] font-black text-xl shadow-2xl hover:bg-sky-700 transition-all uppercase active:scale-95">CHECKOUT NOW</button>
                </div>
             </div>

             {/* Product Selection Panel */}
             <div className="flex-1 p-8 flex flex-col bg-white overflow-hidden">
                <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                   <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Catalog</h4>
                   <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border-2 w-full max-w-sm focus-within:border-sky-500 transition-all shadow-inner">
                      <Search className="text-slate-300" size={18} /><input value={skuSearch} onChange={e=>setSkuSearch(e.target.value)} placeholder={t.search_sku} className="bg-transparent outline-none flex-1 font-bold text-sm" />
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-4 gap-4 pr-2 custom-scrollbar">
                   {products.filter(p => !skuSearch || p.name.toLowerCase().includes(skuSearch.toLowerCase()) || p.code.includes(skuSearch)).map(p => (
                      <button key={p.id} onClick={()=>addToCart(p)} className="bg-white p-4 rounded-[2.5rem] border shadow-sm hover:border-sky-500 transition-all flex flex-col group h-fit text-left active:scale-95">
                         <div className={`w-full aspect-square rounded-[2rem] ${p.color} mb-3 flex items-center justify-center text-4xl font-black text-white shadow-lg group-hover:scale-105 transition-all`}>{p.name.charAt(0)}</div>
                         <h4 className="font-black text-slate-800 text-[11px] truncate mb-1">{p.name}</h4>
                         <div className="flex justify-between items-center mt-auto"><span className="text-sky-600 font-black text-sm">{formatMoney(p.price).split(" ")[0]}</span><span className="text-[8px] font-black text-slate-300">STK: {p.stock}</span></div>
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* PROMO MODAL */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-6 backdrop-blur-xl animate-in zoom-in-95">
          <Card className="w-full max-w-2xl p-10 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
             <button onClick={()=>setIsPromoModalOpen(false)} className="absolute top-6 right-6 p-3 bg-slate-100 rounded-full hover:bg-rose-500 hover:text-white transition-all"><X size={20}/></button>
             <h3 className="text-2xl font-black mb-8 text-slate-800 flex items-center gap-4"><Tag className="text-sky-500"/> {t.promo_tier_title}</h3>
             <form onSubmit={async (e) => {
                e.preventDefault(); const fd = new FormData(e.currentTarget);
                const tiers: PromoTier[] = [];
                for(let i=1; i<=7; i++) {
                   const q = fd.get(`qty_${i}`); const pr = fd.get(`price_${i}`);
                   if(q && pr) tiers.push({ minQty: Number(q), unitPrice: Number(pr) });
                }
                const promo: Promotion = { id: editingPromo?.id || uuidv4(), name: fd.get('name') as string, targetProductId: fd.get('productId') as string, isActive: true, tiers };
                if (db) await setDoc(doc(db, 'promotions', promo.id), promo);
                setIsPromoModalOpen(false);
             }} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                   <div><label className="text-[10px] font-black text-slate-400 uppercase">Promo Label</label><input name="name" required defaultValue={editingPromo?.name} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none focus:border-sky-500 transition-all" /></div>
                   <div><label className="text-[10px] font-black text-slate-400 uppercase">Target Item</label>
                      <select name="productId" required defaultValue={editingPromo?.targetProductId} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none focus:border-sky-500 transition-all">
                        <option value="">Select a Product...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                   </div>
                </div>
                <div className="space-y-3">
                   {Array.from({length: 7}).map((_, i) => (
                      <div key={i} className="flex gap-4 items-center bg-slate-50 p-4 rounded-3xl border border-slate-200">
                         <span className="w-12 font-black text-slate-300">Tier {i+1}</span>
                         <input name={`qty_${i+1}`} type="number" placeholder="Min Qty" defaultValue={editingPromo?.tiers?.[i]?.minQty} className="flex-1 p-3 bg-white border border-slate-100 rounded-xl font-bold text-center outline-none focus:border-sky-300" />
                         <span className="text-slate-300">→</span>
                         <input name={`price_${i+1}`} type="number" placeholder="Unit Price" defaultValue={editingPromo?.tiers?.[i]?.unitPrice} className="flex-1 p-3 bg-sky-50 border border-sky-100 rounded-xl font-black text-sky-600 text-center outline-none focus:border-sky-300" />
                      </div>
                   ))}
                </div>
                <div className="flex gap-4 pt-4"><button type="button" onClick={()=>setIsPromoModalOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs">Cancel</button><button type="submit" className="flex-[2] py-5 bg-sky-600 text-white rounded-2xl font-black text-lg shadow-xl uppercase">Save Tiers</button></div>
             </form>
          </Card>
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
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none focus:border-sky-500 transition-all" /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SKU Code</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none focus:border-sky-500 transition-all" /></div>
                <div className="grid grid-cols-2 gap-4">
                   <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cost</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none focus:border-sky-500 transition-all" /></div>
                   <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Retail Price</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-4 bg-sky-50 border-2 border-sky-100 rounded-xl font-black text-sky-600 text-xl outline-none focus:border-sky-500 transition-all" /></div>
                </div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Initial Stock</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none focus:border-sky-500 transition-all" /></div>
                <div className="flex gap-4 pt-4">
                   <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest">Cancel</button>
                   <button type="submit" className="flex-[2] py-5 bg-sky-600 text-white rounded-2xl font-black text-lg shadow-xl uppercase tracking-widest active:scale-95 transition-all">Save Product</button>
                </div>
             </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default App;
