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

  // --- ส่วนแก้ไข: กลับมาใช้โครงสร้าง checkUser เดิมเพื่อให้เข้าเว็บได้ ---
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

    // เพิ่มตัวดักจับ Session กันหลุด (Refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handlePrintGroup = (selectedLog) => {
    const groupItems = allHistory.filter(item => 
      item.group_id === selectedLog.group_id && 
      item.type === selectedLog.type &&
      Math.abs(new Date(item.created_at) - new Date(selectedLog.created_at)) < 60000
    );

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head><title>Print Receipt</title></head>
        <body style="font-family: sans-serif; padding: 20px;">
          <h2>ใบเสร็จการ${selectedLog.type === 'withdraw' ? 'เบิก' : 'คืน'}</h2>
          <p>ผู้ทำรายการ: ${selectedLog.borrower_name}</p>
          <hr/>
          <ul>
            ${groupItems.map(item => `<li>${item.product_name} x ${item.amount}</li>`).join('')}
          </ul>
          <script>window.print();</script>
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
    await supabase.from('products').update({ stock: parseInt(newStock) }).eq('id', id);
    fetchProducts();
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
          amount: req.amount, borrower_name: req.borrower_name, type: req.type, group_id: groupId 
        }]);
      }
      await supabase.from('borrow_requests').update({ status: decision }).eq('id', req.id);
    }
    fetchData(user.email, isAdmin);
  };

  const updateCart = (itemId, amount) => {
    const item = products.find(p => p.id == itemId);
    const newQty = (cart[itemId] || 0) + amount;
    if (mode === "withdraw" && newQty > item.stock) return alert("Not enough stock");
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
    alert("ส่งคำขอแล้ว!");
  };

  const filteredProducts = products.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row">
      <div className="flex-1 p-4 lg:p-10">
        <div className="max-w-3xl mx-auto">
          
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              {/* โลโก้ */}
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl relative overflow-hidden">
                <img src="/logo.png" alt="M" className="w-full h-full object-contain z-10" onError={(e) => e.target.style.display='none'}/>
                <span className="absolute">M</span>
              </div>
              <h1 className="text-xl font-black uppercase">MakerStock</h1>
            </div>
            <div className="flex gap-2">
              {isAdmin && <button onClick={() => setShowAdminHistory(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black">ADMIN HIST</button>}
              <button onClick={() => setShowHistory(true)} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-[10px] font-black">MY HIST</button>
              <button onClick={() => supabase.auth.signOut()} className="bg-slate-100 px-4 py-2 rounded-xl text-[10px] font-black">LOGOUT</button>
            </div>
          </div>

          {/* แสดงสถานะ Pending และ ของที่ถืออยู่ ทันที */}
          {!isAdmin && (
            <div className="space-y-4 mb-8">
               {myPendingRequests.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl">
                  <p className="text-[10px] font-black text-amber-600 uppercase mb-2">🕒 รออนุมัติ</p>
                  <div className="flex flex-wrap gap-2">
                    {myPendingRequests.map(req => <span key={req.id} className="bg-white px-2 py-1 rounded border text-[10px] font-bold">{req.product_name} x{req.amount}</span>)}
                  </div>
                </div>
              )}
              {myItems.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                  <p className="text-[10px] font-black text-blue-600 uppercase mb-2">📦 ของที่ถืออยู่</p>
                  <div className="grid grid-cols-2 gap-2">
                    {myItems.map(item => <div key={item.name} className="bg-white p-2 rounded border flex justify-between text-[10px] font-bold"><span>{item.name}</span><span>x{item.qty}</span></div>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ... (Search, Categories, Mode และ ItemCard เหมือนเดิมของคุณทั้งหมด) ... */}
          <div className="flex bg-white p-1.5 rounded-2xl border mb-8">
            <button onClick={() => setMode("withdraw")} className={`flex-1 py-4 rounded-xl font-black ${mode === 'withdraw' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>เบิกของ</button>
            <button onClick={() => setMode("return")} className={`flex-1 py-4 rounded-xl font-black ${mode === 'return' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>คืนของ</button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredProducts.map(item => (
              <ItemCard key={item.id} item={item} quantityInCart={cart[item.id] || 0} onUpdate={updateCart} mode={mode} />
            ))}
          </div>

        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white border-l p-8 flex flex-col shadow-2xl">
        <h2 className="text-2xl font-black mb-8 uppercase italic">🛒 Cart</h2>
        <div className="flex-1 overflow-y-auto">
          {Object.entries(cart).map(([id, qty]) => (
            <div key={id} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl mb-2">
              <span className="font-black text-sm uppercase italic">{products.find(p => p.id == id)?.name}</span>
              <span className="font-black text-blue-600">x{qty}</span>
            </div>
          ))}
        </div>
        <button onClick={handleConfirmAction} className="w-full py-5 rounded-[2rem] font-black text-white bg-slate-900 mt-8">CONFIRM</button>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] p-8 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase text-blue-600">My History</h2>
              <button onClick={() => setShowHistory(false)} className="font-black">✕</button>
            </div>
            <div className="overflow-y-auto space-y-2">
              {history.map(log => (
                <div key={log.id} className="p-4 bg-slate-50 rounded-xl flex justify-between items-center">
                  <div><p className="text-xs font-black uppercase">{log.product_name}</p><p className="text-[9px] text-slate-400">{new Date(log.created_at).toLocaleString()}</p></div>
                  <span className="text-xs font-black uppercase text-blue-600">{log.type} x{log.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}