
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
        // Using lower quality (0.5) to ensure it fits in LocalStorage even if user uploads many
        resolve(canvas.toDataURL('image/jpeg', 0.5));
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
  const [isProcessingCSV, setIsProcessingCSV] = useState(false);

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

  const downloadCSVTemplate = () => {
    // Generate a very standard CSV template
    const headers = ["Name", "SKU", "Category", "Cost", "Price", "Stock"];
    const rows = [
      ["Americano", "COF-001", "Coffee", "5000", "15000", "100"],
      ["Latte", "COF-002", "Coffee", "7000", "20000", "100"]
    ];
    const csvContent = "\ufeff" + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "coffee_pos_template.csv";
    link.click();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingCSV(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target?.result as string;
        text = text.replace(/^\ufeff/i, "").trim(); // Remove BOM
        if (!text) throw new Error("File is empty");

        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
        if (lines.length < 1) throw new Error("No data found");

        // Strategy: Detect delimiter by counting occurrences in the first line
        const firstLine = lines[0];
        const delimiters = [",", ";", "\t", "|"];
        const counts = delimiters.map(d => (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length);
        const maxIdx = counts.indexOf(Math.max(...counts));
        const delimiter = delimiters[maxIdx];

        // Advanced CSV Row Parser (handles quotes correctly)
        const parseCSVRow = (rowText: string, d: string) => {
          const cells = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < rowText.length; i++) {
            const char = rowText[i];
            if (char === '"' && rowText[i+1] === '"') { current += '"'; i++; }
            else if (char === '"') inQuotes = !inQuotes;
            else if (char === d && !inQuotes) { cells.push(current.trim().replace(/^"|"$/g, "")); current = ""; }
            else current += char;
          }
          cells.push(current.trim().replace(/^"|"$/g, ""));
          return cells;
        };

        // Smart Header Scanning (Scan first 10 rows to find headers)
        let headerRowIdx = -1;
        let mapping = { name: -1, code: -1, category: -1, cost: -1, price: -1, stock: -1 };
        
        const nameKeywords = ['ชื่อ', 'ชื່', 'name', 'product', 'สินค้า', 'ລາຍການ'];
        const codeKeywords = ['รหัส', 'sku', 'code', 'ລະຫັດ', 'id'];
        const priceKeywords = ['ราคา', 'ขาย', 'price', 'ລາຄາ', 'ຂາຍ'];
        const stockKeywords = ['คงเหลือ', 'สต็อก', 'stock', 'ຈຳນວນ', 'ສະຕັອກ'];

        for (let i = 0; i < Math.min(lines.length, 10); i++) {
          const cells = parseCSVRow(lines[i], delimiter);
          const hasName = cells.some(c => nameKeywords.some(k => c.toLowerCase().includes(k.toLowerCase())));
          if (hasName) {
            headerRowIdx = i;
            mapping.name = cells.findIndex(c => nameKeywords.some(k => c.toLowerCase().includes(k.toLowerCase())));
            mapping.code = cells.findIndex(c => codeKeywords.some(k => c.toLowerCase().includes(k.toLowerCase())));
            mapping.category = cells.findIndex(c => c.toLowerCase().includes('หมวด') || c.toLowerCase().includes('category') || c.toLowerCase().includes('ໝວດ'));
            mapping.cost = cells.findIndex(c => c.toLowerCase().includes('ต้นทุน') || c.toLowerCase().includes('cost') || c.toLowerCase().includes('ທຶນ'));
            mapping.price = cells.findIndex(c => priceKeywords.some(k => c.toLowerCase().includes(k.toLowerCase())));
            mapping.stock = cells.findIndex(c => stockKeywords.some(k => c.toLowerCase().includes(k.toLowerCase())));
            break;
          }
        }

        if (headerRowIdx === -1 || mapping.name === -1) {
          throw new Error("ไม่พบหัวตารางที่ระบุชื่อสินค้า กรุณาตรวจสอบไฟล์อีกครั้ง");
        }

        const importedProducts: Product[] = [];
        for (let i = headerRowIdx + 1; i < lines.length; i++) {
          const cells = parseCSVRow(lines[i], delimiter);
          if (!cells[mapping.name]) continue;

          const cleanValue = (v: string) => v ? v.replace(/,/g, '').replace(/[^\d.-]/g, '') : "0";
          const p: Product = {
            id: uuidv4(),
            name: cells[mapping.name],
            code: mapping.code !== -1 && cells[mapping.code] ? cells[mapping.code] : `SKU-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            category: mapping.category !== -1 && cells[mapping.category] ? cells[mapping.category] : "General",
            cost: mapping.cost !== -1 ? parseFloat(cleanValue(cells[mapping.cost])) || 0 : 0,
            price: mapping.price !== -1 ? parseFloat(cleanValue(cells[mapping.price])) || 0 : 0,
            stock: mapping.stock !== -1 ? parseInt(cleanValue(cells[mapping.stock])) || 0 : 0,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
          };
          
          if (isCloudEnabled && db) {
            await setDoc(doc(db, 'products', p.id), p);
          }
          importedProducts.push(p);
        }

        if (!isCloudEnabled) {
          setProducts(prev => [...prev, ...importedProducts]);
        }
        alert(`นำเข้าเรียบร้อยแล้วจำนวน ${importedProducts.length} รายการ`);
      } catch (err: any) {
        alert("การนำเข้าขัดข้อง: " + err.message);
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
        const newProfile = { ...storeProfile, logoUrl: base64 };
        setStoreProfile(newProfile);
        if (isCloudEnabled && db) {
          await setDoc(doc(db, 'settings', 'profile'), newProfile);
        } else {
          try {
            localStorage.setItem('pos_profile', JSON.stringify(newProfile));
          } catch (storageErr) {
            alert("ไม่สามารถบันทึกโลโก้ได้เนื่องจากพื้นที่ใน Browser เต็ม โปรดลบข้อมูลบางส่วนออก");
          }
        }
      } else if (type === 'product' && editingProduct) {
        setEditingProduct({ ...editingProduct, imageUrl: base64 });
      }
    } catch (err) {
      alert("เกิดความผิดพลาดในการจัดการรูปภาพ");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg: Message = { id: uuidv4(), role: Role.USER, text: chatInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === Role.USER ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));
      const stream = await streamResponse(userMsg.text, mode, history);
      if (stream) {
        const assistantId = uuidv4();
        let fullText = "";
        setMessages(prev => [...prev, { id: assistantId, role: Role.MODEL, text: "", timestamp: Date.now() }]);
        for await (const chunk of stream) {
          const c = chunk as GenerateContentResponse;
          fullText += c.text || "";
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: fullText } : m));
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: "ขออภัย ระบบขัดข้องชั่วคราว", timestamp: Date.now(), isError: true }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Rendering Helper Components
  const renderDashboard = () => (
    <div className="p-4 md:p-8 h-full overflow-y-auto bg-slate-50/50">
      <h2 className="text-2xl font-bold mb-8 flex items-center gap-3 text-slate-800"><LayoutDashboard className="text-sky-600" /> {t.dash_title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">{t.dash_sales_month}</p><h3 className="text-2xl font-bold text-sky-600">{formatCurrency(recentSales.reduce((s, o) => s + o.total, 0), language)}</h3></div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">{t.dash_stock_value}</p><h3 className="text-2xl font-bold text-amber-600">{formatCurrency(products.reduce((s, p) => s + (p.cost * p.stock), 0), language)}</h3></div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">คำสั่งซื้อ</p><h3 className="text-2xl font-bold text-emerald-600">{recentSales.length} รายการ</h3></div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-slate-500 text-[10px] font-bold uppercase mb-2">ของใกล้หมด</p><h3 className="text-2xl font-bold text-rose-500">{products.filter(checkIsLowStock).length}</h3></div>
      </div>
      <div className="bg-white p-8 rounded-[3rem] border shadow-sm"><h3 className="font-bold mb-6 flex items-center gap-2"><History size={20} className="text-sky-500" /> ล่าสุด</h3><div className="space-y-4">{recentSales.slice(0, 5).map(s => (<div key={s.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl"><div><p className="font-bold text-sm">Order #{s.id.slice(-4)}</p><p className="text-[10px] text-slate-400">{s.date}</p></div><div className="text-right"><p className="font-bold text-sky-600">{formatCurrency(s.total, language)}</p><span className="text-[9px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-bold uppercase">{s.status}</span></div></div>))}</div></div>
    </div>
  );

  const renderStock = () => (
    <div className="p-4 md:p-8 h-full overflow-y-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3"><Package className="text-sky-600" /> {t.stock_title}</h2>
        <div className="flex gap-2">
          <button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="bg-sky-600 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg flex items-center gap-2 active:scale-95 transition-all"><Plus size={18}/> {t.stock_add}</button>
        </div>
      </div>
      <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left"><thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold tracking-widest border-b"><tr><th className="px-6 py-5">Product</th><th className="px-6 py-5">SKU</th><th className="px-6 py-5 text-right">Price</th><th className="px-6 py-5 text-center">Stock</th><th className="px-6 py-5 text-center">Action</th></tr></thead><tbody className="divide-y divide-slate-50">{products.map(p => (<tr key={p.id} className="hover:bg-slate-50/50 transition-colors"><td className="px-6 py-5 font-bold text-slate-700">{p.name}</td><td className="px-6 py-5 font-mono text-[10px] text-slate-400">{p.code}</td><td className="px-6 py-5 text-right font-bold text-sky-600">{formatCurrency(p.price, language)}</td><td className="px-6 py-5 text-center"><span className={`px-3 py-1 rounded-full text-[10px] font-bold ${checkIsLowStock(p) ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>{p.stock}</span></td><td className="px-6 py-5 flex justify-center gap-2"><button onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }} className="p-2 text-slate-300 hover:text-sky-600"><Edit size={16}/></button><button onClick={() => { if(confirm('ต้องการลบสินค้า?')) setProducts(prev => prev.filter(it => it.id !== p.id)); }} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button></td></tr>))}</tbody></table>
        </div>
        {products.length === 0 && <div className="p-20 text-center text-slate-300 italic">ไม่มีข้อมูลสินค้า</div>}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="p-4 md:p-8 h-full overflow-y-auto bg-slate-50/50">
      <h2 className="text-2xl font-bold mb-10 flex items-center gap-3 text-slate-800"><Settings className="text-sky-600" /> {t.setting_title}</h2>
      <div className="max-w-4xl space-y-10 pb-20">
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 mb-8">ข้อมูลร้านค้า</h3>
          <div className="flex flex-col md:flex-row gap-12">
            <div className="flex flex-col items-center gap-4">
              <div onClick={() => logoInputRef.current?.click()} className="w-48 h-48 rounded-[3rem] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden group hover:border-sky-500 transition-all relative">
                {storeProfile.logoUrl ? <img src={storeProfile.logoUrl} className="w-full h-full object-cover" /> : <div className="text-slate-300 flex flex-col items-center gap-2"><ImagePlus size={40}/><span className="text-[10px] font-bold">อัปโหลดโลโก้</span></div>}
                {isUploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><Loader2 className="animate-spin text-sky-600" /></div>}
              </div>
              <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'logo')} />
            </div>
            <div className="flex-1 space-y-6">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">ชื่อร้าน</label><input value={storeProfile.name} onChange={e => setStoreProfile({...storeProfile, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-sky-500"/></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">ที่อยู่</label><textarea value={storeProfile.address} onChange={e => setStoreProfile({...storeProfile, address: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none h-24 focus:ring-2 focus:ring-sky-500 resize-none"/></div>
              <button onClick={() => alert('บันทึกเรียบร้อย')} className="bg-sky-600 text-white px-10 py-4 rounded-2xl font-bold shadow-xl active:scale-95 transition-all">บันทึกข้อมูล</button>
            </div>
          </div>
        </div>
        <div className="bg-white p-10 rounded-[3rem] border shadow-sm">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-8">จัดการฐานข้อมูลสินค้า</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <button onClick={() => csvInputRef.current?.click()} disabled={isProcessingCSV} className="p-8 bg-emerald-50 text-emerald-600 rounded-[2rem] border border-emerald-100 flex flex-col items-center gap-4 hover:bg-emerald-100 transition-all active:scale-95 disabled:opacity-50">
              {isProcessingCSV ? <Loader2 className="animate-spin" size={32}/> : <UploadCloud size={32}/>}
              <span className="text-[10px] font-bold uppercase">นำเข้า (CSV)</span>
            </button>
            <button onClick={downloadCSVTemplate} className="p-8 bg-sky-50 text-sky-600 rounded-[2rem] border border-sky-100 flex flex-col items-center gap-4 hover:bg-sky-100 transition-all active:scale-95">
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
            {mode === AppMode.STOCK && renderStock()}
            {mode === AppMode.SETTINGS && renderSettings()}
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
                   <div className="p-6 border-b flex justify-between items-center font-bold"><h2>ตะกร้า</h2><button onClick={()=>setCart([])} className="text-xs text-rose-500 uppercase tracking-widest">ล้าง</button></div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-3">
                     {cart.map((item, idx) => (
                       <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border">
                         <div className="flex-1 min-w-0"><h4 className="font-bold text-xs truncate">{item.name}</h4><p className="text-[10px] text-sky-600 font-bold">{formatCurrency(item.price, language)}</p></div>
                         <div className="flex items-center gap-3 bg-white px-2 py-1 rounded-xl border"><button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:Math.max(1,i.quantity-1)}:i))} className="p-1"><Minus size={12}/></button><span className="text-xs font-bold">{item.quantity}</span><button onClick={()=>setCart(prev=>prev.map((i,ix)=>ix===idx?{...i,quantity:i.quantity+1}:i))} className="p-1"><Plus size={12}/></button></div>
                         <button onClick={()=>setCart(prev=>prev.filter((_,i)=>i!==idx))} className="text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button>
                       </div>
                     ))}
                   </div>
                   <div className="p-8 border-t space-y-4">
                      <div className="flex justify-between items-center font-bold text-slate-500"><span>ยอดรวม</span><span className="text-3xl text-sky-600">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</span></div>
                      <button onClick={()=>setIsPaymentModalOpen(true)} disabled={cart.length === 0} className="w-full bg-sky-600 text-white py-5 rounded-[2rem] font-bold shadow-xl active:scale-95 disabled:opacity-30">ชำระเงิน</button>
                   </div>
                </div>
              </div>
            )}
            {mode === AppMode.AI && (
              <div className="flex flex-col h-full bg-white">
                <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6">
                   {messages.map(m => <ChatMessage key={m.id} message={m} />)}
                   {isChatLoading && <div className="text-xs text-sky-600 animate-pulse font-bold px-6">ผู้ช่วย AI กำลังคิด...</div>}
                   <div ref={chatEndRef} />
                </div>
                <div className="p-6 border-t bg-slate-50"><div className="max-w-4xl mx-auto flex gap-3"><input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSendMessage()} placeholder="ถามเกี่ยวกับธุรกิจของคุณ..." className="flex-1 p-4 bg-white border rounded-2xl outline-none focus:ring-2 focus:ring-sky-500" /><button onClick={handleSendMessage} className="bg-sky-600 text-white p-4 rounded-2xl shadow-lg active:scale-95"><Send size={24}/></button></div></div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODALS */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[4rem] w-full max-w-sm p-12 text-center shadow-2xl">
             <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8"><DollarSign size={40}/></div>
             <p className="text-slate-400 mb-2 font-bold text-[10px] uppercase tracking-widest">ยอดชำระสุทธิ</p>
             <h3 className="text-5xl font-bold mb-12 text-slate-800 tracking-tighter">{formatCurrency(cart.reduce((s,i)=>s+(i.price*i.quantity),0), language)}</h3>
             <div className="grid grid-cols-3 gap-4 mb-12">
                {['cash', 'qr', 'transfer'].map((m: any) => (
                  <button key={m} onClick={()=>setPaymentMethod(m)} className={`p-4 border-2 rounded-3xl flex flex-col items-center gap-2 transition-all ${paymentMethod===m?'border-sky-500 bg-sky-50 text-sky-600':'border-slate-100 text-slate-300'}`}>
                    <span className="text-[10px] font-bold uppercase">{m}</span>
                  </button>
                ))}
             </div>
             <button onClick={() => {
                const orderId = uuidv4();
                const total = cart.reduce((s,i)=>s+(i.price*i.quantity),0);
                const order = { id: orderId, items: [...cart], total, subtotal: total, date: new Date().toLocaleString(), timestamp: Date.now(), paymentMethod, status: 'Paid' as OrderStatus, customerName: 'ลูกค้าทั่วไป' };
                if (isCloudEnabled && db) setDoc(doc(db, 'sales', orderId), order);
                else setRecentSales(prev => [order, ...prev]);
                setCurrentOrder(order); setCart([]); setIsPaymentModalOpen(false); setShowReceipt(true);
             }} className="w-full bg-sky-600 text-white py-6 rounded-[2.5rem] font-bold shadow-xl shadow-sky-200 active:scale-95 mb-4">ชำระเงินเรียบร้อย</button>
             <button onClick={()=>setIsPaymentModalOpen(false)} className="text-slate-300 text-[10px] font-bold uppercase">ยกเลิกรายการ</button>
          </div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-2xl font-bold mb-8">{editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</h3>
            <form onSubmit={e => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const product = {
                id: editingProduct?.id || uuidv4(),
                name: formData.get('name') as string,
                code: formData.get('code') as string,
                category: formData.get('category') as string,
                cost: parseFloat(formData.get('cost') as string) || 0,
                price: parseFloat(formData.get('price') as string) || 0,
                stock: parseInt(formData.get('stock') as string) || 0,
                color: editingProduct?.color || COLORS[Math.floor(Math.random()*COLORS.length)],
                imageUrl: editingProduct?.imageUrl
              };
              saveProductData(product); setIsProductModalOpen(false); setEditingProduct(null);
            }} className="space-y-6">
              <div className="flex flex-col items-center">
                <div onClick={() => productImgInputRef.current?.click()} className="w-32 h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] flex items-center justify-center cursor-pointer overflow-hidden relative">
                  {editingProduct?.imageUrl ? <img src={editingProduct.imageUrl} className="w-full h-full object-cover" /> : <ImagePlus size={24} className="text-slate-300"/>}
                  {isUploading && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-sky-600" /></div>}
                </div>
                <input type="file" ref={productImgInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'product')} />
              </div>
              <div className="space-y-4">
                <input name="name" placeholder="ชื่อสินค้า" required defaultValue={editingProduct?.name} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
                <input name="code" placeholder="SKU / รหัสสินค้า" required defaultValue={editingProduct?.code} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
                <input name="category" placeholder="หมวดหมู่" defaultValue={editingProduct?.category} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
                <div className="grid grid-cols-2 gap-4">
                   <input name="cost" type="number" placeholder="ต้นทุน" required defaultValue={editingProduct?.cost} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
                   <input name="price" type="number" placeholder="ราคาขาย" required defaultValue={editingProduct?.price} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none text-sky-600" />
                </div>
                <input name="stock" type="number" placeholder="จำนวนในสต็อก" required defaultValue={editingProduct?.stock} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-4 border rounded-2xl font-bold text-slate-400">ยกเลิก</button>
                <button type="submit" className="flex-2 py-4 bg-sky-600 text-white rounded-2xl font-bold shadow-lg px-8">บันทึก</button>
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
                <div className="space-y-3 mb-8">
                  {currentOrder.items.map((it, i) => (<div key={i} className="flex justify-between items-start gap-4"><span>{it.name} x{it.quantity}</span><span className="font-bold">{formatCurrency(it.price * it.quantity, language)}</span></div>))}
                </div>
                <div className="border-t-2 border-dashed border-slate-200 pt-8 space-y-3">
                  <div className="flex justify-between text-xl font-bold text-slate-900 pt-2"><span className="uppercase tracking-widest">ยอดรวม:</span><span>{formatCurrency(currentOrder.total, language)}</span></div>
                </div>
                <div className="text-center mt-12 text-[10px] text-slate-300 font-bold uppercase tracking-[0.4em]">ขอบใจที่ใช้บริการ</div>
              </div>
              <div className="p-8 bg-slate-50 border-t flex gap-4">
                <button onClick={()=>setShowReceipt(false)} className="flex-1 py-5 bg-white border border-slate-200 rounded-[1.5rem] font-bold text-slate-400 text-xs uppercase hover:bg-slate-100 transition-all">ปิด</button>
                <button onClick={()=>window.print()} className="flex-1 py-5 bg-sky-600 text-white rounded-[1.5rem] font-bold text-xs uppercase shadow-lg flex items-center justify-center gap-2"><Printer size={16}/> พิมพ์บิล</button>
              </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
