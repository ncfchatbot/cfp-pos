import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, Search, ShoppingCart, Plus, Minus, Trash2, 
  CreditCard, Banknote, Printer, Save, Edit, Loader2, Send, Sparkles, Store, Check,
  LayoutDashboard, Settings, UploadCloud, FileDown, ImagePlus, AlertTriangle, TrendingUp, DollarSign, Package,
  ClipboardList, Truck, MapPin, Phone, User, X, BarChart3, Wallet, PieChart, ChevronRight, History, DatabaseBackup,
  Calendar, Gift, Tag
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { streamResponse } from './services/gemini';
import { Message, Role, AppMode, Product, CartItem, SaleRecord, StoreProfile, OrderStatus, LogisticsProvider, Promotion, PromotionType } from './types';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';

// --- Helper Functions ---
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'LAK', maximumFractionDigits: 0 }).format(amount);
};

const INITIAL_PRODUCTS: Product[] = [
  { id: '1', code: 'FD001', name: 'ส้มตำ (Papaya Salad)', price: 25000, cost: 15000, category: 'อาหาร', stock: 50, color: 'bg-orange-100 text-orange-800' },
  { id: '2', code: 'BV001', name: 'เบียร์ลาว (Beer Lao)', price: 15000, cost: 12000, category: 'เครื่องดื่ม', stock: 120, color: 'bg-yellow-100 text-yellow-800' },
];

const INITIAL_PROFILE: StoreProfile = {
  name: "Sabaidee POS",
  address: "เวียงจันทน์, ลาว",
  phone: "020-5555-9999",
  logoUrl: null
};

