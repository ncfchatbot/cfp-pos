
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, Search, ShoppingCart, Plus, Minus, Trash2, 
  CreditCard, Banknote, Printer, Save, Edit, Loader2, Send, Sparkles, Store, Check, Bot,
  LayoutDashboard, Settings, UploadCloud, FileDown, ImagePlus, AlertTriangle, TrendingUp, DollarSign, Package,
  ClipboardList, Truck, MapPin, Phone, User, X, BarChart3, Wallet, PieChart, ChevronRight, History, DatabaseBackup,
  Calendar, Gift, Tag, RefreshCw, Eraser, Cloud, CloudOff, Info, ArrowUpCircle, Filter, Wifi,
  Download, Upload, Smartphone, Percent, Box, TruckIcon, CheckCircle2, Clock, FileSpreadsheet, ChevronDown
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { streamResponse } from './services/gemini';
import { Message, Role, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, LogisticsProvider, Promotion, PromotionType, Language } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { db, collection, updateDoc, deleteDoc, doc, setDoc, onSnapshot, query, orderBy } from './services/firebase';

const formatCurrency = (amount: number, lang: Language) => {
  return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : (lang === 'en' ? 'en-US' : 'lo-LA'), { 
    style: 'currency', 
    currency: 'LAK', 
    maximumFractionDigits: 0 
  }).format(amount);
};

const checkIsLowStock = (product: Product): boolean => product.stock <= 5;

const INITIAL_PROFILE: StoreProfile = {
  name: "Coffee Please POS",
  address: "Vientiane, Laos",
  phone: "020-5555-9999",
  logoUrl: null
};

const ORDER_STATUS_STEPS: OrderStatus[] = [
  'Pending', 'Paid', 'Packing', 'Ready', 'Shipped', 'Delivered', 'Completed'
];

