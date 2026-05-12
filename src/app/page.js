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

  useEffect(() => {
    const checkUser = async () => {
      // ตรวจสอบว่ามีการล็อคอินอยู่หรือไม่
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // ถ้าไม่มี user ให้เด้งไปหน้า login
        router.push('/login');
      } else {
        setUser(user);
        // ตั้งชื่อผู้ทำรายการตาม Email ที่ล็อคอินเข้ามาอัตโนมัติ
        setBorrower(user.email); 
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
    const { error } = await supabase.auth.signOut();
    if (!error) {
      router.push('/login');
    }
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
    if (!borrower.trim()) return alert("ไม่พบข้อมูลผู้ทำรายการ!");
    if (Object.keys(cart).length === 0) return alert("กรุณาเลือกรายการก่อน!");

    try {
      for (const [itemId, qty] of Object.entries(cart)) {
        const item = products.find(p => p.id == itemId);
        const newStock = mode === "withdraw" ? item.stock - qty : item.stock + qty;
        
        // อัปเดตสต็อกในตาราง products
        await supabase.from('products').update({ stock: newStock }).eq('id', itemId);
        
        // บันทึกประวัติลงใน transaction_logs
        await supabase.from('transaction_logs').insert([{ 
          product_id: itemId, 
          product_name: item.name, 
          amount: qty, 
          borrower_name: borrower, // จะเป็น Email ของคนที่ล็อคอิน
          type: mode 
        }]);
      }
      alert("บันทึกรายการสำเร็จ!");
      setCart({});
      fetchProducts();
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  if (!user) return null; // ไม่แสดงผลอะไรถ้ายังไม่ได้ login (ป้องกันหน้ากระตุก)

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* --- ส่วนหลัก (ฝั่งซ้าย: ค้นหาและเลือกของ) --- */}
      <div className="flex-1 p-6 lg:p-10">
        <div className="max-w-2xl mx-auto">
          {/* Header & User Navbar */}
          <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black">M</div>
              <h1 className="text-xl font-black tracking-tighter">MAKER<span className="text-blue-600">STOCK</span></h1>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-slate-400 font-bold uppercase leading-none">Logged in as</p>
                <p className="text-sm font-bold text-slate-700">{user.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="text-xs bg-red-50 text-red-600 px-3 py-2 rounded-lg hover:bg-red-100 transition-all font-bold border border-red-100"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>

          {/* Mode Selector (เบิก/คืน) */}
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 mb-6 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-3 rounded-xl font-bold transition-all ${mode === 'withdraw' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>เบิกอุปกรณ์</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-3 rounded-xl font-bold transition-all ${mode === 'return' ? 'bg-green-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>คืนอุปกรณ์</button>
          </div>

          {/* ช่องค้นหา */}
          <input 
            type="text"
            placeholder="🔍 ค้นหาอุปกรณ์..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 bg-white border border-slate-200 rounded-2xl mb-8 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />

          {/* รายการอุปกรณ์ */}
          <div className="grid grid-cols-1 gap-3">
            {loading ? (
              <div className="text-center py-10 text-slate-400 animate-pulse">กำลังโหลดข้อมูลคลัง...</div>
            ) : (
              products.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase())).map((item) => (
                <ItemCard key={item.id} item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* --- ส่วนแถบด้านข้าง (ฝั่งขวา: ตะกร้าและยืนยัน) --- */}
      <div className="w-full lg:w-96 bg-white border-l border-slate-200 p-6 flex flex-col shadow-2xl lg:shadow-none sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-xl font-black mb-6 flex items-center gap-2">
          📦 รายการที่กำลัง{mode === 'withdraw' ? 'เบิก' : 'คืน'}
        </h2>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {Object.entries(cart).length === 0 ? (
            <div className="text-center py-20 text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
              ยังไม่มีรายการที่เลือก
            </div>
          ) : (
            Object.entries(cart).map(([id, qty]) => {
              const item = products.find(p => p.id == id);
              return (
                <div key={id} className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-right-2">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-sm truncate">{item?.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-black">{item?.category || 'ทั่วไป'}</p>
                  </div>
                  <div className="bg-white px-3 py-1 rounded-lg border border-slate-200 font-black text-blue-600 shadow-sm">
                    x{qty}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ส่วนสรุปและยืนยัน */}
        <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 text-center">ผู้ทำรายการ (ตามบัญชีที่ล็อคอิน)</label>
            <p className="text-center font-bold text-blue-600 truncate">{borrower}</p>
          </div>

          <button 
            onClick={handleConfirmAction}
            disabled={Object.keys(cart).length === 0}
            className={`w-full py-4 rounded-2xl font-black text-white shadow-xl transition-all active:scale-95 disabled:opacity-30 disabled:grayscale ${mode === 'withdraw' ? 'bg-blue-600 shadow-blue-100' : 'bg-green-600 shadow-green-100'}`}
          >
            ยืนยัน {Object.keys(cart).length} รายการ
          </button>
          
          {Object.keys(cart).length > 0 && (
            <button onClick={() => setCart({})} className="w-full text-xs font-bold text-slate-400 hover:text-red-500 transition-colors">
              ล้างรายการทั้ง
            </button>
          )}
        </div>
      </div>
    </main>
  );
}