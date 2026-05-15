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

    const interval = setInterval(() => { 
      if (user) {
        const adminStatus = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
        fetchData(user.email, adminStatus);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [user]);

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
      setCategories(["All", ...new Set(data.map(item => item.category).filter(Boolean))]);
    }
    setLoading(false);
  };

  const fetchMyBorrowedItems = async (email) => {
    if (!email) return;
    const { data } = await supabase.from('transaction_logs').select('*').eq('borrower_name', email);
    if (data) {
      const summary = data.reduce((acc, log) => {
        const qty = log.type === 'withdraw' ? log.amount : -log.amount;
        const id = log.product_id;
        if (!acc[id]) acc[id] = { name: log.product_name, qty: 0 };
        acc[id].qty += qty;
        return acc;
      }, {});
      // กรองเอาเฉพาะชิ้นที่ยอดคงเหลือมากกว่า 0
      const itemsHeld = Object.values(summary).filter(item => item.qty > 0);
      setMyItems(itemsHeld);
    }
  };

  const fetchUserHistory = async (email) => {
    if (!email) return;
    const { data } = await supabase.from('transaction_logs').select('*').eq('borrower_name', email).order('created_at', { ascending: false });
    if (data) setHistory(data);
  };

  const fetchAllTransactions = async () => {
    const { data } = await supabase.from('transaction_logs').select('*').order('created_at', { ascending: false });
    if (data) setAllHistory(data);
  };

  const fetchMyPendingRequests = async (email) => {
    const { data } = await supabase.from('borrow_requests').select('*').eq('borrower_name', email).eq('status', 'pending').order('created_at', { ascending: false });
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

  const handlePrintGroup = (selectedLog) => {
    const groupItems = allHistory.filter(item => 
      item.group_id === selectedLog.group_id && item.type === selectedLog.type &&
      Math.abs(new Date(item.created_at) - new Date(selectedLog.created_at)) < 60000 
    );
    const printWindow = window.open('', '_blank');
    const dateStr = new Date(selectedLog.created_at).toLocaleDateString('th-TH');
    const timeStr = new Date(selectedLog.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const typeLabel = selectedLog.type === 'withdraw' ? 'เบิกของ' : 'คืนของ';
    printWindow.document.write(`<html><head><title>Receipt - ${timeStr}</title><style>body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #333; }.header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }.title { font-size: 22px; font-weight: bold; }table { width: 100%; border-collapse: collapse; margin-top: 20px; }th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }th { background-color: #f9f9f9; font-weight: bold; }.info { margin-bottom: 20px; line-height: 1.8; }.footer { margin-top: 60px; display: flex; justify-content: space-between; }.sig { border-top: 1px solid #000; width: 220px; text-align: center; margin-top: 50px; padding-top: 8px; font-size: 13px; }</style></head><body><div class="header"><div class="title">ใบเสร็จบันทึกรายการ${typeLabel} (รายรอบ)</div><div style=\"font-size: 11px; color: #666;\">รหัสรอบ: ${selectedLog.group_id}</div></div><div class=\"info\"><div><strong>ผู้ทำรายการ:</strong> ${selectedLog.borrower_name}</div><div><strong>วันที่/เวลา:</strong> ${dateStr} | ${timeStr} น.</div></div><table><thead><tr><th>รายการอุปกรณ์</th><th style=\"width: 100px; text-align: center;\">จำนวน</th></tr></thead><tbody>${groupItems.map(item => `<tr><td>${item.product_name}</td><td style=\"text-align: center;\">${item.amount}</td></tr>`).join('')}</tbody></table><div class=\"footer\"><div class=\"sig\">ลงชื่อผู้ทำรายการ</div><div class=\"sig\">ลงชื่อเจ้าหน้าที่ (Admin)</div></div><script>window.onload = function() { window.print(); setTimeout(() => { window.close(); }, 500); };</script></body></html>`);
    printWindow.document.close();
  };

  const handleAdminUpdateStock = async (id, newStock) => {
    const stockNum = parseInt(newStock);
    if (isNaN(stockNum) || stockNum < 0) return alert("Please enter valid stock");
    await supabase.from('products').update({ stock: stockNum }).eq('id', id);
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
            product_id: req.product_id, product_name: req.product_name, amount: req.amount, borrower_name: req.borrower_name, type: req.type, group_id: groupId 
          }]);
        }
        await supabase.from('borrow_requests').update({ status: decision }).eq('id', req.id);
      }
      fetchData(user.email, isAdmin);
      alert("ดำเนินการสำเร็จ");
    } catch (e) { alert("เกิดข้อผิดพลาด"); }
  };

  const updateCart = (itemId, amount) => {
    const item = products.find(p => p.id == itemId);
    const newQty = (cart[itemId] || 0) + amount;
    if (mode === "withdraw" && newQty > item.stock) return alert("สต็อกไม่พอ");
    if (mode === "return") {
      const currentlyHolding = myItems.find(i => i.name === item.name)?.qty || 0;
      if (newQty > currentlyHolding) return alert("คืนเกินจำนวนที่มีอยู่");
    }
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
    alert("ส่งคำขอเรียบร้อย!");
    fetchMyPendingRequests(user.email);
  };

  const filteredProducts = products.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()) && (activeCategory === "All" || item.category === activeCategory));

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row font-sans text-slate-900">
      <div className="flex-1 p-4 lg:p-10">
        <div className="max-w-3xl mx-auto">
          {/* Header Section */}
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-transparent rounded-2xl flex items-center justify-center border border-slate-50">
                <img src="/logo.png" alt="M" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-black uppercase leading-none mb-1 text-slate-800">MakerStock</h1>
                <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest leading-tight">{isAdmin ? 'ADMIN PANEL' : 'USER DASHBOARD'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:block text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Logged in as</p>
                <p className="text-xs font-black text-slate-800">{user.email}</p>
              </div>
              <div className="flex gap-2">
                {isAdmin && <button onClick={() => setShowAdminHistory(true)} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-[10px] font-black">ALL HISTORY</button>}
                <button onClick={() => setShowHistory(true)} className="bg-blue-50 text-blue-600 px-4 py-2.5 rounded-xl text-[10px] font-black">MY HISTORY</button>
                <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="bg-slate-100 text-slate-900 px-4 py-2.5 rounded-xl text-[10px] font-black">LOGOUT</button>
              </div>
            </div>
          </div>

          {/* 1. ส่วนแสดงรายการของที่ถืออยู่ (My Items) - แก้ไขตำแหน่งและเงื่อนไขใหม่ */}
          {myItems.length > 0 && (
            <div className="mb-6 bg-slate-900 p-6 rounded-[2.5rem] shadow-2xl border border-slate-800">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <h2 className="text-[10px] font-black text-white uppercase tracking-[0.25em]">📦 รายการอุปกรณ์ที่คุณถืออยู่</h2>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {myItems.map((item, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/10 px-5 py-4 rounded-[1.8rem] flex-shrink-0 min-w-[140px]">
                    <p className="text-xs font-black text-white uppercase italic truncate mb-1">{item.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      จำนวน: <span className="text-blue-400 font-black">{item.qty}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. คำขอที่รอการอนุมัติ (User Pending) */}
          {!isAdmin && myPendingRequests.length > 0 && (
            <div className="mb-8 p-6 bg-amber-50 rounded-[2rem] border border-amber-100">
              <h2 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                ⏳ สถานะคำขอ (รออนุมัติ)
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {myPendingRequests.map((req) => (
                  <div key={req.id} className="bg-white px-5 py-4 rounded-[1.8rem] shadow-sm border border-amber-200 flex-shrink-0 min-w-[160px]">
                    <p className="text-[10px] font-black text-slate-800 uppercase truncate mb-1">{req.product_name}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">x{req.amount}</span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase ${req.type === 'withdraw' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>{req.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Admin Control Panel */}
          {isAdmin && Object.keys(groupedRequests).length > 0 && (
            <div className="mb-10">
              <h2 className="text-sm font-black mb-4 uppercase text-blue-600 italic">🔔 Pending Requests</h2>
              {Object.entries(groupedRequests).map(([groupId, items]) => (
                <div key={groupId} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 mb-4 flex justify-between items-center transition-all hover:shadow-md">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-black text-slate-800 text-sm italic uppercase">Order #{groupId.slice(-5)}</h3>
                      <span className="text-[8px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-bold">{items[0].type.toUpperCase()}</span>
                    </div>
                    <p className="text-[10px] text-blue-500 font-bold mb-2">{items[0].borrower_name}</p>
                    <div className="space-y-1">{items.map(i => <p key={i.id} className="text-xs font-bold text-slate-600">• {i.product_name} x{i.amount}</p>)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleDecideGroup(groupId, 'approved')} className="bg-blue-600 text-white px-5 py-3 rounded-2xl text-[10px] font-black shadow-lg shadow-blue-100 active:scale-95 transition-all">APPROVE</button>
                    <button onClick={() => handleDecideGroup(groupId, 'rejected')} className="bg-slate-100 text-slate-400 px-5 py-3 rounded-2xl text-[10px] font-black active:scale-95 transition-all">REJECT</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Search & Main Interface */}
          <div className="relative group">
            <input type="text" placeholder="Search inventory..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-6 bg-white border border-slate-200 rounded-[2.2rem] shadow-sm outline-none font-bold mb-6 focus:ring-4 focus:ring-blue-50 transition-all pl-14" />
            <span className="absolute left-6 top-6 text-slate-300 group-focus-within:text-blue-500 transition-colors">🔍</span>
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-7 py-3 rounded-[1.5rem] text-[10px] font-black uppercase whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'bg-white text-slate-400 border border-slate-100'}`}>{cat}</button>
            ))}
          </div>

          <div className="flex bg-white p-2 rounded-[2rem] border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-5 rounded-[1.6rem] font-black text-sm transition-all ${mode === 'withdraw' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-5 rounded-[1.6rem] font-black text-sm transition-all ${mode === 'return' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          <div className="grid grid-cols-1 gap-4 pb-24">
            {loading ? <div className="text-center py-20 font-black text-blue-600 uppercase tracking-[0.3em] animate-pulse">Synchronizing...</div> : filteredProducts.map((item) => (
              <div key={item.id} className="group relative">
                <ItemCard item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
                {isAdmin && <button onClick={() => { const n = prompt(`Set Stock: ${item.name}`, item.stock); if (n !== null) handleAdminUpdateStock(item.id, n); }} className="absolute top-4 right-4 z-20 bg-white/90 text-[9px] font-black px-4 py-2 rounded-xl border border-slate-200 opacity-0 group-hover:opacity-100 shadow-sm transition-all hover:bg-white">SET STOCK</button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white border-l p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <div className="flex items-center gap-3 mb-8">
           <h2 className="text-2xl font-black text-slate-800 uppercase italic">🛒 Cart</h2>
           <span className="h-[2px] w-8 bg-blue-500"></span>
           <span className="text-[10px] font-black text-blue-500 uppercase">{mode === 'withdraw' ? 'เบิก' : 'คืน'}</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {Object.entries(cart).map(([id, qty]) => (
            <div key={id} className="flex justify-between items-center bg-slate-50 p-6 rounded-[2.2rem] border border-slate-100 group">
              <div className="min-w-0 pr-4">
                <p className="font-black text-slate-800 truncate text-sm uppercase italic">{products.find(p => p.id == id)?.name}</p>
                <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mt-1">{products.find(p => p.id == id)?.category}</p>
              </div>
              <div className="bg-white px-5 py-2.5 rounded-2xl border border-slate-200 font-black text-blue-600 shadow-sm">x{qty}</div>
            </div>
          ))}
          {Object.keys(cart).length === 0 && (
            <div className="text-center py-16 opacity-20">
              <p className="text-4xl mb-4">🛒</p>
              <p className="font-black text-xs uppercase tracking-widest italic">Your cart is empty</p>
            </div>
          )}
        </div>
        <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0} className={`w-full py-6 rounded-[2.2rem] font-black text-white text-lg mt-8 shadow-2xl active:scale-95 transition-all ${Object.keys(cart).length === 0 ? 'bg-slate-100 text-slate-300' : mode === 'withdraw' ? 'bg-slate-900 shadow-slate-200' : 'bg-blue-600 shadow-blue-200'}`}>CONFIRM REQUEST</button>
      </div>

      {/* Modals */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight italic text-slate-800">My History</h2>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">บันทึกรายการย้อนหลังของคุณ</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="w-12 h-12 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center font-black hover:bg-slate-50">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              {history.map((log) => (
                <div key={log.id} className="flex justify-between items-center p-5 rounded-[2rem] border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="font-black text-slate-800 uppercase italic text-sm mb-1">{log.product_name}</p>
                    <p className="text-[10px] font-bold text-slate-400">{new Date(log.created_at).toLocaleString('th-TH')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-blue-600 text-lg">x{log.amount}</p>
                    <span className={`text-[8px] font-black px-2 py-1 rounded-md uppercase ${log.type === 'withdraw' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>{log.type === 'withdraw' ? 'เบิก' : 'คืน'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAdminHistory && isAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-10 border-b flex justify-between items-center bg-slate-900 text-white">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight italic">Global Transaction Log</h2>
                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1">บันทึกรายการทั้งหมดในระบบ</p>
              </div>
              <button onClick={() => setShowAdminHistory(false)} className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center font-black text-white hover:bg-white/20 transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-2">
              {allHistory.map((log) => (
                <div key={log.id} className="grid grid-cols-12 gap-4 px-6 py-5 rounded-[1.5rem] border border-slate-50 hover:bg-slate-50 items-center text-xs transition-colors">
                  <div className="col-span-3 font-bold text-slate-400 truncate tracking-tighter">{log.borrower_name}</div>
                  <div className="col-span-4 font-black text-slate-800 uppercase truncate italic">{log.product_name}</div>
                  <div className="col-span-1 text-center font-black text-blue-600">x{log.amount}</div>
                  <div className="col-span-2 text-center uppercase text-[9px] font-black italic tracking-widest">{log.type}</div>
                  <div className="col-span-2 text-right">
                    <button onClick={() => handlePrintGroup(log)} className="bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 shadow-sm text-[9px] font-black active:scale-95 transition-all">🖨️ พิมพ์</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}