const COLORS = [
  'bg-sky-100 text-sky-600',
  'bg-amber-100 text-amber-600',
  'bg-emerald-100 text-emerald-600',
  'bg-rose-100 text-rose-600',
  'bg-purple-100 text-purple-600',
  'bg-indigo-100 text-indigo-600'
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pos_language') as Language) || 'lo');
  const [isCloudEnabled] = useState<boolean>(() => !!localStorage.getItem('pos_firebase_config'));
  
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(INITIAL_PROFILE);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Modals State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [selectedPromoType, setSelectedPromoType] = useState<PromotionType>('buy_x_get_y');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qr' | 'transfer'>('cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<SaleRecord | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('pos_language', language);
    document.body.className = `bg-slate-100 text-slate-900 h-screen overflow-hidden select-none ${language === 'th' ? 'font-thai' : ''}`;
  }, [language]);

  const t = translations[language];

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
      setProducts(JSON.parse(localStorage.getItem('pos_products') || '[]'));
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
  }, [products, recentSales, storeProfile, promotions, isDataLoaded, isCloudEnabled]);

  // Sync selectedPromoType when editingPromotion changes
  useEffect(() => {
    if (editingPromotion) {
      setSelectedPromoType(editingPromotion.type);
    } else {
      setSelectedPromoType('buy_x_get_y');
    }
  }, [editingPromotion, isPromotionModalOpen]);

  const saveProductData = async (product: Product) => {
    if (isCloudEnabled && db) await setDoc(doc(db, 'products', product.id), product);
    else {
      setProducts(prev => {
        const exists = prev.find(p => p.id === product.id);
        return exists ? prev.map(p => p.id === product.id ? product : p) : [...prev, product];
      });
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const product: Product = {
      id: editingProduct?.id || uuidv4(),
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      category: formData.get('category') as string,
      cost: Number(formData.get('cost')) || 0,
      price: Number(formData.get('price')) || 0,
      stock: Number(formData.get('stock')) || 0,
      color: editingProduct?.color || COLORS[Math.floor(Math.random() * COLORS.length)],
      imageUrl: editingProduct?.imageUrl,
    };
    await saveProductData(product);
    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  const savePromotionData = async (promo: Promotion) => {
    if (isCloudEnabled && db) await setDoc(doc(db, 'promotions', promo.id), promo);
    else {
      setPromotions(prev => {
        const exists = prev.find(p => p.id === promo.id);
        return exists ? prev.map(p => p.id === promo.id ? promo : p) : [...prev, promo];
      });
    }
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
      if (rows.length < 1) return;

      const importedProducts: Product[] = [];
      const startIdx = rows[0].toLowerCase().includes('name') ? 1 : 0;

      for (let i = startIdx; i < rows.length; i++) {
        const cols = rows[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || rows[i].split(',').map(c => c.trim());
        if (cols.length >= 2) {
          const product: Product = {
            id: uuidv4(),
            name: cols[0]?.replace(/"/g, ''),
            code: (cols[1]?.replace(/"/g, '')) || `SKU-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            category: (cols[2]?.replace(/"/g, '')) || 'General',
            cost: Number(cols[3]) || 0,
            price: Number(cols[4]) || 0,
            stock: Number(cols[5]) || 0,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
          };
          importedProducts.push(product);
          await saveProductData(product);
        }
      }
      if (!isCloudEnabled) setProducts(prev => [...prev, ...importedProducts]);
      alert(`Successfully imported ${importedProducts.length} items`);
      if (csvInputRef.current) csvInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (isCloudEnabled && db) await updateDoc(doc(db, 'sales', orderId), { status: newStatus });
    else setRecentSales(prev => prev.map(s => s.id === orderId ? { ...s, status: newStatus } : s));
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const exist = prev.find(i => i.id === product.id && !i.isFree);
      return exist ? prev.map(i => i.id === product.id && !i.isFree ? { ...i, quantity: i.quantity + 1 } : i) : [...prev, { ...product, quantity: 1 }];
    });
  };

  const calculatedCart = useMemo(() => {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    return { items: cart, total, subtotal: total };
  }, [cart]);

  // Fix: Implemented processPayment to handle order creation and stock management
  const processPayment = async () => {
    if (cart.length === 0) return;

    const orderId = uuidv4();
    const orderDate = new Date().toLocaleString(language === 'lo' ? 'lo-LA' : (language === 'th' ? 'th-TH' : 'en-US'));
    
    const newOrder: SaleRecord = {
      id: orderId,
      items: [...cart],
      total: calculatedCart.total,
      subtotal: calculatedCart.subtotal,
      date: orderDate,
      timestamp: Date.now(),
      paymentMethod: paymentMethod,
      status: 'Paid',
      customerName: 'General Customer',
    };

    try {
      if (isCloudEnabled && db) {
        // Save Order to Firebase
        await setDoc(doc(db, 'sales', orderId), newOrder);
        
        // Update stocks in Firebase
        for (const item of cart) {
          const product = products.find(p => p.id === item.id);
          if (product) {
            await updateDoc(doc(db, 'products', product.id), {
              stock: Math.max(0, product.stock - item.quantity)
            });
          }
        }
      } else {
        // Local state updates
        setRecentSales(prev => [newOrder, ...prev]);
        setProducts(prevProducts => prevProducts.map(p => {
          const cartItem = cart.find(item => item.id === p.id);
          return cartItem ? { ...p, stock: Math.max(0, p.stock - cartItem.quantity) } : p;
        }));
      }

      setCurrentOrder(newOrder);
      setCart([]);
      setIsPaymentModalOpen(false);
      setShowReceipt(true);
    } catch (error) {
      console.error("Payment Processing Error:", error);
      alert("Payment failed. Please try again.");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg: Message = { id: uuidv4(), role: Role.USER, text: chatInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role === Role.USER ? 'user' : 'model', parts: [{ text: m.text }] }));
      const stream = await streamResponse(chatInput, mode, history);
      if (stream) {
        const botId = uuidv4();
        setMessages(prev => [...prev, { id: botId, role: Role.MODEL, text: '', timestamp: Date.now() }]);
        let fullText = '';
        for await (const chunk of stream) {
          fullText += chunk.text || '';
          setMessages(prev => prev.map(m => m.id === botId ? { ...m, text: fullText } : m));
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: 'Connection failed.', isError: true, timestamp: Date.now() }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSavePromotion = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const promoType = selectedPromoType;
    
    let tiers: { minQty: number; price: number }[] = [];
    if (promoType === 'tiered_price') {
      for (let i = 1; i <= 7; i++) {
        const minQtyVal = formData.get(`tier_qty_${i}`);
        const priceVal = formData.get(`tier_price_${i}`);
        const minQty = Number(minQtyVal);
        const price = Number(priceVal);
        if (minQty > 0) tiers.push({ minQty, price });
      }
    }

    const newPromo: Promotion = {
      id: editingPromotion?.id || uuidv4(),
      name: formData.get('name') as string,
      type: promoType,
      isActive: true,
      targetSkus: (formData.get('skus') as string).split(',').map(s => s.trim()).filter(s => s !== ''),
      requiredQty: Number(formData.get('requiredQty')) || 1,
      freeQty: Number(formData.get('freeQty')) || 0,
      freeSku: formData.get('freeSku') as string,
      tiers: tiers.length > 0 ? tiers : undefined,
    };
    savePromotionData(newPromo);
    setIsPromotionModalOpen(false);
  };

  const renderDashboard = () => {
    const totalSales = recentSales.reduce((s, o) => s + o.total, 0);
    const stockValueCost = products.reduce((s, p) => s + (p.cost * p.stock), 0);
    const stockValuePotential = products.reduce((s, p) => s + (p.price * p.stock), 0);
    const lowStockCount = products.filter(checkIsLowStock).length;

    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">{t.dash_sales_month}</p>
            <h3 className="text-2xl font-bold text-sky-600 tracking-tight">{formatCurrency(totalSales, language)}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">{t.dash_stock_value}</p>
            <h3 className="text-2xl font-bold text-amber-600 tracking-tight">{formatCurrency(stockValueCost, language)}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">{t.dash_stock_potential}</p>
            <h3 className="text-2xl font-bold text-emerald-600 tracking-tight">{formatCurrency(stockValuePotential, language)}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">{t.dash_low_stock}</p>
            <h3 className={`text-2xl font-bold tracking-tight ${lowStockCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>{lowStockCount} items</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-5 flex items-center gap-2"><History size={20} className="text-sky-500" /> Recent Activity</h3>
          <div className="space-y-4">
            {recentSales.slice(0, 5).map(s => (
              <div key={s.id} className="flex justify-between items-center p-4 hover:bg-slate-50 rounded-2xl transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-sm group-hover:bg-sky-600 group-hover:text-white transition-colors">#{s.id.slice(-4)}</div>
                  <div><p className="text-sm font-bold text-slate-800">{s.customerName}</p><p className="text-[10px] text-slate-400">{s.date}</p></div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sky-600 text-sm mb-1">{formatCurrency(s.total, language)}</p>
                  <span className="text-[9px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">{s.status}</span>
                </div>
              </div>
            ))}
            {recentSales.length === 0 && (
              <div className="py-10 text-center text-slate-300 text-xs italic">No activity yet.</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPOS = () => {
    const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];
    const filteredProducts = products.filter(p => 
      (selectedCategory === 'All' || p.category === selectedCategory) &&
      (p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
      <div className="flex h-full flex-col md:flex-row overflow-hidden bg-slate-50/50">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 bg-white border-b space-y-3">
             <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
               <input 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t.pos_search_placeholder} 
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 text-sm transition-all"
               />
             </div>
             <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {categories.map(cat => (
                  <button 
                    key={cat} 
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-sky-600 text-white shadow-lg shadow-sky-200' : 'bg-white border text-slate-500 hover:bg-slate-50'}`}
                  >
                    {cat === 'All' ? t.pos_all_cat : cat}
                  </button>
                ))}
             </div>
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
             <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
               {filteredProducts.map(p => (
                 <button 
                  key={p.id} 
                  onClick={() => addToCart(p)}
                  className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 hover:border-sky-300 transition-all text-left flex flex-col h-full group"
                 >
                   <div className={`w-full aspect-square rounded-2xl ${p.color} mb-4 flex items-center justify-center text-2xl font-bold overflow-hidden group-hover:scale-105 transition-transform`}>
                     {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : p.name.charAt(0)}
                   </div>
                   <h3 className="font-bold text-slate-800 text-sm line-clamp-2 mb-1 flex-1">{p.name}</h3>
                   <div className="flex justify-between items-center mt-2">
                     <p className="text-sky-600 font-bold text-sm">{formatCurrency(p.price, language)}</p>
                     <span className="text-[10px] text-slate-300 font-mono">{p.stock}</span>
                   </div>
                 </button>
               ))}
               {filteredProducts.length === 0 && (
                 <div className="col-span-full py-20 text-center text-slate-300">No products found.</div>
               )}
             </div>
          </div>
        </div>
        <div className="w-full md:w-96 bg-white border-l flex flex-col shadow-2xl z-10">
           <div className="p-5 border-b flex justify-between items-center">
             <h2 className="font-bold text-lg flex items-center gap-2"><ShoppingCart className="text-sky-600" /> {t.pos_cart_title}</h2>
             <button onClick={() => setCart([])} className="text-[10px] text-red-500 font-bold hover:bg-red-50 px-2 py-1 rounded-lg transition-colors uppercase tracking-widest">{t.pos_clear_cart}</button>
           </div>
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-xs truncate text-slate-800">{item.name}</h4>
                        <p className="text-[10px] text-sky-600 font-bold">{formatCurrency(item.price, language)}</p>
                      </div>
                      <div className="flex items-center gap-3 bg-white rounded-xl px-2 py-1 border shadow-sm">
                          <button onClick={() => {
                            setCart(prev => prev.map((i, ix) => ix === idx ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i));
                          }} className="p-1 text-sky-600 hover:bg-sky-50 rounded"><Minus size={12} /></button>
                          <span className="w-5 text-center text-xs font-bold text-slate-700">{item.quantity}</span>
                          <button onClick={() => {
                            setCart(prev => prev.map((i, ix) => ix === idx ? { ...i, quantity: i.quantity + 1 } : i));
                          }} className="p-1 text-sky-600 hover:bg-sky-50 rounded"><Plus size={12} /></button>
                      </div>
                      <button onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                  </div>
              ))}
              {cart.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 text-center opacity-50">
                   <ShoppingCart size={48} className="mb-4" />
                   <p className="text-xs font-bold uppercase tracking-widest">Empty Cart</p>
                </div>
              )}
           </div>
           <div className="p-6 bg-white border-t space-y-4 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
              <div className="flex justify-between items-center px-1">
                <span className="font-bold text-slate-500 text-sm uppercase tracking-widest">{t.pos_net_total}</span>
                <span className="text-3xl font-bold text-sky-600 tracking-tighter">{formatCurrency(calculatedCart.total, language)}</span>
              </div>
              <button 
                onClick={() => setIsPaymentModalOpen(true)} 
                disabled={cart.length === 0} 
                className="w-full bg-sky-600 text-white py-4 rounded-2xl font-bold disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-sky-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Check size={20} /> {t.pos_pay}
              </button>
           </div>
        </div>
      </div>
    );
  };

  const renderOrders = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <h2 className="text-xl font-bold mb-8 flex items-center gap-2 text-slate-800"><ClipboardList className="text-sky-600" /> {t.menu_orders}</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {recentSales.map(order => (
                <div key={order.id} className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all">
                    <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
                        <div className="flex items-center gap-4">
                            <div className="bg-sky-50 text-sky-600 p-3 rounded-2xl"><Package size={24}/></div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-lg">Order #{order.id.slice(-6)}</h4>
                                <p className="text-xs text-slate-400 font-medium">{order.date} • {order.paymentMethod}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status:</span>
                            <select 
                                value={order.status} 
                                onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                                className="bg-sky-50 text-sky-700 text-xs font-bold px-4 py-2 rounded-xl border border-sky-100 outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer appearance-none text-center"
                            >
                                {ORDER_STATUS_STEPS.map(step => (
                                    <option key={step} value={step}>{t[`order_status_${step.toLowerCase()}` as keyof typeof t] || step}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {/* 7-Step Tracker */}
                    <div className="relative mb-10 px-2 flex items-center">
                        <div className="absolute left-0 right-0 h-1 bg-slate-100 z-0"></div>
                        <div 
                          className="absolute left-0 h-1 bg-sky-600 z-0 transition-all duration-500" 
                          style={{ width: `${(ORDER_STATUS_STEPS.indexOf(order.status) / (ORDER_STATUS_STEPS.length - 1)) * 100}%` }}
                        ></div>
                        <div className="flex justify-between w-full relative z-10">
                          {ORDER_STATUS_STEPS.map((step, idx) => {
                              const currentIdx = ORDER_STATUS_STEPS.indexOf(order.status);
                              const isPast = idx < currentIdx;
                              const isCurrent = idx === currentIdx;
                              return (
                                  <div key={step} className="flex flex-col items-center group">
                                      <div className={`
                                        w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-4
                                        ${isPast ? 'bg-sky-600 border-sky-200 text-white' : isCurrent ? 'bg-white border-sky-600 text-sky-600 scale-110 shadow-lg' : 'bg-white border-slate-100 text-slate-300'}
                                      `}>
                                          {idx === 0 && <Clock size={16}/>}
                                          {idx === 1 && <Wallet size={16}/>}
                                          {idx === 2 && <Box size={16}/>}
                                          {idx === 3 && <Package size={16}/>}
                                          {idx === 4 && <TruckIcon size={16}/>}
                                          {idx === 5 && <MapPin size={16}/>}
                                          {idx === 6 && <CheckCircle2 size={16}/>}
                                      </div>
                                  </div>
                              );
                          })}
                        </div>
                    </div>
                    <div className="border-t border-slate-50 pt-5 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer</span>
                          <span className="text-sm font-bold text-slate-700">{order.customerName}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xl font-bold text-sky-600 tracking-tight">{formatCurrency(order.total, language)}</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );

  const renderStock = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Package className="text-sky-600" /> {t.stock_title}</h2>
            <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={() => csvInputRef.current?.click()} className="flex-1 sm:flex-none bg-emerald-50 text-emerald-600 px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border border-emerald-100 transition-all hover:bg-emerald-100">
                  <FileSpreadsheet size={16}/> {t.stock_import_csv}
                </button>
                <button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="flex-1 sm:flex-none bg-sky-600 text-white px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-100 transition-all hover:bg-sky-700">
                  <Plus size={16}/> {t.stock_add}
                </button>
            </div>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">SKU Code</th>
                        <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-wider">Product Name</th>
                        <th className="px-6 py-4 text-right font-bold text-[10px] uppercase tracking-wider">Price</th>
                        <th className="px-6 py-4 text-center font-bold text-[10px] uppercase tracking-wider">In Stock</th>
                        <th className="px-6 py-4 text-center font-bold text-[10px] uppercase tracking-wider">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{p.code}</td>
                              <td className="px-6 py-4 font-bold text-slate-700">{p.name}</td>
                              <td className="px-6 py-4 text-right font-bold text-sky-600">{formatCurrency(p.price, language)}</td>
                              <td className="px-6 py-4 text-center"><span className={`px-3 py-1 rounded-full font-bold text-[10px] ${checkIsLowStock(p) ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{p.stock} units</span></td>
                              <td className="px-6 py-4"><div className="flex justify-center gap-2"><button onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }} className="p-2 text-slate-300 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-all"><Edit size={16}/></button><button onClick={() => { if (confirm('Delete product?')) setProducts(prev => prev.filter(it => it.id !== p.id)); }} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={16}/></button></div></td>
                          </tr>
                      ))}
                  </tbody>
              </table>
            </div>
        </div>
    </div>
  );

  const renderPromotions = () => {
    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Tag className="text-sky-600" /> {t.menu_promotions}</h2>
          <button onClick={() => { setEditingPromotion(null); setIsPromotionModalOpen(true); }} className="bg-sky-600 text-white px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-100 transition-all hover:bg-sky-700"><Plus size={16}/> {t.promo_add}</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {promotions.map(p => (
            <div key={p.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
              <div className={`absolute top-0 right-0 p-1 px-3 text-[8px] font-bold uppercase rounded-bl-xl ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>{p.isActive ? 'Active' : 'Disabled'}</div>
              <div className="bg-sky-50 text-sky-600 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-sky-600 group-hover:text-white transition-all"><Gift size={24} /></div>
              <h3 className="font-bold text-slate-800 text-lg mb-2">{p.name}</h3>
              <p className="text-xs text-slate-400 mb-6 uppercase tracking-wider font-bold">{p.type === 'buy_x_get_y' ? t.promo_buy_get : t.promo_tiered}</p>
              <div className="flex justify-between items-center border-t border-slate-50 pt-4"><button onClick={() => { setEditingPromotion(p); setIsPromotionModalOpen(true); }} className="text-sky-600 font-bold text-xs hover:underline">Edit Plan</button><button onClick={() => { if(confirm('Delete promotion?')) setPromotions(prev => prev.filter(it => it.id !== p.id)); }} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button></div>
            </div>
          ))}
          {promotions.length === 0 && (
            <div className="col-span-full py-24 text-center text-slate-300 opacity-50 flex flex-col items-center"><Gift size={64} className="mb-4" /><h3 className="font-bold text-slate-400 uppercase tracking-widest text-sm">{t.promo_no_data}</h3></div>
          )}
        </div>
      </div>
    );
  };

  const renderReports = () => {
    const totalSales = recentSales.reduce((s, o) => s + o.total, 0);
    const totalProfit = recentSales.reduce((s, o) => s + (o.total - o.items.reduce((acc, item) => acc + (item.cost * item.quantity), 0)), 0);
    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <h2 className="text-xl font-bold mb-8 flex items-center gap-2 text-slate-800"><BarChart3 className="text-sky-600" /> {t.menu_reports}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm"><p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Estimated Net Profit</p><h3 className="text-4xl font-bold text-sky-600 tracking-tighter mb-4">{formatCurrency(totalProfit, language)}</h3></div>
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center"><p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sales Trend (Sample)</p></div>
        </div>
      </div>
    );
  };

  const renderAI = () => (
    <div className="h-full flex flex-col bg-slate-50/50">
        <div className="p-5 border-b bg-white flex items-center justify-between shadow-sm"><h2 className="font-bold flex items-center gap-3 text-slate-800"><Bot className="text-sky-600" /> AI Consultant</h2></div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">{messages.map(m => <ChatMessage key={m.id} message={m} />)}{isChatLoading && (<div className="flex gap-3 items-center text-sky-600 text-[10px] font-bold uppercase tracking-widest bg-sky-50 w-fit px-4 py-2 rounded-2xl"><Loader2 size={14} className="animate-spin" /> Thinking...</div>)}<div ref={chatEndRef} /></div>
        <div className="p-6 bg-white border-t"><form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-3"><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask a question..." className="flex-1 p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-100 text-sm font-medium transition-all"/><button disabled={isChatLoading || !chatInput.trim()} className="bg-sky-600 text-white px-6 rounded-2xl disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sky-700 shadow-lg shadow-sky-100 transition-all flex items-center justify-center"><Send size={20}/></button></form></div>
    </div>
  );

  return (
    <div className={`flex h-screen bg-slate-100 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <input type="file" ref={csvInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
      <Sidebar currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onExport={()=>{}} onImport={() => csvInputRef.current?.click()} language={language} setLanguage={setLanguage} />
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 bg-white border-b md:hidden flex-shrink-0"><button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-500"><Menu /></button><span className="font-bold text-sky-600 tracking-tight">Coffee Please</span><div className="w-8"/></header>
        <div className="flex-1 overflow-hidden">
            {mode === AppMode.DASHBOARD && renderDashboard()}
            {mode === AppMode.POS && renderPOS()}
            {mode === AppMode.ORDERS && renderOrders()}
            {mode === AppMode.STOCK && renderStock()}
            {mode === AppMode.REPORTS && renderReports()}
            {mode === AppMode.PROMOTIONS && renderPromotions()}
            {mode === AppMode.AI && renderAI()}
            {mode === AppMode.SETTINGS && <div className="p-6">Settings coming soon</div>}
        </div>
      </main>

      {/* MODALS */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 text-center shadow-2xl"><div className="w-16 h-16 bg-sky-50 text-sky-600 rounded-3xl flex items-center justify-center mx-auto mb-6"><DollarSign size={32}/></div><p className="text-slate-400 mb-1 font-bold text-[10px] uppercase tracking-[0.2em]">Amount Due</p><h3 className="text-4xl font-bold mb-10 text-slate-800 tracking-tighter">{formatCurrency(calculatedCart.total, language)}</h3><div className="grid grid-cols-3 gap-3 mb-10"><button onClick={()=>setPaymentMethod('cash')} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='cash'?'border-sky-500 bg-sky-50 text-sky-600 shadow-lg shadow-sky-100':'border-slate-50 text-slate-400'}`}><Banknote size={24}/><span className="text-[9px] font-bold uppercase">Cash</span></button><button onClick={()=>setPaymentMethod('qr')} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='qr'?'border-sky-500 bg-sky-50 text-sky-600 shadow-lg shadow-sky-100':'border-slate-50 text-slate-400'}`}><Smartphone size={24}/><span className="text-[9px] font-bold uppercase">QR Pay</span></button><button onClick={()=>setPaymentMethod('transfer')} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='transfer'?'border-sky-500 bg-sky-50 text-sky-600 shadow-lg shadow-sky-100':'border-slate-50 text-slate-400'}`}><CreditCard size={24}/><span className="text-[9px] font-bold uppercase">Bank</span></button></div><button onClick={processPayment} className="w-full bg-sky-600 text-white py-5 rounded-[2rem] font-bold mb-4 shadow-xl shadow-sky-200 active:scale-95 transition-all text-sm uppercase tracking-widest">Process Payment</button><button onClick={()=>setIsPaymentModalOpen(false)} className="w-full py-2 text-slate-400 text-xs font-bold uppercase tracking-widest">Cancel</button></div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-slate-800">{editingProduct ? 'Edit Product' : 'Create Product'}</h3>
            <form onSubmit={handleSaveProduct} className="space-y-5">
              <div className="grid grid-cols-2 gap-4"><div className="col-span-2 space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Name</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-100 outline-none transition-all"/></div><div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">SKU</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-100 outline-none transition-all"/></div><div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cat</label><input name="category" required defaultValue={editingProduct?.category} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-100 outline-none transition-all"/></div><div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cost</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-100 outline-none transition-all"/></div><div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Price</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-100 outline-none transition-all text-sky-600"/></div><div className="col-span-2 space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Stock</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-100 outline-none transition-all"/></div></div>
              <div className="flex gap-3 pt-4"><button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-4 border-2 border-slate-100 rounded-2xl font-bold text-slate-400 text-xs uppercase tracking-widest">Discard</button><button type="submit" className="flex-2 py-4 bg-sky-600 text-white rounded-2xl font-bold shadow-lg shadow-sky-100 px-10 text-xs uppercase tracking-widest">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {isPromotionModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-slate-800">{editingPromotion ? 'Edit Promotion' : 'New Promotion'}</h3><button onClick={() => setIsPromotionModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X/></button></div>
            <form onSubmit={handleSavePromotion} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">{t.promo_name}</label><input name="name" required defaultValue={editingPromotion?.name} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none"/></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">{t.promo_type}</label><select name="type" value={selectedPromoType} onChange={(e) => setSelectedPromoType(e.target.value as PromotionType)} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none cursor-pointer"><option value="buy_x_get_y">{t.promo_buy_get}</option><option value="tiered_price">{t.promo_tiered}</option></select></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Target Product SKUs (comma separated)</label><input name="skus" placeholder="e.g. COFFEE-01, TEA-02" required defaultValue={editingPromotion?.targetSkus.join(', ')} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none"/></div>

              {selectedPromoType === 'buy_x_get_y' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-sky-50 rounded-3xl border border-sky-100">
                  <div className="space-y-1"><label className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">Buy Qty</label><input name="requiredQty" type="number" defaultValue={editingPromotion?.requiredQty} className="w-full p-3 bg-white border border-sky-100 rounded-xl text-sm font-bold outline-none"/></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">Free Qty</label><input name="freeQty" type="number" defaultValue={editingPromotion?.freeQty} className="w-full p-3 bg-white border border-sky-100 rounded-xl text-sm font-bold outline-none"/></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">Free SKU (optional)</label><input name="freeSku" defaultValue={editingPromotion?.freeSku} className="w-full p-3 bg-white border border-sky-100 rounded-xl text-sm font-bold outline-none"/></div>
                </div>
              ) : (
                <div className="p-5 bg-amber-50 rounded-3xl border border-amber-100 space-y-4">
                  <div className="flex items-center justify-between mb-2"><h4 className="text-xs font-bold text-amber-700 uppercase tracking-widest">7-Step Pricing Tiers</h4></div>
                  <div className="grid grid-cols-8 gap-3 items-center text-[9px] font-bold text-amber-600 uppercase tracking-tighter mb-2"><div className="col-span-1">Step</div><div className="col-span-3">Minimum Qty</div><div className="col-span-4">Sale Price (LAK)</div></div>
                  {[1, 2, 3, 4, 5, 6, 7].map(step => (
                    <div key={step} className="grid grid-cols-8 gap-3 items-center">
                      <div className="col-span-1 text-center font-bold text-amber-700 text-xs">{step}</div>
                      <div className="col-span-3"><input name={`tier_qty_${step}`} type="number" placeholder="Qty" defaultValue={editingPromotion?.tiers?.[step-1]?.minQty} className="w-full p-2.5 bg-white border border-amber-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500"/></div>
                      <div className="col-span-4"><input name={`tier_price_${step}`} type="number" placeholder="Price" defaultValue={editingPromotion?.tiers?.[step-1]?.price} className="w-full p-2.5 bg-white border border-amber-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 text-sky-700"/></div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-3 pt-4"><button type="button" onClick={()=>setIsPromotionModalOpen(false)} className="flex-1 py-4 border-2 border-slate-100 rounded-2xl font-bold text-slate-400 text-xs uppercase tracking-widest transition-all hover:bg-slate-50">Discard</button><button type="submit" className="flex-2 py-4 bg-sky-600 text-white rounded-2xl font-bold shadow-lg px-12 text-xs uppercase tracking-widest transition-all hover:bg-sky-700">Save Promotion</button></div>
            </form>
          </div>
        </div>
      )}

      {showReceipt && currentOrder && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-xl">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl">
                <div id="receipt-content" className="p-10 text-slate-800 bg-white font-mono text-[11px] leading-relaxed"><div className="text-center border-b-2 border-dashed border-slate-200 pb-6 mb-6">{storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-16 h-16 mx-auto mb-4 object-contain rounded-xl" /> : <div className="w-12 h-12 bg-sky-50 rounded-xl mx-auto mb-4 flex items-center justify-center text-sky-600 font-bold">CP</div>}<h2 className="text-lg font-bold uppercase tracking-widest">{storeProfile.name}</h2><p className="text-[9px] text-slate-400 max-w-[200px] mx-auto mt-2 leading-tight uppercase">{storeProfile.address}</p></div><div className="space-y-3 mb-6"><div className="flex justify-between text-[9px] text-slate-400 uppercase font-bold tracking-widest"><span>Item</span><span>Price</span></div>{currentOrder.items.map((it, i) => (<div key={i} className="flex justify-between items-start gap-4"><span className="flex-1">{it.name} <span className="text-slate-400">x{it.quantity}</span></span><span className="whitespace-nowrap font-bold">{formatCurrency(it.price * it.quantity, language)}</span></div>))}</div><div className="border-t-2 border-dashed border-slate-200 mt-6 pt-6 space-y-2"><div className="flex justify-between text-slate-400 uppercase text-[9px] font-bold"><span>Subtotal:</span><span>{formatCurrency(currentOrder.subtotal || currentOrder.total, language)}</span></div><div className="flex justify-between text-lg font-bold text-slate-900 pt-2"><span className="uppercase tracking-widest">Total:</span><span>{formatCurrency(currentOrder.total, language)}</span></div></div><div className="text-center mt-10 text-[9px] text-slate-300 font-bold uppercase tracking-[0.3em]">Thank You • ขอบพระคุณ</div></div>
                <div className="p-6 bg-slate-50 border-t flex gap-3"><button onClick={()=>setShowReceipt(false)} className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-400 text-xs uppercase tracking-widest">Close</button><button onClick={()=>window.print()} className="flex-1 py-4 bg-sky-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-sky-100">Print</button></div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
