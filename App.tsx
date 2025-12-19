
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

// Helper: Aggressive Image Compression for reliable storage
const processImage = (file: File, maxWidth = 400): Promise<string> => {
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
        resolve(canvas.toDataURL('image/jpeg', 0.6));
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
  
  // Cloud Control State
  const [isCloudActive, setIsCloudActive] = useState<boolean>(() => {
    const hasConfig = !!localStorage.getItem('pos_firebase_config') || !!(process.env as any).FIREBASE_CONFIG;
    const forceLocal = localStorage.getItem('pos_force_local') === 'true';
    return hasConfig && !forceLocal;
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile>(INITIAL_PROFILE);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingCSV, setIsProcessingCSV] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qr' | 'transfer'>('cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<SaleRecord | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const productImgInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const t = translations[language];

  // Data Loading Lifecycle
  useEffect(() => {
    let unsubscribes: (() => void)[] = [];

    if (isCloudActive && db) {
      try {
        unsubscribes.push(onSnapshot(collection(db, 'products'), (snap) => setProducts(snap.docs.map(d => ({ ...d.data(), id: d.id } as Product)))));
        unsubscribes.push(onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc')), (snap) => setRecentSales(snap.docs.map(d => ({ ...d.data(), id: d.id } as SaleRecord)))));
        unsubscribes.push(onSnapshot(doc(db, 'settings', 'profile'), (docSnap) => { if (docSnap.exists()) setStoreProfile(docSnap.data() as StoreProfile); }));
        setIsDataLoaded(true);
      } catch (e) {
        console.error("Cloud connection failed, falling back to local", e);
        setIsCloudActive(false);
      }
    } else {
      setProducts(JSON.parse(localStorage.getItem('pos_products') || '[]'));
      setRecentSales(JSON.parse(localStorage.getItem('pos_sales') || '[]'));
      const savedProfile = localStorage.getItem('pos_profile');
      if (savedProfile) setStoreProfile(JSON.parse(savedProfile));
      setIsDataLoaded(true);
    }
    return () => unsubscribes.forEach(unsub => unsub());
  }, [isCloudActive]);

  // Persist Local Changes
  useEffect(() => {
    if (!isCloudActive && isDataLoaded) {
      localStorage.setItem('pos_products', JSON.stringify(products));
      localStorage.setItem('pos_sales', JSON.stringify(recentSales));
      localStorage.setItem('pos_profile', JSON.stringify(storeProfile));
    }
  }, [products, recentSales, storeProfile, isDataLoaded, isCloudActive]);

  const saveProductData = async (product: Product) => {
    if (isCloudActive && db) {
      try {
        await setDoc(doc(db, 'products', product.id), product);
      } catch (err: any) {
        if (err.code === 'permission-denied') {
          alert("สิทธิ์ Cloud ถูกปฏิเสธ: ระบบจะบันทึกไว้ในเครื่องนี้แทนโดยอัตโนมัติ");
          setIsCloudActive(false);
          localStorage.setItem('pos_force_local', 'true');
        }
      }
    }
    setProducts(prev => {
      const exists = prev.find(p => p.id === product.id);
      return exists ? prev.map(p => p.id === product.id ? product : p) : [...prev, product];
    });
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingCSV(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target?.result as string;
        text = text.replace(/^\ufeff/i, "").trim(); 
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
        if (lines.length < 1) throw new Error("ไม่พบข้อมูลในไฟล์");

        const delimiters = [",", ";", "\t"];
        const delimiter = delimiters.reduce((prev, curr) => (lines[0].split(curr).length > lines[0].split(prev).length ? curr : prev));

        const parseCSVRow = (row: string, d: string) => {
          const cells = []; let cur = ""; let q = false;
          for (let i = 0; i < row.length; i++) {
            const c = row[i];
            if (c === '"' && row[i+1] === '"') { cur += '"'; i++; }
            else if (c === '"') q = !q;
            else if (c === d && !q) { cells.push(cur.trim().replace(/^"|"$/g, "")); cur = ""; }
            else cur += c;
          }
          cells.push(cur.trim().replace(/^"|"$/g, ""));
          return cells;
        };

        const nameKeywords = ['ชื่อ', 'ชื่', 'name', 'product', 'สินค้า', 'ລາຍການ'];
        let headerIdx = -1; let map = { name: -1, code: -1, price: -1, stock: -1 };

        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          const cells = parseCSVRow(lines[i], delimiter);
          const found = cells.findIndex(c => nameKeywords.some(k => c.toLowerCase().includes(k.toLowerCase())));
          if (found !== -1) {
            headerIdx = i;
            map.name = found;
            map.code = cells.findIndex(c => ['รหัส', 'sku', 'code', 'id'].some(k => c.toLowerCase().includes(k)));
            map.price = cells.findIndex(c => ['ราคา', 'price', 'ລາຄາ'].some(k => c.toLowerCase().includes(k)));
            map.stock = cells.findIndex(c => ['สต็อก', 'stock', 'ຈຳນວນ'].some(k => c.toLowerCase().includes(k)));
            break;
          }
        }

        if (headerIdx === -1) throw new Error("ไม่พบหัวตาราง 'ชื่อสินค้า'");

        const newItems: Product[] = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const cells = parseCSVRow(lines[i], delimiter);
          if (!cells[map.name]) continue;
          const p: Product = {
            id: uuidv4(),
            name: cells[map.name],
            code: map.code !== -1 && cells[map.code] ? cells[map.code] : `SKU-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
            category: "General",
            cost: 0,
            price: map.price !== -1 ? parseFloat(cells[map.price].replace(/[^\d.-]/g, '')) || 0 : 0,
            stock: map.stock !== -1 ? parseInt(cells[map.stock].replace(/[^\d.-]/g, '')) || 0 : 0,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
          };
          
          if (isCloudActive && db) {
            try { await setDoc(doc(db, 'products', p.id), p); } catch (e) { console.error("Cloud save failed", e); }
          }
          newItems.push(p);
        }

        setProducts(prev => [...prev, ...newItems]);
        alert(`นำเข้าสำเร็จ ${newItems.length} รายการ`);
      } catch (err: any) {
        alert("ขัดข้อง: " + err.message);
      } finally {
        setIsProcessingCSV(false);
        if (csvInputRef.current) csvInputRef.current.value = "";
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
        const prof = { ...storeProfile, logoUrl: base64 };
        setStoreProfile(prof);
        if (isCloudActive && db) try { await setDoc(doc(db, 'settings', 'profile'), prof); } catch(e){}
      } else if (type === 'product' && editingProduct) {
        setEditingProduct({ ...editingProduct, imageUrl: base64 });
      }
    } catch (err) { alert("จัดการรูปภาพไม่สำเร็จ"); }
    finally { setIsUploading(false); }
  };

  const renderDashboard = () => (
    <div className="p-4 md:p-8 h-full overflow-y-auto bg-slate-50/50">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
        <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-2 border ${isCloudActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
          <div className={`w-2 h-2 rounded-full ${isCloudActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
          {isCloudActive ? 'Cloud Online' : 'Local Mode'}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">{t.dash_sales_month}</p><h3 className="text-2xl font-bold text-sky-600">{formatCurrency(recentSales.reduce((s, o) => s + o.total, 0), language)}</h3></div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">{t.dash_stock_value}</p><h3 className="text-2xl font-bold text-amber-600">{formatCurrency(products.reduce((s, p) => s + (p.cost * p.stock), 0), language)}</h3></div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">ออเดอร์</p><h3 className="text-2xl font-bold text-emerald-600">{recentSales.length}</h3></div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">ของใกล้หมด</p><h3 className="text-2xl font-bold text-rose-500">{products.filter(checkIsLowStock).length}</h3></div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="p-4 md:p-8 h-full overflow-y-auto">
      <h2 className="text-2xl font-bold mb-10 flex items-center gap-3 text-slate-800"><Settings className="text-sky-600" /> {t.setting_title}</h2>
      <div className="max-w-4xl space-y-10 pb-20">
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">การเชื่อมต่อ</h3>
            <button 
              onClick={() => {
                const newVal = !isCloudActive;
                setIsCloudActive(newVal);
                localStorage.setItem('pos_force_local', newVal ? 'false' : 'true');
                window.location.reload();
              }}
              className={`px-6 py-2 rounded-2xl text-[10px] font-bold transition-all ${isCloudActive ? 'bg-sky-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}
            >
              {isCloudActive ? 'เชื่อมต่อ Cloud อยู่' : 'ใช้ระบบ Local (ออฟไลน์)'}
            </button>
          </div>
          {isCloudActive && <div className="p-4 bg-emerald-50 text-emerald-700 text-xs rounded-2xl flex items-center gap-2 mb-8"><Check size={16}/> เชื่อมต่อ Firebase สำเร็จ ข้อมูลจะซิงค์อัตโนมัติ</div>}
          <div className="flex flex-col md:flex-row gap-12">
            <div className="flex flex-col items-center gap-4">
              <div onClick={() => logoInputRef.current?.click()} className="w-48 h-48 rounded-[3rem] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden group hover:border-sky-500 transition-all relative">
                {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <div className="text-slate-300 flex flex-col items-center gap-2"><ImagePlus size={40}/><span className="text-[10px] font-bold">โลโก้ร้าน</span></div>}
                {isUploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><Loader2 className="animate-spin text-sky-600" /></div>}
              </div>
              <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'logo')} />
            </div>
            <div className="flex-1 space-y-6">
              <input value={storeProfile.name} onChange={e => setStoreProfile({...storeProfile, name: e.target.value})} placeholder="ชื่อร้านค้า" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none focus:ring-2 focus:ring-sky-500"/>
              <textarea value={storeProfile.address} onChange={e => setStoreProfile({...storeProfile, address: e.target.value})} placeholder="ที่อยู่" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none h-24 focus:ring-2 focus:ring-sky-500 resize-none"/>
              <button onClick={() => alert('บันทึกเรียบร้อย')} className="bg-sky-600 text-white px-10 py-4 rounded-2xl font-bold shadow-xl active:scale-95 transition-all">บันทึกข้อมูลร้าน</button>
            </div>
          </div>
        </div>
        <div className="bg-white p-10 rounded-[3rem] border shadow-sm">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-8">จัดการฐานข้อมูล</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <button onClick={() => csvInputRef.current?.click()} disabled={isProcessingCSV} className="p-8 bg-emerald-50 text-emerald-600 rounded-[2rem] border border-emerald-100 flex flex-col items-center gap-4 hover:bg-emerald-100 transition-all active:scale-95">
              {isProcessingCSV ? <Loader2 className="animate-spin" size={32}/> : <UploadCloud size={32}/>}
              <span className="text-[10px] font-bold uppercase">นำเข้า (CSV)</span>
            </button>
            <button onClick={() => { 
                const link = document.createElement("a");
                link.href = "data:text/csv;charset=utf-8,\ufeffName,Price,Stock\nAmericano,15000,100\nLatte,20000,50";
                link.download = "template.csv"; link.click();
              }} className="p-8 bg-sky-50 text-sky-600 rounded-[2rem] border border-sky-100 flex flex-col items-center gap-4 hover:bg-sky-100 transition-all active:scale-95">
              <DownloadIcon size={32}/><span className="text-[10px] font-bold uppercase">โหลด TEMPLATE</span>
            </button>
            <button onClick={() => { if(confirm('ยืนยันการล้างข้อมูล?')) { localStorage.clear(); window.location.reload(); } }} className="p-8 bg-rose-50 text-rose-600 rounded-[2rem] border border-rose-100 flex flex-col items-center gap-4 hover:bg-rose-100 transition-all active:scale-95">
              <Eraser size={32}/><span className="text-[10px] font-bold uppercase">ล้างข้อมูลทั้งหมด</span>
            </button>
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
        <header className="h-16 flex items-center justify-between px-6 bg-white border-b md:hidden"><button onClick={() => setIsSidebarOpen(true)} className="p-2"><Menu /></button><span className="font-bold text-sky-600">Coffee Please</span><div className="w-8"/></header>
        <div className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0">
            {mode === AppMode.DASHBOARD && renderDashboard()}
            {mode === AppMode.STOCK && (
              <div className="p-4 md:p-8 h-full overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800"><Package className="text-sky-600" /> {t.stock_title}</h2>
                  <button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="bg-sky-600 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg flex items-center gap-2"><Plus size={18}/> {t.stock_add}</button>
                </div>
                <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                  <table className="w-full text-left"><thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold tracking-widest border-b"><tr><th className="px-6 py-5">Product</th><th className="px-6 py-5 text-right">Price</th><th className="px-6 py-5 text-center">Stock</th><th className="px-6 py-5 text-center">Action</th></tr></thead><tbody className="divide-y divide-slate-50">{products.map(p => (<tr key={p.id} className="hover:bg-slate-50/50"><td className="px-6 py-5 font-bold">{p.name}</td><td className="px-6 py-5 text-right font-bold text-sky-600">{formatCurrency(p.price, language)}</td><td className="px-6 py-5 text-center"><span className={`px-3 py-1 rounded-full text-[10px] font-bold ${checkIsLowStock(p) ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>{p.stock}</span></td><td className="px-6 py-5 text-center flex justify-center gap-2"><button onClick={()=>{setEditingProduct(p); setIsProductModalOpen(true);}} className="p-2 text-slate-300 hover:text-sky-600"><Edit size={16}/></button><button onClick={()=>{if(confirm('ลบ?')) setProducts(prev=>prev.filter(i=>i.id!==p.id));}} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button></td></tr>))}</tbody></table>
                </div>
              </div>
            )}
            {mode === AppMode.POS && (
              <div className="flex h-full flex-col md:flex-row overflow-hidden bg-slate-50/50">
                <div className="flex-1 p-4 md:p-6 overflow-y-auto">
                   <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 pb-20">
                     {products.map(p => (
                       <button key={p.id} onClick={() => setCart(prev => {
                         const exist = prev.find(i => i.id === p.id);
                         return exist ? prev.map(i => i.id === p.id ? {...i, quantity: i.quantity + 1} : i) : [...prev, {...p, quantity: 1}];
                       })} className="bg-white p-5 rounded-[2rem] border shadow-sm hover:border-sky-300 transition-all text-left flex flex-col group active:scale-95">
                         <div className={`w-full aspect-square rounded-2xl ${p.color} mb-4 flex items-center justify-center text-3xl font-bold overflow-hidden`}>
                           {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-cover" /> : p.name.charAt(0)}
                         </div>
                         <h4 className="font-bold text-slate-800 text-sm mb-1 truncate">{p.name}</h4>
                         <p className="text-sky-600 font-bold text-sm">{formatCurrency(p.price, language)}</p>
                       </button>
                     ))}
                   </div>
                </div>
                <div className="w-full md:w-96 bg-white border-l shadow-2xl flex flex-col">
                   <div className="p-6 border-b flex justify-between items-center font-bold"><h2>ตะกร้า</h2><button onClick={()=>setCart([])} className="text-xs text-rose-500 uppercase">ล้าง</button></div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-3">{cart.map((item, idx) => (<div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border"><div className="flex-1 min-w-0 font-bold text-xs truncate">{item.name}</div><div className="flex items-center gap-3 bg-white px-2 py-1 rounded-xl border"><button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))}><Minus size={12}/></button><span className="text-xs font-bold">{item.quantity}</span><button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))}><Plus size={12}/></button></div><button onClick={()=>setCart(prev=>prev.filter((_,i)=>i!==idx))} className="text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button></div>))}</div>
                   <div className="p-8 border-t space-y-4">
                      <div className="flex justify-between items-center font-bold text-slate-500"><span>ยอดรวม</span><span className="text-3xl text-sky-600">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span></div>
                      <button onClick={()=>setIsPaymentModalOpen(true)} disabled={cart.length === 0} className="w-full bg-sky-600 text-white py-5 rounded-[2rem] font-bold shadow-xl active:scale-95 disabled:opacity-30">ชำระเงิน</button>
                   </div>
                </div>
              </div>
            )}
            {mode === AppMode.SETTINGS && renderSettings()}
          </div>
        </div>
      </main>

      {/* MODALS (Simplified for clarity) */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[4rem] w-full max-w-sm p-12 text-center shadow-2xl">
             <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8"><DollarSign size={40}/></div>
             <h3 className="text-5xl font-bold mb-12 text-slate-800 tracking-tighter">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</h3>
             <button onClick={() => {
                const total = cart.reduce((s,i)=>s+(i.price*i.quantity),0);
                const order = { id: uuidv4(), items: [...cart], total, date: new Date().toLocaleString(), timestamp: Date.now(), paymentMethod, status: 'Paid' as OrderStatus };
                if (isCloudActive && db) try { setDoc(doc(db, 'sales', order.id), order); } catch(e){}
                setRecentSales(prev => [order, ...prev]); setCurrentOrder(order); setCart([]); setIsPaymentModalOpen(false); setShowReceipt(true);
             }} className="w-full bg-sky-600 text-white py-6 rounded-[2.5rem] font-bold shadow-xl active:scale-95">ชำระเงินเรียบร้อย</button>
             <button onClick={()=>setIsPaymentModalOpen(false)} className="mt-4 text-slate-300 text-[10px] font-bold uppercase">ยกเลิก</button>
          </div>
        </div>
      )}
      
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl">
            <h3 className="text-2xl font-bold mb-8">{editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</h3>
            <form onSubmit={e => {
              e.preventDefault(); const fd = new FormData(e.currentTarget);
              const prod = {
                id: editingProduct?.id || uuidv4(),
                name: fd.get('name') as string,
                code: fd.get('code') as string,
                category: "General", cost: 0,
                price: parseFloat(fd.get('price') as string) || 0,
                stock: parseInt(fd.get('stock') as string) || 0,
                color: editingProduct?.color || COLORS[Math.floor(Math.random()*COLORS.length)],
                imageUrl: editingProduct?.imageUrl
              };
              saveProductData(prod); setIsProductModalOpen(false);
            }} className="space-y-6">
              <div className="flex flex-col items-center">
                <div onClick={() => productImgInputRef.current?.click()} className="w-32 h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] flex items-center justify-center cursor-pointer overflow-hidden relative">
                  {editingProduct?.imageUrl ? <img src={editingProduct.imageUrl} className="w-full h-full object-cover" /> : <ImagePlus size={24} className="text-slate-300"/>}
                </div>
                <input type="file" ref={productImgInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'product')} />
              </div>
              <input name="name" placeholder="ชื่อสินค้า" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
              <div className="grid grid-cols-2 gap-4">
                 <input name="price" type="number" placeholder="ราคา" required defaultValue={editingProduct?.price} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none text-sky-600" />
                 <input name="stock" type="number" placeholder="จำนวน" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
              </div>
              <div className="flex gap-4"><button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-4 border rounded-2xl font-bold text-slate-400">ยกเลิก</button><button type="submit" className="flex-1 py-4 bg-sky-600 text-white rounded-2xl font-bold shadow-lg">บันทึก</button></div>
            </form>
          </div>
        </div>
      )}

      {showReceipt && currentOrder && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-xl">
            <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden p-10 flex flex-col shadow-2xl text-center">
              <div className="mb-8 pb-8 border-b-2 border-dashed">
                {storeProfile.logoUrl && <img src={storeProfile.logoUrl} className="w-20 h-20 mx-auto mb-4 object-contain rounded-2xl" />}
                <h2 className="text-lg font-bold">{storeProfile.name}</h2>
              </div>
              <div className="space-y-3 mb-8 text-left">{currentOrder.items.map((it, i) => (<div key={i} className="flex justify-between"><span>{it.name} x{it.quantity}</span><span className="font-bold">{formatCurrency(it.price * it.quantity, language)}</span></div>))}</div>
              <div className="text-3xl font-bold mb-8">{formatCurrency(currentOrder.total, language)}</div>
              <button onClick={()=>setShowReceipt(false)} className="w-full py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold shadow-lg">ปิดหน้าต่าง</button>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
