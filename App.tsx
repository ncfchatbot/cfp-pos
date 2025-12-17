import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, Search, ShoppingCart, Plus, Minus, Trash2, 
  CreditCard, Banknote, Printer, Save, Edit, Loader2, Send, Sparkles, Store, Check,
  LayoutDashboard, Settings, UploadCloud, FileDown, ImagePlus, AlertTriangle, TrendingUp, DollarSign, Package,
  ClipboardList, Truck, MapPin, Phone, User, X, BarChart3, Wallet, PieChart, ChevronRight, History, DatabaseBackup,
  Calendar, Gift, Tag, RefreshCw, Eraser, Cloud, CloudOff, Info, ArrowUpCircle, Filter
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { streamResponse } from './services/gemini';
import { Message, Role, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, LogisticsProvider, Promotion, PromotionType, Language } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { db, initFirebase, collection, addDoc, updateDoc, deleteDoc, doc, setDoc } from './services/firebase';
import { onSnapshot } from 'firebase/firestore';

// --- Helper Functions ---
const formatCurrency = (amount: number, lang: Language) => {
  return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : (lang === 'en' ? 'en-US' : 'lo-LA'), { 
    style: 'currency', 
    currency: 'LAK', 
    maximumFractionDigits: 0 
  }).format(amount);
};

