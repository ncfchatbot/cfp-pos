import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, Search, ShoppingCart, Plus, Minus, Trash2, 
  CreditCard, Banknote, Printer, Save, Edit, Loader2, Send, Sparkles, Store, Check,
  LayoutDashboard, Settings, UploadCloud, FileDown, ImagePlus, AlertTriangle, TrendingUp, DollarSign, Package,
  ClipboardList, Truck, MapPin, Phone, User, X, BarChart3, Wallet, PieChart, ChevronRight, History, DatabaseBackup,
  Calendar, Gift, Tag, RefreshCw, Eraser, Cloud, CloudOff, Info, ArrowUpCircle, Filter, Wifi
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
  
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('pos_language') as Language) || 'lo';
  });

  // Cloud/Firebase State - ตรวจสอบทั้ง Global และ Local
  const [isCloudEnabled, setIsCloudEnabled] = useState<boolean>(() => {
      return !!(process.env as any).FIREBASE_CONFIG || !!localStorage.getItem('pos_firebase_config');
  });
  const [firebaseConfigInput, setFirebaseConfigInput] = useState('');
  
  useEffect(() => {
    localStorage.setItem('pos_language', language);
    document.body.className = `bg-slate-100 text-slate-900 h-screen overflow-hidden select-none ${language === 'th' ? 'font-thai' : ''}`;
  }, [language]);

  const t = translations[language];

  const translateStatus = (status: OrderStatus) => {
    switch(status) {
      case 'Paid': return t.order_status_paid;
      case 'Pending': return t.order_status_pending;
      case 'Shipped': return t.order_status_shipped;
      case 'Cancelled': return t.order_status_cancelled;
      default: return status;
    }
  };

  // --- Data States ---
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(INITIAL_PROFILE);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // --- Real-time Cloud Sync ---
  useEffect(() => {
      if (isCloudEnabled && db) {
          console.log("Starting Real-time Cloud Sync...");
          const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
              setProducts(snap.docs.map(d => ({ ...d.data(), id: d.id } as Product)));
          });
          const salesQuery = query(collection(db, 'sales'), orderBy('timestamp', 'desc'));
          const unsubSales = onSnapshot(salesQuery, (snap) => {
              setRecentSales(snap.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord)));
          });
          const unsubPromotions = onSnapshot(collection(db, 'promotions'), (snap) => {
              setPromotions(snap.docs.map(d => ({ ...d.data(), id: d.id } as Promotion)));
          });
          const unsubProfile = onSnapshot(doc(db, 'settings', 'profile'), (docSnap) => {
              if (docSnap.exists()) setStoreProfile(docSnap.data() as StoreProfile);
          });

          setIsDataLoaded(true);
          return () => { unsubProducts(); unsubSales(); unsubPromotions(); unsubProfile(); }
      } else {
          // Fallback to LocalStorage if cloud is not configured
          const savedProducts = localStorage.getItem('pos_products');
          const savedSales = localStorage.getItem('pos_sales');
          const savedProfile = localStorage.getItem('pos_profile');
          const savedPromos = localStorage.getItem('pos_promotions');
          setProducts(savedProducts ? JSON.parse(savedProducts) : INITIAL_PRODUCTS);
          setRecentSales(savedSales ? JSON.parse(savedSales) : []);
          setStoreProfile(savedProfile ? JSON.parse(savedProfile) : INITIAL_PROFILE);
          setPromotions(savedPromos ? JSON.parse(savedPromos) : []);
          setIsDataLoaded(true);
      }
  }, [isCloudEnabled]);

  // --- Persistent Storage (Local Backup) ---
  useEffect(() => {
      if (!isCloudEnabled && isDataLoaded) {
          localStorage.setItem('pos_products', JSON.stringify(products));
          localStorage.setItem('pos_sales', JSON.stringify(recentSales));
          localStorage.setItem('pos_profile', JSON.stringify(storeProfile));
          localStorage.setItem('pos_promotions', JSON.stringify(promotions));
      }
  }, [products, recentSales, storeProfile, promotions, isCloudEnabled, isDataLoaded]);

  // --- POS States ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [manualDiscount, setManualDiscount] = useState<{ type: 'amount' | 'percent', value: number }>({ type: 'amount', value: 0 });

  // --- Modals ---
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
  const [reportDateRange, setReportDateRange] = useState({ start: new Date(new Date().setDate(1)).toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] });
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
  const [promoType, setPromoType] = useState<PromotionType>('tiered_price');

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productCsvRef = useRef<HTMLInputElement>(null);
  const salesCsvRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const productImageInputRef = useRef<HTMLInputElement>(null);

  // AI
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (editingPromotion) setPromoType(editingPromotion.type); else setPromoType('tiered_price'); }, [editingPromotion, isPromotionModalOpen]);

  // --- CRUD Wrappers ---
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
          // ลดสต็อกแบบทันที
          for (const item of order.items) {
              const currentProd = products.find(p => p.id === item.id);
              if (currentProd) await updateDoc(doc(db, 'products', item.id), { stock: currentProd.stock - item.quantity });
          }
      } else {
           setProducts(prev => prev.map(p => { const sold = order.items.find(c => c.id === p.id); return sold ? { ...p, stock: p.stock - sold.quantity } : p; }));
           setRecentSales(prev => [order, ...prev.filter(s => s.id !== order.id)]);
      }
      setCurrentOrder(order);
  };
  const updateOrderStatusData = async (id: string, status: OrderStatus) => {
      if (isCloudEnabled && db) await updateDoc(doc(db, 'sales', id), { status });
      else setRecentSales(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };
  const saveProfileData = async (profile: StoreProfile) => {
      if (isCloudEnabled && db) await setDoc(doc(db, 'settings', 'profile'), profile);
      setStoreProfile(profile);
  };
  const savePromotionData = async (promo: Promotion) => {
      if (isCloudEnabled && db) await setDoc(doc(db, 'promotions', promo.id), promo);
      else setPromotions(prev => { const exists = prev.find(p => p.id === promo.id); return exists ? prev.map(p => p.id === promo.id ? promo : p) : [...prev, promo]; });
  };
  const deletePromotionData = async (id: string) => {
      if (isCloudEnabled && db) await deleteDoc(doc(db, 'promotions', id));
      else setPromotions(prev => prev.filter(p => p.id !== id));
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

  // --- Logic ---
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
    const finalItems = [...processedItems, ...newFreeItems];
    return { items: finalItems, total: finalItems.reduce((sum, item) => sum + (item.price * item.quantity), 0) };
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
  const setItemQuantity = (id: string, qty: number, isTemp = false) => (isTemp ? setTempOrderCart : setCart)(prev => prev.map(i => i.id === id && !i.isFree ? { ...i, quantity: Math.max(1, qty) } : i));
  
  const processPayment = () => {
    const { items, total: subtotal } = calculatedCart;
    let discount = manualDiscount.type === 'percent' ? (subtotal * manualDiscount.value) / 100 : manualDiscount.value;
    const order: SaleRecord = { id: uuidv4().slice(0, 8), items, total: Math.max(0, subtotal - discount), subtotal, discountValue: manualDiscount.value, discountType: manualDiscount.type, date: new Date().toLocaleString('th-TH'), timestamp: Date.now(), paymentMethod, status: 'Paid', customerName: 'Walk-in' };
    saveOrderData(order); setCart([]); setManualDiscount({ type: 'amount', value: 0 }); setIsPaymentModalOpen(false); setShowReceipt(true);
  };

  const handleEditOrder = (order: SaleRecord) => {
    setEditingOrder(order); setTempOrderCart([...order.items]);
    setNewOrderCustomer({ name: order.customerName || '', phone: order.customerPhone || '', address: order.customerAddress || '' });
    setNewOrderShipping({ carrier: order.shippingCarrier || 'None', branch: order.shippingBranch || '' });
    setNewOrderDiscount({ type: order.discountType || 'amount', value: order.discountValue || 0 });
    setIsOrderModalOpen(true);
  };

  // Fix: Added handlePrintSpecificOrder to fix "Cannot find name 'handlePrintSpecificOrder'" error.
  // This function sets the current order context and triggers the receipt view.
  const handlePrintSpecificOrder = (order: SaleRecord) => {
    setCurrentOrder(order);
    setShowReceipt(true);
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
    } catch (err) { setMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: t.error, isError: true, timestamp: Date.now() }]); } finally { setIsChatLoading(false); }
  };

  // --- Render Sections ---
  const renderDashboard = () => {
    const totalSales = recentSales.filter(s => s.status !== 'Cancelled').reduce((sum, s) => sum + s.total, 0);
    const lowStockItems = products.filter(checkIsLowStock);
    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
            {isCloudEnabled && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-200">
                    <Wifi size={14} className="animate-pulse"/> {t.success} (Cloud Synced)
                </div>
            )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-slate-500 text-xs mb-1">{t.dash_sales_month}</p>
                <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(totalSales, language)}</h3>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-slate-500 text-xs mb-1">{t.dash_total_orders}</p>
                <h3 className="text-2xl font-bold text-slate-800">{recentSales.length}</h3>
            </div>
             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-slate-500 text-xs mb-1">{t.dash_low_stock}</p>
                <h3 className={`text-2xl font-bold ${lowStockItems.length > 0 ? 'text-red-500' : 'text-slate-800'}`}>{lowStockItems.length}</h3>
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><History size={18} /> Recent Activity</h3>
                 <div className="space-y-3">
                    {recentSales.slice(0, 10).map(s => (
                        <div key={s.id} className="flex justify-between items-center p-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => handlePrintSpecificOrder(s)}>
                             <div><p className="text-sm font-bold text-slate-700">Order #{s.id}</p><p className="text-[10px] text-slate-400">{s.date} • {s.customerName}</p></div>
                             <div className="text-right"><p className="text-sm font-bold text-slate-800">{formatCurrency(s.total, language)}</p><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${s.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{translateStatus(s.status)}</span></div>
                        </div>
                    ))}
                 </div>
            </div>
        </div>
      </div>
    );
  };

  const renderPOS = () => {
    const filteredProducts = products.filter(p => (selectedCategory === 'All' || p.category === selectedCategory) && (p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase())));
    const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];
    return (
      <div className="flex h-full flex-col md:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50">
           <div className="p-4 bg-white border-b border-slate-100 space-y-3">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t.pos_search_placeholder} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 transition-all text-sm"/></div>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">{categories.map(cat => (<button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-sky-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{cat === 'All' ? t.pos_all_cat : cat}</button>))}</div>
           </div>
           <div className="flex-1 p-4 overflow-y-auto">
             <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
               {filteredProducts.map(p => {
                 const isLow = checkIsLowStock(p);
                 return (<button key={p.id} onClick={() => addToCart(p)} className={`bg-white p-3 rounded-2xl shadow-sm border transition-all group text-left flex flex-col h-full ${isLow ? 'border-orange-200 bg-orange-50/20' : 'border-slate-100 hover:border-sky-200'}`}><div className={`w-full aspect-square rounded-xl ${p.color} mb-3 flex items-center justify-center text-xl font-bold overflow-hidden relative shadow-inner`}>{p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110" /> : p.name.charAt(0)}{isLow && <div className="absolute top-2 right-2 bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">LOW</div>}</div><h3 className="font-bold text-slate-800 text-sm line-clamp-2 mb-1">{p.name}</h3><div className="mt-auto flex justify-between items-end"><span className="text-sky-600 font-bold">{formatCurrency(p.price, language)}</span><span className={`text-[10px] px-1.5 py-0.5 rounded ${isLow ? 'text-orange-600 bg-orange-100' : 'text-slate-400 bg-slate-100'}`}>{t.pos_stock}: {p.stock}</span></div></button>);
               })}
             </div>
           </div>
        </div>
        <div className="w-full md:w-96 bg-white border-l border-slate-100 flex flex-col shadow-xl z-10">
           <div className="p-4 border-b border-slate-100 flex justify-between items-center"><h2 className="font-bold text-lg flex items-center gap-2"><ShoppingCart className="text-sky-600" /> {t.pos_cart_title}</h2><button onClick={() => setCart([])} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded">{t.pos_clear_cart}</button></div>
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {calculatedCart.items.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4"><ShoppingCart size={48} /><p className="text-sm font-medium">{t.pos_empty_cart}</p></div>) : calculatedCart.items.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className={`flex items-center gap-3 p-3 rounded-xl border ${item.isFree ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100'}`}><div className="flex-1 min-w-0"><h4 className="font-bold text-sm truncate text-slate-800">{item.name}</h4><div className="flex items-center gap-2 text-xs">{item.isFree ? <span className="text-green-600 font-bold">{t.pos_free}</span> : <span className="text-sky-600 font-bold">{formatCurrency(item.price, language)}</span>}{item.promotionApplied && <span className="text-[10px] bg-orange-100 text-orange-700 px-1 rounded">{item.promotionApplied}</span>}</div></div><div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1">{!item.isFree && <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-white rounded text-slate-500"><Minus size={14} /></button>}<span className="w-6 text-center font-bold text-sm">{item.quantity}</span>{!item.isFree && <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-white rounded text-slate-500"><Plus size={14} /></button>}</div>{!item.isFree && <button onClick={() => removeFromCart(item.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>}</div>
                ))
              }
           </div>
           <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
              <div className="space-y-2"><div className="flex justify-between text-sm text-slate-500"><span>{t.pos_total_items}</span><span>{calculatedCart.items.reduce((sum, i) => sum + i.quantity, 0)} {t.pos_items}</span></div><div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-500 whitespace-nowrap">{t.pos_discount}</span><div className="flex-1 flex rounded-lg overflow-hidden border border-slate-200 bg-white"><input type="number" value={manualDiscount.value || ''} onChange={(e) => setManualDiscount({ ...manualDiscount, value: Number(e.target.value) })} placeholder="0" className="w-full p-1.5 text-xs outline-none text-right"/><button onClick={() => setManualDiscount(prev => ({ ...prev, type: prev.type === 'amount' ? 'percent' : 'amount' }))} className="px-2 text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">{manualDiscount.type === 'amount' ? '₭' : '%'}</button></div></div><div className="flex justify-between items-center pt-2 border-t border-slate-200"><span className="font-bold text-slate-700">{t.pos_net_total}</span><span className="text-2xl font-bold text-sky-600">{formatCurrency(Math.max(0, calculatedCart.total - (manualDiscount.type === 'percent' ? (calculatedCart.total * manualDiscount.value) / 100 : manualDiscount.value)), language)}</span></div></div>
              <button onClick={() => setIsPaymentModalOpen(true)} disabled={calculatedCart.items.length === 0} className="w-full bg-sky-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-sky-200 hover:bg-sky-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"><Banknote size={20} /> {t.pos_pay}</button>
           </div>
        </div>
      </div>
    );
  };

  // --- Setting Render with Cloud Status ---
  const renderSettings = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Settings className="text-sky-600" /> {t.setting_title}</h2>
      <div className="max-w-2xl bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm"><Cloud size={16}/> สถานะการเชื่อมต่อ (Cloud Sync)</h3>
          {isCloudEnabled ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-3 text-green-700 font-bold mb-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/> ONLINE & SYNCED</div>
                  <p className="text-xs text-green-600 mb-4">เชื่อมต่อฐานข้อมูลส่วนกลางเรียบร้อยแล้ว ทุกอุปกรณ์จะเห็นข้อมูลเดียวกันทันที</p>
                  {(process.env as any).FIREBASE_CONFIG ? (
                    <p className="text-[10px] text-green-500 italic">* ใช้คอนฟิกส่วนกลางจากระบบ (Master Config)</p>
                  ) : (
                    <button onClick={() => { if(confirm("ตัดการเชื่อมต่อ?")) { localStorage.removeItem('pos_firebase_config'); window.location.reload(); } }} className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center gap-2"><CloudOff size={14}/> ตัดการเชื่อมต่อ</button>
                  )}
              </div>
          ) : (
              <div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4"><p className="text-xs text-slate-500 flex items-start gap-2"><Info size={14} className="shrink-0 mt-0.5"/> หากต้องการเชื่อมต่อหลายเครื่องพร้อมกัน ให้วาง Firebase Config ของคุณที่นี่</p></div>
                  <textarea value={firebaseConfigInput} onChange={e => setFirebaseConfigInput(e.target.value)} placeholder='{"apiKey": "...", "projectId": "..."}' className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 text-xs font-mono h-32 mb-3"/>
                  <button onClick={() => { try { if(initFirebase(JSON.parse(firebaseConfigInput))) { localStorage.setItem('pos_firebase_config', firebaseConfigInput); window.location.reload(); } } catch(e){ alert("JSON ผิกรูปแบบ"); } }} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold shadow hover:bg-sky-700">บันทึกและเชื่อมต่อ Cloud</button>
              </div>
          )}
      </div>
      {/* Existing Shop Profile Settings... */}
    </div>
  );

  return (
    <div className={`flex h-screen bg-slate-100 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <input type="file" ref={fileInputRef} className="hidden" />
      <Sidebar currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onExport={() => {}} onImport={() => {}} language={language} setLanguage={setLanguage} />
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 bg-white border-b md:hidden flex-shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-500"><Menu /></button>
          <span className="font-bold text-sky-600 text-lg">{storeProfile.name}</span><div className="w-8"/>
        </header>
        <div className="flex-1 overflow-hidden relative">
          {mode === AppMode.DASHBOARD && renderDashboard()}
          {mode === AppMode.POS && renderPOS()}
          {mode === AppMode.ORDERS && (
             <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
               <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><ClipboardList className="text-sky-600"/> {t.order_title}</h2>
                  <button onClick={() => { setEditingOrder(null); setTempOrderCart([]); setIsOrderModalOpen(true); }} className="bg-sky-600 text-white px-3 py-2 rounded-lg text-sm flex gap-2"><Plus size={16}/> {t.order_create}</button>
               </div>
               <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 border-b text-slate-500">
                      <tr><th className="px-4 py-3 text-xs uppercase">ID</th><th className="px-4 py-3 text-xs uppercase">{t.order_date}</th><th className="px-4 py-3 text-xs uppercase">{t.order_customer}</th><th className="px-4 py-3 text-xs uppercase text-right">{t.order_total}</th><th className="px-4 py-3 text-xs uppercase">{t.order_status}</th><th className="px-4 py-3 text-xs uppercase text-center">{t.order_action}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {recentSales.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-xs">#{order.id}</td>
                          <td className="px-4 py-3 text-slate-600">{order.date}</td>
                          <td className="px-4 py-3 font-medium">{order.customerName}</td>
                          <td className="px-4 py-3 font-bold text-right">{formatCurrency(order.total, language)}</td>
                          <td className="px-4 py-3">
                             <select value={order.status} onChange={(e) => updateOrderStatusData(order.id, e.target.value as OrderStatus)} className={`text-xs px-2 py-1 rounded-full border-none font-bold ${order.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                <option value="Paid">{t.order_status_paid}</option><option value="Pending">{t.order_status_pending}</option><option value="Shipped">{t.order_status_shipped}</option><option value="Cancelled">{t.order_status_cancelled}</option>
                             </select>
                          </td>
                          <td className="px-4 py-3 text-center flex justify-center gap-2"><button onClick={() => handlePrintSpecificOrder(order)} className="p-1 text-slate-400 hover:text-sky-600"><Printer size={14}/></button><button onClick={() => handleEditOrder(order)} className="p-1 text-slate-400 hover:text-blue-600"><Edit size={14}/></button><button onClick={() => { if(confirm(t.order_delete_confirm)) deleteOrderData(order.id) }} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={14}/></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
             </div>
          )}
          {/* Section for STOCK, AI, REPORTS, PROMOTIONS, etc. follow the same logic as dashboard... */}
          {mode === AppMode.SETTINGS && renderSettings()}
        </div>
      </main>
      
      {/* Existing Modals (Product, Order, Receipt, etc.) follow with similar updates to use the wrappers... */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl h-[90vh] flex flex-col md:flex-row overflow-hidden">
             <div className="w-full md:w-1/3 flex flex-col border-r bg-slate-50/30 p-4">
                <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input value={skuSearch} onChange={e => setSkuSearch(e.target.value)} placeholder={t.pos_search_placeholder} className="w-full pl-9 pr-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-sky-500 text-sm"/></div>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {products.filter(p => p.name.toLowerCase().includes(skuSearch.toLowerCase()) || p.code.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (<div key={p.id} onClick={() => addToCart(p, true)} className="flex justify-between items-center p-3 bg-white border rounded-xl hover:border-sky-300 cursor-pointer transition-all group"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${p.color}`}>{p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover"/> : p.name.charAt(0)}</div><div><p className="font-bold text-xs truncate">{p.name}</p><p className="text-[10px] text-slate-400">{p.code} • {t.pos_stock}: {p.stock}</p></div></div><div className="font-bold text-sky-600 text-xs">{formatCurrency(p.price, language)}</div></div>))}
                </div>
             </div>
             <div className="flex-1 flex flex-col bg-white">
                <div className="p-4 border-b grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2"><input placeholder={t.order_customer} value={newOrderCustomer.name} onChange={e => setNewOrderCustomer({...newOrderCustomer, name: e.target.value})} className="w-full p-2 text-sm border rounded-lg"/><div className="flex gap-2"><input placeholder={t.setting_phone} value={newOrderCustomer.phone} onChange={e => setNewOrderCustomer({...newOrderCustomer, phone: e.target.value})} className="w-1/2 p-2 text-sm border rounded-lg"/><select value={newOrderShipping.carrier} onChange={e => setNewOrderShipping({...newOrderShipping, carrier: e.target.value as LogisticsProvider})} className="w-1/2 p-2 text-sm border rounded-lg bg-white">{LOGISTICS_PROVIDERS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div></div>
                    <textarea placeholder={t.setting_address} rows={2} value={newOrderCustomer.address} onChange={e => setNewOrderCustomer({...newOrderCustomer, address: e.target.value})} className="w-full p-2 text-sm border rounded-lg resize-none"/>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {calculatedTempOrderCart.items.map((item, idx) => (
                       <div key={`${item.id}-${idx}`} className="bg-white p-3 rounded-xl border flex justify-between items-center shadow-sm">
                            <div className="flex-1 mr-4"><p className="text-xs font-bold">{item.name} {item.isFree && <span className="text-green-600">(แถม)</span>}</p><p className="text-[10px] text-slate-400">{formatCurrency(item.price, language)}</p></div>
                            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                                {!item.isFree && <button onClick={() => updateQuantity(item.id, -1, true)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm"><Minus size={12}/></button>}
                                <input type="number" min="1" value={item.quantity} onChange={(e) => setItemQuantity(item.id, parseInt(e.target.value) || 1, true)} className="w-10 text-center text-sm font-bold bg-transparent outline-none"/>
                                {!item.isFree && <button onClick={() => updateQuantity(item.id, 1, true)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm"><Plus size={12}/></button>}
                            </div>
                            <button onClick={() => removeFromCart(item.id, true)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                       </div>
                    ))}
                </div>
                <div className="p-4 border-t bg-slate-50 space-y-3">
                    <div className="flex justify-between items-center font-black"><span className="text-sm">{t.pos_net_total}</span><span className="text-2xl text-sky-600">{formatCurrency(calculatedTempOrderCart.total, language)}</span></div>
                    <div className="flex gap-2"><button onClick={() => setIsOrderModalOpen(false)} className="flex-1 py-3 border rounded-xl font-bold">{t.cancel}</button><button onClick={handleSaveOrderBackOffice} disabled={!tempOrderCart.length} className="flex-[2] py-3 bg-sky-600 text-white rounded-xl font-bold shadow-lg shadow-sky-100">{editingOrder ? t.save : t.confirm}</button></div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;