const LOGISTICS_PROVIDERS: { value: LogisticsProvider; label: string }[] = [
  { value: 'None', label: 'รับเองหน้าร้าน (None)' },
  { value: 'Anuchit', label: 'อนุชิต (Anuchit)' },
  { value: 'Meexai', label: 'มีไช (Meexai)' },
  { value: 'Rungarun', label: 'รุ่งอรุณ (Rungarun)' },
  { value: 'Other', label: 'อื่นๆ (Other)' },
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
  const [newOrderCustomer, setNewOrderCustomer] = useState({ name: '', phone: '', address: '' });
  const [newOrderShipping, setNewOrderShipping] = useState<{carrier: LogisticsProvider, branch: string}>({ carrier: 'None', branch: '' });
  const [tempOrderCart, setTempOrderCart] = useState<CartItem[]>([]);
  const [skuSearch, setSkuSearch] = useState('');

  // Report States
  const [reportDateRange, setReportDateRange] = useState<{start: string, end: string}>({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0], // First day of current month
    end: new Date().toISOString().split('T')[0] // Today
  });

  // Promotion States
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
  // Separate state for promotion type to handle UI changes
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

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update promoType state when opening modal
  useEffect(() => {
    if (editingPromotion) {
      setPromoType(editingPromotion.type);
    } else {
      setPromoType('tiered_price');
    }
  }, [editingPromotion, isPromotionModalOpen]);

  // --- Promotion Logic ---
  const calculateCartWithPromotions = (inputCart: CartItem[]): { items: CartItem[], total: number } => {
    // 1. Reset prices to original and remove auto-added free items before recalculating
    let processedItems = inputCart.filter(item => !item.isFree).map(item => ({
      ...item,
      price: item.originalPrice || item.price, // Reset to base price
      originalPrice: undefined,
      promotionApplied: undefined
    }));

    const activePromos = promotions.filter(p => p.isActive);
    const newFreeItems: CartItem[] = [];

    // 2. Apply Tiered Pricing
    processedItems = processedItems.map(item => {
      // Find promo where SKU is in targetSkus
      const tieredPromo = activePromos.find(p => 
        p.type === 'tiered_price' && 
        p.targetSkus && 
        (p.targetSkus.includes(item.code) || p.targetSkus.includes(item.id))
      );

      if (tieredPromo && tieredPromo.tiers) {
        // Find the best tier
        const sortedTiers = [...tieredPromo.tiers].sort((a, b) => b.minQty - a.minQty);
        const matchTier = sortedTiers.find(t => item.quantity >= t.minQty);
        
        if (matchTier) {
          return {
            ...item,
            originalPrice: item.price,
            price: matchTier.price,
            promotionApplied: `${tieredPromo.name} (ซื้อ ${matchTier.minQty} ราคา ${matchTier.price})`
          };
        }
      }
      return item;
    });

    // 3. Apply Buy X Get Y
    activePromos.filter(p => p.type === 'buy_x_get_y').forEach(promo => {
        // Sum up quantities of all matching SKUs for this promo (if mix & match allowed - logic simplified to per item type for now)
        // Or check each item. Here we check per item line.
        processedItems.forEach(item => {
             if (promo.targetSkus && (promo.targetSkus.includes(item.code) || promo.targetSkus.includes(item.id))) {
                 if (promo.requiredQty && promo.freeSku && promo.freeQty) {
                     const sets = Math.floor(item.quantity / promo.requiredQty);
                     if (sets > 0) {
                        const freeProduct = products.find(p => p.code === promo.freeSku);
                        if (freeProduct) {
                            newFreeItems.push({
                                ...freeProduct,
                                quantity: sets * promo.freeQty,
                                price: 0,
                                isFree: true,
                                promotionApplied: `${promo.name} (ซื้อ ${promo.requiredQty} แถม ${promo.freeQty})`
                            });
                        }
                     }
                 }
             }
        });
    });

    // Merge similar free items
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

  const calculatedCart = useMemo(() => calculateCartWithPromotions(cart), [cart, promotions, products]);
  const calculatedTempOrderCart = useMemo(() => calculateCartWithPromotions(tempOrderCart), [tempOrderCart, promotions, products]);

  // --- Printing ---
  const handlePrintReceipt = () => {
    const receiptContent = document.getElementById('receipt-content');
    if (!receiptContent) return;
    const printWindow = window.open('', '', 'width=400,height=600');
    if (!printWindow) { alert('กรุณาอนุญาต Pop-up'); return; }
    
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

  // --- Imports/Exports ---
  const downloadProductTemplate = () => {
    const blob = new Blob(["code,name,price,cost,category,stock\nFD001,Example Product,10000,5000,Food,100\n"], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'product_template_v2.csv'; document.body.appendChild(link); link.click();
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
         if (name && price) {
            newP.push({ id: uuidv4(), code: code?.trim() || uuidv4().slice(0,6).toUpperCase(), name: name.trim(), price: Number(price) || 0, cost: Number(cost) || 0, category: category?.trim()||'General', stock: Number(stock)||0, color: 'bg-slate-100 text-slate-800' });
         }
       }
       setProducts(prev => [...prev, ...newP]);
       alert(`นำเข้าสินค้าสำเร็จ ${newP.length} รายการ`);
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
               const line = lines[i].trim();
               if (!line) continue;
               const parts = line.split(',');
               if (parts.length >= 3) {
                   const [date, customer, total, status, payment] = parts;
                   if (date && total) {
                       newSales.push({
                           id: uuidv4().slice(0,8),
                           items: [],
                           total: Number(total.replace(/[^0-9.-]+/g,"")),
                           date: date.trim(),
                           timestamp: Date.now(),
                           paymentMethod: (payment?.trim() as any) || 'cash',
                           status: (status?.trim() as any) || 'Paid',
                           customerName: customer?.trim() || 'ลูกค้าเก่า',
                           shippingCarrier: 'None'
                       });
                   }
               }
           }
           if (newSales.length > 0) {
               setRecentSales(prev => [...prev, ...newSales]);
               alert(`นำเข้าประวัติการขายสำเร็จ ${newSales.length} รายการ`);
           } else {
               alert('ไม่พบข้อมูลที่ถูกต้องในไฟล์ CSV');
           }
       } catch (err) {
           console.error(err);
           alert('เกิดข้อผิดพลาดในการอ่านไฟล์');
       }
    };
    reader.readAsText(file);
  };
  
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setStoreProfile(p => ({ ...p, logoUrl: reader.result as string }));
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
            if(d.products) setProducts(d.products); 
            if(d.recentSales) setRecentSales(d.recentSales); 
            if(d.storeProfile) setStoreProfile(d.storeProfile); 
            if(d.promotions) setPromotions(d.promotions);
            alert('กู้คืนระบบสำเร็จ (Restore Successful)'); 
        } catch(e){
            alert('ไฟล์ไม่ถูกต้อง (Invalid file)');
        }
      }; reader.readAsText(file);
    }
  };

  // --- Logic ---
  const addToCart = (product: Product, isTemp = false) => {
    const setter = isTemp ? setTempOrderCart : setCart;
    setter(prev => {
      // Prevent adding free items manually to calculation logic (they are auto-added)
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

  const processPayment = () => {
    // Use the calculated cart from useMemo
    const { items, total } = calculatedCart;
    const order: SaleRecord = {
      id: uuidv4().slice(0, 8),
      items: [...items], // Use items with promotions applied
      total: total,
      date: new Date().toLocaleString('th-TH'),
      timestamp: Date.now(),
      paymentMethod,
      status: 'Paid',
      shippingCarrier: 'None',
      customerName: 'ลูกค้าหน้าร้าน (Walk-in)'
    };
    finalizeOrder(order);
    setCart([]);
    setIsPaymentModalOpen(false);
    setShowReceipt(true);
  };

  const createBackOfficeOrder = () => {
    if (tempOrderCart.length === 0) return;
    const { items, total } = calculatedTempOrderCart;
    const order: SaleRecord = {
      id: uuidv4().slice(0, 8),
      items: [...items],
      total: total,
      date: new Date().toLocaleString('th-TH'),
      timestamp: Date.now(),
      paymentMethod: 'transfer',
      status: 'Pending',
      customerName: newOrderCustomer.name || 'ไม่ระบุชื่อ',
      customerPhone: newOrderCustomer.phone,
      customerAddress: newOrderCustomer.address,
      shippingCarrier: newOrderShipping.carrier,
      shippingBranch: newOrderShipping.branch
    };
    finalizeOrder(order);
    setTempOrderCart([]);
    setNewOrderCustomer({ name: '', phone: '', address: '' });
    setNewOrderShipping({ carrier: 'None', branch: '' });
    setSkuSearch('');
    setIsOrderModalOpen(false);
  };

  const finalizeOrder = (order: SaleRecord) => {
    setProducts(prev => prev.map(p => {
      const sold = order.items.find(c => c.id === p.id);
      return sold ? { ...p, stock: p.stock - sold.quantity } : p;
    }));
    setRecentSales(prev => [order, ...prev]);
    setCurrentOrder(order);
  };

  const updateOrderStatus = (id: string, status: OrderStatus) => {
    setRecentSales(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
          const botId = uuidv4();
          setMessages(prev => [...prev, { id: botId, role: Role.MODEL, text: '', timestamp: Date.now() }]);
          
          let fullText = '';
          for await (const chunk of stream) {
              const text = (chunk as any).text; 
              if (text) {
                  fullText += text;
                  setMessages(prev => prev.map(m => m.id === botId ? {...m, text: fullText} : m));
              }
          }
       }
    } catch (err) {
       console.error(err);
       setMessages(prev => [...prev, { id: uuidv4(), role: Role.MODEL, text: 'ขออภัย ระบบขัดข้อง ไม่สามารถตอบกลับได้ในขณะนี้', isError: true, timestamp: Date.now() }]);
    } finally {
       setIsChatLoading(false);
    }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    const newProduct: Product = {
      id: editingProduct ? editingProduct.id : uuidv4(),
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      price: Number(formData.get('price')),
      cost: Number(formData.get('cost')),
      category: formData.get('category') as string,
      stock: Number(formData.get('stock')),
      color: editingProduct ? editingProduct.color : `bg-${['orange','blue','green','purple','pink'][Math.floor(Math.random()*5)]}-100 text-${['orange','blue','green','purple','pink'][Math.floor(Math.random()*5)]}-800`
    };

    if (editingProduct) {
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? newProduct : p));
    } else {
      setProducts(prev => [...prev, newProduct]);
    }
    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleSavePromotion = (e: React.FormEvent) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const type = formData.get('type') as PromotionType;
      
      // Parse SKUs from textarea
      const targetSkusRaw = formData.get('targetSkus') as string;
      const targetSkus = targetSkusRaw ? targetSkusRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];

      // Parse Tiers
      const tiers = [];
      for (let i = 0; i < 7; i++) {
        const qty = formData.get(`minQty${i}`);
        const price = formData.get(`price${i}`);
        if (qty && price) {
            tiers.push({ minQty: Number(qty), price: Number(price) });
        }
      }

      const newPromo: Promotion = {
          id: editingPromotion ? editingPromotion.id : uuidv4(),
          name: formData.get('name') as string,
          type: type,
          isActive: true,
          targetSkus: targetSkus,
          ...(type === 'tiered_price' ? {
              tiers: tiers
          } : {
              requiredQty: Number(formData.get('requiredQty')),
              freeSku: formData.get('freeSku') as string,
              freeQty: Number(formData.get('freeQty'))
          })
      };

      if (editingPromotion) {
          setPromotions(prev => prev.map(p => p.id === editingPromotion.id ? newPromo : p));
      } else {
          setPromotions(prev => [...prev, newPromo]);
      }
      setIsPromotionModalOpen(false);
      setEditingPromotion(null);
  };

  // --- Renderers ---

  const renderOrders = () => (
    <div className="p-6 h-full overflow-y-auto bg-slate-50/50">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ClipboardList className="text-brand-600" /> รายการออเดอร์
        </h2>
        <button onClick={() => setIsOrderModalOpen(true)} className="bg-brand-600 text-white px-4 py-2 rounded-xl shadow-lg shadow-brand-200 hover:bg-brand-700 flex gap-2 font-bold">
          <Plus size={18} /> สร้างออเดอร์
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
            <tr>
              <th className="p-4 font-medium">Order ID</th>
              <th className="p-4 font-medium">ลูกค้า</th>
              <th className="p-4 font-medium">วันที่</th>
              <th className="p-4 text-right font-medium">ยอดรวม</th>
              <th className="p-4 font-medium">การจัดส่ง</th>
              <th className="p-4 font-medium">สถานะ</th>
              <th className="p-4 text-center font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {recentSales.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50">
                <td className="p-4 font-mono text-slate-500">#{order.id}</td>
                <td className="p-4 font-medium text-slate-800">
                  <div>{order.customerName}</div>
                  <div className="text-xs text-slate-400">{order.customerPhone}</div>
                </td>
                <td className="p-4 text-slate-500">{order.date}</td>
                <td className="p-4 text-right font-bold text-slate-800">{formatCurrency(order.total)}</td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${order.shippingCarrier !== 'None' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                    {order.shippingCarrier === 'None' ? 'รับเอง' : order.shippingCarrier}
                  </span>
                </td>
                <td className="p-4">
                  <select
                    value={order.status}
                    onChange={(e) => updateOrderStatus(order.id, e.target.value as OrderStatus)}
                    className={`text-xs font-bold px-2 py-1 rounded-lg border-0 outline-none cursor-pointer ${
                      order.status === 'Paid' ? 'bg-green-100 text-green-700' :
                      order.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                      order.status === 'Shipped' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}
                  >
                    <option value="Pending">รอชำระ</option>
                    <option value="Paid">ชำระแล้ว</option>
                    <option value="Shipped">ส่งแล้ว</option>
                    <option value="Cancelled">ยกเลิก</option>
                  </select>
                </td>
                <td className="p-4 text-center">
                  <button onClick={() => handlePrintSpecificOrder(order)} className="p-2 text-slate-400 hover:text-brand-600" title="Print Receipt">
                    <Printer size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {recentSales.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">ยังไม่มีรายการขาย</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDashboard = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlySales = recentSales.filter(s => {
       if (s.status === 'Cancelled') return false;
       if (s.timestamp) {
         const d = new Date(s.timestamp);
         return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
       }
       return s.date.includes(`${currentMonth + 1}/${currentYear}`) || s.date.includes(now.toLocaleDateString('th-TH').slice(3)); 
    }).reduce((sum, s) => sum + s.total, 0);

    const collectedRevenue = recentSales.filter(s => (s.status === 'Paid' || s.status === 'Shipped')).reduce((sum, s) => sum + s.total, 0);
    const grossProfit = recentSales.filter(s => (s.status === 'Paid' || s.status === 'Shipped')).reduce((sum, order) => {
        const orderCost = order.items.reduce((c, item) => c + ((item.cost || 0) * item.quantity), 0);
        return sum + (order.total - orderCost);
      }, 0);
    const stockValue = products.reduce((sum, p) => sum + (p.stock * (p.cost || 0)), 0);
    
    // KPI Card Component
    const KPICard = ({ title, value, sub, icon: Icon, color, bg }: any) => (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start gap-4 hover:shadow-md transition-shadow">
        <div className={`p-3 rounded-xl ${bg} ${color}`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
          <h3 className={`text-2xl font-bold ${color}`}>{value}</h3>
          <p className="text-xs text-slate-400 mt-1">{sub}</p>
        </div>
      </div>
    );

    return (
      <div className="p-6 h-full overflow-y-auto bg-slate-50/50">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <LayoutDashboard className="text-brand-600" /> ภาพรวมร้านค้า
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
           <KPICard title="ยอดขายเดือนนี้" value={formatCurrency(monthlySales)} sub="ยอดรวมออเดอร์ทั้งหมด" icon={BarChart3} color="text-blue-600" bg="bg-blue-50" />
           <KPICard title="ยอดเก็บเงิน (Cash In)" value={formatCurrency(collectedRevenue)} sub="เฉพาะที่ชำระแล้ว" icon={Wallet} color="text-green-600" bg="bg-green-50" />
           <KPICard title="กำไรขั้นต้น (GP)" value={formatCurrency(grossProfit)} sub="ยอดขาย - ต้นทุน" icon={TrendingUp} color="text-indigo-600" bg="bg-indigo-50" />
           <KPICard title="มูลค่าสต็อก (ทุน)" value={formatCurrency(stockValue)} sub="มูลค่าสินค้าคงเหลือ" icon={PieChart} color="text-orange-600" bg="bg-orange-50" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-80">
             <div className="p-5 border-b border-slate-100 font-bold text-slate-800 flex justify-between items-center">
               <span>สินค้าขายดี</span>
               <TrendingUp size={18} className="text-slate-400"/>
             </div>
             <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center text-slate-400">
                  <BarChart3 size={48} className="mx-auto mb-2 opacity-20"/>
                  <p>กราฟจะแสดงเมื่อมีข้อมูลการขาย</p>
                </div>
             </div>
           </div>
           
           <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-80">
            <div className="p-5 border-b border-slate-100 font-bold text-slate-800 flex justify-between items-center">
               <span className="flex items-center gap-2 text-red-600"><AlertTriangle size={18}/> ต้องเติมสต็อก</span>
               <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">{products.filter(p=>p.stock<10).length} รายการ</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {products.filter(p=>p.stock<10).length > 0 ? products.filter(p=>p.stock<10).map(p=>(
                 <div key={p.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">{p.code.slice(0,2)}</div>
                     <div><p className="font-medium text-slate-800">{p.name}</p><p className="text-xs text-slate-400">รหัส: {p.code}</p></div>
                   </div>
                   <div className="text-red-500 font-bold bg-red-50 px-3 py-1 rounded-lg">เหลือ {p.stock}</div>
                 </div>
              )) : (
                <div className="flex-1 flex flex-col items-center justify-center text-green-500">
                   <Check size={32} className="mb-2"/>
                   <p>สต็อกสินค้าเพียงพอ</p>
                </div>
              )}
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
          <div className="p-4 bg-white border-b border-slate-200 shadow-sm z-10">
            <div className="flex gap-4 mb-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input type="text" placeholder="ค้นหาสินค้า (ชื่อ หรือ รหัส)..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">{categories.map(cat => (<button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-brand-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{cat === 'All' ? 'ทั้งหมด' : cat}</button>))}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map(product => (
                <button key={product.id} onClick={() => addToCart(product)} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all text-left flex flex-col h-full group relative overflow-hidden">
                  <div className={`w-full aspect-square rounded-xl mb-3 ${product.color} flex items-center justify-center text-4xl font-bold relative`}>
                    {product.name.charAt(0)}
                  </div>
                  <div className="mt-1">
                    <div className="flex justify-between items-start mb-1">
                         <h3 className="font-semibold text-slate-800 line-clamp-1">{product.name}</h3>
                         <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">{product.code}</span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-brand-600 font-bold text-lg">{formatCurrency(product.price)}</span>
                        <span className={`text-xs ${product.stock < 10 ? 'text-red-500' : 'text-slate-400'}`}>คลัง: {product.stock}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="w-full md:w-96 bg-white border-l border-slate-200 flex flex-col h-[40vh] md:h-full shadow-xl z-20">
           <div className="p-5 bg-white border-b border-slate-100 flex justify-between items-center">
             <h2 className="font-bold text-lg flex items-center gap-2"><ShoppingCart className="text-brand-600"/> ตะกร้าสินค้า</h2>
             <span className="bg-brand-50 text-brand-700 px-2 py-1 rounded text-xs font-bold">{cartItems.length} รายการ</span>
           </div>
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {cartItems.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className={`flex gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 ${item.isFree ? 'border-brand-200 bg-brand-50' : ''}`}>
                 <div className={`w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-lg ${item.color}`}>{item.name.charAt(0)}</div>
                 <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h4 className="text-sm font-bold text-slate-700 truncate flex items-center gap-2">
                        {item.name} 
                        {item.isFree && <span className="text-[10px] bg-brand-600 text-white px-1.5 rounded">FREE</span>}
                    </h4>
                    {item.promotionApplied && <p className="text-[10px] text-orange-500 font-medium">{item.promotionApplied}</p>}
                    <div className="flex items-center gap-2">
                         <p className="text-brand-600 text-sm">{formatCurrency(item.price * item.quantity)}</p>
                         {item.originalPrice && <p className="text-xs text-slate-400 line-through">{formatCurrency(item.originalPrice * item.quantity)}</p>}
                    </div>
                 </div>
                 {!item.isFree && (
                 <div className="flex flex-col items-end gap-1">
                   <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-slate-100">
                     <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-slate-100 rounded"><Minus size={12}/></button>
                     <span className="text-sm w-5 text-center font-medium">{item.quantity}</span>
                     <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-slate-100 rounded"><Plus size={12}/></button>
                   </div>
                   <button onClick={() => removeFromCart(item.id)} className="text-red-400 p-1 hover:text-red-600"><Trash2 size={14}/></button>
                 </div>
                 )}
               </div>
             ))}
             {cartItems.length === 0 && <div className="h-40 flex flex-col items-center justify-center text-slate-300"><ShoppingCart size={40} className="mb-2"/><p>เลือกสินค้าฝั่งซ้าย</p></div>}
           </div>
           <div className="p-5 bg-white border-t border-slate-100 space-y-4">
             <div className="flex justify-between text-slate-500"><span>ยอดรวมสินค้า</span><span>{formatCurrency(cartTotal)}</span></div>
             <div className="flex justify-between text-2xl font-bold text-slate-800"><span>ยอดสุทธิ</span><span>{formatCurrency(cartTotal)}</span></div>
             <button onClick={() => setIsPaymentModalOpen(true)} disabled={cartItems.length === 0} className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-brand-200 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex justify-center items-center gap-2">
                <Banknote size={20}/> ชำระเงิน
             </button>
           </div>
        </div>
      </div>
    );
  };

  const renderReports = () => {
    // Filter sales based on range
    const start = new Date(reportDateRange.start);
    const end = new Date(reportDateRange.end);
    end.setHours(23, 59, 59, 999);

    const filteredSales = recentSales.filter(s => {
        const d = new Date(s.timestamp || s.date); // Use timestamp if available, else string
        // Safe parsing for date string if timestamp missing (legacy data)
        let recordDate = d;
        if (!s.timestamp) {
             const parts = s.date.split('/');
             if (parts.length === 3) recordDate = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
        }
        return recordDate >= start && recordDate <= end && s.status !== 'Cancelled';
    });

    const totalSales = filteredSales.reduce((sum, s) => sum + s.total, 0);
    const totalOrders = filteredSales.length;

    // By Product
    const salesByProduct: Record<string, {name: string, qty: number, total: number, profit: number}> = {};
    filteredSales.forEach(order => {
        order.items.forEach(item => {
            if (!salesByProduct[item.id]) {
                salesByProduct[item.id] = { name: item.name, qty: 0, total: 0, profit: 0 };
            }
            salesByProduct[item.id].qty += item.quantity;
            salesByProduct[item.id].total += (item.price * item.quantity);
            // Profit calculation: (Price - Cost) * Qty. Handle free items (Price 0)
            const itemCost = item.cost || 0;
            salesByProduct[item.id].profit += ((item.price - itemCost) * item.quantity);
        });
    });

    // By Store/Channel (Shipping Carrier)
    const salesByChannel: Record<string, number> = {};
    filteredSales.forEach(order => {
        const channel = order.shippingCarrier === 'None' ? 'หน้าร้าน (Walk-in)' : (order.shippingCarrier || 'Unknown');
        salesByChannel[channel] = (salesByChannel[channel] || 0) + order.total;
    });

    return (
        <div className="p-6 h-full overflow-y-auto bg-slate-50/50">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="text-brand-600"/> รายงาน (Reports)</h2>
                <div className="flex gap-2 items-center bg-white p-2 rounded-xl border border-slate-200">
                    <Calendar size={18} className="text-slate-400"/>
                    <input type="date" value={reportDateRange.start} onChange={e=>setReportDateRange({...reportDateRange, start: e.target.value})} className="text-sm outline-none text-slate-600"/>
                    <span className="text-slate-400">-</span>
                    <input type="date" value={reportDateRange.end} onChange={e=>setReportDateRange({...reportDateRange, end: e.target.value})} className="text-sm outline-none text-slate-600"/>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                     <p className="text-slate-500 font-bold mb-2">ยอดขายรวม</p>
                     <h3 className="text-3xl font-bold text-brand-600">{formatCurrency(totalSales)}</h3>
                     <p className="text-xs text-slate-400 mt-2">{totalOrders} ออเดอร์</p>
                 </div>
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                     <p className="text-slate-500 font-bold mb-2">กำไรขั้นต้นรวม</p>
                     <h3 className="text-3xl font-bold text-green-600">{formatCurrency(Object.values(salesByProduct).reduce((s,i)=>s+i.profit,0))}</h3>
                 </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                 <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                     <div className="p-4 border-b border-slate-100 font-bold text-slate-700">ยอดขายรายร้านค้า/ช่องทาง</div>
                     <table className="w-full text-sm text-left">
                         <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">ช่องทาง</th><th className="p-3 text-right">ยอดขาย</th></tr></thead>
                         <tbody className="divide-y divide-slate-50">
                             {Object.entries(salesByChannel).map(([channel, total]) => (
                                 <tr key={channel}><td className="p-3 font-medium">{channel}</td><td className="p-3 text-right">{formatCurrency(total)}</td></tr>
                             ))}
                         </tbody>
                     </table>
                 </div>

                 <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                     <div className="p-4 border-b border-slate-100 font-bold text-slate-700">5 อันดับสินค้าขายดี</div>
                     <table className="w-full text-sm text-left">
                         <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">สินค้า</th><th className="p-3 text-right">จำนวน</th><th className="p-3 text-right">ยอดขาย</th></tr></thead>
                         <tbody className="divide-y divide-slate-50">
                             {Object.values(salesByProduct).sort((a,b)=>b.total - a.total).slice(0,5).map((p, i) => (
                                 <tr key={i}><td className="p-3 font-medium truncate max-w-[150px]">{p.name}</td><td className="p-3 text-right">{p.qty}</td><td className="p-3 text-right">{formatCurrency(p.total)}</td></tr>
                             ))}
                         </tbody>
                     </table>
                 </div>
             </div>

             <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                 <div className="p-4 border-b border-slate-100 font-bold text-slate-700">รายละเอียดกำไรรายสินค้า</div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="p-3">สินค้า</th>
                                <th className="p-3 text-right">จำนวนที่ขาย</th>
                                <th className="p-3 text-right">ยอดขายรวม</th>
                                <th className="p-3 text-right">กำไรรวม</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                             {Object.values(salesByProduct).sort((a,b)=>b.profit - a.profit).map((p, i) => (
                                 <tr key={i} className="hover:bg-slate-50">
                                     <td className="p-3 font-medium">{p.name}</td>
                                     <td className="p-3 text-right">{p.qty}</td>
                                     <td className="p-3 text-right">{formatCurrency(p.total)}</td>
                                     <td className="p-3 text-right font-bold text-green-600">{formatCurrency(p.profit)}</td>
                                 </tr>
                             ))}
                        </tbody>
                    </table>
                 </div>
             </div>
        </div>
    );
  };

  const renderPromotions = () => {
    return (
        <div className="p-6 h-full overflow-y-auto bg-slate-50/50">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Tag className="text-brand-600"/> จัดการโปรโมชั่น</h2>
                <button onClick={() => { setEditingPromotion(null); setIsPromotionModalOpen(true); }} className="bg-brand-600 text-white px-4 py-2 rounded-xl shadow-lg shadow-brand-200 hover:bg-brand-700 flex gap-2"><Plus size={18}/> สร้างโปรใหม่</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {promotions.map(promo => (
                    <div key={promo.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative group">
                        <div className="flex justify-between items-start mb-3">
                            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${promo.type === 'tiered_price' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                                {promo.type === 'tiered_price' ? 'Tier Price' : 'Buy X Get Y'}
                            </span>
                            <div className="flex gap-2">
                                <button onClick={() => { setEditingPromotion(promo); setIsPromotionModalOpen(true); }} className="text-slate-400 hover:text-brand-600"><Edit size={16}/></button>
                                <button onClick={() => setPromotions(prev => prev.filter(p => p.id !== promo.id))} className="text-slate-400 hover:text-red-600"><Trash2 size={16}/></button>
                            </div>
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">{promo.name}</h3>
                        
                        <div className="text-xs text-slate-500 mb-4 line-clamp-2">
                            SKU เป้าหมาย: <span className="font-mono bg-slate-100 px-1 rounded">{promo.targetSkus ? promo.targetSkus.join(', ') : (promo as any).targetSku}</span>
                        </div>
                        
                        <div className="bg-slate-50 p-3 rounded-xl text-sm space-y-2">
                            {promo.type === 'tiered_price' && promo.tiers?.map((tier, idx) => (
                                <div key={idx} className="flex justify-between">
                                    <span>ซื้อ {tier.minQty} ชิ้นขึ้นไป</span>
                                    <span className="font-bold text-brand-600">{formatCurrency(tier.price)}/ชิ้น</span>
                                </div>
                            ))}
                            {promo.type === 'buy_x_get_y' && (
                                <div className="flex justify-between items-center">
                                    <span>ซื้อครบ {promo.requiredQty}</span>
                                    <span className="text-xs">แถม {promo.freeSku} x{promo.freeQty}</span>
                                </div>
                            )}
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                             <div className={`w-3 h-3 rounded-full ${promo.isActive ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                             <span className="text-xs text-slate-500">{promo.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span>
                             <button onClick={() => setPromotions(prev => prev.map(p => p.id === promo.id ? {...p, isActive: !p.isActive} : p))} className="text-xs text-brand-600 ml-auto underline">
                                 {promo.isActive ? 'ปิด' : 'เปิด'}
                             </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
  };
  
  const renderAI = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <div className="w-16 h-16 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-sm">
                <Sparkles size={32} className="text-brand-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-600 mb-2">สวัสดีครับ, ผมคือผู้ช่วย AI ของคุณ</h3>
              <p className="text-sm">สอบถามข้อมูลการขาย, วิเคราะห์สต็อก หรือขอคำแนะนำการตลาดได้เลยครับ</p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {isChatLoading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm ml-14">
              <Loader2 className="animate-spin" size={14} /> กำลังคิดคำตอบ...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSendMessage} className="relative">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="ถามอะไรก็ได้..."
              className="w-full pl-6 pr-14 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              disabled={isChatLoading}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isChatLoading}
              className="absolute right-2 top-2 p-2 bg-brand-600 text-white rounded-xl disabled:opacity-50 hover:bg-brand-700 transition-colors"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="p-6 h-full overflow-y-auto bg-slate-50/50">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Settings className="text-brand-600" /> ตั้งค่าร้านค้า
      </h2>

      <div className="max-w-2xl bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-start gap-8 mb-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-32 h-32 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden relative group">
              {storeProfile.logoUrl ? (
                <img src={storeProfile.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Store size={40} className="text-slate-400" />
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="text-white text-xs font-bold flex flex-col items-center"
                >
                  <ImagePlus size={24} className="mb-1" /> เปลี่ยนรูป
                </button>
              </div>
            </div>
            <input type="file" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">ชื่อร้าน</label>
              <input
                value={storeProfile.name}
                onChange={(e) => setStoreProfile({ ...storeProfile, name: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">เบอร์โทรศัพท์</label>
              <input
                value={storeProfile.phone}
                onChange={(e) => setStoreProfile({ ...storeProfile, phone: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="mb-8">
          <label className="text-xs font-bold text-slate-500 mb-1 block">ที่อยู่ร้าน</label>
          <textarea
            rows={3}
            value={storeProfile.address}
            onChange={(e) => setStoreProfile({ ...storeProfile, address: e.target.value })}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500 transition-all resize-none"
          />
        </div>
        
        <div className="mb-8">
          <label className="text-xs font-bold text-slate-500 mb-1 block">PromptPay ID / เลขบัญชี (สำหรับ QR Code)</label>
          <input
             value={storeProfile.promptPayId || ''}
             onChange={(e) => setStoreProfile({ ...storeProfile, promptPayId: e.target.value })}
             placeholder="เช่น 0812345678 หรือ 1234567890123"
             className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500 transition-all"
          />
        </div>

        <div className="border-t border-slate-100 pt-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <DatabaseBackup size={18} /> จัดการข้อมูล
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-brand-200 transition-colors">
              <h4 className="font-bold text-sm mb-2">นำเข้าสินค้า (CSV)</h4>
              <p className="text-xs text-slate-500 mb-3">นำเข้าข้อมูลสินค้าจากไฟล์ CSV</p>
              <div className="flex gap-2">
                <button onClick={() => productCsvRef.current?.click()} className="flex-1 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold hover:bg-brand-50 hover:text-brand-600">เลือกไฟล์</button>
                <button onClick={downloadProductTemplate} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-brand-600"><FileDown size={14} /></button>
              </div>
              <input type="file" ref={productCsvRef} onChange={handleProductImport} className="hidden" accept=".csv" />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-brand-200 transition-colors">
              <h4 className="font-bold text-sm mb-2">นำเข้าประวัติการขาย (CSV)</h4>
              <p className="text-xs text-slate-500 mb-3">นำเข้าข้อมูลการขายเก่า</p>
              <div className="flex gap-2">
                <button onClick={() => salesCsvRef.current?.click()} className="flex-1 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold hover:bg-brand-50 hover:text-brand-600">เลือกไฟล์</button>
                <button onClick={downloadSalesTemplate} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-brand-600"><FileDown size={14} /></button>
              </div>
              <input type="file" ref={salesCsvRef} onChange={handleSalesImport} className="hidden" accept=".csv" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 font-sans">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
      <Sidebar currentMode={mode} onModeChange={setMode} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onExport={handleExportData} onImport={handleImportData} />
      
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 bg-white border-b md:hidden flex-shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-500"><Menu /></button>
          <span className="font-bold text-brand-600 text-lg">{storeProfile.name}</span><div className="w-8"/>
        </header>
        <div className="flex-1 overflow-hidden relative">
          {mode === AppMode.DASHBOARD && renderDashboard()}
          {mode === AppMode.POS && renderPOS()}
          {mode === AppMode.ORDERS && renderOrders()}
          {mode === AppMode.REPORTS && renderReports()}
          {mode === AppMode.PROMOTIONS && renderPromotions()}
          {mode === AppMode.STOCK && 
            <div className="p-6 h-full overflow-y-auto bg-slate-50/50">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-2xl font-bold text-slate-800">จัดการคลังสินค้า</h2>
                 <button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="bg-brand-600 text-white px-4 py-2 rounded-xl shadow-lg shadow-brand-200 hover:bg-brand-700 flex gap-2"><Plus size={18}/> เพิ่มสินค้า</button>
               </div>
               <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                 <table className="w-full text-left text-sm">
                   <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><th className="p-4 font-medium">รหัส (Code)</th><th className="p-4 font-medium">ชื่อสินค้า</th><th className="p-4 text-right font-medium">ต้นทุน</th><th className="p-4 text-right font-medium">ราคาขาย</th><th className="p-4 text-right font-medium">คงเหลือ</th><th className="p-4 text-center font-medium">จัดการ</th></tr></thead>
                   <tbody className="divide-y divide-slate-50">{products.map(p=>(<tr key={p.id} className="hover:bg-slate-50"><td className="p-4 text-slate-500 font-mono">{p.code}</td><td className="p-4 font-medium text-slate-800">{p.name}</td><td className="p-4 text-right text-slate-400">{formatCurrency(p.cost || 0)}</td><td className="p-4 text-right font-bold text-slate-800">{formatCurrency(p.price)}</td><td className="p-4 text-right">{p.stock}</td><td className="p-4 text-center"><button onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600"><Edit size={16}/></button><button onClick={()=>{if(confirm('ลบ?'))setProducts(prev=>prev.filter(x=>x.id!==p.id))}} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={16}/></button></td></tr>))}</tbody>
                 </table>
               </div>
            </div>
          }
          {mode === AppMode.AI && renderAI()}
          {mode === AppMode.SETTINGS && renderSettings()}
        </div>
      </main>

      {/* Promotion Edit Modal */}
      {isPromotionModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                  <h3 className="text-lg font-bold mb-4">{editingPromotion ? 'แก้ไขโปรโมชั่น' : 'สร้างโปรโมชั่นใหม่'}</h3>
                  <form onSubmit={handleSavePromotion} className="space-y-4">
                      <div><label className="text-xs font-bold text-slate-500 block mb-1">ชื่อโปรโมชั่น</label><input name="name" required defaultValue={editingPromotion?.name} className="w-full p-2 border rounded-lg outline-none" placeholder="เช่น ซื้อ 10 แถม 1"/></div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 block mb-1">ประเภท</label>
                              <select name="type" value={promoType} onChange={(e) => setPromoType(e.target.value as PromotionType)} className="w-full p-2 border rounded-lg outline-none">
                                  <option value="tiered_price">Tier Price (ซื้อเยอะลดราคา)</option>
                                  <option value="buy_x_get_y">Buy X Get Y (แถมสินค้า)</option>
                              </select>
                          </div>
                          <div>
                              {/* Empty placeholder to maintain grid layout if needed */}
                          </div>
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-500 block mb-1">SKU สินค้าที่ร่วมรายการ</label>
                          <textarea 
                              name="targetSkus" 
                              required 
                              defaultValue={editingPromotion?.targetSkus ? editingPromotion.targetSkus.join(', ') : (editingPromotion as any)?.targetSku} 
                              className="w-full p-2 border rounded-lg outline-none h-24 text-sm font-mono" 
                              placeholder="ระบุรหัสสินค้า (SKU) คั่นด้วยคอมม่า (,) หรือขึ้นบรรทัดใหม่ รองรับสูงสุด 50 SKU"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">ตัวอย่าง: A001, A002, B005</p>
                      </div>

                      {/* Dynamic Fields based on Type */}
                      <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                          <p className="text-xs font-bold text-brand-600 uppercase">ตั้งค่าเงื่อนไข</p>
                          
                          {promoType === 'tiered_price' && (
                              <div className="border-b border-slate-200 pb-3">
                                  <p className="text-xs text-slate-400 mb-2">กำหนดราคาตามจำนวน (สูงสุด 7 ขั้น) - เว้นว่างหากไม่ต้องการใช้</p>
                                  {Array.from({ length: 7 }).map((_, i) => (
                                      <div key={i} className="flex gap-2 mb-2 items-center">
                                          <span className="text-xs text-slate-400 w-8 text-center">{i+1}.</span>
                                          <input 
                                              name={`minQty${i}`} 
                                              type="number" 
                                              placeholder="จำนวนขั้นต่ำ" 
                                              defaultValue={editingPromotion?.tiers?.[i]?.minQty} 
                                              className="flex-1 p-2 text-sm border rounded-lg"
                                          />
                                          <input 
                                              name={`price${i}`} 
                                              type="number" 
                                              placeholder="ราคาต่อชิ้น" 
                                              defaultValue={editingPromotion?.tiers?.[i]?.price} 
                                              className="flex-1 p-2 text-sm border rounded-lg"
                                          />
                                      </div>
                                  ))}
                              </div>
                          )}

                          {promoType === 'buy_x_get_y' && (
                              <div>
                                  <p className="text-xs text-slate-400 mb-2">สำหรับ Buy X Get Y (ซื้อครบ X แถม Y)</p>
                                  <div className="flex gap-2">
                                      <input name="requiredQty" type="number" placeholder="ซื้อครบ (จำนวน)" defaultValue={editingPromotion?.requiredQty} className="w-1/3 p-2 text-sm border rounded-lg"/>
                                      <input name="freeSku" placeholder="รหัสของแถม" defaultValue={editingPromotion?.freeSku} className="w-1/3 p-2 text-sm border rounded-lg"/>
                                      <input name="freeQty" type="number" placeholder="แถม (จำนวน)" defaultValue={editingPromotion?.freeQty} className="w-1/3 p-2 text-sm border rounded-lg"/>
                                  </div>
                              </div>
                          )}
                      </div>

                      <div className="flex gap-3 pt-2">
                          <button type="button" onClick={()=>setIsPromotionModalOpen(false)} className="flex-1 py-2 border rounded-xl">ยกเลิก</button>
                          <button type="submit" className="flex-1 py-2 bg-brand-600 text-white rounded-xl">บันทึก</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="text-center mb-6">
                <p className="text-slate-500 text-sm mb-1">ยอดชำระทั้งหมด</p>
                <h3 className="text-4xl font-bold text-slate-800">{formatCurrency(calculatedCart.total)}</h3>
             </div>
             <div className="grid grid-cols-2 gap-4 mb-8">
               <button onClick={()=>setPaymentMethod('cash')} className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='cash'?'border-brand-500 bg-brand-50 text-brand-700':'border-slate-100 text-slate-400 hover:border-slate-200'}`}><Banknote size={32}/><span className="font-bold">เงินสด</span></button>
               <button onClick={()=>setPaymentMethod('qr')} className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${paymentMethod==='qr'?'border-brand-500 bg-brand-50 text-brand-700':'border-slate-100 text-slate-400 hover:border-slate-200'}`}><CreditCard size={32}/><span className="font-bold">QR Code</span></button>
             </div>
             <div className="space-y-3">
               <button onClick={processPayment} className="w-full bg-brand-600 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-brand-200 hover:bg-brand-700 active:scale-95 transition-all">ยืนยันการชำระเงิน</button>
               <button onClick={()=>setIsPaymentModalOpen(false)} className="w-full bg-white border border-slate-200 text-slate-500 py-3.5 rounded-xl font-bold hover:bg-slate-50">ยกเลิก</button>
             </div>
          </div>
        </div>
      )}

      {/* Back Office Order Modal (Redesigned 2-Column) */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><ClipboardList className="text-brand-600"/> สร้างออเดอร์ใหม่</h3>
                <p className="text-xs text-slate-500 mt-1">สำหรับลูกค้าโทรสั่ง หรือทักแชท</p>
              </div>
              <button onClick={()=>setIsOrderModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X/></button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Left Column: Info */}
              <div className="w-full md:w-1/3 bg-slate-50 p-6 border-r border-slate-200 overflow-y-auto">
                 <div className="space-y-6">
                    <section>
                      <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2 text-sm"><User size={16}/> ข้อมูลลูกค้า</h4>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                         <input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all" value={newOrderCustomer.name} onChange={e=>setNewOrderCustomer({...newOrderCustomer, name: e.target.value})} placeholder="ชื่อลูกค้า..."/>
                         <input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-all" value={newOrderCustomer.phone} onChange={e=>setNewOrderCustomer({...newOrderCustomer, phone: e.target.value})} placeholder="เบอร์โทร..."/>
                         <textarea rows={3} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-all resize-none" value={newOrderCustomer.address} onChange={e=>setNewOrderCustomer({...newOrderCustomer, address: e.target.value})} placeholder="ที่อยู่จัดส่ง (เมือง/แขวง)..."/>
                      </div>
                    </section>
                    
                    <section>
                      <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2 text-sm"><Truck size={16}/> การจัดส่ง</h4>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                         <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={newOrderShipping.carrier} onChange={e=>setNewOrderShipping({...newOrderShipping, carrier: e.target.value as LogisticsProvider})}>
                           {LOGISTICS_PROVIDERS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                         </select>
                         {newOrderShipping.carrier !== 'None' && (
                           <input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none transition-all" value={newOrderShipping.branch} onChange={e=>setNewOrderShipping({...newOrderShipping, branch: e.target.value})} placeholder="ระบุสาขาปลายทาง..."/>
                         )}
                      </div>
                    </section>
                 </div>
              </div>

              {/* Right Column: Products */}
              <div className="flex-1 flex flex-col bg-white">
                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                      <input className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 transition-all" placeholder="พิมพ์รหัสสินค้า (SKU) หรือ ชื่อสินค้า..." value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)} />
                    </div>
                    
                    {/* Search Results Popup */}
                    {skuSearch && (
                      <div className="absolute top-20 left-4 right-4 z-20 bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto p-2">
                        {products.filter(p => p.code.toLowerCase().includes(skuSearch.toLowerCase()) || p.name.toLowerCase().includes(skuSearch.toLowerCase())).map(p => (
                            <button key={p.id} onClick={()=>addToCart(p, true)} className="w-full flex items-center justify-between p-3 hover:bg-brand-50 rounded-lg text-left group transition-colors border-b border-slate-50 last:border-0">
                              <div><span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 mr-2">{p.code}</span><span className="text-sm font-medium group-hover:text-brand-600">{p.name}</span></div>
                              <div className="text-right"><span className="text-sm font-bold text-brand-600">{formatCurrency(p.price)}</span></div>
                            </button>
                        ))}
                      </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">รายการสินค้าที่เลือก</h4>
                   {tempOrderCart.length === 0 ? (
                     <div className="h-40 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
                       <Package size={32} className="mb-2 opacity-50"/>
                       <p className="text-sm">พิมพ์ค้นหาเพื่อเพิ่มสินค้า</p>
                     </div>
                   ) : (
                     <div className="space-y-2">
                       {calculatedTempOrderCart.items.map((item, idx) => (
                         <div key={`${item.id}-${idx}`} className={`flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm ${item.isFree ? 'bg-brand-50 border-brand-200' : ''}`}>
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-xs text-slate-500 font-bold">{item.code.slice(0,2)}</div>
                              <div>
                                <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                                    {item.name}
                                    {item.isFree && <span className="text-[10px] bg-brand-600 text-white px-1.5 rounded">FREE</span>}
                                </p>
                                <p className="text-xs text-slate-400">{item.code}</p>
                              </div>
                           </div>
                           <div className="flex items-center gap-4">
                             {!item.isFree && (
                             <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200">
                               <button onClick={()=>updateQuantity(item.id, -1, true)} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-l-lg transition-colors">-</button>
                               <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                               <button onClick={()=>updateQuantity(item.id, 1, true)} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-r-lg transition-colors">+</button>
                             </div>
                             )}
                             {item.isFree && <div className="text-sm font-medium">x{item.quantity}</div>}
                             <div className="text-right w-20">
                               <p className="font-bold text-brand-600">{formatCurrency(item.price*item.quantity)}</p>
                             </div>
                             {!item.isFree && <button onClick={()=>removeFromCart(item.id, true)} className="text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>}
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                </div>

                <div className="p-5 bg-slate-50 border-t border-slate-200">
                   <div className="flex justify-between items-center mb-4">
                      <span className="text-slate-500">ยอดรวมทั้งสิ้น</span>
                      <span className="text-2xl font-bold text-brand-700">{formatCurrency(calculatedTempOrderCart.total)}</span>
                   </div>
                   <div className="flex gap-3">
                      <button onClick={()=>setIsOrderModalOpen(false)} className="flex-1 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                      <button onClick={createBackOfficeOrder} disabled={tempOrderCart.length===0} className="flex-[2] py-3 bg-brand-600 text-white rounded-xl font-bold shadow-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed">บันทึกออเดอร์</button>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Edit Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-in zoom-in-95">
            <h3 className="text-lg font-bold mb-4">{editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</h3>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                 <div className="col-span-1"><label className="text-xs font-bold text-slate-500 mb-1 block">รหัส SKU</label><input name="code" required placeholder="A001" defaultValue={editingProduct?.code} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-brand-500"/></div>
                 <div className="col-span-2"><label className="text-xs font-bold text-slate-500 mb-1 block">ชื่อสินค้า</label><input name="name" required placeholder="ชื่อสินค้า" defaultValue={editingProduct?.name} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-brand-500"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <div><label className="text-xs font-bold text-red-500 mb-1 block">ต้นทุน (Cost)</label><input name="cost" type="number" required defaultValue={editingProduct?.cost || 0} className="w-full p-2.5 border border-red-200 rounded-lg outline-none focus:ring-1 focus:ring-red-200"/></div>
                 <div><label className="text-xs font-bold text-green-600 mb-1 block">ราคาขาย (Price)</label><input name="price" type="number" required defaultValue={editingProduct?.price} className="w-full p-2.5 border border-green-200 rounded-lg outline-none focus:ring-1 focus:ring-green-200"/></div>
              </div>
              <div className="flex gap-3">
                 <div className="flex-1"><label className="text-xs font-bold text-slate-500 mb-1 block">จำนวน (Stock)</label><input name="stock" type="number" required defaultValue={editingProduct?.stock} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-brand-500"/></div>
                 <div className="flex-1">
                    <label className="text-xs font-bold text-slate-500 mb-1 block">หมวดหมู่</label>
                    <input 
                      name="category" 
                      list="categories" 
                      required 
                      placeholder="ระบุหมวดหมู่" 
                      defaultValue={editingProduct?.category || 'อาหาร'} 
                      className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-brand-500"
                    />
                    <datalist id="categories">
                      {Array.from(new Set(products.map(p => p.category))).map(c => <option key={c} value={c} />)}
                      <option value="อาหาร" />
                      <option value="เครื่องดื่ม" />
                      <option value="ของใช้" />
                      <option value="อื่นๆ" />
                    </datalist>
                 </div>
              </div>
              <div className="flex gap-3 pt-2"><button type="button" onClick={()=>setIsProductModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">ยกเลิก</button><button type="submit" className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl shadow-lg shadow-brand-200 hover:bg-brand-700">บันทึก</button></div>
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
                    <span>{formatCurrency(item.isFree ? 0 : item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-bold text-lg mb-6">
                <span>Total</span>
                <span>{formatCurrency(currentOrder.total)}</span>
              </div>
              {storeProfile.promptPayId && (
                <div className="text-center mb-4 p-2 bg-slate-50 rounded">
                    <p className="text-xs font-bold mb-1">PromptPay / QR Payment</p>
                    <p className="font-mono text-sm">{storeProfile.promptPayId}</p>
                </div>
              )}
              <div className="text-center text-xs text-slate-400">ขอบคุณที่อุดหนุน (Thank you)</div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
               <button onClick={()=>setShowReceipt(false)} className="flex-1 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold">ปิด</button>
               <button onClick={handlePrintReceipt} className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Printer size={16}/> พิมพ์</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;