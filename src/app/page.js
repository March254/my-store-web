"use client";
import { useState, useEffect } from "react";
import { supabase } from '../lib/supabase';
import ItemCard from './ItemCard';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [borrower, setBorrower] = useState("");
  const [cart, setCart] = useState({});
  const [mode, setMode] = useState("withdraw");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('name');
    setProducts(data || []);
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
    if (!borrower.trim()) return alert("กรุณากรอกชื่อผู้ทำรายการครับ!");
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
      setBorrower("");
      fetchProducts();
    } catch (error) {
      alert("เกิดข้อผิดพลาด");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* ส่วนหลัก (ซ้าย) */}
      <div className="flex-1 p-6 lg:p-10">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <img src="/logo.png" alt="Logo" className="w-12 h-12 rounded-xl object-contain" />
            <h1 className="text-2xl font-black tracking-tighter">MAKER<span className="text-blue-600">STOCK</span></h1>
          </div>

          {/* Mode Selector */}
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 mb-6 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-3 rounded-xl font-bold transition-all ${mode === 'withdraw' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>เบิก</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-3 rounded-xl font-bold transition-all ${mode === 'return' ? 'bg-green-600 text-white shadow-md' : 'text-slate-400'}`}>คืน</button>
          </div>

          <input 
            type="text"
            placeholder="🔍 ค้นหาอุปกรณ์..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 bg-white border border-slate-200 rounded-2xl mb-8 shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="grid grid-cols-1 gap-3">
            {products.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase())).map((item) => (
              <ItemCard key={item.id} item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
            ))}
          </div>
        </div>
      </div>

      {/* --- ส่วนแท็บข้างๆ (ขวา) --- */}
      <div className="w-full lg:w-96 bg-white border-l border-slate-200 p-6 flex flex-col shadow-2xl lg:shadow-none sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-xl font-black mb-6 flex items-center gap-2">
          📦 รายการที่กำลัง{mode === 'withdraw' ? 'เบิก' : 'คืน'}
        </h2>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {Object.entries(cart).length === 0 ? (
            <div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
              ยังไม่มีรายการที่เลือก
            </div>
          ) : (
            Object.entries(cart).map(([id, qty]) => {
              const item = products.find(p => p.id == id);
              return (
                <div key={id} className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-right-4">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-sm truncate">{item?.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-black">{item?.category}</p>
                  </div>
                  <div className="bg-white px-3 py-1 rounded-lg border border-slate-200 font-black text-blue-600 shadow-sm">
                    x{qty}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ส่วนสรุปท้ายแท็บข้าง */}
        <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-center">ยืนยันตัวตนผู้ทำรายการ</label>
            <input 
              type="text"
              placeholder="กรอกชื่อของคุณ..."
              value={borrower}
              onChange={(e) => setBorrower(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            />
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
              ล้างรายการทั้งหมด
            </button>
          )}
        </div>
      </div>
    </main>
  );
}