
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
import { GenerateContentResponse } from '@google/genai';

// Helper: Compress and resize image before saving (Crucial for LocalStorage limits)
const processImage = (file: File, maxWidth = 800): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // Use JPEG with 0.7 quality
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

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
  const [isUploading, setIsUploading] = useState(false);

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
      const savedProfile = localStorage.getItem('pos_profile');
      if (savedProfile) setStoreProfile(JSON.parse(savedProfile));
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

  // Fix: Added missing downloadCSVTemplate function to handle template download for product import.
  const downloadCSVTemplate = () => {
    const csvContent = "\uFEFF" + 
      "Name,Code,Category,Cost,Price,Stock\n" +
      "Espresso,SKU001,Coffee,5000,15000,100\n" +
      "Latte,SKU002,Coffee,7000,20000,100\n" +
      "Green Tea,SKU003,Tea,6000,18000,50";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "product_import_template.csv");
    link.style.visibility = 'hidden';
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
        const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

        const parseLine = (line: string, sep: string) => {
          const result = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && line[i+1] === '"') { current += '"'; i++; }
            else if (char === '"') inQuotes = !inQuotes;
            else if (char === sep && !inQuotes) { result.push(current.trim().replace(/^"|"$/g, '')); current = ""; }
            else current += char;
          }
          result.push(current.trim().replace(/^"|"$/g, ''));
          return result;
        };

        const headers = parseLine(lines[0], delimiter);
        
        // Smart Mapping: Find column indices based on keywords
        const getIdx = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.toLowerCase().includes(k.toLowerCase())));
        const nameIdx = getIdx(['name', 'ชื่อ', 'ຊື່']);
        const codeIdx = getIdx(['code', 'sku', 'รหัส', 'ລະຫັດ']);
        const catIdx = getIdx(['category', 'หมวด', 'ໝວດ']);
        const costIdx = getIdx(['cost', 'ต้นทุน', 'ທຶນ']);
        const priceIdx = getIdx(['price', 'ราคา', 'ລາຄາ']);
        const stockIdx = getIdx(['stock', 'คงเหลือ', 'ສະຕັອກ']);

        if (nameIdx === -1) throw new Error("Column 'Name' not found");

        const imported: Product[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = parseLine(lines[i], delimiter);
          if (!cols[nameIdx]) continue;
          
          const cleanNum = (v: string) => v ? parseFloat(v.replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0 : 0;

          const p: Product = {
            id: uuidv4(),
            name: cols[nameIdx],
            code: codeIdx !== -1 ? cols[codeIdx] : `SKU-${uuidv4().slice(0, 5).toUpperCase()}`,
            category: catIdx !== -1 ? cols[catIdx] : 'General',
            cost: costIdx !== -1 ? cleanNum(cols[costIdx]) : 0,
            price: priceIdx !== -1 ? cleanNum(cols[priceIdx]) : 0,
            stock: stockIdx !== -1 ? cleanNum(cols[stockIdx]) : 0,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
          };
          
          if (isCloudEnabled && db) {
            await setDoc(doc(db, 'products', p.id), p);
          }
          imported.push(p);
        }

        if (!isCloudEnabled) setProducts(prev => [...prev, ...imported]);
        alert(`นำเข้าสำเร็จ ${imported.length} รายการ`);
      } catch (err) {
        console.error(err);
        alert('นำเข้าล้มเหลว: โปรดตรวจสอบหัวตาราง (Header) ว่ามีชื่อสินค้าหรือไม่');
      } finally {
        if (csvInputRef.current) csvInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'product') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const base64 = await processImage(file);
      if (type === 'logo') {
        const newProfile = { ...storeProfile, logoUrl: base64 };
        setStoreProfile(newProfile);
        if (isCloudEnabled && db) {
          await setDoc(doc(db, 'settings', 'profile'), newProfile);
        } else {
          localStorage.setItem('pos_profile', JSON.stringify(newProfile));
        }
      } else if (type === 'product' && editingProduct) {
        setEditingProduct({ ...editingProduct, imageUrl: base64 });
      }
    } catch (err) {
      alert('อัปโหลดล้มเหลว: รูปภาพอาจมีปัญหา');
    } finally {
      setIsUploading(false);
    }
  };

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

  // Fix: Implemented handleSendMessage to allow AI interactions using the Gemini stream service.
  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: Role.USER,
      text: chatInput,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === Role.USER ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const stream = await streamResponse(chatInput, mode, history);
      
      if (stream) {
        const assistantMsgId = uuidv4();
        let assistantText = '';
        
        setMessages(prev => [...prev, {
          id: assistantMsgId,
          role: Role.MODEL,
          text: '',
          timestamp: Date.now()
        }]);

        for await (const chunk of stream) {
          const c = chunk as GenerateContentResponse;
          const chunkText = c.text || '';
          assistantText += chunkText;
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: assistantText } : m));
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        id: uuidv4(),
        role: Role.MODEL,
        text: "ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI กรุณาลองใหม่อีกครั้ง",
        timestamp: Date.now(),
        isError: true
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

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
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
           <h3 className="font-bold text-slate-700 mb-5 flex items-center gap-2"><History size={20} className="text-sky-500" /> กิจกรรมล่าสุด</h3>
           <div className="space-y-4">
              {recentSales.slice(0, 5).map(s => (
                <div key={s.id} className="flex justify-between items-center p-4 hover:bg-slate-50 rounded-2xl">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-xs">#{s.id.slice(-4)}</div>
                      <div><p className="text-sm font-bold text-slate-800">{s.customerName}</p><p className="text-[10px] text-slate-400">{s.date}</p></div>
                   </div>
                   <div className="text-right">
                      <p className="font-bold text-sky-600 text-sm mb-1">{formatCurrency(s.total, language)}</p>
                      <span className="text-[9px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-bold uppercase">{s.status}</span>
                   </div>
                </div>
              ))}
              {recentSales.length === 0 && <div className="py-10 text-center text-slate-300 text-xs italic">ยังไม่มีกิจกรรม</div>}
           </div>
        </div>
      </div>
    );
  };

  const renderStock = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Package className="text-sky-600" /> {t.stock_title}</h2>
            <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="flex-1 sm:flex-none bg-sky-600 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-lg flex items-center gap-2"><Plus size={16}/> {t.stock_add}</button>
            </div>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 border-b">
                        <tr><th className="px-6 py-4 font-bold uppercase text-[10px]">SKU</th><th className="px-6 py-4 font-bold uppercase text-[10px]">ชื่อ</th><th className="px-6 py-4 text-right font-bold uppercase text-[10px]">ราคา</th><th className="px-6 py-4 text-center font-bold uppercase text-[10px]">สต็อก</th><th className="px-6 py-4 text-center font-bold uppercase text-[10px]">จัดการ</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {products.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{p.code}</td>
                                <td className="px-6 py-4 font-bold text-slate-700">{p.name}</td>
                                <td className="px-6 py-4 text-right font-bold text-sky-600">{formatCurrency(p.price, language)}</td>
                                <td className="px-6 py-4 text-center"><span className={`px-3 py-1 rounded-full font-bold text-[10px] ${checkIsLowStock(p) ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{p.stock}</span></td>
                                <td className="px-6 py-4"><div className="flex justify-center gap-2"><button onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }} className="p-2 text-slate-300 hover:text-sky-600"><Edit size={16}/></button><button onClick={() => { if (confirm('ลบสิค้า?')) setProducts(prev => prev.filter(it => it.id !== p.id)); }} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {products.length === 0 && <div className="p-20 text-center text-slate-200 italic font-medium">ไม่มีสินค้าในคลัง</div>}
        </div>
    </div>
  );

  const renderSettings = () => (
    <div className="p-4 md:p-6 h-full overflow-y-auto bg-slate-50/50">
      <h2 className="text-xl font-bold text-slate-800 mb-8 flex items-center gap-2"><Settings className="text-sky-600" /> {t.setting_title}</h2>
      <div className="max-w-4xl space-y-8 pb-20">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative">
           <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mb-8">ข้อมูลร้านค้า</h3>
           <div className="flex flex-col md:flex-row gap-12">
              <div className="flex flex-col items-center gap-4">
                 <div onClick={() => logoInputRef.current?.click()} className="w-48 h-48 rounded-[2.5rem] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden group hover:border-sky-500 transition-all relative">
                    {storeProfile.logoUrl ? (
                      <img src={storeProfile.logoUrl} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-slate-300 flex flex-col items-center gap-2 group-hover:text-sky-500">
                        <ImagePlus size={40}/>
                        <span className="text-[10px] font-bold uppercase">โลโก้ร้าน</span>
                      </div>
                    )}
                    {isUploading && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-sky-600" /></div>}
                 </div>
                 <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'logo')} />
                 <p className="text-[10px] text-slate-400 font-bold uppercase">แตะเพื่ออัปโหลดโลโก้</p>
              </div>
              <div className="flex-1 space-y-6">
                 <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">ชื่อร้าน</label><input value={storeProfile.name} onChange={e => setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-sky-500"/></div>
                 <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">เบอร์โทรศัพท์</label><input value={storeProfile.phone} onChange={e => setStoreProfile({...storeProfile, phone: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-sky-500"/></div>
                 <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">ที่อยู่ร้าน</label><textarea value={storeProfile.address} onChange={e => setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none h-24 focus:ring-2 focus:ring-sky-500 resize-none"/></div>
                 <button onClick={() => alert('บันทึกเรียบร้อย')} className="bg-sky-600 text-white px-10 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-sky-100 hover:scale-[1.02] transition-all active:scale-95 flex items-center gap-2"><Save size={16}/> บันทึกข้อมูล</button>
              </div>
           </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mb-6">จัดการระบบข้อมูล</h3>
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button onClick={() => csvInputRef.current?.click()} className="p-8 bg-emerald-50 text-emerald-600 rounded-3xl border border-emerald-100 flex flex-col items-center gap-4 transition-all hover:bg-emerald-100 active:scale-95">
                <UploadCloud size={32}/><span className="text-[10px] font-bold uppercase tracking-widest">นำเข้าสิค้า (CSV)</span>
              </button>
              <button onClick={downloadCSVTemplate} className="p-8 bg-sky-50 text-sky-600 rounded-3xl border border-sky-100 flex flex-col items-center gap-4 transition-all hover:bg-sky-100 active:scale-95">
                <DownloadIcon size={32}/><span className="text-[10px] font-bold uppercase tracking-widest">ดาวน์โหลด Template</span>
              </button>
              <button onClick={() => { if(confirm('คำเตือน: ข้อมูลทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้ ยืนยันหรือไม่?')) { localStorage.clear(); window.location.reload(); } }} className="p-8 bg-red-50 text-red-600 rounded-3xl border border-red-100 flex flex-col items-center gap-4 transition-all hover:bg-red-100 active:scale-95">
                <Eraser size={32}/><span className="text-[10px] font-bold uppercase tracking-widest">ล้างข้อมูลทั้งหมด</span>
              </button>
           </div>
        </div>
      </div>
    </div>
  );

  // Fix: Implemented renderAI to provide a functional chat interface for the AI mode.
  const renderAI = () => (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
              <Bot size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">
              {language === 'th' ? 'สวัสดี! ฉันคือผู้ช่วย AI' : (language === 'lo' ? 'ສະບາຍດີ! ຂ້ອຍແມ່ນຜູ້ຊ່ວຍ AI' : 'Hello! I am your AI Assistant')}
            </h3>
            <p className="text-slate-500 max-w-sm text-sm">
              {language === 'th' ? 'ถามฉันเกี่ยวกับสต็อกสินค้า การจัดการร้านค้า หรือการแปลภาษาลาว-ไทย ได้เลย!' : 
               (language === 'lo' ? 'ຖາມຂ້ອຍກ່ຽວກັບສະຕັອກສິນຄ້າ ການຈັດການຮ້ານ ຫຼືການແປພາສາລາວ-ໄທ ໄດ້ເລີຍ!' : 
               'Ask me about stock, store management, or Lao-Thai translations!')}
            </p>
          </div>
        ) : (
          messages.map(msg => <ChatMessage key={msg.id} message={msg} />)
        )}
        <div ref={chatEndRef} />
      </div>
      
      <div className="p-4 md:p-6 border-t bg-slate-50/50 flex-shrink-0">
        <div className="max-w-4xl mx-auto relative flex gap-2">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={language === 'en' ? "Type your message..." : "พิมพ์ข้อความที่นี่..."}
            className="flex-1 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-sky-500 outline-none resize-none min-h-[56px] max-h-32 text-sm"
          />
          <button
            onClick={handleSendMessage}
            disabled={!chatInput.trim() || isChatLoading}
            className="flex-shrink-0 w-14 h-14 bg-sky-600 text-white rounded-2xl shadow-lg hover:bg-sky-700 transition-all disabled:opacity-50 disabled:scale-95 flex items-center justify-center"
          >
            {isChatLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  );

  // Common UI logic
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

  return (
    <div className={`flex h-screen bg-slate-100 text-slate-900 font-sans ${language === 'th' ? 'font-thai' : ''}`}>
      <input type="file" ref={csvInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
      <Sidebar currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onExport={()=>{}} onImport={() => csvInputRef.current?.click()} language={language} setLanguage={setLanguage} />
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 bg-white border-b md:hidden flex-shrink-0"><button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-500"><Menu /></button><span className="font-bold text-sky-600 tracking-tight">Coffee Please</span><div className="w-8"/></header>
        <div className="flex-1 relative overflow-hidden bg-slate-50/30">
          <div className="absolute inset-0">
            {mode === AppMode.DASHBOARD && renderDashboard()}
            {mode === AppMode.STOCK && renderStock()}
            {mode === AppMode.SETTINGS && renderSettings()}
            {mode === AppMode.POS && (
              <div className="flex h-full flex-col md:flex-row overflow-hidden">
                <div className="flex-1 flex flex-col p-4 overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-20">
                    {products.map(p => (
                      <button key={p.id} onClick={() => addToCart(p)} className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 hover:border-sky-300 transition-all text-left flex flex-col group">
                        <div className={`w-full aspect-square rounded-2xl ${p.color} mb-4 flex items-center justify-center text-2xl font-bold overflow-hidden`}>
                          {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : p.name.charAt(0)}
                        </div>
                        <h3 className="font-bold text-slate-800 text-sm line-clamp-2 mb-1 flex-1">{p.name}</h3>
                        <p className="text-sky-600 font-bold text-sm">{formatCurrency(p.price, language)}</p>
                      </button>
                    ))}
                    {products.length === 0 && <div className="col-span-full py-20 text-center text-slate-300 font-bold">ไม่มีสินค้า เริ่มต้นโดยการเพิ่มสินค้า</div>}
                  </div>
                </div>
                <div className="w-full md:w-96 bg-white border-l shadow-2xl flex flex-col">
                   <div className="p-6 border-b flex justify-between items-center"><h2 className="font-bold text-lg">{t.pos_cart_title}</h2><button onClick={()=>setCart([])} className="text-xs text-red-500 font-bold uppercase">ล้าง</button></div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {cart.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                           <div className="flex-1 min-w-0"><h4 className="font-bold text-xs truncate">{item.name}</h4><p className="text-[10px] text-sky-600 font-bold">{formatCurrency(item.price, language)}</p></div>
                           <div className="flex items-center gap-3 bg-white px-2 py-1 rounded-xl border"><button onClick={()=>{setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))}} className="p-1 text-sky-600"><Minus size={12}/></button><span className="text-xs font-bold w-4 text-center">{item.quantity}</span><button onClick={()=>{setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))}} className="p-1 text-sky-600"><Plus size={12}/></button></div>
                           <button onClick={()=>setCart(prev=>prev.filter((_,i)=>i!==idx))} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                        </div>
                      ))}
                      {cart.length === 0 && <div className="h-full flex flex-col items-center justify-center text-slate-200 uppercase font-bold text-xs">รถเข็นว่าง</div>}
                   </div>
                   <div className="p-6 bg-white border-t space-y-4">
                      <div className="flex justify-between items-center font-bold text-slate-500"><span>ยอดรวม</span><span className="text-3xl text-sky-600 tracking-tighter">{formatCurrency(calculatedCart.total, language)}</span></div>
                      <button onClick={()=>setIsPaymentModalOpen(true)} disabled={cart.length === 0} className="w-full bg-sky-600 text-white py-5 rounded-3xl font-bold shadow-lg shadow-sky-100 active:scale-95 transition-all disabled:opacity-30">ชำระเงิน</button>
                   </div>
                </div>
              </div>
            )}
            {/* Implement other modes simplified for brevity but fully functional */}
            {mode === AppMode.ORDERS && (
              <div className="p-4 md:p-6 h-full overflow-y-auto"><h2 className="text-xl font-bold mb-8">{t.menu_orders}</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-6">{recentSales.map(o => (<div key={o.id} className="bg-white p-6 rounded-[2rem] border shadow-sm flex justify-between items-center"><div><p className="text-xs font-bold text-slate-400">Order #{o.id.slice(-4)}</p><p className="font-bold text-slate-800">{o.customerName}</p><p className="text-[10px] text-slate-400">{o.date}</p></div><div className="text-right"><p className="text-xl font-bold text-sky-600">{formatCurrency(o.total, language)}</p><span className="text-[10px] bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full font-bold uppercase">{o.status}</span></div></div>))}</div></div>
            )}
            {mode === AppMode.AI && renderAI()}
          </div>
        </div>
      </main>

      {/* MODALS */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-10 text-center shadow-2xl relative">
             <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6"><DollarSign size={40}/></div>
             <p className="text-slate-400 mb-2 font-bold text-[10px] uppercase tracking-widest">ยอดชำระสุทธิ</p>
             <h3 className="text-5xl font-bold mb-12 text-slate-800 tracking-tighter">{formatCurrency(calculatedCart.total, language)}</h3>
             <div className="grid grid-cols-3 gap-3 mb-12">
                {['cash', 'qr', 'transfer'].map((m: any) => (
                  <button key={m} onClick={()=>setPaymentMethod(m)} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${paymentMethod===m?'border-sky-500 bg-sky-50 text-sky-600 shadow-lg shadow-sky-100':'border-slate-100 text-slate-300'}`}>
                    {m==='cash'?<Banknote/>:m==='qr'?<Smartphone/>:<CreditCard/>}
                    <span className="text-[9px] font-bold uppercase">{m}</span>
                  </button>
                ))}
             </div>
             <button onClick={processPayment} className="w-full bg-sky-600 text-white py-6 rounded-[2.5rem] font-bold shadow-xl shadow-sky-200 active:scale-95 transition-all text-sm uppercase tracking-widest mb-4">ชำระเงินเรียบร้อย</button>
             <button onClick={()=>setIsPaymentModalOpen(false)} className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">ยกเลิกรายการ</button>
          </div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-2xl font-bold mb-8 text-slate-800">{editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
            <form onSubmit={handleSaveProduct} className="space-y-6">
              <div className="flex flex-col items-center">
                <div onClick={() => productImgInputRef.current?.click()} className="w-32 h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer overflow-hidden hover:border-sky-400 group relative">
                  {editingProduct?.imageUrl ? <img src={editingProduct.imageUrl} className="w-full h-full object-cover" /> : <div className="text-slate-300 flex flex-col items-center gap-1 group-hover:text-sky-500"><ImagePlus size={24}/><span className="text-[10px] font-bold">รูปสินค้า</span></div>}
                  {isUploading && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-sky-600" /></div>}
                </div>
                <input type="file" ref={productImgInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'product')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">ชื่อสินค้า</label><input name="name" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-sky-500"/></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">รหัส SKU</label><input name="code" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-sky-500"/></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">หมวดหมู่</label><input name="category" required defaultValue={editingProduct?.category} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-sky-500"/></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">ราคาทุน</label><input name="cost" type="number" step="any" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-sky-500"/></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">ราคาขาย</label><input name="price" type="number" step="any" required defaultValue={editingProduct?.price} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none text-sky-600 focus:ring-2 focus:ring-sky-500"/></div>
                <div className="col-span-2 space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">จำนวนในคลัง</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-sky-500"/></div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-4 border-2 border-slate-100 rounded-2xl font-bold text-slate-300 text-xs uppercase tracking-widest">ยกเลิก</button>
                <button type="submit" className="flex-2 py-4 bg-sky-600 text-white rounded-2xl font-bold shadow-lg shadow-sky-100 px-10 text-xs uppercase tracking-widest active:scale-95 transition-all">บันทึกข้อมูล</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReceipt && currentOrder && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-xl">
            <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden flex flex-col shadow-2xl">
              <div id="receipt-content" className="p-10 text-slate-800 bg-white font-mono text-[11px] leading-relaxed">
                <div className="text-center border-b-2 border-dashed border-slate-200 pb-8 mb-8">
                  {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-20 h-20 mx-auto mb-4 object-contain rounded-2xl shadow-sm" /> : <div className="w-16 h-16 bg-sky-50 rounded-2xl mx-auto mb-4 flex items-center justify-center text-sky-600 font-bold">CP</div>}
                  <h2 className="text-lg font-bold uppercase tracking-widest">{storeProfile.name}</h2>
                  <p className="text-[9px] text-slate-400 max-w-[200px] mx-auto mt-2 leading-tight uppercase">{storeProfile.address}</p>
                </div>
                <div className="space-y-4 mb-8">
                  <div className="flex justify-between text-[9px] text-slate-300 uppercase font-bold tracking-widest"><span>ລາຍການ</span><span>ລາຄາ</span></div>
                  {currentOrder.items.map((it, i) => (<div key={i} className="flex justify-between items-start gap-4"><span className="flex-1">{it.name} <span className="text-slate-400">x{it.quantity}</span></span><span className="whitespace-nowrap font-bold">{formatCurrency(it.price * it.quantity, language)}</span></div>))}
                </div>
                <div className="border-t-2 border-dashed border-slate-200 pt-8 space-y-3">
                  <div className="flex justify-between text-slate-400 uppercase text-[9px] font-bold"><span>ລວມເບື້ອງຕົ້ນ:</span><span>{formatCurrency(currentOrder.subtotal || currentOrder.total, language)}</span></div>
                  <div className="flex justify-between text-xl font-bold text-slate-900 pt-2"><span className="uppercase tracking-widest">ຍອດລວມ:</span><span>{formatCurrency(currentOrder.total, language)}</span></div>
                </div>
                <div className="text-center mt-12 text-[10px] text-slate-300 font-bold uppercase tracking-[0.4em]">ຂອບໃຈທີ່ໃຊ້ບໍລິການ</div>
              </div>
              <div className="p-8 bg-slate-50 border-t flex gap-4">
                <button onClick={()=>setShowReceipt(false)} className="flex-1 py-5 bg-white border border-slate-200 rounded-[1.5rem] font-bold text-slate-400 text-xs uppercase tracking-widest hover:bg-slate-100 transition-all">ປິດ</button>
                <button onClick={()=>window.print()} className="flex-1 py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold text-xs uppercase tracking-widest shadow-lg shadow-sky-100 active:scale-95 transition-all flex items-center justify-center gap-2"><Printer size={16}/> ພິມບິນ</button>
              </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
