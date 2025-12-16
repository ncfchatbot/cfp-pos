import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, Search, ShoppingCart, Plus, Minus, Trash2, 
  CreditCard, Banknote, Printer, Save, Edit, Loader2, Send, Sparkles, Store, Check,
  LayoutDashboard, Settings, UploadCloud, FileDown, ImagePlus, AlertTriangle, TrendingUp, DollarSign, Package,
  ClipboardList, Truck, MapPin, Phone, User, X, BarChart3, Wallet, PieChart, ChevronRight, History, DatabaseBackup,
  Calendar, Gift, Tag, RefreshCw, Eraser
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { streamResponse } from './services/gemini';
import { Message, Role, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, LogisticsProvider, Promotion, PromotionType, Language } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';

// --- Helper Functions ---
const formatCurrency = (amount: number, lang: Language) => {
  const currency = lang === 'th' ? 'THB' : (lang === 'en' ? 'USD' : 'LAK');
  return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : (lang === 'en' ? 'en-US' : 'lo-LA'), { 
    style: 'currency', 
    currency: 'LAK', 
    maximumFractionDigits: 0 
  }).format(amount);
};

const INITIAL_PRODUCTS: Product[] = [
  { id: '1', code: 'FD001', name: 'ຕຳໝາກຫຸ່ງ (Papaya Salad)', price: 25000, cost: 15000, category: 'Food', stock: 50, color: 'bg-orange-100 text-orange-800' },
  { id: '2', code: 'BV001', name: 'ເບຍລາວ (Beer Lao)', price: 15000, cost: 12000, category: 'Drink', stock: 120, color: 'bg-yellow-100 text-yellow-800' },
];

