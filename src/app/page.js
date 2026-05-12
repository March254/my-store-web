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
  const router = useRouter();

  // --- 1. กำหนด Email แอดมินตรงนี้ ---
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
    const { data, error } = await supabase
      .from('borrow_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      const groups = data.reduce((acc, item) => {
        const id = item.group_id || 'no-group';
        if (!acc[id]) acc[id] = [];
        acc[id].push(item);
        return acc;
      }, {});
      setGroupedRequests(groups);
    }
  };

  // ส่วนแก้ไขจำนวนสต็อกสำหรับแอดมิน
  const handleAdminUpdateStock = async (id, newStock) => {
    const stockNum = parseInt(newStock);
    if (isNaN(stockNum) || stockNum < 0) return alert("กรุณาระบุจำนวนที่ถูกต้อง");
    const { error } = await supabase.from('products').update({ stock: stockNum }).eq('id', id);
    if (!error) {
      alert("อัปเดตสต็อกสำเร็จ");
      fetchProducts();
    } else {
      alert("เกิดข้อผิดพลาด: " + error.message);
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
            product_id: req.product_id, product_name: req.product_name,
            amount: req.amount, borrower_name: req.borrower_name, type: req.type
          }]);
        }
        await supabase.from('borrow_requests').update({ status: decision }).eq('id', req.id);
      }
      alert(decision === 'approved' ? "✅ อนุมัติคำขอทั้งหมดแล้ว" : "❌ ปฏิเสธคำขอทั้งหมดแล้ว");
      fetchRequests();
      fetchProducts();
    } catch (error) {
      alert("เกิดข้อผิดพลาด");
    }
  };

  const handleConfirmAction = async () => {
    if (!borrower || Object.keys(cart).length === 0) return alert("กรุณาเลือกของก่อน!");
    const groupId = `GRP-${Date.now()}`;
    try {
      const inserts = Object.entries(cart).map(([itemId, qty]) => {
        const item = products.find(p => p.id == itemId);
        return { 
          product_id: itemId, product_name: item.name, 
          amount: qty, borrower_name: borrower, 
          type: mode, status: 'pending', group_id: groupId
        };
      });
      await supabase.from('borrow_requests').insert(inserts);
      alert("ส่งคำขอสำเร็จ! รอแอดมินอนุมัติ");
      setCart({});
    } catch (error) {
      alert("ส่งไม่สำเร็จ");
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login'); };
  
  const updateCart = (itemId, amount) => {
    const item = products.find(p => p.id == itemId);
    const currentQtyInCart = cart[itemId] || 0;
    const newQty = currentQtyInCart + amount;
    if (mode === "withdraw" && newQty > item.stock) return alert(`สต็อกไม่พอ`);
    if (mode === "return" && item.stock + newQty > (item.max_stock || 50)) return alert(`เกินจำนวนสูงสุด`);
    setCart(prev => (newQty <= 0 ? (({ [itemId]: _, ...r }) => r)(prev) : { ...prev, [itemId]: newQty }));
  };

  const filteredProducts = products.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()) && (activeCategory === "All" || item.category === activeCategory));

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row font-sans">
      <div className="flex-1 p-4 lg:p-10">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="relative w-14 h-14">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain rounded-2xl" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                <div className="hidden absolute inset-0 bg-blue-600 rounded-2xl items-center justify-center text-white font-black text-xl">M</div>
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Maker<span className="text-blue-600">Stock</span></h1>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{isAdmin ? 'Admin Management' : 'User Inventory'}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-md">LOGOUT</button>
          </div>

          {/* คำขอสำหรับ Admin (แบบรวมกลุ่ม) */}
          {isAdmin && Object.keys(groupedRequests).length > 0 && (
            <div className="mb-10 space-y-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">คำขอรอดำเนินการ</p>
              {Object.entries(groupedRequests).map(([groupId, items]) => (
                <div key={groupId} className="bg-white border-l-8 border-l-blue-600 p-8 rounded-[2.5rem] shadow-xl shadow-blue-50 border border-slate-100">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                      <h3 className="font-black text-slate-800 text-lg uppercase">ใบเบิก/คืน #{groupId.slice(-5)}</h3>
                      <p className="text-xs font-bold text-slate-400">โดย: {items[0].borrower_name}</p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <button onClick={() => handleDecideGroup(groupId, 'approved')} className="flex-1 md:flex-none bg-blue-600 text-white px-8 py-3 rounded-xl text-xs font-black shadow-lg hover:scale-105 transition-all">อนุมัติทั้งหมด</button>
                      <button onClick={() => handleDecideGroup(groupId, 'rejected')} className="flex-1 md:flex-none bg-white text-red-500 border border-red-50 px-8 py-3 rounded-xl text-xs font-black hover:bg-red-50">ปฏิเสธ</button>
                    </div>
                  </div>
                  <div className="space-y-2 border-t pt-4">
                    {items.map(item => (
                      <div key={item.id} className="flex justify-between text-sm font-bold text-slate-600 bg-slate-50 p-3 rounded-xl">
                        <span>{item.product_name}</span>
                        <span className="text-blue-600">x{item.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Search & Modes */}
          <div className="relative mb-6">
            <input type="text" placeholder="ค้นหาอุปกรณ์..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-5 pl-14 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none font-bold" />
            <span className="absolute left-6 top-1/2 -translate-y-1/2 opacity-30 text-xl">🔍</span>
          </div>

          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'withdraw' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'return' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          <div className="mb-8">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Categories</p>
            <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-7 py-3 rounded-2xl whitespace-nowrap font-black text-xs transition-all ${activeCategory === cat ? 'bg-blue-600 text-white shadow-xl scale-105' : 'bg-white text-slate-400 border border-slate-100'}`}>
                  {cat === 'All' ? '📌 ทั้งหมด' : cat.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* รายการสินค้า */}
          <div className="grid grid-cols-1 gap-4">
            {loading ? <div className="text-center py-20 animate-spin">🌀</div> : filteredProducts.map((item) => (
              <div key={item.id} className="group relative">
                <ItemCard item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
                {/* ปุ่ม SET STOCK ที่กลับมาทำงานได้ปกติสำหรับ Admin */}
                {isAdmin && (
                  <button onClick={() => {
                    const n = prompt(`แก้ไขสต็อก: ${item.name}`, item.stock);
                    if (n !== null) handleAdminUpdateStock(item.id, n);
                  }} className="absolute top-4 right-4 z-20 bg-white/90 text-[9px] font-black px-3 py-1.5 rounded-xl border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                    SET STOCK
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar ตะกร้า */}
      <div className="w-full lg:w-96 bg-white border-l p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-3">🛒 ตะกร้าของ{mode === 'withdraw' ? 'เบิก' : 'คืน'}</h2>
        <div className="flex-1 overflow-y-auto space-y-4">
          {Object.entries(cart).map(([id, qty]) => {
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
          })}
        </div>
        <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0} className={`w-full py-5 rounded-[2rem] font-black text-white text-lg mt-8 ${mode === 'withdraw' ? 'bg-slate-900' : 'bg-blue-600'}`}>ยืนยันส่งคำขอ</button>
      </div>
    </main>
  );
}