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

  // --- แก้ไขจุดที่ 1: กันหลุดตอน Refresh และรักษาการเชื่อมต่อ ---
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        setBorrower(session.user.email);
        const adminStatus = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(session.user.email.toLowerCase());
        setIsAdmin(adminStatus);
        
        fetchData(session.user.email, adminStatus);

        // ดักฟังการเปลี่ยนแปลงแบบ Real-time
        const channel = supabase.channel('schema-db-changes')
          .on('postgres_changes', { event: '*', schema: 'public' }, () => {
            fetchData(session.user.email, adminStatus);
          })
          .subscribe();

        return () => { supabase.removeChannel(channel); };
      } else {
        router.push('/login');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async (email, adminStatus) => {
    fetchProducts();
    fetchMyBorrowedItems(email);
    fetchMyPendingRequests(email);
    fetchUserHistory(email); // ดึงประวัติ User
    if (adminStatus) fetchAdminData();
  };

  const fetchAdminData = () => {
    fetchAdminRequests();
    fetchAllTransactions(); // ดึงประวัติรวมของ Admin
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('name');
    if (data) {
      setProducts(data);
      setCategories(["All", ...new Set(data.map(item => item.category).filter(Boolean))]);
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
    const stockNum = parseInt(newStock);
    if (isNaN(stockNum) || stockNum < 0) return alert("Please enter a valid stock number");
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
            product_id: req.product_id, 
            product_name: req.product_name,
            amount: req.amount, 
            borrower_name: req.borrower_name, 
            type: req.type,
            group_id: groupId 
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
    if (mode === "return") {
      const currentlyHolding = myItems.find(i => i.name === item.name)?.qty || 0;
      if (newQty > currentlyHolding) return alert("Cannot return more than you have");
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
    alert("ส่งคำขอเรียบร้อยแล้ว!");
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
          
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              {/* โลโก้ */}
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl overflow-hidden relative">
                <img src="/logo.png" alt="M" className="w-full h-full object-contain z-10" onError={(e) => { e.target.style.display = 'none'; }} />
                <span className="absolute">M</span>
              </div>
              <div>
                <h1 className="text-xl font-black uppercase leading-none mb-1">MakerStock</h1>
                <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest leading-tight">{isAdmin ? 'ADMIN PANEL' : 'USER DASHBOARD'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Logged in as</p>
                <p className="text-xs font-bold text-slate-800">{user?.email}</p>
              </div>
              <div className="flex gap-2">
                {isAdmin && <button onClick={() => setShowAdminHistory(true)} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-[10px] font-black">ALL HISTORY</button>}
                <button onClick={() => setShowHistory(true)} className="bg-blue-50 text-blue-600 px-4 py-2.5 rounded-xl text-[10px] font-black">MY HISTORY</button>
                <button onClick={() => supabase.auth.signOut()} className="bg-slate-100 text-slate-900 px-4 py-2.5 rounded-xl text-[10px] font-black">LOGOUT</button>
              </div>
            </div>
          </div>

          {/* จุดที่แก้ไข: แสดงสถานะ Pending และ ของที่ถืออยู่ ทันที */}
          {!isAdmin && (
            <div className="space-y-4 mb-8">
               {myPendingRequests.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl">
                  <h2 className="text-[10px] font-black uppercase text-amber-600 mb-2 italic">🕒 กำลังรออนุมัติ</h2>
                  <div className="flex flex-wrap gap-2">
                    {myPendingRequests.map(req => (
                      <div key={req.id} className="bg-white px-3 py-1.5 rounded-lg border border-amber-200 text-[10px] font-bold">{req.product_name} x{req.amount}</div>
                    ))}
                  </div>
                </div>
              )}
              {myItems.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                  <h2 className="text-[10px] font-black uppercase text-blue-600 mb-2 italic">📦 อุปกรณ์ที่ต้องคืน</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {myItems.map(item => (
                      <div key={item.name} className="bg-white p-2 rounded-lg border border-blue-200 flex justify-between text-[10px] font-bold uppercase">
                        <span>{item.name}</span> <span className="text-blue-600">x{item.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Admin Pending Requests */}
          {isAdmin && Object.keys(groupedRequests).length > 0 && (
            <div className="mb-10">
              <h2 className="text-sm font-black mb-4 uppercase text-blue-600">🔔 Pending Requests</h2>
              {Object.entries(groupedRequests).map(([groupId, items]) => (
                <div key={groupId} className="bg-white border-l-8 border-l-blue-600 p-6 rounded-[2rem] shadow-sm border border-slate-100 mb-4">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{items[0].borrower_name}</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleDecideGroup(groupId, 'approved')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-[10px] font-black">APPROVE</button>
                      <button onClick={() => handleDecideGroup(groupId, 'rejected')} className="bg-white text-red-500 border border-red-50 px-4 py-2 rounded-lg text-[10px] font-black">REJECT</button>
                    </div>
                  </div>
                  {items.map(item => <div key={item.id} className="text-xs font-bold text-slate-600">• {item.product_name} x{item.amount}</div>)}
                </div>
              ))}
            </div>
          )}

          <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-5 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none font-bold mb-6" />
          
          <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase whitespace-nowrap ${activeCategory === cat ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>{cat}</button>
            ))}
          </div>

          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm ${mode === 'withdraw' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm ${mode === 'return' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          <div className="grid grid-cols-1 gap-4 pb-20">
            {loading ? <div className="text-center py-20 font-black text-blue-600 uppercase">Loading...</div> : filteredProducts.map((item) => (
              <div key={item.id} className="group relative">
                <ItemCard item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
                {isAdmin && <button onClick={() => { const n = prompt(`Set Stock: ${item.name}`, item.stock); if (n !== null) handleAdminUpdateStock(item.id, n); }} className="absolute top-4 right-4 z-20 bg-white/90 text-[9px] font-black px-3 py-1.5 rounded-xl border border-slate-200 opacity-0 group-hover:opacity-100">SET STOCK</button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white border-l p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black text-slate-800 mb-8 uppercase italic flex items-center gap-3">🛒 Cart <span className="text-blue-600">/</span> {mode === 'withdraw' ? 'เบิก' : 'คืน'}</h2>
        <div className="flex-1 overflow-y-auto space-y-4">
          {Object.entries(cart).map(([id, qty]) => (
            <div key={id} className="flex justify-between items-center bg-slate-50 p-5 rounded-[1.8rem] border border-slate-100">
              <div className="min-w-0 pr-4">
                <p className="font-black text-slate-800 truncate text-sm uppercase italic">{products.find(p => p.id == id)?.name}</p>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 font-black text-blue-600">x{qty}</div>
            </div>
          ))}
        </div>
        <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0} className={`w-full py-5 rounded-[2rem] font-black text-white text-lg mt-8 shadow-2xl ${Object.keys(cart).length === 0 ? 'bg-slate-100 text-slate-200' : mode === 'withdraw' ? 'bg-slate-900' : 'bg-blue-600'}`}>CONFIRM</button>
      </div>

      {/* Modal ประวัติ */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            <div className="p-8 border-b flex justify-between items-center bg-blue-600 text-white">
              <h2 className="text-xl font-black uppercase">My History</h2>
              <button onClick={() => setShowHistory(false)} className="font-black">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              {history.length > 0 ? history.map((log) => (
                <div key={log.id} className="flex justify-between items-center p-4 border-b bg-slate-50 rounded-xl mb-2">
                  <div>
                    <p className="text-xs font-black uppercase">{log.product_name}</p>
                    <p className="text-[9px] text-slate-400">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs font-black uppercase ${log.type === 'withdraw' ? 'text-slate-900' : 'text-blue-600'}`}>{log.type} x{log.amount}</span>
                </div>
              )) : <p className="text-center py-10 text-slate-400 font-bold italic">No history found</p>}
            </div>
          </div>
        </div>
      )}

      {showAdminHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-8 border-b flex justify-between items-center bg-slate-900 text-white">
              <h2 className="text-xl font-black uppercase italic">Global History</h2>
              <button onClick={() => setShowAdminHistory(false)} className="font-black">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-1">
              {allHistory.map((log) => (
                <div key={log.id} className="grid grid-cols-4 gap-4 p-4 border-b text-[10px] font-bold uppercase items-center">
                  <span>{log.borrower_name}</span>
                  <span className="font-black">{log.product_name}</span>
                  <span className="text-blue-600 text-center">x{log.amount} ({log.type})</span>
                  <button onClick={() => {}} className="text-right">PRINT</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}