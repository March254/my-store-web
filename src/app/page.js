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
  const [pendingRequests, setPendingRequests] = useState([]); // สำหรับแอดมินดูคำขอ
  const router = useRouter();

  // กำหนด Email ของแอดมิน
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
        if (adminStatus) fetchRequests(); // ถ้าเป็นแอดมินให้ดึงรายการคำขอมาโชว์
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

  // --- ระบบอนุมัติสำหรับแอดมิน ---
  const handleDecideRequest = async (request, decision) => {
    try {
      if (decision === 'approved') {
        const item = products.find(p => p.id === request.product_id);
        const newStock = request.type === 'withdraw' ? item.stock - request.amount : item.stock + request.amount;
        
        // 1. อัปเดตสต็อกจริง
        await supabase.from('products').update({ stock: newStock }).eq('id', request.product_id);
        
        // 2. บันทึกลง Transaction Logs (ประวัติ)
        await supabase.from('transaction_logs').insert([{
          product_id: request.product_id,
          product_name: request.product_name,
          amount: request.amount,
          borrower_name: request.borrower_name,
          type: request.type
        }]);
      }

      // 3. อัปเดตสถานะคำขอ
      await supabase.from('borrow_requests').update({ status: decision }).eq('id', request.id);
      
      alert(decision === 'approved' ? "อนุมัติรายการแล้ว" : "ปฏิเสธรายการแล้ว");
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
        alert(`ไม่สามารถเบิกเกินจำนวนที่มีอยู่ได้ (คงเหลือ: ${item.stock})`);
        return;
      }
    } else {
      const maxLimit = item.max_stock || 50; 
      if (item.stock + newQty > maxLimit) {
        alert(`ไม่สามารถคืนเกินจำนวนที่กำหนดได้ (สต็อกสูงสุดคือ: ${maxLimit})`);
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

  // --- ส่วนส่งคำขอเบิก/คืน (ไม่ตัดสต็อกทันที) ---
  const handleConfirmAction = async () => {
    if (!borrower) return alert("ไม่พบข้อมูลผู้ทำรายการ!");
    if (Object.keys(cart).length === 0) return alert("กรุณาเลือกรายการก่อน!");

    try {
      for (const [itemId, qty] of Object.entries(cart)) {
        const item = products.find(p => p.id == itemId);
        
        // บันทึกลงตารางคำขอรออนุมัติ
        await supabase.from('borrow_requests').insert([{ 
          product_id: itemId, 
          product_name: item.name, 
          amount: qty, 
          borrower_name: borrower, 
          type: mode,
          status: 'pending'
        }]);
      }
      alert("ส่งคำขอสำเร็จ! กรุณารอแอดมินอนุมัติ");
      setCart({});
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการส่งคำขอ");
    }
  };

  const filteredProducts = products.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  if (!user) return null;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <div className="flex-1 p-6 lg:p-10">
        <div className="max-w-2xl mx-auto">
          
          {/* Header */}
          <div className="flex justify-between items-center mb-8 bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="Logo" className="w-14 h-14 rounded-2xl object-contain shadow-sm"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
              <div style={{display: 'none'}} className="w-14 h-14 bg-blue-600 rounded-2xl items-center justify-center text-white text-xl font-black">M</div>
              <div>
                <h1 className="text-2xl font-black tracking-tighter leading-none">MAKER<span className="text-blue-600">STOCK</span></h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{isAdmin ? "Admin Management" : "Inventory Management"}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="bg-red-50 text-red-600 p-2.5 rounded-xl hover:bg-red-100 transition-all border border-red-100">
              LOGOUT
            </button>
          </div>

          {/* Admin Dashboard: ระบบอนุมัติของ (แสดงเฉพาะแอดมิน) */}
          {isAdmin && pendingRequests.length > 0 && (
            <div className="mb-10 bg-amber-50 border-2 border-amber-200 p-6 rounded-[2.5rem] shadow-sm">
              <h2 className="text-amber-800 font-black mb-4 flex items-center gap-2">
                🔔 มีคำขอรอดำเนินการ ({pendingRequests.length})
              </h2>
              <div className="space-y-3">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-white p-4 rounded-2xl flex justify-between items-center border border-amber-100 shadow-sm">
                    <div>
                      <p className="font-bold text-slate-800">{req.product_name} <span className="text-blue-600">x{req.amount}</span></p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">โดย: {req.borrower_name} | ประเภท: {req.type === 'withdraw' ? 'เบิก' : 'คืน'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleDecideRequest(req, 'approved')} className="bg-green-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-md hover:bg-green-700">อนุมัติ</button>
                      <button onClick={() => handleDecideRequest(req, 'rejected')} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-xs font-black border border-red-100 hover:bg-red-100">ไม่อนุมัติ</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Interface: เลือกของ */}
          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black transition-all ${mode === 'withdraw' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}>เบิกอุปกรณ์</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black transition-all ${mode === 'return' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400'}`}>คืนอุปกรณ์</button>
          </div>

          <div className="relative mb-6">
            <input type="text" placeholder="ค้นหาอุปกรณ์..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-5 pl-12 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none focus:ring-4 focus:ring-blue-50/50" />
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl">🔍</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-4 mb-6 no-scrollbar">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`px-6 py-2 rounded-full font-bold text-sm transition-all border ${activeCategory === cat ? 'bg-slate-900 text-white shadow-md scale-105' : 'bg-white text-slate-500 border-slate-200'}`}>
                {cat === 'All' ? 'หน้ารวมอุปกรณ์' : cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {loading ? (
              <div className="text-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
            ) : filteredProducts.map((item) => (
              <div key={item.id} className="relative">
                <ItemCard item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
                {isAdmin && (
                  <button onClick={() => {
                    const n = prompt(`แก้ไขจำนวนสต็อกของ ${item.name}`, item.stock);
                    if (n !== null) handleAdminUpdateStock(item.id, n);
                  }} className="absolute top-2 right-2 bg-white/80 text-[10px] font-black px-2 py-1 rounded-lg border">SET STOCK</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white border-l border-slate-100 p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black mb-8 flex items-center gap-3">
          <span className="p-2 bg-slate-100 rounded-xl">📦</span> ตะกร้าของ{mode === 'withdraw' ? 'เบิก' : 'คืน'}
        </h2>
        <div className="flex-1 overflow-y-auto space-y-4">
          {Object.entries(cart).length === 0 ? (
            <div className="text-center py-20 text-slate-300 border-2 border-dashed border-slate-100 rounded-[2rem]">ยังไม่มีรายการ</div>
          ) : (
            Object.entries(cart).map(([id, qty]) => {
              const item = products.find(p => p.id == id);
              return (
                <div key={id} className="flex justify-between items-center bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-slate-800 truncate">{item?.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-black">{item?.category}</p>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 font-black text-blue-600 shadow-sm">{qty}</div>
                </div>
              );
            })
          )}
        </div>
        <div className="mt-8 pt-8 border-t border-slate-100 space-y-5">
          <div className="bg-blue-50 p-5 rounded-2xl text-center border border-blue-100">
            <label className="text-[10px] font-black text-blue-400 uppercase block mb-1">User ID</label>
            <p className="font-bold text-blue-700">{user.email}</p>
          </div>
          <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0}
            className={`w-full py-5 rounded-[2rem] font-black text-white text-xl shadow-2xl active:scale-95 disabled:opacity-20 ${mode === 'withdraw' ? 'bg-blue-600' : 'bg-green-600'}`}>
            ส่งคำขอให้อนุมัติ
          </button>
        </div>
      </div>
    </main>
  );
}