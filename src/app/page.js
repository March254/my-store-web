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

  // แก้ไข Email Admin ของคุณที่นี่
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
    }, 10000); // Auto refresh ทุก 10 วินาที

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
    fetchData(user.email, isAdmin);
  };

  const filteredProducts = products.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()) && (activeCategory === "All" || item.category === activeCategory));

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row font-sans text-slate-900">
      <div className="flex-1 p-4 lg:p-10">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl">M</div>
              <div>
                <h1 className="text-xl font-black uppercase leading-none mb-1">MakerStock</h1>
                <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">{isAdmin ? 'ADMIN' : 'USER'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowHistory(true)} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-[10px] font-black">HISTORY</button>
              <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="bg-slate-100 text-slate-400 px-4 py-2 rounded-xl text-[10px] font-black">LOGOUT</button>
            </div>
          </div>

          {/* 📦 รายการอุปกรณ์ที่ถืออยู่ (My Items) */}
          {myItems.length > 0 && (
            <div className="mb-6 bg-slate-900 p-6 rounded-[2.5rem] shadow-xl border border-slate-800">
              <h2 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                รายการอุปกรณ์ที่คุณถืออยู่
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {myItems.map((item, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/10 px-5 py-4 rounded-[1.8rem] flex-shrink-0 min-w-[140px]">
                    <p className="text-xs font-black text-white uppercase italic truncate mb-1">{item.name}</p>
                    <p className="text-[10px] font-bold text-slate-400">ถืออยู่: <span className="text-blue-400 font-black">{item.qty}</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ⏳ สถานะคำขอรออนุมัติ */}
          {!isAdmin && myPendingRequests.length > 0 && (
            <div className="mb-8 p-6 bg-amber-50 rounded-[2rem] border border-amber-100">
              <h2 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-4">⏳ รอการอนุมัติ</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {myPendingRequests.map((req) => (
                  <div key={req.id} className="bg-white px-5 py-4 rounded-[1.8rem] shadow-sm border border-amber-200 flex-shrink-0 min-w-[160px]">
                    <p className="text-[10px] font-black text-slate-800 uppercase truncate mb-1">{req.product_name}</p>
                    <div className="flex justify-between items-center text-[9px] font-black">
                       <span className="text-slate-400">x{req.amount}</span>
                       <span className={req.type === 'withdraw' ? 'text-amber-600' : 'text-blue-600'}>{req.type.toUpperCase()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin Pending Panel */}
          {isAdmin && Object.keys(groupedRequests).length > 0 && (
            <div className="mb-10">
              <h2 className="text-sm font-black mb-4 text-blue-600 uppercase italic">🔔 New Requests</h2>
              {Object.entries(groupedRequests).map(([groupId, items]) => (
                <div key={groupId} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 mb-4 flex justify-between items-center transition-all hover:shadow-md">
                  <div>
                    <h3 className="font-black text-slate-800 text-sm italic uppercase">Order #{groupId.slice(-5)}</h3>
                    <p className="text-[10px] text-blue-500 font-bold mb-2">{items[0].borrower_name}</p>
                    <div className="space-y-1">{items.map(i => <p key={i.id} className="text-xs font-bold text-slate-600">• {i.product_name} x{i.amount}</p>)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleDecideGroup(groupId, 'approved')} className="bg-blue-600 text-white px-5 py-3 rounded-2xl text-[10px] font-black active:scale-95 transition-all">APPROVE</button>
                    <button onClick={() => handleDecideGroup(groupId, 'rejected')} className="bg-slate-100 text-slate-400 px-5 py-3 rounded-2xl text-[10px] font-black active:scale-95 transition-all">REJECT</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Main Controls */}
          <input type="text" placeholder="Search inventory..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-6 bg-white border border-slate-200 rounded-[2.2rem] shadow-sm outline-none font-bold mb-6 focus:ring-4 focus:ring-blue-50 transition-all pl-14" />
          
          <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-7 py-3 rounded-[1.5rem] text-[10px] font-black uppercase whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>{cat}</button>
            ))}
          </div>

          <div className="flex bg-white p-2 rounded-[2rem] border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-5 rounded-[1.6rem] font-black text-sm transition-all ${mode === 'withdraw' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-5 rounded-[1.6rem] font-black text-sm transition-all ${mode === 'return' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          {/* Inventory Grid */}
          <div className="grid grid-cols-1 gap-4 pb-24">
            {loading ? <div className="text-center py-20 font-black text-blue-600 uppercase animate-pulse tracking-widest">Loading...</div> : filteredProducts.map((item) => (
              <ItemCard key={item.id} item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
            ))}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white border-l p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black text-slate-800 uppercase italic mb-8">🛒 Cart</h2>
        <div className="flex-1 overflow-y-auto space-y-4">
          {Object.entries(cart).map(([id, qty]) => (
            <div key={id} className="flex justify-between items-center bg-slate-50 p-6 rounded-[2.2rem] border border-slate-100">
              <div className="min-w-0 pr-4">
                <p className="font-black text-slate-800 truncate text-sm uppercase italic">{products.find(p => p.id == id)?.name}</p>
                <p className="text-[9px] text-blue-500 font-black uppercase mt-1">{products.find(p => p.id == id)?.category}</p>
              </div>
              <div className="bg-white px-5 py-2.5 rounded-2xl border border-slate-200 font-black text-blue-600 shadow-sm">x{qty}</div>
            </div>
          ))}
          {Object.keys(cart).length === 0 && <p className="text-center py-20 opacity-30 font-black text-xs uppercase tracking-widest">Empty</p>}
        </div>
        <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0} className={`w-full py-6 rounded-[2.2rem] font-black text-white text-lg mt-8 shadow-2xl active:scale-95 transition-all ${Object.keys(cart).length === 0 ? 'bg-slate-100 text-slate-300' : mode === 'withdraw' ? 'bg-slate-900 shadow-slate-200' : 'bg-blue-600 shadow-blue-200'}`}>CONFIRM REQUEST</button>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-10 border-b flex justify-between items-center">
              <h2 className="text-xl font-black uppercase italic">My History</h2>
              <button onClick={() => setShowHistory(false)} className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-black">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              {history.map((log) => (
                <div key={log.id} className="flex justify-between items-center p-5 rounded-[2rem] border border-slate-100">
                  <div>
                    <p className="font-black text-slate-800 uppercase italic text-sm">{log.product_name}</p>
                    <p className="text-[10px] font-bold text-slate-400">{new Date(log.created_at).toLocaleString('th-TH')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-blue-600 text-lg">x{log.amount}</p>
                    <span className={`text-[8px] font-black px-2 py-1 rounded-md uppercase ${log.type === 'withdraw' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>{log.type}</span>
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