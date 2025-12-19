
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, Search, ShoppingCart, Plus, Minus, Trash2, 
  CreditCard, Banknote, Printer, Save, Edit, Loader2, Send, Sparkles, Store, Check, Bot,
  LayoutDashboard, Settings, UploadCloud, FileDown, ImagePlus, AlertTriangle, TrendingUp, DollarSign, Package,
  ClipboardList, Truck, MapPin, Phone, User, X, BarChart3, Wallet, PieChart, ChevronRight, History, DatabaseBackup,
  Calendar, Gift, Tag, RefreshCw, Eraser, Cloud, CloudOff, Info, ArrowUpCircle, Filter, Wifi,
  Download, Upload, Smartphone, Percent, Box, TruckIcon, CheckCircle2, Clock, FileSpreadsheet, ChevronDown,
  FileDown as DownloadIcon, PackageOpen, ShoppingBag
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { streamResponse } from './services/gemini';
import { Message, Role, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, Promotion, PromotionType, Language } from './types';
import { translations } from './translations';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import { db, collection, updateDoc, deleteDoc, doc, setDoc, onSnapshot, query, orderBy } from './services/firebase';

const formatCurrency = (amount: number, lang: Language) => {
  try {
    return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : (lang === 'en' ? 'en-US' : 'lo-LA'), { 
      style: 'currency', 
      currency: 'LAK', 
      maximumFractionDigits: 0 
    }).format(amount);
  } catch (e) {
    return amount.toString();
  }
};

