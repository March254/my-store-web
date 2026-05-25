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
            product_id: req.product_id, product_name: req.product_name,
            amount: req.amount, borrower_name: req.borrower_name, type: req.type
          }]);
        }
        await supabase.from('borrow_requests').update({ status: decision }).eq('id', req.id);
      }
      fetchData(user.email, isAdmin);
    } catch (e) { alert("Error saving transaction"); }
  };

  const updateCart = (itemId, amount, isDirect = false) => {
    const item = products.find(p => p.id == itemId);
    if (!item) return;

    let newQty = isDirect ? parseInt(amount) : (cart[itemId] || 0) + amount;
    
    if (isNaN(newQty) || newQty < 0) newQty = 0;

    if (mode === "withdraw" && newQty > item.stock) {
      alert(`คลังมีสินค้าไม่เพียงพอ (คงเหลือ: ${item.stock} ชิ้น)`);
      newQty = item.stock;
    }
    if (mode === "return") {
      const currentlyHolding = myItems.find(i => i.name === item.name)?.qty || 0;
      if (newQty > currentlyHolding) {
        alert(`คุณไม่สามารถคืนของเกินจำนวนที่มีได้ (คุณถืออยู่: ${currentlyHolding} ชิ้น)`);
        newQty = currentlyHolding;
      }
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
    alert("Request sent successfully!");
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
          
          {/* Header */}
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<div class="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl">M</div>'; }} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tighter uppercase leading-none mb-1">Maker<span className="text-blue-600">Stock</span></h1>
                <div className="flex flex-col">
                  <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest leading-tight">{isAdmin ? 'ADMIN PANEL' : 'USER DASHBOARD'}</p>
                  <p className="text-[9px] font-bold text-slate-400 truncate max-w-[150px]">{user?.email}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isAdmin && <button onClick={() => setShowAdminHistory(true)} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-[10px] font-black transition-all">ALL HISTORY</button>}
              {!isAdmin && <button onClick={() => setShowHistory(true)} className="bg-blue-50 text-blue-600 px-4 py-2.5 rounded-xl text-[10px] font-black transition-all">MY HISTORY</button>}
              <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="bg-slate-100 text-slate-900 px-4 py-2.5 rounded-xl text-[10px] font-black transition-all">LOGOUT</button>
            </div>
          </div>

          {/* Admin History Modal */}
          {showAdminHistory && isAdmin && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                <div className="p-8 border-b flex justify-between items-center bg-slate-900 text-white">
                  <h2 className="text-xl font-black uppercase tracking-tighter">Global Transaction Log</h2>
                  <button onClick={() => setShowAdminHistory(false)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-black hover:bg-white/20 transition-all text-white">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-2">
                  <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b mb-4">
                    <div className="col-span-3">User</div>
                    <div className="col-span-4">Item Name</div>
                    <div className="col-span-1 text-center">Qty</div>
                    <div className="col-span-2 text-center">Type</div>
                    <div className="col-span-2 text-right">Date/Time</div>
                  </div>
                  {allHistory.map((log) => (
                    <div key={log.id} className="grid grid-cols-12 gap-4 px-4 py-4 rounded-xl border border-slate-50 hover:bg-slate-50 transition-all items-center text-xs">
                      <div className="col-span-3 font-bold text-slate-500 truncate">{log.borrower_name}</div>
                      <div className="col-span-4 font-black text-slate-800 uppercase truncate">{log.product_name}</div>
                      <div className="col-span-1 text-center font-black text-blue-600">x{log.amount}</div>
                      <div className="col-span-2 text-center">
                        <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase ${log.type === 'withdraw' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                          {log.type === 'withdraw' ? 'เบิกของ' : 'คืนของ'}
                        </span>
                      </div>
                      <div className="col-span-2 text-right text-[9px] font-bold text-slate-400 leading-tight">
                        {new Date(log.created_at).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* User History Modal */}
          {showHistory && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                <div className="p-8 border-b flex justify-between items-center bg-slate-50">
                  <h2 className="text-xl font-black uppercase tracking-tighter">My History</h2>
                  <button onClick={() => setShowHistory(false)} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center font-black hover:bg-slate-100 transition-all">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {history.map((log) => (
                    <div key={log.id} className="bg-white border border-slate-100 p-5 rounded-2xl flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-800 text-sm uppercase">{log.product_name}</span>
                        <span className="text-[10px] font-bold text-slate-400">
                          {new Date(log.created_at).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${log.type === 'withdraw' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                          {log.type === 'withdraw' ? 'เบิกของ' : 'คืนของ'}
                        </span>
                        <span className="font-black text-lg text-slate-700">x{log.amount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Admin Pending Requests */}
          {isAdmin && Object.keys(groupedRequests).length > 0 && (
            <div className="mb-10">
              <h2 className="text-sm font-black mb-4 uppercase text-blue-600">🔔 Pending Requests ({Object.keys(groupedRequests).length})</h2>
              <div className="max-h-[500px] overflow-y-auto pr-2 space-y-6">
                {Object.entries(groupedRequests).map(([groupId, items]) => (
                  <div key={groupId} className="bg-white border-l-8 border-l-blue-600 p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h3 className="font-black text-slate-800 uppercase text-lg tracking-tighter">Order #{groupId.slice(-5)}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{items[0].borrower_name}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleDecideGroup(groupId, 'approved')} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-[10px] font-black shadow-lg active:scale-95 transition-all">APPROVE</button>
                        <button onClick={() => handleDecideGroup(groupId, 'rejected')} className="bg-white text-red-500 border border-red-50 px-6 py-3 rounded-xl text-[10px] font-black active:scale-95 transition-all">REJECT</button>
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

          {/* User Data */}
          {!isAdmin && (
            <>
              {myPendingRequests.length > 0 && (
                <div className="mb-10 bg-blue-50 p-6 rounded-[2rem] border border-blue-100 shadow-inner">
                  <h2 className="text-[10px] font-black mb-3 uppercase text-blue-600 tracking-widest text-center italic">⏳ Waiting for Approval</h2>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {myPendingRequests.map((req, idx) => (
                      <div key={idx} className="bg-white px-4 py-2 rounded-xl shadow-sm border border-blue-200 text-[10px] font-bold">
                        <span className={req.type === 'withdraw' ? 'text-amber-600' : 'text-blue-600'}>{req.type === 'withdraw' ? 'เบิกของ' : 'คืนของ'}</span> : {req.product_name} x {req.amount}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {myItems.length > 0 && (
                <div className="mb-10 bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white text-center">
                  <h2 className="text-[10px] font-black mb-4 uppercase text-slate-400 tracking-widest">📦 My Inventory</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {myItems.map((item, idx) => (
                      <div key={idx} className="bg-white/10 p-4 rounded-2xl border border-white/10">
                        <p className="font-black text-xs truncate uppercase tracking-tighter">{item.name}</p>
                        <p className="text-blue-400 font-black text-xl italic">x{item.qty}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <input type="text" placeholder="Search devices..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-5 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none font-bold mb-6 focus:ring-4 focus:ring-blue-50" />
          
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
            {loading ? <div className="text-center py-20 font-black text-blue-600 uppercase tracking-widest">Loading...</div> : filteredProducts.map((item) => (
              <div key={item.id} className="group relative">
                <ItemCard item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
                {isAdmin && (
                  <button onClick={() => { const n = prompt(`Set Stock: ${item.name}`, item.stock); if (n !== null) handleAdminUpdateStock(item.id, n); }} className="absolute top-4 right-4 z-20 bg-white/90 text-[9px] font-black px-3 py-1.5 rounded-xl border border-slate-200 opacity-0 group-hover:opacity-100 transition-all shadow-sm">SET STOCK</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white border-l p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black text-slate-800 mb-8 uppercase italic flex items-center gap-3">🛒 Cart <span className="text-blue-600">/</span> {mode === 'withdraw' ? 'เบิกของ' : 'คืนของ'}</h2>
        <div className="flex-1 overflow-y-auto space-y-4">
          {Object.entries(cart).map(([id, qty]) => {
            const currentItem = products.find(p => p.id == id);
            return (
              <div key={id} className="flex justify-between items-center bg-slate-50 p-4 rounded-[1.8rem] border border-slate-100 transition-all gap-3">
                {/* เพิ่มรูปภาพอุปกรณ์ใน Cart Sidebar */}
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {currentItem?.image_url ? (
                    <img src={currentItem.image_url} alt={currentItem?.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-xs font-black text-slate-300">No Image</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-black text-slate-800 truncate text-sm uppercase italic leading-tight">{currentItem?.name}</p>
                  <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">{currentItem?.category}</p>
                </div>
                
                <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 flex-shrink-0">
                  <span className="text-xs font-black text-slate-400">x</span>
                  <input 
                    type="number" 
                    min="1"
                    value={qty} 
                    onChange={(e) => updateCart(id, e.target.value, true)}
                    className="w-10 text-center font-black text-blue-600 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            );
          })}
          {Object.keys(cart).length === 0 && <p className="text-center text-slate-300 font-bold py-10 italic text-sm uppercase">Cart is Empty</p>}
        </div>
        <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0} className={`w-full py-5 rounded-[2rem] font-black text-white text-lg mt-8 shadow-2xl active:scale-95 transition-all ${Object.keys(cart).length === 0 ? 'bg-slate-100 text-slate-200' : mode === 'withdraw' ? 'bg-slate-900' : 'bg-blue-600'}`}>CONFIRM</button>
      </div>
    </main>
  );
}