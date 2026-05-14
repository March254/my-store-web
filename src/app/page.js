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
  const [myPendingRequests, setMyPendingRequests] = useState([]); // สถานะคำขอของ User
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
    
    // ตั้งค่าให้รีเฟรชข้อมูลทุก 10 วินาที เพื่อให้เห็นสถานะอัปเดตอัตโนมัติ
    const interval = setInterval(() => {
      if (user) fetchData(user.email, isAdmin);
    }, 10000);
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

  const handleDecideGroup = async (groupId, decision) => {
    const requests = groupedRequests[groupId];
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
    const groupId = `GRP-${Date.now()}`;
    const inserts = Object.entries(cart).map(([id, qty]) => ({
      product_id: id, product_name: products.find(p => p.id == id).name,
      amount: qty, borrower_name: borrower, type: mode, status: 'pending', group_id: groupId
    }));
    await supabase.from('borrow_requests').insert(inserts);
    setCart({});
    fetchMyPendingRequests(user.email);
    alert("ส่งคำขอแล้ว! รอแอดมินอนุมัติ");
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
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black">M</div>
              <div>
                <h1 className="text-lg font-black uppercase">Maker<span className="text-blue-600">Stock</span></h1>
                <p className="text-[9px] font-bold text-slate-400">{user?.email}</p>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="bg-slate-100 px-4 py-2 rounded-xl text-xs font-black">LOGOUT</button>
          </div>

          {/* Admin: คำขอรอนุมัติ */}
          {isAdmin && Object.keys(groupedRequests).length > 0 && (
            <div className="mb-10">
              <h2 className="text-xs font-black mb-4 uppercase text-blue-600">🔔 คำขอรอนุมัติ (แอดมิน)</h2>
              <div className="max-h-[400px] overflow-y-auto space-y-4 pr-2">
                {Object.entries(groupedRequests).map(([groupId, items]) => (
                  <div key={groupId} className="bg-white p-6 rounded-[2rem] shadow-lg border-l-4 border-blue-600 flex justify-between items-center">
                    <div>
                      <p className="font-black text-sm">#{groupId.slice(-5)} - {items[0].borrower_name}</p>
                      <div className="flex gap-2 mt-1">
                        {items.map(i => <span key={i.id} className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-lg font-bold">{i.product_name} x{i.amount}</span>)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleDecideGroup(groupId, 'approved')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black">อนุมัติ</button>
                      <button onClick={() => handleDecideGroup(groupId, 'rejected')} className="bg-slate-100 text-red-500 px-4 py-2 rounded-xl text-[10px] font-black">ปฏิเสธ</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User: สถานะคำขอที่ส่งไปแล้ว */}
          {!isAdmin && myPendingRequests.length > 0 && (
            <div className="mb-10 bg-blue-50 p-6 rounded-[2rem] border border-blue-100">
              <h2 className="text-[10px] font-black mb-3 uppercase text-blue-600 tracking-widest">⏳ กำลังรออนุมัติ...</h2>
              <div className="flex flex-wrap gap-2">
                {myPendingRequests.map((req, idx) => (
                  <div key={idx} className="bg-white px-4 py-2 rounded-xl shadow-sm border border-blue-200 text-[10px] font-bold">
                    {req.type === 'withdraw' ? 'เบิก' : 'คืน'} : {req.product_name} <span className="text-blue-600">x{req.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User: ของในมือ */}
          {!isAdmin && myItems.length > 0 && (
            <div className="mb-10 bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
              <h2 className="text-[10px] font-black mb-4 uppercase text-slate-400 tracking-widest text-center">📦 ของที่คุณถือครองอยู่ (ใช้งานได้)</h2>
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

          {/* ค้นหาและหมวดหมู่ */}
          <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-4 mb-6 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none" />
          
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 mb-8">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${mode === 'withdraw' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${mode === 'return' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredProducts.map((item) => (
              <ItemCard key={item.id} item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
            ))}
          </div>
        </div>
      </div>

      {/* Cart */}
      <div className="w-full lg:w-80 bg-white border-l p-8 sticky top-0 h-screen hidden lg:flex flex-col">
        <h2 className="text-xl font-black mb-8 uppercase italic">Cart / {mode}</h2>
        <div className="flex-1 overflow-y-auto space-y-3">
          {Object.entries(cart).map(([id, qty]) => (
            <div key={id} className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center">
              <span className="font-bold text-xs">{products.find(p => p.id == id)?.name}</span>
              <span className="font-black text-blue-600">x{qty}</span>
            </div>
          ))}
        </div>
        <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0} className={`w-full py-4 rounded-2xl font-black text-white mt-6 ${mode === 'withdraw' ? 'bg-slate-900' : 'bg-blue-600'}`}>CONFIRM</button>
      </div>
    </main>
  );
}