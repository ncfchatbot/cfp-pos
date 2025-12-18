
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, Search, ShoppingCart, Plus, Minus, Trash2, 
  CreditCard, Banknote, Printer, Save, Edit, Loader2, Send, Sparkles, Store, Check,
  LayoutDashboard, Settings, UploadCloud, FileDown, ImagePlus, AlertTriangle, TrendingUp, DollarSign, Package,
  ClipboardList, Truck, MapPin, Phone, User, X, BarChart3, Wallet, PieChart, ChevronRight, History, DatabaseBackup,
  Calendar, Gift, Tag, RefreshCw, Eraser, Cloud, CloudOff, Info, ArrowUpCircle, Filter, Wifi,
  Download, Upload, Smartphone
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { streamResponse } from './services/gemini';
import { Message, Role, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, LogisticsProvider, Promotion, PromotionType, Language } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { db, initFirebase, collection, updateDoc, deleteDoc, doc, setDoc, onSnapshot, query, orderBy } from './services/firebase';

// --- Helper Functions ---
const formatCurrency = (amount: number, lang: Language) => {
  return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : (lang === 'en' ? 'en-US' : 'lo-LA'), { 
    style: 'currency', 
    currency: 'LAK', 
    maximumFractionDigits: 0 
  }).format(amount);
};

const checkIsLowStock = (product: Product): boolean => {
  const name = product.name.toLowerCase();
  const category = product.category.toLowerCase();
  if (name.includes('ถุงกาแฟ') || category.includes('ถุงกาแฟ') || name.includes('coffee bag')) return product.stock <= 100;
  if (name.includes('กระดาษกรอง') || category.includes('กระดาษกรอง') || name.includes('filter paper')) return product.stock <= 10;
  return product.stock <= 1;
};

const INITIAL_PRODUCTS: Product[] = [
  { id: '1', code: 'FD001', name: 'ຕຳໝາກຫຸ່ງ (Papaya Salad)', price: 25000, cost: 15000, category: 'Food', stock: 50, color: 'bg-orange-100 text-orange-800' },
  { id: '2', code: 'BV001', name: 'ເບຍລາວ (Beer Lao)', price: 15000, cost: 12000, category: 'Drink', stock: 120, color: 'bg-yellow-100 text-yellow-800' },
];

const INITIAL_PROFILE: StoreProfile = {
  name: "Coffee Please POS",
  address: "Vientiane, Laos",
  phone: "020-5555-9999",
  logoUrl: null
};

