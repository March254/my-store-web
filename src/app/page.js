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
  const [pendingRequests, setPendingRequests] = useState([]);
  const router = useRouter();

  // กำหนด Email ของแอดมิน (เปลี่ยนเป็นเมลของคุณ)
  const ADMIN_EMAILS = ["admin@email.com", "your-email@email.com"];

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      } else {
        setUser(user);
        setBorrower(user.email);
        const adminStatus = ADMIN_EMAILS.includes(user.email);
        setIsAdmin(adminStatus);
        fetchProducts();
        if (adminStatus) fetchRequests();
      }
    };
    checkUser();
  }, [router]);

  const fetchProducts = async () => {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').order('name');
    if (data) {
      setProducts(data);
      const uniqueCats = ["All", ...new Set(data.map(item => item.category).filter(Boolean))];
      setCategories(uniqueCats);
    }
    setLoading(false);
  };

  const fetchRequests = async () => {
    const { data } = await supabase
      .from('borrow_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (data) setPendingRequests(data);
  };

  const handleAdminUpdateStock = async (id, newStock) => {
    const stockNum = parseInt(newStock);
    if (isNaN(stockNum) || stockNum < 0) return alert("กรุณาระบุจำนวนที่ถูกต้อง");
    const { error } = await supabase.from('products').update({ stock: stockNum }).eq('id', id);
    if (!error) fetchProducts();
  };

  const handleDecideRequest = async (request, decision) => {
    try {
      if (decision === 'approved') {
        const item = products.find(p => p.id === request.product_id);
        const newStock = request.type === 'withdraw' ? item.stock - request.amount : item.stock + request.amount;
        
        await supabase.from('products').update({ stock: newStock }).eq('id', request.product_id);
        await supabase.from('transaction_logs').insert([{
          product_id: request.product_id,
          product_name: request.product_name,
          amount: request.amount,
          borrower_name: request.borrower_name,
          type: request.type
        }]);
      }

      await supabase.from('borrow_requests').update({ status: decision }).eq('id', request.id);
      alert(decision === 'approved' ? "✅ อนุมัติสำเร็จ" : "❌ ปฏิเสธสำเร็จ");
      fetchRequests();
      fetchProducts();
    } catch (error) {
      alert("เกิดข้อผิดพลาด");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const updateCart = (itemId, amount) => {
    const item = products.find(p => p.id == itemId);
    const currentQtyInCart = cart[itemId] || 0;
    const newQty = currentQtyInCart + amount;

    if (mode === "withdraw") {
      if (newQty > item.stock) {
        alert(`คงเหลือไม่พอ (${item.stock})`);
        return;
      }
    } else {
      const maxLimit = item.max_stock || 50; 
      if (item.stock + newQty > maxLimit) {
        alert(`เกินจำนวนสูงสุด (${maxLimit})`);
        return;
      }
    }

    setCart(prev => {
      if (newQty <= 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: newQty };
    });
  };

  const handleConfirmAction = async () => {
    if (!borrower || Object.keys(cart).length === 0) return alert("ข้อมูลไม่ครบ!");
    try {
      for (const [itemId, qty] of Object.entries(cart)) {
        const item = products.find(p => p.id == itemId);
        await supabase.from('borrow_requests').insert([{ 
          product_id: itemId, product_name: item.name, 
          amount: qty, borrower_name: borrower, 
          type: mode, status: 'pending'
        }]);
      }
      alert("ส่งคำขอเรียบร้อยแล้ว");
      setCart({});
    } catch (error) {
      alert("ส่งไม่สำเร็จ");
    }
  };

  const filteredProducts = products.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row font-sans">
      <div className="flex-1 p-4 lg:p-10">
        <div className="max-w-3xl mx-auto">
          
          {/* Header */}
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-200">M</div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Maker<span className="text-blue-600">Stock</span></h1>
                <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`}></div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{isAdmin ? 'Admin Mode' : 'User Member'}</span>
                </div>
              </div>
            </div>
            <button onClick={handleLogout} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black hover:bg-red-600 transition-all shadow-md">LOGOUT</button>
          </div>

          {/* แถบแจ้งเตือนคำขอสำหรับ Admin */}
          {isAdmin && pendingRequests.length > 0 && (
            <div className="mb-10 bg-white border border-blue-100 p-8 rounded-[2.5rem] shadow-xl shadow-blue-50 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-500"></div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>
                คำขอรออนุมัติ ({pendingRequests.length})
              </h2>
              <div className="grid gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-slate-50 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center border border-slate-100 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${req.type === 'withdraw' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>{req.type}</span>
                        <p className="font-black text-slate-800">{req.product_name}</p>
                      </div>
                      <p className="text-xs font-bold text-slate-500">ผู้ขอ: {req.borrower_name} | จำนวน: <span className="text-slate-900">{req.amount}</span></p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <button onClick={() => handleDecideRequest(req, 'approved')} className="flex-1 md:flex-none bg-blue-600 text-white px-6 py-2.5 rounded-xl text-[11px] font-black shadow-lg shadow-blue-100 hover:scale-105 transition-transform">อนุมัติ</button>
                      <button onClick={() => handleDecideRequest(req, 'rejected')} className="flex-1 md:flex-none bg-white text-red-500 border border-red-50 px-6 py-2.5 rounded-xl text-[11px] font-black hover:bg-red-50 transition-all">ไม่อนุมัติ</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search & Modes */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <input type="text" placeholder="ค้นหาอุปกรณ์..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-5 pl-14 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all font-bold text-slate-700" />
              <span className="absolute left-6 top-1/2 -translate-y-1/2 opacity-30 text-xl">🔍</span>
            </div>
          </div>

          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'withdraw' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'return' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          {/* --- แก้ไขหน้าตาหมวดหมู่ (Category Tabs) --- */}
          <div className="mb-8">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">หมวดหมู่สินค้า</p>
            <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-7 py-3 rounded-2xl whitespace-nowrap font-black text-xs transition-all uppercase tracking-tighter ${
                    activeCategory === cat 
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-100 scale-105 border-transparent' 
                    : 'bg-white text-slate-400 border border-slate-100 hover:border-blue-200 hover:text-slate-600'
                  }`}
                >
                  {cat === 'All' ? '📌 ทั้งหมด' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* รายการสินค้า */}
          <div className="grid grid-cols-1 gap-4">
            {loading ? (
              <div className="text-center py-20"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
            ) : filteredProducts.map((item) => (
              <div key={item.id} className="group relative">
                <ItemCard item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
                {isAdmin && (
                  <button onClick={() => {
                    const n = prompt(`แก้ไขสต็อก: ${item.name}`, item.stock);
                    if (n !== null) handleAdminUpdateStock(item.id, n);
                  }} className="absolute top-4 right-4 bg-white/90 backdrop-blur-md text-[9px] font-black px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Update</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Sidebar (ด้านขวา) */}
      <div className="w-full lg:w-96 bg-white border-l border-slate-100 p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <div className="mb-10">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <span className="p-2.5 bg-slate-900 text-white rounded-2xl text-lg tracking-tighter">LIST</span>
                ตะกร้า{mode === 'withdraw' ? 'เบิก' : 'คืน'}
            </h2>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {Object.entries(cart).length === 0 ? (
            <div className="text-center py-32 text-slate-200 border-4 border-dashed border-slate-50 rounded-[3rem] flex flex-col items-center">
              <span className="text-5xl mb-4 italic opacity-20">empty</span>
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">ยังไม่มีรายการ</p>
            </div>
          ) : (
            Object.entries(cart).map(([id, qty]) => {
              const item = products.find(p => p.id == id);
              return (
                <div key={id} className="flex justify-between items-center bg-slate-50 p-5 rounded-[1.8rem] border border-slate-100 group">
                  <div className="min-w-0 pr-4">
                    <p className="font-black text-slate-800 truncate text-sm uppercase">{item?.name}</p>
                    <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">{item?.category}</p>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 font-black text-slate-900 shadow-sm">{qty}</div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-8 pt-8 border-t-2 border-slate-50 space-y-6">
          <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
            <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-center tracking-[0.2em]">Requester Account</label>
            <p className="font-black text-slate-800 text-center truncate text-sm">{user.email}</p>
          </div>
          <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0}
            className={`w-full py-5 rounded-[2rem] font-black text-white text-lg shadow-2xl active:scale-95 transition-all disabled:opacity-20 disabled:grayscale ${mode === 'withdraw' ? 'bg-slate-900 shadow-slate-200' : 'bg-blue-600 shadow-blue-200'}`}>
            ยืนยันส่งคำขอ
          </button>
        </div>
      </div>
    </main>
  );
}