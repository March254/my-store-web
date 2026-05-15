"use client";
import { useState, useEffect } from "react";
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';
import ItemCard from './ItemCard';

export default function Home() {
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [borrower, setBorrower] = useState("");
  const [cart, setCart] = useState({});
  const [mode, setMode] = useState("withdraw");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [groupedRequests, setGroupedRequests] = useState({}); 
  const [myPendingRequests, setMyPendingRequests] = useState([]);
  const [myItems, setMyItems] = useState([]);
  const [history, setHistory] = useState([]); 
  const [allHistory, setAllHistory] = useState([]); 
  const [showHistory, setShowHistory] = useState(false);
  const [showAdminHistory, setShowAdminHistory] = useState(false); 
  const router = useRouter();

  const ADMIN_EMAILS = ["admin@email.com", "your-email@email.com"]; 

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      } else {
        setUser(user);
        setBorrower(user.email);
        const adminStatus = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
        setIsAdmin(adminStatus);
        fetchData(user.email, adminStatus);
      }
    };
    checkUser();
    const interval = setInterval(() => { if (user) fetchData(user.email, isAdmin); }, 10000);
    return () => clearInterval(interval);
  }, [user, isAdmin]);

  const handlePrintGroup = (selectedLog) => {
    const groupItems = allHistory.filter(item => 
      item.group_id === selectedLog.group_id && 
      item.type === selectedLog.type &&
      Math.abs(new Date(item.created_at) - new Date(selectedLog.created_at)) < 60000 
    );

    const printWindow = window.open('', '_blank');
    const dateStr = new Date(selectedLog.created_at).toLocaleDateString('th-TH');
    const timeStr = new Date(selectedLog.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const typeLabel = selectedLog.type === 'withdraw' ? 'เบิกของ' : 'คืนของ';

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt - รอบ ${timeStr}</title>
          <style>
            body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #333; }
            .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
            .title { font-size: 22px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f9f9f9; font-weight: bold; }
            .info { margin-bottom: 20px; line-height: 1.8; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">ใบเสร็จบันทึกรายการ${typeLabel}</div>
            <div style="font-size: 11px;">รหัสรอบ: ${selectedLog.group_id}</div>
          </div>
          <div class="info">
            <div><strong>ผู้ทำรายการ:</strong> ${selectedLog.borrower_name}</div>
            <div><strong>วันที่/เวลา:</strong> ${dateStr} | ${timeStr} น.</div>
          </div>
          <table>
            <thead><tr><th>รายการอุปกรณ์</th><th style="text-align: center;">จำนวน</th></tr></thead>
            <tbody>
              ${groupItems.map(item => `<tr><td>${item.product_name}</td><td style="text-align: center;">${item.amount}</td></tr>`).join('')}
            </tbody>
          </table>
          <script>window.print(); setTimeout(() => window.close(), 500);</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const fetchData = async (email, adminStatus) => {
    fetchProducts();
    fetchMyBorrowedItems(email);
    fetchMyPendingRequests(email);
    fetchUserHistory(email);
    if (adminStatus) fetchAdminData();
  };

  const fetchAdminData = () => {
    fetchAdminRequests();
    fetchAllTransactions(); 
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('name');
    if (data) {
      setProducts(data);
      // สร้างหมวดหมู่จากข้อมูลสินค้า
      const uniqueCats = ["All", ...new Set(data.map(item => item.category).filter(Boolean))];
      setCategories(uniqueCats);
    }
    setLoading(false);
  };

  const fetchUserHistory = async (email) => {
    const { data } = await supabase.from('transaction_logs').select('*').eq('borrower_name', email).order('created_at', { ascending: false });
    if (data) setHistory(data);
  };

  const fetchAllTransactions = async () => {
    const { data } = await supabase.from('transaction_logs').select('*').order('created_at', { ascending: false });
    if (data) setAllHistory(data);
  };

  const fetchMyBorrowedItems = async (email) => {
    const { data } = await supabase.from('transaction_logs').select('*').eq('borrower_name', email);
    if (data) {
      const summary = data.reduce((acc, log) => {
        const qty = log.type === 'withdraw' ? log.amount : -log.amount;
        acc[log.product_name] = (acc[log.product_name] || 0) + qty;
        return acc;
      }, {});
      setMyItems(Object.entries(summary).filter(([_, qty]) => qty > 0).map(([name, qty]) => ({ name, qty })));
    }
  };

  const fetchMyPendingRequests = async (email) => {
    const { data } = await supabase.from('borrow_requests').select('*').eq('borrower_name', email).eq('status', 'pending');
    if (data) setMyPendingRequests(data);
  };

  const fetchAdminRequests = async () => {
    const { data } = await supabase.from('borrow_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (data) {
      const groups = data.reduce((acc, item) => {
        const id = item.group_id || 'no-group';
        if (!acc[id]) acc[id] = [];
        acc[id].push(item);
        return acc;
      }, {});
      setGroupedRequests(groups);
    }
  };

  const handleAdminUpdateStock = async (id, newStock) => {
    await supabase.from('products').update({ stock: parseInt(newStock) }).eq('id', id);
    fetchProducts();
  };

  const handleDecideGroup = async (groupId, decision) => {
    const requests = groupedRequests[groupId];
    try {
      for (const req of requests) {
        if (decision === 'approved') {
          const item = products.find(p => p.id == req.product_id);
          const newStock = req.type === 'withdraw' ? item.stock - req.amount : item.stock + req.amount;
          await supabase.from('products').update({ stock: newStock }).eq('id', req.product_id);
          await supabase.from('transaction_logs').insert([{
            product_id: req.product_id, product_name: req.product_name,
            amount: req.amount, borrower_name: req.borrower_name, type: req.type, group_id: groupId 
          }]);
        }
        await supabase.from('borrow_requests').update({ status: decision }).eq('id', req.id);
      }
      fetchData(user.email, isAdmin);
    } catch (e) { alert("Error saving transaction"); }
  };

  const updateCart = (itemId, amount) => {
    const item = products.find(p => p.id == itemId);
    const newQty = (cart[itemId] || 0) + amount;
    if (mode === "withdraw" && newQty > item.stock) return alert("Not enough stock");
    setCart(prev => {
      if (newQty <= 0) { const { [itemId]: _, ...rest } = prev; return rest; }
      return { ...prev, [itemId]: newQty };
    });
  };

  const handleConfirmAction = async () => {
    if (Object.keys(cart).length === 0) return;
    const groupId = `GRP-${Date.now()}`;
    const inserts = Object.entries(cart).map(([id, qty]) => ({
      product_id: id, product_name: products.find(p => p.id == id).name,
      amount: qty, borrower_name: borrower, type: mode, status: 'pending', group_id: groupId
    }));
    await supabase.from('borrow_requests').insert(inserts);
    setCart({});
    fetchMyPendingRequests(user.email);
    alert("ส่งคำขอเรียบร้อยแล้ว!");
  };

  // กรองสินค้าตามหมวดหมู่และคำค้นหา
  const filteredProducts = products.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    (activeCategory === "All" || item.category === activeCategory)
  );

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row font-sans text-slate-900">
      <div className="flex-1 p-4 lg:p-10">
        <div className="max-w-3xl mx-auto">
          
          {/* Header & Logo Section */}
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl relative overflow-hidden">
                <img 
                  src="/logo.png" 
                  alt="M" 
                  className="w-full h-full object-contain z-10" 
                  onError={(e) => { e.target.style.display = 'none'; }} 
                />
                <span className="absolute">M</span>
              </div>
              <div>
                <h1 className="text-xl font-black uppercase leading-none mb-1">MakerStock</h1>
                <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest leading-tight">
                  {isAdmin ? 'ADMIN PANEL' : 'USER DASHBOARD'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* แสดงชื่อผู้ใช้ */}
              <div className="hidden sm:block text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Logged in as</p>
                <p className="text-xs font-bold text-slate-800">{user?.email}</p>
              </div>
              <div className="flex gap-2">
                {isAdmin && <button onClick={() => setShowAdminHistory(true)} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-[10px] font-black">ALL HISTORY</button>}
                {!isAdmin && <button onClick={() => setShowHistory(true)} className="bg-blue-50 text-blue-600 px-4 py-2.5 rounded-xl text-[10px] font-black">MY HISTORY</button>}
                <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="bg-slate-100 text-slate-900 px-4 py-2.5 rounded-xl text-[10px] font-black">LOGOUT</button>
              </div>
            </div>
          </div>

          {/* Search Box */}
          <input 
            type="text" 
            placeholder="Search devices..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full p-5 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none font-bold mb-6 focus:ring-4 focus:ring-blue-50 transition-all" 
          />
          
          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase whitespace-nowrap transition-all ${
                  activeCategory === cat 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                  : 'bg-white text-slate-400 border border-slate-100 hover:border-blue-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'withdraw' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'return' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          <div className="grid grid-cols-1 gap-4 pb-20">
            {loading ? (
              <div className="text-center py-20 font-black text-blue-600 uppercase tracking-widest animate-pulse">Loading Inventory...</div>
            ) : filteredProducts.length > 0 ? (
              filteredProducts.map((item) => (
                <div key={item.id} className="group relative">
                  <ItemCard item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
                  {isAdmin && (
                    <button onClick={() => { const n = prompt(`Set Stock: ${item.name}`, item.stock); if (n !== null) handleAdminUpdateStock(item.id, n); }} className="absolute top-4 right-4 z-20 bg-white/90 text-[9px] font-black px-3 py-1.5 rounded-xl border border-slate-200 opacity-0 group-hover:opacity-100 transition-all shadow-sm">SET STOCK</button>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-200 font-bold text-slate-400 italic">No items found in this category</div>
            )}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white border-l p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black text-slate-800 mb-8 uppercase italic flex items-center gap-3">🛒 Cart <span className="text-blue-600">/</span> {mode === 'withdraw' ? 'เบิกของ' : 'คืนของ'}</h2>
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {Object.entries(cart).map(([id, qty]) => (
            <div key={id} className="flex justify-between items-center bg-slate-50 p-5 rounded-[1.8rem] border border-slate-100 transition-all">
              <div className="min-w-0 pr-4">
                <p className="font-black text-slate-800 truncate text-sm uppercase italic">{products.find(p => p.id == id)?.name}</p>
                <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">{products.find(p => p.id == id)?.category}</p>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 font-black text-blue-600 shadow-sm">x{qty}</div>
            </div>
          ))}
          {Object.keys(cart).length === 0 && <p className="text-center text-slate-300 font-bold py-10 italic text-sm uppercase">Cart is Empty</p>}
        </div>
        <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0} className={`w-full py-5 rounded-[2rem] font-black text-white text-lg mt-8 shadow-2xl active:scale-95 transition-all ${Object.keys(cart).length === 0 ? 'bg-slate-100 text-slate-200 cursor-not-allowed' : mode === 'withdraw' ? 'bg-slate-900 hover:bg-black' : 'bg-blue-600 hover:bg-blue-700'}`}>CONFIRM ORDER</button>
      </div>

      {/* Modals เหมือนเดิม ... */}
    </main>
  );
}