const INITIAL_PRODUCTS: Product[] = [
  { id: '1', code: 'FD001', name: 'ຕຳໝາກຫຸ່ງ (Papaya Salad)', price: 25000, cost: 15000, category: 'Food', stock: 50, color: 'bg-orange-100 text-orange-800', imageUrl: 'https://images.unsplash.com/photo-1563897539633-7374c276c212?w=500&q=80' },
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
  
  // Language State
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('pos_language') as Language) || 'lo';
  });

  // Cloud/Firebase State
  const [isCloudEnabled, setIsCloudEnabled] = useState<boolean>(() => {
      return !!localStorage.getItem('pos_firebase_config');
  });
  const [firebaseConfigInput, setFirebaseConfigInput] = useState('');
  
  // Persist language
  useEffect(() => {
    localStorage.setItem('pos_language', language);
    document.body.className = `bg-slate-100 text-slate-900 h-screen overflow-hidden select-none ${language === 'th' ? 'font-thai' : ''}`;
  }, [language]);

  const t = translations[language];

  // --- Data States ---
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(INITIAL_PROFILE);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // --- Initial Data Load & Subscription ---
  useEffect(() => {
      if (isCloudEnabled && db) {
          setIsDataLoaded(false);
          const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
              const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as Product));
              setProducts(data);
          });
          const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
              const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord)).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
              setRecentSales(data);
          });
          const unsubPromotions = onSnapshot(collection(db, 'promotions'), (snap) => {
              const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as Promotion));
              setPromotions(data);
          });
          const unsubProfile = onSnapshot(doc(db, 'settings', 'profile'), (docSnap) => {
              if (docSnap.exists()) {
                  setStoreProfile(docSnap.data() as StoreProfile);
              }
          });

          setIsDataLoaded(true);

          return () => {
              unsubProducts();
              unsubSales();
              unsubPromotions();
              unsubProfile();
          }
      } else {
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

  // --- Persistence (Local Only) ---
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

  // --- Modals & Temp States ---
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  
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
  const productImageInputRef = useRef<HTMLInputElement>(null);

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

  // --- Data Helper Wrappers ---
  const saveProductData = async (product: Product) => {
      if (isCloudEnabled && db) {
          await setDoc(doc(db, 'products', product.id), product);
      } else {
          setProducts(prev => {
              const exists = prev.find(p => p.id === product.id);
              if (exists) return prev.map(p => p.id === product.id ? product : p);
              return [...prev, product];
          });
      }
  };

  const deleteProductData = async (id: string) => {
      if (isCloudEnabled && db) {
          await deleteDoc(doc(db, 'products', id));
      } else {
          setProducts(prev => prev.filter(p => p.id !== id));
      }
  };

  const saveOrderData = async (order: SaleRecord) => {
      if (isCloudEnabled && db) {
          await setDoc(doc(db, 'sales', order.id), order);
          order.items.forEach(async (item) => {
             const productRef = doc(db, 'products', item.id);
             const currentProd = products.find(p => p.id === item.id);
             if (currentProd) {
                 await updateDoc(productRef, { stock: currentProd.stock - item.quantity });
             }
          });
      } else {
           setProducts(prev => prev.map(p => { 
               const sold = order.items.find(c => c.id === p.id); 
               return sold ? { ...p, stock: p.stock - sold.quantity } : p; 
           }));
           setRecentSales(prev => {
               const exists = prev.find(s => s.id === order.id);
               if (exists) return prev.map(s => s.id === order.id ? order : s);
               return [order, ...prev];
           });
      }
      setCurrentOrder(order);
  };

  const updateOrderStatusData = async (id: string, status: OrderStatus) => {
      if (isCloudEnabled && db) {
          await updateDoc(doc(db, 'sales', id), { status });
      } else {
          setRecentSales(prev => prev.map(s => s.id === id ? { ...s, status } : s));
      }
  };

  const saveProfileData = async (profile: StoreProfile) => {
      if (isCloudEnabled && db) {
          await setDoc(doc(db, 'settings', 'profile'), profile);
          setStoreProfile(profile);
      } else {
          setStoreProfile(profile);
      }
  };

  const savePromotionData = async (promo: Promotion) => {
      if (isCloudEnabled && db) {
          await setDoc(doc(db, 'promotions', promo.id), promo);
      } else {
          setPromotions(prev => {
              const exists = prev.find(p => p.id === promo.id);
              if (exists) return prev.map(p => p.id === promo.id ? promo : p);
              return [...prev, promo];
          });
      }
  };

  const deletePromotionData = async (id: string) => {
      if (isCloudEnabled && db) {
          await deleteDoc(doc(db, 'promotions', id));
      } else {
          setPromotions(prev => prev.filter(p => p.id !== id));
      }
  };

  const deleteOrderData = async (id: string) => {
    const orderToDelete = recentSales.find(s => s.id === id);
    if (!orderToDelete) return;

    if (isCloudEnabled && db) {
        await deleteDoc(doc(db, 'sales', id));
        orderToDelete.items.forEach(async (item) => {
            const currentProd = products.find(p => p.id === item.id);
            if (currentProd) {
                await updateDoc(doc(db, 'products', item.id), { stock: currentProd.stock + item.quantity });
            }
        });
    } else {
        const productsRestored = products.map(p => {
            const soldItem = orderToDelete.items.find(i => i.id === p.id);
            return soldItem ? { ...p, stock: p.stock + soldItem.quantity } : p;
        });
        setProducts(productsRestored);
        setRecentSales(prev => prev.filter(s => s.id !== id));
    }
  };


  // --- Promotion Logic ---
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
      const tieredPromo = activePromos.find(p => {
        if (p.type !== 'tiered_price') return false;
        const hasTargets = p.targetSkus && p.targetSkus.length > 0;
        if (!hasTargets) return true;
        const itemCode = (item.code || '').toLowerCase();
        const itemId = item.id;
        return p.targetSkus.some(sku => {
            const s = sku.trim().toLowerCase();
            return s === itemCode || s === itemId;
        });
      });

      if (tieredPromo && tieredPromo.tiers) {
        const sortedTiers = [...tieredPromo.tiers].sort((a, b) => b.minQty - a.minQty);
        const matchTier = sortedTiers.find(t => item.quantity >= t.minQty);
        if (matchTier) {
          const promoName = language === 'en' 
            ? `${tieredPromo.name} (Buy ${matchTier.minQty} @ ${matchTier.price})`
            : `${tieredPromo.name} (ຊື້ ${matchTier.minQty} @ ${matchTier.price})`;
          return { ...item, originalPrice: item.price, price: matchTier.price, promotionApplied: promoName };
        }
      }
      return item;
    });

    activePromos.filter(p => p.type === 'buy_x_get_y').forEach(promo => {
        processedItems.forEach(item => {
             const hasTargets = promo.targetSkus && promo.targetSkus.length > 0;
             let isMatch = !hasTargets;
             if (hasTargets) {
                 const itemCode = (item.code || '').toLowerCase();
                 isMatch = promo.targetSkus.some(sku => {
                    const s = sku.trim().toLowerCase();
                    return s === itemCode || s === item.id;
                 });
             }
             if (isMatch) {
                 if (promo.requiredQty && promo.freeSku && promo.freeQty) {
                     const sets = Math.floor(item.quantity / promo.requiredQty);
                     if (sets > 0) {
                        const freeProduct = products.find(p => p.code.toLowerCase() === promo.freeSku!.trim().toLowerCase());
                        if (freeProduct) {
                            const promoName = language === 'en' ? `${promo.name} (Buy ${promo.requiredQty} Get ${promo.freeQty})` : `${promo.name} (ຊື້ ${promo.requiredQty} ແຖມ ${promo.freeQty})`;
                            newFreeItems.push({ ...freeProduct, quantity: sets * promo.freeQty, price: 0, isFree: true, promotionApplied: promoName });
                        }
                     }
                 }
             }
        });
    });

    const mergedFreeItems: CartItem[] = [];
    newFreeItems.forEach(item => {
        const existing = mergedFreeItems.find(i => i.id === item.id && i.promotionApplied === item.promotionApplied);
        if (existing) { existing.quantity += item.quantity; } else { mergedFreeItems.push(item); }
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
    
    const htmlContent = `<!DOCTYPE html><html><head><title>Receipt</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Lao:wght@300;400;500;600;700&display=swap" rel="stylesheet"><style>body{font-family:'Noto Sans Lao',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.receipt-container{padding:20px;}</style><script>tailwind.config={theme:{extend:{colors:{brand:{600:'#0284c7'}}}}}</script></head><body><div class="receipt-container">${receiptContent.innerHTML}</div><script>window.onload=function(){setTimeout(function(){window.print();},500);}</script></body></html>`;
    printWindow.document.write(htmlContent); printWindow.document.close(); printWindow.focus();
  };
  const handlePrintSpecificOrder = (order: SaleRecord) => { setCurrentOrder(order); setShowReceipt(true); };
  const downloadProductTemplate = () => { const blob = new Blob(["code,name,price,cost,category,stock\nFD001,Demo Product,10000,5000,Food,100\n"], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'product_template.csv'; document.body.appendChild(link); link.click(); };
  const downloadSalesTemplate = () => { const blob = new Blob(["date,customer_name,total,status,payment_method\n25/10/2023,John Doe,50000,Paid,cash\n"], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'sales_history_template.csv'; document.body.appendChild(link); link.click(); };
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
       if (isCloudEnabled && db) {
           newP.forEach(p => saveProductData(p));
           alert(`${t.success}: ${newP.length} (Cloud Uploading...)`);
       } else {
           setProducts(prev => [...prev, ...newP]);
           alert(`${t.success}: ${newP.length}`);
       }
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
           if (newSales.length > 0) { 
               if(isCloudEnabled && db) {
                   newSales.forEach(s => saveOrderData(s));
                   alert(`${t.success}: ${newSales.length} (Cloud Uploading...)`);
               } else {
                   setRecentSales(prev => [...prev, ...newSales]); 
                   alert(`${t.success}: ${newSales.length}`); 
               }
           } else alert(t.error);
       } catch (err) { alert(t.error); }
    };
    reader.readAsText(file);
  };
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) {
      const reader = new FileReader(); reader.onloadend = () => saveProfileData({ ...storeProfile, logoUrl: reader.result as string }); reader.readAsDataURL(file);
    }
  };
  const handleProductImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > 800000) { alert('File is too large! Please select image under 800KB.'); return; }
        const reader = new FileReader();
        reader.onloadend = () => { setProductImagePreview(reader.result as string); };
        reader.readAsDataURL(file);
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
        try { 
            const d = JSON.parse(ev.target?.result as string); 
            if(isCloudEnabled && db) {
                if(d.products) d.products.forEach((p:Product) => saveProductData(p));
                if(d.recentSales) d.recentSales.forEach((s:SaleRecord) => saveOrderData(s));
                if(d.storeProfile) saveProfileData(d.storeProfile);
                if(d.promotions) d.promotions.forEach((p:Promotion) => savePromotionData(p));
                alert("Restoring to Cloud... This may take a moment.");
            } else {
                if(d.products) setProducts(d.products); 
                if(d.recentSales) setRecentSales(d.recentSales); 
                if(d.storeProfile) setStoreProfile(d.storeProfile); 
                if(d.promotions) setPromotions(d.promotions); 
                alert(t.success); 
            }
        } catch(e){ alert(t.error); }
      }; reader.readAsText(file);
    }
  };
  const handleResetToDefaults = () => { if (confirm(t.confirm + '?')) { localStorage.clear(); window.location.reload(); } };
  const handleClearAllData = () => { if (confirm(t.confirm + '?')) { if (confirm('Permanently delete?')) { localStorage.clear(); window.location.reload(); } } };
  const handleClearSalesData = () => { if (confirm(t.confirm + '? (' + t.setting_clear_sales + ')')) { 
      if(isCloudEnabled && db) {
          recentSales.forEach(s => deleteDoc(doc(db, 'sales', s.id)));
      } else {
          setRecentSales([]); localStorage.setItem('pos_sales', JSON.stringify([])); 
      }
      setCart([]); setManualDiscount({ type: 'amount', value: 0 }); alert(t.success); 
  } };
  const handleDeleteOrder = (orderId: string) => { if (confirm(t.order_delete_confirm)) deleteOrderData(orderId); };

  // --- Logic ---
  const addToCart = (product: Product, isTemp = false) => {
    const setter = isTemp ? setTempOrderCart : setCart;
    setter(prev => {
      const exist = prev.find(i => i.id === product.id && !i.isFree);
      return exist ? prev.map(i => i.id === product.id && !i.isFree ? { ...i, quantity: i.quantity + 1 } : i) : [...prev, { ...product, quantity: 1 }];
    });
    if(isTemp) setSkuSearch('');
  };
  const removeFromCart = (id: string, isTemp = false) => { const setter = isTemp ? setTempOrderCart : setCart; setter(prev => prev.filter(i => i.id !== id)); };
  const updateQuantity = (id: string, delta: number, isTemp = false) => { const setter = isTemp ? setTempOrderCart : setCart; setter(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)); };
  const setItemQuantity = (id: string, qty: number, isTemp = false) => { const setter = isTemp ? setTempOrderCart : setCart; setter(prev => prev.map(item => { if (item.id === id && !item.isFree) return { ...item, quantity: Math.max(1, qty) }; return item; })); };
  
  const processPayment = () => {
    const { items, total: subtotal } = calculatedCart;
    let discountAmount = 0;
    if (manualDiscount.value > 0) {
        if (manualDiscount.type === 'percent') { discountAmount = (subtotal * manualDiscount.value) / 100; } else { discountAmount = manualDiscount.value; }
    }
    const finalTotal = Math.max(0, subtotal - discountAmount);
    const order: SaleRecord = { 
        id: uuidv4().slice(0, 8), items: [...items], total: finalTotal, subtotal: subtotal, discountValue: discountAmount > 0 ? manualDiscount.value : undefined, discountType: discountAmount > 0 ? manualDiscount.type : undefined, date: new Date().toLocaleString('th-TH'), timestamp: Date.now(), paymentMethod, status: 'Paid', shippingCarrier: 'None', customerName: 'Walk-in' 
    };
    saveOrderData(order); setCart([]); setManualDiscount({ type: 'amount', value: 0 }); setIsPaymentModalOpen(false); setShowReceipt(true);
  };

  const handleEditOrder = (order: SaleRecord) => {
    setEditingOrder(order); setTempOrderCart([...order.items]);
    setNewOrderCustomer({ name: order.customerName || '', phone: order.customerPhone || '', address: order.customerAddress || '' });
    setNewOrderShipping({ carrier: order.shippingCarrier || 'None', branch: order.shippingBranch || '' });
    setIsOrderModalOpen(true);
  };

  const handleSaveOrderBackOffice = () => {
    if (tempOrderCart.length === 0) return;
    const { items, total } = calculatedTempOrderCart;
    const orderData: SaleRecord = {
        id: editingOrder ? editingOrder.id : uuidv4().slice(0, 8), items: [...items], total: total, date: editingOrder ? editingOrder.date : new Date().toLocaleString('th-TH'), timestamp: editingOrder ? editingOrder.timestamp : Date.now(), paymentMethod: editingOrder ? editingOrder.paymentMethod : 'transfer', status: editingOrder ? editingOrder.status : 'Pending', customerName: newOrderCustomer.name || 'Unknown', customerPhone: newOrderCustomer.phone, customerAddress: newOrderCustomer.address, shippingCarrier: newOrderShipping.carrier, shippingBranch: newOrderShipping.branch
    };
    if (editingOrder && !isCloudEnabled) {
         const productsRestored = products.map(p => { const soldItem = editingOrder.items.find(i => i.id === p.id); return soldItem ? { ...p, stock: p.stock + soldItem.quantity } : p; });
         setProducts(productsRestored);
    }
    saveOrderData(orderData);
    setEditingOrder(null); setTempOrderCart([]); setNewOrderCustomer({ name: '', phone: '', address: '' }); setNewOrderShipping({ carrier: 'None', branch: '' }); setSkuSearch(''); setIsOrderModalOpen(false);
  };

  const updateOrderStatus = (id: string, status: OrderStatus) => { updateOrderStatusData(id, status); };
  
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
    } catch (err) { console.error(err); setMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: t.error, isError: true, timestamp: Date.now() }]); } finally { setIsChatLoading(false); }
  };
  
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault(); const formData = new FormData(e.target as HTMLFormElement);
    const newProduct: Product = { 
        id: editingProduct ? editingProduct.id : uuidv4(), code: formData.get('code') as string, name: formData.get('name') as string, price: Number(formData.get('price')), cost: Number(formData.get('cost')), category: formData.get('category') as string, stock: Number(formData.get('stock')), color: editingProduct ? editingProduct.color : `bg-${['orange','blue','green','purple','pink'][Math.floor(Math.random()*5)]}-100 text-${['orange','blue','green','purple','pink'][Math.floor(Math.random()*5)]}-800`, imageUrl: productImagePreview || undefined 
    };
    saveProductData(newProduct);
    setIsProductModalOpen(false); setEditingProduct(null); setProductImagePreview(null);
  };
  
  const handleSavePromotion = (e: React.FormEvent) => {
      e.preventDefault(); const formData = new FormData(e.target as HTMLFormElement); const type = formData.get('type') as PromotionType;
      const targetSkus = (formData.get('targetSkus') as string)?.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) || [];
      const tiers = []; for (let i = 0; i < 7; i++) { const qty = formData.get(`minQty${i}`); const price = formData.get(`price${i}`); if (qty && price) tiers.push({ minQty: Number(qty), price: Number(price) }); }
      const newPromo: Promotion = { id: editingPromotion ? editingPromotion.id : uuidv4(), name: formData.get('name') as string, type: type, isActive: true, targetSkus: targetSkus, ...(type === 'tiered_price' ? { tiers: tiers } : { requiredQty: Number(formData.get('requiredQty')), freeSku: formData.get('freeSku') as string, freeQty: Number(formData.get('freeQty')) }) };
      savePromotionData(newPromo);
      setIsPromotionModalOpen(false); setEditingPromotion(null);
  };
  
  const handleFirebaseConnect = () => {
      try {
          const config = JSON.parse(firebaseConfigInput);
          if (initFirebase(config)) {
              localStorage.setItem('pos_firebase_config', JSON.stringify(config));
              setIsCloudEnabled(true);
              alert("Connected to Firebase Cloud successfully!");
          } else {
              alert("Connection failed. Please check config.");
          }
      } catch (e) {
          alert("Invalid JSON format");
      }
  };

  const handleFirebaseDisconnect = () => {
      if(confirm("Disconnect from Cloud? Your local data will reappear.")) {
          localStorage.removeItem('pos_firebase_config');
          setIsCloudEnabled(false);
          window.location.reload();
      }
  };

  const handleUploadToCloud = () => {
      if(!isCloudEnabled || !db) return;
      if(confirm("Upload all local data to Cloud? This might overwrite cloud data.")) {
          const savedProducts = JSON.parse(localStorage.getItem('pos_products') || '[]');
          const savedSales = JSON.parse(localStorage.getItem('pos_sales') || '[]');
          const savedProfile = JSON.parse(localStorage.getItem('pos_profile') || '{}');
          
          savedProducts.forEach((p: any) => saveProductData(p));
          savedSales.forEach((s: any) => saveOrderData(s));
          if(savedProfile.name) saveProfileData(savedProfile);
          
          alert("Uploading started...");
      }
  };

  // --- Renderers ---
  
  const renderDashboard = () => {
    const totalSales = recentSales.filter(s => s.status !== 'Cancelled').reduce((sum, s) => sum + s.total, 0);
    const totalOrders = recentSales.filter(s => s.status !== 'Cancelled').length;
    const lowStockItems = products.filter(p => p.stock < 10);
    const totalCost = recentSales.filter(s => s.status !== 'Cancelled').reduce((sum, sale) => sum + sale.items.reduce((c, item) => c + ((item.cost || 0) * item.quantity), 0), 0);
    const profit = totalSales - totalCost;

    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
        {isCloudEnabled && <div className="mb-4 bg-sky-50 border border-sky-200 p-2 rounded-lg flex items-center gap-2 text-sky-700 text-sm"><Cloud size={16}/> Cloud Sync Active</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600 w-fit mb-2"><DollarSign size={20} /></div>
                <p className="text-slate-500 text-xs mb-1">{t.dash_sales_month}</p>
                <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(totalSales, language)}</h3>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="p-2 bg-purple-50 rounded-lg text-purple-600 w-fit mb-2"><ClipboardList size={20} /></div>
                <p className="text-slate-500 text-xs mb-1">{t.dash_total_orders}</p>
                <h3 className="text-2xl font-bold text-slate-800">{totalOrders}</h3>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="p-2 bg-green-50 rounded-lg text-green-600 w-fit mb-2"><Wallet size={20} /></div>
                <p className="text-slate-500 text-xs mb-1">{t.dash_profit}</p>
                <h3 className="text-2xl font-bold text-green-600">{formatCurrency(profit, language)}</h3>
            </div>
             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-2"><div className="p-2 bg-orange-50 rounded-lg text-orange-600"><AlertTriangle size={20} /></div>{lowStockItems.length > 0 && <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full">{lowStockItems.length}</span>}</div>
                <p className="text-slate-500 text-xs mb-1">{t.dash_low_stock}</p>
                <h3 className="text-2xl font-bold text-slate-800">{lowStockItems.length} Items</h3>
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Package size={18} /> {t.dash_low_stock}</h3>
                <div className="space-y-3">
                    {lowStockItems.slice(0, 5).map(p => (
                        <div key={p.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg transition-colors">
                            <div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-lg ${p.color} flex items-center justify-center text-xs font-bold overflow-hidden`}>{p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover"/> : p.code}</div><div><p className="text-sm font-bold text-slate-700">{p.name}</p><p className="text-xs text-slate-400">Stock: {p.stock}</p></div></div>
                            <button onClick={() => {setEditingProduct(p); setIsProductModalOpen(true);}} className="text-xs font-bold text-sky-600 hover:underline">{t.stock_manage}</button>
                        </div>
                    ))}
                    {lowStockItems.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">{t.dash_stock_ok}</div>}
                </div>
            </div>
             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><History size={18} /> Recent Activity</h3>
                 <div className="space-y-3">
                    {recentSales.slice(0, 5).map(s => (
                        <div key={s.id} className="flex justify-between items-center p-2 border-b border-slate-50 last:border-0">
                             <div><p className="text-sm font-bold text-slate-700">Order #{s.id}</p><p className="text-xs text-slate-400">{s.date} • {s.items.length} items</p></div>
                             <div className="text-right"><p className="text-sm font-bold text-slate-800">{formatCurrency(s.total, language)}</p><span className={`text-[10px] px-2 py-0.5 rounded-full ${s.status === 'Paid' ? 'bg-green-100 text-green-700' : s.status === 'Cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{s.status}</span></div>
                        </div>
                    ))}
                    {recentSales.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">{t.order_no_data}</div>}
                 </div>
            </div>
        </div>
      </div>
    );
  };

  const renderPOS = () => {
    const filteredProducts = products.filter(p => 
      (selectedCategory === 'All' || p.category === selectedCategory) &&
      (p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];

    return (
      <div className="flex h-full flex-col md:flex-row overflow-hidden">
        {/* Left Side: Product Grid */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50">
           <div className="p-4 bg-white border-b border-slate-100 space-y-3">
              <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                 <input 
                   type="text" 
                   placeholder={t.pos_search_placeholder} 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 transition-all text-sm"
                 />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {categories.map(cat => (
                  <button 
                    key={cat} 
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-sky-600 text-white shadow-md shadow-sky-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {cat === 'All' ? t.pos_all_cat : cat}
                  </button>
                ))}
              </div>
           </div>
           
           <div className="flex-1 p-4 overflow-y-auto">
             <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
               {filteredProducts.map(product => (
                 <button 
                   key={product.id} 
                   onClick={() => addToCart(product)}
                   className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-sky-200 transition-all group text-left flex flex-col h-full"
                 >
                   <div className={`w-full aspect-square rounded-xl ${product.color} mb-3 flex items-center justify-center text-xl font-bold overflow-hidden relative`}>
                     {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" /> : product.name.charAt(0)}
                     {product.stock <= 5 && <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">Low</div>}
                   </div>
                   <h3 className="font-bold text-slate-800 text-sm line-clamp-2 mb-1">{product.name}</h3>
                   <div className="mt-auto flex justify-between items-end">
                     <span className="text-sky-600 font-bold">{formatCurrency(product.price, language)}</span>
                     <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{t.pos_stock}: {product.stock}</span>
                   </div>
                 </button>
               ))}
             </div>
           </div>
        </div>

        {/* Right Side: Cart */}
        <div className="w-full md:w-96 bg-white border-l border-slate-100 flex flex-col shadow-xl z-10">
           <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="font-bold text-lg flex items-center gap-2"><ShoppingCart className="text-sky-600" /> {t.pos_cart_title}</h2>
              <button onClick={() => { setCart([]); setManualDiscount({ type: 'amount', value: 0 }); }} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">{t.pos_clear_cart}</button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {calculatedCart.items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                   <ShoppingCart size={48} />
                   <p className="text-sm font-medium">{t.pos_empty_cart}</p>
                </div>
              ) : (
                calculatedCart.items.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className={`flex items-center gap-3 p-3 rounded-xl border ${item.isFree ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100'}`}>
                    <div className="flex-1 min-w-0">
                       <h4 className="font-bold text-sm truncate text-slate-800">{item.name}</h4>
                       <div className="flex items-center gap-2 text-xs">
                          {item.isFree ? (
                             <span className="text-green-600 font-bold">{t.pos_free}</span>
                          ) : (
                             <span className="text-sky-600 font-bold">{formatCurrency(item.price, language)}</span>
                          )}
                          {item.promotionApplied && <span className="text-[10px] bg-orange-100 text-orange-700 px-1 rounded">{item.promotionApplied}</span>}
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1">
                       {!item.isFree && <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-white hover:shadow rounded text-slate-500 transition-all"><Minus size={14} /></button>}
                       <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                       {!item.isFree && <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-white hover:shadow rounded text-slate-500 transition-all"><Plus size={14} /></button>}
                    </div>
                    
                    {!item.isFree && (
                      <button onClick={() => removeFromCart(item.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))
              )}
           </div>
           
           <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
              <div className="space-y-2">
                 <div className="flex justify-between text-sm text-slate-500">
                    <span>{t.pos_total_items}</span>
                    <span>{calculatedCart.items.reduce((sum, i) => sum + i.quantity, 0)} {t.pos_items}</span>
                 </div>
                 
                 {/* Discount Input */}
                 <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 whitespace-nowrap">{t.pos_discount}</span>
                    <div className="flex-1 flex rounded-lg overflow-hidden border border-slate-200 bg-white">
                        <input 
                          type="number" 
                          value={manualDiscount.value || ''} 
                          onChange={(e) => setManualDiscount({ ...manualDiscount, value: Number(e.target.value) })}
                          placeholder="0"
                          className="w-full p-1.5 text-xs outline-none text-right"
                        />
                        <button 
                          onClick={() => setManualDiscount(prev => ({ ...prev, type: prev.type === 'amount' ? 'percent' : 'amount' }))}
                          className="px-2 text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          {manualDiscount.type === 'amount' ? '₭' : '%'}
                        </button>
                    </div>
                 </div>

                 <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                    <span className="font-bold text-slate-700">{t.pos_net_total}</span>
                    <span className="text-2xl font-bold text-sky-600">
                      {(() => {
                        const { total } = calculatedCart;
                        let discount = 0;
                        if (manualDiscount.value > 0) {
                            discount = manualDiscount.type === 'percent' ? (total * manualDiscount.value) / 100 : manualDiscount.value;
                        }
                        return formatCurrency(Math.max(0, total - discount), language);
                      })()}
                    </span>
                 </div>
              </div>
              
              <button 
                onClick={() => setIsPaymentModalOpen(true)}
                disabled={calculatedCart.items.length === 0}
                className="w-full bg-sky-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-sky-200 hover:bg-sky-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Banknote size={20} /> {t.pos_pay}
              </button>
           </div>
        </div>
      </div>
    );
  };

  const renderOrders = () => {
    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <div className="flex justify-between items-center mb-6">
           <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><ClipboardList className="text-sky-600"/> {t.order_title}</h2>
           <button onClick={() => { setEditingOrder(null); setTempOrderCart([]); setIsOrderModalOpen(true); }} className="bg-sky-600 text-white px-3 py-2 rounded-lg shadow-sm hover:bg-sky-700 flex gap-2 text-sm"><Plus size={16}/> {t.order_create}</button>
        </div>
        
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
           <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                <tr>
                   <th className="px-4 py-3 font-bold text-xs uppercase">{t.order_id}</th>
                   <th className="px-4 py-3 font-bold text-xs uppercase">{t.order_date}</th>
                   <th className="px-4 py-3 font-bold text-xs uppercase">{t.order_customer}</th>
                   <th className="px-4 py-3 font-bold text-xs uppercase">{t.order_total}</th>
                   <th className="px-4 py-3 font-bold text-xs uppercase">{t.order_status}</th>
                   <th className="px-4 py-3 font-bold text-xs uppercase text-center">{t.order_action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentSales.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-500">#{order.id}</td>
                    <td className="px-4 py-3 text-slate-600">{order.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{order.customerName}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{formatCurrency(order.total, language)}</td>
                    <td className="px-4 py-3">
                       <select 
                         value={order.status}
                         onChange={(e) => updateOrderStatus(order.id, e.target.value as OrderStatus)}
                         className={`text-xs px-2 py-1 rounded-full border-none outline-none font-bold cursor-pointer
                           ${order.status === 'Paid' ? 'bg-green-100 text-green-700' : 
                             order.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' : 
                             order.status === 'Cancelled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}
                       >
                          <option value="Paid">Paid</option>
                          <option value="Pending">Pending</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Cancelled">Cancelled</option>
                       </select>
                    </td>
                    <td className="px-4 py-3 text-center flex justify-center gap-2">
                       <button onClick={() => handlePrintSpecificOrder(order)} className="p-1.5 text-slate-400 hover:text-sky-600 rounded hover:bg-slate-100"><Printer size={14}/></button>
                       <button onClick={() => handleEditOrder(order)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100"><Edit size={14}/></button>
                       <button onClick={() => handleDeleteOrder(order.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100"><Trash2 size={14}/></button>
                    </td>
                  </tr>
                ))}
                {recentSales.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t.order_no_data}</td></tr>}
              </tbody>
           </table>
        </div>
      </div>
    );
  };

  const renderReports = () => {
     // Filter sales by date range
     const filteredSales = recentSales.filter(s => {
         // Using timestamp is safer
         const saleTime = s.timestamp || 0;
         const start = new Date(reportDateRange.start).setHours(0,0,0,0);
         const end = new Date(reportDateRange.end).setHours(23,59,59,999);
         return saleTime >= start && saleTime <= end && s.status !== 'Cancelled';
     });
     
     const totalSales = filteredSales.reduce((sum, s) => sum + s.total, 0);
     const totalOrders = filteredSales.length;
     const paymentMethods = filteredSales.reduce((acc, s) => { acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + s.total; return acc; }, {} as Record<string, number>);

     return (
       <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><BarChart3 className="text-sky-600"/> {t.menu_reports}</h2>
          
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 flex flex-wrap gap-4 items-center">
             <div className="flex items-center gap-2"><Calendar size={16} className="text-slate-400"/><input type="date" value={reportDateRange.start} onChange={e => setReportDateRange({...reportDateRange, start: e.target.value})} className="p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-500"/></div>
             <span className="text-slate-400">-</span>
             <div className="flex items-center gap-2"><Calendar size={16} className="text-slate-400"/><input type="date" value={reportDateRange.end} onChange={e => setReportDateRange({...reportDateRange, end: e.target.value})} className="p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-500"/></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
                <p className="text-slate-500 text-sm mb-2">{t.dash_sales_month}</p>
                <h3 className="text-3xl font-bold text-sky-600">{formatCurrency(totalSales, language)}</h3>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
                <p className="text-slate-500 text-sm mb-2">{t.dash_total_orders}</p>
                <h3 className="text-3xl font-bold text-slate-800">{totalOrders}</h3>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
                <p className="text-slate-500 text-sm mb-2">Average Order Value</p>
                <h3 className="text-3xl font-bold text-purple-600">{formatCurrency(totalOrders ? totalSales / totalOrders : 0, language)}</h3>
             </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
             <h3 className="font-bold text-slate-700 mb-4">Payment Methods</h3>
             <div className="space-y-3">
                {Object.entries(paymentMethods).map(([method, amount]) => (
                   <div key={method} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="capitalize font-medium text-slate-700">{method === 'qr' ? 'QR Code' : method}</span>
                      <span className="font-bold text-slate-800">{formatCurrency(amount, language)}</span>
                   </div>
                ))}
                {Object.keys(paymentMethods).length === 0 && <p className="text-center text-slate-400 text-sm py-4">No data for selected period</p>}
             </div>
          </div>
       </div>
     );
  };

  const renderPromotions = () => {
      return (
          <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Tag className="text-sky-600"/> {t.menu_promotions}</h2>
                 <button onClick={() => { setEditingPromotion(null); setIsPromotionModalOpen(true); }} className="bg-sky-600 text-white px-3 py-2 rounded-lg shadow-sm hover:bg-sky-700 flex gap-2 text-sm"><Plus size={16}/> {t.promo_add}</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {promotions.map(promo => (
                      <div key={promo.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative group">
                          <div className="flex justify-between items-start mb-2">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${promo.type === 'tiered_price' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{promo.type.replace('_', ' ')}</span>
                              <div className="flex gap-1">
                                  <button onClick={() => { setEditingPromotion(promo); setIsPromotionModalOpen(true); }} className="p-1 text-slate-400 hover:text-blue-600"><Edit size={14}/></button>
                                  <button onClick={() => deletePromotionData(promo.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                              </div>
                          </div>
                          <h3 className="font-bold text-slate-800 mb-1">{promo.name}</h3>
                          <div className="text-xs text-slate-500 space-y-1">
                              {promo.targetSkus && promo.targetSkus.length > 0 && <p>Targets: {promo.targetSkus.join(', ')}</p>}
                              {promo.type === 'tiered_price' && promo.tiers && (
                                  <div>
                                      {promo.tiers.map((t, i) => <div key={i}>Buy {t.minQty} @ {t.price}</div>)}
                                  </div>
                              )}
                              {promo.type === 'buy_x_get_y' && (
                                  <div>Buy {promo.requiredQty} Get {promo.freeQty} ({promo.freeSku})</div>
                              )}
                          </div>
                          <div className={`mt-3 text-xs font-bold flex items-center gap-1 ${promo.isActive ? 'text-green-600' : 'text-slate-400'}`}>
                             <div className={`w-2 h-2 rounded-full ${promo.isActive ? 'bg-green-500' : 'bg-slate-300'}`}/> {promo.isActive ? 'Active' : 'Inactive'}
                          </div>
                      </div>
                  ))}
                  {promotions.length === 0 && <div className="col-span-full text-center py-12 text-slate-400">{t.promo_no_data}</div>}
              </div>
          </div>
      );
  };

  const renderAI = () => {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
           <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Sparkles className="text-sky-600" size={20}/> {t.ai_title}</h2>
              <p className="text-xs text-slate-500">{t.ai_desc}</p>
           </div>
           <button onClick={() => setMessages([])} className="text-slate-400 hover:text-red-500 p-2"><Trash2 size={18}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
           {messages.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm"><Sparkles size={32} className="text-sky-300"/></div>
                <p className="text-sm">{t.ai_input_placeholder}</p>
             </div>
           )}
           {messages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
           {isChatLoading && (
             <div className="flex items-center gap-2 text-slate-400 text-sm p-4 animate-pulse">
                <Loader2 size={16} className="animate-spin"/> {t.ai_thinking}
             </div>
           )}
           <div ref={messagesEndRef} />
        </div>
        
        <div className="p-4 bg-white border-t border-slate-200">
           <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
              <input 
                value={chatInput} 
                onChange={e => setChatInput(e.target.value)} 
                placeholder={t.ai_input_placeholder}
                className="flex-1 p-3 pr-12 bg-slate-100 border-none rounded-xl outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                disabled={isChatLoading}
              />
              <button 
                type="submit" 
                disabled={!chatInput.trim() || isChatLoading}
                className="absolute right-2 p-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                <Send size={18} />
              </button>
           </form>
        </div>
      </div>
    );
  };
  
  // Settings Renderer with Cloud Config
  const renderSettings = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Settings className="text-sky-600" /> {t.setting_title}</h2>
      
      {/* Cloud Settings */}
      <div className="max-w-2xl bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm"><Cloud size={16}/> การเชื่อมต่อ Cloud (หลายสาขา/เครื่อง)</h3>
          
          {isCloudEnabled ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-3 text-green-700 font-bold mb-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/> Connected to Firebase
                  </div>
                  <p className="text-xs text-green-600 mb-4">ข้อมูลกำลังซิงค์กันระหว่างเครื่องผ่านระบบ Cloud</p>
                  <div className="flex gap-2">
                      <button onClick={handleUploadToCloud} className="px-3 py-2 bg-white border border-green-200 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100 flex items-center gap-2"><ArrowUpCircle size={14}/> อัปโหลดข้อมูลในเครื่องไป Cloud</button>
                      <button onClick={handleFirebaseDisconnect} className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center gap-2"><CloudOff size={14}/> ตัดการเชื่อมต่อ</button>
                  </div>
              </div>
          ) : (
              <div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                      <p className="text-xs text-slate-500 mb-2 flex items-start gap-2"><Info size={14} className="shrink-0 mt-0.5"/> เพื่อใช้งานหลายเครื่องพร้อมกัน คุณต้องสร้างโปรเจค Firebase ฟรี</p>
                      <ol className="text-[10px] text-slate-500 list-decimal list-inside space-y-1 ml-1">
                          <li>ไปที่ <a href="https://console.firebase.google.com/" target="_blank" className="text-sky-600 underline">console.firebase.google.com</a> สร้างโปรเจคใหม่</li>
                          <li>เมนู Project Settings &gt; General &gt; เลื่อนลงมาล่างสุด กดไอคอน &lt;/&gt; (Web)</li>
                          <li>ตั้งชื่อแอพ กด Register แล้วคัดลอก "const firebaseConfig = &#123; ... &#125;" เฉพาะในปีกกา</li>
                          <li>สร้าง Firestore Database ในเมนู Build &gt; Firestore Database (เลือก Test mode)</li>
                      </ol>
                  </div>
                  <textarea 
                    value={firebaseConfigInput}
                    onChange={e => setFirebaseConfigInput(e.target.value)}
                    placeholder='วาง Config ที่นี่ เช่น { "apiKey": "...", "authDomain": "..." }'
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 text-xs font-mono h-32 mb-3"
                  />
                  <button onClick={handleFirebaseConnect} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold shadow hover:bg-sky-700 transition-colors">บันทึกและเชื่อมต่อ</button>
              </div>
          )}
      </div>

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
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">{t.setting_shop_name}</label><input value={storeProfile.name} onChange={(e) => saveProfileData({ ...storeProfile, name: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 transition-all text-sm"/></div>
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">{t.setting_phone}</label><input value={storeProfile.phone} onChange={(e) => saveProfileData({ ...storeProfile, phone: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 transition-all text-sm"/></div>
          </div>
        </div>
        <div className="mb-6"><label className="text-xs font-bold text-slate-500 mb-1 block">{t.setting_address}</label><textarea rows={3} value={storeProfile.address} onChange={(e) => saveProfileData({ ...storeProfile, address: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 transition-all resize-none text-sm"/></div>
        <div className="mb-6"><label className="text-xs font-bold text-slate-500 mb-1 block">{t.setting_promptpay}</label><input value={storeProfile.promptPayId || ''} onChange={(e) => saveProfileData({ ...storeProfile, promptPayId: e.target.value })} placeholder="0812345678" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-500 transition-all text-sm"/></div>
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
             <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between"><div><h4 className="font-bold text-orange-700 text-xs flex items-center gap-2"><History size={12}/> {t.setting_clear_sales}</h4><p className="text-[10px] text-orange-500 mt-0.5">Orders & Transactions</p></div><button onClick={handleClearSalesData} className="px-3 py-1.5 bg-white border border-orange-300 text-orange-700 rounded-lg text-xs font-bold hover:bg-orange-600 hover:text-white transition-colors shadow-sm">Clear</button></div>
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
                 <button onClick={() => { setEditingProduct(null); setProductImagePreview(null); setIsProductModalOpen(true); }} className="bg-sky-600 text-white px-3 py-2 rounded-lg shadow-sm hover:bg-sky-700 flex gap-2 text-sm"><Plus size={16}/> {t.stock_add}</button>
               </div>
               <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
                 <table className="w-full text-left text-sm whitespace-nowrap">
                   <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">{t.stock_code}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">{t.stock_name}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right">{t.stock_cost}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right">{t.stock_price}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right">{t.stock_remaining}</th><th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-center">{t.stock_manage}</th></tr></thead>
                   <tbody className="divide-y divide-slate-50">{products.map(p=>(<tr key={p.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.code}</td><td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-3"><div className={`w-8 h-8 rounded-lg ${p.color} flex items-center justify-center overflow-hidden flex-shrink-0`}>{p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover"/> : p.name.charAt(0)}</div>{p.name}</td><td className="px-4 py-3 text-right text-slate-400">{formatCurrency(p.cost || 0, language)}</td><td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(p.price, language)}</td><td className="px-4 py-3 text-right">{p.stock}</td><td className="px-4 py-3 text-center"><button onClick={() => { setEditingProduct(p); setProductImagePreview(p.imageUrl || null); setIsProductModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100"><Edit size={14}/></button><button onClick={()=>{if(confirm(t.stock_delete_confirm))deleteProductData(p.id)}} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100"><Trash2 size={14}/></button></td></tr>))}</tbody>
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
              <div className="flex flex-col items-center justify-center mb-4">
                  <label className="text-xs font-bold text-slate-500 mb-2 block">{t.stock_image}</label>
                  <div 
                    className="w-24 h-24 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden relative group cursor-pointer hover:border-sky-500 transition-colors"
                    onClick={() => productImageInputRef.current?.click()}
                  >
                      {productImagePreview ? (
                          <img src={productImagePreview} className="w-full h-full object-cover" />
                      ) : (
                          <ImagePlus size={24} className="text-slate-400" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                          Change
                      </div>
                  </div>
                  <input type="file" ref={productImageInputRef} onChange={handleProductImageChange} className="hidden" accept="image/*" />
              </div>
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
                    <datalist id="categories">
                      {Array.from(new Set([...products.map(p => p.category), 'Food', 'Drink'])).map(c => <option key={c} value={c} />)}
                    </datalist>
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
              <div className="space-y-1 mb-6 border-b border-dashed border-slate-300 pb-4">
                  {currentOrder.subtotal && currentOrder.subtotal !== currentOrder.total && (<div className="flex justify-between text-xs text-slate-500"><span>{t.pos_total_items}</span><span>{formatCurrency(currentOrder.subtotal, language)}</span></div>)}
                  {currentOrder.discountValue && currentOrder.discountValue > 0 && (<div className="flex justify-between text-xs text-red-500 font-bold"><span>{t.pos_discount} {currentOrder.discountType === 'percent' ? `(${currentOrder.discountValue}%)` : ''}</span><span>-{formatCurrency(currentOrder.discountType === 'percent' ? (currentOrder.subtotal! * currentOrder.discountValue) / 100 : currentOrder.discountValue, language)}</span></div>)}
                  <div className="flex justify-between font-bold text-lg pt-2"><span>Total</span><span>{formatCurrency(currentOrder.total, language)}</span></div>
              </div>
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
             <div className="text-center mb-6">
                 <p className="text-slate-500 text-sm mb-1">{t.pay_total}</p>
                 <h3 className="text-4xl font-bold text-slate-800">
                     {(() => {
                        const { total } = calculatedCart;
                        let discount = 0;
                        if (manualDiscount.value > 0) { discount = manualDiscount.type === 'percent' ? (total * manualDiscount.value) / 100 : manualDiscount.value; }
                        return formatCurrency(Math.max(0, total - discount), language);
                     })()}
                 </h3>
             </div>
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
                      <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 block mb-1">Type</label><select name="type" value={promoType} onChange={(e) => setPromoType(e.target.value as PromotionType)} className="w-full p-2 border rounded-lg outline-none"><option value="tiered_price">Tier Price (Discount)</option><option value="buy_x_get_y">Buy X Get Y (Free Gift)</option></select></div></div>
                      <div><label className="text-xs font-bold text-slate-500 block mb-1">Target SKUs</label><textarea name="targetSkus" required defaultValue={editingPromotion?.targetSkus ? editingPromotion.targetSkus.join(', ') : (editingPromotion as any)?.targetSku} className="w-full p-2 border rounded-lg outline-none h-24 text-sm font-mono" placeholder="A001, A002, B005"/></div>
                      <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                          <p className="text-xs font-bold text-sky-600 uppercase">Conditions</p>
                          {promoType === 'tiered_price' && (<div className="border-b border-slate-200 pb-3"><p className="text-xs text-slate-400 mb-2">Max 7 Tiers</p>{Array.from({ length: 7 }).map((_, i) => (<div key={i} className="flex gap-2 mb-2 items-center"><span className="text-xs text-slate-400 w-8 text-center">{i+1}.</span><input name={`minQty${i}`} type="number" placeholder="Min Qty" defaultValue={editingPromotion?.tiers?.[i]?.minQty} className="flex-1 p-2 text-sm border rounded-lg"/><input name={`price${i}`} type="number" placeholder="Price/Unit" defaultValue={editingPromotion?.tiers?.[i]?.price} className="flex-1 p-2 text-sm border rounded-lg"/></div>))}</div>)}
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
                      <div className="flex gap-3 pt-2"><button type="button" onClick={()=>setIsPromotionModalOpen(false)} className="flex-1 py-2 border rounded-xl">{t.cancel}</button><button type="submit" className="flex-1 py-2 bg-sky-600 text-white rounded-xl">{t.save}</button></div>
                  </form>
              </div>
          </div>
      )}

      {/* Create Order Modal (Back Office) */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-4xl p-6 shadow-xl h-[85vh] flex flex-col md:flex-row gap-6 animate-in zoom-in-95">
             <div className="flex-1 flex flex-col border-r border-slate-100 md:pr-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-700"><Package size={20}/> {editingOrder ? 'Edit Order' : t.stock_add}</h3>
                <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input autoFocus value={skuSearch} onChange={e => setSkuSearch(e.target.value)} placeholder={t.pos_search_placeholder} className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 text-sm"/></div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">{products.filter(p => p.name.toLowerCase().includes(skuSearch.toLowerCase()) || p.code.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (<div key={p.id} onClick={() => addToCart(p, true)} className="flex justify-between items-center p-3 border border-slate-100 rounded-xl hover:bg-sky-50 cursor-pointer transition-colors group"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${p.color} overflow-hidden`}>{p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover"/> : p.name.charAt(0)}</div><div className="min-w-0"><p className="font-bold text-sm text-slate-700 truncate">{p.name}</p><p className="text-[10px] text-slate-400">{p.code} | Stock: {p.stock}</p></div></div><div className="font-bold text-sky-600 text-sm group-hover:scale-105 transition-transform">{formatCurrency(p.price, language)}</div></div>))}</div>
             </div>
             <div className="w-full md:w-80 flex flex-col">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-700"><User size={20}/> {t.order_customer}</h3>
                <div className="space-y-3 mb-4"><input placeholder={t.order_customer} value={newOrderCustomer.name} onChange={e => setNewOrderCustomer({...newOrderCustomer, name: e.target.value})} className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-sky-500"/><div className="flex gap-2"><input placeholder={t.setting_phone} value={newOrderCustomer.phone} onChange={e => setNewOrderCustomer({...newOrderCustomer, phone: e.target.value})} className="w-1/2 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-sky-500"/><select value={newOrderShipping.carrier} onChange={e => setNewOrderShipping({...newOrderShipping, carrier: e.target.value as LogisticsProvider})} className="w-1/2 p-2 text-sm border border-slate-200 rounded-lg outline-none bg-white">{LOGISTICS_PROVIDERS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div><textarea placeholder={t.setting_address} rows={2} value={newOrderCustomer.address} onChange={e => setNewOrderCustomer({...newOrderCustomer, address: e.target.value})} className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-sky-500 resize-none"/></div>
                <div className="flex-1 bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col min-h-0">
                   <h4 className="font-bold text-xs text-slate-500 uppercase mb-2">{t.pos_items} ({tempOrderCart.length})</h4>
                   <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {calculatedTempOrderCart.items.map((item, idx) => (
                         <div key={`${item.id}-${idx}`} className="bg-white p-2 rounded-lg border border-slate-100 flex justify-between items-center shadow-sm">
                            <div className="min-w-0 flex-1 mr-2"><p className="text-xs font-bold truncate">{item.name} {item.isFree && '(Free)'}</p><p className="text-[10px] text-slate-400">{item.quantity} x {formatCurrency(item.price, language)}</p></div>
                            <div className="flex items-center gap-1 shrink-0">{!item.isFree && <button onClick={() => updateQuantity(item.id, -1, true)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><Minus size={12}/></button>}<input type="number" min="1" value={item.quantity} onChange={(e) => setItemQuantity(item.id, parseInt(e.target.value) || 1, true)} className="w-12 text-center text-xs font-bold border border-slate-200 rounded mx-1 p-1 outline-none focus:border-sky-500"/>{!item.isFree && <button onClick={() => updateQuantity(item.id, 1, true)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><Plus size={12}/></button>}</div>
                         </div>
                      ))}
                      {tempOrderCart.length === 0 && <p className="text-center text-xs text-slate-400 py-8">{t.pos_empty_cart}</p>}
                   </div>
                   <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="flex justify-between font-bold text-lg mb-3"><span>{t.pos_net_total}</span><span className="text-sky-600">{formatCurrency(calculatedTempOrderCart.total, language)}</span></div>
                      <div className="flex gap-2"><button onClick={() => setIsOrderModalOpen(false)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-50">{t.cancel}</button><button onClick={handleSaveOrderBackOffice} disabled={tempOrderCart.length === 0} className="flex-1 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700 disabled:opacity-50">{editingOrder ? t.save : t.confirm}</button></div>
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