const checkIsLowStock = (product: Product): boolean => (product.stock || 0) <= 5;

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
  const productImgInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveProductData = async (product: Product) => {
    if (isCloudEnabled && db) {
      await setDoc(doc(db, 'products', product.id), product);
    } else {
      setProducts(prev => {
        const exists = prev.find(p => p.id === product.id);
        return exists ? prev.map(p => p.id === product.id ? product : p) : [...prev, product];
      });
    }
  };

  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const product: Product = {
      id: editingProduct?.id || uuidv4(),
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      category: formData.get('category') as string,
      cost: parseFloat(formData.get('cost') as string) || 0,
      price: parseFloat(formData.get('price') as string) || 0,
      stock: parseInt(formData.get('stock') as string) || 0,
      color: editingProduct?.color || COLORS[Math.floor(Math.random() * COLORS.length)],
      imageUrl: editingProduct?.imageUrl,
    };
    await saveProductData(product);
    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  const downloadCSVTemplate = () => {
    const headers = ["Product Name", "SKU Code", "Category", "Cost Price", "Sale Price", "Stock Quantity"];
    const example = ["Americano", "COFFEE-01", "Drink", "5000", "15000", "50"];
    const csvContent = "\uFEFF" + [headers.join(","), example.join(",")].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "product_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target?.result as string;
        text = text.replace(/^\uFEFF/, '').trim(); 
        if (!text) throw new Error("Empty");

        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        const firstLine = lines[0];
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semiCount = (firstLine.match(/;/g) || []).length;
        const delimiter = semiCount > commaCount ? ';' : ',';

        const parseLine = (line: string, sep: string) => {
          const result = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && line[i+1] === '"') { current += '"'; i++; }
            else if (char === '"') inQuotes = !inQuotes;
            else if (char === sep && !inQuotes) { 
              result.push(current.trim().replace(/^"|"$/g, '')); 
              current = ""; 
            }
            else current += char;
          }
          result.push(current.trim().replace(/^"|"$/g, ''));
          return result;
        };

        const firstRow = parseLine(lines[0], delimiter);
        const headerKeywords = ['name', 'product', 'สินค้า', 'ชื่อ', 'รหัส', 'sku'];
        const isHeader = firstRow.some(val => headerKeywords.some(k => val.toLowerCase().includes(k)));
        const dataStartIdx = isHeader ? 1 : 0;

        let added = 0;
        const newItems: Product[] = [];

        for (let i = dataStartIdx; i < lines.length; i++) {
          const cols = parseLine(lines[i], delimiter);
          if (cols.length < 2 || !cols[0]) continue;

          const cleanNum = (v: string) => parseFloat(v.replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

          const p: Product = {
            id: uuidv4(),
            name: cols[0],
            code: cols[1] || `SKU-${uuidv4().slice(0, 5).toUpperCase()}`,
            category: cols[2] || 'General',
            cost: cleanNum(cols[3]),
            price: cleanNum(cols[4]),
            stock: cleanNum(cols[5]),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
          };
          
          if (isCloudEnabled && db) {
            await setDoc(doc(db, 'products', p.id), p);
          }
          newItems.push(p);
          added++;
        }
        
        if (!isCloudEnabled) {
          setProducts(prev => [...prev, ...newItems]);
        }
        alert(`นำเข้าเรียบร้อย ${added} รายการ`);
      } catch (err) {
        alert('นำเข้าล้มเหลว: โปรดใช้ Template CSV และตรวจสอบว่าเป็น UTF-8');
      } finally {
        if (csvInputRef.current) csvInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'product') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      if (type === 'logo') {
        const updatedProfile = { ...storeProfile, logoUrl: result };
        setStoreProfile(updatedProfile);
        if (isCloudEnabled && db) {
          await setDoc(doc(db, 'settings', 'profile'), updatedProfile);
        } else {
          localStorage.setItem('pos_profile', JSON.stringify(updatedProfile));
        }
        alert('อัปโหลดโลโก้เรียบร้อย');
      } else if (type === 'product') {
        if (editingProduct) {
          setEditingProduct(prev => prev ? { ...prev, imageUrl: result } : null);
        } else {
          // หากเป็นการอัปโหลดรูปขณะเพิ่มสินค้าใหม่
          const tempId = document.querySelector('input[name="temp_img_id"]') as HTMLInputElement;
          if (tempId) tempId.value = result;
        }
      }
    };
    reader.readAsDataURL(file);
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
      customerName: language === 'th' ? 'ลูกค้าทั่วไป' : 'General Customer',
    };
    try {
      if (isCloudEnabled && db) {
        await setDoc(doc(db, 'sales', orderId), newOrder);
        for (const item of cart) {
          const product = products.find(p => p.id === item.id);
          if (product) await updateDoc(doc(db, 'products', product.id), { stock: Math.max(0, product.stock - item.quantity) });
        }
      } else {
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
      alert("ชำระเงินไม่สำเร็จ");
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (isCloudEnabled && db) await updateDoc(doc(db, 'sales', orderId), { status: newStatus });
    else setRecentSales(prev => prev.map(s => s.id === orderId ? { ...s, status: newStatus } : s));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg: Message = { id: uuidv4(), role: Role.USER, text: chatInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);
    const modelMsgId = uuidv4();
    setMessages(prev => [...prev, { id: modelMsgId, role: Role.MODEL, text: '', timestamp: Date.now() }]);
    try {
      const history = messages.map(m => ({ role: m.role === Role.USER ? 'user' : 'model', parts: [{ text: m.text }] }));
      const stream = await streamResponse(userMsg.text, mode, history);
      if (stream) {
        let fullText = '';
        for await (const chunk of stream) {
          fullText += chunk.text || '';
          setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, text: fullText } : m));
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, text: 'การเชื่อมต่อผิดพลาด', isError: true } : m));
    } finally {
      setIsChatLoading(false);
    }
  };

  // RENDER FUNCTIONS
  const renderDashboard = () => {
    const totalSales = recentSales.reduce((s, o) => s + o.total, 0);
    const stockValueCost = products.reduce((s, p) => s + (p.cost * p.stock), 0);
    const lowStockCount = products.filter(checkIsLowStock).length;
    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">{t.dash_sales_month}</p><h3 className="text-2xl font-bold text-sky-600 tracking-tight">{formatCurrency(totalSales, language)}</h3></div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">{t.dash_stock_value}</p><h3 className="text-2xl font-bold text-amber-600 tracking-tight">{formatCurrency(stockValueCost, language)}</h3></div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">ออเดอร์ทั้งหมด</p><h3 className="text-2xl font-bold text-emerald-600 tracking-tight">{recentSales.length}</h3></div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">{t.dash_low_stock}</p><h3 className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>{lowStockCount}</h3></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"><h3 className="font-bold text-slate-700 mb-5 flex items-center gap-2"><History size={20} className="text-sky-500" /> กิจกรรมล่าสุด</h3><div className="space-y-4">{recentSales.slice(0, 5).map(s => (<div key={s.id} className="flex justify-between items-center p-4 hover:bg-slate-50 rounded-2xl"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-xs">#{s.id.slice(-4)}</div><div><p className="text-sm font-bold text-slate-800">{s.customerName}</p><p className="text-[10px] text-slate-400">{s.date}</p></div></div><div className="text-right"><p className="font-bold text-sky-600 text-sm mb-1">{formatCurrency(s.total, language)}</p><span className="text-[9px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-bold uppercase">{s.status}</span></div></div>))}{recentSales.length === 0 && <div className="py-10 text-center text-slate-300 text-xs italic">ยังไม่มีกิจกรรม</div>}</div></div>
      </div>
    );
  };

  const renderPOS = () => {
    const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];
    const filteredProducts = products.filter(p => (selectedCategory === 'All' || p.category === selectedCategory) && (p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase())));
    return (
      <div className="flex h-full flex-col md:flex-row overflow-hidden bg-slate-50/50">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 bg-white border-b space-y-3"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t.pos_search_placeholder} className="w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-sky-500 text-sm"/></div><div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">{categories.map(cat => (<button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-sky-600 text-white shadow-lg' : 'bg-white border text-slate-500'}`}>{cat === 'All' ? t.pos_all_cat : cat}</button>))}</div></div>
          <div className="flex-1 p-4 overflow-y-auto"><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">{filteredProducts.map(p => (<button key={p.id} onClick={() => addToCart(p)} className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 hover:border-sky-300 transition-all text-left flex flex-col h-full group"><div className={`w-full aspect-square rounded-2xl ${p.color} mb-4 flex items-center justify-center text-2xl font-bold overflow-hidden`}>{p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : p.name.charAt(0)}</div><h3 className="font-bold text-slate-800 text-sm line-clamp-2 mb-1 flex-1">{p.name}</h3><div className="flex justify-between items-center mt-2"><p className="text-sky-600 font-bold text-sm">{formatCurrency(p.price, language)}</p><span className="text-[10px] text-slate-300 font-mono">{p.stock}</span></div></button>))}</div></div>
        </div>
        <div className="w-full md:w-96 bg-white border-l flex flex-col shadow-2xl z-10">
           <div className="p-5 border-b flex justify-between items-center font-bold text-lg"><h2>{t.pos_cart_title}</h2><button onClick={() => setCart([])} className="text-xs text-red-500 uppercase">ล้าง</button></div>
           <div className="flex-1 overflow-y-auto p-4 space-y-3">{cart.map((item, idx) => (<div key={idx} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100"><div className="flex-1 min-w-0"><h4 className="font-bold text-xs truncate">{item.name}</h4><p className="text-[10px] font-bold text-sky-600">{formatCurrency(item.price, language)}</p></div><div className="flex items-center gap-3 bg-white rounded-xl px-2 py-1 border shadow-sm"><button onClick={() => { setCart(prev => prev.map((i, ix) => ix === idx ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i)); }} className="p-1 text-sky-600"><Minus size={12} /></button><span className="w-5 text-center text-xs font-bold">{item.quantity}</span><button onClick={() => { setCart(prev => prev.map((i, ix) => ix === idx ? { ...i, quantity: i.quantity + 1 } : i)); }} className="p-1 text-sky-600"><Plus size={12} /></button></div><button onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button></div>))}</div>
           <div className="p-6 bg-white border-t space-y-4"><div className="flex justify-between items-center"><span className="font-bold text-slate-500">รวม</span><span className="text-3xl font-bold text-sky-600">{formatCurrency(calculatedCart.total, language)}</span></div><button onClick={() => setIsPaymentModalOpen(true)} disabled={cart.length === 0} className="w-full bg-sky-600 text-white py-4 rounded-2xl font-bold">ชำระเงิน</button></div>
        </div>
      </div>
    );
  };

  const renderStock = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h2 className="text-xl font-bold flex items-center gap-2"><Package className="text-sky-600" /> {t.stock_title}</h2>
            <div className="flex gap-2">
                <button onClick={downloadCSVTemplate} className="bg-sky-50 text-sky-600 px-4 py-2 rounded-2xl text-xs font-bold border border-sky-100 flex items-center gap-2"><DownloadIcon size={16}/> Template CSV</button>
                <button onClick={() => csvInputRef.current?.click()} className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-2xl text-xs font-bold border border-emerald-100 flex items-center gap-2"><UploadCloud size={16}/> นำเข้า</button>
                <button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="bg-sky-600 text-white px-5 py-2 rounded-2xl text-xs font-bold shadow-lg flex items-center gap-2"><Plus size={16}/> เพิ่มสินค้า</button>
            </div>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">SKU</th><th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">ชื่อ</th><th className="px-6 py-4 text-right font-bold uppercase tracking-widest text-[10px]">ราคา</th><th className="px-6 py-4 text-center font-bold uppercase tracking-widest text-[10px]">คงเหลือ</th><th className="px-6 py-4 text-center font-bold uppercase tracking-widest text-[10px]">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-50">{products.map(p => (<tr key={p.id} className="hover:bg-slate-50/50"><td className="px-6 py-4 font-mono text-[10px]">{p.code}</td><td className="px-6 py-4 font-bold">{p.name}</td><td className="px-6 py-4 text-right text-sky-600 font-bold">{formatCurrency(p.price, language)}</td><td className="px-6 py-4 text-center"><span className={`px-3 py-1 rounded-full font-bold text-[10px] ${checkIsLowStock(p) ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{p.stock}</span></td><td className="px-6 py-4 flex justify-center gap-2"><button onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }} className="p-2 text-slate-300 hover:text-sky-600"><Edit size={16}/></button><button onClick={() => { if (confirm('ลบ?')) setProducts(prev => prev.filter(it => it.id !== p.id)); }} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div></div>
    </div>
  );

  const renderSettings = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
      <h2 className="text-xl font-bold mb-8 flex items-center gap-2"><Settings className="text-sky-600" /> {t.setting_title}</h2>
      <div className="max-w-4xl space-y-8">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
           <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-[0.3em] mb-8">ตั้งค่าร้านค้า</h3>
           <div className="flex flex-col md:flex-row gap-12">
              <div className="flex flex-col items-center gap-4">
                 <div onClick={() => logoInputRef.current?.click()} className="w-48 h-48 rounded-[2rem] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden hover:border-sky-500 transition-all">
                    {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <div className="text-slate-300 flex flex-col items-center gap-2"><ImagePlus size={40}/><span className="text-[10px] font-bold uppercase">อัปโหลดโลโก้</span></div>}
                 </div>
                 <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'logo')} />
              </div>
              <div className="flex-1 space-y-6">
                 <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">ชื่อร้าน</label><input value={storeProfile.name} onChange={e => setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-sky-500"/></div>
                 <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">เบอร์โทร</label><input value={storeProfile.phone} onChange={e => setStoreProfile({...storeProfile, phone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-sky-500"/></div>
                 <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">ที่อยู่</label><textarea value={storeProfile.address} onChange={e => setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none h-24 focus:ring-2 focus:ring-sky-500 resize-none"/></div>
                 <button onClick={() => alert('บันทึกเรียบร้อย')} className="bg-sky-600 text-white px-10 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-sky-100 hover:scale-[1.02] transition-all">บันทึกข้อมูล</button>
              </div>
           </div>
        </div>
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
           <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mb-6">จัดการฐานข้อมูล</h3>
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button onClick={() => csvInputRef.current?.click()} className="p-6 bg-emerald-50 text-emerald-600 rounded-3xl border border-emerald-100 flex flex-col items-center gap-3"><Upload size={24}/><span className="text-[10px] font-bold uppercase">นำเข้า CSV</span></button>
              <button onClick={() => { if(confirm('รีเซ็ตทั้งหมด?')) { localStorage.clear(); window.location.reload(); } }} className="p-6 bg-red-50 text-red-600 rounded-3xl border border-red-100 flex flex-col items-center gap-3"><Eraser size={24}/><span className="text-[10px] font-bold uppercase tracking-widest">Factory Reset</span></button>
           </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`flex h-screen bg-slate-100 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <input type="file" ref={csvInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
      <Sidebar currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onExport={()=>{}} onImport={() => csvInputRef.current?.click()} language={language} setLanguage={setLanguage} />
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 bg-white border-b md:hidden flex-shrink-0"><button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-500"><Menu /></button><span className="font-bold text-sky-600">Coffee Please</span><div className="w-8"/></header>
        <div className="flex-1 relative overflow-hidden bg-slate-50/30">
          <div className="absolute inset-0 overflow-y-auto">
            {mode === AppMode.DASHBOARD && renderDashboard()}
            {mode === AppMode.POS && renderPOS()}
            {mode === AppMode.ORDERS && (
                <div className="p-4 md:p-6 h-full overflow-y-auto">
                  <h2 className="text-xl font-bold mb-8 flex items-center gap-2 text-slate-800"><ClipboardList className="text-sky-600" /> {t.menu_orders}</h2>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">{recentSales.map(order => (<div key={order.id} className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm"><div className="flex justify-between items-start mb-6"><div><h4 className="font-bold text-slate-800">ออเดอร์ #{order.id.slice(-4)}</h4><p className="text-[10px] text-slate-400">{order.date}</p></div><select value={order.status} onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)} className="bg-sky-50 text-sky-700 text-[10px] font-bold px-3 py-1 rounded-full">{ORDER_STATUS_STEPS.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div className="flex justify-between items-center pt-4 border-t"><span className="text-xs font-bold text-slate-500">{order.customerName}</span><span className="text-lg font-bold text-sky-600">{formatCurrency(order.total, language)}</span></div></div>))}</div>
                </div>
            )}
            {mode === AppMode.STOCK && renderStock()}
            {mode === AppMode.SETTINGS && renderSettings()}
            {mode === AppMode.AI && (
              <div className="h-full flex flex-col bg-white">
                <div className="p-4 border-b flex items-center gap-3"><Bot size={20}/><h2 className="font-bold">{t.menu_ai}</h2></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">{messages.map(m => <ChatMessage key={m.id} message={m} />)}{isChatLoading && <div className="text-xs text-sky-600 animate-pulse font-bold">AI กำลังคิด...</div>}<div ref={chatEndRef} /></div>
                <div className="p-4 border-t bg-slate-50"><form onSubmit={handleSendMessage} className="flex gap-2 max-w-4xl mx-auto"><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="พิมพ์คำถาม..." className="flex-1 p-4 bg-white border rounded-2xl outline-none"/><button type="submit" className="bg-sky-600 text-white p-4 rounded-2xl"><Send size={20}/></button></form></div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODALS */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 text-center shadow-2xl"><div className="w-16 h-16 bg-sky-50 text-sky-600 rounded-3xl flex items-center justify-center mx-auto mb-6"><DollarSign size={32}/></div><p className="text-slate-400 mb-1 font-bold text-[10px] uppercase">ยอดชำระ</p><h3 className="text-4xl font-bold mb-10 text-slate-800">{formatCurrency(calculatedCart.total, language)}</h3><div className="grid grid-cols-3 gap-3 mb-10"><button onClick={()=>setPaymentMethod('cash')} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='cash'?'border-sky-500 bg-sky-50 text-sky-600':'border-slate-50 text-slate-400'}`}><Banknote size={24}/><span className="text-[9px] font-bold">เงินสด</span></button><button onClick={()=>setPaymentMethod('qr')} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='qr'?'border-sky-500 bg-sky-50 text-sky-600':'border-slate-50 text-slate-400'}`}><Smartphone size={24}/><span className="text-[9px] font-bold">QR</span></button><button onClick={()=>setPaymentMethod('transfer')} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='transfer'?'border-sky-500 bg-sky-50 text-sky-600':'border-slate-50 text-slate-400'}`}><CreditCard size={24}/><span className="text-[9px] font-bold">โอน</span></button></div><button onClick={processPayment} className="w-full bg-sky-600 text-white py-5 rounded-[2rem] font-bold shadow-xl active:scale-95 transition-all">ชำระเงินเรียบร้อย</button><button onClick={()=>setIsPaymentModalOpen(false)} className="w-full py-2 text-slate-400 text-xs font-bold uppercase">ยกเลิก</button></div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-6 text-slate-800">{editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
            <form onSubmit={handleSaveProduct} className="space-y-5">
              <div className="flex flex-col items-center mb-4">
                <div onClick={() => productImgInputRef.current?.click()} className="w-32 h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer overflow-hidden hover:border-sky-400">
                  {editingProduct?.imageUrl ? <img src={editingProduct.imageUrl} className="w-full h-full object-cover" /> : <div className="text-slate-300 flex flex-col items-center gap-1"><ImagePlus size={24}/><span className="text-[9px] font-bold">รูปสินค้า</span></div>}
                </div>
                <input type="file" ref={productImgInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'product')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">ชื่อสินค้า</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none"/></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">รหัส SKU</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none"/></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">หมวดหมู่</label><input name="category" required defaultValue={editingProduct?.category} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none"/></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">ราคาทุน</label><input name="cost" type="number" required defaultValue={editingProduct?.cost} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none"/></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">ราคาขาย</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none text-sky-600"/></div>
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">สต็อก</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none"/></div>
              </div>
              <div className="flex gap-3 pt-4"><button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-4 border rounded-2xl font-bold text-slate-400 text-xs">ยกเลิก</button><button type="submit" className="flex-2 py-4 bg-sky-600 text-white rounded-2xl font-bold shadow-lg px-10 text-xs">บันทึก</button></div>
            </form>
          </div>
        </div>
      )}

      {showReceipt && currentOrder && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-xl">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl">
              <div id="receipt-content" className="p-10 text-slate-800 bg-white font-mono text-[11px] leading-relaxed">
                <div className="text-center border-b-2 border-dashed border-slate-200 pb-6 mb-6">
                  {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-16 h-16 mx-auto mb-4 object-contain rounded-xl shadow-sm" /> : <div className="w-12 h-12 bg-sky-50 rounded-xl mx-auto mb-4 flex items-center justify-center text-sky-600 font-bold">CP</div>}
                  <h2 className="text-lg font-bold uppercase tracking-widest">{storeProfile.name}</h2>
                  <p className="text-[9px] text-slate-400 max-w-[200px] mx-auto mt-2 leading-tight uppercase">{storeProfile.address}</p>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-[9px] text-slate-400 uppercase font-bold tracking-widest"><span>รายการ</span><span>ราคา</span></div>
                  {currentOrder.items.map((it, i) => (<div key={i} className="flex justify-between items-start gap-4"><span className="flex-1">{it.name} <span className="text-slate-400">x{it.quantity}</span></span><span className="whitespace-nowrap font-bold">{formatCurrency(it.price * it.quantity, language)}</span></div>))}
                </div>
                <div className="border-t-2 border-dashed border-slate-200 mt-6 pt-6 space-y-2">
                  <div className="flex justify-between text-slate-400 uppercase text-[9px] font-bold"><span>รวมเบื้องต้น:</span><span>{formatCurrency(currentOrder.subtotal || currentOrder.total, language)}</span></div>
                  <div className="flex justify-between text-lg font-bold text-slate-900 pt-2"><span className="uppercase tracking-widest">ยอดรวมสุทธิ:</span><span>{formatCurrency(currentOrder.total, language)}</span></div>
                </div>
                <div className="text-center mt-10 text-[9px] text-slate-300 font-bold uppercase tracking-[0.3em]">Thank You • ຂອບໃຈ</div>
              </div>
              <div className="p-6 bg-slate-50 border-t flex gap-3"><button onClick={()=>setShowReceipt(false)} className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-400 text-xs uppercase tracking-widest hover:bg-slate-100 transition-all">ปิด</button><button onClick={()=>window.print()} className="flex-1 py-4 bg-sky-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-sky-100 active:scale-95 transition-all flex items-center justify-center gap-2"><Printer size={16}/> พิมพ์</button></div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
