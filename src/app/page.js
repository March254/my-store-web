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

  const handlePrintGroup = (selectedLog) => {
    const groupItems = allHistory.filter(item => 
      item.group_id === selectedLog.group_id && 
      item.type === selectedLog.type &&
      Math.abs(new Date(item.created_at) - new Date(selectedLog.created_at)) < 60000 
    );

    const printWindow = window.open('', '_blank');
    const dateStr = new Date(selectedLog.created_at).toLocaleDateString('th-TH');
    const timeStr = new Date(selectedLog.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const typeLabel = selectedLog.type === 'withdraw' ? 'เบิกของ' : 'คืนของ';

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt - รอบ ${timeStr}</title>
          <style>
            body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #333; }
            .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
            .title { font-size: 22px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f9f9f9; font-weight: bold; }
            .info { margin-bottom: 20px; line-height: 1.8; }
            .footer { margin-top: 60px; display: flex; justify-content: space-between; }
            .sig { border-top: 1px solid #000; width: 220px; text-align: center; margin-top: 50px; padding-top: 8px; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">ใบเสร็จบันทึกรายการ${typeLabel} (รายรอบ)</div>
            <div style="font-size: 11px; color: #666;">รหัสรอบ: ${selectedLog.group_id}</div>
          </div>
          <div class="info">
            <div><strong>ผู้ทำรายการ:</strong> ${selectedLog.borrower_name}</div>
            <div><strong>วันที่/เวลา:</strong> ${dateStr} | ${timeStr} น.</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>รายการอุปกรณ์ (รอบนี้เท่านั้น)</th>
                <th style="width: 100px; text-align: center;">จำนวน</th>
              </tr>
            </thead>
            <tbody>
              ${groupItems.map(item => `
                <tr>
                  <td>${item.product_name}</td>
                  <td style="text-align: center;">${item.amount}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            <div class="sig">ลงชื่อผู้ทำรายการ</div>
            <div class="sig">ลงชื่อเจ้าหน้าที่ (Admin)</div>
          </div>
          <script>window.print(); setTimeout(() => window.close(), 500);</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

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
      // สร้างรายชื่อหมวดหมู่จากข้อมูลสินค้า
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

  // กรองตามคำค้นหาและหมวดหมู่ที่เลือก
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
              {/* จุดแก้ไข 1: โลโก้ (เอาสีพื้นหลังออกและกู้คืนรูป) */}
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center relative overflow-hidden border border-slate-50">
                <img src="/logo.png" alt="M" className="w-full h-full object-contain z-10" onError={(e) => e.target.style.display='none'}/>
                <span className="absolute font-black text-blue-600 text-2xl">M</span>
              </div>
              <div>
                <h1 className="text-xl font-black uppercase leading-none mb-1">MakerStock</h1>
                <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest leading-tight">{isAdmin ? 'ADMIN PANEL' : 'USER DASHBOARD'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* จุดแก้ไข 2: แสดงชื่อที่ล็อคอินเข้ามา */}
              <div className="hidden sm:block text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Logged in as</p>
                <p className="text-xs font-bold text-slate-800">{user?.email}</p>
              </div>
              <div className="flex gap-2">
                {isAdmin && <button onClick={() => setShowAdminHistory(true)} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-[10px] font-black">ALL HISTORY</button>}
                {!isAdmin && <button onClick={() => setShowHistory(true)} className="bg-blue-50 text-blue-600 px-4 py-2.5 rounded-xl text-[10px] font-black">MY HISTORY</button>}
                <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="bg-slate-100 text-slate-900 px-4 py-2.5 rounded-xl text-[10px] font-black">LOGOUT</button>
              </div>
            </div>
          </div>

          {/* ... (Modal ส่วนของ History คงเดิม) ... */}
          {showAdminHistory && isAdmin && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                <div className="p-8 border-b flex justify-between items-center bg-slate-900 text-white">
                  <h2 className="text-xl font-black uppercase tracking-tighter">Global Transaction Log</h2>
                  <button onClick={() => setShowAdminHistory(false)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-black text-white">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-2">
                  <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b mb-4">
                    <div className="col-span-3">User</div>
                    <div className="col-span-4">Item Name</div>
                    <div className="col-span-1 text-center">Qty</div>
                    <div className="col-span-2 text-center">Type</div>
                    <div className="col-span-2 text-right">Receipt</div>
                  </div>
                  {allHistory.map((log) => (
                    <div key={log.id} className="grid grid-cols-12 gap-4 px-4 py-4 rounded-xl border border-slate-50 hover:bg-slate-50 items-center text-xs">
                      <div className="col-span-3 font-bold text-slate-500 truncate">{log.borrower_name}</div>
                      <div className="col-span-4 font-black text-slate-800 uppercase truncate">{log.product_name}</div>
                      <div className="col-span-1 text-center font-black text-blue-600">x{log.amount}</div>
                      <div className="col-span-2 text-center">
                        <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase ${log.type === 'withdraw' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                          {log.type === 'withdraw' ? 'เบิกของ' : 'คืนของ'}
                        </span>
                      </div>
                      <div className="col-span-2 text-right">
                        <button onClick={() => handlePrintGroup(log)} className="bg-white border border-slate-200 p-2 rounded-lg hover:bg-slate-100 shadow-sm flex items-center justify-center ml-auto gap-2">
                          🖨️ <span className="text-[9px] font-bold">พิมพ์รอบนี้</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ... (Admin Requests คงเดิม) ... */}
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
                        <button onClick={() => handleDecideGroup(groupId, 'approved')} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-[10px] font-black shadow-lg">APPROVE</button>
                        <button onClick={() => handleDecideGroup(groupId, 'rejected')} className="bg-white text-red-500 border border-red-50 px-6 py-3 rounded-xl text-[10px] font-black">REJECT</button>
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

          <input type="text" placeholder="Search devices..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-5 bg-white border border-slate-200 rounded-3xl shadow-sm outline-none font-bold mb-6 focus:ring-4 focus:ring-blue-50 transition-all" />
          
          {/* จุดแก้ไข 3: เพิ่มแถบเลือกหมวดหมู่ (Category Tabs) */}
          <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase whitespace-nowrap transition-all ${
                  activeCategory === cat 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-white text-slate-400 border border-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm">
            <button onClick={() => {setMode("withdraw"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'withdraw' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => {setMode("return"); setCart({});}} className={`flex-1 py-4 rounded-xl font-black text-sm transition-all ${mode === 'return' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          <div className="grid grid-cols-1 gap-4 pb-20">
            {loading ? <div className="text-center py-20 font-black text-blue-600 uppercase tracking-widest animate-pulse">Loading Inventory...</div> : filteredProducts.map((item) => (
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

      <div className="w-full lg:w-96 bg-white border-l p-8 flex flex-col shadow-2xl sticky lg:top-0 h-fit lg:h-screen">
        <h2 className="text-2xl font-black text-slate-800 mb-8 uppercase italic flex items-center gap-3">🛒 Cart <span className="text-blue-600">/</span> {mode === 'withdraw' ? 'เบิกของ' : 'คืนของ'}</h2>
        <div className="flex-1 overflow-y-auto space-y-4">
          {Object.entries(cart).map(([id, qty]) => (
            <div key={id} className="flex justify-between items-center bg-slate-50 p-5 rounded-[1.8rem] border border-slate-100 transition-all">
              <div className="min-w-0 pr-4">
                <p className="font-black text-slate-800 truncate text-sm uppercase italic">{products.find(p => p.id == id)?.name}</p>
                <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest">{products.find(p => p.id == id)?.category}</p>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 font-black text-blue-600">x{qty}</div>
            </div>
          ))}
          {Object.keys(cart).length === 0 && <p className="text-center text-slate-300 font-bold py-10 italic text-sm uppercase">Cart is Empty</p>}
        </div>
        <button onClick={handleConfirmAction} disabled={Object.keys(cart).length === 0} className={`w-full py-5 rounded-[2rem] font-black text-white text-lg mt-8 shadow-2xl active:scale-95 transition-all ${Object.keys(cart).length === 0 ? 'bg-slate-100 text-slate-200' : mode === 'withdraw' ? 'bg-slate-900' : 'bg-blue-600'}`}>CONFIRM</button>
      </div>
    </main>
  );
}