const INITIAL_PROFILE: StoreProfile = {
  name: "Sabaidee POS",
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
  
  // Language State
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('pos_language') as Language) || 'lo';
  });
  
  // Persist language
  useEffect(() => {
    localStorage.setItem('pos_language', language);
    document.body.className = `bg-slate-100 text-slate-900 h-screen overflow-hidden select-none ${language === 'th' ? 'font-thai' : ''}`;
  }, [language]);

  const t = translations[language];

  // --- Data States ---
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('pos_products');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });
  const [recentSales, setRecentSales] = useState<SaleRecord[]>(() => {
    const saved = localStorage.getItem('pos_sales');
    return saved ? JSON.parse(saved) : [];
  });
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(() => {
    const saved = localStorage.getItem('pos_profile');
    return saved ? JSON.parse(saved) : INITIAL_PROFILE;
  });
  const [promotions, setPromotions] = useState<Promotion[]>(() => {
    const saved = localStorage.getItem('pos_promotions');
    return saved ? JSON.parse(saved) : [];
  });

  // --- POS States ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // Persistence
  useEffect(() => { localStorage.setItem('pos_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('pos_sales', JSON.stringify(recentSales)); }, [recentSales]);
  useEffect(() => { localStorage.setItem('pos_profile', JSON.stringify(storeProfile)); }, [storeProfile]);
  useEffect(() => { localStorage.setItem('pos_promotions', JSON.stringify(promotions)); }, [promotions]);

  // --- Modals & Temp States ---
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qr'>('cash');
  
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<SaleRecord | null>(null);

  // Back Office Order Modal
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SaleRecord | null>(null);
  const [newOrderCustomer, setNewOrderCustomer] = useState({ name: '', phone: '', address: '' });
  const [newOrderShipping, setNewOrderShipping] = useState<{carrier: LogisticsProvider, branch: string}>({ carrier: 'None', branch: '' });
  const [tempOrderCart, setTempOrderCart] = useState<CartItem[]>([]);
  const [skuSearch, setSkuSearch] = useState('');

  // Report States
  const [reportDateRange, setReportDateRange] = useState<{start: string, end: string}>({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });

  // Promotion States
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
  const [promoType, setPromoType] = useState<PromotionType>('tiered_price');

  // File Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productCsvRef = useRef<HTMLInputElement>(null);
  const salesCsvRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // AI
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (editingPromotion) {
      setPromoType(editingPromotion.type);
    } else {
      setPromoType('tiered_price');
    }
  }, [editingPromotion, isPromotionModalOpen]);

  // --- Promotion Logic (Same as before) ---
  const calculateCartWithPromotions = (inputCart: CartItem[]): { items: CartItem[], total: number } => {
    let processedItems = inputCart.filter(item => !item.isFree).map(item => ({
      ...item,
      price: item.originalPrice || item.price,
      originalPrice: undefined,
      promotionApplied: undefined
    }));

    const activePromos = promotions.filter(p => p.isActive);
    const newFreeItems: CartItem[] = [];

    processedItems = processedItems.map(item => {
      const tieredPromo = activePromos.find(p => 
        p.type === 'tiered_price' && 
        p.targetSkus && 
        (p.targetSkus.includes(item.code) || p.targetSkus.includes(item.id))
      );

      if (tieredPromo && tieredPromo.tiers) {
        const sortedTiers = [...tieredPromo.tiers].sort((a, b) => b.minQty - a.minQty);
        const matchTier = sortedTiers.find(t => item.quantity >= t.minQty);
        
        if (matchTier) {
          const promoName = language === 'en' 
            ? `${tieredPromo.name} (Buy ${matchTier.minQty} @ ${matchTier.price})`
            : `${tieredPromo.name} (ຊື້ ${matchTier.minQty} @ ${matchTier.price})`;
            
          return {
            ...item,
            originalPrice: item.price,
            price: matchTier.price,
            promotionApplied: promoName
          };
        }
      }
      return item;
    });

    activePromos.filter(p => p.type === 'buy_x_get_y').forEach(promo => {
        processedItems.forEach(item => {
             if (promo.targetSkus && (promo.targetSkus.includes(item.code) || promo.targetSkus.includes(item.id))) {
                 if (promo.requiredQty && promo.freeSku && promo.freeQty) {
                     const sets = Math.floor(item.quantity / promo.requiredQty);
                     if (sets > 0) {
                        const freeProduct = products.find(p => p.code === promo.freeSku);
                        if (freeProduct) {
                            const promoName = language === 'en'
                              ? `${promo.name} (Buy ${promo.requiredQty} Get ${promo.freeQty})`
                              : `${promo.name} (ຊື້ ${promo.requiredQty} ແຖມ ${promo.freeQty})`;

                            newFreeItems.push({
                                ...freeProduct,
                                quantity: sets * promo.freeQty,
                                price: 0,
                                isFree: true,
                                promotionApplied: promoName
                            });
                        }
                     }
                 }
             }
        });
    });

    const mergedFreeItems: CartItem[] = [];
    newFreeItems.forEach(item => {
        const existing = mergedFreeItems.find(i => i.id === item.id && i.promotionApplied === item.promotionApplied);
        if (existing) {
            existing.quantity += item.quantity;
        } else {
            mergedFreeItems.push(item);
        }
    });

    const finalItems = [...processedItems, ...mergedFreeItems];
    const total = finalItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return { items: finalItems, total };
  };

  const calculatedCart = useMemo(() => calculateCartWithPromotions(cart), [cart, promotions, products, language]);
  const calculatedTempOrderCart = useMemo(() => calculateCartWithPromotions(tempOrderCart), [tempOrderCart, promotions, products, language]);

  // --- Actions ---
  const handlePrintReceipt = () => {
    const receiptContent = document.getElementById('receipt-content');
    if (!receiptContent) return;
    const printWindow = window.open('', '', 'width=400,height=600');
    if (!printWindow) { alert('Popup blocked'); return; }
    
    const htmlContent = `
      <!DOCTYPE html><html><head><title>Receipt</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Lao:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      <style>body{font-family:'Noto Sans Lao',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.receipt-container{padding:20px;}</style>
      <script>tailwind.config={theme:{extend:{colors:{brand:{600:'#0284c7'}}}}}</script>
      </head><body><div class="receipt-container">${receiptContent.innerHTML}</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},500);}</script></body></html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
  };

  const handlePrintSpecificOrder = (order: SaleRecord) => {
    setCurrentOrder(order);
    setShowReceipt(true);
  };

  const downloadProductTemplate = () => {
    const blob = new Blob(["code,name,price,cost,category,stock\nFD001,Demo Product,10000,5000,Food,100\n"], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'product_template.csv'; document.body.appendChild(link); link.click();
  };
  const downloadSalesTemplate = () => {
    const blob = new Blob(["date,customer_name,total,status,payment_method\n25/10/2023,John Doe,50000,Paid,cash\n"], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'sales_history_template.csv'; document.body.appendChild(link); link.click();
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
         let code, name, price, cost, category, stock;
         if (parts.length >= 6) { [code, name, price, cost, category, stock] = parts; } 
         else { [name, price, category, stock] = parts; code = uuidv4().slice(0,6).toUpperCase(); cost = '0'; }
         if (name && price) newP.push({ id: uuidv4(), code: code?.trim() || uuidv4().slice(0,6).toUpperCase(), name: name.trim(), price: Number(price) || 0, cost: Number(cost) || 0, category: category?.trim()||'General', stock: Number(stock)||0, color: 'bg-slate-100 text-slate-800' });
       }
       setProducts(prev => [...prev, ...newP]);
       alert(`${t.success}: ${newP.length}`);
    };
    reader.readAsText(file);
  };
  const handleSalesImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
       try {
           const lines = (ev.target?.result as string).split('\n');
           const newSales: SaleRecord[] = [];
           for (let i = 1; i < lines.length; i++) {
               const line = lines[i].trim(); if (!line) continue;
               const parts = line.split(',');
               if (parts.length >= 3) {
                   const [date, customer, total, status, payment] = parts;
                   if (date && total) newSales.push({ id: uuidv4().slice(0,8), items: [], total: Number(total.replace(/[^0-9.-]+/g,"")), date: date.trim(), timestamp: Date.now(), paymentMethod: (payment?.trim() as any) || 'cash', status: (status?.trim() as any) || 'Paid', customerName: customer?.trim() || 'Old Customer', shippingCarrier: 'None' });
               }
           }
           if (newSales.length > 0) { setRecentSales(prev => [...prev, ...newSales]); alert(`${t.success}: ${newSales.length}`); } else alert(t.error);
       } catch (err) { alert(t.error); }
    };
    reader.readAsText(file);
  };
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) {
      const reader = new FileReader(); reader.onloadend = () => setStoreProfile(p => ({ ...p, logoUrl: reader.result as string })); reader.readAsDataURL(file);
    }
  };
  const handleExportData = () => {
    const blob = new Blob([JSON.stringify({ products, recentSales, storeProfile, promotions }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(link); link.click();
  };
  const handleImportData = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try { const d = JSON.parse(ev.target?.result as string); if(d.products) setProducts(d.products); if(d.recentSales) setRecentSales(d.recentSales); if(d.storeProfile) setStoreProfile(d.storeProfile); if(d.promotions) setPromotions(d.promotions); alert(t.success); } catch(e){ alert(t.error); }
      }; reader.readAsText(file);
    }
  };
  const handleResetToDefaults = () => { if (confirm(t.confirm + '?')) { localStorage.clear(); window.location.reload(); } };
  const handleClearAllData = () => { if (confirm(t.confirm + '?')) { if (confirm('Permanently delete?')) { localStorage.setItem('pos_products', JSON.stringify([])); localStorage.setItem('pos_sales', JSON.stringify([])); localStorage.setItem('pos_promotions', JSON.stringify([])); localStorage.setItem('pos_profile', JSON.stringify({ name: "My Store", address: "", phone: "", logoUrl: null })); window.location.reload(); } } };

  // --- Logic ---
  const addToCart = (product: Product, isTemp = false) => {
    const setter = isTemp ? setTempOrderCart : setCart;
    setter(prev => {
      const exist = prev.find(i => i.id === product.id && !i.isFree);
      return exist ? prev.map(i => i.id === product.id && !i.isFree ? { ...i, quantity: i.quantity + 1 } : i) : [...prev, { ...product, quantity: 1 }];
    });
    if(isTemp) setSkuSearch('');
  };
  const removeFromCart = (id: string, isTemp = false) => {
    const setter = isTemp ? setTempOrderCart : setCart;
    setter(prev => prev.filter(i => i.id !== id));
  };
  const updateQuantity = (id: string, delta: number, isTemp = false) => {
    const setter = isTemp ? setTempOrderCart : setCart;
    setter(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  };
  const setItemQuantity = (id: string, qty: number, isTemp = false) => {
    const setter = isTemp ? setTempOrderCart : setCart;
    setter(prev => prev.map(item => {
      if (item.id === id && !item.isFree) return { ...item, quantity: Math.max(1, qty) };
      return item;
    }));
  };
  const processPayment = () => {
    const { items, total } = calculatedCart;
    const order: SaleRecord = { id: uuidv4().slice(0, 8), items: [...items], total: total, date: new Date().toLocaleString('th-TH'), timestamp: Date.now(), paymentMethod, status: 'Paid', shippingCarrier: 'None', customerName: 'Walk-in' };
    finalizeOrder(order); setCart([]); setIsPaymentModalOpen(false); setShowReceipt(true);
  };

  const handleEditOrder = (order: SaleRecord) => {
    setEditingOrder(order);
    setTempOrderCart([...order.items]);
    setNewOrderCustomer({
        name: order.customerName || '',
        phone: order.customerPhone || '',
        address: order.customerAddress || ''
    });
    setNewOrderShipping({
        carrier: order.shippingCarrier || 'None',
        branch: order.shippingBranch || ''
    });
    setIsOrderModalOpen(true);
  };

  const handleSaveOrder = () => {
    if (tempOrderCart.length === 0) return;
    const { items, total } = calculatedTempOrderCart;
    
    // Prepare the order object
    const orderData: SaleRecord = {
        id: editingOrder ? editingOrder.id : uuidv4().slice(0, 8),
        items: [...items],
        total: total,
        date: editingOrder ? editingOrder.date : new Date().toLocaleString('th-TH'),
        timestamp: editingOrder ? editingOrder.timestamp : Date.now(),
        paymentMethod: editingOrder ? editingOrder.paymentMethod : 'transfer',
        status: editingOrder ? editingOrder.status : 'Pending',
        customerName: newOrderCustomer.name || 'Unknown',
        customerPhone: newOrderCustomer.phone,
        customerAddress: newOrderCustomer.address,
        shippingCarrier: newOrderShipping.carrier,
        shippingBranch: newOrderShipping.branch
    };

    if (editingOrder) {
        // 1. Revert stock from old order
        const productsRestored = products.map(p => {
            const soldItem = editingOrder.items.find(i => i.id === p.id);
            return soldItem ? { ...p, stock: p.stock + soldItem.quantity } : p;
        });

        // 2. Deduct stock for new order (from the restored list)
        const productsFinal = productsRestored.map(p => {
             const newItem = items.find(i => i.id === p.id);
             return newItem ? { ...p, stock: p.stock - newItem.quantity } : p;
        });

        setProducts(productsFinal);
        setRecentSales(prev => prev.map(s => s.id === editingOrder.id ? orderData : s));
    } else {
        finalizeOrder(orderData); // This function deducts stock for new orders
    }
    
    // Reset states
    setEditingOrder(null);
    setTempOrderCart([]);
    setNewOrderCustomer({ name: '', phone: '', address: '' });
    setNewOrderShipping({ carrier: 'None', branch: '' });
    setSkuSearch('');
    setIsOrderModalOpen(false);
  };

  const finalizeOrder = (order: SaleRecord) => {
    setProducts(prev => prev.map(p => { const sold = order.items.find(c => c.id === p.id); return sold ? { ...p, stock: p.stock - sold.quantity } : p; }));
    setRecentSales(prev => [order, ...prev]); setCurrentOrder(order);
  };
  const updateOrderStatus = (id: string, status: OrderStatus) => {
    setRecentSales(prev => prev.map(s => s.id === id ? { ...s, status } : s));
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
          let fullText = ''; for await (const chunk of stream) { const text = (chunk as any).text; if (text) { fullText += text; setMessages(prev => prev.map(m => m.id === botId ? {...m, text: fullText} : m)); } }
       }
    } catch (err) { console.error(err); setMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: t.error, isError: true, timestamp: Date.now() }]); } finally { setIsChatLoading(false); }
  };
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault(); const formData = new FormData(e.target as HTMLFormElement);
    const newProduct: Product = { id: editingProduct ? editingProduct.id : uuidv4(), code: formData.get('code') as string, name: formData.get('name') as string, price: Number(formData.get('price')), cost: Number(formData.get('cost')), category: formData.get('category') as string, stock: Number(formData.get('stock')), color: editingProduct ? editingProduct.color : `bg-${['orange','blue','green','purple','pink'][Math.floor(Math.random()*5)]}-100 text-${['orange','blue','green','purple','pink'][Math.floor(Math.random()*5)]}-800` };
    if (editingProduct) { setProducts(prev => prev.map(p => p.id === editingProduct.id ? newProduct : p)); } else { setProducts(prev => [...prev, newProduct]); }
    setIsProductModalOpen(false); setEditingProduct(null);
  };
  const handleSavePromotion = (e: React.FormEvent) => {
      e.preventDefault(); const formData = new FormData(e.target as HTMLFormElement); const type = formData.get('type') as PromotionType;
      const targetSkus = (formData.get('targetSkus') as string)?.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) || [];
      const tiers = []; for (let i = 0; i < 7; i++) { const qty = formData.get(`minQty${i}`); const price = formData.get(`price${i}`); if (qty && price) tiers.push({ minQty: Number(qty), price: Number(price) }); }
      const newPromo: Promotion = { id: editingPromotion ? editingPromotion.id : uuidv4(), name: formData.get('name') as string, type: type, isActive: true, targetSkus: targetSkus, ...(type === 'tiered_price' ? { tiers: tiers } : { requiredQty: Number(formData.get('requiredQty')), freeSku: formData.get('freeSku') as string, freeQty: Number(formData.get('freeQty')) }) };
      if (editingPromotion) { setPromotions(prev => prev.map(p => p.id === editingPromotion.id ? newPromo : p)); } else { setPromotions(prev => [...prev, newPromo]); }
      setIsPromotionModalOpen(false); setEditingPromotion(null);
  };

  // --- Renderers ---

  const renderReports = () => {
    const filteredSales = recentSales.filter(s => {
      if (s.status === 'Cancelled') return false;
      const time = s.timestamp || new Date(s.date).getTime(); if (isNaN(time)) return false; 
      const saleDate = new Date(time); const start = new Date(reportDateRange.start); start.setHours(0,0,0,0); const end = new Date(reportDateRange.end); end.setHours(23, 59, 59, 999);
      return saleDate >= start && saleDate <= end;
    });
    const totalSales = filteredSales.reduce((sum, s) => sum + s.total, 0); const totalOrders = filteredSales.length;
    
    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><BarChart3 className="text-sky-600"/> {t.menu_reports}</h2>
        <div className="flex flex-wrap gap-4 mb-6 items-end bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
           <div><label className="text-xs font-bold text-slate-500 mb-1 block">{t.order_date}</label><input type="date" value={reportDateRange.start} onChange={e => setReportDateRange({...reportDateRange, start: e.target.value})} className="p-2 border rounded-lg text-sm bg-slate-50"/></div>
           <div><label className="text-xs font-bold text-slate-500 mb-1 block">-</label><input type="date" value={reportDateRange.end} onChange={e => setReportDateRange({...reportDateRange, end: e.target.value})} className="p-2 border rounded-lg text-sm bg-slate-50"/></div>
           <div className="text-xs text-slate-400 pb-2 ml-2">{filteredSales.length} records</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
           <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100"><p className="text-slate-500 text-xs mb-1">{t.dash_sales_month}</p><h3 className="text-2xl font-bold text-sky-600">{formatCurrency(totalSales, language)}</h3></div>
           <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100"><p className="text-slate-500 text-xs mb-1">{t.dash_total_orders}</p><h3 className="text-2xl font-bold text-slate-800">{totalOrders}</h3></div>
           <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100"><p className="text-slate-500 text-xs mb-1">AVG / Order</p><h3 className="text-2xl font-bold text-green-600">{totalOrders > 0 ? formatCurrency(totalSales / totalOrders, language) : formatCurrency(0, language)}</h3></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
             <table className="w-full text-left text-sm whitespace-nowrap">
                 <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                     <tr>
                         <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t.order_date}</th>
                         <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t.order_id}</th>
                         <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t.order_customer}</th>
                         <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t.order_total}</th>
                         <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t.dash_profit}</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredSales.map(s => { const cost = s.items.reduce((acc, i) => acc + ((i.cost || 0) * i.quantity), 0);
                        return (<tr key={s.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-500">{s.date}</td><td className="px-4 py-3 font-mono text-slate-600">#{s.id}</td><td className="px-4 py-3">{s.customerName}</td><td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(s.total, language)}</td><td className="px-4 py-3 text-right text-green-600 font-medium">{formatCurrency(s.total - cost, language)}</td></tr>)
                    })}
                    {filteredSales.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">{t.order_no_data}</td></tr>}
                 </tbody>
             </table>
        </div>
      </div>
    );
  };

  const renderPromotions = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Tag className="text-sky-600" /> {t.menu_promotions}</h2>
        <button onClick={() => { setEditingPromotion(null); setPromoType('tiered_price'); setIsPromotionModalOpen(true); }} className="bg-sky-600 text-white px-3 py-2 rounded-lg shadow-sm hover:bg-sky-700 flex gap-2 font-bold items-center text-sm"><Plus size={16} /> {t.promo_add}</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {promotions.map(promo => (
          <div key={promo.id} className={`bg-white p-4 rounded-xl border transition-all ${promo.isActive ? 'border-sky-200 shadow-sm' : 'border-slate-100 opacity-70 grayscale-[0.5] hover:grayscale-0'}`}>
             <div className="flex justify-between items-start mb-2">
                 <div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase mb-1 inline-block ${promo.type === 'tiered_price' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{promo.type === 'tiered_price' ? 'Tier Price' : 'Buy X Get Y'}</span>
                    <h3 className="font-bold text-base text-slate-800 line-clamp-1" title={promo.name}>{promo.name}</h3>
                 </div>
                 <div className="flex gap-1 shrink-0"><button onClick={() => { setEditingPromotion(promo); setIsPromotionModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-sky-600 rounded hover:bg-slate-50"><Edit size={14}/></button><button onClick={() => { if(confirm(t.stock_delete_confirm)) setPromotions(prev => prev.filter(p => p.id !== promo.id)); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-50"><Trash2 size={14}/></button></div>
             </div>
             <div className="text-xs text-slate-500 mb-3 space-y-1 bg-slate-50 p-2 rounded-lg">
                 <p className="line-clamp-2"><span className="font-bold text-slate-700">SKUs:</span> {promo.targetSkus?.join(', ') || 'All'}</p>
                 {promo.type === 'tiered_price' && (<p className="line-clamp-2"><span className="font-bold text-slate-700">Cond:</span> {promo.tiers?.map(t => `@${t.minQty} -> ${t.price}`).join(', ')}</p>)}
                 {promo.type === 'buy_x_get_y' && (<p><span className="font-bold text-slate-700">Cond:</span> Buy {promo.requiredQty} Get {promo.freeSku} x{promo.freeQty}</p>)}
             </div>
             <div className="flex items-center gap-2 pt-1">
                 <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={promo.isActive} onChange={() => setPromotions(prev => prev.map(p => p.id === promo.id ? { ...p, isActive: !p.isActive } : p))} />
                    <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-600"></div>
                 </label>
             </div>
          </div>
        ))}
        {promotions.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            <Tag size={40} className="mb-3 opacity-20"/>
            <p className="text-sm font-medium mb-3">{t.promo_no_data}</p>
            <button 
              onClick={() => { setEditingPromotion(null); setPromoType('tiered_price'); setIsPromotionModalOpen(true); }}
              className="text-sky-600 hover:text-sky-700 text-sm font-bold hover:underline flex items-center gap-1"
            >
              <Plus size={14}/> {t.promo_add}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderAI = () => (
    <div className="flex flex-col h-full bg-slate-50">
       <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-purple-600 flex items-center justify-center text-white shadow-lg"><Sparkles size={16} /></div>
          <div><h2 className="font-bold text-slate-800 text-sm">{t.ai_title}</h2><p className="text-[10px] text-slate-500">{t.ai_desc}</p></div>
       </div>
       <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (<div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4 opacity-70"><div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm"><Store size={32} className="text-sky-200" /></div><p>{t.ai_title}</p></div>)}
          {messages.map(m => (<ChatMessage key={m.id} message={m} />))}
          {isChatLoading && (<div className="flex items-center gap-2 text-slate-400 text-xs ml-4"><Loader2 size={14} className="animate-spin" /><span>{t.ai_thinking}</span></div>)}
          <div ref={messagesEndRef} />
       </div>
       <div className="p-3 bg-white border-t border-slate-200">
          <form onSubmit={handleSendMessage} className="flex gap-2 relative">
             <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={t.ai_input_placeholder} className="flex-1 pl-3 pr-10 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-100 transition-all" disabled={isChatLoading} />
             <button type="submit" disabled={!chatInput.trim() || isChatLoading} className="absolute right-1 top-1 p-1.5 bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50 disabled:bg-slate-300 transition-all"><Send size={16} /></button>
          </form>
       </div>
    </div>
  );

  const renderOrders = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><ClipboardList className="text-sky-600" /> {t.order_title}</h2>
        <button onClick={() => { setEditingOrder(null); setIsOrderModalOpen(true); }} className="bg-sky-600 text-white px-3 py-2 rounded-lg shadow-sm hover:bg-sky-700 flex gap-2 font-bold text-sm"><Plus size={16} /> {t.order_create}</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{t.order_id}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{t.order_customer}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{t.order_date}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right">{t.order_total}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{t.order_shipping}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{t.order_status}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-center">{t.order_action}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {recentSales.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-500">#{order.id}</td>
                <td className="px-4 py-3 font-medium text-slate-800"><div>{order.customerName}</div><div className="text-[10px] text-slate-400">{order.customerPhone}</div></td>
                <td className="px-4 py-3 text-slate-500">{order.date}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(order.total, language)}</td>
                <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${order.shippingCarrier !== 'None' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{order.shippingCarrier === 'None' ? 'None' : order.shippingCarrier}</span></td>
                <td className="px-4 py-3"><select value={order.status} onChange={(e) => updateOrderStatus(order.id, e.target.value as OrderStatus)} className={`text-[10px] font-bold px-2 py-1 rounded-lg border-0 outline-none cursor-pointer ${order.status === 'Paid' ? 'bg-green-100 text-green-700' : order.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' : order.status === 'Shipped' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}><option value="Pending">{t.order_status_pending}</option><option value="Paid">{t.order_status_paid}</option><option value="Shipped">{t.order_status_shipped}</option><option value="Cancelled">{t.order_status_cancelled}</option></select></td>
                <td className="px-4 py-3 text-center flex items-center justify-center gap-2">
                   <button onClick={() => handleEditOrder(order)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100" title="Edit"><Edit size={16} /></button>
                   <button onClick={() => handlePrintSpecificOrder(order)} className="p-1.5 text-slate-400 hover:text-sky-600 rounded hover:bg-slate-100" title="Print Receipt"><Printer size={16} /></button>
                </td>
              </tr>
            ))}
            {recentSales.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">{t.order_no_data}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDashboard = () => {
    const now = new Date(); const currentMonth = now.getMonth(); const currentYear = now.getFullYear();
    const monthlySales = recentSales.filter(s => { if (s.status === 'Cancelled') return false; if (s.timestamp) { const d = new Date(s.timestamp); return d.getMonth() === currentMonth && d.getFullYear() === currentYear; } return s.date.includes(`${currentMonth + 1}/${currentYear}`) || s.date.includes(now.toLocaleDateString('th-TH').slice(3)); }).reduce((sum, s) => sum + s.total, 0);
    const collectedRevenue = recentSales.filter(s => (s.status === 'Paid' || s.status === 'Shipped')).reduce((sum, s) => sum + s.total, 0);
    const grossProfit = recentSales.filter(s => (s.status === 'Paid' || s.status === 'Shipped')).reduce((sum, order) => { const orderCost = order.items.reduce((c, item) => c + ((item.cost || 0) * item.quantity), 0); return sum + (order.total - orderCost); }, 0);
    const stockValue = products.reduce((sum, p) => sum + (p.stock * (p.cost || 0)), 0);
    
    // Updated Compact KPI Card
    const KPICard = ({ title, value, sub, icon: Icon, color, bg }: any) => (
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
        <div className={`p-2.5 rounded-xl ${bg} ${color} shrink-0`}><Icon size={20} /></div>
        <div className="min-w-0">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-0.5 truncate">{title}</p>
          <h3 className={`text-lg sm:text-xl font-bold ${color} truncate`}>{value}</h3>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</p>
        </div>
      </div>
    );

    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
           <KPICard title={t.dash_sales_month} value={formatCurrency(monthlySales, language)} sub={t.dash_total_orders} icon={BarChart3} color="text-blue-600" bg="bg-blue-50" />
           <KPICard title={t.dash_cash_in} value={formatCurrency(collectedRevenue, language)} sub={t.dash_paid_only} icon={Wallet} color="text-green-600" bg="bg-green-50" />
           <KPICard title={t.dash_profit} value={formatCurrency(grossProfit, language)} sub={t.dash_sales_cost} icon={TrendingUp} color="text-indigo-600" bg="bg-indigo-50" />
           <KPICard title={t.dash_stock_value} value={formatCurrency(stockValue, language)} sub={t.dash_stock_remaining} icon={PieChart} color="text-orange-600" bg="bg-orange-50" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
           <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-72">
             <div className="p-4 border-b border-slate-100 font-bold text-slate-800 flex justify-between items-center text-sm"><span>{t.dash_best_seller}</span><TrendingUp size={16} className="text-slate-400"/></div>
             <div className="flex-1 flex items-center justify-center p-4"><div className="text-center text-slate-400"><BarChart3 size={40} className="mx-auto mb-2 opacity-20"/><p className="text-xs">No Data</p></div></div>
           </div>
           <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-72">
            <div className="p-4 border-b border-slate-100 font-bold text-slate-800 flex justify-between items-center text-sm"><span className="flex items-center gap-2 text-red-600"><AlertTriangle size={16}/> {t.dash_low_stock}</span><span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{products.filter(p=>p.stock<10).length} Items</span></div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {products.filter(p=>p.stock<10).length > 0 ? products.filter(p=>p.stock<10).map(p=>(<div key={p.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">{p.code.slice(0,2)}</div><div><p className="font-medium text-slate-800 text-sm">{p.name}</p><p className="text-[10px] text-slate-400">SKU: {p.code}</p></div></div><div className="text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded text-xs">{t.stock_remaining} {p.stock}</div></div>)) : (<div className="flex-1 flex flex-col items-center justify-center text-green-500"><Check size={32} className="mb-2"/><p className="text-xs">{t.dash_stock_ok}</p></div>)}
            </div>
           </div>
        </div>
      </div>
    );
  };

  const renderPOS = () => {
    const filteredProducts = products.filter(p => (selectedCategory === 'All' || p.category === selectedCategory) && (p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase())));
    const categories = ['All', ...new Set(products.map(p => p.category))];
    const { items: cartItems, total: cartTotal } = calculatedCart;
    
    return (
      <div className="flex flex-col md:flex-row h-full overflow-hidden bg-slate-50">
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div className="p-3 bg-white border-b border-slate-200 shadow-sm z-10">
            <div className="flex gap-3 mb-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder={t.pos_search_placeholder} className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-sky-500 bg-slate-50 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">{categories.map(cat => (<button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-sky-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{cat === 'All' ? t.pos_all_cat : cat}</button>))}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 bg-slate-100">
            {/* Improved Grid: More columns, better gap */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map(product => (
                <button key={product.id} onClick={() => addToCart(product)} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-sky-300 transition-all text-left flex flex-col h-full group relative overflow-hidden">
                  <div className={`w-full aspect-square rounded-lg mb-2 ${product.color} flex items-center justify-center text-3xl font-bold relative`}>
                    {product.name.charAt(0)}
                    <span className="absolute top-1 right-1 text-[9px] bg-white/80 px-1 rounded font-mono text-slate-500">{product.code}</span>
                  </div>
                  <div className="flex-1 flex flex-col min-w-0">
                    <h3 className="font-semibold text-slate-800 text-xs sm:text-sm line-clamp-2 leading-tight mb-1 h-8 sm:h-9" title={product.name}>{product.name}</h3>
                    <div className="mt-auto flex justify-between items-end">
                        <span className="text-sky-600 font-bold text-sm sm:text-base leading-none">{formatCurrency(product.price, language)}</span>
                        <span className={`text-[10px] ${product.stock < 10 ? 'text-red-500 font-bold' : 'text-slate-400'}`}>{t.pos_stock}: {product.stock}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="w-full md:w-80 lg:w-96 bg-white border-l border-slate-200 flex flex-col h-[40vh] md:h-full shadow-xl z-20">
           <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center">
             <h2 className="font-bold text-base flex items-center gap-2"><ShoppingCart className="text-sky-600" size={20}/> {t.pos_cart_title}</h2>
             <span className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{cartItems.length} {t.pos_items}</span>
           </div>
           <div className="flex-1 overflow-y-auto p-3 space-y-2">
             {cartItems.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className={`flex gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100 ${item.isFree ? 'border-sky-200 bg-sky-50' : ''}`}>
                 <div className={`w-10 h-10 rounded-md flex-shrink-0 flex items-center justify-center text-sm ${item.color}`}>{item.name.charAt(0)}</div>
                 <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h4 className="text-xs font-bold text-slate-700 truncate flex items-center gap-1">
                        {item.name} 
                        {item.isFree && <span className="text-[9px] bg-sky-600 text-white px-1 rounded-sm">FREE</span>}
                    </h4>
                    {item.promotionApplied && <p className="text-[9px] text-orange-500 font-medium truncate">{item.promotionApplied}</p>}
                    <div className="flex items-center gap-2">
                         <p className="text-sky-600 text-xs font-bold">{formatCurrency(item.price * item.quantity, language)}</p>
                         {item.originalPrice && <p className="text-[10px] text-slate-400 line-through">{formatCurrency(item.originalPrice * item.quantity, language)}</p>}
                    </div>
                 </div>
                 {!item.isFree && (
                 <div className="flex flex-col items-end gap-1">
                   <div className="flex items-center bg-white rounded-md border border-slate-200 h-6">
                     <button onClick={() => updateQuantity(item.id, -1)} className="w-6 flex items-center justify-center hover:bg-slate-100 text-slate-500"><Minus size={10}/></button>
                     <input type="number" min="1" value={item.quantity} onChange={(e) => setItemQuantity(item.id, parseInt(e.target.value) || 1)} className="w-8 text-center text-xs font-bold outline-none"/>
                     <button onClick={() => updateQuantity(item.id, 1)} className="w-6 flex items-center justify-center hover:bg-slate-100 text-slate-500"><Plus size={10}/></button>
                   </div>
                   <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
                 </div>
                 )}
               </div>
             ))}
             {cartItems.length === 0 && <div className="h-40 flex flex-col items-center justify-center text-slate-300"><ShoppingCart size={32} className="mb-2 opacity-50"/><p className="text-xs">{t.pos_empty_cart}</p></div>}
           </div>
           <div className="p-4 bg-white border-t border-slate-100 space-y-3">
             <div className="flex justify-between text-slate-500 text-xs"><span>{t.pos_total_items}</span><span>{formatCurrency(cartTotal, language)}</span></div>
             <div className="flex justify-between text-xl font-bold text-slate-800"><span>{t.pos_net_total}</span><span>{formatCurrency(cartTotal, language)}</span></div>
             <button onClick={() => setIsPaymentModalOpen(true)} disabled={cartItems.length === 0} className="w-full bg-sky-600 text-white py-3 rounded-xl font-bold text-base shadow-lg shadow-sky-200 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex justify-center items-center gap-2">
                <Banknote size={18}/> {t.pos_pay}
             </button>
           </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Settings className="text-sky-600" /> {t.setting_title}</h2>
      <div className="max-w-2xl bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-start gap-6 mb-6">
          <div className="flex flex-col items-center gap-2">
            <div className="w-24 h-24 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden relative group">
              {storeProfile.logoUrl ? (<img src={storeProfile.logoUrl} alt="Logo" className="w-full h-full object-cover" />) : (<Store size={32} className="text-slate-400" />)}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><button onClick={() => logoInputRef.current?.click()} className="text-white text-[10px] font-bold flex flex-col items-center"><ImagePlus size={20} className="mb-1" /> Change</button></div>
            </div>
            <input type="file" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
          </div>
          <div className="flex-1 space-y-3">
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">{t.setting_shop_name}</label><input value={storeProfile.name} onChange={(e) => setStoreProfile({ ...storeProfile, name: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 transition-all text-sm"/></div>
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">{t.setting_phone}</label><input value={storeProfile.phone} onChange={(e) => setStoreProfile({ ...storeProfile, phone: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 transition-all text-sm"/></div>
          </div>
        </div>
        <div className="mb-6"><label className="text-xs font-bold text-slate-500 mb-1 block">{t.setting_address}</label><textarea rows={3} value={storeProfile.address} onChange={(e) => setStoreProfile({ ...storeProfile, address: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 transition-all resize-none text-sm"/></div>
        <div className="mb-6"><label className="text-xs font-bold text-slate-500 mb-1 block">{t.setting_promptpay}</label><input value={storeProfile.promptPayId || ''} onChange={(e) => setStoreProfile({ ...storeProfile, promptPayId: e.target.value })} placeholder="0812345678" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 transition-all text-sm"/></div>
        <div className="border-t border-slate-100 pt-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm"><DatabaseBackup size={16} /> {t.setting_data_manage}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-sky-200 transition-colors"><h4 className="font-bold text-xs mb-1">{t.setting_import_product}</h4><p className="text-[10px] text-slate-500 mb-2">.CSV</p><div className="flex gap-2"><button onClick={() => productCsvRef.current?.click()} className="flex-1 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold hover:bg-sky-50 hover:text-sky-600">{t.file_select}</button><button onClick={downloadProductTemplate} className="px-2 py-1.5 bg-white border border-slate-200 rounded text-slate-400 hover:text-sky-600"><FileDown size={12} /></button></div><input type="file" ref={productCsvRef} onChange={handleProductImport} className="hidden" accept=".csv" /></div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-sky-200 transition-colors"><h4 className="font-bold text-xs mb-1">{t.setting_import_sales}</h4><p className="text-[10px] text-slate-500 mb-2">.CSV</p><div className="flex gap-2"><button onClick={() => salesCsvRef.current?.click()} className="flex-1 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold hover:bg-sky-50 hover:text-sky-600">{t.file_select}</button><button onClick={downloadSalesTemplate} className="px-2 py-1.5 bg-white border border-slate-200 rounded text-slate-400 hover:text-sky-600"><FileDown size={12} /></button></div><input type="file" ref={salesCsvRef} onChange={handleSalesImport} className="hidden" accept=".csv" /></div>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100">
          <h3 className="font-bold text-red-600 mb-4 flex items-center gap-2 text-sm"><AlertTriangle size={16} /> {t.setting_danger}</h3>
          <div className="space-y-2">
             <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center justify-between"><div><h4 className="font-bold text-red-700 text-xs flex items-center gap-2"><RefreshCw size={12}/> {t.setting_factory_reset}</h4><p className="text-[10px] text-red-500 mt-0.5">Default data</p></div><button onClick={handleResetToDefaults} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-colors shadow-sm">Reset</button></div>
             <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between"><div><h4 className="font-bold text-slate-700 text-xs flex items-center gap-2"><Eraser size={12}/> {t.setting_clear_all}</h4><p className="text-[10px] text-slate-500 mt-0.5">Delete all data</p></div><button onClick={handleClearAllData} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-800 hover:text-white transition-colors shadow-sm">Clear</button></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`flex h-screen bg-slate-100 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
      <Sidebar 
        currentMode={mode} 
        onModeChange={setMode} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        onExport={handleExportData} 
        onImport={handleImportData}
        language={language}
        setLanguage={setLanguage}
      />
      
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 bg-white border-b md:hidden flex-shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-500"><Menu /></button>
          <span className="font-bold text-sky-600 text-lg">{storeProfile.name}</span><div className="w-8"/>
        </header>
        <div className="flex-1 overflow-hidden relative">
          {mode === AppMode.DASHBOARD && renderDashboard()}
          {mode === AppMode.POS && renderPOS()}
          {mode === AppMode.ORDERS && renderOrders()}
          {mode === AppMode.REPORTS && renderReports()}
          {mode === AppMode.PROMOTIONS && renderPromotions()}
          {mode === AppMode.STOCK && 
            <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-bold text-slate-800">{t.stock_title}</h2>
                 <button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="bg-sky-600 text-white px-3 py-2 rounded-lg shadow-sm hover:bg-sky-700 flex gap-2 text-sm"><Plus size={16}/> {t.stock_add}</button>
               </div>
               <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
                 <table className="w-full text-left text-sm whitespace-nowrap">
                   <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">{t.stock_code}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">{t.stock_name}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right">{t.stock_cost}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right">{t.stock_price}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right">{t.stock_remaining}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-center">{t.stock_manage}</th></tr></thead>
                   <tbody className="divide-y divide-slate-50">{products.map(p=>(<tr key={p.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.code}</td><td className="px-4 py-3 font-medium text-slate-800">{p.name}</td><td className="px-4 py-3 text-right text-slate-400">{formatCurrency(p.cost || 0, language)}</td><td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(p.price, language)}</td><td className="px-4 py-3 text-right">{p.stock}</td><td className="px-4 py-3 text-center"><button onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100"><Edit size={14}/></button><button onClick={()=>{if(confirm(t.stock_delete_confirm))setProducts(prev=>prev.filter(x=>x.id!==p.id))}} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100"><Trash2 size={14}/></button></td></tr>))}</tbody>
                 </table>
               </div>
            </div>
          }
          {mode === AppMode.AI && renderAI()}
          {mode === AppMode.SETTINGS && renderSettings()}
        </div>
      </main>

      {/* Product Edit Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-in zoom-in-95">
            <h3 className="text-lg font-bold mb-4">{editingProduct ? t.stock_manage : t.stock_add}</h3>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                 <div className="col-span-1"><label className="text-xs font-bold text-slate-500 mb-1 block">{t.stock_code}</label><input name="code" required placeholder="A001" defaultValue={editingProduct?.code} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-sky-500 text-sm"/></div>
                 <div className="col-span-2"><label className="text-xs font-bold text-slate-500 mb-1 block">{t.stock_name}</label><input name="name" required placeholder="Name" defaultValue={editingProduct?.name} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-sky-500 text-sm"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <div><label className="text-xs font-bold text-red-500 mb-1 block">{t.stock_cost}</label><input name="cost" type="number" required defaultValue={editingProduct?.cost || 0} className="w-full p-2.5 border border-red-200 rounded-lg outline-none focus:ring-1 focus:ring-red-200 text-sm"/></div>
                 <div><label className="text-xs font-bold text-green-600 mb-1 block">{t.stock_price}</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-2.5 border border-green-200 rounded-lg outline-none focus:ring-1 focus:ring-green-200 text-sm"/></div>
              </div>
              <div className="flex gap-3">
                 <div className="flex-1"><label className="text-xs font-bold text-slate-500 mb-1 block">{t.stock_remaining}</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-sky-500 text-sm"/></div>
                 <div className="flex-1">
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Category</label>
                    <input name="category" list="categories" required placeholder="Category" defaultValue={editingProduct?.category || 'Food'} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-sky-500 text-sm" />
                    <datalist id="categories">{Array.from(new Set(products.map(p => p.category))).map(c => <option key={c} value={c} />)}<option value="Food" /><option value="Drink" /></datalist>
                 </div>
              </div>
              <div className="flex gap-3 pt-2"><button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm">{t.cancel}</button><button type="submit" className="flex-1 py-2.5 bg-sky-600 text-white rounded-xl shadow-lg shadow-sky-200 hover:bg-sky-700 text-sm">{t.save}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && currentOrder && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div id="receipt-content" className="p-6 bg-white text-slate-800">
              <div className="text-center mb-4 pb-4 border-b border-dashed border-slate-300">
                {storeProfile.logoUrl && <img src={storeProfile.logoUrl} className="h-12 mx-auto mb-2" alt="logo" />}
                <h2 className="text-xl font-bold">{storeProfile.name}</h2>
                <p className="text-xs text-slate-500">{storeProfile.address}</p>
                <p className="text-xs text-slate-500">Tel: {storeProfile.phone}</p>
              </div>
              <div className="text-xs mb-4">
                 <div className="flex justify-between"><span>Date:</span><span>{currentOrder.date}</span></div>
                 <div className="flex justify-between"><span>Order ID:</span><span>#{currentOrder.id}</span></div>
                 <div className="flex justify-between"><span>Customer:</span><span>{currentOrder.customerName}</span></div>
              </div>
              <div className="space-y-2 text-sm border-b border-dashed border-slate-300 pb-4 mb-4">
                {currentOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="flex-1">{item.name} {item.isFree && '(Free)'} x{item.quantity}</span>
                    <span>{formatCurrency(item.isFree ? 0 : item.price * item.quantity, language)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-bold text-lg mb-6"><span>Total</span><span>{formatCurrency(currentOrder.total, language)}</span></div>
              {storeProfile.promptPayId && (<div className="text-center mb-4 p-2 bg-slate-50 rounded"><p className="text-xs font-bold mb-1">PromptPay / QR Payment</p><p className="font-mono text-sm">{storeProfile.promptPayId}</p></div>)}
              <div className="text-center text-xs text-slate-400">Thank you</div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
               <button onClick={()=>setShowReceipt(false)} className="flex-1 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold">{t.close}</button>
               <button onClick={handlePrintReceipt} className="flex-1 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Printer size={16}/> {t.print}</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="text-center mb-6"><p className="text-slate-500 text-sm mb-1">{t.pay_total}</p><h3 className="text-4xl font-bold text-slate-800">{formatCurrency(calculatedCart.total, language)}</h3></div>
             <div className="grid grid-cols-2 gap-4 mb-8">
               <button onClick={()=>setPaymentMethod('cash')} className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='cash'?'border-sky-500 bg-sky-50 text-sky-700':'border-slate-100 text-slate-400 hover:border-slate-200'}`}><Banknote size={32}/><span className="font-bold">{t.pay_cash}</span></button>
               <button onClick={()=>setPaymentMethod('qr')} className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='qr'?'border-sky-500 bg-sky-50 text-sky-700':'border-slate-100 text-slate-400 hover:border-slate-200'}`}><CreditCard size={32}/><span className="font-bold">{t.pay_qr}</span></button>
             </div>
             <div className="space-y-3"><button onClick={processPayment} className="w-full bg-sky-600 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-sky-200 hover:bg-sky-700 active:scale-95 transition-all">{t.pay_confirm}</button><button onClick={()=>setIsPaymentModalOpen(false)} className="w-full bg-white border border-slate-200 text-slate-500 py-3.5 rounded-xl font-bold hover:bg-slate-50">{t.cancel}</button></div>
          </div>
        </div>
      )}

      {/* Promotion Edit Modal */}
      {isPromotionModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                  <h3 className="text-lg font-bold mb-4">{editingPromotion ? 'Edit Promotion' : t.promo_add}</h3>
                  <form onSubmit={handleSavePromotion} className="space-y-4">
                      <div><label className="text-xs font-bold text-slate-500 block mb-1">Name</label><input name="name" required defaultValue={editingPromotion?.name} className="w-full p-2 border rounded-lg outline-none" placeholder="e.g. Buy 10 Get 1 Free"/></div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 block mb-1">Type</label>
                              <select name="type" value={promoType} onChange={(e) => setPromoType(e.target.value as PromotionType)} className="w-full p-2 border rounded-lg outline-none">
                                  <option value="tiered_price">Tier Price (Discount)</option>
                                  <option value="buy_x_get_y">Buy X Get Y (Free Gift)</option>
                              </select>
                          </div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 block mb-1">Target SKUs</label>
                          <textarea name="targetSkus" required defaultValue={editingPromotion?.targetSkus ? editingPromotion.targetSkus.join(', ') : (editingPromotion as any)?.targetSku} className="w-full p-2 border rounded-lg outline-none h-24 text-sm font-mono" placeholder="A001, A002, B005"/>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                          <p className="text-xs font-bold text-sky-600 uppercase">Conditions</p>
                          {promoType === 'tiered_price' && (
                              <div className="border-b border-slate-200 pb-3">
                                  <p className="text-xs text-slate-400 mb-2">Max 7 Tiers</p>
                                  {Array.from({ length: 7 }).map((_, i) => (
                                      <div key={i} className="flex gap-2 mb-2 items-center">
                                          <span className="text-xs text-slate-400 w-8 text-center">{i+1}.</span>
                                          <input name={`minQty${i}`} type="number" placeholder="Min Qty" defaultValue={editingPromotion?.tiers?.[i]?.minQty} className="flex-1 p-2 text-sm border rounded-lg"/>
                                          <input name={`price${i}`} type="number" placeholder="Price/Unit" defaultValue={editingPromotion?.tiers?.[i]?.price} className="flex-1 p-2 text-sm border rounded-lg"/>
                                      </div>
                                  ))}
                              </div>
                          )}
                          {promoType === 'buy_x_get_y' && (
                              <div>
                                  <div className="flex gap-2">
                                      <input name="requiredQty" type="number" placeholder="Buy (Qty)" defaultValue={editingPromotion?.requiredQty} className="w-1/3 p-2 text-sm border rounded-lg"/>
                                      <input name="freeSku" placeholder="Free SKU" defaultValue={editingPromotion?.freeSku} className="w-1/3 p-2 text-sm border rounded-lg"/>
                                      <input name="freeQty" type="number" placeholder="Free (Qty)" defaultValue={editingPromotion?.freeQty} className="w-1/3 p-2 text-sm border rounded-lg"/>
                                  </div>
                              </div>
                          )}
                      </div>
                      <div className="flex gap-3 pt-2">
                          <button type="button" onClick={()=>setIsPromotionModalOpen(false)} className="flex-1 py-2 border rounded-xl">{t.cancel}</button>
                          <button type="submit" className="flex-1 py-2 bg-sky-600 text-white rounded-xl">{t.save}</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Create Order Modal (Back Office) */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-4xl p-6 shadow-xl h-[85vh] flex flex-col md:flex-row gap-6 animate-in zoom-in-95">
             {/* Left: Product Selection */}
             <div className="flex-1 flex flex-col border-r border-slate-100 md:pr-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-700"><Package size={20}/> {editingOrder ? 'Edit Order' : t.stock_add}</h3>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                  <input 
                    autoFocus
                    value={skuSearch}
                    onChange={e => setSkuSearch(e.target.value)}
                    placeholder={t.pos_search_placeholder}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                  />
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                   {products.filter(p => p.name.toLowerCase().includes(skuSearch.toLowerCase()) || p.code.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (
                      <div key={p.id} onClick={() => addToCart(p, true)} className="flex justify-between items-center p-3 border border-slate-100 rounded-xl hover:bg-sky-50 cursor-pointer transition-colors group">
                         <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${p.color}`}>{p.name.charAt(0)}</div>
                            <div className="min-w-0">
                               <p className="font-bold text-sm text-slate-700 truncate">{p.name}</p>
                               <p className="text-[10px] text-slate-400">{p.code} | Stock: {p.stock}</p>
                            </div>
                         </div>
                         <div className="font-bold text-sky-600 text-sm group-hover:scale-105 transition-transform">{formatCurrency(p.price, language)}</div>
                      </div>
                   ))}
                </div>
             </div>

             {/* Right: Order Info */}
             <div className="w-full md:w-80 flex flex-col">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-700"><User size={20}/> {t.order_customer}</h3>
                <div className="space-y-3 mb-4">
                   <input placeholder={t.order_customer} value={newOrderCustomer.name} onChange={e => setNewOrderCustomer({...newOrderCustomer, name: e.target.value})} className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-sky-500"/>
                   <div className="flex gap-2">
                      <input placeholder={t.setting_phone} value={newOrderCustomer.phone} onChange={e => setNewOrderCustomer({...newOrderCustomer, phone: e.target.value})} className="w-1/2 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-sky-500"/>
                      <select value={newOrderShipping.carrier} onChange={e => setNewOrderShipping({...newOrderShipping, carrier: e.target.value as LogisticsProvider})} className="w-1/2 p-2 text-sm border border-slate-200 rounded-lg outline-none bg-white">
                         {LOGISTICS_PROVIDERS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                   </div>
                   <textarea placeholder={t.setting_address} rows={2} value={newOrderCustomer.address} onChange={e => setNewOrderCustomer({...newOrderCustomer, address: e.target.value})} className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-sky-500 resize-none"/>
                </div>

                <div className="flex-1 bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col min-h-0">
                   <h4 className="font-bold text-xs text-slate-500 uppercase mb-2">{t.pos_items} ({tempOrderCart.length})</h4>
                   <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {calculatedTempOrderCart.items.map((item, idx) => (
                         <div key={`${item.id}-${idx}`} className="bg-white p-2 rounded-lg border border-slate-100 flex justify-between items-center shadow-sm">
                            <div className="min-w-0 flex-1 mr-2">
                               <p className="text-xs font-bold truncate">{item.name} {item.isFree && '(Free)'}</p>
                               <p className="text-[10px] text-slate-400">{item.quantity} x {formatCurrency(item.price, language)}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                               {!item.isFree && <button onClick={() => updateQuantity(item.id, -1, true)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><Minus size={12}/></button>}
                               <input type="number" min="1" value={item.quantity} onChange={(e) => setItemQuantity(item.id, parseInt(e.target.value) || 1, true)} className="w-12 text-center text-xs font-bold border border-slate-200 rounded mx-1 p-1 outline-none focus:border-sky-500"/>
                               {!item.isFree && <button onClick={() => updateQuantity(item.id, 1, true)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><Plus size={12}/></button>}
                            </div>
                         </div>
                      ))}
                      {tempOrderCart.length === 0 && <p className="text-center text-xs text-slate-400 py-8">{t.pos_empty_cart}</p>}
                   </div>
                   <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="flex justify-between font-bold text-lg mb-3">
                         <span>{t.pos_net_total}</span>
                         <span className="text-sky-600">{formatCurrency(calculatedTempOrderCart.total, language)}</span>
                      </div>
                      <div className="flex gap-2">
                         <button onClick={() => setIsOrderModalOpen(false)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-50">{t.cancel}</button>
                         <button onClick={handleSaveOrder} disabled={tempOrderCart.length === 0} className="flex-1 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700 disabled:opacity-50">{editingOrder ? t.save : t.confirm}</button>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;