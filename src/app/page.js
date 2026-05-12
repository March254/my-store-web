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

  // --- 1. กำหนด Email แอดมินตรงนี้ (สำคัญมาก!) ---
  const ADMIN_EMAILS = ["admin@email.com", "your-email@email.com"]; 

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      } else {
        setUser(user);
        setBorrower(user.email);
        
        // เช็คสิทธิ์แอดมิน (กันพลาดเรื่องตัวพิมพ์เล็ก/ใหญ่)
        const adminStatus = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
        setIsAdmin(adminStatus);
        
        fetchProducts();
        
        // ถ้าเป็นแอดมิน ให้ดึงคำขอทันที
        if (adminStatus) {
          fetchRequests();
        }
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
    const { data, error } = await supabase
      .from('borrow_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Error fetching requests:", error.message);
    } else {
      setPendingRequests(data || []);
    }
  };

  const handleAdminUpdateStock = async (id, newStock) => {
    const stockNum = parseInt(newStock);
    if (isNaN(stockNum) || stockNum < 0) return alert("กรุณาระบุจำนวนที่ถูกต้อง");
    const { error } = await supabase.from('products').update({ stock: stockNum }).eq('id', id);
    if (!error) fetchProducts();
  };

  // --- 2. ฟังก์ชัน อนุมัติ / ไม่อนุมัติ สำหรับแอดมิน ---
  const handleDecideRequest = async (request, decision) => {
    try {
      if (decision === 'approved') {
        const item = products.find(p => p.id === request.product_id);
        const newStock = request.type === 'withdraw' ? item.stock - request.amount : item.stock + request.amount;
        
        // ตัดสต็อกจริง
        await supabase.from('products').update({ stock: newStock }).eq('id', request.product_id);
        
        // บันทึกประวัติ
        await supabase.from('transaction_logs').insert([{
          product_id: request.product_id,
          product_name: request.product_name,
          amount: request.amount,
          borrower_name: request.borrower_name,
          type: request.type
        }]);
      }

      // อัปเดตสถานะในตารางคำขอ
      await supabase.from('borrow_requests').update({ status: decision }).eq('id', request.id);
      
      alert(decision === 'approved' ? "✅ อนุมัติเรียบร้อย สต็อกอัปเดตแล้ว" : "❌ ปฏิเสธคำขอแล้ว");
      fetchRequests();
      fetchProducts();
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการดำเนินการ");
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
        alert(`ของในสต็อกไม่พอ (เหลือ ${item.stock})`);
        return;
      }
    } else {
      const maxLimit = item.max_stock || 50; 
      if (item.stock + newQty > maxLimit) {
        alert(`คืนไม่ได้! จำนวนรวมจะเกินสต็อกสูงสุด (${maxLimit})`);
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
    if (!borrower || Object.keys(cart).length === 0) return alert("กรุณาเลือกของก่อน!");
    try {
      for (const [itemId, qty] of Object.entries(cart)) {
        const item = products.find(p => p.id == itemId);
        await supabase.from('borrow_requests').insert([{ 
          product_id: itemId, product_name: item.name, 
          amount: qty, borrower_name: borrower, 
          type: mode, status: 'pending'
        }]);
      }
      alert("ส่งคำขอสำเร็จ! รอแอดมินอนุมัติ");
      setCart({});
    } catch (error) {
      alert("ส่งคำขอไม่สำเร็จ กรุณาเช็คการเชื่อมต่อ");
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
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">M</div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Maker<span className="text-blue-600">Stock</span></h1>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{isAdmin ? 'Admin Management' : 'User Inventory'}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black hover:bg-red-600 transition-all shadow-md">LOGOUT</button>
          </div>

          {/* --- 3. ส่วนแสดงคำขอสำหรับ Admin (จะขึ้นบนสุด) --- */}
          {isAdmin && pendingRequests.length > 0 && (
            <div className="mb-10 bg-white border-l-8 border-l-blue-600 border border-slate-100 p-8 rounded-[2.5rem] shadow-xl shadow-blue-50">
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>
                คำขอรอดำเนินการ ({pendingRequests.length})
              </h2>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-slate-50 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center border border-slate-100 gap-4">
                    <div>
                      <p className="font-black text-slate-800">{req.product_name} <span className="text-blue-600">x{req.amount}</span></p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                        โดย: {req.borrower_name} | {req.type === 'withdraw' ? '🟢 เบิกออก' : '🔵 คืนของ'}
                      </p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <button onClick={() => handleDecideRequest(req, 'approved')} className="flex-1 md:flex-none bg-blue-600 text-white px-6 py-2.5 rounded-xl text-xs font-black shadow-lg hover:scale-105 transition-all">อนุมัติ</button>
                      <button onClick={() => handleDecideRequest(req, 'rejected')} className="flex-1 md:flex-none bg-white text-red-500 border border-red-50 px-6 py-2.5 rounded-xl text-xs font-black hover:bg-red-50">ปฏิเสธ</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search & Modes */}
          <div className="relative mb-6">
            <input type="text" placeholder="ค้นหาอุปกรณ์..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-5 pl-14 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all font-bold" />
            <span className="absolute left-6 top-1/2 -translate-y-1/2 opacity-30 text-xl">🔍</span>
          </div>

          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'withdraw' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'return' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          {/* --- 4. หมวดหมู่ดีไซน์ใหม่ (Font หนา ดูดี) --- */}
          <div className="mb-8">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Categories</p>
            <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`px-7 py-3 rounded-2xl whitespace-nowrap font-black text-xs transition-all tracking-tighter ${
                    activeCategory === cat 
                    ? 'bg-blue-600 text-white shadow-xl scale-105' 
                    : 'bg-white text-slate-400 border border-slate-100 hover:text-slate-600'
                  }`}
                >
                  {cat === 'All' ? '📌 ทั้งหมด' : cat.toUpperCase()}
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
                  }} className="absolute top-4 right-4 bg-white/90 text-[9px] font-black px-3 py-1.5 rounded-xl border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity">SET STOCK</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white border-l border-slate-100 p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-3">
          <span className="p-2.5 bg-slate-900 text-white rounded-2xl text-lg">🛒</span> ตะกร้าของ{mode === 'withdraw' ? 'เบิก' : 'คืน'}
        </h2>
        <div className="flex-1 overflow-y-auto space-y-4">
          {Object.entries(cart).length === 0 ? (
            <div className="text-center py-32 text-slate-200 border-4 border-dashed border-slate-50 rounded-[3rem] flex flex-col items-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">ไม่มีรายการที่เลือก</p>
            </div>
          ) : (
            Object.entries(cart).map(([id, qty]) => {
              const item = products.find(p => p.id == id);
              return (
                <div key={id} className="flex justify-between items-center bg-slate-50 p-5 rounded-[1.8rem] border border-slate-100">
                  <div className="min-w-0 pr-4">
                    <p className="font-black text-slate-800 truncate text-sm">{item?.name}</p>
                    <p className="text-[9px] text-blue-500 font-black uppercase">{item?.category}</p>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 font-black">{qty}</div>
                </div>
              );
            })
          )}
        </div>
        <div className="mt-8 pt-8 border-t-2 border-slate-50 space-y-6">
          <div className="bg-slate-50 p-5 rounded-[2rem] text-center border border-slate-100">
            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">User Account</p>
            <p className="font-black text-slate-800 text-sm truncate">{user.email}</p>
          </div>
          <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0}
            className={`w-full py-5 rounded-[2rem] font-black text-white text-lg shadow-2xl transition-all active:scale-95 disabled:opacity-20 ${mode === 'withdraw' ? 'bg-slate-900' : 'bg-blue-600'}`}>
            ยืนยันส่งคำขอ
          </button>
        </div>
      </div>
    </main>
  );
}