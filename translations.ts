
import { Language } from './types';

export const translations = {
  lo: {
    // Menu
    menu_dashboard: 'ພາບລວມ (Dashboard)',
    menu_pos: 'ໜ້າຂາຍ (POS)',
    menu_orders: 'ລາຍການຂາຍ',
    menu_stock: 'ສາງສິນຄ້າ (Stock)',
    menu_reports: 'ລາຍງານ (Reports)',
    menu_promotions: 'ໂປຣໂມຊັ່ນ',
    menu_ai: 'ຜູ້ຊ່ວຍ AI',
    menu_settings: 'ຕັ້ງຄ່າຮ້ານຄ້າ',
    menu_logout: 'ອອກຈາກລະບົບ',
    
    // Dashboard
    dash_title: 'ພາບລວມຮ້ານຄ້າ',
    dash_sales_month: 'ຍອດຂາຍເດືອນນີ້',
    dash_total_orders: 'ຍອດລວມອໍເດີ້ທັງໝົດ',
    dash_cash_in: 'ຍອດເກັບເງິນ (Cash In)',
    dash_paid_only: 'ສະເພາະທີ່ຊຳລະແລ້ວ',
    dash_profit: 'ກຳໄລຂັ້ນຕົ້ນ (GP)',
    dash_sales_cost: 'ຍອດຂາຍ - ຕົ້ນທຶນ',
    dash_stock_value: 'ມູນຄ່າສະຕັອກ (ທຶນ)',
    dash_stock_remaining: 'ມູນຄ່າສິນຄ້າຄົງເຫຼືອ',
    dash_best_seller: 'ສິນຄ້າຂາຍດີ',
    dash_low_stock: 'ຕ້ອງເຕີມສະຕັອກ',
    dash_stock_ok: 'ສະຕັອກສິນຄ້າພຽງພໍ',
    
    // POS
    pos_search_placeholder: 'ຄົ້ນຫາສິນຄ້າ (ຊື່ ຫຼື ລະຫັດ)...',
    pos_all_cat: 'ທັງໝົດ',
    pos_cart_title: 'ກະຕ່າສິນຄ້າ',
    pos_items: 'ລາຍການ',
    pos_total_items: 'ຍອດລວມສິນຄ້າ',
    pos_net_total: 'ຍອດສຸດທິ',
    pos_pay: 'ຊຳລະເງິນ',
    pos_empty_cart: 'ເລືອກສິນຄ້າຢູ່ຊ້າຍມື',
    pos_stock: 'ຄັງ',
    pos_free: 'FREE',
    pos_discount: 'ສ່ວນຫຼຸດທ້າຍບິນ',
    pos_clear_cart: 'ລ້າງກະຕ່າ',
    
    // Orders
    order_title: 'ລາຍການອໍເດີ້',
    order_create: 'ສ້າງອໍເດີ້',
    order_id: 'Order ID',
    order_customer: 'ລູກຄ້າ',
    order_date: 'ວັນທີ',
    order_total: 'ຍອດລວມ',
    order_shipping: 'ການຈັດສົ່ງ',
    order_status: 'ສະຖານະ',
    order_action: 'ຈັດການ',
    order_status_pending: 'ລໍຖ້າຊຳລະ',
    order_status_paid: 'ຊຳລະແລ້ວ',
    order_status_shipped: 'ສົ່ງແລ້ວ',
    order_status_cancelled: 'ຍົກເລີກ',
    order_no_data: 'ຍັງບໍ່ມີລາຍການຂາຍ',
    order_delete_confirm: 'ຕ້ອງການລຶບອໍເດີ້ ແລະ ຄືນສິນຄ້າເຂົ້າສະຕັອກບໍ່?',
    
    // Stock
    stock_title: 'ຈັດການຄັງສິນຄ້າ',
    stock_add: 'ເພີ່ມສິນຄ້າ',
    stock_code: 'ລະຫັດ (Code)',
    stock_name: 'ຊື່ສິນຄ້າ',
    stock_cost: 'ຕົ້ນທຶນ',
    stock_price: 'ລາຄາຂາຍ',
    stock_remaining: 'ຄົງເຫຼືອ',
    stock_manage: 'ຈັດການ',
    stock_delete_confirm: 'ລຶບ?',
    stock_image: 'ຮູບພາບສິນຄ້າ',

    // Promotions
    promo_add: 'ສ້າງໂປຣໂມຊັ່ນ',
    promo_no_data: 'ຍັງບໍ່ມີໂປຣໂມຊັ່ນ',
    
    // Settings
    setting_title: 'ຕັ້ງຄ່າຮ້ານຄ້າ',
    setting_shop_name: 'ຊື່ຮ້ານ',
    setting_phone: 'ເບີໂທລະສັບ',
    setting_address: 'ທີ່ຢູ່ຮ້ານ',
    setting_promptpay: 'PromptPay ID / ເລກບັນຊີ',
    setting_data_manage: 'ຈັດການຂໍ້ມູນ',
    setting_import_product: 'ນຳເຂົ້າສິນຄ້າ (CSV)',
    setting_import_sales: 'ນຳເຂົ້າປະຫວັດການຂາຍ (CSV)',
    setting_backup: 'ສຳຮອງຂໍ້ມູນ',
    setting_restore: 'ກູ້ຄືນຂໍ້ມູນ',
    setting_danger: 'ພື້ນທີ່ອັນຕະລາຍ',
    setting_factory_reset: 'ຄືນຄ່າໂຮງງານ',
    setting_clear_all: 'ລຶບຂໍ້ມູນທັງໝົດ',
    setting_clear_sales: 'ລ້າງປະຫວັດການຂາຍ',
    
    // Common
    save: 'ບັນທຶກ',
    cancel: 'ຍົກເລີກ',
    close: 'ປິດ',
    print: 'ພິມ',
    confirm: 'ຢືນຢັນ',
    file_select: 'ເລືອກໄຟລ໌',
    success: 'ສຳເລັດ',
    error: 'ຜິດພາດ',
    delete: 'ລຶບ',
    
    // AI
    ai_title: 'ຜູ້ຊ່ວຍອັດສະລິຍະ',
    ai_desc: 'ປຶກສາການຕະຫຼາດ, ຈັດການສະຕັອກ ຫຼື ແປພາສາ',
    ai_input_placeholder: 'ພິມຂໍ້ຄວາມ... (ເຊັ່ນ ວິເຄາະສິນຄ້າຂາຍດີ)',
    ai_thinking: 'ກຳລັງຄິດ...',
    
    // Payment Modal
    pay_total: 'ຍອດຊຳລະທັງໝົດ',
    pay_cash: 'ເງິນສົດ',
    pay_qr: 'QR Code',
    pay_confirm: 'ຢືນຢັນການຊຳລະເງິນ'
  },
  
  th: {
    // Menu
    menu_dashboard: 'ภาพรวม (Dashboard)',
    menu_pos: 'หน้าขาย (POS)',
    menu_orders: 'รายการขาย',
    menu_stock: 'คลังสินค้า (Stock)',
    menu_reports: 'รายงาน (Reports)',
    menu_promotions: 'โปรโมชั่น',
    menu_ai: 'ผู้ช่วย AI',
    menu_settings: 'ตั้งค่าร้านค้า',
    menu_logout: 'ออกจากระบบ',
    
    // Dashboard
    dash_title: 'ภาพรวมร้านค้า',
    dash_sales_month: 'ยอดขายเดือนนี้',
    dash_total_orders: 'ยอดรวมออเดอร์ทั้งหมด',
    dash_cash_in: 'ยอดเก็บเงิน (Cash In)',
    dash_paid_only: 'เฉพาะที่ชำระแล้ว',
    dash_profit: 'กำไรขั้นต้น (GP)',
    dash_sales_cost: 'ยอดขาย - ต้นทุน',
    dash_stock_value: 'มูลค่าสต็อก (ทุน)',
    dash_stock_remaining: 'มูลค่าสินค้าคงเหลือ',
    dash_best_seller: 'สินค้าขายดี',
    dash_low_stock: 'ต้องเติมสต็อก',
    dash_stock_ok: 'สต็อกสินค้าเพียงพอ',
    
    // POS
    pos_search_placeholder: 'ค้นหาสินค้า (ชื่อ หรือ รหัส)...',
    pos_all_cat: 'ทั้งหมด',
    pos_cart_title: 'ตะกร้าสินค้า',
    pos_items: 'รายการ',
    pos_total_items: 'ยอดรวมสินค้า',
    pos_net_total: 'ยอดสุทธิ',
    pos_pay: 'ชำระเงิน',
    pos_empty_cart: 'เลือกสินค้าฝั่งซ้าย',
    pos_stock: 'คลัง',
    pos_free: 'แถม',
    pos_discount: 'ส่วนลดท้ายบิล',
    pos_clear_cart: 'ล้างตะกร้า',
    
    // Orders
    order_title: 'รายการออเดอร์',
    order_create: 'สร้างออเดอร์',
    order_id: 'Order ID',
    order_customer: 'ลูกค้า',
    order_date: 'วันที่',
    order_total: 'ยอดรวม',
    order_shipping: 'การจัดส่ง',
    order_status: 'สถานะ',
    order_action: 'จัดการ',
    order_status_pending: 'รอชำระ',
    order_status_paid: 'ชำระแล้ว',
    order_status_shipped: 'ส่งแล้ว',
    order_status_cancelled: 'ยกเลิก',
    order_no_data: 'ยังไม่มีรายการขาย',
    order_delete_confirm: 'ต้องการลบออเดอร์ และคืนสินค้าเข้าสต็อกใช่ไหม?',
    
    // Stock
    stock_title: 'จัดการคลังสินค้า',
    stock_add: 'เพิ่มสินค้า',
    stock_code: 'รหัส (Code)',
    stock_name: 'ชื่อสินค้า',
    stock_cost: 'ต้นทุน',
    stock_price: 'ราคาขาย',
    stock_remaining: 'คงเหลือ',
    stock_manage: 'จัดการ',
    stock_delete_confirm: 'ลบ?',
    stock_image: 'รูปสินค้า',

    // Promotions
    promo_add: 'สร้างโปรโมชั่น',
    promo_no_data: 'ยังไม่มีโปรโมชั่น',
    
    // Settings
    setting_title: 'ตั้งค่าร้านค้า',
    setting_shop_name: 'ชื่อร้าน',
    setting_phone: 'เบอร์โทรศัพท์',
    setting_address: 'ที่อยู่ร้าน',
    setting_promptpay: 'PromptPay ID / เลขบัญชี',
    setting_data_manage: 'จัดการข้อมูล',
    setting_import_product: 'นำเข้าสินค้า (CSV)',
    setting_import_sales: 'นำเข้าประวัติการขาย (CSV)',
    setting_backup: 'สำรองข้อมูล',
    setting_restore: 'กู้คืนข้อมูล',
    setting_danger: 'พื้นที่อันตราย',
    setting_factory_reset: 'คืนค่าโรงงาน',
    setting_clear_all: 'ลบข้อมูลทั้งหมด',
    setting_clear_sales: 'ล้างประวัติการขาย',
    
    // Common
    save: 'บันทึก',
    cancel: 'ยกเลิก',
    close: 'ปิด',
    print: 'พิมพ์',
    confirm: 'ยืนยัน',
    file_select: 'เลือกไฟล์',
    success: 'สำเร็จ',
    error: 'ผิดพลาด',
    delete: 'ลบ',
    
    // AI
    ai_title: 'ผู้ช่วยอัจฉริยะ',
    ai_desc: 'ปรึกษาการตลาด จัดการสต็อก หรือแปลภาษา',
    ai_input_placeholder: 'พิมพ์ข้อความ... (เช่น วิเคราะห์สินค้าขายดี)',
    ai_thinking: 'กำลังคิด...',
    
    // Payment Modal
    pay_total: 'ยอดชำระทั้งหมด',
    pay_cash: 'เงินสด',
    pay_qr: 'QR Code',
    pay_confirm: 'ยืนยันการชำระเงิน'
  },
  
  en: {
    // Menu
    menu_dashboard: 'Dashboard',
    menu_pos: 'POS',
    menu_orders: 'Orders',
    menu_stock: 'Stock',
    menu_reports: 'Reports',
    menu_promotions: 'Promotions',
    menu_ai: 'AI Assistant',
    menu_settings: 'Settings',
    menu_logout: 'Logout',
    
    // Dashboard
    dash_title: 'Dashboard Overview',
    dash_sales_month: 'Monthly Sales',
    dash_total_orders: 'Total Orders',
    dash_cash_in: 'Cash In',
    dash_paid_only: 'Paid orders only',
    dash_profit: 'Gross Profit (GP)',
    dash_sales_cost: 'Sales - Cost',
    dash_stock_value: 'Stock Value',
    dash_stock_remaining: 'Cost of inventory',
    dash_best_seller: 'Best Sellers',
    dash_low_stock: 'Low Stock',
    dash_stock_ok: 'Stock levels are good',
    
    // POS
    pos_search_placeholder: 'Search product (Name or SKU)...',
    pos_all_cat: 'All',
    pos_cart_title: 'Cart',
    pos_items: 'Items',
    pos_total_items: 'Subtotal',
    pos_net_total: 'Total',
    pos_pay: 'Pay',
    pos_empty_cart: 'Select items to add',
    pos_stock: 'Stock',
    pos_free: 'FREE',
    pos_discount: 'Bill Discount',
    pos_clear_cart: 'Clear',
    
    // Orders
    order_title: 'Order List',
    order_create: 'New Order',
    order_id: 'Order ID',
    order_customer: 'Customer',
    order_date: 'Date',
    order_total: 'Total',
    order_shipping: 'Shipping',
    order_status: 'Status',
    order_action: 'Action',
    order_status_pending: 'Pending',
    order_status_paid: 'Paid',
    order_status_shipped: 'Shipped',
    order_status_cancelled: 'Cancelled',
    order_no_data: 'No sales records found',
    order_delete_confirm: 'Delete order and return stock?',
    
    // Stock
    stock_title: 'Inventory Management',
    stock_add: 'Add Product',
    stock_code: 'Code',
    stock_name: 'Name',
    stock_cost: 'Cost',
    stock_price: 'Price',
    stock_remaining: 'Stock',
    stock_manage: 'Manage',
    stock_delete_confirm: 'Delete?',
    stock_image: 'Product Image',

    // Promotions
    promo_add: 'Create Promotion',
    promo_no_data: 'No Promotions',
    
    // Settings
    setting_title: 'Store Settings',
    setting_shop_name: 'Store Name',
    setting_phone: 'Phone Number',
    setting_address: 'Address',
    setting_promptpay: 'PromptPay ID / Bank Acc',
    setting_data_manage: 'Data Management',
    setting_import_product: 'Import Products (CSV)',
    setting_import_sales: 'Import Sales (CSV)',
    setting_backup: 'Backup Data',
    setting_restore: 'Restore Data',
    setting_danger: 'Danger Zone',
    setting_factory_reset: 'Factory Reset',
    setting_clear_all: 'Clear All Data',
    setting_clear_sales: 'Clear Sales History',
    
    // Common
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    print: 'Print',
    confirm: 'Confirm',
    file_select: 'Select File',
    success: 'Success',
    error: 'Error',
    delete: 'Delete',
    
    // AI
    ai_title: 'AI Assistant',
    ai_desc: 'Ask about marketing, stock, or translation',
    ai_input_placeholder: 'Type a message... (e.g. Analyze sales)',
    ai_thinking: 'Thinking...',
    
    // Payment Modal
    pay_total: 'Total Amount',
    pay_cash: 'Cash',
    pay_qr: 'QR Code',
    pay_confirm: 'Confirm Payment'
  }
};
