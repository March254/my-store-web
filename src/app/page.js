"use client";
import { useState, useEffect } from "react";
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';
import ItemCard from './ItemCard';

export default function Home() {
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [borrower, setBorrower] = useState("");
  const [cart, setCart] = useState({});
  const [mode, setMode] = useState("withdraw");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // เช็คสิทธิ์และดึงข้อมูล
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      } else {
        setUser(user);
        setBorrower(user.email); // ตั้งค่าชื่อตามอีเมลที่ล็อคอิน
        fetchProducts();
      }
    };
    checkUser();
  }, [router]);

  const fetchProducts = async () => {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').order('name');
    setProducts(data || []);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const updateCart = (itemId, amount) => {
    setCart(prev => {
      const newQty = (prev[itemId] || 0) + amount;
      if (newQty <= 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: newQty };
    });
  };

  const handleConfirmAction = async () => {
    if (!borrower) return alert("ไม่พบข้อมูลผู้ทำรายการ!");
    if (Object.keys(cart).length === 0) return alert("กรุณาเลือกรายการก่อน!");

    try {
      for (const [itemId, qty] of Object.entries(cart)) {
        const item = products.find(p => p.id == itemId);
        const newStock = mode === "withdraw" ? item.stock - qty : item.stock + qty;
        await supabase.from('products').update({ stock: newStock }).eq('id', itemId);
        await supabase.from('transaction_logs').insert([{ 
          product_id: itemId, product_name: item.name, amount: qty, 
          borrower_name: borrower, type: mode 
        }]);
      }
      alert("บันทึกรายการสำเร็จ!");
      setCart({});
      fetchProducts();
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการบันทึก");
    }
  };

  if (!user) return null;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <div className="flex-1 p-6 lg:p-10">
        <div className="max-w-2xl mx-auto">
          
          {/* Header Section: Logo + Title + User Info */}
          <div className="flex justify-between items-center mb-8 bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-14 h-14 rounded-2xl object-contain shadow-sm"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div style={{display: 'none'}} className="w-14 h-14 bg-blue-600 rounded-2xl items-center justify-center text-white text-xl font-black">
                M
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tighter leading-none">MAKER<span className="text-blue-600">STOCK</span></h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Inventory Management</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 border-l pl-4 border-slate-100">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-slate-400 font-black uppercase leading-none mb-1">User Active</p>
                <p className="text-sm font-bold text-slate-700">{user.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="bg-red-50 text-red-600 p-2.5 rounded-xl hover:bg-red-100 transition-all border border-red-100 group"
                title="ออกจากระบบ"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black transition-all ${mode === 'withdraw' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:bg-slate-50'}`}>เบิกอุปกรณ์</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black transition-all ${mode === 'return' ? 'bg-green-600 text-white shadow-lg shadow-green-100' : 'text-slate-400 hover:bg-slate-50'}`}>คืนอุปกรณ์</button>
          </div>

          <div className="relative mb-10">
            <input 
              type="text"
              placeholder="ค้นหาอุปกรณ์ที่ต้องการ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-5 pl-12 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none focus:ring-4 focus:ring-blue-50/50 transition-all text-lg font-medium"
            />
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl">🔍</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {loading ? (
              <div className="text-center py-20">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-slate-400 font-bold">กำลังดึงข้อมูลจากระบบ...</p>
              </div>
            ) : (
              products.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase())).map((item) => (
                <ItemCard key={item.id} item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white border-l border-slate-100 p-8 flex flex-col shadow-2xl lg:shadow-none sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black mb-8 flex items-center gap-3">
          <span className="p-2 bg-slate-100 rounded-xl">📦</span>
          รายการ{mode === 'withdraw' ? 'เบิก' : 'คืน'}
        </h2>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
          {Object.entries(cart).length === 0 ? (
            <div className="text-center py-20 text-slate-300 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center">
              <span className="text-4xl mb-2">empty</span>
              <p className="text-sm font-bold">ยังไม่ได้เลือกรายการ</p>
            </div>
          ) : (
            Object.entries(cart).map(([id, qty]) => {
              const item = products.find(p => p.id == id);
              return (
                <div key={id} className="flex justify-between items-center bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100 group hover:border-blue-200 transition-all">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-slate-800 truncate">{item?.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-tighter">{item?.category || 'General'}</p>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 font-black text-blue-600 shadow-sm text-lg">
                    {qty}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-8 pt-8 border-t border-slate-100 space-y-5">
          <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100/50">
            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-2 text-center">Authorized Borrower</label>
            <p className="text-center font-bold text-blue-700 text-lg">{user.email}</p>
          </div>

          <button 
            onClick={handleConfirmAction}
            disabled={Object.keys(cart).length === 0}
            className={`w-full py-5 rounded-[2rem] font-black text-white text-xl shadow-2xl transition-all active:scale-95 disabled:opacity-20 disabled:grayscale ${mode === 'withdraw' ? 'bg-blue-600 shadow-blue-200 hover:bg-blue-700' : 'bg-green-600 shadow-green-200 hover:bg-green-700'}`}
          >
            ยืนยันทำรายการ
          </button>
          
          {Object.keys(cart).length > 0 && (
            <button onClick={() => setCart({})} className="w-full text-xs font-bold text-slate-300 hover:text-red-500 transition-colors uppercase tracking-widest">
              Clear All Items
            </button>
          )}
        </div>
      </div>
    </main>
  );
}