const LOGISTICS_PROVIDERS: { value: LogisticsProvider; label: string }[] = [
  { value: 'None', label: 'None' },
  { value: 'Anuchit', label: 'Anuchit' },
  { value: 'Meexai', label: 'Meexai' },
  { value: 'Rungarun', label: 'Rungarun' },
  { value: 'Other', label: 'Other' },
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');
  const [isCloudEnabled, setIsCloudEnabled] = useState<boolean>(() => !!(process.env as any).FIREBASE_CONFIG || !!localStorage.getItem('pos_firebase_config'));
  const [firebaseConfigInput, setFirebaseConfigInput] = useState('');
  
  useEffect(() => {
    localStorage.setItem('pos_language', language);
    document.body.className = `bg-slate-100 text-slate-900 h-screen overflow-hidden select-none ${language === 'th' ? 'font-thai' : ''}`;
  }, [language]);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const t = translations[language];

  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(INITIAL_PROFILE);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  useEffect(() => {
      if (isCloudEnabled && db) {
          const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => setProducts(snap.docs.map(d => ({ ...d.data(), id: d.id } as Product))));
          const salesQuery = query(collection(db, 'sales'), orderBy('timestamp', 'desc'));
          const unsubSales = onSnapshot(salesQuery, (snap) => setRecentSales(snap.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord))));
          const unsubPromotions = onSnapshot(collection(db, 'promotions'), (snap) => setPromotions(snap.docs.map(d => ({ ...d.data(), id: d.id } as Promotion))));
          const unsubProfile = onSnapshot(doc(db, 'settings', 'profile'), (docSnap) => { if (docSnap.exists()) setStoreProfile(docSnap.data() as StoreProfile); });
          setIsDataLoaded(true);
          return () => { unsubProducts(); unsubSales(); unsubPromotions(); unsubProfile(); }
      } else {
          setProducts(JSON.parse(localStorage.getItem('pos_products') || JSON.stringify(INITIAL_PRODUCTS)));
          setRecentSales(JSON.parse(localStorage.getItem('pos_sales') || '[]'));
          setStoreProfile(JSON.parse(localStorage.getItem('pos_profile') || JSON.stringify(INITIAL_PROFILE)));
          setPromotions(JSON.parse(localStorage.getItem('pos_promotions') || '[]'));
          setIsDataLoaded(true);
      }
  }, [isCloudEnabled]);

  useEffect(() => {
      if (!isCloudEnabled && isDataLoaded) {
          localStorage.setItem('pos_products', JSON.stringify(products));
          localStorage.setItem('pos_sales', JSON.stringify(recentSales));
          localStorage.setItem('pos_profile', JSON.stringify(storeProfile));
          localStorage.setItem('pos_promotions', JSON.stringify(promotions));
      }
  }, [products, recentSales, storeProfile, promotions, isCloudEnabled, isDataLoaded]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [manualDiscount, setManualDiscount] = useState<{ type: 'amount' | 'percent', value: number }>({ type: 'amount', value: 0 });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qr'>('cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<SaleRecord | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SaleRecord | null>(null);
  const [newOrderCustomer, setNewOrderCustomer] = useState({ name: '', phone: '', address: '' });
  const [newOrderShipping, setNewOrderShipping] = useState<{carrier: LogisticsProvider, branch: string}>({ carrier: 'None', branch: '' });
  const [tempOrderCart, setTempOrderCart] = useState<CartItem[]>([]);
  const [newOrderDiscount, setNewOrderDiscount] = useState<{ type: 'amount' | 'percent', value: number }>({ type: 'amount', value: 0 });
  const [skuSearch, setSkuSearch] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Global Refs for inputs (Moved outside conditional renders)
  const productCsvRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const productImageInputRef = useRef<HTMLInputElement>(null);

  const saveProductData = async (product: Product) => {
      if (isCloudEnabled && db) await setDoc(doc(db, 'products', product.id), product);
      else setProducts(prev => { const exists = prev.find(p => p.id === product.id); return exists ? prev.map(p => p.id === product.id ? product : p) : [...prev, product]; });
  };
  const deleteProductData = async (id: string) => {
      if (isCloudEnabled && db) await deleteDoc(doc(db, 'products', id));
      else setProducts(prev => prev.filter(p => p.id !== id));
  };
  const saveOrderData = async (order: SaleRecord) => {
      if (isCloudEnabled && db) {
          await setDoc(doc(db, 'sales', order.id), order);
          for (const item of order.items) {
              const currentProd = products.find(p => p.id === item.id);
              if (currentProd) await updateDoc(doc(db, 'products', item.id), { stock: Math.max(0, currentProd.stock - item.quantity) });
          }
      } else {
           setProducts(prev => prev.map(p => { const sold = order.items.find(c => c.id === p.id); return sold ? { ...p, stock: Math.max(0, p.stock - sold.quantity) } : p; }));
           setRecentSales(prev => [order, ...prev.filter(s => s.id !== order.id)]);
      }
      setCurrentOrder(order);
  };
  const deleteOrderData = async (id: string) => {
    const orderToDelete = recentSales.find(s => s.id === id);
    if (!orderToDelete) return;
    if (isCloudEnabled && db) {
        await deleteDoc(doc(db, 'sales', id));
        for (const item of orderToDelete.items) {
            const currentProd = products.find(p => p.id === item.id);
            if (currentProd) await updateDoc(doc(db, 'products', item.id), { stock: currentProd.stock + item.quantity });
        }
    } else {
        setProducts(prev => prev.map(p => { const soldItem = orderToDelete.items.find(i => i.id === p.id); return soldItem ? { ...p, stock: p.stock + soldItem.quantity } : p; }));
        setRecentSales(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleProductImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
       const lines = (ev.target?.result as string).split('\n');
       const newP: Product[] = [];
       for (let i=1; i<lines.length; i++) {
         const line = lines[i].trim(); if(!line) continue;
         const parts = line.split(',');
         if (parts.length >= 4) {
             const [code, name, price, cost, category, stock] = parts;
             newP.push({ 
                 id: uuidv4(), 
                 code: code?.trim() || uuidv4().slice(0,6).toUpperCase(), 
                 name: name.trim(), 
                 price: Number(price) || 0, 
                 cost: Number(cost) || 0, 
                 category: category?.trim() || 'General', 
                 stock: Number(stock) || 0, 
                 color: `bg-slate-100 text-slate-800` 
             });
         }
       }
       newP.forEach(p => saveProductData(p));
       alert(`${t.success}: ${newP.length} Items`);
       e.target.value = ''; // Clear for re-upload
    };
    reader.readAsText(file);
  };

  const calculateCartWithPromotions = (inputCart: CartItem[]) => {
    let processedItems = inputCart.filter(item => !item.isFree).map(item => ({ ...item, price: item.originalPrice || item.price, originalPrice: undefined, promotionApplied: undefined }));
    const activePromos = promotions.filter(p => p.isActive);
    const newFreeItems: CartItem[] = [];
    processedItems = processedItems.map(item => {
      const tieredPromo = activePromos.find(p => { if (p.type !== 'tiered_price') return false; if (!p.targetSkus?.length) return true; return p.targetSkus.some(sku => sku.trim().toLowerCase() === (item.code||'').toLowerCase() || sku.trim() === item.id); });
      if (tieredPromo?.tiers) {
        const matchTier = [...tieredPromo.tiers].sort((a,b)=>b.minQty-a.minQty).find(t => item.quantity >= t.minQty);
        if (matchTier) return { ...item, originalPrice: item.price, price: matchTier.price, promotionApplied: `${tieredPromo.name} (${matchTier.minQty}+)` };
      }
      return item;
    });
    activePromos.filter(p => p.type === 'buy_x_get_y').forEach(promo => {
        processedItems.forEach(item => {
             const isMatch = !promo.targetSkus?.length || promo.targetSkus.some(sku => sku.trim().toLowerCase() === (item.code||'').toLowerCase() || sku.trim() === item.id);
             if (isMatch && promo.requiredQty && promo.freeSku && promo.freeQty) {
                 const sets = Math.floor(item.quantity / promo.requiredQty);
                 const freeProduct = products.find(p => p.code.toLowerCase() === promo.freeSku!.trim().toLowerCase());
                 if (sets > 0 && freeProduct) newFreeItems.push({ ...freeProduct, quantity: sets * promo.freeQty, price: 0, isFree: true, promotionApplied: `${promo.name}` });
             }
        });
    });
    return { items: [...processedItems, ...newFreeItems], total: [...processedItems, ...newFreeItems].reduce((sum, item) => sum + (item.price * item.quantity), 0) };
  };

  const calculatedCart = useMemo(() => calculateCartWithPromotions(cart), [cart, promotions, products]);
  const calculatedTempOrderCart = useMemo(() => calculateCartWithPromotions(tempOrderCart), [tempOrderCart, promotions, products]);

  const addToCart = (product: Product, isTemp = false) => {
    const setter = isTemp ? setTempOrderCart : setCart;
    setter(prev => { const exist = prev.find(i => i.id === product.id && !i.isFree); return exist ? prev.map(i => i.id === product.id && !i.isFree ? { ...i, quantity: i.quantity + 1 } : i) : [...prev, { ...product, quantity: 1 }]; });
    if(isTemp) setSkuSearch('');
  };
  const removeFromCart = (id: string, isTemp = false) => (isTemp ? setTempOrderCart : setCart)(prev => prev.filter(i => i.id !== id));
  const updateQuantity = (id: string, delta: number, isTemp = false) => (isTemp ? setTempOrderCart : setCart)(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  
  const processPayment = () => {
    const { items, total: subtotal } = calculatedCart;
    let discount = manualDiscount.type === 'percent' ? (subtotal * manualDiscount.value) / 100 : manualDiscount.value;
    const order: SaleRecord = { id: uuidv4().slice(0, 8), items, total: Math.max(0, subtotal - discount), subtotal, discountValue: manualDiscount.value, discountType: manualDiscount.type, date: new Date().toLocaleString('th-TH'), timestamp: Date.now(), paymentMethod, status: 'Paid', customerName: 'Walk-in' };
    saveOrderData(order); setCart([]); setManualDiscount({ type: 'amount', value: 0 }); setIsPaymentModalOpen(false); setShowReceipt(true);
  };

  const handleSaveOrderBackOffice = () => {
    if (!tempOrderCart.length) return;
    const { items, total: subtotal } = calculatedTempOrderCart;
    let discount = newOrderDiscount.type === 'percent' ? (subtotal * newOrderDiscount.value) / 100 : newOrderDiscount.value;
    const orderData: SaleRecord = { id: editingOrder?.id || uuidv4().slice(0, 8), items, total: Math.max(0, subtotal - discount), subtotal, discountValue: newOrderDiscount.value, discountType: newOrderDiscount.type, date: editingOrder?.date || new Date().toLocaleString('th-TH'), timestamp: editingOrder?.timestamp || Date.now(), paymentMethod: editingOrder?.paymentMethod || 'transfer', status: editingOrder?.status || 'Pending', customerName: newOrderCustomer.name || 'Unknown', customerPhone: newOrderCustomer.phone, customerAddress: newOrderCustomer.address, shippingCarrier: newOrderShipping.carrier, shippingBranch: newOrderShipping.branch };
    saveOrderData(orderData); setIsOrderModalOpen(false); setEditingOrder(null);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault(); if (!chatInput.trim() || isChatLoading) return;
    const userMsg: Message = { id: uuidv4(), role: Role.USER, text: chatInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]); setChatInput(''); setIsChatLoading(true);
    try {
       const history = messages.map(m => ({ role: m.role === Role.USER ? 'user' : 'model', parts: [{ text: m.text }] }));
       const stream = await streamResponse(userMsg.text, mode, history);
       if (stream) {
          const botId = uuidv4(); setMessages(prev => [...prev, { id: botId, role: Role.MODEL, text: '', timestamp: Date.now() }]);
          let fullText = ''; for await (const chunk of stream) { const text = chunk.text; if (text) { fullText += text; setMessages(prev => prev.map(m => m.id === botId ? {...m, text: fullText} : m)); } }
       }
    } catch (err) { setMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: 'API Error', isError: true, timestamp: Date.now() }]); } finally { setIsChatLoading(false); }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault(); const formData = new FormData(e.target as HTMLFormElement);
    const newProduct: Product = { id: editingProduct?.id || uuidv4(), code: formData.get('code') as string, name: formData.get('name') as string, price: Number(formData.get('price')), cost: Number(formData.get('cost')), category: formData.get('category') as string, stock: Number(formData.get('stock')), color: editingProduct?.color || `bg-sky-100 text-sky-800`, imageUrl: productImagePreview || undefined };
    saveProductData(newProduct); setIsProductModalOpen(false); setEditingProduct(null); setProductImagePreview(null);
  };

  const renderDashboard = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border">
                <p className="text-slate-500 text-xs mb-1">{t.dash_sales_month}</p>
                <h3 className="text-2xl font-bold">{formatCurrency(recentSales.reduce((s,o)=>s+o.total,0), language)}</h3>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border">
                <p className="text-slate-500 text-xs mb-1">{t.dash_total_orders}</p>
                <h3 className="text-2xl font-bold">{recentSales.length}</h3>
            </div>
             <div className="bg-white p-4 rounded-xl shadow-sm border">
                <p className="text-slate-500 text-xs mb-1">{t.dash_low_stock}</p>
                <h3 className="text-2xl font-bold text-red-500">{products.filter(checkIsLowStock).length}</h3>
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl border">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><History size={18} /> Recent Orders</h3>
            <div className="space-y-3">
                {recentSales.slice(0, 5).map(s => (
                    <div key={s.id} className="flex justify-between items-center p-2 border-b last:border-0">
                        <div><p className="text-sm font-bold">#{s.id}</p><p className="text-[10px] text-slate-400">{s.date}</p></div>
                        <p className="font-bold text-sky-600">{formatCurrency(s.total, language)}</p>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );

  const renderPOS = () => {
    const filteredProducts = products.filter(p => (selectedCategory === 'All' || p.category === selectedCategory) && (p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase())));
    const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];
    return (
      <div className="flex h-full flex-col md:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50">
           <div className="p-4 bg-white border-b space-y-3">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t.pos_search_placeholder} className="w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-sky-500 text-sm"/></div>
              <div className="flex gap-2 overflow-x-auto pb-2">{categories.map(cat => (<button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${selectedCategory === cat ? 'bg-sky-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>{cat === 'All' ? t.pos_all_cat : cat}</button>))}</div>
           </div>
           <div className="flex-1 p-4 overflow-y-auto">
             <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
               {filteredProducts.map(p => (<button key={p.id} onClick={() => addToCart(p)} className="bg-white p-3 rounded-2xl shadow-sm border hover:border-sky-300 text-left flex flex-col h-full"><div className={`w-full aspect-square rounded-xl ${p.color} mb-3 flex items-center justify-center text-xl font-bold overflow-hidden`}>{p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : p.name.charAt(0)}</div><h3 className="font-bold text-slate-800 text-sm line-clamp-2 mb-1">{p.name}</h3><p className="mt-auto text-sky-600 font-bold">{formatCurrency(p.price, language)}</p></button>))}
             </div>
           </div>
        </div>
        <div className="w-full md:w-96 bg-white border-l flex flex-col shadow-xl z-10">
           <div className="p-4 border-b flex justify-between items-center"><h2 className="font-bold text-lg flex items-center gap-2"><ShoppingCart className="text-sky-600" /> {t.pos_cart_title}</h2><button onClick={() => setCart([])} className="text-xs text-red-500">{t.pos_clear_cart}</button></div>
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {calculatedCart.items.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className={`flex items-center gap-3 p-3 rounded-xl border ${item.isFree ? 'bg-green-50' : 'bg-white'}`}>
                      <div className="flex-1 min-w-0"><h4 className="font-bold text-sm truncate">{item.name}</h4><p className="text-xs text-sky-600 font-bold">{formatCurrency(item.price, language)}</p></div>
                      <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1">
                          <button onClick={() => updateQuantity(item.id, -1)} className="p-1"><Minus size={14} /></button>
                          <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} className="p-1"><Plus size={14} /></button>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                  </div>
              ))}
           </div>
           <div className="p-4 bg-slate-50 border-t space-y-3">
              <div className="flex justify-between items-center"><span className="font-bold">{t.pos_net_total}</span><span className="text-2xl font-bold text-sky-600">{formatCurrency(calculatedCart.total, language)}</span></div>
              <button onClick={() => setIsPaymentModalOpen(true)} disabled={calculatedCart.items.length === 0} className="w-full bg-sky-600 text-white py-3 rounded-xl font-bold disabled:opacity-50">{t.pos_pay}</button>
           </div>
        </div>
      </div>
    );
  };

  const renderStock = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">{t.stock_title}</h2>
            <div className="flex gap-2">
                <button onClick={() => productCsvRef.current?.click()} className="px-3 py-2 bg-white border rounded-lg text-sm flex items-center gap-2"><UploadCloud size={16}/> {t.setting_import_product}</button>
                <button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-bold">เพิ่มสินค้า</button>
            </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b text-slate-500">
                    <tr><th className="px-4 py-3 font-bold text-xs">Code</th><th className="px-4 py-3 font-bold text-xs">Name</th><th className="px-4 py-3 text-right font-bold text-xs">Price</th><th className="px-4 py-3 text-right font-bold text-xs">Stock</th><th className="px-4 py-3 text-center font-bold text-xs">Action</th></tr>
                </thead>
                <tbody className="divide-y">
                    {products.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                            <td className="px-4 py-3 font-medium">{p.name}</td>
                            <td className="px-4 py-3 text-right font-bold">{formatCurrency(p.price, language)}</td>
                            <td className="px-4 py-3 text-right"><span className={checkIsLowStock(p) ? 'text-red-500 font-bold' : ''}>{p.stock}</span></td>
                            <td className="px-4 py-3 text-center flex justify-center gap-2">
                                <button onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }} className="text-slate-400 hover:text-blue-600"><Edit size={14}/></button>
                                <button onClick={() => deleteProductData(p.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );

  const renderSettings = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Settings className="text-sky-600" /> {t.setting_title}</h2>
      <div className="max-w-3xl space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm"><Cloud size={16}/> {isCloudEnabled ? 'Cloud Synced' : 'Local Only'}</h3>
            {!isCloudEnabled && (
                <div className="space-y-3">
                    <textarea value={firebaseConfigInput} onChange={e => setFirebaseConfigInput(e.target.value)} placeholder='วาง Firebase Config JSON ที่นี่เพื่อใช้งานระบบ Cloud' className="w-full p-3 bg-slate-50 border rounded-lg text-xs font-mono h-24"/>
                    <button onClick={() => { try { initFirebase(JSON.parse(firebaseConfigInput)); localStorage.setItem('pos_firebase_config', firebaseConfigInput); window.location.reload(); } catch(e){ alert("Invalid JSON"); } }} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold">บันทึกและเชื่อมต่อ Cloud</button>
                </div>
            )}
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm"><Store size={16}/> Store Profile</h3>
            <div className="space-y-4">
               <div><label className="text-xs font-bold text-slate-500 mb-1 block">ชื่อร้าน</label><input value={storeProfile.name} onChange={e => setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm"/></div>
               <div><label className="text-xs font-bold text-slate-500 mb-1 block">ที่อยู่</label><textarea value={storeProfile.address} onChange={e => setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-2.5 border rounded-lg text-sm h-20"/></div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm"><DatabaseBackup size={16}/> {t.setting_data_manage}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => productCsvRef.current?.click()} className="p-4 border rounded-xl hover:bg-sky-50 flex flex-col items-center gap-2"><UploadCloud className="text-sky-600"/><span className="text-xs font-bold">{t.setting_import_product}</span></button>
                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="p-4 border rounded-xl hover:bg-red-50 text-red-600 flex flex-col items-center gap-2"><Trash2 /><span className="text-xs font-bold">{t.setting_clear_all}</span></button>
            </div>
          </div>
      </div>
    </div>
  );

  return (
    <div className={`flex h-screen bg-slate-100 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <Sidebar currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onExport={()=>{}} onImport={()=>{}} language={language} setLanguage={setLanguage} />
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 bg-white border-b md:hidden flex-shrink-0"><button onClick={() => setIsSidebarOpen(true)} className="p-2"><Menu /></button><span className="font-bold text-sky-600">Coffee Please</span><div className="w-8"/></header>
        <div className="flex-1 overflow-hidden">
          {mode === AppMode.DASHBOARD && renderDashboard()}
          {mode === AppMode.POS && renderPOS()}
          {mode === AppMode.STOCK && renderStock()}
          {mode === AppMode.SETTINGS && renderSettings()}
        </div>
      </main>

      {/* Global Hidden Inputs (Crucial for importing from any page) */}
      <input type="file" ref={productCsvRef} onChange={handleProductImport} className="hidden" accept=".csv" />
      <input type="file" ref={fileInputRef} className="hidden" />
      <input type="file" ref={logoInputRef} className="hidden" accept="image/*" />
      <input type="file" ref={productImageInputRef} onChange={(e) => { const f = e.target.files?.[0]; if(f){ const r = new FileReader(); r.onloadend = () => setProductImagePreview(r.result as string); r.readAsDataURL(f); } }} className="hidden" accept="image/*" />

      {/* Modals */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">{editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</h3>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="text-xs font-bold mb-1 block">ชื่อสินค้า</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-2 border rounded-lg"/></div>
                <div><label className="text-xs font-bold mb-1 block">รหัส SKU</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-2 border rounded-lg"/></div>
                <div><label className="text-xs font-bold mb-1 block">หมวดหมู่</label><input name="category" required defaultValue={editingProduct?.category} className="w-full p-2 border rounded-lg"/></div>
                <div><label className="text-xs font-bold mb-1 block">ต้นทุน</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-2 border rounded-lg"/></div>
                <div><label className="text-xs font-bold mb-1 block">ราคาขาย</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-2 border rounded-lg"/></div>
                <div><label className="text-xs font-bold mb-1 block">สต็อก</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-2 border rounded-lg"/></div>
              </div>
              <div className="flex gap-2 pt-4"><button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 p-2 border rounded-lg">ยกเลิก</button><button type="submit" className="flex-1 p-2 bg-sky-600 text-white rounded-lg font-bold">บันทึก</button></div>
            </form>
          </div>
        </div>
      )}

      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center">
             <p className="text-slate-500 mb-1">ยอดชำระทั้งหมด</p>
             <h3 className="text-4xl font-bold mb-8">{formatCurrency(calculatedCart.total, language)}</h3>
             <div className="grid grid-cols-2 gap-4 mb-8">
               <button onClick={()=>setPaymentMethod('cash')} className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 ${paymentMethod==='cash'?'border-sky-500 bg-sky-50':'border-slate-100'}`}><Banknote size={32}/><span className="font-bold">Cash</span></button>
               <button onClick={()=>setPaymentMethod('qr')} className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 ${paymentMethod==='qr'?'border-sky-500 bg-sky-50':'border-slate-100'}`}><CreditCard size={32}/><span className="font-bold">QR Code</span></button>
             </div>
             <button onClick={processPayment} className="w-full bg-sky-600 text-white py-4 rounded-2xl font-bold mb-2">ยืนยันการชำระเงิน</button>
             <button onClick={()=>setIsPaymentModalOpen(false)} className="w-full py-2 text-slate-400">ยกเลิก</button>
          </div>
        </div>
      )}

      {showReceipt && currentOrder && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-sm overflow-hidden flex flex-col">
                <div id="receipt-content" className="p-8 text-black bg-white font-mono text-sm">
                    <div className="text-center border-b border-dashed pb-4 mb-4">
                        <h2 className="text-xl font-bold">{storeProfile.name}</h2>
                        <p>{storeProfile.address}</p>
                    </div>
                    {currentOrder.items.map((it, i) => <div key={i} className="flex justify-between"><span>{it.name} x{it.quantity}</span><span>{formatCurrency(it.price*it.quantity, language)}</span></div>)}
                    <div className="border-t border-dashed mt-4 pt-4 text-right font-bold text-lg">Total: {formatCurrency(currentOrder.total, language)}</div>
                </div>
                <div className="p-4 bg-slate-50 flex gap-2"><button onClick={()=>setShowReceipt(false)} className="flex-1 p-2 bg-white border rounded">Close</button><button onClick={()=>window.print()} className="flex-1 p-2 bg-sky-600 text-white rounded font-bold">Print</button></div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
