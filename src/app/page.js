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

  const fetchData = async (email, adminStatus) => {
    fetchProducts();
    fetchMyBorrowedItems(email);
    fetchMyPendingRequests(email);
    if (adminStatus) fetchAdminRequests();
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
    const stockNum = parseInt(newStock);
    if (isNaN(stockNum) || stockNum < 0) return alert("กรุณาระบุจำนวนที่ถูกต้อง");
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
            product_id: req.product_id, product_name: req.product_name,
            amount: req.amount, borrower_name: req.borrower_name, type: req.type
          }]);
        }
        await supabase.from('borrow_requests').update({ status: decision }).eq('id', req.id);
      }
      fetchData(user.email, isAdmin);
    } catch (e) { alert("Error"); }
  };

  const updateCart = (itemId, amount) => {
    const item = products.find(p => p.id == itemId);
    const newQty = (cart[itemId] || 0) + amount;
    if (mode === "withdraw" && newQty > item.stock) return alert("สต็อกไม่พอ");
    if (mode === "return") {
      const currentlyHolding = myItems.find(i => i.name === item.name)?.qty || 0;
      if (newQty > currentlyHolding) return alert("คืนเกินจำนวนที่มี");
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
    fetchMyPendingRequests(user.email);
    alert("ส่งคำขอแล้ว!");
  };

  const filteredProducts = products.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    (activeCategory === "All" || item.category === activeCategory)
  );

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row font-sans text-slate-900">
      <div className="flex-1 p-4 lg:p-10">
        <div className="max-w-3xl mx-auto">
          
          {/* Header - แก้ไขจุดนี้: เอา bg-blue-600 และกรอบน้ำเงินออกทั้งหมด */}
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 flex items-center justify-center overflow-hidden">
                <img 
                  src="/logo.png" 
                  alt="Logo" 
                  className="w-full h-full object-contain" 
                  onError={(e) => { 
                    e.target.style.display = 'none';
                    const fallback = document.createElement('div');
                    fallback.className = "w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl";
                    fallback.innerText = "M";
                    e.target.parentElement.appendChild(fallback);
                  }}
                />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tighter uppercase leading-none mb-1">Maker<span className="text-blue-600">Stock</span></h1>
                <div className="flex flex-col">
                  <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest leading-tight">{isAdmin ? 'ADMIN PANEL' : 'USER DASHBOARD'}</p>
                  <p className="text-[9px] font-bold text-slate-400 truncate max-w-[150px]">{user?.email}</p>
                </div>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="bg-slate-100 hover:bg-slate-200 text-slate-900 px-5 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95">LOGOUT</button>
          </div>

          {/* Admin Requests */}
          {isAdmin && Object.keys(groupedRequests).length > 0 && (
            <div className="mb-10">
              <h2 className="text-sm font-black mb-4 uppercase text-blue-600 flex items-center gap-2">🔔 คำขอรอนุมัติ ({Object.keys(groupedRequests).length})</h2>
              <div className="max-h-[500px] overflow-y-auto pr-2 space-y-6">
                {Object.entries(groupedRequests).map(([groupId, items]) => (
                  <div key={groupId} className="bg-white border-l-8 border-l-blue-600 p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                      <div>
                        <h3 className="font-black text-slate-800 text-lg uppercase tracking-tighter">ใบเบิก/คืน #{groupId.slice(-5)}</h3>
                        <p className="text-xs font-bold text-slate-400">โดย: {items[0].borrower_name}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleDecideGroup(groupId, 'approved')} className="bg-blue-600 text-white px-8 py-3 rounded-xl text-xs font-black active:scale-95 transition-all">อนุมัติ</button>
                        <button onClick={() => handleDecideGroup(groupId, 'rejected')} className="bg-white text-red-500 border border-red-50 px-8 py-3 rounded-xl text-xs font-black active:scale-95 transition-all">ปฏิเสธ</button>
                      </div>
                    </div>
                    <div className="space-y-2 border-t pt-4">
                      {items.map(item => (
                        <div key={item.id} className="flex justify-between text-sm font-bold text-slate-600 bg-slate-50 p-3 rounded-xl">
                          <span>{item.product_name}</span>
                          <span className="text-blue-600 font-black">x{item.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Sections */}
          {!isAdmin && (
            <>
              {myPendingRequests.length > 0 && (
                <div className="mb-10 bg-blue-50 p-6 rounded-[2rem] border border-blue-100 shadow-inner text-center">
                  <h2 className="text-[10px] font-black mb-3 uppercase text-blue-600 tracking-widest">⏳ รายการที่รออนุมัติ</h2>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {myPendingRequests.map((req, idx) => (
                      <div key={idx} className="bg-white px-4 py-2 rounded-xl shadow-sm border border-blue-200 text-[10px] font-bold">
                        <span className={req.type === 'withdraw' ? 'text-amber-600' : 'text-blue-600'}>{req.type === 'withdraw' ? 'เบิก' : 'คืน'}</span> : {req.product_name} x{req.amount}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {myItems.length > 0 && (
                <div className="mb-10 bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white text-center">
                  <h2 className="text-[10px] font-black mb-4 uppercase text-slate-400 tracking-widest">📦 ของที่คุณถือครองอยู่</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {myItems.map((item, idx) => (
                      <div key={idx} className="bg-white/10 p-4 rounded-2xl border border-white/10">
                        <p className="font-black text-xs truncate">{item.name}</p>
                        <p className="text-blue-400 font-black text-xl">x{item.qty}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <input type="text" placeholder="ค้นหาอุปกรณ์..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-5 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none font-bold mb-6 focus:ring-4 focus:ring-blue-50" />
          
          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'withdraw' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'return' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          <div className="flex gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${activeCategory === cat ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'}`}>{cat}</button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 pb-20">
            {loading ? <div className="text-center py-20 font-black text-blue-600">LOADING...</div> : filteredProducts.map((item) => (
              <div key={item.id} className="group relative">
                <ItemCard item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
                {isAdmin && (
                  <button onClick={() => { const n = prompt(`แก้ไขสต็อก: ${item.name}`, item.stock); if (n !== null) handleAdminUpdateStock(item.id, n); }} className="absolute top-4 right-4 z-20 bg-white/90 text-[9px] font-black px-3 py-1.5 rounded-xl border border-slate-200 opacity-0 group-hover:opacity-100 transition-all shadow-sm">SET STOCK</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-96 bg-white border-l p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black text-slate-800 mb-8 uppercase italic flex items-center gap-3">🛒 Cart <span className="text-blue-600">/</span> {mode}</h2>
        <div className="flex-1 overflow-y-auto space-y-4">
          {Object.entries(cart).map(([id, qty]) => (
            <div key={id} className="flex justify-between items-center bg-slate-50 p-5 rounded-[1.8rem] border border-slate-100">
              <div className="min-w-0 pr-4">
                <p className="font-black text-slate-800 truncate text-sm">{products.find(p => p.id == id)?.name}</p>
                <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">{products.find(p => p.id == id)?.category}</p>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 font-black text-blue-600">{qty}</div>
            </div>
          ))}
          {Object.keys(cart).length === 0 && <p className="text-center text-slate-300 font-bold py-10 italic text-sm">ไม่มีรายการในตะกร้า</p>}
        </div>
        <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0} className={`w-full py-5 rounded-[2rem] font-black text-white text-lg mt-8 shadow-2xl active:scale-95 transition-all ${Object.keys(cart).length === 0 ? 'bg-slate-100 text-slate-200' : mode === 'withdraw' ? 'bg-slate-900' : 'bg-blue-600'}`}>CONFIRM</button>
      </div>
    </main>
  );
}